import io
import logging
import os
import traceback
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

import aioboto3
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import StreamingResponse
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal, get_db
from middleware.auth_middleware import decrypt
from models import CreditReason, CreditTransaction, Record, RecordCondition, Scan, ScanStatus, SearchStrategyOutcome, User
from routers.auth import apply_monthly_topup, get_current_user
from routers.admin import require_admin
from schemas import ConfirmRequest, DiscogsMatch, MobileUploadAck, ResearchRequest, ResearchResponse, ScanOut, ScanUploadResponse, VisualMatchRequest, VisualMatchResponse
from services import claude_vision, discogs as discogs_svc
from services.sse import sse_manager

router = APIRouter(prefix="/scan", tags=["scan"])

MAX_SIZE = 1500

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", "vinylscan-images")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL", "")
# Fallback to local storage when R2 is not configured (local dev without R2 credentials)
_USE_LOCAL_STORAGE = not all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL])
IMAGES_DIR = os.getenv("IMAGES_DIR", "/tmp/vinylscan_images")


def compress_image(data: bytes, content_type: str) -> tuple[bytes, str]:
    img = Image.open(io.BytesIO(data))

    # Honour EXIF rotation (phone cameras embed orientation, don't apply it)
    img = ImageOps.exif_transpose(img)

    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    w, h = img.size
    if max(w, h) > MAX_SIZE:
        ratio = MAX_SIZE / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    # Mild unsharp mask — recovers soft text from phone cameras without distorting color
    # radius=1 keeps it subtle; won't harm images that are already sharp
    img = img.filter(ImageFilter.UnsharpMask(radius=1, percent=60, threshold=3))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue(), "image/jpeg"


def _safe_int(value) -> int | None:
    """Claude sometimes returns year as a string ("2001") instead of int — asyncpg
    rejects that for an Integer column and crashes the save. Coerce or drop it."""
    if value is None or isinstance(value, int):
        return value
    try:
        return int(str(value).strip())
    except (ValueError, TypeError):
        return None


async def _deduct_credit(user: User, scan: Scan, reason: CreditReason, db: AsyncSession):
    if scan.credit_deducted:
        return
    user.credits = max(0, user.credits - 1)
    scan.credit_deducted = True
    txn = CreditTransaction(user_id=user.id, amount=-1, reason=reason)
    db.add(txn)
    await db.commit()
    await db.refresh(user)
    await db.refresh(scan)


def _set_credit_header(response: Response, user: User):
    response.headers["X-Credit-Balance"] = str(user.credits)


async def _store_image(data: bytes, filename: str) -> str:
    """Upload to R2 if configured, else write to local disk. Returns the public URL."""
    if _USE_LOCAL_STORAGE:
        os.makedirs(IMAGES_DIR, exist_ok=True)
        path = os.path.join(IMAGES_DIR, filename)
        with open(path, "wb") as f:
            f.write(data)
        return f"/images/{filename}"

    session = aioboto3.Session()
    async with session.client(
        "s3",
        endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
    ) as s3:
        await s3.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=filename,
            Body=data,
            ContentType="image/jpeg",
        )
    return f"{R2_PUBLIC_URL}/{filename}"


def _merge_claude_results(primary: dict, secondary: dict) -> dict:
    """
    Merge two Claude results from different photos of the same record.
    Primary = higher-confidence result. Fill missing fields from secondary.
    Tracklist is unioned. low_information only true if BOTH are low-info.
    """
    merged = dict(primary)
    for field in ("artist", "title", "year", "label", "catalog_number",
                  "matrix_code", "country", "genre", "barcode", "format",
                  "artist_alt", "title_alt"):
        if not merged.get(field) and secondary.get(field):
            merged[field] = secondary[field]

    # Union tracklists by position
    tl1 = primary.get("tracklist") or []
    tl2 = secondary.get("tracklist") or []
    if tl1 or tl2:
        seen_pos: set[str] = set()
        combined = []
        for track in tl1 + tl2:
            pos = track.get("position", "")
            if pos not in seen_pos:
                seen_pos.add(pos)
                combined.append(track)
        merged["tracklist"] = sorted(combined, key=lambda t: t.get("position", ""))

    # Confidence: average of both
    c1 = int(primary.get("confidence") or 0)
    c2 = int(secondary.get("confidence") or 0)
    merged["confidence"] = (c1 + c2) // 2 if c1 and c2 else max(c1, c2)

    # low_information: only if BOTH are low-info
    merged["low_information"] = bool(primary.get("low_information")) and bool(secondary.get("low_information"))

    return merged


@router.get("/stream")
async def scan_stream(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """
    SSE endpoint for mobile→desktop real-time sync.
    Token passed as query param (EventSource can't send headers).
    """
    from middleware.auth_middleware import decode_access_token
    from sqlalchemy import select as sa_select

    user_id_str = decode_access_token(token)
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(sa_select(User).where(User.id == uuid.UUID(user_id_str)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    import asyncio
    q = sse_manager.subscribe(user_id_str)

    async def generate():
        try:
            yield "data: {\"type\":\"connected\"}\n\n"
            for data in sse_manager.recent(user_id_str):
                yield f"data: {data}\n\n"
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=20.0)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            sse_manager.unsubscribe(user_id_str, q)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/upload", response_model=ScanUploadResponse)
async def upload_scan(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    file2: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # monthly topup check
    await apply_monthly_topup(user, db)
    await db.refresh(user)

    if user.credits <= 0:
        _set_credit_header(response, user)
        raise HTTPException(status_code=403, detail={"error": "no_credits", "balance": 0})

    image_data = await file.read()
    if len(image_data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large. Max 10MB.")

    content_type = file.content_type or "image/jpeg"

    # compress
    try:
        image_data, content_type = compress_image(image_data, content_type)
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="File is not a valid image.")
    except Exception:
        pass  # use original if compression fails for other reasons

    # save image (R2 in production, local fallback in dev)
    img_filename = f"{uuid.uuid4()}.jpg"
    try:
        image_url = await _store_image(image_data, img_filename)
    except Exception:
        raise HTTPException(status_code=500, detail="Image storage failed. Please try again.")

    # create pending scan
    scan = Scan(user_id=user.id, image_url=image_url, status=ScanStatus.pending)
    db.add(scan)
    await db.commit()
    await db.refresh(scan)

    # Claude Vision — primary image
    try:
        claude_result = await claude_vision.identify_record(image_data, content_type)
    except Exception as claude_err:
        logger.error("Claude vision failed: %s\n%s", claude_err, traceback.format_exc())
        scan.status = ScanStatus.skipped
        await db.commit()
        _set_credit_header(response, user)
        return ScanUploadResponse(
            scan_id=scan.id,
            status=scan.status,
            artist=None, title=None, year=None, label=None, catalog_number=None,
            confidence=0, auto_added=False, discogs_release_id=None, matches=[],
            error="identification_failed",
        )

    # Claude Vision — optional second image (cover + label combo)
    if file2 is not None:
        try:
            img2_data = await file2.read()
            if img2_data and len(img2_data) <= 10 * 1024 * 1024:
                img2_data, _ = compress_image(img2_data, file2.content_type or "image/jpeg")
                claude_result2 = await claude_vision.identify_record(img2_data, "image/jpeg")
                # Merge: use higher-confidence as primary
                if (claude_result2.get("confidence") or 0) > (claude_result.get("confidence") or 0):
                    claude_result = _merge_claude_results(claude_result2, claude_result)
                else:
                    claude_result = _merge_claude_results(claude_result, claude_result2)
        except Exception:
            pass  # second image failure is non-fatal

    scan.claude_raw_response = claude_result
    scan.artist = claude_result.get("artist")
    scan.title = claude_result.get("title")
    scan.year = _safe_int(claude_result.get("year"))
    scan.label = claude_result.get("label")
    scan.catalog_number = claude_result.get("catalog_number")
    scan.format = claude_result.get("format")
    scan.confidence = claude_result.get("confidence")
    await db.commit()

    # search Discogs — pass all extracted fields
    access_token = decrypt(user.discogs_oauth_token)
    access_token_secret = decrypt(user.discogs_oauth_token_secret)

    try:
        raw_results, internal_confidence = await discogs_svc.search_releases(
            scan.artist or "",
            scan.title or "",
            access_token,
            access_token_secret,
            label=scan.label,
            catalog_number=scan.catalog_number,
            artist_alt=claude_result.get("artist_alt"),
            title_alt=claude_result.get("title_alt"),
            scan_format=scan.format,
            year=_safe_int(claude_result.get("year")),
            tracklist=claude_result.get("tracklist") or [],
            matrix_code=claude_result.get("matrix_code"),
            country=claude_result.get("country"),
            barcode=claude_result.get("barcode"),
        )
    except Exception as e:
        logger.warning("Discogs search failed for scan %s: %s", scan.id, e, exc_info=True)
        raw_results, internal_confidence = [], 0

    matches_data = discogs_svc.parse_search_results(raw_results)
    matches = [DiscogsMatch(**m) for m in matches_data]

    confidence = scan.confidence or 0
    auto_added = False

    scan.matches = matches_data
    scan.internal_confidence = internal_confidence
    await db.commit()
    await db.refresh(scan)
    await db.refresh(user)
    _set_credit_header(response, user)

    scan_response = ScanUploadResponse(
        scan_id=scan.id,
        status=scan.status,
        artist=scan.artist,
        title=scan.title,
        year=scan.year,
        label=scan.label,
        catalog_number=scan.catalog_number,
        confidence=confidence,
        internal_confidence=internal_confidence,
        auto_added=auto_added,
        discogs_release_id=scan.discogs_release_id,
        matches=matches,
        artist_alt=claude_result.get("artist_alt"),
        title_alt=claude_result.get("title_alt"),
        low_information=bool(claude_result.get("low_information", False)),
        barcode=claude_result.get("barcode"),
    )

    # Push to desktop SSE listeners for this user (mobile→desktop real-time)
    listeners = sse_manager.listener_count(str(user.id))
    print(f"[SSE] user={user.id} listeners={listeners} image={scan.image_url}", flush=True)
    if listeners > 0:
        base = str(request.base_url).rstrip("/")
        abs_image_url = f"{base}{scan.image_url}" if scan.image_url and scan.image_url.startswith("/") else scan.image_url
        print(f"[SSE] broadcasting scan_result abs_image_url={abs_image_url}", flush=True)
        await sse_manager.broadcast(str(user.id), {
            **scan_response.model_dump(mode="json"),
            "type": "scan_result",
            "image_url": abs_image_url,
        })

    return scan_response


@router.post("/{scan_id}/enhance", response_model=ScanUploadResponse)
async def enhance_scan(
    scan_id: uuid.UUID,
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Add a second (or third/fourth) photo to an existing scan without spending a credit.
    Runs Claude on the new image, merges with existing Claude result, re-runs Discogs search.
    """
    result = await db.execute(
        select(Scan).where(Scan.id == scan_id, Scan.user_id == user.id)
    )
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    image_data = await file.read()
    if len(image_data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large. Max 10MB.")
    try:
        image_data, _ = compress_image(image_data, file.content_type or "image/jpeg")
    except Exception:
        pass

    try:
        new_claude = await claude_vision.identify_record(image_data, "image/jpeg")
    except Exception as e:
        logger.error("Claude vision failed in enhance: %s", e)
        raise HTTPException(status_code=500, detail="Image identification failed.")

    existing = scan.claude_raw_response or {}
    if (new_claude.get("confidence") or 0) > (existing.get("confidence") or 0):
        merged = _merge_claude_results(new_claude, existing)
    else:
        merged = _merge_claude_results(existing, new_claude)

    scan.claude_raw_response = merged
    scan.artist = merged.get("artist") or scan.artist
    scan.title = merged.get("title") or scan.title
    scan.year = _safe_int(merged.get("year")) or scan.year
    scan.label = merged.get("label") or scan.label
    scan.catalog_number = merged.get("catalog_number") or scan.catalog_number
    scan.format = merged.get("format") or scan.format
    scan.confidence = merged.get("confidence")
    await db.commit()

    access_token = decrypt(user.discogs_oauth_token)
    access_token_secret = decrypt(user.discogs_oauth_token_secret)
    try:
        raw_results, internal_confidence = await discogs_svc.search_releases(
            scan.artist or "",
            scan.title or "",
            access_token,
            access_token_secret,
            label=scan.label,
            catalog_number=scan.catalog_number,
            artist_alt=merged.get("artist_alt"),
            title_alt=merged.get("title_alt"),
            scan_format=scan.format,
            year=_safe_int(merged.get("year")),
            tracklist=merged.get("tracklist") or [],
            matrix_code=merged.get("matrix_code"),
            country=merged.get("country"),
            barcode=merged.get("barcode"),
        )
    except Exception as e:
        logger.warning("Discogs search failed for scan %s: %s", scan.id, e, exc_info=True)
        raw_results, internal_confidence = [], 0

    matches_data = discogs_svc.parse_search_results(raw_results)
    matches = [DiscogsMatch(**m) for m in matches_data]

    scan.matches = matches_data
    scan.internal_confidence = internal_confidence
    await db.commit()
    await db.refresh(user)
    _set_credit_header(response, user)
    enhance_response = ScanUploadResponse(
        scan_id=scan.id,
        status=scan.status,
        artist=scan.artist,
        title=scan.title,
        year=scan.year,
        label=scan.label,
        catalog_number=scan.catalog_number,
        confidence=scan.confidence or 0,
        internal_confidence=internal_confidence,
        auto_added=False,
        discogs_release_id=scan.discogs_release_id,
        matches=matches,
        artist_alt=merged.get("artist_alt"),
        title_alt=merged.get("title_alt"),
        low_information=bool(merged.get("low_information", False)),
        barcode=merged.get("barcode"),
    )

    if sse_manager.listener_count(str(user.id)) > 0:
        base = str(request.base_url).rstrip("/")
        abs_image_url = f"{base}{scan.image_url}" if scan.image_url and scan.image_url.startswith("/") else scan.image_url
        await sse_manager.broadcast(str(user.id), {
            "type": "scan_enhanced",
            "image_url": abs_image_url,
            **enhance_response.model_dump(mode="json"),
        })

    return enhance_response


def _abs_image_url(base_url: str, image_url: str | None) -> str | None:
    if image_url and image_url.startswith("/"):
        return f"{base_url}{image_url}"
    return image_url


def _scan_to_upload_response(scan: Scan) -> ScanUploadResponse:
    """Rebuild the same shape the upload/SSE pipeline returns, from a persisted Scan row —
    lets a reload pick pending scans back up without re-hitting Claude or Discogs."""
    raw = scan.claude_raw_response or {}
    matches = [DiscogsMatch(**m) for m in (scan.matches or [])]
    return ScanUploadResponse(
        scan_id=scan.id, status=scan.status, artist=scan.artist, title=scan.title,
        year=scan.year, label=scan.label, catalog_number=scan.catalog_number,
        confidence=scan.confidence or 0, internal_confidence=scan.internal_confidence or 0,
        auto_added=False, discogs_release_id=scan.discogs_release_id, matches=matches,
        artist_alt=raw.get("artist_alt"), title_alt=raw.get("title_alt"),
        low_information=bool(raw.get("low_information", False)), barcode=raw.get("barcode"),
    )


async def _process_scan_async(
    scan_id: uuid.UUID,
    user_id: uuid.UUID,
    image_data: bytes,
    content_type: str,
    image2_data: bytes | None,
    base_url: str,
) -> None:
    """
    Background twin of upload_scan's analysis step, used by the mobile fast-ack endpoint.
    Runs Claude Vision + Discogs after the HTTP response already went back to the phone,
    then broadcasts the result over SSE — same payload shape the desktop already handles.
    """
    scan = None
    async with AsyncSessionLocal() as db:
        try:
            scan_result = await db.execute(select(Scan).where(Scan.id == scan_id))
            scan = scan_result.scalar_one_or_none()
            if not scan:
                return
            user_result = await db.execute(select(User).where(User.id == user_id))
            user = user_result.scalar_one_or_none()
            if not user:
                return

            try:
                claude_result = await claude_vision.identify_record(image_data, content_type)
            except Exception as claude_err:
                logger.error("Claude vision failed (mobile async): %s\n%s", claude_err, traceback.format_exc())
                scan.status = ScanStatus.skipped
                await db.commit()
                await sse_manager.broadcast(str(user_id), {
                    "type": "scan_error", "scan_id": str(scan_id), "error": "identification_failed",
                    "image_url": _abs_image_url(base_url, scan.image_url),
                })
                return

            if image2_data is not None:
                try:
                    img2_data, _ = compress_image(image2_data, "image/jpeg")
                    claude_result2 = await claude_vision.identify_record(img2_data, "image/jpeg")
                    if (claude_result2.get("confidence") or 0) > (claude_result.get("confidence") or 0):
                        claude_result = _merge_claude_results(claude_result2, claude_result)
                    else:
                        claude_result = _merge_claude_results(claude_result, claude_result2)
                except Exception:
                    pass

            scan.claude_raw_response = claude_result
            scan.artist = claude_result.get("artist")
            scan.title = claude_result.get("title")
            scan.year = _safe_int(claude_result.get("year"))
            scan.label = claude_result.get("label")
            scan.catalog_number = claude_result.get("catalog_number")
            scan.format = claude_result.get("format")
            scan.confidence = claude_result.get("confidence")
            await db.commit()

            access_token = decrypt(user.discogs_oauth_token)
            access_token_secret = decrypt(user.discogs_oauth_token_secret)
            try:
                raw_results, internal_confidence = await discogs_svc.search_releases(
                    scan.artist or "", scan.title or "", access_token, access_token_secret,
                    label=scan.label, catalog_number=scan.catalog_number,
                    artist_alt=claude_result.get("artist_alt"), title_alt=claude_result.get("title_alt"),
                    scan_format=scan.format, year=_safe_int(claude_result.get("year")),
                    tracklist=claude_result.get("tracklist") or [],
                    matrix_code=claude_result.get("matrix_code"), country=claude_result.get("country"),
                    barcode=claude_result.get("barcode"),
                )
            except Exception as e:
                logger.warning("Discogs search failed for scan %s: %s", scan_id, e, exc_info=True)
                raw_results, internal_confidence = [], 0

            matches_data = discogs_svc.parse_search_results(raw_results)
            matches = [DiscogsMatch(**m) for m in matches_data]
            scan.matches = matches_data
            scan.internal_confidence = internal_confidence
            await db.commit()
            await db.refresh(scan)

            scan_response = ScanUploadResponse(
                scan_id=scan.id, status=scan.status, artist=scan.artist, title=scan.title,
                year=scan.year, label=scan.label, catalog_number=scan.catalog_number,
                confidence=scan.confidence or 0, internal_confidence=internal_confidence,
                auto_added=False, discogs_release_id=scan.discogs_release_id, matches=matches,
                artist_alt=claude_result.get("artist_alt"), title_alt=claude_result.get("title_alt"),
                low_information=bool(claude_result.get("low_information", False)),
                barcode=claude_result.get("barcode"),
            )
            await sse_manager.broadcast(str(user_id), {
                **scan_response.model_dump(mode="json"),
                "type": "scan_result",
                "image_url": _abs_image_url(base_url, scan.image_url),
            })
        except Exception as e:
            logger.error("Background scan processing failed for %s: %s\n%s", scan_id, e, traceback.format_exc())
            image_url = _abs_image_url(base_url, scan.image_url) if scan else None
            await sse_manager.broadcast(str(user_id), {
                "type": "scan_error", "scan_id": str(scan_id), "error": str(e), "image_url": image_url,
            })


async def _process_enhance_async(
    scan_id: uuid.UUID,
    user_id: uuid.UUID,
    image_data: bytes,
    base_url: str,
) -> None:
    """Background twin of enhance_scan, used by the mobile fast-ack endpoint."""
    scan = None
    async with AsyncSessionLocal() as db:
        try:
            scan_result = await db.execute(select(Scan).where(Scan.id == scan_id))
            scan = scan_result.scalar_one_or_none()
            if not scan:
                return
            user_result = await db.execute(select(User).where(User.id == user_id))
            user = user_result.scalar_one_or_none()
            if not user:
                return

            try:
                new_claude = await claude_vision.identify_record(image_data, "image/jpeg")
            except Exception as e:
                logger.error("Claude vision failed in enhance (mobile async): %s", e)
                await sse_manager.broadcast(str(user_id), {
                    "type": "scan_error", "scan_id": str(scan_id), "error": "identification_failed",
                    "image_url": _abs_image_url(base_url, scan.image_url),
                })
                return

            existing = scan.claude_raw_response or {}
            if (new_claude.get("confidence") or 0) > (existing.get("confidence") or 0):
                merged = _merge_claude_results(new_claude, existing)
            else:
                merged = _merge_claude_results(existing, new_claude)

            scan.claude_raw_response = merged
            scan.artist = merged.get("artist") or scan.artist
            scan.title = merged.get("title") or scan.title
            scan.year = _safe_int(merged.get("year")) or scan.year
            scan.label = merged.get("label") or scan.label
            scan.catalog_number = merged.get("catalog_number") or scan.catalog_number
            scan.format = merged.get("format") or scan.format
            scan.confidence = merged.get("confidence")
            await db.commit()

            access_token = decrypt(user.discogs_oauth_token)
            access_token_secret = decrypt(user.discogs_oauth_token_secret)
            try:
                raw_results, internal_confidence = await discogs_svc.search_releases(
                    scan.artist or "", scan.title or "", access_token, access_token_secret,
                    label=scan.label, catalog_number=scan.catalog_number,
                    artist_alt=merged.get("artist_alt"), title_alt=merged.get("title_alt"),
                    scan_format=scan.format, year=_safe_int(merged.get("year")),
                    tracklist=merged.get("tracklist") or [],
                    matrix_code=merged.get("matrix_code"), country=merged.get("country"),
                    barcode=merged.get("barcode"),
                )
            except Exception as e:
                logger.warning("Discogs search failed for scan %s: %s", scan_id, e, exc_info=True)
                raw_results, internal_confidence = [], 0

            matches_data = discogs_svc.parse_search_results(raw_results)
            matches = [DiscogsMatch(**m) for m in matches_data]
            scan.matches = matches_data
            scan.internal_confidence = internal_confidence
            await db.commit()

            enhance_response = ScanUploadResponse(
                scan_id=scan.id, status=scan.status, artist=scan.artist, title=scan.title,
                year=scan.year, label=scan.label, catalog_number=scan.catalog_number,
                confidence=scan.confidence or 0, internal_confidence=internal_confidence,
                auto_added=False, discogs_release_id=scan.discogs_release_id, matches=matches,
                artist_alt=merged.get("artist_alt"), title_alt=merged.get("title_alt"),
                low_information=bool(merged.get("low_information", False)),
                barcode=merged.get("barcode"),
            )
            await sse_manager.broadcast(str(user_id), {
                "type": "scan_enhanced",
                "image_url": _abs_image_url(base_url, scan.image_url),
                **enhance_response.model_dump(mode="json"),
            })
        except Exception as e:
            logger.error("Background enhance processing failed for %s: %s\n%s", scan_id, e, traceback.format_exc())
            image_url = _abs_image_url(base_url, scan.image_url) if scan else None
            await sse_manager.broadcast(str(user_id), {
                "type": "scan_error", "scan_id": str(scan_id), "error": str(e), "image_url": image_url,
            })


@router.post("/upload-mobile", response_model=MobileUploadAck)
async def upload_scan_mobile(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    file2: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Fast-ack upload for the native mobile app: save the image and return immediately
    (scan_id only) — Claude Vision + Discogs run in the background and broadcast to
    desktop via SSE when done. Lets the phone fire shots back-to-back without waiting
    on the ~5-15s analysis pipeline per shot.
    """
    import asyncio

    await apply_monthly_topup(user, db)
    await db.refresh(user)

    if user.credits <= 0:
        _set_credit_header(response, user)
        raise HTTPException(status_code=403, detail={"error": "no_credits", "balance": 0})

    image_data = await file.read()
    if len(image_data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large. Max 10MB.")

    content_type = file.content_type or "image/jpeg"
    try:
        image_data, content_type = compress_image(image_data, content_type)
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="File is not a valid image.")
    except Exception:
        pass

    image2_data: bytes | None = None
    if file2 is not None:
        raw2 = await file2.read()
        if raw2 and len(raw2) <= 10 * 1024 * 1024:
            image2_data = raw2

    img_filename = f"{uuid.uuid4()}.jpg"
    try:
        image_url = await _store_image(image_data, img_filename)
    except Exception:
        raise HTTPException(status_code=500, detail="Image storage failed. Please try again.")

    scan = Scan(user_id=user.id, image_url=image_url, status=ScanStatus.pending)
    db.add(scan)
    await db.commit()
    await db.refresh(scan)

    base_url = str(request.base_url).rstrip("/")
    asyncio.create_task(_process_scan_async(scan.id, user.id, image_data, content_type, image2_data, base_url))

    _set_credit_header(response, user)
    return MobileUploadAck(scan_id=scan.id, status="queued")


@router.post("/{scan_id}/enhance-mobile", response_model=MobileUploadAck)
async def enhance_scan_mobile(
    scan_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    file: UploadFile = File(...),
):
    """Fast-ack twin of /enhance for the mobile app — same background-processing pattern as /upload-mobile."""
    import asyncio

    result = await db.execute(select(Scan).where(Scan.id == scan_id, Scan.user_id == user.id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    image_data = await file.read()
    if len(image_data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large. Max 10MB.")
    try:
        image_data, _ = compress_image(image_data, file.content_type or "image/jpeg")
    except Exception:
        pass

    base_url = str(request.base_url).rstrip("/")
    asyncio.create_task(_process_enhance_async(scan.id, user.id, image_data, base_url))

    return MobileUploadAck(scan_id=scan.id, status="queued")


@router.post("/{scan_id}/research", response_model=ResearchResponse)
async def research_scan(
    scan_id: uuid.UUID,
    body: ResearchRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Re-run the Discogs search with user-edited artist/title/label/catalog_number.
    Lets the user correct AI misidentification (e.g. label read as title) and
    retrigger the search without spending another credit or re-uploading.
    """
    result = await db.execute(
        select(Scan).where(Scan.id == scan_id, Scan.user_id == user.id)
    )
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    artist = body.artist if body.artist is not None else scan.artist
    title = body.title if body.title is not None else scan.title
    label = body.label if body.label is not None else scan.label
    catalog_number = body.catalog_number if body.catalog_number is not None else scan.catalog_number
    year = body.year  # user-provided; don't fall back to scan.year (may be wrong for low-info records)

    access_token = decrypt(user.discogs_oauth_token)
    access_token_secret = decrypt(user.discogs_oauth_token_secret)

    # Preserve original tracklist from Claude for the research re-search
    raw_claude = scan.claude_raw_response or {}
    original_tracklist = raw_claude.get("tracklist") or []

    try:
        raw_results, internal_confidence = await discogs_svc.search_releases(
            artist or "",
            title or "",
            access_token,
            access_token_secret,
            label=label,
            catalog_number=catalog_number,
            year=year,
            tracklist=original_tracklist,
        )
    except Exception as e:
        logger.warning("Discogs research search failed for scan %s: %s", scan_id, e, exc_info=True)
        raw_results, internal_confidence = [], 0

    matches_data = discogs_svc.parse_search_results(raw_results)
    matches = [DiscogsMatch(**m) for m in matches_data]

    # Persist the correction + fresh results — without this, a reload reverts to
    # whatever the original (possibly rate-limited/empty) search found, and using
    # "Edit search" again re-spends Discogs calls for no reason.
    scan.artist = artist
    scan.title = title
    scan.label = label
    scan.catalog_number = catalog_number
    scan.matches = matches_data
    scan.internal_confidence = internal_confidence
    await db.commit()

    _set_credit_header(response, user)
    return ResearchResponse(
        artist=artist,
        title=title,
        label=label,
        catalog_number=catalog_number,
        matches=matches,
    )


@router.get("/pricing/{release_id}")
async def get_pricing(
    release_id: int,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return lowest marketplace price for a release. Cached 24h in-memory."""
    access_token = decrypt(user.discogs_oauth_token)
    access_token_secret = decrypt(user.discogs_oauth_token_secret)
    data = await discogs_svc.get_marketplace_stats(release_id, access_token, access_token_secret)
    _set_credit_header(response, user)
    return {"release_id": release_id, "pricing": data}


async def _create_catalog_record(
    db: AsyncSession,
    user_id: uuid.UUID,
    release_id: int,
    condition: str,
    lot_id: uuid.UUID | None,
    scan: "Scan | None" = None,
    artist: str | None = None,
    title: str | None = None,
    year: int | None = None,
    label: str | None = None,
    catalog_number: str | None = None,
    format: str | None = None,
    country: str | None = None,
    cover_image_url: str | None = None,
    disc_condition: str | None = None,
    cover_condition: str | None = None,
) -> Record:
    # Normalise condition to a valid enum value; fall back to VG+
    valid_conditions = {e.value for e in RecordCondition}
    if condition not in valid_conditions:
        condition = RecordCondition.VG_PLUS.value

    record = Record(
        user_id=user_id,
        lot_id=lot_id,
        scan_id=scan.id if scan else None,
        artist=artist or (scan.artist if scan else None),
        title=title or (scan.title if scan else None),
        year=year or (scan.year if scan else None),
        label=label or (scan.label if scan else None),
        catalog_number=catalog_number or (scan.catalog_number if scan else None),
        format=format or (scan.format if scan else None),
        country=country,
        condition=condition,
        disc_condition=disc_condition,
        cover_condition=cover_condition,
        discogs_release_id=release_id,
        cover_image_url=cover_image_url or None,
    )
    db.add(record)
    return record


async def _fetch_and_set_price(
    record_id: uuid.UUID,
    release_id: int,
    access_token: str,
    access_token_secret: str,
) -> None:
    from database import AsyncSessionLocal
    from models import User as _User
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(Record).where(Record.id == record_id))
            record = result.scalar_one_or_none()
            if not record:
                return

            # Fetch full release details (styles + market prices)
            details = await discogs_svc.get_release_details(release_id, access_token, access_token_secret)
            if details:
                if not record.styles and details.get("styles"):
                    record.styles = ", ".join(details["styles"][:5])
                if not record.genre and details.get("genres"):
                    record.genre = details["genres"][0]
                if details.get("lowest_price") is not None:
                    record.discogs_lowest_price = details["lowest_price"]
                if details.get("num_for_sale") is not None:
                    record.discogs_num_for_sale = details["num_for_sale"]

            # Fetch condition-specific price suggestion
            suggestions = await discogs_svc.get_price_suggestions(release_id, access_token, access_token_secret)
            if suggestions:
                cond = record.condition if isinstance(record.condition, str) else record.condition.value
                suggested = suggestions.get(cond)
                if suggested:
                    record.discogs_suggested_price = suggested

            # Set asking_price if not already set
            lowest = details.get("lowest_price") if details else None
            if lowest is not None and record.asking_price is None:
                user_result = await db.execute(select(_User).where(_User.id == record.user_id))
                user = user_result.scalar_one_or_none()
                markup = (user.price_markup_pct or 0) if user else 0
                record.asking_price = round(lowest * (1 + markup / 100), 2)

            await db.commit()
        except Exception as e:
            logger.warning("Price fetch failed for record %s release %s: %s", record_id, release_id, e)


async def _log_strategy_outcomes(
    scan_id: uuid.UUID,
    confirmed_release_id: int,
    scan: Scan,
    user: User,
) -> None:
    """Background task: re-run debug search after confirm and store per-strategy hit outcomes."""
    try:
        raw = scan.claude_raw_response or {}
        access_token = decrypt(user.discogs_oauth_token)
        access_token_secret = decrypt(user.discogs_oauth_token_secret)

        debug = await discogs_svc.search_releases_debug(
            artist=scan.artist or "",
            title=scan.title or "",
            access_token=access_token,
            access_token_secret=access_token_secret,
            label=scan.label or raw.get("label"),
            catalog_number=scan.catalog_number or raw.get("catalog_number"),
            artist_alt=raw.get("artist_alt"),
            title_alt=raw.get("title_alt"),
            scan_format=scan.format or raw.get("format"),
            year=scan.year or _safe_int(raw.get("year")),
            tracklist=raw.get("tracklist") or [],
            matrix_code=raw.get("matrix_code"),
            country=raw.get("country"),
            barcode=raw.get("barcode"),
        )

        first_finder: str | None = None
        outcomes: list[SearchStrategyOutcome] = []

        for s in debug.get("strategies", []):
            name = s["name"]
            err = s.get("error")
            top_ids = [r["id"] for r in s.get("top_results", [])]
            found = confirmed_release_id in top_ids
            rank = top_ids.index(confirmed_release_id) + 1 if found else None

            if found and first_finder is None:
                first_finder = name

            outcomes.append(SearchStrategyOutcome(
                scan_id=scan_id,
                confirmed_release_id=confirmed_release_id,
                strategy_name=name,
                hit=found,
                was_first=(found and first_finder == name),
                rank_in_strategy=rank,
                error=err,
            ))

        async with AsyncSessionLocal() as db:
            db.add_all(outcomes)
            await db.commit()

        logger.info("strategy_outcomes: logged %d rows for scan %s", len(outcomes), scan_id)
    except Exception as e:
        logger.warning("strategy_outcomes: logging failed for scan %s: %s", scan_id, e)


@router.post("/{scan_id}/confirm")
async def confirm_scan(
    scan_id: uuid.UUID,
    body: ConfirmRequest,
    response: Response,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Scan).where(Scan.id == scan_id, Scan.user_id == user.id)
    )
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status not in (ScanStatus.pending,):
        raise HTTPException(status_code=400, detail="Scan already finalized")

    access_token = decrypt(user.discogs_oauth_token)
    access_token_secret = decrypt(user.discogs_oauth_token_secret)

    try:
        await discogs_svc.add_to_collection(
            user.discogs_username, body.release_id, access_token, access_token_secret
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Discogs error: {e}")

    if body.match_index is not None:
        logger.info("scan %s: user selected match index %d", scan_id, body.match_index)

    scan.discogs_release_id = body.release_id
    scan.status = ScanStatus.manually_added

    # Log strategy outcomes for hit-rate learning (Option B)
    background_tasks.add_task(
        _log_strategy_outcomes,
        scan_id=scan.id,
        confirmed_release_id=body.release_id,
        scan=scan,
        user=user,
    )

    # Pull the confirmed release's own data — title/year/country/label/catno from
    # Claude's photo guess can be wrong or incomplete; the actual Discogs release
    # the user picked is authoritative. Falls back to the scan's data if this fails.
    details = None
    try:
        details = await discogs_svc.get_release_details(body.release_id, access_token, access_token_secret)
    except Exception as e:
        logger.warning("get_release_details failed for release %s: %s", body.release_id, e)

    record = await _create_catalog_record(
        db=db,
        user_id=user.id,
        release_id=body.release_id,
        condition=body.condition,
        lot_id=body.lot_id,
        scan=scan,
        title=details.get("title") if details else None,
        year=details.get("year") if details else None,
        country=details.get("country") if details else None,
        label=details.get("label") if details else None,
        catalog_number=details.get("catno") if details else None,
        format=details.get("format") if details else None,
        cover_image_url=body.cover_image,
        disc_condition=body.disc_condition,
        cover_condition=body.cover_condition,
    )
    await db.flush()

    await _deduct_credit(user, scan, CreditReason.scan_used, db)
    await db.commit()
    await db.refresh(user)

    background_tasks.add_task(
        _fetch_and_set_price,
        record.id,
        body.release_id,
        access_token,
        access_token_secret,
    )

    _set_credit_header(response, user)
    return {"ok": True, "credits_remaining": user.credits, "record_id": str(record.id)}


@router.post("/{scan_id}/skip")
async def skip_scan(
    scan_id: uuid.UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Scan).where(Scan.id == scan_id, Scan.user_id == user.id)
    )
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status not in (ScanStatus.pending,):
        raise HTTPException(status_code=400, detail="Scan already finalized")

    scan.status = ScanStatus.skipped
    await _deduct_credit(user, scan, CreditReason.scan_used, db)
    await db.commit()
    await db.refresh(user)
    _set_credit_header(response, user)
    return {"ok": True, "credits_remaining": user.credits}


@router.get("/barcode")
async def barcode_lookup(
    barcode: str = Query(..., min_length=1),
    response: Response = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    access_token = decrypt(user.discogs_oauth_token)
    access_token_secret = decrypt(user.discogs_oauth_token_secret)

    try:
        raw_results = await discogs_svc.search_by_barcode(barcode, access_token, access_token_secret)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Discogs error: {e}")

    matches = discogs_svc.parse_search_results(raw_results)
    _set_credit_header(response, user)
    return {"barcode": barcode, "matches": matches}


@router.post("/barcode/add")
async def barcode_add(
    body: ConfirmRequest,
    response: Response,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add a release found via barcode directly to collection — no credit deducted."""
    access_token = decrypt(user.discogs_oauth_token)
    access_token_secret = decrypt(user.discogs_oauth_token_secret)

    try:
        await discogs_svc.add_to_collection(
            user.discogs_username, body.release_id, access_token, access_token_secret
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Discogs error: {e}")

    record = await _create_catalog_record(
        db=db,
        user_id=user.id,
        release_id=body.release_id,
        condition=body.condition,
        lot_id=body.lot_id,
        cover_image_url=body.cover_image,
        disc_condition=body.disc_condition,
        cover_condition=body.cover_condition,
    )
    await db.commit()
    await db.refresh(record)

    background_tasks.add_task(
        _fetch_and_set_price,
        record.id,
        body.release_id,
        access_token,
        access_token_secret,
    )

    _set_credit_header(response, user)
    return {"ok": True, "record_id": str(record.id)}


async def _load_image_bytes(url: str) -> bytes | None:
    """Load image bytes from local disk path or remote URL."""
    import asyncio
    import requests as req

    if url.startswith("/images/"):
        filename = url.removeprefix("/images/")
        path = os.path.join(IMAGES_DIR, filename)
        try:
            with open(path, "rb") as f:
                return f.read()
        except OSError:
            return None

    def _fetch() -> bytes | None:
        try:
            resp = req.get(url, timeout=12, headers={"User-Agent": "VinylScan/1.0"})
            return resp.content if resp.ok else None
        except Exception:
            return None

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _fetch)


@router.post("/{scan_id}/visual-match", response_model=VisualMatchResponse)
async def visual_match(
    scan_id: uuid.UUID,
    body: VisualMatchRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Compare scan image against Discogs cover thumbnails using Claude Haiku.
    No credit deducted — free for low-info records.
    """
    result = await db.execute(
        select(Scan).where(Scan.id == scan_id, Scan.user_id == user.id)
    )
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    scan_image = await _load_image_bytes(scan.image_url)
    if not scan_image:
        raise HTTPException(status_code=400, detail="Scan image not available for visual matching")

    candidates = body.candidates[:7]

    import asyncio as _asyncio

    async def _fetch_cover(c) -> tuple[int, bytes | None]:
        data = await _load_image_bytes(c.cover_image_url)
        return (c.release_id, data)

    fetched = await _asyncio.gather(*[_fetch_cover(c) for c in candidates])
    cover_images: list[tuple[int, bytes]] = [
        (rid, data) for rid, data in fetched if data is not None
    ]

    if not cover_images:
        _set_credit_header(response, user)
        return VisualMatchResponse(
            best_match_index=None,
            best_match_release_id=None,
            confidence="none",
            reasoning="No cover images could be loaded",
        )

    # Compress covers to JPEG for consistent format
    compressed: list[tuple[int, bytes]] = []
    for rid, img_data in cover_images:
        try:
            jpeg_data, _ = compress_image(img_data, "image/jpeg")
            compressed.append((rid, jpeg_data))
        except Exception:
            compressed.append((rid, img_data))

    try:
        vm = await claude_vision.visual_match_releases(scan_image, compressed)
    except Exception as e:
        logger.error("Visual match failed for scan %s: %s", scan_id, e)
        raise HTTPException(status_code=500, detail="Visual match failed")

    _set_credit_header(response, user)
    return VisualMatchResponse(**vm)


@router.get("/pending")
async def list_pending_scans(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Every scan not yet confirmed/skipped, oldest first — so the desktop scan page can
    rebuild its queue on load instead of only relying on the live SSE stream (which
    only covers results broadcast while a tab happened to be open and connected).
    """
    result = await db.execute(
        select(Scan)
        .where(Scan.user_id == user.id, Scan.status == ScanStatus.pending)
        .order_by(Scan.created_at.asc())
    )
    scans = result.scalars().all()
    base = str(request.base_url).rstrip("/")
    return [
        {
            **_scan_to_upload_response(s).model_dump(mode="json"),
            "image_url": _abs_image_url(base, s.image_url),
            # claude_raw_response is only ever set once the background analysis
            # finishes — without this flag a still-processing scan (confidence/
            # matches genuinely empty because nothing's run yet) is indistinguishable
            # from one Claude truly couldn't read anything on.
            "processing": s.claude_raw_response is None,
        }
        for s in scans
    ]


@router.get("/history", response_model=list[ScanOut])
async def scan_history(
    response: Response,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    offset = (page - 1) * per_page
    result = await db.execute(
        select(Scan)
        .where(Scan.user_id == user.id)
        .order_by(Scan.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    scans = result.scalars().all()
    _set_credit_header(response, user)
    return scans


@router.get("/admin/debug-scans")
async def admin_debug_scans(
    page: int = Query(1, ge=1),
    per_page: int = Query(15, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin-only: list recent scans across all users with full Claude raw response."""
    offset = (page - 1) * per_page
    result = await db.execute(
        select(Scan)
        .order_by(Scan.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    scans = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "image_url": s.image_url,
            "artist": s.artist,
            "title": s.title,
            "year": s.year,
            "label": s.label,
            "catalog_number": s.catalog_number,
            "confidence": s.confidence,
            "status": s.status.value if s.status else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "claude_raw": s.claude_raw_response,
        }
        for s in scans
    ]


@router.post("/admin/debug-search/{scan_id}")
async def admin_debug_search(
    scan_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin-only: re-run search for a scan with per-strategy debug output."""
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Use admin's own Discogs tokens (required for OAuth search)
    access_token = decrypt(admin.discogs_oauth_token)
    access_token_secret = decrypt(admin.discogs_oauth_token_secret)

    raw_claude = scan.claude_raw_response or {}
    debug = await discogs_svc.search_releases_debug(
        scan.artist or "",
        scan.title or "",
        access_token,
        access_token_secret,
        label=scan.label,
        catalog_number=scan.catalog_number,
        artist_alt=raw_claude.get("artist_alt"),
        title_alt=raw_claude.get("title_alt"),
        scan_format=scan.format,
        year=scan.year,
        tracklist=raw_claude.get("tracklist") or [],
        matrix_code=raw_claude.get("matrix_code"),
        country=raw_claude.get("country"),
    )
    debug["claude_raw"] = raw_claude
    return debug


@router.get("/admin/strategy-stats")
async def admin_strategy_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Admin-only: aggregate strategy hit-rates from live confirm logging."""
    from sqlalchemy import func, case
    result = await db.execute(
        select(
            SearchStrategyOutcome.strategy_name,
            func.count().label("fired"),
            func.sum(case((SearchStrategyOutcome.hit == True, 1), else_=0)).label("hits"),
            func.sum(case((SearchStrategyOutcome.was_first == True, 1), else_=0)).label("first_hits"),
            func.avg(
                case((SearchStrategyOutcome.hit == True, SearchStrategyOutcome.rank_in_strategy), else_=None)
            ).label("avg_rank"),
            func.sum(case((SearchStrategyOutcome.error.isnot(None), 1), else_=0)).label("errors"),
        )
        .group_by(SearchStrategyOutcome.strategy_name)
        .order_by(func.sum(case((SearchStrategyOutcome.hit == True, 1), else_=0)).desc())
    )
    rows = result.all()
    return [
        {
            "strategy": r.strategy_name,
            "fired": r.fired,
            "hits": int(r.hits or 0),
            "hit_pct": round(int(r.hits or 0) / r.fired * 100, 1) if r.fired else 0,
            "first_hits": int(r.first_hits or 0),
            "avg_rank": round(float(r.avg_rank), 2) if r.avg_rank else None,
            "errors": int(r.errors or 0),
        }
        for r in rows
    ]

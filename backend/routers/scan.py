import io
import logging
import os
import traceback
import uuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

import aioboto3
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Response, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth_middleware import decrypt
from models import CreditReason, CreditTransaction, Record, RecordCondition, Scan, ScanStatus, User
from routers.auth import apply_monthly_topup, get_current_user
from schemas import ConfirmRequest, DiscogsMatch, ScanOut, ScanUploadResponse
from services import claude_vision, discogs as discogs_svc

router = APIRouter(prefix="/scan", tags=["scan"])

MAX_SIZE = 800

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
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    w, h = img.size
    if max(w, h) > MAX_SIZE:
        ratio = MAX_SIZE / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue(), "image/jpeg"


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


@router.post("/upload", response_model=ScanUploadResponse)
async def upload_scan(
    response: Response,
    file: UploadFile = File(...),
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
        # If storage fails, don't consume a credit
        raise HTTPException(status_code=500, detail="Image storage failed. Please try again.")

    # create pending scan
    scan = Scan(user_id=user.id, image_url=image_url, status=ScanStatus.pending)
    db.add(scan)
    await db.commit()
    await db.refresh(scan)

    # call Claude Vision
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
            artist=None,
            title=None,
            year=None,
            label=None,
            catalog_number=None,
            confidence=0,
            auto_added=False,
            discogs_release_id=None,
            matches=[],
            error="identification_failed",
        )

    scan.claude_raw_response = claude_result
    scan.artist = claude_result.get("artist")
    scan.title = claude_result.get("title")
    scan.year = claude_result.get("year")
    scan.label = claude_result.get("label")
    scan.catalog_number = claude_result.get("catalog_number")
    scan.format = claude_result.get("format")
    scan.confidence = claude_result.get("confidence")  # None if Claude omits it → no badge shown
    await db.commit()

    # search Discogs
    access_token = decrypt(user.discogs_oauth_token)
    access_token_secret = decrypt(user.discogs_oauth_token_secret)

    try:
        raw_results = await discogs_svc.search_releases(
            scan.artist or "", scan.title or "", access_token, access_token_secret
        )
    except Exception:
        raw_results = []

    matches_data = discogs_svc.parse_search_results(raw_results)
    matches = [DiscogsMatch(**m) for m in matches_data]

    confidence = scan.confidence or 0
    auto_added = False
    # Always show results to user — never auto-add silently

    await db.commit()
    await db.refresh(scan)
    await db.refresh(user)
    _set_credit_header(response, user)

    return ScanUploadResponse(
        scan_id=scan.id,
        status=scan.status,
        artist=scan.artist,
        title=scan.title,
        year=scan.year,
        label=scan.label,
        catalog_number=scan.catalog_number,
        confidence=confidence,
        auto_added=auto_added,
        discogs_release_id=scan.discogs_release_id,
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
    cover_image_url: str | None = None,
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
        condition=condition,
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
            pricing = await discogs_svc.get_marketplace_stats(release_id, access_token, access_token_secret)
            lowest = pricing.get("lowest") if pricing else None
            if lowest is not None:
                result = await db.execute(select(Record).where(Record.id == record_id))
                record = result.scalar_one_or_none()
                if record and record.asking_price is None:
                    # Apply user's markup if set
                    user_result = await db.execute(select(_User).where(_User.id == record.user_id))
                    user = user_result.scalar_one_or_none()
                    markup = (user.price_markup_pct or 0) if user else 0
                    record.asking_price = round(lowest * (1 + markup / 100), 2)
                    await db.commit()
        except Exception as e:
            logger.warning("Price fetch failed for record %s release %s: %s", record_id, release_id, e)


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

    scan.discogs_release_id = body.release_id
    scan.status = ScanStatus.manually_added

    record = await _create_catalog_record(
        db=db,
        user_id=user.id,
        release_id=body.release_id,
        condition=body.condition,
        lot_id=body.lot_id,
        scan=scan,
        cover_image_url=body.cover_image,
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

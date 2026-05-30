import io
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth_middleware import decrypt
from models import CreditReason, CreditTransaction, Scan, ScanStatus, User
from routers.auth import apply_monthly_topup, get_current_user
from schemas import ConfirmRequest, DiscogsMatch, ScanOut, ScanUploadResponse
from services import claude_vision, discogs as discogs_svc

router = APIRouter(prefix="/scan", tags=["scan"])

IMAGES_DIR = os.getenv("IMAGES_DIR", "/tmp/vinylscan_images")
MAX_SIZE = 800


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

    # save image
    os.makedirs(IMAGES_DIR, exist_ok=True)
    img_filename = f"{uuid.uuid4()}.jpg"
    img_path = os.path.join(IMAGES_DIR, img_filename)
    with open(img_path, "wb") as f:
        f.write(image_data)
    image_url = f"/images/{img_filename}"

    # create pending scan
    scan = Scan(user_id=user.id, image_url=image_url, status=ScanStatus.pending)
    db.add(scan)
    await db.commit()
    await db.refresh(scan)

    # call Claude Vision
    try:
        claude_result = await claude_vision.identify_record(image_data, content_type)
    except Exception:
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

    if confidence >= 95 and len(raw_results) >= 1:
        best = matches_data[0]
        try:
            await discogs_svc.add_to_collection(
                user.discogs_username, best["release_id"], access_token, access_token_secret
            )
            scan.discogs_release_id = best["release_id"]
            scan.status = ScanStatus.auto_added
            await _deduct_credit(user, scan, CreditReason.scan_used, db)
            auto_added = True
        except Exception:
            pass  # fall through to manual selection

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


@router.post("/{scan_id}/confirm")
async def confirm_scan(
    scan_id: uuid.UUID,
    body: ConfirmRequest,
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
    await _deduct_credit(user, scan, CreditReason.scan_used, db)
    await db.commit()
    await db.refresh(user)
    _set_credit_header(response, user)
    return {"ok": True, "credits_remaining": user.credits}


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

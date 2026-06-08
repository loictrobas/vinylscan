"""
Discogs collection sync router.
Endpoints:
  POST /discogs/sync          — kick off full collection import (background)
  GET  /discogs/sync/status   — poll sync progress
  POST /discogs/collection/add/{record_id}  — push a specific record to Discogs
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query as QueryParam
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth_middleware import decrypt
from models import Record, RecordCondition, RecordEvent, RecordStatus, User
from routers.auth import get_current_user
from services import discogs as discogs_svc

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/discogs", tags=["discogs"])

# ── In-memory sync state per user (UUID str → state dict) ────────────────────
_sync_state: dict[str, dict] = {}
_backfill_state: dict[str, dict] = {}


def _get_tokens(user: User) -> tuple[str, str]:
    """Decrypt and return (access_token, access_token_secret)."""
    return decrypt(user.discogs_oauth_token), decrypt(user.discogs_oauth_token_secret)


# ── Sync background task ─────────────────────────────────────────────────────

async def _run_sync(user_id: str, username: str, token: str, secret: str) -> None:
    """
    Fetch entire Discogs collection and upsert into local records.
    Skips releases that already have a matching discogs_release_id for this user.
    """
    from database import AsyncSessionLocal as async_session_maker

    state = _sync_state[user_id]
    state["status"] = "running"
    state["imported"] = 0
    state["skipped"] = 0
    state["total"] = 0
    state["error"] = None

    try:
        items = await discogs_svc.get_full_collection(username, token, secret)
        state["total"] = len(items)

        async with async_session_maker() as db:
            for item in items:
                basic = item.get("basic_information", {})
                release_id: int | None = basic.get("id") or item.get("id")
                instance_id: int | None = item.get("instance_id")

                if not release_id:
                    state["skipped"] += 1
                    continue

                # Check if already in local collection (user may own multiple copies — use first())
                existing_q = await db.execute(
                    select(Record.id).where(
                        Record.user_id == user_id,
                        Record.discogs_release_id == release_id,
                    ).limit(1)
                )
                if existing_q.scalar():
                    state["skipped"] += 1
                    continue

                # Parse metadata
                artists = basic.get("artists", [])
                artist = artists[0].get("name", "").rstrip(" ,") if artists else None
                title = basic.get("title") or None
                year = basic.get("year") or None
                formats = basic.get("formats", [])
                fmt = formats[0].get("name") if formats else None
                labels = basic.get("labels", [])
                label = labels[0].get("name") if labels else None
                genres = basic.get("genres", [])
                genre = genres[0] if genres else None
                styles_list = basic.get("styles", [])
                styles = ", ".join(styles_list[:5]) if styles_list else None
                thumb = basic.get("cover_image") or basic.get("thumb")  # cover_image > thumb (higher res, more reliable)

                record = Record(
                    user_id=user_id,
                    artist=artist,
                    title=title,
                    year=year,
                    format=fmt,
                    label=label,
                    genre=genre,
                    styles=styles,
                    discogs_release_id=release_id,
                    discogs_instance_id=instance_id,
                    discogs_synced=True,
                    discogs_url=f"https://www.discogs.com/release/{release_id}",
                    condition=RecordCondition.VG_PLUS.value,
                    status=RecordStatus.in_stock,
                    cover_image_url=thumb or None,
                )
                db.add(record)
                title_str = f"{artist} — {title}" if artist and title else (artist or title or "Unknown")
                db.add(RecordEvent(record_id=record.id, event_type="added", detail=f"Synced from Discogs collection: {title_str}"))
                state["imported"] += 1

                # Commit in batches of 50
                if state["imported"] % 50 == 0:
                    await db.commit()

            await db.commit()

            # Update user last_discogs_sync
            result = await db.execute(select(User).where(User.id == user_id))
            user_obj = result.scalar_one_or_none()
            if user_obj:
                user_obj.last_discogs_sync = datetime.now(timezone.utc)
                await db.commit()

        state["status"] = "done"
        state["finished_at"] = datetime.now(timezone.utc).isoformat()

    except Exception as exc:
        logger.exception("Discogs sync failed for user %s", user_id)
        state["status"] = "error"
        state["error"] = str(exc)


# ── Routes ────────────────────────────────────────────────────────────────────

class SyncStatus(BaseModel):
    status: Literal["idle", "running", "done", "error"]
    total: int
    imported: int
    skipped: int
    error: str | None
    last_sync: str | None
    finished_at: str | None


@router.post("/sync", response_model=SyncStatus)
async def start_sync(
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a full Discogs collection import. Idempotent — won't re-import existing records."""
    user_id = str(user.id)
    state = _sync_state.get(user_id, {})

    if state.get("status") == "running":
        return SyncStatus(
            status="running",
            total=state.get("total", 0),
            imported=state.get("imported", 0),
            skipped=state.get("skipped", 0),
            error=None,
            last_sync=user.last_discogs_sync.isoformat() if user.last_discogs_sync else None,
            finished_at=None,
        )

    token, secret = _get_tokens(user)
    _sync_state[user_id] = {
        "status": "running", "total": 0, "imported": 0,
        "skipped": 0, "error": None, "finished_at": None,
    }
    background_tasks.add_task(_run_sync, user_id, user.discogs_username, token, secret)

    return SyncStatus(
        status="running",
        total=0, imported=0, skipped=0, error=None,
        last_sync=user.last_discogs_sync.isoformat() if user.last_discogs_sync else None,
        finished_at=None,
    )


@router.get("/sync/status", response_model=SyncStatus)
async def sync_status(
    user: User = Depends(get_current_user),
):
    user_id = str(user.id)
    state = _sync_state.get(user_id)
    if not state:
        return SyncStatus(
            status="idle", total=0, imported=0, skipped=0, error=None,
            last_sync=user.last_discogs_sync.isoformat() if user.last_discogs_sync else None,
            finished_at=None,
        )
    return SyncStatus(
        status=state.get("status", "idle"),
        total=state.get("total", 0),
        imported=state.get("imported", 0),
        skipped=state.get("skipped", 0),
        error=state.get("error"),
        last_sync=user.last_discogs_sync.isoformat() if user.last_discogs_sync else None,
        finished_at=state.get("finished_at"),
    )


# ── Cover image backfill ─────────────────────────────────────────────────────

async def _run_backfill_covers(user_id: str, username: str, token: str, secret: str) -> None:
    """
    Fast cover backfill:
    1. Fetch entire Discogs collection → build release_id → cover_url map
    2. Query all local records with null cover_image_url in one DB call
    3. Update in one transaction
    """
    from database import AsyncSessionLocal as async_session_maker
    from sqlalchemy import and_, or_

    state = _backfill_state[user_id]
    state["status"] = "running"
    state["error"] = None

    try:
        items = await discogs_svc.get_full_collection(username, token, secret)
        state["total"] = len(items)

        # Build release_id → best available image URL
        thumb_map: dict[int, str] = {}
        for item in items:
            basic = item.get("basic_information", {})
            release_id: int | None = basic.get("id") or item.get("id")
            url = basic.get("cover_image") or basic.get("thumb")
            if release_id and url and url.startswith("http"):
                thumb_map[release_id] = url

        async with async_session_maker() as db:
            result = await db.execute(
                select(Record).where(
                    and_(
                        Record.user_id == user_id,
                        Record.discogs_release_id.is_not(None),
                        or_(
                            Record.cover_image_url.is_(None),
                            Record.cover_image_url == "",
                        ),
                    )
                )
            )
            records_missing = result.scalars().all()
            state["checked"] = len(records_missing)

            updated = 0
            for record in records_missing:
                url = thumb_map.get(record.discogs_release_id)  # type: ignore[arg-type]
                if url:
                    record.cover_image_url = url
                    updated += 1

            await db.commit()
            state["updated"] = updated

        state["status"] = "done"

    except Exception as exc:
        logger.exception("Cover backfill failed for user %s", user_id)
        state["status"] = "error"
        state["error"] = str(exc)


@router.post("/backfill-covers")
async def start_backfill_covers(
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    """Backfill cover_image_url for all records missing it. Fast: one collection fetch → bulk update."""
    user_id = str(user.id)
    if _backfill_state.get(user_id, {}).get("status") == "running":
        return _backfill_state[user_id]
    if not user.discogs_oauth_token:
        raise HTTPException(status_code=400, detail="Discogs not connected")
    token, secret = _get_tokens(user)
    _backfill_state[user_id] = {
        "status": "running", "total": 0, "checked": 0, "updated": 0, "error": None,
    }
    background_tasks.add_task(_run_backfill_covers, user_id, user.discogs_username, token, secret)
    return _backfill_state[user_id]


@router.get("/backfill-covers/status")
async def backfill_covers_status(user: User = Depends(get_current_user)):
    return _backfill_state.get(str(user.id), {
        "status": "idle", "total": 0, "checked": 0, "updated": 0, "error": None,
    })


# ── Market data backfill ──────────────────────────────────────────────────────

_market_backfill_state: dict[str, dict] = {}


async def _run_market_backfill(user_id: str, token: str, secret: str) -> None:
    """
    For every record with a discogs_release_id that is missing styles or market prices,
    fetch full release details + price suggestions and update the DB.
    Rate-limited to ~1 req/s to stay well within Discogs limits.
    """
    from database import AsyncSessionLocal as async_session_maker
    from sqlalchemy import or_

    state = _market_backfill_state[user_id]

    try:
        async with async_session_maker() as db:
            result = await db.execute(
                select(Record).where(
                    Record.user_id == user_id,
                    Record.discogs_release_id.is_not(None),
                    or_(
                        Record.styles.is_(None),
                        Record.discogs_lowest_price.is_(None),
                    ),
                )
            )
            records = result.scalars().all()
            state["total"] = len(records)

            for i, record in enumerate(records):
                state["processed"] = i + 1
                rid = record.discogs_release_id

                details = await discogs_svc.get_release_details(rid, token, secret)
                await asyncio.sleep(1.1)  # respect Discogs rate limit

                if details:
                    if not record.styles and details.get("styles"):
                        record.styles = ", ".join(details["styles"][:5])
                    if not record.genre and details.get("genres"):
                        record.genre = details["genres"][0]
                    if details.get("lowest_price") is not None:
                        record.discogs_lowest_price = details["lowest_price"]
                    if details.get("num_for_sale") is not None:
                        record.discogs_num_for_sale = details["num_for_sale"]

                suggestions = await discogs_svc.get_price_suggestions(rid, token, secret)
                await asyncio.sleep(1.1)

                if suggestions:
                    cond = record.condition if isinstance(record.condition, str) else record.condition.value
                    suggested = suggestions.get(cond)
                    if suggested:
                        record.discogs_suggested_price = suggested

                state["updated"] += 1

                # Commit every 10 records
                if (i + 1) % 10 == 0:
                    await db.commit()

            await db.commit()

        state["status"] = "done"

    except Exception as exc:
        logger.exception("Market backfill failed for user %s", user_id)
        state["status"] = "error"
        state["error"] = str(exc)


@router.post("/backfill-market")
async def start_market_backfill(
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
):
    """Backfill styles + market prices for all records missing them. ~2s per record."""
    user_id = str(user.id)
    if _market_backfill_state.get(user_id, {}).get("status") == "running":
        return _market_backfill_state[user_id]
    if not user.discogs_oauth_token:
        raise HTTPException(status_code=400, detail="Discogs not connected")
    token, secret = _get_tokens(user)
    _market_backfill_state[user_id] = {
        "status": "running", "total": 0, "processed": 0, "updated": 0, "error": None,
    }
    background_tasks.add_task(_run_market_backfill, user_id, token, secret)
    return _market_backfill_state[user_id]


@router.get("/backfill-market/status")
async def market_backfill_status(user: User = Depends(get_current_user)):
    return _market_backfill_state.get(str(user.id), {
        "status": "idle", "total": 0, "processed": 0, "updated": 0, "error": None,
    })


class PushResult(BaseModel):
    ok: bool
    instance_id: int | None
    message: str


class ListingResult(BaseModel):
    ok: bool
    listing_id: int | None
    message: str


@router.post("/marketplace/{record_id}", response_model=ListingResult)
async def create_marketplace_listing(
    record_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Discogs marketplace listing for a record."""
    if not user.discogs_oauth_token or not user.discogs_username:
        raise HTTPException(status_code=403, detail="Discogs account not connected")

    result = await db.execute(
        select(Record).where(Record.id == record_id, Record.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if not record.discogs_release_id:
        raise HTTPException(status_code=422, detail="Record has no Discogs release ID")
    if not record.asking_price or float(record.asking_price) <= 0:
        raise HTTPException(status_code=422, detail="Set an asking price before listing")
    if record.status != RecordStatus.in_stock:
        raise HTTPException(status_code=422, detail="Only in-stock records can be listed")
    if record.discogs_listing_id:
        return ListingResult(ok=True, listing_id=record.discogs_listing_id, message="Already listed on Discogs marketplace")

    token, secret = _get_tokens(user)
    try:
        data = await discogs_svc.create_listing(
            record.discogs_release_id,
            float(record.asking_price),
            record.condition if isinstance(record.condition, str) else record.condition.value,
            token,
            secret,
        )
        record.discogs_listing_id = data.get("listing_id") or data.get("id")
        db.add(RecordEvent(record_id=record.id, event_type="listed_on_discogs", detail=f"Discogs listing {record.discogs_listing_id} created"))
        await db.commit()
        return ListingResult(ok=True, listing_id=record.discogs_listing_id, message="Listed on Discogs marketplace")
    except Exception as exc:
        logger.warning("Failed to create listing for record %s: %s", record_id, exc)
        raise HTTPException(status_code=502, detail=f"Discogs error: {exc}")


@router.delete("/marketplace/{record_id}", response_model=ListingResult)
async def delete_marketplace_listing(
    record_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a Discogs marketplace listing."""
    if not user.discogs_oauth_token:
        raise HTTPException(status_code=403, detail="Discogs account not connected")

    result = await db.execute(
        select(Record).where(Record.id == record_id, Record.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if not record.discogs_listing_id:
        raise HTTPException(status_code=422, detail="Record has no active listing")

    token, secret = _get_tokens(user)
    listing_id = record.discogs_listing_id
    try:
        await discogs_svc.delete_listing(listing_id, token, secret)
        record.discogs_listing_id = None
        db.add(RecordEvent(record_id=record.id, event_type="delisted_from_discogs", detail=f"Discogs listing {listing_id} removed"))
        await db.commit()
        return ListingResult(ok=True, listing_id=None, message="Listing removed")
    except Exception as exc:
        logger.warning("Failed to delete listing %s: %s", listing_id, exc)
        raise HTTPException(status_code=502, detail=f"Discogs error: {exc}")


@router.get("/prices")
async def batch_prices(
    release_ids: str = QueryParam(..., description="Comma-separated release IDs"),
    user: User = Depends(get_current_user),
):
    """
    Batch-fetch Discogs marketplace stats for up to 50 release IDs.
    Returns { "12345": { "lowest": 5.99, "currency": "USD", "num_for_sale": 12 }, ... }
    """
    ids_raw = [s.strip() for s in release_ids.split(",") if s.strip()][:50]
    ids = []
    for s in ids_raw:
        try:
            ids.append(int(s))
        except ValueError:
            pass
    if not ids:
        return {}

    token, secret = _get_tokens(user)
    sem = asyncio.Semaphore(5)

    async def _fetch_one(rid: int):
        async with sem:
            result = await discogs_svc.get_marketplace_stats(rid, token, secret)
            await asyncio.sleep(0.3)
            return rid, result

    results = await asyncio.gather(*[_fetch_one(rid) for rid in ids], return_exceptions=True)
    out: dict[str, dict | None] = {}
    for item in results:
        if isinstance(item, Exception):
            continue
        rid, data = item
        out[str(rid)] = data
    return out


@router.post("/collection/add/{record_id}", response_model=PushResult)
async def push_to_discogs(
    record_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Manually push a specific record to the user's Discogs collection."""
    result = await db.execute(
        select(Record).where(Record.id == record_id, Record.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if not record.discogs_release_id:
        raise HTTPException(status_code=422, detail="Record has no Discogs release ID")

    token, secret = _get_tokens(user)
    try:
        data = await discogs_svc.add_to_collection(
            user.discogs_username, record.discogs_release_id, token, secret
        )
        instance_id = data.get("instance_id")
        record.discogs_instance_id = instance_id
        record.discogs_synced = True
        await db.commit()
        return PushResult(ok=True, instance_id=instance_id, message="Added to Discogs collection")
    except Exception as exc:
        logger.warning("Failed to push record %s to Discogs: %s", record_id, exc)
        raise HTTPException(status_code=502, detail=f"Discogs error: {exc}")

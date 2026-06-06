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

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth_middleware import decrypt
from models import Record, RecordCondition, RecordStatus, User
from routers.auth import get_current_user
from services import discogs as discogs_svc

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/discogs", tags=["discogs"])

# ── In-memory sync state per user (UUID str → state dict) ────────────────────
_sync_state: dict[str, dict] = {}


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
                existing = await db.execute(
                    select(Record.id).where(
                        Record.user_id == user_id,
                        Record.discogs_release_id == release_id,
                    ).limit(1)
                )
                if existing.scalar():
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
                thumb = basic.get("thumb") or basic.get("cover_image")

                record = Record(
                    user_id=user_id,
                    artist=artist,
                    title=title,
                    year=year,
                    format=fmt,
                    label=label,
                    genre=genre,
                    discogs_release_id=release_id,
                    discogs_instance_id=instance_id,
                    discogs_synced=True,
                    discogs_url=f"https://www.discogs.com/release/{release_id}",
                    condition=RecordCondition.VG_PLUS.value,
                    status=RecordStatus.in_stock,
                )
                db.add(record)
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


class PushResult(BaseModel):
    ok: bool
    instance_id: int | None
    message: str


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

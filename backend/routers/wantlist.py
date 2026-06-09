import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth_middleware import decrypt
from models import WantlistItem
from routers.auth import get_current_user
from models import User
from services import discogs as discogs_svc

router = APIRouter(prefix="/wantlist", tags=["wantlist"], redirect_slashes=False)


class WantlistItemOut(BaseModel):
    id: int
    artist: str
    title: str
    year: int | None
    label: str | None
    notes: str | None
    discogs_release_id: int | None
    created_at: datetime

    class Config:
        from_attributes = True


class AddWantlistRequest(BaseModel):
    artist: str
    title: str
    year: int | None = None
    label: str | None = None
    notes: str | None = None
    discogs_release_id: int | None = None


@router.get("", response_model=list[WantlistItemOut])
async def list_wantlist(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WantlistItem)
        .where(WantlistItem.user_id == user.id)
        .order_by(WantlistItem.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=WantlistItemOut, status_code=201)
async def add_wantlist_item(
    body: AddWantlistRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    item = WantlistItem(
        user_id=user.id,
        artist=body.artist,
        title=body.title,
        year=body.year,
        label=body.label,
        notes=body.notes,
        discogs_release_id=body.discogs_release_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
async def delete_wantlist_item(
    item_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WantlistItem).where(WantlistItem.id == item_id, WantlistItem.user_id == user.id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Wantlist item not found")
    await db.delete(item)
    await db.commit()


@router.post("/sync-discogs", response_model=list[WantlistItemOut])
async def sync_discogs_wantlist(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.discogs_oauth_token:
        raise HTTPException(status_code=400, detail="Discogs not connected")

    token = decrypt(user.discogs_oauth_token)
    secret = decrypt(user.discogs_oauth_token_secret)

    try:
        items = await discogs_svc.get_wantlist(token, secret, user.discogs_username)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Discogs wantlist sync error: {e}")

    # Upsert by discogs_release_id
    existing = await db.execute(
        select(WantlistItem).where(
            WantlistItem.user_id == user.id,
            WantlistItem.discogs_release_id.isnot(None),
        )
    )
    existing_by_rid = {i.discogs_release_id: i for i in existing.scalars().all()}

    now = datetime.now(timezone.utc)
    for entry in items:
        rid = entry.get("release_id")
        if rid and rid in existing_by_rid:
            # Update notes if changed
            existing_by_rid[rid].notes = entry.get("notes")
        else:
            item = WantlistItem(
                user_id=user.id,
                artist=entry.get("artist", ""),
                title=entry.get("title", ""),
                year=entry.get("year"),
                label=entry.get("label"),
                notes=entry.get("notes"),
                discogs_release_id=rid,
                created_at=now,
            )
            db.add(item)

    await db.commit()

    result = await db.execute(
        select(WantlistItem)
        .where(WantlistItem.user_id == user.id)
        .order_by(WantlistItem.created_at.desc())
    )
    return result.scalars().all()

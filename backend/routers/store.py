"""
Public store router.
  GET  /store/settings          — get current user's store config (auth)
  PATCH /store/settings         — update store config (auth)
  GET  /store/{slug}            — public storefront (no auth)
"""
import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Record, RecordStatus, User
from routers.auth import get_current_user

router = APIRouter(prefix="/store", tags=["store"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class StoreSettings(BaseModel):
    store_slug: str | None
    store_name: str | None
    store_description: str | None
    store_contact: str | None
    store_public: bool


class UpdateStoreSettings(BaseModel):
    store_slug: str | None = None
    store_name: str | None = None
    store_description: str | None = None
    store_contact: str | None = None
    store_public: bool | None = None


class PublicRecord(BaseModel):
    id: str
    artist: str | None
    title: str | None
    year: int | None
    label: str | None
    format: str | None
    genre: str | None
    condition: str
    asking_price: float | None
    cover_image_url: str | None


class PublicStore(BaseModel):
    store_name: str | None
    store_description: str | None
    store_contact: str | None
    records: list[PublicRecord]


# ── Auth endpoints ─────────────────────────────────────────────────────────────

@router.get("/settings", response_model=StoreSettings)
async def get_store_settings(user: User = Depends(get_current_user)):
    return StoreSettings(
        store_slug=user.store_slug,
        store_name=user.store_name,
        store_description=user.store_description,
        store_contact=user.store_contact,
        store_public=user.store_public,
    )


def _slugify(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")[:60]


@router.patch("/settings", response_model=StoreSettings)
async def update_store_settings(
    body: UpdateStoreSettings,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(User).where(User.id == user.id))
    db_user = result.scalar_one()

    if "store_slug" in body.model_fields_set and body.store_slug is not None:
        slug = _slugify(body.store_slug)
        if not slug:
            raise HTTPException(status_code=400, detail="Invalid slug")
        # Check uniqueness
        existing = await db.execute(
            select(User.id).where(User.store_slug == slug, User.id != user.id)
        )
        if existing.scalar():
            raise HTTPException(status_code=409, detail="Slug already taken")
        db_user.store_slug = slug
    elif "store_slug" in body.model_fields_set and body.store_slug is None:
        db_user.store_slug = None

    for field in ["store_name", "store_description", "store_contact", "store_public"]:
        if field in body.model_fields_set:
            setattr(db_user, field, getattr(body, field))

    # Auto-set slug from display_name or discogs_username if not already set
    if not db_user.store_slug:
        source = db_user.display_name or db_user.discogs_username
        if source:
            candidate = _slugify(source)
            exists = await db.execute(
                select(User.id).where(User.store_slug == candidate, User.id != user.id)
            )
            if not exists.scalar():
                db_user.store_slug = candidate

    await db.commit()
    await db.refresh(db_user)
    return StoreSettings(
        store_slug=db_user.store_slug,
        store_name=db_user.store_name,
        store_description=db_user.store_description,
        store_contact=db_user.store_contact,
        store_public=db_user.store_public,
    )


# ── Public endpoint ────────────────────────────────────────────────────────────

@router.get("/{slug}", response_model=PublicStore)
async def get_public_store(slug: str, db: AsyncSession = Depends(get_db)):
    # Try slug first, then fall back to user UUID
    user_result = await db.execute(
        select(User).where(User.store_slug == slug)
    )
    store_user = user_result.scalar_one_or_none()

    if not store_user:
        try:
            uid = uuid.UUID(slug)
            user_result = await db.execute(select(User).where(User.id == uid))
            store_user = user_result.scalar_one_or_none()
        except ValueError:
            pass

    if not store_user:
        raise HTTPException(status_code=404, detail="Store not found")
    if not store_user.store_public:
        raise HTTPException(status_code=404, detail="Store not found")

    records_result = await db.execute(
        select(Record).where(
            Record.user_id == store_user.id,
            Record.status == RecordStatus.in_stock,
            Record.store_listed == True,  # noqa: E712
        ).order_by(Record.created_at.desc())
    )
    records = records_result.scalars().all()

    return PublicStore(
        store_name=store_user.store_name or store_user.display_name or store_user.discogs_username,
        store_description=store_user.store_description,
        store_contact=store_user.store_contact,
        records=[
            PublicRecord(
                id=str(r.id),
                artist=r.artist,
                title=r.title,
                year=r.year,
                label=r.label,
                format=r.format,
                genre=getattr(r, "genre", None),
                condition=r.condition if isinstance(r.condition, str) else r.condition.value,
                asking_price=float(r.asking_price) if r.asking_price is not None else None,
                cover_image_url=getattr(r, "cover_image_url", None),
            )
            for r in records
        ],
    )

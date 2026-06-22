"""
Public store router.
  GET  /store/settings          — get current user's store config (auth)
  PATCH /store/settings         — update store config (auth)
  POST /store/logo              — upload store logo via Cloudinary (auth)
  DELETE /store/logo            — remove store logo (auth)
  POST /store/banner            — upload store banner via Cloudinary (auth)
  DELETE /store/banner          — remove store banner (auth)
  GET  /store/{slug}            — public storefront (no auth)
"""
import asyncio
import os
import re
import uuid
from functools import partial

import cloudinary
import cloudinary.uploader
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Record, RecordStatus, User
from routers.auth import get_current_user

CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY", "336544145831256")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "hqmJ8EvE3gch2pNYadXqvzsqfMs")

if CLOUDINARY_CLOUD_NAME:
    cloudinary.config(
        cloud_name=CLOUDINARY_CLOUD_NAME,
        api_key=CLOUDINARY_API_KEY,
        api_secret=CLOUDINARY_API_SECRET,
        secure=True,
    )

router = APIRouter(prefix="/store", tags=["store"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class StoreSettings(BaseModel):
    store_slug: str | None
    store_name: str | None
    store_description: str | None
    store_contact: str | None
    store_public: bool
    store_info_banner: str | None
    store_instagram: str | None
    store_location: str | None
    store_accent_color: str | None
    store_facebook: str | None
    store_website: str | None
    store_logo_url: str | None
    store_banner_url: str | None
    store_font: str | None
    store_secondary_color: str | None
    store_tagline: str | None
    store_hours: str | None
    store_theme_config: str | None
    store_hero_layout: str


class UpdateStoreSettings(BaseModel):
    store_slug: str | None = None
    store_name: str | None = None
    store_description: str | None = None
    store_contact: str | None = None
    store_public: bool | None = None
    store_info_banner: str | None = None
    store_instagram: str | None = None
    store_location: str | None = None
    store_accent_color: str | None = None
    store_facebook: str | None = None
    store_website: str | None = None
    store_banner_url: str | None = None
    store_font: str | None = None
    store_secondary_color: str | None = None
    store_tagline: str | None = None
    store_hours: str | None = None
    store_theme_config: str | None = None
    store_hero_layout: str | None = None


class PublicRecord(BaseModel):
    id: str
    artist: str | None
    title: str | None
    year: int | None
    label: str | None
    catalog_number: str | None
    format: str | None
    genre: str | None
    styles: str | None
    condition: str
    asking_price: float | None
    cover_image_url: str | None
    discogs_synced: bool
    record_section: str
    tracklist: list[dict] | None
    created_at: str


class PublicStore(BaseModel):
    store_name: str | None
    store_description: str | None
    store_contact: str | None
    store_info_banner: str | None
    store_instagram: str | None
    store_location: str | None
    store_accent_color: str | None
    store_facebook: str | None
    store_website: str | None
    store_logo_url: str | None
    store_banner_url: str | None
    store_font: str | None
    store_secondary_color: str | None
    store_tagline: str | None
    store_hours: str | None
    store_theme_config: str | None
    store_hero_layout: str
    records: list[PublicRecord]


# ── Helpers ────────────────────────────────────────────────────────────────────

def _user_to_store_settings(u: User) -> StoreSettings:
    return StoreSettings(
        store_slug=u.store_slug,
        store_name=u.store_name,
        store_description=u.store_description,
        store_contact=u.store_contact,
        store_public=u.store_public,
        store_info_banner=u.store_info_banner,
        store_instagram=u.store_instagram,
        store_location=u.store_location,
        store_accent_color=u.store_accent_color,
        store_facebook=u.store_facebook,
        store_website=u.store_website,
        store_logo_url=u.store_logo_url,
        store_banner_url=u.store_banner_url,
        store_font=u.store_font,
        store_secondary_color=u.store_secondary_color,
        store_tagline=u.store_tagline,
        store_hours=u.store_hours,
        store_theme_config=u.store_theme_config,
        store_hero_layout=getattr(u, "store_hero_layout", None) or "gallery",
    )


def _slugify(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")[:60]


async def _require_cloudinary():
    if not CLOUDINARY_CLOUD_NAME:
        raise HTTPException(status_code=503, detail="Image uploads not configured (missing CLOUDINARY_CLOUD_NAME)")


# ── Auth endpoints ─────────────────────────────────────────────────────────────

@router.get("/settings", response_model=StoreSettings)
async def get_store_settings(user: User = Depends(get_current_user)):
    return _user_to_store_settings(user)


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
        existing = await db.execute(
            select(User.id).where(User.store_slug == slug, User.id != user.id)
        )
        if existing.scalar():
            raise HTTPException(status_code=409, detail="Slug already taken")
        db_user.store_slug = slug
    elif "store_slug" in body.model_fields_set and body.store_slug is None:
        db_user.store_slug = None

    if "store_hero_layout" in body.model_fields_set and body.store_hero_layout is not None:
        valid_layouts = {"gallery", "index", "poster"}
        if body.store_hero_layout not in valid_layouts:
            raise HTTPException(status_code=400, detail=f"Invalid hero layout. Use one of: {sorted(valid_layouts)}")

    updatable = [
        "store_name", "store_description", "store_contact", "store_public",
        "store_info_banner", "store_instagram", "store_location", "store_accent_color",
        "store_facebook", "store_website", "store_font", "store_secondary_color",
        "store_tagline", "store_hours", "store_theme_config", "store_hero_layout",
    ]
    for field in updatable:
        if field in body.model_fields_set:
            setattr(db_user, field, getattr(body, field))

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
    return _user_to_store_settings(db_user)


# ── Logo upload ────────────────────────────────────────────────────────────────

def _upload_logo_sync(data: bytes, public_id: str) -> str:
    result = cloudinary.uploader.upload(
        data,
        public_id=public_id,
        folder="vinylscan/store-logos",
        overwrite=True,
        resource_type="image",
        transformation=[{"width": 400, "height": 400, "crop": "limit", "quality": "auto", "fetch_format": "auto"}],
    )
    return result["secure_url"]


@router.post("/logo", response_model=StoreSettings)
async def upload_store_logo(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_cloudinary()

    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 5 MB")

    loop = asyncio.get_event_loop()
    try:
        url = await loop.run_in_executor(None, partial(_upload_logo_sync, data, f"logo_{user.id}"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

    result = await db.execute(select(User).where(User.id == user.id))
    db_user = result.scalar_one()
    db_user.store_logo_url = url
    await db.commit()
    await db.refresh(db_user)
    return _user_to_store_settings(db_user)


@router.delete("/logo", response_model=StoreSettings)
async def delete_store_logo(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(User).where(User.id == user.id))
    db_user = result.scalar_one()
    db_user.store_logo_url = None
    await db.commit()
    await db.refresh(db_user)
    return _user_to_store_settings(db_user)


# ── Banner upload ──────────────────────────────────────────────────────────────

def _upload_banner_sync(data: bytes, public_id: str) -> str:
    result = cloudinary.uploader.upload(
        data,
        public_id=public_id,
        folder="vinylscan/store-banners",
        overwrite=True,
        resource_type="image",
        transformation=[{"width": 1600, "height": 500, "crop": "fill", "gravity": "auto", "quality": "auto", "fetch_format": "auto"}],
    )
    return result["secure_url"]


@router.post("/banner", response_model=StoreSettings)
async def upload_store_banner(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _require_cloudinary()

    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 10 MB")

    loop = asyncio.get_event_loop()
    try:
        url = await loop.run_in_executor(None, partial(_upload_banner_sync, data, f"banner_{user.id}"))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {e}")

    result = await db.execute(select(User).where(User.id == user.id))
    db_user = result.scalar_one()
    db_user.store_banner_url = url
    await db.commit()
    await db.refresh(db_user)
    return _user_to_store_settings(db_user)


@router.delete("/banner", response_model=StoreSettings)
async def delete_store_banner(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(User).where(User.id == user.id))
    db_user = result.scalar_one()
    db_user.store_banner_url = None
    await db.commit()
    await db.refresh(db_user)
    return _user_to_store_settings(db_user)


# ── Public endpoint ────────────────────────────────────────────────────────────

@router.get("/{slug}", response_model=PublicStore)
async def get_public_store(slug: str, db: AsyncSession = Depends(get_db)):
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
        store_info_banner=store_user.store_info_banner,
        store_instagram=store_user.store_instagram,
        store_location=store_user.store_location,
        store_accent_color=store_user.store_accent_color,
        store_facebook=store_user.store_facebook,
        store_website=store_user.store_website,
        store_logo_url=store_user.store_logo_url,
        store_banner_url=store_user.store_banner_url,
        store_font=store_user.store_font,
        store_secondary_color=store_user.store_secondary_color,
        store_tagline=store_user.store_tagline,
        store_hours=store_user.store_hours,
        store_theme_config=store_user.store_theme_config,
        store_hero_layout=getattr(store_user, "store_hero_layout", None) or "gallery",
        records=[
            PublicRecord(
                id=str(r.id),
                artist=r.artist,
                title=r.title,
                year=r.year,
                label=r.label,
                catalog_number=getattr(r, "catalog_number", None),
                format=r.format,
                genre=getattr(r, "genre", None),
                styles=getattr(r, "styles", None),
                condition=r.condition if isinstance(r.condition, str) else r.condition.value,
                asking_price=float(r.asking_price) if r.asking_price is not None else None,
                cover_image_url=getattr(r, "cover_image_url", None),
                discogs_synced=getattr(r, "discogs_synced", False) or False,
                record_section=getattr(r, "record_section", "vinyl") or "vinyl",
                tracklist=getattr(r, "tracklist", None),
                created_at=r.created_at.isoformat(),
            )
            for r in records
        ],
    )

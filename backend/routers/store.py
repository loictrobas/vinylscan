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
from datetime import datetime, timezone
from functools import partial

import anthropic
import cloudinary
import cloudinary.uploader
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Accessory, Order, Record, RecordStatus, SellTradeLead, User
from routers.admin import require_admin
from routers.auth import get_current_user
from services import email_service
from services.claude_vision import _extract_json

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
    id: str
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


class PublicAccessory(BaseModel):
    id: str
    name: str
    category: str
    description: str | None
    price: float | None
    stock_quantity: int
    cover_image_url: str | None


class SellTradeLeadRequest(BaseModel):
    name: str
    email: str
    approx_records: str
    payout_preference: str
    notes: str = ""


STORE_PAGE_SIZE = 48


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
    records: list[PublicRecord]  # first page only (newest first) — /records paginates the rest
    accessories: list[PublicAccessory]
    total_records: int = 0
    genres: dict[str, int] = {}  # tag → count, across the whole listed catalog
    formats: list[str] = []
    page_size: int = STORE_PAGE_SIZE


class PublicRecordsPage(BaseModel):
    records: list[PublicRecord]
    total: int
    page: int
    per_page: int


# ── Helpers ────────────────────────────────────────────────────────────────────

def _user_to_store_settings(u: User) -> StoreSettings:
    return StoreSettings(
        id=str(u.id),
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
async def get_store_settings(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.store_slug:
        source = user.display_name or user.discogs_username
        if source:
            candidate = _slugify(source)
            exists = await db.execute(
                select(User.id).where(User.store_slug == candidate, User.id != user.id)
            )
            if not exists.scalar():
                user.store_slug = candidate
                await db.commit()
                await db.refresh(user)
    return _user_to_store_settings(user)


@router.patch("/settings", response_model=StoreSettings)
async def update_store_settings(
    body: UpdateStoreSettings,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(User).where(User.id == user.id))
    db_user = result.scalar_one()

    # Snapshot the pre-change state so a settings mistake can be undone.
    _snapshot_fields = [
        "store_name", "store_slug", "store_description", "store_contact", "store_public",
        "store_info_banner", "store_instagram", "store_location", "store_accent_color",
        "store_facebook", "store_website", "store_font", "store_secondary_color",
        "store_tagline", "store_hours", "store_theme_config", "store_hero_layout",
    ]
    if body.model_fields_set:
        snapshot = {
            "settings": {f: getattr(db_user, f) for f in _snapshot_fields},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        history = list(db_user.settings_history or [])
        history.insert(0, snapshot)
        db_user.settings_history = history[:5]

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


class SettingsSnapshot(BaseModel):
    settings: dict
    created_at: str


@router.get("/settings/history", response_model=list[SettingsSnapshot])
async def get_settings_history(user: User = Depends(get_current_user)):
    return [SettingsSnapshot(**s) for s in (user.settings_history or [])]


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


# ── AI theme generation (admin-only — costs us a Claude call per generation) ───

class GenerateThemeRequest(BaseModel):
    vibe: str


class ThemeGenerationEntry(BaseModel):
    theme: dict
    vibe: str
    created_at: str


_THEME_SCHEMA_PROMPT = """You are generating a visual theme config for a vinyl record store storefront.

Store name: {store_name}
{store_desc_line}
Vibe: {vibe}

Return ONLY a valid JSON object. No explanation, no markdown, no code blocks — just the raw JSON.

Schema:
{{
  "accent": string,     // hex color like "#a855f7" — primary brand color (buttons, highlights)
  "secondary": string,  // hex color like "#ec4899" — gradient & secondary accents
  "font": "inter" | "syne" | "dm-sans" | "unbounded",
  "radius": "sharp" | "soft" | "round",
  "border_weight": "hairline" | "bold" | "none",
  "shadow_style": "flat" | "soft" | "hard-offset",
  "density": "compact" | "comfortable" | "spacious",
  "headline_scale": "modest" | "editorial" | "oversized",
  "card_texture": "plain" | "swatch" | "grain",
  "motion": "minimal" | "smooth" | "playful",
  "button_shape": "block" | "pill" | "underline",
  "mood": string
}}

Guide:
- font: inter = clean modern, syne = editorial angular, dm-sans = friendly geometric, unbounded = bold display
- radius: sharp = zero rounding, soft = light rounding, round = heavily rounded corners (for fully pill-shaped buttons, use button_shape instead)
- shadow_style: hard-offset only looks right paired with bold border_weight and sharp/soft radius (neo-brutalist)
- motion: playful adds a slight scale+tilt on hover — fits loud/energetic vibes, not calm/minimal ones
- mood: max 80 chars, restate the vibe in your own words"""


@router.post("/theme/generate", response_model=ThemeGenerationEntry)
async def generate_store_theme(
    body: GenerateThemeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    result = await db.execute(select(User).where(User.id == user.id))
    db_user = result.scalar_one()

    prompt = _THEME_SCHEMA_PROMPT.format(
        store_name=db_user.store_name or "my vinyl store",
        store_desc_line=f"Store description: {db_user.store_description}" if db_user.store_description else "",
        vibe=body.vibe.strip()[:200] or "a well-run independent record shop",
    )

    client = anthropic.AsyncAnthropic()

    async def _call() -> dict:
        response = await client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=512,
            messages=[{"role": "user", "content": prompt}],
        )
        return _extract_json(response.content[0].text)

    try:
        theme = await _call()
    except Exception:
        try:
            theme = await _call()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Claude theme generation failed: {exc}")

    entry = {
        "theme": theme,
        "vibe": body.vibe.strip()[:200],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    history = list(db_user.theme_history or [])
    history.insert(0, entry)
    db_user.theme_history = history[:3]
    await db.commit()

    return ThemeGenerationEntry(**entry)


@router.get("/theme/history", response_model=list[ThemeGenerationEntry])
async def get_theme_history(user: User = Depends(require_admin)):
    return [ThemeGenerationEntry(**e) for e in (user.theme_history or [])]


# ── Sell/Trade leads — owner-facing inbox ───────────────────────────────────────
# NOTE: registered before the public "/{slug}" catch-all below — "/leads" is a
# single path segment and would otherwise be swallowed as if slug="leads".

class SellTradeLeadOut(BaseModel):
    id: str
    name: str
    email: str
    approx_records: str | None
    payout_preference: str | None
    notes: str | None
    status: str
    created_at: str


class UpdateLeadStatusRequest(BaseModel):
    status: str


_VALID_LEAD_STATUSES = {"new", "contacted", "closed"}


@router.get("/leads", response_model=list[SellTradeLeadOut])
async def list_leads(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SellTradeLead).where(SellTradeLead.user_id == user.id).order_by(SellTradeLead.created_at.desc())
    )
    leads = result.scalars().all()
    return [
        SellTradeLeadOut(
            id=str(l.id), name=l.name, email=l.email, approx_records=l.approx_records,
            payout_preference=l.payout_preference, notes=l.notes, status=l.status,
            created_at=l.created_at.isoformat(),
        )
        for l in leads
    ]


@router.patch("/leads/{lead_id}", response_model=SellTradeLeadOut)
async def update_lead_status(
    lead_id: uuid.UUID,
    body: UpdateLeadStatusRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.status not in _VALID_LEAD_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of: {sorted(_VALID_LEAD_STATUSES)}")
    result = await db.execute(
        select(SellTradeLead).where(SellTradeLead.id == lead_id, SellTradeLead.user_id == user.id)
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead.status = body.status
    await db.commit()
    await db.refresh(lead)
    return SellTradeLeadOut(
        id=str(lead.id), name=lead.name, email=lead.email, approx_records=lead.approx_records,
        payout_preference=lead.payout_preference, notes=lead.notes, status=lead.status,
        created_at=lead.created_at.isoformat(),
    )


# ── Orders — owner-facing history ───────────────────────────────────────────────
# NOTE: registered before the public "/{slug}" catch-all below, same reason as leads.

class OrderItemOut(BaseModel):
    kind: str
    id: str
    name: str
    qty: int
    price: float | None


class OrderOut(BaseModel):
    id: str
    order_ref: str
    customer_name: str
    customer_contact: str
    note: str | None
    items: list[OrderItemOut]
    total: float
    created_at: str


@router.get("/orders", response_model=list[OrderOut])
async def list_orders(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc())
    )
    orders = result.scalars().all()
    return [
        OrderOut(
            id=str(o.id), order_ref=o.order_ref, customer_name=o.customer_name,
            customer_contact=o.customer_contact, note=o.note, items=o.items,
            total=float(o.total), created_at=o.created_at.isoformat(),
        )
        for o in orders
    ]


# ── Public endpoint ────────────────────────────────────────────────────────────

async def _get_public_store_user(db: AsyncSession, slug: str) -> User:
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

    if not store_user or not store_user.store_public:
        raise HTTPException(status_code=404, detail="Store not found")
    return store_user


def _public_record(r: Record) -> PublicRecord:
    return PublicRecord(
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


def _record_tags(genre: str | None, styles: str | None) -> list[str]:
    """Mirror of the storefront's recordTags(): styles split on commas, else genre."""
    if styles:
        return [s.strip() for s in styles.split(",") if s.strip()]
    return [genre] if genre else []


def _listed_records_query(user_id, search: str | None = None, genre: str | None = None,
                          format_: str | None = None, condition: str | None = None,
                          max_price: float | None = None):
    from sqlalchemy import func as sa_func
    q = select(Record).where(
        Record.user_id == user_id,
        Record.status == RecordStatus.in_stock,
        Record.store_listed == True,  # noqa: E712
        Record.record_section != "accessory",
    )
    if search:
        term = f"%{search}%"
        q = q.where(Record.artist.ilike(term) | Record.title.ilike(term) | Record.label.ilike(term))
    if genre:
        # exact tag-element match on the comma-separated styles list (or the genre column)
        padded = sa_func.concat(", ", sa_func.coalesce(Record.styles, ""), ", ")
        q = q.where((Record.genre == genre) | padded.ilike(f"%, {genre}, %"))
    if format_:
        q = q.where(Record.format == format_)
    if condition:
        q = q.where(Record.condition == condition)
    if max_price is not None:
        q = q.where(Record.asking_price.isnot(None), Record.asking_price <= max_price)
    return q


_STORE_SORTS = {
    "newest": lambda: Record.created_at.desc(),
    "price_asc": lambda: Record.asking_price.asc().nulls_last(),
    "price_desc": lambda: Record.asking_price.desc().nulls_last(),
    "artist_az": lambda: Record.artist.asc().nulls_last(),
}


@router.get("/{slug}", response_model=PublicStore)
async def get_public_store(slug: str, db: AsyncSession = Depends(get_db)):
    store_user = await _get_public_store_user(db, slug)

    from sqlalchemy import func as sa_func
    base = _listed_records_query(store_user.id)

    records_result = await db.execute(
        base.order_by(Record.created_at.desc()).limit(STORE_PAGE_SIZE)
    )
    records = records_result.scalars().all()

    total = (await db.execute(
        select(sa_func.count()).select_from(base.subquery())
    )).scalar_one()

    # Facets across the whole listed catalog (3 tiny columns — cheap even at 10k rows)
    facet_rows = (await db.execute(
        base.with_only_columns(Record.genre, Record.styles, Record.format)
    )).all()
    genre_counts: dict[str, int] = {}
    formats: set[str] = set()
    for g, styles, fmt in facet_rows:
        for tag in _record_tags(g, styles):
            genre_counts[tag] = genre_counts.get(tag, 0) + 1
        if fmt:
            formats.add(fmt)

    accessories_result = await db.execute(
        select(Accessory).where(
            Accessory.user_id == store_user.id,
            Accessory.is_listed == True,  # noqa: E712
        ).order_by(Accessory.created_at.desc())
    )
    accessories = accessories_result.scalars().all()

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
        records=[_public_record(r) for r in records],
        accessories=[
            PublicAccessory(
                id=str(a.id),
                name=a.name,
                category=a.category,
                description=a.description,
                price=float(a.price) if a.price is not None else None,
                stock_quantity=a.stock_quantity,
                cover_image_url=a.cover_image_url,
            )
            for a in accessories
        ],
        total_records=total,
        genres=dict(sorted(genre_counts.items())),
        formats=sorted(formats),
        page_size=STORE_PAGE_SIZE,
    )


@router.get("/{slug}/records", response_model=PublicRecordsPage)
async def get_public_store_records(
    slug: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(STORE_PAGE_SIZE, ge=1, le=96),
    search: str | None = Query(None),
    genre: str | None = Query(None),
    format: str | None = Query(None),
    condition: str | None = Query(None),
    max_price: float | None = Query(None, ge=0),
    sort: str = Query("newest"),
    db: AsyncSession = Depends(get_db),
):
    """Server-side paginated/filtered listing for the public storefront."""
    from sqlalchemy import func as sa_func
    store_user = await _get_public_store_user(db, slug)

    q = _listed_records_query(
        store_user.id, search=search, genre=genre, format_=format,
        condition=condition, max_price=max_price,
    )
    total = (await db.execute(select(sa_func.count()).select_from(q.subquery()))).scalar_one()

    order = _STORE_SORTS.get(sort, _STORE_SORTS["newest"])()
    result = await db.execute(q.order_by(order).offset((page - 1) * per_page).limit(per_page))
    records = result.scalars().all()

    return PublicRecordsPage(
        records=[_public_record(r) for r in records],
        total=total, page=page, per_page=per_page,
    )


@router.post("/{slug}/sell-trade")
async def submit_sell_trade_lead(
    slug: str,
    body: SellTradeLeadRequest,
    db: AsyncSession = Depends(get_db),
):
    store_user = await _get_public_store_user(db, slug)
    store_name = store_user.store_name or store_user.display_name or "the store"

    db.add(SellTradeLead(
        user_id=store_user.id,
        name=body.name,
        email=body.email,
        approx_records=body.approx_records,
        payout_preference=body.payout_preference,
        notes=body.notes or None,
    ))
    await db.commit()

    # Prefer store_contact only if it's actually an email — WhatsApp numbers
    # can't receive this, fall back to the owner's account email instead.
    recipient = store_user.store_contact if store_user.store_contact and "@" in store_user.store_contact else store_user.email
    if recipient:
        try:
            await email_service.send_sell_trade_lead(recipient, store_name, body.model_dump())
        except Exception:
            pass  # never fail the submission over an email delivery problem — the lead is already saved

    return {"ok": True}


class PlaceOrderItem(BaseModel):
    kind: str
    id: str
    name: str
    qty: int
    price: float | None = None


class PlaceOrderRequest(BaseModel):
    customer_name: str
    customer_contact: str
    note: str | None = None
    items: list[PlaceOrderItem]
    total: float


class PlaceOrderResponse(BaseModel):
    order_ref: str


@router.post("/{slug}/order", response_model=PlaceOrderResponse)
async def place_order(
    slug: str,
    body: PlaceOrderRequest,
    db: AsyncSession = Depends(get_db),
):
    store_user = await _get_public_store_user(db, slug)
    order_ref = "ORD-" + uuid.uuid4().hex[:8].upper()

    # Reserve stock so two customers can't order the same 1-of-1 record:
    # records get delisted (owner can relist if the pickup falls through),
    # accessories decrement stock_quantity. Anything already gone → 409 so
    # the customer knows before showing up at the store.
    for item in body.items:
        try:
            item_uuid = uuid.UUID(item.id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid item id")
        if item.qty < 1:
            raise HTTPException(status_code=400, detail="Invalid quantity")
        if item.kind == "record":
            result = await db.execute(
                select(Record).where(
                    Record.id == item_uuid,
                    Record.user_id == store_user.id,
                    Record.status == RecordStatus.in_stock,
                    Record.store_listed == True,  # noqa: E712
                ).with_for_update()
            )
            record = result.scalar_one_or_none()
            if not record:
                await db.rollback()
                raise HTTPException(status_code=409, detail=f"'{item.name}' is no longer available")
            record.store_listed = False
        elif item.kind == "accessory":
            result = await db.execute(
                select(Accessory).where(
                    Accessory.id == item_uuid,
                    Accessory.user_id == store_user.id,
                    Accessory.is_listed == True,  # noqa: E712
                ).with_for_update()
            )
            accessory = result.scalar_one_or_none()
            if not accessory or accessory.stock_quantity < item.qty:
                await db.rollback()
                raise HTTPException(status_code=409, detail=f"'{item.name}' is no longer available")
            accessory.stock_quantity -= item.qty

    db.add(Order(
        user_id=store_user.id,
        order_ref=order_ref,
        customer_name=body.customer_name,
        customer_contact=body.customer_contact,
        note=body.note or None,
        items=[item.model_dump() for item in body.items],
        total=body.total,
    ))
    await db.commit()

    return PlaceOrderResponse(order_ref=order_ref)

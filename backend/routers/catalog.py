import csv
import io
import logging
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from middleware.auth_middleware import decrypt
from models import Lot, Record, RecordCondition, RecordEvent, RecordStatus, User
from routers.auth import get_current_user
from routers.scan import _set_credit_header
from schemas import DiscogsMatch, ResearchResponse
from services import discogs as discogs_svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/catalog", tags=["catalog"])


async def _log(db: AsyncSession, record_id, event_type: str, detail: str | None = None):
    db.add(RecordEvent(record_id=record_id, event_type=event_type, detail=detail))


# ── Schemas ──────────────────────────────────────────────────────────────────

class RecordOut(BaseModel):
    id: uuid.UUID
    lot_id: uuid.UUID | None
    scan_id: uuid.UUID | None
    artist: str | None
    title: str | None
    year: int | None
    label: str | None
    catalog_number: str | None
    format: str | None
    genre: str | None
    styles: str | None
    country: str | None
    condition: str
    disc_condition: str | None
    cover_condition: str | None
    discogs_release_id: int | None
    discogs_instance_id: int | None
    discogs_listing_id: int | None
    discogs_synced: bool
    discogs_url: str | None
    discogs_lowest_price: float | None
    discogs_num_for_sale: int | None
    discogs_suggested_price: float | None
    cover_image_url: str | None
    tracklist: list[dict] | None
    record_section: str
    status: str
    cost_price: float | None
    asking_price: float | None
    sold_price: float | None
    sold_at: str | None
    payment_method: str | None
    tags: str | None
    notes: str | None
    store_listed: bool
    created_at: str
    consignor_id: int | None
    consignor_agreed_price: float | None
    consignor_commission_pct: float | None
    consignor_payout_status: str | None
    consignor_amount_owed: float | None
    consignor_amount_paid: float | None
    consigned_at: str | None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_safe(cls, r: Record) -> "RecordOut":
        return cls(
            id=r.id,
            lot_id=r.lot_id,
            scan_id=r.scan_id,
            artist=r.artist,
            title=r.title,
            year=r.year,
            label=r.label,
            catalog_number=r.catalog_number,
            format=r.format,
            genre=getattr(r, "genre", None),
            styles=getattr(r, "styles", None),
            country=getattr(r, "country", None),
            condition=r.condition,
            disc_condition=getattr(r, "disc_condition", None),
            cover_condition=getattr(r, "cover_condition", None),
            discogs_release_id=r.discogs_release_id,
            discogs_instance_id=getattr(r, "discogs_instance_id", None),
            discogs_listing_id=getattr(r, "discogs_listing_id", None),
            discogs_synced=getattr(r, "discogs_synced", False) or False,
            discogs_url=r.discogs_url,
            discogs_lowest_price=float(r.discogs_lowest_price) if getattr(r, "discogs_lowest_price", None) is not None else None,
            discogs_num_for_sale=getattr(r, "discogs_num_for_sale", None),
            discogs_suggested_price=float(r.discogs_suggested_price) if getattr(r, "discogs_suggested_price", None) is not None else None,
            cover_image_url=getattr(r, "cover_image_url", None),
            tracklist=getattr(r, "tracklist", None),
            status=r.status.value if hasattr(r.status, "value") else r.status,
            cost_price=float(r.cost_price) if getattr(r, "cost_price", None) is not None else None,
            asking_price=float(r.asking_price) if r.asking_price is not None else None,
            sold_price=float(r.sold_price) if r.sold_price is not None else None,
            sold_at=r.sold_at.isoformat() if r.sold_at else None,
            payment_method=getattr(r, "payment_method", None),
            tags=getattr(r, "tags", None),
            notes=getattr(r, "notes", None),
            record_section=getattr(r, "record_section", "vinyl") or "vinyl",
            store_listed=getattr(r, "store_listed", False) or False,
            created_at=r.created_at.isoformat(),
            consignor_id=getattr(r, "consignor_id", None),
            consignor_agreed_price=float(r.consignor_agreed_price) if getattr(r, "consignor_agreed_price", None) is not None else None,
            consignor_commission_pct=getattr(r, "consignor_commission_pct", None),
            consignor_payout_status=getattr(r, "consignor_payout_status", None),
            consignor_amount_owed=float(r.consignor_amount_owed) if getattr(r, "consignor_amount_owed", None) is not None else None,
            consignor_amount_paid=float(r.consignor_amount_paid) if getattr(r, "consignor_amount_paid", None) is not None else None,
            consigned_at=r.consigned_at.isoformat() if getattr(r, "consigned_at", None) else None,
        )


class LotOut(BaseModel):
    id: uuid.UUID
    name: str
    purchase_price: float | None
    notes: str | None
    record_count: int
    in_stock_count: int
    sold_count: int
    total_asking: float | None
    total_sold: float | None
    created_at: str


class CatalogListResponse(BaseModel):
    records: list[RecordOut]
    total: int
    page: int
    per_page: int


# ── Static routes first (must precede /{record_id}) ──────────────────────────

@router.get("/owned-release-ids")
async def owned_release_ids(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return user's owned releases for "already owned" detection in scan results.
    - release_ids: exact discogs_release_id matches (precise — same pressing)
    - owned: [{artist, title}] for fuzzy matching — catches "you own a different
      pressing/reissue of this album" since Discogs gives each pressing its own
      release_id but the user thinks of it as "the same record"
    """
    from sqlalchemy import select
    from models import Record
    result = await db.execute(
        select(Record.discogs_release_id, Record.artist, Record.title)
        .where(Record.user_id == user.id, Record.discogs_release_id.isnot(None))
    )
    rows = result.fetchall()
    ids = [row[0] for row in rows]
    owned = [{"artist": row[1], "title": row[2]} for row in rows if row[1] and row[2]]
    return {"release_ids": ids, "owned": owned}


@router.get("/settings/price-markup")
async def get_price_markup(user: User = Depends(get_current_user)):
    return {"price_markup_pct": user.price_markup_pct}


class PriceMarkupRequest(BaseModel):
    price_markup_pct: float | None = None


@router.put("/settings/price-markup")
async def set_price_markup(
    body: PriceMarkupRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.price_markup_pct is not None and not (-100 <= body.price_markup_pct <= 500):
        raise HTTPException(status_code=400, detail="Markup must be between -100 and 500 percent")
    result = await db.execute(select(User).where(User.id == user.id))
    db_user = result.scalar_one()
    db_user.price_markup_pct = body.price_markup_pct
    await db.commit()
    _set_credit_header(response, db_user)
    return {"price_markup_pct": db_user.price_markup_pct}


@router.get("/lots/list", response_model=list[LotOut])
async def list_lots(
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lots_result = await db.execute(
        select(Lot).where(Lot.user_id == user.id).order_by(Lot.created_at.desc())
    )
    lots = lots_result.scalars().all()

    lot_ids = [lot.id for lot in lots]
    stats: dict = {}
    if lot_ids:
        agg_result = await db.execute(
            select(
                Record.lot_id,
                func.count(Record.id).label("record_count"),
                func.count(case((Record.status == RecordStatus.in_stock, 1))).label("in_stock_count"),
                func.count(case((Record.status == RecordStatus.sold, 1))).label("sold_count"),
                func.sum(case((
                    and_(Record.status == RecordStatus.in_stock, Record.asking_price.isnot(None)),
                    Record.asking_price,
                ))).label("total_asking"),
                func.sum(case((
                    and_(Record.status == RecordStatus.sold, Record.sold_price.isnot(None)),
                    Record.sold_price,
                ))).label("total_sold"),
            )
            .where(Record.lot_id.in_(lot_ids))
            .group_by(Record.lot_id)
        )
        stats = {row.lot_id: row for row in agg_result}

    out = []
    for lot in lots:
        s = stats.get(lot.id)
        out.append(LotOut(
            id=lot.id,
            name=lot.name,
            purchase_price=lot.purchase_price,
            notes=lot.notes,
            record_count=s.record_count if s else 0,
            in_stock_count=s.in_stock_count if s else 0,
            sold_count=s.sold_count if s else 0,
            total_asking=float(s.total_asking) if s and s.total_asking is not None else None,
            total_sold=float(s.total_sold) if s and s.total_sold is not None else None,
            created_at=lot.created_at.isoformat(),
        ))

    _set_credit_header(response, user)
    return out


class CreateLotRequest(BaseModel):
    name: str
    purchase_price: float | None = None
    notes: str | None = None


@router.post("/lots", response_model=LotOut)
async def create_lot(
    body: CreateLotRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lot = Lot(user_id=user.id, name=body.name, purchase_price=body.purchase_price, notes=body.notes)
    db.add(lot)
    await db.commit()
    await db.refresh(lot)
    _set_credit_header(response, user)
    return LotOut(
        id=lot.id, name=lot.name, purchase_price=lot.purchase_price, notes=lot.notes,
        record_count=0, in_stock_count=0, sold_count=0,
        total_asking=None, total_sold=None, created_at=lot.created_at.isoformat(),
    )


@router.get("/lots/{lot_id}/summary")
async def lot_summary(
    lot_id: uuid.UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lot_result = await db.execute(select(Lot).where(Lot.id == lot_id, Lot.user_id == user.id))
    lot = lot_result.scalar_one_or_none()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    records_result = await db.execute(select(Record).where(Record.lot_id == lot_id))
    records = records_result.scalars().all()
    in_stock = [r for r in records if r.status == RecordStatus.in_stock]
    sold = [r for r in records if r.status == RecordStatus.sold]
    total_asking = sum(float(r.asking_price) for r in in_stock if r.asking_price is not None)
    total_sold_revenue = sum(float(r.sold_price) for r in sold if r.sold_price is not None)
    total_cost = sum(float(r.cost_price) for r in records if r.cost_price is not None)
    profit = total_sold_revenue - float(lot.purchase_price or 0) if sold else None
    unpriced_count = sum(1 for r in in_stock if r.asking_price is None)

    condition_order = ["M", "NM", "VG+", "VG", "G"]
    condition_breakdown: dict[str, int] = {}
    for r in in_stock:
        c = r.condition if isinstance(r.condition, str) else r.condition.value
        condition_breakdown[c] = condition_breakdown.get(c, 0) + 1

    _set_credit_header(response, user)
    return {
        "id": str(lot.id),
        "name": lot.name,
        "purchase_price": lot.purchase_price,
        "notes": lot.notes,
        "record_count": len(records),
        "in_stock_count": len(in_stock),
        "sold_count": len(sold),
        "total_asking": total_asking or None,
        "total_sold_revenue": total_sold_revenue or None,
        "total_cost": total_cost or None,
        "profit": profit,
        "unpriced_count": unpriced_count,
        "condition_breakdown": {c: condition_breakdown[c] for c in condition_order if c in condition_breakdown},
        "created_at": lot.created_at.isoformat(),
        "records": [RecordOut.from_orm_safe(r) for r in records],
    }


class ProrateRequest(BaseModel):
    purchase_price: float | None = None  # override lot.purchase_price if provided


@router.post("/lots/{lot_id}/prorate")
async def prorate_lot_cost(
    lot_id: uuid.UUID,
    body: ProrateRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Distribute lot purchase price evenly as cost_price across all records in the lot."""
    lot_result = await db.execute(select(Lot).where(Lot.id == lot_id, Lot.user_id == user.id))
    lot = lot_result.scalar_one_or_none()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    price = body.purchase_price if body.purchase_price is not None else lot.purchase_price
    if price is None:
        raise HTTPException(status_code=400, detail="No purchase price set on lot. Provide purchase_price in the request body.")

    if body.purchase_price is not None and body.purchase_price != lot.purchase_price:
        lot.purchase_price = body.purchase_price

    records_result = await db.execute(select(Record).where(Record.lot_id == lot_id))
    records = records_result.scalars().all()
    if not records:
        raise HTTPException(status_code=400, detail="Lot has no records to prorate")

    per_record = round(price / len(records), 2)
    for r in records:
        r.cost_price = per_record

    await db.commit()
    _set_credit_header(response, user)
    return {
        "ok": True,
        "purchase_price": price,
        "record_count": len(records),
        "cost_per_record": per_record,
    }


# ── Catalog stats ────────────────────────────────────────────────────────────

@router.get("/stats")
async def catalog_stats(
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from datetime import date, timedelta
    from sqlalchemy import cast, Date as SADate

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    # Counts
    total_in_stock = (await db.execute(
        select(func.count()).select_from(Record)
        .where(Record.user_id == user.id, Record.status == RecordStatus.in_stock)
    )).scalar_one() or 0

    total_sold = (await db.execute(
        select(func.count()).select_from(Record)
        .where(Record.user_id == user.id, Record.status == RecordStatus.sold)
    )).scalar_one() or 0

    # Revenue totals
    total_revenue = (await db.execute(
        select(func.sum(Record.sold_price)).where(
            Record.user_id == user.id, Record.status == RecordStatus.sold
        )
    )).scalar_one() or 0.0

    # Revenue this month
    revenue_this_month = (await db.execute(
        select(func.sum(Record.sold_price)).where(
            Record.user_id == user.id,
            Record.status == RecordStatus.sold,
            cast(Record.sold_at, SADate) >= month_start,
        )
    )).scalar_one() or 0.0

    # Revenue this week
    revenue_this_week = (await db.execute(
        select(func.sum(Record.sold_price)).where(
            Record.user_id == user.id,
            Record.status == RecordStatus.sold,
            cast(Record.sold_at, SADate) >= week_start,
        )
    )).scalar_one() or 0.0

    # Revenue today
    revenue_today = (await db.execute(
        select(func.sum(Record.sold_price)).where(
            Record.user_id == user.id,
            Record.status == RecordStatus.sold,
            cast(Record.sold_at, SADate) == today,
        )
    )).scalar_one() or 0.0

    # Inventory value (asking prices for in-stock)
    inventory_value = (await db.execute(
        select(func.sum(Record.asking_price)).where(
            Record.user_id == user.id,
            Record.status == RecordStatus.in_stock,
            Record.asking_price.isnot(None),
        )
    )).scalar_one() or 0.0

    # Total cost invested
    total_cost = (await db.execute(
        select(func.sum(Record.cost_price)).where(
            Record.user_id == user.id,
            Record.cost_price.isnot(None),
        )
    )).scalar_one() or 0.0

    # Avg margin % (where both cost and sold_price known)
    margin_result = await db.execute(
        select(Record.cost_price, Record.sold_price).where(
            Record.user_id == user.id,
            Record.status == RecordStatus.sold,
            Record.cost_price.isnot(None),
            Record.sold_price.isnot(None),
            Record.cost_price > 0,
        )
    )
    margins = [
        (float(r.sold_price) - float(r.cost_price)) / float(r.cost_price) * 100
        for r in margin_result.all()
    ]
    avg_margin = sum(margins) / len(margins) if margins else None

    # Added this month
    added_this_month = (await db.execute(
        select(func.count()).select_from(Record)
        .where(
            Record.user_id == user.id,
            cast(Record.created_at, SADate) >= month_start,
        )
    )).scalar_one() or 0

    # Recent sold records (today)
    recent_sold = (await db.execute(
        select(Record.artist, Record.title, Record.sold_price, Record.sold_at)
        .where(
            Record.user_id == user.id,
            Record.status == RecordStatus.sold,
            cast(Record.sold_at, SADate) == today,
        )
        .order_by(Record.sold_at.desc())
        .limit(5)
    )).all()

    # Daily revenue last 7 days
    seven_days_ago = today - timedelta(days=6)
    daily_rows = (await db.execute(
        select(cast(Record.sold_at, SADate).label("day"), func.sum(Record.sold_price).label("rev"))
        .where(
            Record.user_id == user.id,
            Record.status == RecordStatus.sold,
            cast(Record.sold_at, SADate) >= seven_days_ago,
            Record.sold_price.isnot(None),
        )
        .group_by(cast(Record.sold_at, SADate))
    )).all()
    daily_map = {str(r.day): float(r.rev) for r in daily_rows}
    daily_revenue_7d = [
        {"date": str(today - timedelta(days=i)), "revenue": daily_map.get(str(today - timedelta(days=i)), 0.0)}
        for i in range(6, -1, -1)
    ]

    _set_credit_header(response, user)
    return {
        "total_in_stock": total_in_stock,
        "total_sold": total_sold,
        "total_revenue": float(total_revenue),
        "revenue_today": float(revenue_today),
        "revenue_this_week": float(revenue_this_week),
        "revenue_this_month": float(revenue_this_month),
        "inventory_value": float(inventory_value),
        "total_cost": float(total_cost),
        "avg_margin_pct": round(avg_margin, 1) if avg_margin is not None else None,
        "added_this_month": added_this_month,
        "daily_revenue_7d": daily_revenue_7d,
        "recent_sales_today": [
            {
                "artist": r.artist,
                "title": r.title,
                "sold_price": float(r.sold_price) if r.sold_price else None,
                "sold_at": r.sold_at.isoformat() if r.sold_at else None,
            }
            for r in recent_sold
        ],
    }


# ── Manual record creation ────────────────────────────────────────────────────

class CreateRecordRequest(BaseModel):
    artist: str | None = None
    title: str | None = None
    year: int | None = None
    label: str | None = None
    catalog_number: str | None = None
    format: str | None = None
    genre: str | None = None
    country: str | None = None
    condition: str = "VG+"
    disc_condition: str | None = None
    cover_condition: str | None = None
    lot_id: uuid.UUID | None = None
    cost_price: float | None = None
    asking_price: float | None = None
    discogs_release_id: int | None = None
    tags: str | None = None
    notes: str | None = None
    record_section: str = "vinyl"


@router.post("", response_model=RecordOut, status_code=201)
async def create_record(
    body: CreateRecordRequest,
    background_tasks: BackgroundTasks,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    valid = {e.value for e in RecordCondition}
    if body.condition not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid condition. Use one of: {sorted(valid)}")

    record = Record(
        user_id=user.id,
        lot_id=body.lot_id,
        artist=body.artist,
        title=body.title,
        year=body.year,
        label=body.label,
        catalog_number=body.catalog_number,
        format=body.format,
        genre=body.genre,
        country=body.country,
        condition=body.condition,
        disc_condition=body.disc_condition,
        cover_condition=body.cover_condition,
        cost_price=body.cost_price,
        asking_price=body.asking_price,
        discogs_release_id=body.discogs_release_id,
        tags=body.tags,
        notes=body.notes,
        record_section=body.record_section or "vinyl",
    )
    db.add(record)
    await db.flush()  # assign record.id before FK reference in _log
    title_str = f"{body.artist or ''} – {body.title or ''}".strip(" –") or "Record"
    await _log(db, record.id, "added", f"Added to catalog: {title_str}")
    await db.commit()
    await db.refresh(record)
    _set_credit_header(response, user)

    # Auto-push to Discogs collection in background (fire-and-forget)
    if body.discogs_release_id and user.discogs_oauth_token:
        record_id = record.id
        release_id = body.discogs_release_id
        username = user.discogs_username
        from middleware.auth_middleware import decrypt
        from services import discogs as discogs_svc

        tok = decrypt(user.discogs_oauth_token)
        sec = decrypt(user.discogs_oauth_token_secret)

        async def _push_to_discogs():
            try:
                from database import AsyncSessionLocal
                data = await discogs_svc.add_to_collection(username, release_id, tok, sec)
                instance_id = data.get("instance_id")
                async with AsyncSessionLocal() as sess:
                    from sqlalchemy import select as _select
                    res = await sess.execute(_select(Record).where(Record.id == record_id))
                    rec = res.scalar_one_or_none()
                    if rec:
                        rec.discogs_instance_id = instance_id
                        rec.discogs_synced = True
                        await sess.commit()
            except Exception as exc:
                logger.warning("Auto-push to Discogs failed for record %s: %s", record_id, exc)

        background_tasks.add_task(_push_to_discogs)

    return RecordOut.from_orm_safe(record)


# ── Delete record ─────────────────────────────────────────────────────────────

@router.delete("/{record_id}", status_code=204)
async def delete_record(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Record).where(Record.id == record_id, Record.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    await db.delete(record)
    await db.commit()


# ── Catalog list ──────────────────────────────────────────────────────────────

@router.get("", response_model=CatalogListResponse)
async def list_catalog(
    response: Response,
    page: int = Query(1, ge=1),
    per_page: int = Query(40, ge=1, le=200),
    status: Literal["in_stock", "sold", "all"] = Query("in_stock"),
    lot_id: uuid.UUID | None = Query(None),
    no_lot: bool = Query(False),
    no_discogs: bool = Query(False),
    search: str | None = Query(None),
    genre: str | None = Query(None),
    format: str | None = Query(None),
    condition: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(Record).where(Record.user_id == user.id)
    if no_discogs:
        q = q.where(Record.discogs_release_id.is_(None))
    elif status != "all":
        q = q.where(Record.status == RecordStatus(status))
    if no_lot:
        q = q.where(Record.lot_id.is_(None))
    elif lot_id is not None:
        q = q.where(Record.lot_id == lot_id)
    if search:
        term = f"%{search}%"
        q = q.where(Record.artist.ilike(term) | Record.title.ilike(term))
    if genre:
        q = q.where(Record.genre == genre)
    if format:
        q = q.where(Record.format == format)
    if condition:
        q = q.where(Record.condition == condition)

    count_q = select(func.count()).select_from(q.subquery())
    total_result = await db.execute(count_q)
    total = total_result.scalar_one()

    q = q.order_by(Record.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(q)
    records = result.scalars().all()

    _set_credit_header(response, user)
    return CatalogListResponse(
        records=[RecordOut.from_orm_safe(r) for r in records],
        total=total, page=page, per_page=per_page,
    )


# ── Parameterized record routes (after all static routes) ────────────────────

@router.get("/{record_id}", response_model=RecordOut)
async def get_record(
    record_id: uuid.UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Record).where(Record.id == record_id, Record.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    _set_credit_header(response, user)
    return RecordOut.from_orm_safe(record)


class UpdateRecordRequest(BaseModel):
    artist: str | None = None
    title: str | None = None
    year: int | None = None
    label: str | None = None
    catalog_number: str | None = None
    format: str | None = None
    genre: str | None = None
    country: str | None = None
    condition: str | None = None
    disc_condition: str | None = None
    cover_condition: str | None = None
    lot_id: uuid.UUID | None = None
    cost_price: float | None = None
    asking_price: float | None = None
    tags: str | None = None
    notes: str | None = None
    store_listed: bool | None = None
    record_section: str | None = None
    tracklist: list[dict] | None = None


@router.patch("/{record_id}", response_model=RecordOut)
async def update_record(
    record_id: uuid.UUID,
    body: UpdateRecordRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Record).where(Record.id == record_id, Record.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    # Capture old values for history logging
    old_price = record.asking_price
    old_condition = record.condition if isinstance(record.condition, str) else record.condition.value
    old_lot = record.lot_id
    old_store_listed = record.store_listed

    simple_fields = ["artist", "title", "year", "label", "catalog_number", "format",
                     "genre", "styles", "country", "cost_price", "asking_price", "tags", "notes", "store_listed",
                     "record_section", "disc_condition", "cover_condition", "tracklist"]
    for field in simple_fields:
        if field in body.model_fields_set:
            setattr(record, field, getattr(body, field))

    if body.condition is not None:
        valid = {e.value for e in RecordCondition}
        if body.condition not in valid:
            raise HTTPException(status_code=400, detail=f"Invalid condition. Use one of: {sorted(valid)}")
        record.condition = body.condition
    if "lot_id" in body.model_fields_set:
        record.lot_id = body.lot_id

    # Log meaningful changes
    if "asking_price" in body.model_fields_set and body.asking_price != old_price:
        old_str = f"${float(old_price):.2f}" if old_price is not None else "unpriced"
        new_str = f"${float(body.asking_price):.2f}" if body.asking_price is not None else "removed"
        await _log(db, record.id, "price_changed", f"Price: {old_str} → {new_str}")
    if body.condition is not None and body.condition != old_condition:
        await _log(db, record.id, "condition_changed", f"Condition: {old_condition} → {body.condition}")
    if "lot_id" in body.model_fields_set and body.lot_id != old_lot:
        await _log(db, record.id, "lot_changed", "Moved to different lot" if body.lot_id else "Removed from lot")
    if "store_listed" in body.model_fields_set and body.store_listed != old_store_listed:
        await _log(db, record.id, "store_listed", "Listed in store" if body.store_listed else "Removed from store")

    await db.commit()
    await db.refresh(record)

    # Sync price to Discogs marketplace if the record is listed and asking_price changed
    if (
        "asking_price" in body.model_fields_set
        and getattr(record, "discogs_listing_id", None)
        and record.asking_price
        and user.discogs_oauth_token
    ):
        try:
            token = decrypt(user.discogs_oauth_token)
            secret = decrypt(user.discogs_oauth_token_secret)
            condition = record.condition if isinstance(record.condition, str) else record.condition.value
            await discogs_svc.update_listing(
                record.discogs_listing_id, float(record.asking_price), condition, token, secret
            )
        except Exception as exc:
            logger.warning("Failed to sync price to Discogs listing %s: %s", record.discogs_listing_id, exc)

    _set_credit_header(response, user)
    return RecordOut.from_orm_safe(record)


class SellRequest(BaseModel):
    sold_price: float
    payment_method: str | None = None  # cash | card | transfer


@router.post("/{record_id}/sell", response_model=RecordOut)
async def sell_record(
    record_id: uuid.UUID,
    body: SellRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Record).where(Record.id == record_id, Record.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if record.status == RecordStatus.sold:
        raise HTTPException(status_code=400, detail="Record already marked as sold")

    listing_id = getattr(record, "discogs_listing_id", None)
    record.status = RecordStatus.sold
    record.sold_price = body.sold_price
    record.sold_at = datetime.now(timezone.utc)
    record.payment_method = body.payment_method
    record.discogs_listing_id = None

    if getattr(record, "consignor_id", None) and getattr(record, "consignor_commission_pct", None) is not None:
        owed = body.sold_price * (record.consignor_commission_pct / 100)
        record.consignor_amount_owed = owed
        record.consignor_payout_status = "pending"

    await _log(db, record.id, "sold", f"Sold for ${body.sold_price:.2f}")
    await db.commit()
    await db.refresh(record)

    # Remove Discogs marketplace listing when sold
    if listing_id and user.discogs_oauth_token:
        try:
            token = decrypt(user.discogs_oauth_token)
            secret = decrypt(user.discogs_oauth_token_secret)
            await discogs_svc.delete_listing(listing_id, token, secret)
        except Exception as exc:
            logger.warning("Failed to remove Discogs listing %s on sale: %s", listing_id, exc)

    _set_credit_header(response, user)
    return RecordOut.from_orm_safe(record)


# ── Cancel sale (unsell) ──────────────────────────────────────────────────────

@router.post("/{record_id}/unsell", response_model=RecordOut)
async def unsell_record(
    record_id: uuid.UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Record).where(Record.id == record_id, Record.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if record.status != RecordStatus.sold:
        raise HTTPException(status_code=400, detail="Record is not sold")

    record.status = RecordStatus.in_stock
    record.sold_price = None
    record.sold_at = None
    record.payment_method = None
    if getattr(record, "consignor_payout_status", None) == "pending":
        record.consignor_amount_owed = None
        record.consignor_payout_status = None

    await _log(db, record.id, "unsold", "Sale cancelled")
    await db.commit()
    await db.refresh(record)

    _set_credit_header(response, user)
    return RecordOut.from_orm_safe(record)


# ── Record history ─────────────────────────────────────────────────────────────

class RecordEventOut(BaseModel):
    id: int
    event_type: str
    detail: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class FindDiscogsRequest(BaseModel):
    artist: str | None = None
    title: str | None = None
    label: str | None = None
    catalog_number: str | None = None


class LinkDiscogsRequest(BaseModel):
    release_id: int


@router.post("/{record_id}/find-discogs", response_model=ResearchResponse)
async def find_discogs_for_record(
    record_id: uuid.UUID,
    body: FindDiscogsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Search Discogs for a matching release for an unlinked catalog record."""
    if not user.discogs_oauth_token or not user.discogs_username:
        raise HTTPException(status_code=403, detail="Discogs account not connected")

    result = await db.execute(
        select(Record).where(Record.id == record_id, Record.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    artist = body.artist or record.artist or ""
    title = body.title or record.title or ""
    token = decrypt(user.discogs_oauth_token)
    secret = decrypt(user.discogs_oauth_token_secret)

    raw_results, _internal_confidence = await discogs_svc.search_releases(
        artist=artist,
        title=title,
        access_token=token,
        access_token_secret=secret,
        label=body.label or record.label,
        catalog_number=body.catalog_number or record.catalog_number,
    )
    matches_data = discogs_svc.parse_search_results(raw_results)
    matches = [DiscogsMatch(**m) for m in matches_data]
    return ResearchResponse(
        artist=artist,
        title=title,
        label=body.label or record.label,
        catalog_number=body.catalog_number or record.catalog_number,
        matches=matches,
    )


@router.patch("/{record_id}/link-discogs", response_model=RecordOut)
async def link_discogs_to_record(
    record_id: uuid.UUID,
    body: LinkDiscogsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Link a Discogs release to a catalog record."""
    result = await db.execute(
        select(Record).where(Record.id == record_id, Record.user_id == user.id)
    )
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    record.discogs_release_id = body.release_id
    await _log(db, record.id, "linked_discogs", f"Linked to Discogs release {body.release_id}")
    await db.commit()
    await db.refresh(record)
    return RecordOut.from_orm_safe(record)


@router.get("/export/csv")
async def export_csv(
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(Record).where(Record.user_id == user.id)
    if status in ("in_stock", "sold"):
        q = q.where(Record.status == status)
    q = q.order_by(Record.created_at.desc())
    result = await db.execute(q)
    records = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "artist", "title", "year", "label", "format", "condition",
        "disc_condition", "cover_condition",
        "genre", "styles", "country", "status",
        "cost_price", "asking_price", "sold_price", "sold_at",
        "discogs_release_id", "tags", "notes", "created_at",
    ])
    for r in records:
        writer.writerow([
            str(r.id), r.artist, r.title, r.year, r.label, r.format, r.condition,
            getattr(r, "disc_condition", None), getattr(r, "cover_condition", None),
            r.genre, r.styles, r.country, r.status.value if r.status else "",
            r.cost_price, r.asking_price, r.sold_price,
            r.sold_at.isoformat() if r.sold_at else "",
            r.discogs_release_id, r.tags, r.notes,
            r.created_at.isoformat() if r.created_at else "",
        ])

    output.seek(0)
    filename = f"vinylscan-catalog-{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{record_id}/history", response_model=list[RecordEventOut])
async def record_history(
    record_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Record).where(Record.id == record_id, Record.user_id == user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Record not found")

    events = await db.execute(
        select(RecordEvent)
        .where(RecordEvent.record_id == record_id)
        .order_by(RecordEvent.created_at.asc())
    )
    return events.scalars().all()

import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Lot, Record, RecordCondition, RecordStatus, User
from routers.auth import get_current_user
from routers.scan import _set_credit_header

router = APIRouter(prefix="/catalog", tags=["catalog"])


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
    country: str | None
    condition: str
    discogs_release_id: int | None
    discogs_instance_id: int | None
    discogs_synced: bool
    discogs_url: str | None
    cover_image_url: str | None
    status: str
    cost_price: float | None
    asking_price: float | None
    sold_price: float | None
    sold_at: str | None
    tags: str | None
    notes: str | None
    created_at: str

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
            country=getattr(r, "country", None),
            condition=r.condition,
            discogs_release_id=r.discogs_release_id,
            discogs_instance_id=getattr(r, "discogs_instance_id", None),
            discogs_synced=getattr(r, "discogs_synced", False) or False,
            discogs_url=r.discogs_url,
            cover_image_url=getattr(r, "cover_image_url", None),
            status=r.status.value if hasattr(r.status, "value") else r.status,
            cost_price=float(r.cost_price) if getattr(r, "cost_price", None) is not None else None,
            asking_price=float(r.asking_price) if r.asking_price is not None else None,
            sold_price=float(r.sold_price) if r.sold_price is not None else None,
            sold_at=r.sold_at.isoformat() if r.sold_at else None,
            tags=getattr(r, "tags", None),
            notes=getattr(r, "notes", None),
            created_at=r.created_at.isoformat(),
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
    profit = total_sold_revenue - (lot.purchase_price or 0) if sold else None

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
        "profit": profit,
        "created_at": lot.created_at.isoformat(),
        "records": [RecordOut.from_orm_safe(r) for r in records],
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
    lot_id: uuid.UUID | None = None
    cost_price: float | None = None
    asking_price: float | None = None
    discogs_release_id: int | None = None
    tags: str | None = None
    notes: str | None = None


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
        cost_price=body.cost_price,
        asking_price=body.asking_price,
        discogs_release_id=body.discogs_release_id,
        tags=body.tags,
        notes=body.notes,
    )
    db.add(record)
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
    search: str | None = Query(None),
    genre: str | None = Query(None),
    format: str | None = Query(None),
    condition: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(Record).where(Record.user_id == user.id)
    if status != "all":
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
    lot_id: uuid.UUID | None = None
    cost_price: float | None = None
    asking_price: float | None = None
    tags: str | None = None
    notes: str | None = None


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

    simple_fields = ["artist", "title", "year", "label", "catalog_number", "format",
                     "genre", "country", "cost_price", "asking_price", "tags", "notes"]
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

    await db.commit()
    await db.refresh(record)
    _set_credit_header(response, user)
    return RecordOut.from_orm_safe(record)


class SellRequest(BaseModel):
    sold_price: float


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

    record.status = RecordStatus.sold
    record.sold_price = body.sold_price
    record.sold_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(record)
    _set_credit_header(response, user)
    return RecordOut.from_orm_safe(record)

import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import func, select
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
    condition: str
    discogs_release_id: int | None
    discogs_url: str | None
    status: str
    asking_price: float | None
    sold_price: float | None
    sold_at: str | None
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
            condition=r.condition,
            discogs_release_id=r.discogs_release_id,
            discogs_url=r.discogs_url,
            status=r.status.value if hasattr(r.status, "value") else r.status,
            asking_price=float(r.asking_price) if r.asking_price is not None else None,
            sold_price=float(r.sold_price) if r.sold_price is not None else None,
            sold_at=r.sold_at.isoformat() if r.sold_at else None,
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

    out = []
    for lot in lots:
        records_result = await db.execute(select(Record).where(Record.lot_id == lot.id))
        records = records_result.scalars().all()
        in_stock = [r for r in records if r.status == RecordStatus.in_stock]
        sold = [r for r in records if r.status == RecordStatus.sold]
        out.append(LotOut(
            id=lot.id,
            name=lot.name,
            purchase_price=lot.purchase_price,
            notes=lot.notes,
            record_count=len(records),
            in_stock_count=len(in_stock),
            sold_count=len(sold),
            total_asking=sum(float(r.asking_price) for r in in_stock if r.asking_price is not None) or None,
            total_sold=sum(float(r.sold_price) for r in sold if r.sold_price is not None) or None,
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
    asking_price: float | None = None
    condition: str | None = None
    lot_id: uuid.UUID | None = None


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

    if body.asking_price is not None:
        record.asking_price = body.asking_price
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

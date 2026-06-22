"""
Consignment module — track records left by third parties for sale on commission.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Consignor, Record, RecordEvent, RecordStatus, User
from routers.auth import get_current_user
from routers.scan import _set_credit_header

router = APIRouter(prefix="/consignments", tags=["consignments"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ConsignorOut(BaseModel):
    id: int
    name: str
    contact: str | None
    default_commission_pct: float
    notes: str | None
    created_at: str
    record_count: int = 0
    on_floor_count: int = 0
    sold_count: int = 0
    total_owed: float = 0.0
    total_paid: float = 0.0

    model_config = {"from_attributes": True}


class CreateConsignorRequest(BaseModel):
    name: str
    contact: str | None = None
    default_commission_pct: float = 30.0
    notes: str | None = None


class UpdateConsignorRequest(BaseModel):
    name: str | None = None
    contact: str | None = None
    default_commission_pct: float | None = None
    notes: str | None = None


class AssignConsignorRequest(BaseModel):
    consignor_id: int | None
    consignor_agreed_price: float | None = None
    consignor_commission_pct: float | None = None


class MarkPaidRequest(BaseModel):
    record_ids: list[str]


class ConsignedRecordOut(BaseModel):
    id: str
    artist: str | None
    title: str | None
    year: int | None
    label: str | None
    condition: str
    asking_price: float | None
    status: str
    consignor_id: int | None
    consignor_agreed_price: float | None
    consignor_commission_pct: float | None
    consignor_payout_status: str | None
    consignor_amount_owed: float | None
    consignor_amount_paid: float | None
    consigned_at: str | None
    sold_price: float | None
    sold_at: str | None
    cover_image_url: str | None
    created_at: str


# ── Consignor CRUD ────────────────────────────────────────────────────────────

@router.get("/consignors", response_model=list[ConsignorOut])
async def list_consignors(
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Consignor).where(Consignor.user_id == user.id).order_by(Consignor.name)
    )
    consignors = result.scalars().all()

    # Aggregate stats per consignor
    if consignors:
        cids = [c.id for c in consignors]
        agg = await db.execute(
            select(
                Record.consignor_id,
                func.count(Record.id).label("record_count"),
                func.count(Record.id).filter(Record.status == RecordStatus.in_stock).label("on_floor"),
                func.count(Record.id).filter(Record.status == RecordStatus.sold).label("sold"),
                func.coalesce(func.sum(Record.consignor_amount_owed.cast(type_=None)), 0).label("total_owed"),
                func.coalesce(func.sum(Record.consignor_amount_paid.cast(type_=None)), 0).label("total_paid"),
            )
            .where(Record.consignor_id.in_(cids), Record.user_id == user.id)
            .group_by(Record.consignor_id)
        )
        stats = {row.consignor_id: row for row in agg}
    else:
        stats = {}

    out = []
    for c in consignors:
        s = stats.get(c.id)
        out.append(ConsignorOut(
            id=c.id,
            name=c.name,
            contact=c.contact,
            default_commission_pct=c.default_commission_pct,
            notes=c.notes,
            created_at=c.created_at.isoformat(),
            record_count=s.record_count if s else 0,
            on_floor_count=s.on_floor if s else 0,
            sold_count=s.sold if s else 0,
            total_owed=float(s.total_owed) if s else 0.0,
            total_paid=float(s.total_paid) if s else 0.0,
        ))

    _set_credit_header(response, user)
    return out


@router.post("/consignors", response_model=ConsignorOut, status_code=201)
async def create_consignor(
    body: CreateConsignorRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = Consignor(
        user_id=user.id,
        name=body.name,
        contact=body.contact,
        default_commission_pct=body.default_commission_pct,
        notes=body.notes,
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    _set_credit_header(response, user)
    return ConsignorOut(
        id=c.id, name=c.name, contact=c.contact, default_commission_pct=c.default_commission_pct,
        notes=c.notes, created_at=c.created_at.isoformat(),
    )


@router.patch("/consignors/{consignor_id}", response_model=ConsignorOut)
async def update_consignor(
    consignor_id: int,
    body: UpdateConsignorRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Consignor).where(Consignor.id == consignor_id, Consignor.user_id == user.id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Consignor not found")
    for field in ("name", "contact", "default_commission_pct", "notes"):
        val = getattr(body, field)
        if val is not None:
            setattr(c, field, val)
    await db.commit()
    await db.refresh(c)
    _set_credit_header(response, user)
    return ConsignorOut(
        id=c.id, name=c.name, contact=c.contact, default_commission_pct=c.default_commission_pct,
        notes=c.notes, created_at=c.created_at.isoformat(),
    )


@router.delete("/consignors/{consignor_id}", status_code=204)
async def delete_consignor(
    consignor_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Consignor).where(Consignor.id == consignor_id, Consignor.user_id == user.id))
    c = result.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Consignor not found")
    await db.delete(c)
    await db.commit()


# ── Consigned records ─────────────────────────────────────────────────────────

def _record_out(r: Record) -> ConsignedRecordOut:
    return ConsignedRecordOut(
        id=str(r.id),
        artist=r.artist,
        title=r.title,
        year=r.year,
        label=r.label,
        condition=r.condition if isinstance(r.condition, str) else r.condition.value,
        asking_price=float(r.asking_price) if r.asking_price is not None else None,
        status=r.status.value if hasattr(r.status, "value") else r.status,
        consignor_id=r.consignor_id,
        consignor_agreed_price=float(r.consignor_agreed_price) if r.consignor_agreed_price is not None else None,
        consignor_commission_pct=r.consignor_commission_pct,
        consignor_payout_status=r.consignor_payout_status,
        consignor_amount_owed=float(r.consignor_amount_owed) if r.consignor_amount_owed is not None else None,
        consignor_amount_paid=float(r.consignor_amount_paid) if r.consignor_amount_paid is not None else None,
        consigned_at=r.consigned_at.isoformat() if r.consigned_at else None,
        sold_price=float(r.sold_price) if r.sold_price is not None else None,
        sold_at=r.sold_at.isoformat() if r.sold_at else None,
        cover_image_url=getattr(r, "cover_image_url", None),
        created_at=r.created_at.isoformat(),
    )


@router.get("/records", response_model=list[ConsignedRecordOut])
async def list_consigned_records(
    consignor_id: int | None = None,
    status: str | None = None,
    response: Response = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(Record).where(
        Record.user_id == user.id,
        Record.consignor_id.isnot(None),
    )
    if consignor_id:
        q = q.where(Record.consignor_id == consignor_id)
    if status in ("in_stock", "sold"):
        q = q.where(Record.status == RecordStatus(status))
    q = q.order_by(Record.created_at.desc())
    result = await db.execute(q)
    records = result.scalars().all()
    if response:
        _set_credit_header(response, user)
    return [_record_out(r) for r in records]


@router.post("/records/{record_id}/assign", response_model=ConsignedRecordOut)
async def assign_consignor(
    record_id: uuid.UUID,
    body: AssignConsignorRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Record).where(Record.id == record_id, Record.user_id == user.id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")

    if body.consignor_id is not None:
        c_result = await db.execute(select(Consignor).where(Consignor.id == body.consignor_id, Consignor.user_id == user.id))
        if not c_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Consignor not found")

    record.consignor_id = body.consignor_id
    record.consignor_agreed_price = body.consignor_agreed_price
    commission = body.consignor_commission_pct

    if body.consignor_id and commission is None:
        c_result2 = await db.execute(select(Consignor).where(Consignor.id == body.consignor_id))
        c = c_result2.scalar_one_or_none()
        if c:
            commission = c.default_commission_pct

    record.consignor_commission_pct = commission
    if body.consignor_id:
        record.consigned_at = record.consigned_at or datetime.now(timezone.utc)
    else:
        record.consigned_at = None
        record.consignor_payout_status = None
        record.consignor_amount_owed = None
        record.consignor_amount_paid = None

    db.add(RecordEvent(record_id=record.id, event_type="consignor_assigned",
                       detail=f"consignor_id={body.consignor_id}" if body.consignor_id else "consignor removed"))
    await db.commit()
    await db.refresh(record)
    _set_credit_header(response, user)
    return _record_out(record)


@router.post("/records/{record_id}/mark-paid", response_model=ConsignedRecordOut)
async def mark_payout_paid(
    record_id: uuid.UUID,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Record).where(Record.id == record_id, Record.user_id == user.id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(status_code=404, detail="Record not found")
    if not record.consignor_id:
        raise HTTPException(status_code=400, detail="Record is not consigned")
    if record.consignor_payout_status == "paid":
        raise HTTPException(status_code=400, detail="Payout already marked as paid")

    record.consignor_amount_paid = record.consignor_amount_owed
    record.consignor_payout_status = "paid"
    record.consignor_paid_at = datetime.now(timezone.utc)
    db.add(RecordEvent(record_id=record.id, event_type="consignor_paid",
                       detail=f"Paid ${float(record.consignor_amount_owed or 0):.2f}"))
    await db.commit()
    await db.refresh(record)
    _set_credit_header(response, user)
    return _record_out(record)

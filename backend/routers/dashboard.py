from fastapi import APIRouter, Depends, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import CreditTransaction, Scan, ScanStatus, User
from routers.auth import get_current_user
from routers.scan import _set_credit_header
from schemas import CreditTransactionOut, DashboardStats

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats", response_model=DashboardStats)
async def get_stats(
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    total_scanned_result = await db.execute(
        select(func.count()).select_from(Scan).where(Scan.user_id == user.id)
    )
    total_scanned = total_scanned_result.scalar() or 0

    total_added_result = await db.execute(
        select(func.count())
        .select_from(Scan)
        .where(
            Scan.user_id == user.id,
            Scan.status.in_([ScanStatus.auto_added, ScanStatus.manually_added]),
        )
    )
    total_added = total_added_result.scalar() or 0

    recent_txns_result = await db.execute(
        select(CreditTransaction)
        .where(CreditTransaction.user_id == user.id)
        .order_by(CreditTransaction.created_at.desc())
        .limit(10)
    )
    recent_txns = recent_txns_result.scalars().all()

    _set_credit_header(response, user)
    return DashboardStats(
        total_scanned=total_scanned,
        total_added=total_added,
        credit_balance=user.credits,
        recent_transactions=[CreditTransactionOut.model_validate(t) for t in recent_txns],
    )

"""
Admin API — only accessible to users with is_admin=True.

Endpoints:
  GET  /admin/users                  — list all users
  GET  /admin/users/{id}             — user detail
  PATCH /admin/users/{id}            — update credits / display_name / is_active / is_admin
  POST /admin/users/{id}/reset-link  — generate password reset link (copy-paste)
  POST /admin/users/{id}/clear-discogs — force Discogs re-auth (clears tokens)

  GET  /admin/invites                — list all invites
  POST /admin/invites                — create invite
  DELETE /admin/invites/{id}         — revoke unused invite
"""
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Invite, PasswordResetToken, Record, Scan, User
from routers.auth import get_current_user

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

router = APIRouter(prefix="/admin", tags=["admin"])


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ── Schemas ────────────────────────────────────────────────────────────────────

class UserSummary(BaseModel):
    id: str
    email: str | None
    display_name: str | None
    discogs_username: str | None
    credits: int
    is_admin: bool
    is_active: bool
    created_at: datetime
    record_count: int
    scan_count: int
    last_discogs_sync: datetime | None

    model_config = {"from_attributes": True}


class UserPatch(BaseModel):
    display_name: str | None = None
    credits: int | None = None
    is_active: bool | None = None
    is_admin: bool | None = None


class InviteCreate(BaseModel):
    email: str
    note: str | None = None
    expires_days: int = 7


class InviteOut(BaseModel):
    id: str
    email: str
    note: str | None
    token: str
    invite_url: str
    used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Users ─────────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserSummary])
async def list_users(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()

    # Batch count records + scans per user
    rec_counts = dict(
        (await db.execute(
            select(Record.user_id, func.count(Record.id))
            .group_by(Record.user_id)
        )).all()
    )
    scan_counts = dict(
        (await db.execute(
            select(Scan.user_id, func.count(Scan.id))
            .group_by(Scan.user_id)
        )).all()
    )

    return [
        UserSummary(
            id=str(u.id),
            email=u.email,
            display_name=u.display_name,
            discogs_username=u.discogs_username,
            credits=u.credits,
            is_admin=u.is_admin,
            is_active=u.is_active,
            created_at=u.created_at,
            record_count=rec_counts.get(u.id, 0),
            scan_count=scan_counts.get(u.id, 0),
            last_discogs_sync=u.last_discogs_sync,
        )
        for u in users
    ]


@router.get("/users/{user_id}", response_model=UserSummary)
async def get_user(
    user_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    rec_count = (await db.execute(
        select(func.count(Record.id)).where(Record.user_id == user_id)
    )).scalar() or 0
    scan_count = (await db.execute(
        select(func.count(Scan.id)).where(Scan.user_id == user_id)
    )).scalar() or 0
    return UserSummary(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        discogs_username=user.discogs_username,
        credits=user.credits,
        is_admin=user.is_admin,
        is_active=user.is_active,
        created_at=user.created_at,
        record_count=rec_count,
        scan_count=scan_count,
        last_discogs_sync=user.last_discogs_sync,
    )


@router.patch("/users/{user_id}", response_model=UserSummary)
async def patch_user(
    user_id: uuid.UUID,
    body: UserPatch,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent removing the last admin
    if body.is_admin is False and user.is_admin:
        admin_count = (await db.execute(
            select(func.count(User.id)).where(User.is_admin.is_(True))
        )).scalar() or 0
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last admin")

    if body.display_name is not None:
        user.display_name = body.display_name
    if body.credits is not None:
        user.credits = max(0, body.credits)
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.is_admin is not None:
        user.is_admin = body.is_admin

    await db.commit()
    await db.refresh(user)

    rec_count = (await db.execute(
        select(func.count(Record.id)).where(Record.user_id == user_id)
    )).scalar() or 0
    scan_count = (await db.execute(
        select(func.count(Scan.id)).where(Scan.user_id == user_id)
    )).scalar() or 0
    return UserSummary(
        id=str(user.id), email=user.email, display_name=user.display_name,
        discogs_username=user.discogs_username, credits=user.credits,
        is_admin=user.is_admin, is_active=user.is_active, created_at=user.created_at,
        record_count=rec_count, scan_count=scan_count, last_discogs_sync=user.last_discogs_sync,
    )


@router.post("/users/{user_id}/reset-link")
async def generate_reset_link(
    user_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Generate a password reset link. Copy and send to the user manually."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.email:
        raise HTTPException(status_code=400, detail="User has no email address")

    # Invalidate previous unused tokens for this user
    prev = await db.execute(
        select(PasswordResetToken).where(
            PasswordResetToken.user_id == user_id,
            PasswordResetToken.used_at.is_(None),
        )
    )
    for old in prev.scalars().all():
        old.used_at = datetime.now(timezone.utc)  # mark as used/revoked

    token = secrets.token_urlsafe(32)
    prt = PasswordResetToken(
        user_id=user_id,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=48),
    )
    db.add(prt)
    await db.commit()

    reset_url = f"{FRONTEND_URL}/reset-password?token={token}"
    return {"reset_url": reset_url, "expires_in": "48 hours"}


@router.post("/users/{user_id}/clear-discogs")
async def clear_discogs_auth(
    user_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Force user to re-authenticate with Discogs (clears their OAuth tokens)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.discogs_oauth_token = None
    user.discogs_oauth_token_secret = None
    user.discogs_username = None
    await db.commit()
    return {"ok": True}


# ── Invites ────────────────────────────────────────────────────────────────────

@router.get("/invites", response_model=list[InviteOut])
async def list_invites(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Invite).order_by(Invite.created_at.desc()))
    invites = result.scalars().all()
    return [
        InviteOut(
            id=str(i.id),
            email=i.email,
            note=i.note,
            token=i.token,
            invite_url=f"{FRONTEND_URL}/register?token={i.token}",
            used_at=i.used_at,
            expires_at=i.expires_at,
            created_at=i.created_at,
        )
        for i in invites
    ]


@router.post("/invites", response_model=InviteOut, status_code=201)
async def create_invite(
    body: InviteCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    invite = Invite(
        email=body.email.lower().strip(),
        token=token,
        note=body.note,
        created_by=admin.id,
        expires_at=now + timedelta(days=body.expires_days),
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)
    return InviteOut(
        id=str(invite.id),
        email=invite.email,
        note=invite.note,
        token=invite.token,
        invite_url=f"{FRONTEND_URL}/register?token={invite.token}",
        used_at=invite.used_at,
        expires_at=invite.expires_at,
        created_at=invite.created_at,
    )


@router.delete("/invites/{invite_id}", status_code=204)
async def revoke_invite(
    invite_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Invite).where(Invite.id == invite_id))
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.used_at:
        raise HTTPException(status_code=400, detail="Cannot revoke a used invite")
    await db.delete(invite)
    await db.commit()

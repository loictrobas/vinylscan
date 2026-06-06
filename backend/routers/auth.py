import os
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from middleware.auth_middleware import create_access_token, decode_access_token, encrypt, decrypt
from models import User
from schemas import UserOut
from services import discogs as discogs_svc

router = APIRouter(prefix="/auth", tags=["auth"], redirect_slashes=False)

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"
DEV_CREDITS = 9999
FREE_MONTHLY_CREDITS = 5

# Temporary store for request tokens (in-memory; for production use Redis)
_request_token_store: dict[str, str] = {}


async def get_current_user(
    request: Request,
    access_token: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    # Accept Bearer token from Authorization header (cross-domain) or cookie (same-domain)
    token = access_token
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_id = decode_access_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled — contact support")
    return user


async def apply_monthly_topup(user: User, db: AsyncSession) -> bool:
    from models import CreditTransaction, CreditReason

    if DEV_MODE:
        if user.credits != DEV_CREDITS:
            user.credits = DEV_CREDITS
            await db.commit()
            await db.refresh(user)
        return False

    now = datetime.now(timezone.utc)
    current_month = now.strftime("%Y-%m")
    if user.last_free_topup_month != current_month and user.credits < FREE_MONTHLY_CREDITS:
        delta = FREE_MONTHLY_CREDITS - user.credits
        user.credits = FREE_MONTHLY_CREDITS
        user.last_free_topup_month = current_month
        txn = CreditTransaction(user_id=user.id, amount=delta, reason=CreditReason.free_topup)
        db.add(txn)
        await db.commit()
        await db.refresh(user)
        return True
    elif user.last_free_topup_month != current_month:
        user.last_free_topup_month = current_month
        await db.commit()
    return False


@router.get("/discogs/login")
async def discogs_login():
    callback_url = f"{BACKEND_URL}/auth/discogs/callback"
    try:
        request_token, request_token_secret = discogs_svc.get_request_token(callback_url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Discogs OAuth error: {e}")
    _request_token_store[request_token] = request_token_secret
    authorize_url = f"{discogs_svc.AUTHORIZE_URL}?oauth_token={request_token}"
    return RedirectResponse(url=authorize_url)


@router.get("/discogs/callback")
async def discogs_callback(
    oauth_token: str,
    oauth_verifier: str,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    token_secret = _request_token_store.pop(oauth_token, None)
    if not token_secret:
        raise HTTPException(status_code=400, detail="Invalid OAuth token")

    try:
        access_token, access_token_secret = discogs_svc.get_access_token(
            oauth_token, token_secret, oauth_verifier
        )
        identity = discogs_svc.get_identity(access_token, access_token_secret)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Discogs OAuth exchange error: {e}")

    username = identity.get("username")
    if not username:
        raise HTTPException(status_code=502, detail="Could not get Discogs username")

    # upsert user
    result = await db.execute(select(User).where(User.discogs_username == username))
    user = result.scalar_one_or_none()

    encrypted_token = encrypt(access_token)
    encrypted_secret = encrypt(access_token_secret)

    if user is None:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        user = User(
            discogs_username=username,
            discogs_oauth_token=encrypted_token,
            discogs_oauth_token_secret=encrypted_secret,
            credits=DEV_CREDITS if DEV_MODE else FREE_MONTHLY_CREDITS,
            last_free_topup_month=now.strftime("%Y-%m"),
        )
        db.add(user)
    else:
        user.discogs_oauth_token = encrypted_token
        user.discogs_oauth_token_secret = encrypted_secret

    await db.commit()
    await db.refresh(user)

    # apply monthly topup on login
    await apply_monthly_topup(user, db)

    jwt_token = create_access_token(str(user.id))
    # Cross-domain: pass token in URL so frontend (vercel.app) can store it.
    # httpOnly cookie set on onrender.com would be silently dropped by browser.
    return RedirectResponse(url=f"{FRONTEND_URL}/dashboard?token={jwt_token}")


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    return {"ok": True}


@router.get("/logout")
async def logout_get():
    """GET logout for simple link-based logout from frontend."""
    response = RedirectResponse(url=FRONTEND_URL)
    response.delete_cookie("access_token")
    return response


# ── Email / password auth ─────────────────────────────────────────────────────

import secrets
from datetime import timedelta
from pydantic import BaseModel as _BM

from models import Invite, PasswordResetToken

FRONTEND_URL_FOR_RESET = os.getenv("FRONTEND_URL", "http://localhost:3000")


def _hash_password(password: str) -> str:
    import hashlib, binascii
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 260_000)
    return binascii.hexlify(salt).decode() + ":" + binascii.hexlify(dk).decode()


def _verify_password(password: str, stored: str) -> bool:
    import hashlib, binascii
    try:
        salt_hex, dk_hex = stored.split(":")
        salt = binascii.unhexlify(salt_hex)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 260_000)
        return binascii.hexlify(dk).decode() == dk_hex
    except Exception:
        return False


class EmailLoginRequest(_BM):
    email: str
    password: str


class RegisterRequest(_BM):
    token: str
    password: str
    display_name: str | None = None


class ChangePasswordRequest(_BM):
    current_password: str
    new_password: str


class ResetPasswordRequest(_BM):
    token: str
    new_password: str


@router.post("/login")
async def email_login(
    body: EmailLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == body.email.lower().strip()))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not _verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled — contact support")
    token = create_access_token(str(user.id))
    response.set_cookie(
        "access_token", token,
        httponly=True, secure=True, samesite="lax",
        max_age=60 * 60 * 24 * 30,
    )
    return {"ok": True, "user_id": str(user.id), "is_admin": user.is_admin}


@router.post("/register")
async def register_via_invite(
    body: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    result = await db.execute(select(Invite).where(Invite.token == body.token))
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found or already used")
    if invite.used_at is not None:
        raise HTTPException(status_code=400, detail="Invite already used")
    if invite.expires_at and invite.expires_at < now:
        raise HTTPException(status_code=400, detail="Invite expired")

    # Email must not already exist
    existing = await db.execute(select(User).where(User.email == invite.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    user = User(
        email=invite.email.lower(),
        password_hash=_hash_password(body.password),
        display_name=body.display_name or invite.email.split("@")[0],
        is_active=True,
        is_admin=False,
        credits=5,
        last_free_topup_month="",
    )
    db.add(user)
    await db.flush()

    invite.used_at = now
    invite.used_by = user.id
    await db.commit()
    await db.refresh(user)

    token = create_access_token(str(user.id))
    response.set_cookie(
        "access_token", token,
        httponly=True, secure=True, samesite="lax",
        max_age=60 * 60 * 24 * 30,
    )
    return {"ok": True, "user_id": str(user.id)}


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not user.password_hash or not _verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    user.password_hash = _hash_password(body.new_password)
    await db.commit()
    return {"ok": True}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token == body.token)
    )
    prt = result.scalar_one_or_none()
    if not prt or prt.used_at or prt.expires_at < now:
        raise HTTPException(status_code=400, detail="Reset link invalid or expired")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    result2 = await db.execute(select(User).where(User.id == prt.user_id))
    user = result2.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = _hash_password(body.new_password)
    prt.used_at = now
    await db.commit()
    return {"ok": True}

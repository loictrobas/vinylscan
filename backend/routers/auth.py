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

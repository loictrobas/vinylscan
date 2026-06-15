import os
import uuid as _uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import CreditReason, CreditTransaction, User
from routers.auth import get_current_user
from routers.scan import _set_credit_header
from schemas import CreditPack, PaymentIntentRequest, PaymentIntentResponse
from services import stripe_service

router = APIRouter(prefix="/billing", tags=["billing"])

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


@router.get("/packs", response_model=list[CreditPack])
async def list_packs(user: User = Depends(get_current_user)):
    return stripe_service.get_packs()


@router.post("/checkout/subscribe")
async def checkout_subscribe(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.email:
        raise HTTPException(status_code=400, detail="Account email required")
    url = await stripe_service.create_checkout_session(
        user_id=str(user.id),
        email=user.email,
        customer_id=user.stripe_customer_id,
        success_url=f"{FRONTEND_URL}/dashboard?subscribed=1",
        cancel_url=f"{FRONTEND_URL}/dashboard",
    )
    # Persist customer id if newly created
    if not user.stripe_customer_id:
        import stripe as _stripe
        customers = _stripe.Customer.list(email=user.email, limit=1)
        if customers.data:
            user.stripe_customer_id = customers.data[0].id
            await db.commit()
    return {"url": url}


@router.post("/checkout/credits")
async def checkout_credits(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.email:
        raise HTTPException(status_code=400, detail="Account email required")
    url = await stripe_service.create_credits_checkout(
        user_id=str(user.id),
        email=user.email,
        customer_id=user.stripe_customer_id,
        success_url=f"{FRONTEND_URL}/dashboard?credits=1",
        cancel_url=f"{FRONTEND_URL}/dashboard",
    )
    return {"url": url}


@router.post("/portal")
async def billing_portal(
    user: User = Depends(get_current_user),
):
    if not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account found")
    url = await stripe_service.create_customer_portal(
        customer_id=user.stripe_customer_id,
        return_url=f"{FRONTEND_URL}/dashboard",
    )
    return {"url": url}


@router.post("/create-payment", response_model=PaymentIntentResponse)
async def create_payment(
    body: PaymentIntentRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        result = await stripe_service.create_payment_intent(body.pack_id, user.stripe_customer_id, str(user.id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Stripe error: {e}")

    _set_credit_header(response, user)
    return PaymentIntentResponse(
        client_secret=result["client_secret"],
        pack=CreditPack(**result["pack"]),
    )


@router.post("/webhook")
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe_service.handle_webhook(payload, sig_header)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook error: {e}")

    etype = event["type"]
    data = event["data"]["object"]

    # ── Subscription created / updated ──
    if etype in ("customer.subscription.created", "customer.subscription.updated"):
        sub = data
        user = await _find_user_by_customer(db, sub.get("customer"), sub.get("metadata", {}).get("user_id"))
        if user:
            user.stripe_subscription_id = sub["id"]
            user.subscription_status = sub["status"]  # active, trialing, past_due, canceled
            period_end = sub.get("current_period_end")
            if period_end:
                user.subscription_current_period_end = datetime.fromtimestamp(period_end, tz=timezone.utc)
            trial_end = sub.get("trial_end")
            if trial_end:
                user.trial_ends_at = datetime.fromtimestamp(trial_end, tz=timezone.utc)
            await db.commit()

    elif etype == "customer.subscription.deleted":
        sub = data
        user = await _find_user_by_customer(db, sub.get("customer"), None)
        if user:
            user.subscription_status = "canceled"
            user.stripe_subscription_id = None
            await db.commit()

    # ── One-time payment (credits) ──
    elif etype == "checkout.session.completed":
        session = data
        if session.get("mode") == "payment":
            metadata = session.get("metadata", {})
            credits = int(metadata.get("credits", 0))
            user_id_meta = metadata.get("user_id")
            customer_id = session.get("customer")
            user = await _find_user_by_customer(db, customer_id, user_id_meta)
            if user and credits > 0:
                user.credits += credits
                # Store customer id if not saved yet
                if customer_id and not user.stripe_customer_id:
                    user.stripe_customer_id = customer_id
                txn = CreditTransaction(
                    user_id=user.id,
                    amount=credits,
                    reason=CreditReason.purchase,
                    stripe_payment_intent_id=session.get("payment_intent"),
                )
                db.add(txn)
                await db.commit()

    # ── Legacy payment_intent.succeeded (credit packs) ──
    elif etype == "payment_intent.succeeded":
        intent = data
        metadata = intent.get("metadata", {})
        pack_id = metadata.get("pack_id")
        credits = int(metadata.get("credits", 0))
        user = await _find_user_by_customer(db, intent.get("customer"), metadata.get("user_id"))
        if user and credits > 0 and pack_id:
            user.credits += credits
            txn = CreditTransaction(
                user_id=user.id,
                amount=credits,
                reason=CreditReason.purchase,
                stripe_payment_intent_id=intent.get("id"),
            )
            db.add(txn)
            await db.commit()

    return {"received": True}


async def _find_user_by_customer(db: AsyncSession, customer_id: str | None, user_id_meta: str | None) -> User | None:
    if user_id_meta:
        try:
            result = await db.execute(select(User).where(User.id == _uuid.UUID(user_id_meta)))
            user = result.scalar_one_or_none()
            if user:
                return user
        except (ValueError, Exception):
            pass
    if customer_id:
        result = await db.execute(select(User).where(User.stripe_customer_id == customer_id))
        return result.scalar_one_or_none()
    return None

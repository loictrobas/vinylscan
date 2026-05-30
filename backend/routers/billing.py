import os

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


@router.get("/packs", response_model=list[CreditPack])
async def list_packs(user: User = Depends(get_current_user)):
    return stripe_service.get_packs()


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

    if event["type"] == "payment_intent.succeeded":
        intent = event["data"]["object"]
        metadata = intent.get("metadata", {})
        pack_id = metadata.get("pack_id")
        credits = int(metadata.get("credits", 0))
        customer_id = intent.get("customer")
        payment_intent_id = intent.get("id")

        # Find user by user_id in metadata (primary) or stripe customer id (fallback)
        user = None
        user_id_meta = metadata.get("user_id")
        if user_id_meta:
            import uuid as _uuid
            try:
                result = await db.execute(select(User).where(User.id == _uuid.UUID(user_id_meta)))
                user = result.scalar_one_or_none()
            except (ValueError, Exception):
                pass
        if not user and customer_id:
            result = await db.execute(
                select(User).where(User.stripe_customer_id == customer_id)
            )
            user = result.scalar_one_or_none()

        if user and credits > 0:
            user.credits += credits
            txn = CreditTransaction(
                user_id=user.id,
                amount=credits,
                reason=CreditReason.purchase,
                stripe_payment_intent_id=payment_intent_id,
            )
            db.add(txn)
            await db.commit()

    return {"received": True}

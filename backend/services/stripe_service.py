import asyncio
import os

import stripe

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")

PRICE_PRO_MONTHLY = os.getenv("STRIPE_PRICE_PRO_MONTHLY", "")
PRICE_CREDITS_50 = os.getenv("STRIPE_PRICE_CREDITS_50", "")
TRIAL_DAYS = 14

CREDIT_PACKS = {
    "small":  {"id": "small",  "name": "Small Pack",  "credits": 25,  "price_cents": 199, "price_display": "$1.99"},
    "medium": {"id": "medium", "name": "Medium Pack", "credits": 75,  "price_cents": 499, "price_display": "$4.99"},
    "large":  {"id": "large",  "name": "Large Pack",  "credits": 200, "price_cents": 999, "price_display": "$9.99"},
}


def get_packs() -> list[dict]:
    return list(CREDIT_PACKS.values())


def get_pack(pack_id: str) -> dict | None:
    return CREDIT_PACKS.get(pack_id)


async def get_or_create_customer(user_id: str, email: str, existing_customer_id: str | None) -> str:
    def _sync():
        if existing_customer_id:
            return existing_customer_id
        customer = stripe.Customer.create(email=email, metadata={"user_id": user_id})
        return customer.id

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync)


async def create_checkout_session(user_id: str, email: str, customer_id: str | None, success_url: str, cancel_url: str) -> str:
    cid = await get_or_create_customer(user_id, email, customer_id)

    def _sync():
        session = stripe.checkout.Session.create(
            customer=cid,
            mode="subscription",
            line_items=[{"price": PRICE_PRO_MONTHLY, "quantity": 1}],
            subscription_data={"trial_period_days": TRIAL_DAYS, "metadata": {"user_id": user_id}},
            metadata={"user_id": user_id},
            success_url=success_url,
            cancel_url=cancel_url,
            allow_promotion_codes=True,
        )
        return session.url

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync)


async def create_credits_checkout(user_id: str, email: str, customer_id: str | None, success_url: str, cancel_url: str) -> str:
    cid = await get_or_create_customer(user_id, email, customer_id)

    def _sync():
        session = stripe.checkout.Session.create(
            customer=cid,
            mode="payment",
            line_items=[{"price": PRICE_CREDITS_50, "quantity": 1}],
            metadata={"user_id": user_id, "credits": "50"},
            success_url=success_url,
            cancel_url=cancel_url,
        )
        return session.url

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync)


async def create_customer_portal(customer_id: str, return_url: str) -> str:
    def _sync():
        session = stripe.billing_portal.Session.create(customer=customer_id, return_url=return_url)
        return session.url

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync)


async def create_payment_intent(pack_id: str, stripe_customer_id: str | None, user_id: str = "") -> dict:
    pack = get_pack(pack_id)
    if not pack:
        raise ValueError(f"Unknown pack: {pack_id}")

    def _sync():
        kwargs = {
            "amount": pack["price_cents"],
            "currency": "usd",
            "metadata": {"pack_id": pack_id, "credits": pack["credits"], "user_id": user_id},
            "automatic_payment_methods": {"enabled": True},
        }
        if stripe_customer_id:
            kwargs["customer"] = stripe_customer_id
        return stripe.PaymentIntent.create(**kwargs)

    loop = asyncio.get_event_loop()
    intent = await loop.run_in_executor(None, _sync)
    return {"client_secret": intent.client_secret, "pack": pack}


def handle_webhook(payload: bytes, sig_header: str) -> stripe.Event:
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    return stripe.Webhook.construct_event(payload, sig_header, webhook_secret)

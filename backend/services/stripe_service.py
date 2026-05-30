import os
import stripe

stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")

CREDIT_PACKS = {
    "small": {"id": "small", "name": "Small Pack", "credits": 25, "price_cents": 199, "price_display": "$1.99"},
    "medium": {"id": "medium", "name": "Medium Pack", "credits": 75, "price_cents": 499, "price_display": "$4.99"},
    "large": {"id": "large", "name": "Large Pack", "credits": 200, "price_cents": 999, "price_display": "$9.99"},
}


def get_packs() -> list[dict]:
    return list(CREDIT_PACKS.values())


def get_pack(pack_id: str) -> dict | None:
    return CREDIT_PACKS.get(pack_id)


async def create_payment_intent(pack_id: str, stripe_customer_id: str | None, user_id: str = "") -> dict:
    import asyncio

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

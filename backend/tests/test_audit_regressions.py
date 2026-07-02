"""
Regression tests for the 2026-07 audit fixes:
1. Cross-tenant access on records must 404 (IDOR guard)
2. Storefront orders reserve stock (delist records, decrement accessories, 409 when gone)
3. Credit deduction happens once per scan even on repeated skip/confirm
4. Stripe webhook redelivery must not double-grant credits
5. Mobile app confirm payload uses the key the backend expects (contract)
"""
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Accessory, CreditTransaction, Record, RecordStatus, Scan, ScanStatus, User


@pytest.fixture
def other_user_factory(db: AsyncSession):
    async def make(**overrides) -> User:
        user = User(
            id=uuid.uuid4(),
            discogs_username=f"other_{uuid.uuid4().hex[:8]}",
            discogs_oauth_token="x",
            discogs_oauth_token_secret="x",
            credits=0,
            **overrides,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user
    return make


# ── 1. Cross-tenant IDOR ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cannot_touch_other_users_record(
    client: AsyncClient, db: AsyncSession, test_user: User, auth_headers: dict, other_user_factory,
):
    other = await other_user_factory()
    their_record = Record(
        user_id=other.id, artist="Blur", title="Parklife",
        condition="VG", status=RecordStatus.in_stock,
    )
    db.add(their_record)
    await db.commit()

    get_resp = await client.get(f"/catalog/{their_record.id}", headers=auth_headers)
    patch_resp = await client.patch(
        f"/catalog/{their_record.id}", json={"asking_price": 1.0}, headers=auth_headers
    )
    sell_resp = await client.post(
        f"/catalog/{their_record.id}/sell", json={"sold_price": 1.0}, headers=auth_headers
    )
    delete_resp = await client.delete(f"/catalog/{their_record.id}", headers=auth_headers)

    assert get_resp.status_code == 404
    assert patch_resp.status_code == 404
    assert sell_resp.status_code == 404
    assert delete_resp.status_code == 404

    still_there = await db.execute(select(Record).where(Record.id == their_record.id))
    assert still_there.scalar_one_or_none() is not None


# ── 2. Storefront stock reservation ──────────────────────────────────────────

@pytest_asyncio.fixture
async def public_store(db: AsyncSession, other_user_factory):
    owner = await other_user_factory(store_slug=f"shop{uuid.uuid4().hex[:6]}", store_public=True)
    record = Record(
        user_id=owner.id, artist="Can", title="Future Days",
        condition="NM", status=RecordStatus.in_stock,
        store_listed=True, asking_price=30.0,
    )
    accessory = Accessory(
        user_id=owner.id, name="Inner sleeves", category="Sleeves",
        price=10.0, stock_quantity=2, is_listed=True,
    )
    db.add_all([record, accessory])
    await db.commit()
    await db.refresh(record)
    await db.refresh(accessory)
    return owner, record, accessory


def _order_body(items):
    return {
        "customer_name": "Ana",
        "customer_contact": "ana@example.com",
        "items": items,
        "total": 30.0,
    }


@pytest.mark.asyncio
async def test_order_delists_record_and_blocks_second_order(
    client: AsyncClient, db: AsyncSession, public_store,
):
    owner, record, _ = public_store
    item = {"kind": "record", "id": str(record.id), "name": "Future Days", "qty": 1, "price": 30.0}

    first = await client.post(f"/store/{owner.store_slug}/order", json=_order_body([item]))
    assert first.status_code == 200
    assert first.json()["order_ref"].startswith("ORD-")

    await db.refresh(record)
    assert record.store_listed is False  # reserved

    second = await client.post(f"/store/{owner.store_slug}/order", json=_order_body([item]))
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_order_decrements_accessory_stock(
    client: AsyncClient, db: AsyncSession, public_store,
):
    owner, _, accessory = public_store
    item = {"kind": "accessory", "id": str(accessory.id), "name": "Inner sleeves", "qty": 2, "price": 10.0}

    ok = await client.post(f"/store/{owner.store_slug}/order", json=_order_body([item]))
    assert ok.status_code == 200
    await db.refresh(accessory)
    assert accessory.stock_quantity == 0

    sold_out = await client.post(f"/store/{owner.store_slug}/order", json=_order_body([item]))
    assert sold_out.status_code == 409


@pytest.mark.asyncio
async def test_order_rejects_garbage_items(client: AsyncClient, public_store):
    owner, _, _ = public_store
    bad_id = await client.post(
        f"/store/{owner.store_slug}/order",
        json=_order_body([{"kind": "record", "id": "not-a-uuid", "name": "x", "qty": 1}]),
    )
    assert bad_id.status_code == 400

    foreign = await client.post(
        f"/store/{owner.store_slug}/order",
        json=_order_body([{"kind": "record", "id": str(uuid.uuid4()), "name": "x", "qty": 1}]),
    )
    assert foreign.status_code == 409


# ── 3. Credits deducted once per scan ─────────────────────────────────────────

@pytest.mark.asyncio
async def test_skip_deducts_credit_exactly_once(
    client: AsyncClient, db: AsyncSession, test_user: User, auth_headers: dict,
):
    scan = Scan(
        id=uuid.uuid4(), user_id=test_user.id,
        image_url="/images/t.jpg", status=ScanStatus.pending,
    )
    db.add(scan)
    await db.commit()
    credits_before = test_user.credits

    first = await client.post(f"/scan/{scan.id}/skip", headers=auth_headers)
    assert first.status_code == 200
    assert first.json()["credits_remaining"] == credits_before - 1

    second = await client.post(f"/scan/{scan.id}/skip", headers=auth_headers)
    assert second.status_code == 400  # already finalized

    await db.refresh(test_user)
    assert test_user.credits == credits_before - 1


# ── 4. Stripe webhook idempotency ────────────────────────────────────────────

def _checkout_completed_event(user_id: str, payment_intent: str, credits: int = 10):
    return {
        "type": "checkout.session.completed",
        "data": {"object": {
            "mode": "payment",
            "metadata": {"credits": str(credits), "user_id": user_id},
            "customer": "cus_test",
            "payment_intent": payment_intent,
        }},
    }


@pytest.mark.asyncio
async def test_webhook_redelivery_does_not_double_grant(
    client: AsyncClient, db: AsyncSession, test_user: User,
):
    event = _checkout_completed_event(str(test_user.id), f"pi_{uuid.uuid4().hex[:10]}")
    credits_before = test_user.credits

    with patch("routers.billing.stripe_service.handle_webhook", return_value=event):
        first = await client.post("/billing/webhook", content=b"{}", headers={"stripe-signature": "t"})
        second = await client.post("/billing/webhook", content=b"{}", headers={"stripe-signature": "t"})

    assert first.status_code == 200
    assert second.status_code == 200

    await db.refresh(test_user)
    assert test_user.credits == credits_before + 10  # once, not twice

    txns = await db.execute(
        select(CreditTransaction).where(CreditTransaction.user_id == test_user.id)
    )
    assert len(txns.scalars().all()) == 1


# ── 5. Mobile ↔ backend confirm contract ─────────────────────────────────────

def test_mobile_confirm_sends_release_id():
    """The backend's ConfirmRequest expects `release_id`; the mobile client once
    sent `discogs_release_id` and every confirm 422'd. Pin the contract."""
    mobile_api = Path(__file__).resolve().parents[2] / "mobile-app" / "src" / "lib" / "api.ts"
    source = mobile_api.read_text()
    confirm_block = source[source.index("confirmScan"):]
    confirm_block = confirm_block[:confirm_block.index("}),")]
    assert "release_id" in confirm_block
    assert "discogs_release_id" not in confirm_block

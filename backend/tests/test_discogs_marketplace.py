"""
Tests for Discogs marketplace listing endpoints:
POST /discogs/marketplace/{record_id}  — create listing
DELETE /discogs/marketplace/{record_id} — remove listing

Covers: happy path, idempotency guard, price guard, status guard.
"""
import uuid
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import Record, RecordEvent, RecordStatus, User


async def _make_listable_record(db: AsyncSession, user: User, **overrides) -> Record:
    defaults = dict(
        id=uuid.uuid4(),
        user_id=user.id,
        discogs_release_id=123456,
        asking_price=Decimal("12.00"),
        condition="VG+",
        status=RecordStatus.in_stock,
        artist="The Beatles",
        title="Abbey Road",
    )
    defaults.update(overrides)
    record = Record(**defaults)
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@pytest.mark.asyncio
async def test_create_listing_happy_path(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
    auth_headers: dict,
):
    record = await _make_listable_record(db, test_user)

    with patch("routers.discogs.discogs_svc.create_listing", new_callable=AsyncMock) as mock_create:
        mock_create.return_value = {"listing_id": 9999}
        resp = await client.post(f"/discogs/marketplace/{record.id}", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["listing_id"] == 9999

    await db.refresh(record)
    assert record.discogs_listing_id == 9999

    events = (await db.execute(
        select(RecordEvent).where(RecordEvent.record_id == record.id, RecordEvent.event_type == "listed_on_discogs")
    )).scalars().all()
    assert len(events) == 1


@pytest.mark.asyncio
async def test_create_listing_idempotent(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
    auth_headers: dict,
):
    record = await _make_listable_record(db, test_user, discogs_listing_id=7777)

    with patch("routers.discogs.discogs_svc.create_listing", new_callable=AsyncMock) as mock_create:
        resp = await client.post(f"/discogs/marketplace/{record.id}", headers=auth_headers)
        mock_create.assert_not_called()

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["listing_id"] == 7777


@pytest.mark.asyncio
async def test_create_listing_requires_price(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
    auth_headers: dict,
):
    record = await _make_listable_record(db, test_user, asking_price=None)

    resp = await client.post(f"/discogs/marketplace/{record.id}", headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_listing_requires_in_stock(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
    auth_headers: dict,
):
    record = await _make_listable_record(db, test_user, status=RecordStatus.sold)

    resp = await client.post(f"/discogs/marketplace/{record.id}", headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_delete_listing_happy_path(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
    auth_headers: dict,
):
    record = await _make_listable_record(db, test_user, discogs_listing_id=8888)

    with patch("routers.discogs.discogs_svc.delete_listing", new_callable=AsyncMock):
        resp = await client.delete(f"/discogs/marketplace/{record.id}", headers=auth_headers)

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["listing_id"] is None

    await db.refresh(record)
    assert record.discogs_listing_id is None

    events = (await db.execute(
        select(RecordEvent).where(RecordEvent.record_id == record.id, RecordEvent.event_type == "delisted_from_discogs")
    )).scalars().all()
    assert len(events) == 1


@pytest.mark.asyncio
async def test_delete_listing_requires_active_listing(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
    auth_headers: dict,
):
    record = await _make_listable_record(db, test_user)  # no discogs_listing_id

    resp = await client.delete(f"/discogs/marketplace/{record.id}", headers=auth_headers)
    assert resp.status_code == 422

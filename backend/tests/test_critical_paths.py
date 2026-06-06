"""
Critical path tests:
1. Confirm scan creates a Record
2. Catalog list returns only user's records
3. Mark as sold updates status and sold_price
"""
import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import Record, RecordStatus, Scan, ScanStatus, User


@pytest.mark.asyncio
async def test_confirm_scan_creates_record(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
    auth_headers: dict,
):
    """Confirming a scan must create a Record row linked to the scan."""
    scan = Scan(
        id=uuid.uuid4(),
        user_id=test_user.id,
        image_url="/images/test.jpg",
        status=ScanStatus.pending,
        artist="The Beatles",
        title="Abbey Road",
        year=1969,
    )
    db.add(scan)
    await db.commit()

    with (
        patch("routers.scan.discogs_svc.add_to_collection", new_callable=AsyncMock) as mock_add,
        patch("routers.scan.discogs_svc.get_marketplace_stats", new_callable=AsyncMock) as mock_price,
    ):
        mock_add.return_value = {"id": 1}
        mock_price.return_value = None  # background task finds no price

        resp = await client.post(
            f"/scan/{scan.id}/confirm",
            json={"release_id": 123456, "condition": "VG+"},
            headers=auth_headers,
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert "record_id" in data

    record_result = await db.execute(select(Record).where(Record.scan_id == scan.id))
    record = record_result.scalar_one_or_none()
    assert record is not None
    assert record.discogs_release_id == 123456
    assert record.condition == "VG+"
    assert record.status == RecordStatus.in_stock


@pytest.mark.asyncio
async def test_catalog_isolation(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
    auth_headers: dict,
):
    """Catalog list must only return records belonging to the authenticated user."""
    other_user = User(
        id=uuid.uuid4(),
        discogs_username="otheruser",
        discogs_oauth_token="x",
        discogs_oauth_token_secret="x",
        credits=0,
    )
    db.add(other_user)

    my_record = Record(
        user_id=test_user.id,
        artist="Radiohead",
        title="OK Computer",
        condition="NM",
        status=RecordStatus.in_stock,
    )
    their_record = Record(
        user_id=other_user.id,
        artist="Blur",
        title="Parklife",
        condition="VG",
        status=RecordStatus.in_stock,
    )
    db.add(my_record)
    db.add(their_record)
    await db.commit()

    resp = await client.get("/catalog?status=all", headers=auth_headers)
    assert resp.status_code == 200
    ids = {r["id"] for r in resp.json()["records"]}
    assert str(my_record.id) in ids
    assert str(their_record.id) not in ids


@pytest.mark.asyncio
async def test_sell_record(
    client: AsyncClient,
    db: AsyncSession,
    test_user: User,
    auth_headers: dict,
):
    """Selling a record must set status=sold, sold_price, and sold_at."""
    record = Record(
        user_id=test_user.id,
        artist="David Bowie",
        title="Ziggy Stardust",
        condition="VG+",
        status=RecordStatus.in_stock,
        asking_price=15.00,
    )
    db.add(record)
    await db.commit()

    resp = await client.post(
        f"/catalog/{record.id}/sell",
        json={"sold_price": 12.50},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "sold"
    assert data["sold_price"] == 12.50
    assert data["sold_at"] is not None

    # Selling again must 400
    resp2 = await client.post(
        f"/catalog/{record.id}/sell",
        json={"sold_price": 10.00},
        headers=auth_headers,
    )
    assert resp2.status_code == 400

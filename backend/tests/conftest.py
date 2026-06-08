"""
Test setup: in-memory SQLite async DB, no real Discogs/Claude calls.

Run: pytest backend/tests/ -v
Requires: pip install pytest pytest-asyncio httpx
"""
import asyncio
import os
import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

# Use SQLite for tests — no PostgreSQL needed
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("DEV_MODE", "true")

from database import Base, get_db
from main import app
from models import CreditReason, CreditTransaction, Scan, ScanStatus, User

# StaticPool forces all sessions to share the same in-memory SQLite connection,
# which is necessary for data committed in fixtures to be visible to the app's
# override_get_db dependency.
TEST_ENGINE = create_async_engine(
    "sqlite+aiosqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestSessionLocal = async_sessionmaker(TEST_ENGINE, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestSessionLocal() as session:
        yield session


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def create_tables():
    async with TEST_ENGINE.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession, None]:
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def test_user(db: AsyncSession) -> User:
    from middleware.auth_middleware import encrypt
    user = User(
        id=uuid.uuid4(),
        discogs_username=f"testuser_{uuid.uuid4().hex[:8]}",
        discogs_oauth_token=encrypt("fake-token"),
        discogs_oauth_token_secret=encrypt("fake-secret"),
        credits=10,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def auth_headers(test_user: User) -> dict:
    """Return Authorization header with a valid JWT for test_user."""
    from routers.auth import create_access_token
    token = create_access_token(str(test_user.id))
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from models import CreditReason, ScanStatus


class UserOut(BaseModel):
    id: uuid.UUID
    discogs_username: str
    credits: int
    created_at: datetime

    model_config = {"from_attributes": True}


class ScanOut(BaseModel):
    id: uuid.UUID
    image_url: str
    artist: str | None
    title: str | None
    year: int | None
    label: str | None
    catalog_number: str | None
    confidence: int | None
    discogs_release_id: int | None
    status: ScanStatus
    credit_deducted: bool
    created_at: datetime
    claude_raw_response: dict | None = None

    model_config = {"from_attributes": True}


class DiscogsMatch(BaseModel):
    release_id: int
    title: str
    artist: str
    year: int | None
    format: str | None
    country: str | None
    label: str | None
    cover_image: str | None
    resource_url: str | None


class ScanUploadResponse(BaseModel):
    scan_id: uuid.UUID
    status: ScanStatus
    artist: str | None
    title: str | None
    year: int | None
    label: str | None
    catalog_number: str | None
    confidence: int
    auto_added: bool
    discogs_release_id: int | None
    matches: list[DiscogsMatch]
    error: str | None = None


class ConfirmRequest(BaseModel):
    release_id: int


class CreditTransactionOut(BaseModel):
    id: uuid.UUID
    amount: int
    reason: CreditReason
    stripe_payment_intent_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DashboardStats(BaseModel):
    total_scanned: int
    total_added: int
    credit_balance: int
    recent_transactions: list[CreditTransactionOut]


class CreditPack(BaseModel):
    id: str
    name: str
    credits: int
    price_cents: int
    price_display: str


class PaymentIntentRequest(BaseModel):
    pack_id: str


class PaymentIntentResponse(BaseModel):
    client_secret: str
    pack: CreditPack

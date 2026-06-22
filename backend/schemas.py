import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel

from models import CreditReason, ScanStatus


class UserOut(BaseModel):
    id: uuid.UUID
    discogs_username: str | None
    email: str | None = None
    display_name: str | None = None
    is_admin: bool = False
    is_active: bool = True
    credits: int
    subscription_status: str = "free"
    subscription_current_period_end: datetime | None = None
    trial_ends_at: datetime | None = None
    created_at: datetime
    scans_this_month: int = 0
    price_step: float = 0.5

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
    catno: str | None = None
    match_reason: str | None = None


class MobileUploadAck(BaseModel):
    """Fast-ack response for the mobile app's fire-and-forget upload — full result follows via SSE."""
    scan_id: uuid.UUID
    status: str


class ScanUploadResponse(BaseModel):
    scan_id: uuid.UUID
    status: ScanStatus
    artist: str | None
    title: str | None
    year: int | None
    label: str | None
    catalog_number: str | None
    confidence: int
    internal_confidence: int = 0
    auto_added: bool
    discogs_release_id: int | None
    matches: list[DiscogsMatch]
    error: str | None = None
    artist_alt: str | None = None
    title_alt: str | None = None
    low_information: bool = False
    barcode: str | None = None


class ResearchRequest(BaseModel):
    """User-edited identification fields to re-run the Discogs search with."""
    artist: str | None = None
    title: str | None = None
    label: str | None = None
    catalog_number: str | None = None
    year: int | None = None


class VisualMatchCandidate(BaseModel):
    release_id: int
    cover_image_url: str


class VisualMatchRequest(BaseModel):
    candidates: list[VisualMatchCandidate]


class VisualMatchResponse(BaseModel):
    best_match_index: int | None
    best_match_release_id: int | None
    confidence: str
    reasoning: str


class ResearchResponse(BaseModel):
    artist: str | None
    title: str | None
    label: str | None
    catalog_number: str | None
    matches: list[DiscogsMatch]


class ConfirmRequest(BaseModel):
    release_id: int
    condition: str = "VG+"
    disc_condition: str | None = None
    cover_condition: str | None = None
    lot_id: uuid.UUID | None = None
    cover_image: str | None = None
    match_index: int | None = None  # which result the user selected (0=first) — for ranking analytics


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

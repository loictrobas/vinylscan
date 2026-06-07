import uuid
from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import (
    BigInteger, Boolean, DateTime, Enum, Float, ForeignKey, Index, Integer, JSON, Numeric, String, Text
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


def utcnow():
    return datetime.now(timezone.utc)


class ScanStatus(str, PyEnum):
    pending = "pending"
    auto_added = "auto_added"
    manually_added = "manually_added"
    skipped = "skipped"


class CreditReason(str, PyEnum):
    free_topup = "free_topup"
    purchase = "purchase"
    scan_used = "scan_used"


class RecordStatus(str, PyEnum):
    in_stock = "in_stock"
    sold = "sold"


class RecordCondition(str, PyEnum):
    M = "M"
    NM = "NM"
    VG_PLUS = "VG+"
    VG = "VG"
    G = "G"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Email/password auth (optional — users may be Discogs-only)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Discogs OAuth (optional for email-only users)
    discogs_username: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    discogs_oauth_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    discogs_oauth_token_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    credits: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    last_free_topup_month: Mapped[str] = mapped_column(String(7), nullable=False, default="")
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    price_markup_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_discogs_sync: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Public store
    store_slug: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    store_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    store_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    store_contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    store_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    scans: Mapped[list["Scan"]] = relationship("Scan", back_populates="user")
    credit_transactions: Mapped[list["CreditTransaction"]] = relationship("CreditTransaction", back_populates="user")
    lots: Mapped[list["Lot"]] = relationship("Lot", back_populates="user")
    records: Mapped[list["Record"]] = relationship("Record", back_populates="user")
    invites_created: Mapped[list["Invite"]] = relationship("Invite", back_populates="creator", foreign_keys="Invite.created_by")
    password_reset_tokens: Mapped[list["PasswordResetToken"]] = relationship("PasswordResetToken", back_populates="user")


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    image_url: Mapped[str] = mapped_column(Text, nullable=False)
    claude_raw_response: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    artist: Mapped[str | None] = mapped_column(String(500), nullable=True)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    catalog_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    format: Mapped[str | None] = mapped_column(String(50), nullable=True)
    confidence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    discogs_release_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[ScanStatus] = mapped_column(
        Enum(ScanStatus, name="scan_status"), default=ScanStatus.pending, nullable=False
    )
    credit_deducted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="scans")
    record: Mapped["Record | None"] = relationship("Record", back_populates="scan", uselist=False)


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[CreditReason] = mapped_column(
        Enum(CreditReason, name="credit_reason"), nullable=False
    )
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="credit_transactions")


class Lot(Base):
    __tablename__ = "lots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    purchase_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="lots")
    records: Mapped[list["Record"]] = relationship("Record", back_populates="lot")


class Record(Base):
    __tablename__ = "records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    lot_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("lots.id"), nullable=True)
    scan_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("scans.id"), nullable=True)

    artist: Mapped[str | None] = mapped_column(String(500), nullable=True)
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    catalog_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    format: Mapped[str | None] = mapped_column(String(50), nullable=True)
    genre: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cost_price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    tags: Mapped[str | None] = mapped_column(Text, nullable=True)  # comma-separated free tags
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    condition: Mapped[str] = mapped_column(
        Enum(RecordCondition, name="record_condition", values_callable=lambda obj: [e.value for e in obj]),
        default=RecordCondition.VG_PLUS, nullable=False
    )
    discogs_release_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    discogs_instance_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # collection instance_id
    discogs_listing_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)   # marketplace listing_id
    discogs_synced: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    discogs_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    store_listed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    status: Mapped[RecordStatus] = mapped_column(
        Enum(RecordStatus, name="record_status"), default=RecordStatus.in_stock, nullable=False
    )
    asking_price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    sold_price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    sold_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="records")
    lot: Mapped["Lot | None"] = relationship("Lot", back_populates="records")
    scan: Mapped["Scan | None"] = relationship("Scan", back_populates="record")

    __table_args__ = (
        Index("ix_records_user_status", "user_id", "status"),
        Index("ix_records_lot_id", "lot_id"),
        Index("ix_records_discogs_release_id", "discogs_release_id"),
        Index("ix_records_discogs_listing_id", "discogs_listing_id"),
    )


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    used_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    creator: Mapped["User"] = relationship("User", back_populates="invites_created", foreign_keys=[created_by])


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    token: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="password_reset_tokens")

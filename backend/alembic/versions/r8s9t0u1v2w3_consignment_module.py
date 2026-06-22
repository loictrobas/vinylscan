"""add consignment module: consignors table + consignor fields on records

Revision ID: r8s9t0u1v2w3
Revises: q7r8s9t0u1v2
Create Date: 2026-06-18

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "r8s9t0u1v2w3"
down_revision = "q7r8s9t0u1v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "consignors",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("contact", sa.String(255), nullable=True),
        sa.Column("default_commission_pct", sa.Float, nullable=False, server_default="30.0"),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.add_column("records", sa.Column("consignor_id", sa.Integer, sa.ForeignKey("consignors.id", ondelete="SET NULL"), nullable=True))
    op.add_column("records", sa.Column("consignor_agreed_price", sa.Numeric(10, 2), nullable=True))
    op.add_column("records", sa.Column("consignor_commission_pct", sa.Float, nullable=True))
    op.add_column("records", sa.Column("consignor_payout_status", sa.String(20), nullable=True))
    op.add_column("records", sa.Column("consignor_amount_owed", sa.Numeric(10, 2), nullable=True))
    op.add_column("records", sa.Column("consignor_amount_paid", sa.Numeric(10, 2), nullable=True))
    op.add_column("records", sa.Column("consignor_paid_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("records", sa.Column("consigned_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("records", "consigned_at")
    op.drop_column("records", "consignor_paid_at")
    op.drop_column("records", "consignor_amount_paid")
    op.drop_column("records", "consignor_amount_owed")
    op.drop_column("records", "consignor_payout_status")
    op.drop_column("records", "consignor_commission_pct")
    op.drop_column("records", "consignor_agreed_price")
    op.drop_column("records", "consignor_id")
    op.drop_table("consignors")

"""Add scans(user_id, status) index; lots.purchase_price Float -> Numeric(10,2)

Revision ID: t0u1v2w3x4y5
Revises: 813d1e678c0e
Create Date: 2026-07-01
"""
import sqlalchemy as sa
from alembic import op

revision = "t0u1v2w3x4y5"
down_revision = "813d1e678c0e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_scans_user_id_status", "scans", ["user_id", "status"])
    op.alter_column(
        "lots", "purchase_price",
        existing_type=sa.Float(),
        type_=sa.Numeric(10, 2),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "lots", "purchase_price",
        existing_type=sa.Numeric(10, 2),
        type_=sa.Float(),
        existing_nullable=True,
    )
    op.drop_index("ix_scans_user_id_status", table_name="scans")

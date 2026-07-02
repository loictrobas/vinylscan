"""Add records.payment_method — POS captured it but nothing persisted it

Revision ID: v2w3x4y5z6a7
Revises: u1v2w3x4y5z6
Create Date: 2026-07-02
"""
import sqlalchemy as sa
from alembic import op

revision = "v2w3x4y5z6a7"
down_revision = "u1v2w3x4y5z6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("records", sa.Column("payment_method", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("records", "payment_method")

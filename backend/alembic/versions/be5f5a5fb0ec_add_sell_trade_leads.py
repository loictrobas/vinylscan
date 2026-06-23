"""add sell trade leads table

Revision ID: be5f5a5fb0ec
Revises: 2e535de34d62
Create Date: 2026-06-23 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'be5f5a5fb0ec'
down_revision: Union[str, None] = '2e535de34d62'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sell_trade_leads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("approx_records", sa.String(50), nullable=True),
        sa.Column("payout_preference", sa.String(20), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="new"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sell_trade_leads_user_id_created", "sell_trade_leads", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_sell_trade_leads_user_id_created", table_name="sell_trade_leads")
    op.drop_table("sell_trade_leads")

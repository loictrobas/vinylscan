"""add orders table

Revision ID: b59297458b89
Revises: be5f5a5fb0ec
Create Date: 2026-06-23 02:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b59297458b89'
down_revision: Union[str, None] = 'be5f5a5fb0ec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_ref", sa.String(30), nullable=False),
        sa.Column("customer_name", sa.String(255), nullable=False),
        sa.Column("customer_contact", sa.String(255), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("total", sa.Numeric(10, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_orders_user_id_created", "orders", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_orders_user_id_created", table_name="orders")
    op.drop_table("orders")

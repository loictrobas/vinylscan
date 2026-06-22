"""add accessories table

Revision ID: ca79cedaab9d
Revises: 438ee1f77e84
Create Date: 2026-06-22 16:26:00.719965

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'ca79cedaab9d'
down_revision: Union[str, None] = '438ee1f77e84'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "accessories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("category", sa.String(20), nullable=False, server_default="Other"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price", sa.Numeric(10, 2), nullable=True),
        sa.Column("stock_quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cover_image_url", sa.Text(), nullable=True),
        sa.Column("is_listed", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_accessories_user_id", "accessories", ["user_id"])
    op.create_index("ix_accessories_user_id_listed", "accessories", ["user_id", "is_listed"])


def downgrade() -> None:
    op.drop_index("ix_accessories_user_id_listed", table_name="accessories")
    op.drop_index("ix_accessories_user_id", table_name="accessories")
    op.drop_table("accessories")

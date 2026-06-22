"""add store hero fields

Revision ID: o5p6q7r8s9t0
Revises: n4o5p6q7r8s9
Create Date: 2026-06-16

"""
from alembic import op
import sqlalchemy as sa

revision = "o5p6q7r8s9t0"
down_revision = "n4o5p6q7r8s9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("store_banner_url", sa.Text, nullable=True))
    op.add_column("users", sa.Column("store_font", sa.String(30), nullable=True))
    op.add_column("users", sa.Column("store_secondary_color", sa.String(7), nullable=True))
    op.add_column("users", sa.Column("store_tagline", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "store_tagline")
    op.drop_column("users", "store_secondary_color")
    op.drop_column("users", "store_font")
    op.drop_column("users", "store_banner_url")

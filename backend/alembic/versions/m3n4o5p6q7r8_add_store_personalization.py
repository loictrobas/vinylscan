"""add store personalization fields

Revision ID: m3n4o5p6q7r8
Revises: l2m3n4o5p6q7
Create Date: 2026-06-15

"""
from alembic import op
import sqlalchemy as sa

revision = "m3n4o5p6q7r8"
down_revision = "l2m3n4o5p6q7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("store_location", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("store_accent_color", sa.String(7), nullable=True))
    op.add_column("users", sa.Column("store_facebook", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("store_website", sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "store_website")
    op.drop_column("users", "store_facebook")
    op.drop_column("users", "store_accent_color")
    op.drop_column("users", "store_location")

"""add store banner and instagram

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-07
"""
from alembic import op
import sqlalchemy as sa

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("store_info_banner", sa.String(500), nullable=True))
    op.add_column("users", sa.Column("store_instagram", sa.String(100), nullable=True))


def downgrade():
    op.drop_column("users", "store_instagram")
    op.drop_column("users", "store_info_banner")

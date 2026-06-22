"""store theme config

Revision ID: s9t0u1v2w3x4
Revises: r8s9t0u1v2w3
Create Date: 2026-06-18

"""
from alembic import op
import sqlalchemy as sa

revision = "s9t0u1v2w3x4"
down_revision = "r8s9t0u1v2w3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("store_theme_config", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("users", "store_theme_config")

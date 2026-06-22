"""add record_section and store_hours

Revision ID: p6q7r8s9t0u1
Revises: o5p6q7r8s9t0
Create Date: 2026-06-16

"""
from alembic import op
import sqlalchemy as sa

revision = "p6q7r8s9t0u1"
down_revision = "o5p6q7r8s9t0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("records", sa.Column("record_section", sa.String(20), nullable=False, server_default="vinyl"))
    op.add_column("users", sa.Column("store_hours", sa.Text, nullable=True))


def downgrade() -> None:
    op.drop_column("users", "store_hours")
    op.drop_column("records", "record_section")

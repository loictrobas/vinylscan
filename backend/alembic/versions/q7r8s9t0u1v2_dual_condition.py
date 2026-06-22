"""add disc_condition and cover_condition to records

Revision ID: q7r8s9t0u1v2
Revises: p6q7r8s9t0u1
Create Date: 2026-06-18

"""
from alembic import op
import sqlalchemy as sa

revision = "q7r8s9t0u1v2"
down_revision = "6be679fdf5be"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("records", sa.Column("disc_condition", sa.String(10), nullable=True))
    op.add_column("records", sa.Column("cover_condition", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("records", "cover_condition")
    op.drop_column("records", "disc_condition")

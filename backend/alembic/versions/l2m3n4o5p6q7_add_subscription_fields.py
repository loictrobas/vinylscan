"""add subscription fields to users

Revision ID: l2m3n4o5p6q7
Revises: j0k1l2m3n4o5
Create Date: 2026-06-15

"""
from alembic import op
import sqlalchemy as sa

revision = "l2m3n4o5p6q7"
down_revision = "j0k1l2m3n4o5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("stripe_subscription_id", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("subscription_status", sa.String(30), nullable=False, server_default="free"))
    op.add_column("users", sa.Column("subscription_current_period_end", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "trial_ends_at")
    op.drop_column("users", "subscription_current_period_end")
    op.drop_column("users", "subscription_status")
    op.drop_column("users", "stripe_subscription_id")

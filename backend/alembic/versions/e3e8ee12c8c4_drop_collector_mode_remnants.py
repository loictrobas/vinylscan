"""drop collector mode remnants: account_type column + wantlist_items table

Revision ID: e3e8ee12c8c4
Revises: s9t0u1v2w3x4
Create Date: 2026-06-20
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = 'e3e8ee12c8c4'
down_revision = 's9t0u1v2w3x4'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_index("ix_wantlist_items_user_id", table_name="wantlist_items")
    op.drop_table("wantlist_items")
    op.drop_column("users", "account_type")


def downgrade():
    op.add_column(
        "users",
        sa.Column("account_type", sa.String(20), nullable=False, server_default="store"),
    )
    op.create_table(
        "wantlist_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("artist", sa.String(500), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("label", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("discogs_release_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wantlist_items_user_id", "wantlist_items", ["user_id"])

"""collector mode: account_type + wantlist_items

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-06-08
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = 'k1l2m3n4o5p6'
down_revision = 'j0k1l2m3n4o5'
branch_labels = None
depends_on = None


def upgrade():
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
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_wantlist_items_user_id", "wantlist_items", ["user_id"])


def downgrade():
    op.drop_index("ix_wantlist_items_user_id", "wantlist_items")
    op.drop_table("wantlist_items")
    op.drop_column("users", "account_type")

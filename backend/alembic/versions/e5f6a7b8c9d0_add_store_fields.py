"""add store fields

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-07
"""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Store settings on users
    op.add_column("users", sa.Column("store_slug", sa.String(80), nullable=True))
    op.add_column("users", sa.Column("store_name", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("store_description", sa.Text, nullable=True))
    op.add_column("users", sa.Column("store_contact", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("store_public", sa.Boolean, nullable=False, server_default="false"))
    op.create_unique_constraint("uq_users_store_slug", "users", ["store_slug"])
    # Store listing toggle on records
    op.add_column("records", sa.Column("store_listed", sa.Boolean, nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("records", "store_listed")
    op.drop_constraint("uq_users_store_slug", "users", type_="unique")
    op.drop_column("users", "store_public")
    op.drop_column("users", "store_contact")
    op.drop_column("users", "store_description")
    op.drop_column("users", "store_name")
    op.drop_column("users", "store_slug")

"""add discogs market price fields to records

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
Create Date: 2026-06-07
"""
from alembic import op
import sqlalchemy as sa

revision = "h8i9j0k1l2m3"
down_revision = "g7h8i9j0k1l2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("records", sa.Column("discogs_lowest_price", sa.Numeric(10, 2), nullable=True))
    op.add_column("records", sa.Column("discogs_num_for_sale", sa.Integer, nullable=True))
    op.add_column("records", sa.Column("discogs_suggested_price", sa.Numeric(10, 2), nullable=True))


def downgrade():
    op.drop_column("records", "discogs_suggested_price")
    op.drop_column("records", "discogs_num_for_sale")
    op.drop_column("records", "discogs_lowest_price")

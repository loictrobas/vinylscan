"""add discogs_listing_id to records

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-07 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('records', sa.Column('discogs_listing_id', sa.BigInteger(), nullable=True))
    op.create_index('ix_records_discogs_listing_id', 'records', ['discogs_listing_id'])


def downgrade() -> None:
    op.drop_index('ix_records_discogs_listing_id', table_name='records')
    op.drop_column('records', 'discogs_listing_id')

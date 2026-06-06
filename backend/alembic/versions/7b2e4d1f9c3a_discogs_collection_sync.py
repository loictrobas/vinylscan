"""discogs_collection_sync

Revision ID: 7b2e4d1f9c3a
Revises: 3f8a2c1d9e4b
Create Date: 2026-06-06 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '7b2e4d1f9c3a'
down_revision: Union[str, None] = '3f8a2c1d9e4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # records: collection tracking fields
    op.add_column('records', sa.Column('discogs_instance_id', sa.Integer(), nullable=True))
    op.add_column('records', sa.Column('discogs_synced', sa.Boolean(), nullable=False, server_default='false'))
    op.create_index('ix_records_discogs_instance_id', 'records', ['discogs_instance_id'])

    # users: last sync timestamp
    op.add_column('users', sa.Column('last_discogs_sync', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'last_discogs_sync')
    op.drop_index('ix_records_discogs_instance_id', table_name='records')
    op.drop_column('records', 'discogs_synced')
    op.drop_column('records', 'discogs_instance_id')

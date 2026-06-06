"""add_record_extended_fields

Revision ID: 3f8a2c1d9e4b
Revises: 9f2e1a3b5c7d
Create Date: 2026-06-06 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '3f8a2c1d9e4b'
down_revision: Union[str, None] = '9f2e1a3b5c7d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('records', sa.Column('genre',      sa.String(100),    nullable=True))
    op.add_column('records', sa.Column('country',    sa.String(100),    nullable=True))
    op.add_column('records', sa.Column('cost_price', sa.Numeric(10, 2), nullable=True))
    op.add_column('records', sa.Column('tags',       sa.Text(),         nullable=True))
    op.add_column('records', sa.Column('notes',      sa.Text(),         nullable=True))
    op.execute("CREATE INDEX ix_records_genre ON records (user_id, genre)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_records_genre")
    op.drop_column('records', 'notes')
    op.drop_column('records', 'tags')
    op.drop_column('records', 'cost_price')
    op.drop_column('records', 'country')
    op.drop_column('records', 'genre')

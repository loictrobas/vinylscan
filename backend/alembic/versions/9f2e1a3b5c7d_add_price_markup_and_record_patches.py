"""add_price_markup_and_record_patches

Revision ID: 9f2e1a3b5c7d
Revises: 43a4c0f37a9d
Create Date: 2026-06-06 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '9f2e1a3b5c7d'
down_revision: Union[str, None] = '43a4c0f37a9d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('price_markup_pct', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'price_markup_pct')

"""add settings history

Revision ID: 813d1e678c0e
Revises: b59297458b89
Create Date: 2026-06-23 03:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '813d1e678c0e'
down_revision: Union[str, None] = 'b59297458b89'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("settings_history", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "settings_history")

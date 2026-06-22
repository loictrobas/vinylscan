"""add record tracklist

Revision ID: aa573110a3d5
Revises: ca79cedaab9d
Create Date: 2026-06-22 16:26:35.799164

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aa573110a3d5'
down_revision: Union[str, None] = 'ca79cedaab9d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("records", sa.Column("tracklist", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("records", "tracklist")

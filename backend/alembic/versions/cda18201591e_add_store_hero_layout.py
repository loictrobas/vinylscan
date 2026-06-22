"""add store hero layout

Revision ID: cda18201591e
Revises: aa573110a3d5
Create Date: 2026-06-22 16:45:27.964064

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cda18201591e'
down_revision: Union[str, None] = 'aa573110a3d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("store_hero_layout", sa.String(20), nullable=False, server_default="gallery"))


def downgrade() -> None:
    op.drop_column("users", "store_hero_layout")

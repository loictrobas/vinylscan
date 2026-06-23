"""add theme generation history

Revision ID: 2e535de34d62
Revises: cda18201591e
Create Date: 2026-06-23 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2e535de34d62'
down_revision: Union[str, None] = 'cda18201591e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("theme_history", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "theme_history")

"""add price_step to users

Revision ID: 438ee1f77e84
Revises: baeed0ac0eee
Create Date: 2026-06-22 15:09:52.193682

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '438ee1f77e84'
down_revision: Union[str, None] = 'baeed0ac0eee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("price_step", sa.Float(), nullable=False, server_default="0.5"))


def downgrade() -> None:
    op.drop_column("users", "price_step")

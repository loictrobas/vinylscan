"""persist discogs matches + internal_confidence on scans (resume pending scans on reload)

Revision ID: baeed0ac0eee
Revises: e3e8ee12c8c4
Create Date: 2026-06-20
"""
import sqlalchemy as sa
from alembic import op

revision = 'baeed0ac0eee'
down_revision = 'e3e8ee12c8c4'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("scans", sa.Column("matches", sa.JSON(), nullable=True))
    op.add_column("scans", sa.Column("internal_confidence", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("scans", "internal_confidence")
    op.drop_column("scans", "matches")

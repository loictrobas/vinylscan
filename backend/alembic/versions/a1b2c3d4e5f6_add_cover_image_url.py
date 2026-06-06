"""add cover_image_url to records

Revision ID: a1b2c3d4e5f6
Revises: 7b2e4d1f9c3a
Create Date: 2026-06-06
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '7b2e4d1f9c3a'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('records', sa.Column('cover_image_url', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('records', 'cover_image_url')

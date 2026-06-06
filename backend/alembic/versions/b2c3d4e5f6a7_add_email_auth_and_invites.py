"""add email auth, admin flag, invites table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-06
"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    # Users: add email auth + admin/active flags
    op.add_column('users', sa.Column('email', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('password_hash', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('users', sa.Column('display_name', sa.String(255), nullable=True))

    # Make discogs_username nullable — email-only users won't have one
    op.alter_column('users', 'discogs_username', nullable=True)
    op.alter_column('users', 'discogs_oauth_token', nullable=True)
    op.alter_column('users', 'discogs_oauth_token_secret', nullable=True)

    # Unique index on email (only for non-null rows)
    op.create_index('ix_users_email', 'users', ['email'], unique=True,
                    postgresql_where=sa.text('email IS NOT NULL'))

    # Invites table
    op.create_table(
        'invites',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('token', sa.String(64), nullable=False, unique=True),
        sa.Column('created_by', sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id'), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('used_by', sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
    )
    op.create_index('ix_invites_token', 'invites', ['token'], unique=True)

    # Password reset tokens table
    op.create_table(
        'password_reset_tokens',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id'), nullable=False),
        sa.Column('token', sa.String(64), nullable=False, unique=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_prt_token', 'password_reset_tokens', ['token'], unique=True)


def downgrade():
    op.drop_table('password_reset_tokens')
    op.drop_table('invites')
    op.drop_index('ix_users_email', table_name='users')
    op.drop_column('users', 'display_name')
    op.drop_column('users', 'is_active')
    op.drop_column('users', 'is_admin')
    op.drop_column('users', 'password_hash')
    op.drop_column('users', 'email')

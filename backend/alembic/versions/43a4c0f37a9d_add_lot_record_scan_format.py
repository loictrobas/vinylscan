"""add_lot_record_scan_format

Revision ID: 43a4c0f37a9d
Revises: 63d647e9a78b
Create Date: 2026-06-05 23:05:31.837971

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '43a4c0f37a9d'
down_revision: Union[str, None] = '63d647e9a78b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE record_condition AS ENUM ('M', 'NM', 'VG+', 'VG', 'G')")
    op.execute("CREATE TYPE record_status AS ENUM ('in_stock', 'sold')")

    op.execute("""
        CREATE TABLE lots (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id),
            name VARCHAR(255) NOT NULL,
            purchase_price FLOAT,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE records (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id),
            lot_id UUID REFERENCES lots(id),
            scan_id UUID REFERENCES scans(id),
            artist VARCHAR(500),
            title VARCHAR(500),
            year INTEGER,
            label VARCHAR(255),
            catalog_number VARCHAR(255),
            format VARCHAR(50),
            condition record_condition NOT NULL DEFAULT 'VG+',
            discogs_release_id INTEGER,
            discogs_url TEXT,
            status record_status NOT NULL DEFAULT 'in_stock',
            asking_price NUMERIC(10, 2),
            sold_price NUMERIC(10, 2),
            sold_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("CREATE INDEX ix_records_user_status ON records (user_id, status)")
    op.execute("CREATE INDEX ix_records_lot_id ON records (lot_id)")
    op.execute("CREATE INDEX ix_records_discogs_release_id ON records (discogs_release_id)")

    op.add_column('scans', sa.Column('format', sa.String(50), nullable=True))

    # Seed Records from existing confirmed Scans
    op.execute("""
        INSERT INTO records (id, user_id, scan_id, artist, title, year, label, catalog_number,
                             condition, discogs_release_id, status, created_at)
        SELECT
            gen_random_uuid(),
            user_id,
            id,
            artist,
            title,
            year,
            label,
            catalog_number,
            'VG+',
            discogs_release_id,
            'in_stock',
            created_at
        FROM scans
        WHERE status IN ('manually_added', 'auto_added')
          AND discogs_release_id IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_column('scans', 'format')
    op.execute("DROP INDEX IF EXISTS ix_records_discogs_release_id")
    op.execute("DROP INDEX IF EXISTS ix_records_lot_id")
    op.execute("DROP INDEX IF EXISTS ix_records_user_status")
    op.drop_table('records')
    op.drop_table('lots')
    op.execute("DROP TYPE IF EXISTS record_status")
    op.execute("DROP TYPE IF EXISTS record_condition")

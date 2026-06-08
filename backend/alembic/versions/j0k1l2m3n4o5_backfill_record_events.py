"""backfill record_events for existing records

Revision ID: j0k1l2m3n4o5
Revises: i9j0k1l2m3n4
Create Date: 2026-06-07
"""
from alembic import op

revision = 'j0k1l2m3n4o5'
down_revision = 'i9j0k1l2m3n4'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        INSERT INTO record_events (record_id, event_type, detail, created_at)
        SELECT
            r.id,
            'added',
            CASE
                WHEN r.discogs_synced = true
                    THEN 'Synced from Discogs collection'
                        || CASE WHEN r.artist IS NOT NULL OR r.title IS NOT NULL
                                THEN ': ' || COALESCE(r.artist || ' — ' || r.title,
                                                       r.artist, r.title, '')
                                ELSE ''
                           END
                ELSE 'Added to catalog'
                     || CASE WHEN r.artist IS NOT NULL OR r.title IS NOT NULL
                             THEN ': ' || COALESCE(r.artist || ' — ' || r.title,
                                                    r.artist, r.title, '')
                             ELSE ''
                        END
            END,
            r.created_at
        FROM records r
        WHERE NOT EXISTS (
            SELECT 1 FROM record_events e
            WHERE e.record_id = r.id AND e.event_type = 'added'
        )
    """)


def downgrade():
    pass

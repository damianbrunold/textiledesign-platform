"""Convert all datetime columns to TIMESTAMPTZ (UTC)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-03 12:00:00.000000

Existing naive timestamps are reinterpreted as UTC. Most rows were already
written via datetime.utcnow(); a few user lifecycle dates were written via
naive datetime.now() and will visibly shift by the server's offset, which
is acceptable at this stage of the project.
"""
from alembic import op


revision = 'c3d4e5f6a7b8'
down_revision = 'b2c3d4e5f6a7'
branch_labels = None
depends_on = None


COLUMNS = [
    ('txuser', 'create_date'),
    ('txuser', 'verify_date'),
    ('txuser', 'access_date'),
    ('txpattern', 'created'),
    ('txpattern', 'modified'),
    ('txconversation', 'created'),
    ('txconversation_participant', 'last_read_at'),
    ('txmessage', 'created'),
]


def upgrade():
    for table, column in COLUMNS:
        op.execute(
            f"ALTER TABLE {table} "
            f"ALTER COLUMN {column} TYPE TIMESTAMP WITH TIME ZONE "
            f"USING {column} AT TIME ZONE 'UTC'"
        )


def downgrade():
    for table, column in COLUMNS:
        op.execute(
            f"ALTER TABLE {table} "
            f"ALTER COLUMN {column} TYPE TIMESTAMP WITHOUT TIME ZONE "
            f"USING {column} AT TIME ZONE 'UTC'"
        )

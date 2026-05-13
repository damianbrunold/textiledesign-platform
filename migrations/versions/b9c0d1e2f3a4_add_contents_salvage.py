"""Add contents_salvage column to txpattern

Single-slot stash for the previous `contents` when a save would
overwrite a substantial pattern with an empty one. Server-side
counterpart to the client-side localStorage draft, kept so support
can recover from a tripwire event even if the client's draft is
unavailable (other browser, private mode, quota exceeded).

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-05-13

"""
from alembic import op
import sqlalchemy as sa


revision = 'b9c0d1e2f3a4'
down_revision = 'a8b9c0d1e2f3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'txpattern',
        sa.Column('contents_salvage', sa.Text(), nullable=True),
    )


def downgrade():
    op.drop_column('txpattern', 'contents_salvage')

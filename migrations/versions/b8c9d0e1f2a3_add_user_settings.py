"""Add settings column to txuser

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-05-05 12:00:00.000000

Stores per-user editor preferences as a JSON document. Replaces the
client-side localStorage prefs that were previously used by the
DB-WEAVE editor.
"""
from alembic import op
import sqlalchemy as sa


revision = 'b8c9d0e1f2a3'
down_revision = 'a7b8c9d0e1f2'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('txuser', schema=None) as batch_op:
        batch_op.add_column(sa.Column('settings', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('txuser', schema=None) as batch_op:
        batch_op.drop_column('settings')

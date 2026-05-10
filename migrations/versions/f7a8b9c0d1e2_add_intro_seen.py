"""Add intro_seen to txuser

Revision ID: f7a8b9c0d1e2
Revises: e3f4a5b6c7d8
Create Date: 2026-05-10 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f7a8b9c0d1e2'
down_revision = 'e3f4a5b6c7d8'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('txuser', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'intro_seen',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ))


def downgrade():
    with op.batch_alter_table('txuser', schema=None) as batch_op:
        batch_op.drop_column('intro_seen')

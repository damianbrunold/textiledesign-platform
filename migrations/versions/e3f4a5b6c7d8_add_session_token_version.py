"""Add session_token_version to txuser

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-05-10 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'e3f4a5b6c7d8'
down_revision = 'd2e3f4a5b6c7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('txuser', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'session_token_version',
            sa.Integer(),
            nullable=False,
            server_default='0',
        ))


def downgrade():
    with op.batch_alter_table('txuser', schema=None) as batch_op:
        batch_op.drop_column('session_token_version')

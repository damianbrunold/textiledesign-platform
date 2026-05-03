"""Add investigation_origin_public to txpattern

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-05-03 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'e5f6a7b8c9d0'
down_revision = 'd4e5f6a7b8c9'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('txpattern', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'investigation_origin_public', sa.Boolean(), nullable=True,
        ))


def downgrade():
    with op.batch_alter_table('txpattern', schema=None) as batch_op:
        batch_op.drop_column('investigation_origin_public')

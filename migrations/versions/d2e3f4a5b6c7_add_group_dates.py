"""Add created/modified to groups

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-05-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'd2e3f4a5b6c7'
down_revision = 'c1d2e3f4a5b6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('txgroup', schema=None) as batch_op:
        batch_op.add_column(sa.Column('created', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('modified', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    with op.batch_alter_table('txgroup', schema=None) as batch_op:
        batch_op.drop_column('modified')
        batch_op.drop_column('created')

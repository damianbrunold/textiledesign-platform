"""Add user usage stats columns

Revision ID: c1d2e3f4a5b6
Revises: b8c9d0e1f2a3
Create Date: 2026-05-09 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'c1d2e3f4a5b6'
down_revision = 'b8c9d0e1f2a3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('txuser', schema=None) as batch_op:
        batch_op.add_column(sa.Column('usage_days_total', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('usage_days_year', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('usage_year', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('usage_counts', sa.Text(), nullable=True))


def downgrade():
    with op.batch_alter_table('txuser', schema=None) as batch_op:
        batch_op.drop_column('usage_counts')
        batch_op.drop_column('usage_year')
        batch_op.drop_column('usage_days_year')
        batch_op.drop_column('usage_days_total')

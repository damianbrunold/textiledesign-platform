"""Add separate password_reset_code and password_reset_expires to txuser

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-05-03 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f6a7b8c9d0e1'
down_revision = 'e5f6a7b8c9d0'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('txuser', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'password_reset_code', sa.String(length=100), nullable=True,
        ))
        batch_op.add_column(sa.Column(
            'password_reset_expires', sa.DateTime(timezone=True), nullable=True,
        ))


def downgrade():
    with op.batch_alter_table('txuser', schema=None) as batch_op:
        batch_op.drop_column('password_reset_expires')
        batch_op.drop_column('password_reset_code')

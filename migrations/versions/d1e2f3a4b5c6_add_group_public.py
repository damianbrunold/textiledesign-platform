"""Add public flag to txgroup

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-05-13 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'd1e2f3a4b5c6'
down_revision = 'c0d1e2f3a4b5'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('txgroup', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'public',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ))
    # Keep the example groups reachable via their public URL.
    op.execute(
        "UPDATE txgroup SET public = TRUE "
        "WHERE name IN ('examples', 'beispiele')"
    )


def downgrade():
    with op.batch_alter_table('txgroup', schema=None) as batch_op:
        batch_op.drop_column('public')

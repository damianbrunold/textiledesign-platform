"""Allow duplicate labels on users and groups

Labels are purely a display string; URL handles live on `name`, which
stays unique. Forcing labels to be unique surprises users (five Silvias
can't all call themselves Silvia) and adds no integrity value.

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-05-11

"""
from alembic import op


revision = 'a8b9c0d1e2f3'
down_revision = 'f7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint('txuser_label_key', 'txuser', type_='unique')
    op.drop_constraint('txgroup_label_key', 'txgroup', type_='unique')


def downgrade():
    op.create_unique_constraint('txgroup_label_key', 'txgroup', ['label'])
    op.create_unique_constraint('txuser_label_key', 'txuser', ['label'])

"""Assignments always have a group and a pattern; longer time zones

Saving a pattern's sharing form could leave assignments with a NULL
pattern_id (the owner had lost write access to the group), which made
the group pages fail. Delete such rows and forbid NULLs.

The profile offers every pytz common time zone; 36 of them are longer
than 20 characters (e.g. America/Argentina/Buenos_Aires).

Revision ID: f3a4b5c6d7e8
Revises: e7f8a9b0c1d2
Create Date: 2026-10-31 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f3a4b5c6d7e8'
down_revision = 'e7f8a9b0c1d2'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "DELETE FROM txassignment "
        "WHERE group_id IS NULL OR pattern_id IS NULL"
    )
    with op.batch_alter_table('txassignment', schema=None) as batch_op:
        batch_op.alter_column('group_id', existing_type=sa.Integer(),
                              nullable=False)
        batch_op.alter_column('pattern_id', existing_type=sa.Integer(),
                              nullable=False)
    with op.batch_alter_table('txuser', schema=None) as batch_op:
        batch_op.alter_column('timezone', existing_type=sa.String(length=20),
                              type_=sa.String(length=64),
                              existing_nullable=True)


def downgrade():
    # Time zones longer than 20 characters can't be kept.
    op.execute("UPDATE txuser SET timezone = NULL "
               "WHERE length(timezone) > 20")
    with op.batch_alter_table('txuser', schema=None) as batch_op:
        batch_op.alter_column('timezone', existing_type=sa.String(length=64),
                              type_=sa.String(length=20),
                              existing_nullable=True)
    with op.batch_alter_table('txassignment', schema=None) as batch_op:
        batch_op.alter_column('pattern_id', existing_type=sa.Integer(),
                              nullable=True)
        batch_op.alter_column('group_id', existing_type=sa.Integer(),
                              nullable=True)

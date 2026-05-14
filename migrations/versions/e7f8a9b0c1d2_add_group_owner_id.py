"""Personal groups: re-add txgroup.owner_id and scope name uniqueness

A NULL owner_id marks a global (shared) group whose name remains
globally unique. A non-NULL owner_id marks a personal group whose
name is unique only within that owner's personal groups. Two
partial unique indexes enforce this.

Revision ID: e7f8a9b0c1d2
Revises: d1e2f3a4b5c6
Create Date: 2026-05-14 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'e7f8a9b0c1d2'
down_revision = 'd1e2f3a4b5c6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('txgroup', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('owner_id', sa.Integer(), nullable=True)
        )
        batch_op.create_foreign_key(
            'txgroup_owner_id_fkey', 'txuser', ['owner_id'], ['id']
        )

    # Backfill: any group whose name matches a user's handle AND whose
    # owner-membership belongs to that user was a "primary group" — turn
    # it into that user's personal group by setting owner_id.
    op.execute(
        """
        UPDATE txgroup AS g
        SET owner_id = u.id
        FROM txuser AS u, txmembership AS m
        WHERE g.name = u.name
          AND m.group_id = g.id
          AND m.user_id = u.id
          AND m.role = 'owner'
          AND m.state = 'accepted'
        """
    )

    # Drop the table-wide UNIQUE(name) — name uniqueness is now scoped
    # by owner_id via partial indexes below. The constraint is the
    # PostgreSQL-default name from the initial migration.
    with op.batch_alter_table('txgroup', schema=None) as batch_op:
        batch_op.drop_constraint('txgroup_name_key', type_='unique')

    op.execute(
        "CREATE UNIQUE INDEX ix_txgroup_global_name "
        "ON txgroup (name) WHERE owner_id IS NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX ix_txgroup_personal_name "
        "ON txgroup (owner_id, name) WHERE owner_id IS NOT NULL"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_txgroup_personal_name")
    op.execute("DROP INDEX IF EXISTS ix_txgroup_global_name")

    # Restoring a global UNIQUE(name) requires that personal-group names
    # don't collide with anything else. Personal groups created after
    # this revision may break that, so the downgrade is best-effort.
    with op.batch_alter_table('txgroup', schema=None) as batch_op:
        batch_op.create_unique_constraint('txgroup_name_key', ['name'])
        batch_op.drop_constraint('txgroup_owner_id_fkey', type_='foreignkey')
        batch_op.drop_column('owner_id')

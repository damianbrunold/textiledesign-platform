"""Rename superuser to support; add investigation copy columns

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-03 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'd4e5f6a7b8c9'
down_revision = 'c3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "UPDATE txuser SET name='support', label='Support' "
        "WHERE name='superuser'"
    )
    op.execute(
        "UPDATE txgroup SET name='support', label='Support' "
        "WHERE name='superuser'"
    )

    with op.batch_alter_table('txpattern', schema=None) as batch_op:
        batch_op.add_column(sa.Column(
            'investigation_origin_user_id', sa.Integer(), nullable=True,
        ))
        batch_op.add_column(sa.Column(
            'investigation_origin_pattern_id', sa.Integer(), nullable=True,
        ))
        batch_op.add_column(sa.Column(
            'investigation_origin_label', sa.String(length=255),
            nullable=True,
        ))
        batch_op.create_foreign_key(
            'fk_txpattern_inv_user',
            'txuser',
            ['investigation_origin_user_id'], ['id'],
            ondelete='SET NULL',
        )
        batch_op.create_foreign_key(
            'fk_txpattern_inv_pattern',
            'txpattern',
            ['investigation_origin_pattern_id'], ['id'],
            ondelete='SET NULL',
        )


def downgrade():
    with op.batch_alter_table('txpattern', schema=None) as batch_op:
        batch_op.drop_constraint(
            'fk_txpattern_inv_pattern', type_='foreignkey',
        )
        batch_op.drop_constraint(
            'fk_txpattern_inv_user', type_='foreignkey',
        )
        batch_op.drop_column('investigation_origin_label')
        batch_op.drop_column('investigation_origin_pattern_id')
        batch_op.drop_column('investigation_origin_user_id')

    op.execute(
        "UPDATE txgroup SET name='superuser', label='Superuser' "
        "WHERE name='support'"
    )
    op.execute(
        "UPDATE txuser SET name='superuser', label='Superuser' "
        "WHERE name='support'"
    )

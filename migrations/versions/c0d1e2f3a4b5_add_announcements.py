"""Add announcements table and per-user last_seen pointer

Site-wide notice mechanism: one announcement is "current" at a time
(the most recent non-expired row). Each logged-in user dismisses by
storing the announcement id in `txuser.last_seen_announcement_id`;
the modal is only shown when a current announcement exists with a
higher id than that pointer.

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
Create Date: 2026-05-13

"""
from alembic import op
import sqlalchemy as sa


revision = 'c0d1e2f3a4b5'
down_revision = 'b9c0d1e2f3a4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'txannouncement',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('body_de', sa.Text(), nullable=False),
        sa.Column('body_en', sa.Text(), nullable=False),
        sa.Column(
            'created', sa.DateTime(timezone=True), nullable=False,
        ),
        sa.Column(
            'expires', sa.DateTime(timezone=True), nullable=False,
        ),
        sa.Column(
            'author_id',
            sa.Integer(),
            sa.ForeignKey('txuser.id', ondelete='SET NULL'),
            nullable=True,
        ),
    )
    op.add_column(
        'txuser',
        sa.Column(
            'last_seen_announcement_id',
            sa.Integer(),
            sa.ForeignKey(
                'txannouncement.id', ondelete='SET NULL',
            ),
            nullable=True,
        ),
    )


def downgrade():
    op.drop_column('txuser', 'last_seen_announcement_id')
    op.drop_table('txannouncement')

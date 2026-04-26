"""Add messaging: conversations, participants, messages

Revision ID: a1b2c3d4e5f6
Revises: fd944d6ead69
Create Date: 2026-04-26 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import datetime


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = 'fd944d6ead69'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'txconversation',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=10), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=True),
        sa.Column('created', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['group_id'], ['txgroup.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('group_id', name='uq_conversation_group'),
    )
    op.create_table(
        'txconversation_participant',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('conversation_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('last_read_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ['conversation_id'], ['txconversation.id'],
        ),
        sa.ForeignKeyConstraint(['user_id'], ['txuser.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'conversation_id', 'user_id',
            name='uq_conversation_participant',
        ),
    )
    op.create_table(
        'txmessage',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('conversation_id', sa.Integer(), nullable=False),
        sa.Column('sender_id', sa.Integer(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('deleted', sa.Boolean(), nullable=True),
        sa.ForeignKeyConstraint(
            ['conversation_id'], ['txconversation.id'],
        ),
        sa.ForeignKeyConstraint(['sender_id'], ['txuser.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_txmessage_conversation_id',
        'txmessage', ['conversation_id'],
    )
    op.create_index('ix_txmessage_created', 'txmessage', ['created'])

    # Backfill: every existing group gets a group conversation.
    bind = op.get_bind()
    now = datetime.datetime.utcnow()
    rows = bind.execute(sa.text("SELECT id FROM txgroup")).fetchall()
    for row in rows:
        bind.execute(
            sa.text(
                "INSERT INTO txconversation (kind, group_id, created) "
                "VALUES ('group', :gid, :now)"
            ),
            {"gid": row[0], "now": now},
        )


def downgrade():
    op.drop_index('ix_txmessage_created', table_name='txmessage')
    op.drop_index('ix_txmessage_conversation_id', table_name='txmessage')
    op.drop_table('txmessage')
    op.drop_table('txconversation_participant')
    op.drop_table('txconversation')

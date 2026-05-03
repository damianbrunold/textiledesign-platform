"""Remove support user's group memberships, primary group, and owned patterns

The support user can impersonate any user, so it no longer needs to hold
its own memberships, primary group, or patterns. Strip those out so the
support account is purely an admin identity.

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-05-03 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a7b8c9d0e1f2'
down_revision = 'f6a7b8c9d0e1'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()

    support = conn.execute(sa.text(
        "SELECT id FROM txuser WHERE name = 'support'"
    )).fetchone()
    if not support:
        return
    support_id = support[0]

    support_group = conn.execute(sa.text(
        "SELECT id FROM txgroup WHERE name = 'support'"
    )).fetchone()
    support_group_id = support_group[0] if support_group else None

    pattern_rows = conn.execute(sa.text(
        "SELECT id FROM txpattern WHERE owner_id = :uid"
    ), {"uid": support_id}).fetchall()
    pattern_ids = [r[0] for r in pattern_rows]

    if pattern_ids:
        conn.execute(
            sa.text(
                "DELETE FROM txassignment WHERE pattern_id IN :pids"
            ).bindparams(sa.bindparam("pids", expanding=True)),
            {"pids": pattern_ids},
        )
        conn.execute(
            sa.text(
                "DELETE FROM txpattern WHERE id IN :pids"
            ).bindparams(sa.bindparam("pids", expanding=True)),
            {"pids": pattern_ids},
        )

    conn.execute(sa.text(
        "DELETE FROM txmembership WHERE user_id = :uid"
    ), {"uid": support_id})

    if support_group_id is not None:
        conn.execute(sa.text(
            "DELETE FROM txassignment WHERE group_id = :gid"
        ), {"gid": support_group_id})
        conn.execute(sa.text(
            "DELETE FROM txmembership WHERE group_id = :gid"
        ), {"gid": support_group_id})

        conv = conn.execute(sa.text(
            "SELECT id FROM txconversation WHERE group_id = :gid"
        ), {"gid": support_group_id}).fetchone()
        if conv:
            conv_id = conv[0]
            conn.execute(sa.text(
                "DELETE FROM txmessage WHERE conversation_id = :cid"
            ), {"cid": conv_id})
            conn.execute(sa.text(
                "DELETE FROM txconversation_participant "
                "WHERE conversation_id = :cid"
            ), {"cid": conv_id})
            conn.execute(sa.text(
                "DELETE FROM txconversation WHERE id = :cid"
            ), {"cid": conv_id})

        conn.execute(sa.text(
            "DELETE FROM txgroup WHERE id = :gid"
        ), {"gid": support_group_id})


def downgrade():
    # Data deletion is not reversible.
    pass

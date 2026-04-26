"""Add pattern metadata columns and backfill from contents JSON

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-04-26 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import json


# revision identifiers, used by Alembic.
revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('txpattern', schema=None) as batch_op:
        batch_op.add_column(sa.Column('author', sa.String(length=120),
                                      nullable=True))
        batch_op.add_column(sa.Column('organization', sa.String(length=120),
                                      nullable=True))
        batch_op.add_column(sa.Column('notes', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('pattern_width', sa.Integer(),
                                      nullable=True))
        batch_op.add_column(sa.Column('pattern_height', sa.Integer(),
                                      nullable=True))
        batch_op.add_column(sa.Column('rapport_width', sa.Integer(),
                                      nullable=True))
        batch_op.add_column(sa.Column('rapport_height', sa.Integer(),
                                      nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT id, pattern_type, contents FROM txpattern"
    )).fetchall()
    for row in rows:
        pid, ptype, contents = row[0], row[1], row[2]
        try:
            data = json.loads(contents) if contents else {}
        except Exception:
            continue
        author = data.get("author")
        org = data.get("organization")
        notes = data.get("notes")
        pw = ph = rw = rh = None
        if ptype == "DB-WEAVE Pattern":
            pw = data.get("width")
            ph = data.get("height")
            ka = data.get("rapport_k_a")
            kb = data.get("rapport_k_b")
            sa_ = data.get("rapport_s_a")
            sb = data.get("rapport_s_b")
            if (
                isinstance(ka, int) and isinstance(kb, int)
                and kb >= ka >= 0
            ):
                rw = kb - ka + 1
            if (
                isinstance(sa_, int) and isinstance(sb, int)
                and sb >= sa_ >= 0
            ):
                rh = sb - sa_ + 1
        elif ptype == "JBead Pattern":
            model = data.get("model")
            if isinstance(model, list) and model:
                ph = len(model)
                if isinstance(model[0], list):
                    pw = len(model[0])
            repeat = data.get("repeat")
            if isinstance(repeat, int) and repeat > 0:
                rh = repeat
        bind.execute(
            sa.text(
                "UPDATE txpattern SET "
                "author=:author, organization=:org, notes=:notes, "
                "pattern_width=:pw, pattern_height=:ph, "
                "rapport_width=:rw, rapport_height=:rh "
                "WHERE id=:id"
            ),
            {
                "author": (author or None),
                "org": (org or None),
                "notes": (notes or None),
                "pw": pw, "ph": ph, "rw": rw, "rh": rh,
                "id": pid,
            },
        )


def downgrade():
    with op.batch_alter_table('txpattern', schema=None) as batch_op:
        batch_op.drop_column('rapport_height')
        batch_op.drop_column('rapport_width')
        batch_op.drop_column('pattern_height')
        batch_op.drop_column('pattern_width')
        batch_op.drop_column('notes')
        batch_op.drop_column('organization')
        batch_op.drop_column('author')

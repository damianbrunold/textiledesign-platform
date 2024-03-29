"""Initial migration

Revision ID: 0279ac947826
Revises:
Create Date: 2023-01-22 21:47:45.434671

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0279ac947826'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('txpatterntype',
                    sa.Column('id', sa.Integer(), nullable=False),
                    sa.Column('pattern_type', sa.String(
                        length=50), nullable=False),
                    sa.PrimaryKeyConstraint('id'),
                    sa.UniqueConstraint('pattern_type')
                    )
    op.create_table('txuser',
                    sa.Column('id', sa.Integer(), nullable=False),
                    sa.Column('name', sa.String(length=50), nullable=False),
                    sa.Column('label', sa.String(length=50), nullable=False),
                    sa.Column('email', sa.String(length=255), nullable=False),
                    sa.Column('password', sa.String(
                        length=255), nullable=False),
                    sa.Column('darkmode', sa.Boolean(), nullable=True),
                    sa.Column('verified', sa.Boolean(), nullable=True),
                    sa.Column('disabled', sa.Boolean(), nullable=True),
                    sa.Column('locale', sa.String(length=20), nullable=True),
                    sa.Column('timezone', sa.String(length=20), nullable=True),
                    sa.Column('verification_code', sa.String(
                        length=100), nullable=True),
                    sa.PrimaryKeyConstraint('id'),
                    sa.UniqueConstraint('email'),
                    sa.UniqueConstraint('label'),
                    sa.UniqueConstraint('name')
                    )
    op.create_table('txgroup',
                    sa.Column('id', sa.Integer(), nullable=False),
                    sa.Column('name', sa.String(length=50), nullable=False),
                    sa.Column('label', sa.String(length=50), nullable=False),
                    sa.Column('owner_id', sa.Integer(), nullable=True),
                    sa.Column('description', sa.Text(), nullable=False),
                    sa.ForeignKeyConstraint(['owner_id'], ['txuser.id'], ),
                    sa.PrimaryKeyConstraint('id'),
                    sa.UniqueConstraint('label'),
                    sa.UniqueConstraint('name')
                    )
    op.create_table('txpattern',
                    sa.Column('id', sa.Integer(), nullable=False),
                    sa.Column('name', sa.String(length=100), nullable=False),
                    sa.Column('label', sa.String(length=100), nullable=False),
                    sa.Column('owner_id', sa.Integer(), nullable=True),
                    sa.Column('pattern_type_id', sa.Integer(), nullable=True),
                    sa.Column('description', sa.Text(), nullable=True),
                    sa.Column('contents', sa.Text(), nullable=True),
                    sa.Column('preview_image',
                              sa.LargeBinary(), nullable=True),
                    sa.Column('thumbnail_image',
                              sa.LargeBinary(), nullable=True),
                    sa.Column('created', sa.DateTime(), nullable=True),
                    sa.Column('modified', sa.DateTime(), nullable=True),
                    sa.Column('public', sa.Boolean(), nullable=True),
                    sa.ForeignKeyConstraint(['owner_id'], ['txuser.id'], ),
                    sa.ForeignKeyConstraint(['pattern_type_id'], [
                                            'txpatterntype.id'], ),
                    sa.PrimaryKeyConstraint('id'),
                    sa.UniqueConstraint('owner_id', 'name')
                    )
    op.create_table('txgrouppattern',
                    sa.Column('group', sa.Integer(), nullable=False),
                    sa.Column('pattern', sa.Integer(), nullable=False),
                    sa.ForeignKeyConstraint(['group'], ['txgroup.id'], ),
                    sa.ForeignKeyConstraint(['pattern'], ['txpattern.id'], ),
                    sa.PrimaryKeyConstraint('group', 'pattern')
                    )
    op.create_table('txusergroup',
                    sa.Column('user', sa.Integer(), nullable=False),
                    sa.Column('group', sa.Integer(), nullable=False),
                    sa.ForeignKeyConstraint(['group'], ['txgroup.id'], ),
                    sa.ForeignKeyConstraint(['user'], ['txuser.id'], ),
                    sa.PrimaryKeyConstraint('user', 'group')
                    )
    op.create_table('txusergroupinvite',
                    sa.Column('user', sa.Integer(), nullable=False),
                    sa.Column('group', sa.Integer(), nullable=False),
                    sa.ForeignKeyConstraint(['group'], ['txgroup.id'], ),
                    sa.ForeignKeyConstraint(['user'], ['txuser.id'], ),
                    sa.PrimaryKeyConstraint('user', 'group')
                    )
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('txusergroupinvite')
    op.drop_table('txusergroup')
    op.drop_table('txgrouppattern')
    op.drop_table('txpattern')
    op.drop_table('txgroup')
    op.drop_table('txuser')
    op.drop_table('txpatterntype')
    # ### end Alembic commands ###

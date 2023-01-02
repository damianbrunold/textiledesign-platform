"""Initial migration

Revision ID: 01cafa606122
Revises:
Create Date: 2023-01-02 21:14:22.758741

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '01cafa606122'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('txgroup',
                    sa.Column('name', sa.String(length=100), nullable=False),
                    sa.Column('label', sa.String(length=255), nullable=False),
                    sa.Column('owner', sa.String(length=100), nullable=False),
                    sa.Column('description', sa.Text(), nullable=False),
                    sa.PrimaryKeyConstraint('name'),
                    sa.UniqueConstraint('label')
                    )
    op.create_table('txpattern',
                    sa.Column('name', sa.String(length=100), nullable=False),
                    sa.Column('owner', sa.String(length=100), nullable=False),
                    sa.Column('label', sa.String(length=255), nullable=False),
                    sa.Column('pattern_type', sa.String(
                        length=100), nullable=False),
                    sa.Column('description', sa.Text(), nullable=True),
                    sa.Column('contents', sa.Text(), nullable=True),
                    sa.Column('preview_image',
                              sa.LargeBinary(), nullable=True),
                    sa.Column('thumbnail_image',
                              sa.LargeBinary(), nullable=True),
                    sa.Column('created', sa.DateTime(), nullable=True),
                    sa.Column('modified', sa.DateTime(), nullable=True),
                    sa.Column('public', sa.Boolean(), nullable=True),
                    sa.PrimaryKeyConstraint('name', 'owner'),
                    sa.UniqueConstraint('owner', 'label')
                    )
    op.create_table('txpermission',
                    sa.Column('pattern', sa.String(
                        length=100), nullable=False),
                    sa.Column('user', sa.String(length=100), nullable=False),
                    sa.Column('view', sa.Boolean(), nullable=True),
                    sa.Column('edit', sa.Boolean(), nullable=True),
                    sa.Column('delete', sa.Boolean(), nullable=True),
                    sa.Column('share', sa.Boolean(), nullable=True),
                    sa.Column('publish', sa.Boolean(), nullable=True),
                    sa.PrimaryKeyConstraint('pattern', 'user')
                    )
    op.create_table('txtype',
                    sa.Column('pattern_type', sa.String(
                        length=100), nullable=False),
                    sa.PrimaryKeyConstraint('pattern_type')
                    )
    op.create_table('txuser',
                    sa.Column('name', sa.String(length=100), nullable=False),
                    sa.Column('label', sa.String(length=255), nullable=False),
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
                    sa.PrimaryKeyConstraint('name'),
                    sa.UniqueConstraint('email'),
                    sa.UniqueConstraint('label')
                    )
    op.create_table('txusergroup',
                    sa.Column('user', sa.String(length=100), nullable=False),
                    sa.Column('group', sa.String(length=100), nullable=False),
                    sa.ForeignKeyConstraint(['group'], ['txgroup.name'], ),
                    sa.ForeignKeyConstraint(['user'], ['txuser.name'], ),
                    sa.PrimaryKeyConstraint('user', 'group')
                    )
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('txusergroup')
    op.drop_table('txuser')
    op.drop_table('txtype')
    op.drop_table('txpermission')
    op.drop_table('txpattern')
    op.drop_table('txgroup')
    # ### end Alembic commands ###

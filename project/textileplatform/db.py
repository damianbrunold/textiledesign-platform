import sqlalchemy

from sqlalchemy import (
    MetaData,
    Table,
    Column,
    String,
    DateTime,
    Boolean,
    Text,
    LargeBinary
)
from sqlalchemy import UniqueConstraint, PrimaryKeyConstraint
from sqlalchemy import insert

import click
from flask import current_app, g
from flask.cli import with_appcontext

from werkzeug.security import generate_password_hash as gen_pw_hash

metadata = MetaData()

user_table = Table(
    "txuser",
    metadata,
    Column("name", String(100), primary_key=True),
    Column("label", String(255), nullable=False),
    Column("email", String(255), nullable=False),
    Column("password", String(255), nullable=False),
    Column("darkmode", Boolean),
    Column("verified", Boolean),
    Column("disabled", Boolean),
    Column("locale", String(20)),
    Column("timezone", String(20)),
    Column("verification_code", String(100)),
    UniqueConstraint("name"),
    UniqueConstraint("label"),
    UniqueConstraint("email"),
)

group_table = Table(
    "txgroup",
    metadata,
    Column("name", String(100), primary_key=True),
    Column("label", String(255), nullable=False),
    Column("owner", String(100), nullable=False),
    Column("description", Text, nullable=False),
    UniqueConstraint("label"),
)

pattern_table = Table(
    "txpattern",
    metadata,
    Column("name", String(100), nullable=False),
    Column("label", String(255), nullable=False),
    Column("owner", String(100), nullable=False),
    Column("pattern_type", String(100), nullable=False),
    Column("description", Text),
    Column("contents", Text),
    Column("preview_image", LargeBinary),
    Column("thumbnail_image", LargeBinary),
    Column("created", DateTime),
    Column("modified", DateTime),
    Column("public", Boolean),
    PrimaryKeyConstraint("owner", "name"),
    UniqueConstraint("owner", "label"),
)

permission_table = Table(
    "txpermission",
    metadata,
    Column("pattern", String(100), nullable=False),
    Column("user", String(100), nullable=False),
    Column("view", Boolean),
    Column("edit", Boolean),
    Column("delete", Boolean),
    Column("share", Boolean),
    Column("publish", Boolean),
    PrimaryKeyConstraint("pattern", "user"),
)

pattern_type_table = Table(
    "txtype",
    metadata,
    Column("pattern_type", String(100), primary_key=True)
)

user_group_table = Table(
    "txusergroup",
    metadata,
    Column("user", String(100), nullable=False),
    Column("group", String(100), nullable=False),
    PrimaryKeyConstraint("user", "group")
)

pin_table = Table(
    "txpin",
    metadata,
    Column("pattern", String(100), nullable=False),
    Column("user", String(100), nullable=False),
    PrimaryKeyConstraint("pattern", "user")
)


def get_db():
    if 'engine' not in g:
        g.engine = sqlalchemy.create_engine(
            current_app.config['DATABASE'], client_encoding="utf8")
    return g.engine


def close_db(e=None):
    engine = g.pop('engine', None)
    if engine is not None:
        engine.dispose()


def init_db():
    engine = get_db()

    metadata.drop_all(engine)
    metadata.create_all(engine)

    with engine.begin() as conn:
        conn.execute(insert(pattern_type_table).values(
            pattern_type="DB-WEAVE Pattern"))
        conn.execute(insert(pattern_type_table).values(
            pattern_type="JBead Pattern"))
        conn.execute(insert(pattern_type_table).values(
            pattern_type="Generic Image"))
        conn.execute(
            insert(user_table).values(
                name="superuser",
                label="Superuser",
                email="admin@textileplatform.ch",
                darkmode=True,
                verified=True,
                disabled=False,
                locale="en",
                timezone="CET",
                password=gen_pw_hash(current_app.config['ADMIN_PASSWORD']))
        )
        conn.execute(
            insert(user_table).values(
                name="weave",
                label="Weave",
                email="weave@textileplatform.ch",
                darkmode=True,
                verified=True,
                disabled=False,
                locale="en",
                timezone="CET",
                password=gen_pw_hash(current_app.config['ADMIN_PASSWORD']))
        )
        conn.execute(
            insert(user_table).values(
                name="bead",
                label="Bead",
                email="bead@textileplatform.ch",
                darkmode=True,
                verified=True,
                disabled=False,
                locale="en",
                timezone="CET",
                password=gen_pw_hash(current_app.config['ADMIN_PASSWORD']))
        )


@click.command('init-db')
@with_appcontext
def init_db_command():
    """Clear the existing data and create new tables"""
    init_db()
    click.echo('Initialized the database.')


def init_app(app):
    app.teardown_appcontext(close_db)
    app.cli.add_command(init_db_command)

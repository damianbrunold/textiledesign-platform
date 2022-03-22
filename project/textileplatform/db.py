import datetime
import sqlalchemy

from sqlalchemy import MetaData, Table, Column, Integer, String, DateTime, Boolean, Text, LargeBinary
from sqlalchemy import UniqueConstraint, PrimaryKeyConstraint
from sqlalchemy import insert

import click
from flask import current_app, g
from flask.cli import with_appcontext

from werkzeug.security import generate_password_hash

metadata = MetaData()

user_table = Table(
    "txuser",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("name", String(100), nullable=False),
    Column("email", String(255), nullable=False),
    Column("password", String(255), nullable=False),
    Column("darkmode", Boolean),
    Column("verified", Boolean),
    Column("disabled", Boolean),
    Column("locale", String(20)),
    Column("timezone", String(20))
)

group_table = Table(
    "txgroup",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("owner_id", Integer, nullable=False),
    Column("name", String(100), nullable=False),
    Column("description", Text, nullable=False),
)

document_table = Table(
    "txdoc",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("owner_id", Integer, nullable=False),
    Column("type_id", Integer, nullable=False),
    Column("name", String(255)),
    Column("description", Text),
    Column("contents", Text),
    Column("preview_image", LargeBinary),
    Column("thumbnail_image", LargeBinary),
    Column("created", DateTime),
    Column("modified", DateTime),
    Column("public", Boolean)
)

type_table = Table(
    "txtype",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("label", String(100), nullable=False)
)

user_group_table = Table(
    "txusergroup",
    metadata,
    Column("user_id", Integer, nullable=False),
    Column("group_id", Integer, nullable=False),
    PrimaryKeyConstraint("user_id", "group_id")
)

document_pin_table = Table(
    "txdocpin",
    metadata,
    Column("doc_id", Integer, nullable=False),
    Column("user_id", Integer, nullable=False),
    PrimaryKeyConstraint("doc_id", "user_id")
)

def get_db():
    if 'engine' not in g:
        g.engine = sqlalchemy.create_engine(current_app.config['DATABASE'], client_encoding="utf8")
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
        conn.execute(insert(type_table).values(id=0, label="DB-WEAVE Pattern"))
        conn.execute(insert(type_table).values(id=1, label="JBEAD Pattern"))
        conn.execute(insert(type_table).values(id=2, label="Generic Image"))
        conn.execute(
            insert(user_table).values(
                id=0, 
                name="Superuser",
                email="admin@textileplatform.ch",
                darkmode=True, 
                verified=True, 
                disabled=False,
                password=generate_password_hash(current_app.config['ADMIN_PASSWORD']))
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


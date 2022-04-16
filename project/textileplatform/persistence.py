import datetime
import json
import os

from sqlalchemy import select, insert, update, delete, literal_column, func, or_, and_

from textileplatform.db import (
    get_db, 
    user_table,
    document_table
)
from textileplatform.model import User, Document

def add_weave_pattern(pattern, user_id):
    with get_db().begin() as conn:
        now = datetime.datetime.now()
        conn.execute(
            insert(document_table).values(
                owner_id=user_id,
                type_id=0,
                name=pattern['name'],
                description=pattern['notes'],
                contents=json.dumps(pattern),
                created=now,
                modified=now,
                public=False
            )
        )


def add_bead_pattern(pattern, user_id):
    with get_db().begin() as conn:
        now = datetime.datetime.now()
        conn.execute(
            insert(document_table).values(
                owner_id=user_id,
                type_id=1,
                name=pattern['name'],
                description=pattern['notes'],
                contents=json.dumps(pattern),
                created=now,
                modified=now,
                public=False
            )
        )


def get_patterns_for_userid(user_id):
    with get_db().connect() as conn:
        rows = conn.execute(
            select(
                document_table.c.id,
                document_table.c.owner_id,
                document_table.c.type_id,
                document_table.c.name,
                document_table.c.description,
                document_table.c.contents,
                document_table.c.preview_image,
                document_table.c.thumbnail_image,
                document_table.c.created,
                document_table.c.modified,
                document_table.c.public
            ).
            select_from(document_table).
            where(document_table.c.owner_id == user_id).
            order_by(document_table.c.type_id, document_table.c.name)
        ).fetchall()
        result = []
        if rows:
            for row in rows:
                result.append(Document.from_row(row))
        return result


def get_pattern_by_name(user_id, name):
    with get_db().connect() as conn:
        row = conn.execute(
            select(
                document_table.c.id,
                document_table.c.owner_id,
                document_table.c.type_id,
                document_table.c.name,
                document_table.c.description,
                document_table.c.contents,
                document_table.c.preview_image,
                document_table.c.thumbnail_image,
                document_table.c.created,
                document_table.c.modified,
                document_table.c.public
            ).
            select_from(document_table).
            where(document_table.c.owner_id == user_id).
            where(document_table.c.name == name)
        ).fetchone()
        if not row: return None
        return Document.from_row(row)


def add_user(user):
    with get_db().begin() as conn:
        user.id = conn.execute(
            insert(user_table).values(
                display=user.display,
                name=user.name,
                email=user.email,
                password=user.password,
                darkmode=user.darkmode,
                verified=user.verified,
                disabled=user.disabled,
                locale=user.locale,
                timezone=user.timezone
            ).returning(user_table.c.id)
        ).fetchone()[0]
        return user


def update_user(user):
    with get_db().begin() as conn:
        conn.execute(
            update(user_table).values(
                display=user.display,
                name=user.name,
                email=user.email,
                password=user.password,
                darkmode=user.darkmode,
                verified=user.verified,
                disabled=user.disabled,
                locale=user.locale,
                timezone=user.timezone
            ).where(user_table.c.id == user.id)
        )


def get_user_by_id(user_id):
    with get_db().connect() as conn:
        row = conn.execute(
            select(
                user_table.c.id,
                user_table.c.display,
                user_table.c.name,
                user_table.c.email,
                user_table.c.password,
                user_table.c.darkmode,
                user_table.c.verified,
                user_table.c.disabled,
                user_table.c.locale,
                user_table.c.timezone
            ).
            select_from(user_table).
            where(user_table.c.id == user_id)
        ).fetchone()
        if not row: return None
        user = User.from_row(row)
        return user


def get_user_by_email(email):
    with get_db().connect() as conn:
        row = conn.execute(
            select(
                user_table.c.id,
                user_table.c.display,
                user_table.c.name,
                user_table.c.email,
                user_table.c.password,
                user_table.c.darkmode,
                user_table.c.verified,
                user_table.c.disabled,
                user_table.c.locale,
                user_table.c.timezone
            ).
            select_from(user_table).
            where(user_table.c.email == email)
        ).fetchone()
        if not row: return None
        user = User.from_row(row)
        return user


def get_user_by_name(name):
    with get_db().connect() as conn:
        row = conn.execute(
            select(
                user_table.c.id,
                user_table.c.display,
                user_table.c.name,
                user_table.c.email,
                user_table.c.password,
                user_table.c.darkmode,
                user_table.c.verified,
                user_table.c.disabled,
                user_table.c.locale,
                user_table.c.timezone
            ).
            select_from(user_table).
            where(user_table.c.name == name)
        ).fetchone()
        if not row: return None
        user = User.from_row(row)
        return user


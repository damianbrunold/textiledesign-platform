import datetime
import json
import os

from sqlalchemy import select, insert, update, delete

from textileplatform.db import (
    get_db,
    user_table,
    pattern_table
)
from textileplatform.model import (
    User,
    Pattern
)


def add_weave_pattern(pattern, user_name):
    with get_db().begin() as conn:
        now = datetime.datetime.utcnow()
        conn.execute(
            insert(pattern_table).values(
                name=pattern['name'].replace("..", "").replace("/", "").replace("\\", ""),
                label=pattern['name'],
                owner=user_name,
                pattern_type="DB-WEAVE Pattern",
                description=pattern['notes'],
                contents=json.dumps(pattern),
                created=now,
                modified=now,
                public=False
            )
        )


def add_bead_pattern(pattern, user_name):
    with get_db().begin() as conn:
        now = datetime.datetime.utcnow()
        conn.execute(
            insert(pattern_table).values(
                name=pattern['name'].replace("..", "").replace("/", "").replace("\\", ""),
                label=pattern['name'],
                owner=user_name,
                pattern_type="JBead Pattern",
                description=pattern['notes'],
                contents=json.dumps(pattern),
                created=now,
                modified=now,
                public=False
            )
        )


def get_patterns_for_user_name(user_name):
    with get_db().connect() as conn:
        rows = conn.execute(
            select(
                pattern_table.c.name,
                pattern_table.c.label,
                pattern_table.c.owner,
                pattern_table.c.pattern_type,
                pattern_table.c.description,
                pattern_table.c.contents,
                pattern_table.c.preview_image,
                pattern_table.c.thumbnail_image,
                pattern_table.c.created,
                pattern_table.c.modified,
                pattern_table.c.public
            ).
            select_from(pattern_table).
            where(pattern_table.c.owner == user_name).
            order_by(pattern_table.c.pattern_type, pattern_table.c.label)
        ).fetchall()
        result = []
        if rows:
            for row in rows:
                result.append(Pattern.from_row(row))
        return result


def get_pattern_by_name(user_name, name):
    with get_db().connect() as conn:
        row = conn.execute(
            select(
                pattern_table.c.name,
                pattern_table.c.label,
                pattern_table.c.owner,
                pattern_table.c.pattern_type,
                pattern_table.c.description,
                pattern_table.c.contents,
                pattern_table.c.preview_image,
                pattern_table.c.thumbnail_image,
                pattern_table.c.created,
                pattern_table.c.modified,
                pattern_table.c.public
            ).
            select_from(pattern_table).
            where(pattern_table.c.owner == user_name).
            where(pattern_table.c.name == name)
        ).fetchone()
        if not row: return None
        return Pattern.from_row(row)


def update_pattern(user_name, pattern):
    with get_db().begin() as conn:
        conn.execute(
            update(pattern_table).values(
                label=pattern.label,
                description=pattern.description,
                contents=pattern.contents,
                preview_image=pattern.preview_image,
                thumbnail_image=pattern.thumbnail_image,
                modified=datetime.datetime.utcnow(),
                public=pattern.public
            ).where(pattern_table.c.name == pattern.name)
            .where(pattern_table.c.owner == user_name)
        )


def clone_pattern(user_name, pattern):
    with get_db().begin() as conn:
        conn.execute(
            insert(pattern_table).values(
                name=pattern.name,
                label=pattern.label,
                owner=user_name,
                description=pattern.description,
                pattern_type=pattern.pattern_type,
                contents=pattern.contents,
                preview_image=pattern.preview_image,
                thumbnail_image=pattern.thumbnail_image,
                created=datetime.datetime.utcnow(),
                modified=datetime.datetime.utcnow(),
                public=False
            )
        )


def add_user(user):
    with get_db().begin() as conn:
        conn.execute(
            insert(user_table).values(
                name=user.name,
                label=user.label,
                email=user.email,
                password=user.password,
                darkmode=user.darkmode,
                verified=user.verified,
                disabled=user.disabled,
                locale=user.locale,
                timezone=user.timezone
            )
        )


def update_user(user):
    with get_db().begin() as conn:
        conn.execute(
            update(user_table).values(
                label=user.label,
                email=user.email,
                password=user.password,
                darkmode=user.darkmode,
                verified=user.verified,
                disabled=user.disabled,
                locale=user.locale,
                timezone=user.timezone
            ).where(user_table.c.name == user.name)
        )


def get_user_by_name(name):
    with get_db().connect() as conn:
        row = conn.execute(
            select(
                user_table.c.name,
                user_table.c.label,
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


def get_user_by_email(email):
    with get_db().connect() as conn:
        row = conn.execute(
            select(
                user_table.c.name,
                user_table.c.label,
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

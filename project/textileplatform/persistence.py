import datetime
import json

from sqlalchemy import select, insert, update, delete, func

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
                name=pattern['name'].replace("..", "").replace(
                    "/", "").replace("\\", ""),
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
                name=pattern['name'].replace("..", "").replace(
                    "/", "").replace("\\", ""),
                label=pattern['name'],
                owner=user_name,
                pattern_type="JBead Pattern",
                description=pattern['notes'],
                contents=json.dumps(pattern),
                created=now,
                modified=now,
                public=False,
            )
        )


def get_patterns_for_user_name(user_name, only_public=False):
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
                pattern_table.c.public,
            ).
            select_from(pattern_table).
            where(pattern_table.c.owner == user_name).
            order_by(pattern_table.c.pattern_type,
                     func.lower(pattern_table.c.label))
        ).fetchall()
        result = []
        if rows:
            for row in rows:
                if only_public and not row.public:
                    continue
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
                pattern_table.c.public,
            ).
            select_from(pattern_table).
            where(pattern_table.c.owner == user_name).
            where(pattern_table.c.name == name)
        ).fetchone()
        if not row:
            return None
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
                public=pattern.public,
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
                public=False,
            )
        )


def delete_pattern(user_name, pattern):
    with get_db().begin() as conn:
        conn.execute(
            delete(pattern_table)
            .where(pattern_table.c.name == pattern.name)
            .where(pattern_table.c.owner == user_name)
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
                timezone=user.timezone,
                verification_code=user.verification_code,
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
                timezone=user.timezone,
                verification_code=user.verification_code,
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
                user_table.c.timezone,
                user_table.c.verification_code,
            ).
            select_from(user_table).
            where(user_table.c.name == name)
        ).fetchone()
        if not row:
            return None
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
                user_table.c.timezone,
                user_table.c.verification_code,
            ).
            select_from(user_table).
            where(user_table.c.email == email)
        ).fetchone()
        if not row:
            return None
        user = User.from_row(row)
        return user


def get_all_users():
    with get_db().connect() as conn:
        rows = conn.execute(
            select(
                user_table.c.name,
                user_table.c.label,
                user_table.c.email,
                user_table.c.password,
                user_table.c.darkmode,
                user_table.c.verified,
                user_table.c.disabled,
                user_table.c.locale,
                user_table.c.timezone,
                user_table.c.verification_code,
            ).
            select_from(user_table)
        ).fetchall()
        result = []
        for row in rows:
            result.append(User.from_row(row))
        return result

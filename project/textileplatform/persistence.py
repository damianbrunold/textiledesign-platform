import datetime

from sqlalchemy import select, insert, update, delete, literal_column, func, or_, and_

from textileplatform.db import (
    get_db, 
    user_table 
)
from textileplatform.model import User


def add_user(user):
    with get_db().begin() as conn:
        user.id = conn.execute(
            insert(user_table).values(
                name=user.name,
                email=user.email,
                password=user.password,
                darkmode=user.darkmode,
                verified=user.verified,
                disabled=user.disabled
            ).returning(user_table.c.id)
        ).fetchone()[0]
        return user


def update_user(user):
    with get_db().begin() as conn:
        conn.execute(
            update(user_table).values(
                name=user.name,
                email=user.email,
                password=user.password,
                darkmode=user.darkmode,
                verified=user.verified,
                disabled=user.disabled
            ).where(user_table.c.id == user.id)
        )


def get_user_by_id(user_id):
    with get_db().connect() as conn:
        row = conn.execute(
            select(
                user_table.c.id,
                user_table.c.name,
                user_table.c.email,
                user_table.c.password,
                user_table.c.darkmode,
                user_table.c.verified,
                user_table.c.disabled
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
                user_table.c.name,
                user_table.c.email,
                user_table.c.password,
                user_table.c.darkmode,
                user_table.c.verified,
                user_table.c.disabled
            ).
            select_from(user_table).
            where(user_table.c.email == email)
        ).fetchone()
        if not row: return None
        user = User.from_row(row)
        return user


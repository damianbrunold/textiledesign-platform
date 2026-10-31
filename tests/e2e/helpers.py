"""Data and login helpers for the e2e tests (see conftest.py)."""
import contextlib
import json
import threading

from werkzeug.security import generate_password_hash

from textileplatform.db import db
from textileplatform.models import Group, Membership, Pattern, User
from textileplatform.patterns import (
    add_pattern, new_bead_pattern, new_weave_pattern,
)

DB_LOCK = threading.RLock()

PASSWORD = "correcthorse1"


@contextlib.contextmanager
def db_access():
    """Use the database from test code; commits and releases the
    session on exit, so the server sees the changes."""
    with DB_LOCK:
        try:
            yield db.session
            db.session.commit()
        finally:
            db.session.remove()


# ---------- data ------------------------------------------------------


def make_user(name, *, email=None, password=PASSWORD, locale="en"):
    """Create a verified user with their primary group. Returns a dict
    (ORM objects don't outlive db_access)."""
    email = email or f"{name}@example.com"
    with db_access() as s:
        user = User(
            name=name, label=name.capitalize(), email=email,
            email_lower=email.lower(),
            password=generate_password_hash(password),
            verified=True, disabled=False, session_token_version=0,
            locale=locale,
        )
        s.add(user)
        s.flush()
        group = Group(name=name, label=name.capitalize(), description="",
                      owner_id=user.id)
        s.add_all([group, Membership(user=user, group=group, role="owner",
                                     state="accepted")])
    return {"name": name, "email": email, "password": password}


def make_weave_pattern(owner, name, *, width=40, height=30, public=False,
                       **changes):
    contents = new_weave_pattern(name, owner.capitalize(), width, height)
    contents.update(changes)
    return _store(owner, contents, "DB-WEAVE Pattern", public)


def make_bead_pattern(owner, name, *, width=12, height=40, public=False):
    contents = new_bead_pattern(name, owner.capitalize(), width, height)
    return _store(owner, contents, "JBead Pattern", public)


def _store(owner, contents, pattern_type, public):
    with db_access():
        user = User.query.filter_by(name=owner).one()
        name = add_pattern(contents, user, pattern_type)
        if public:
            _pattern(owner, name).public = True
    return name


def _pattern(owner, name):
    return (Pattern.query.join(User, Pattern.owner_id == User.id)
            .filter(User.name == owner, Pattern.name == name).one())


def stored_contents(owner, name):
    """The pattern JSON as stored on the server."""
    with db_access():
        return json.loads(_pattern(owner, name).contents)


# ---------- browser ---------------------------------------------------


def login(page, user):
    page.goto("/auth/login")
    page.fill("#email", user["email"])
    page.fill("#password", user["password"])
    with page.expect_navigation():
        page.click("button[type=submit]")

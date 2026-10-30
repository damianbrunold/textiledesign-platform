from textileplatform.db import db
from textileplatform.models import User
from textileplatform.models import Group
from textileplatform.models import Membership
from textileplatform.models import Assignment
from textileplatform.support import SUPPORT_USERNAME

from werkzeug.security import generate_password_hash as gen_pw_hash

import datetime


# Accounts whose public patterns serve as examples for visitors.
_EXAMPLE_USERS = (
    ("examples", "Examples", "en"),
    ("beispiele", "Beispiele", "de"),
)


def _add_primary_group(user, now):
    group = Group(
        name=user.name,
        label=user.label,
        description="",
        owner_id=user.id,
        created=now,
    )
    db.session.add(group)
    db.session.add(Membership(
        group=group, user=user, role="owner", state="accepted",
    ))
    return group


def _add_account(app, name, label, email, locale, now):
    user = User(
        name=name,
        label=label,
        email=email,
        email_lower=email.lower(),
        darkmode=True,
        verified=True,
        disabled=False,
        locale=locale,
        timezone="CET",
        password=gen_pw_hash(app.config["ADMIN_PASSWORD"]),
        create_date=now,
        verify_date=now,
        access_date=None,
    )
    db.session.add(user)
    db.session.flush()
    return user


def ensure_db_contents(app):
    """Create the support and example accounts if missing, and give every
    user (except support) a primary group holding their patterns."""
    with app.app_context():
        now = datetime.datetime.now(datetime.timezone.utc)
        if User.query.count() == 0:
            _add_account(app, SUPPORT_USERNAME, "Support",
                         "admin@textileplatform.ch", "en", now)
            db.session.commit()
        for name, label, locale in _EXAMPLE_USERS:
            if User.query.filter(User.name == name).one_or_none():
                continue
            user = _add_account(app, name, label,
                                f"{name}@textileplatform.ch", locale, now)
            _add_primary_group(user, now)
            db.session.commit()
        for user in User.query.all():
            if user.name == SUPPORT_USERNAME:
                continue
            group = Group.query.filter(
                Group.owner_id == user.id,
                Group.name == user.name,
            ).one_or_none()
            if group:
                continue
            group = _add_primary_group(user, now)
            for pattern in user.mypatterns:
                db.session.add(Assignment(group=group, pattern=pattern))
            db.session.commit()

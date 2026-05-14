from textileplatform.db import db
from textileplatform.models import User
from textileplatform.models import Group
from textileplatform.models import Membership
from textileplatform.models import Assignment
from textileplatform.support import SUPPORT_USERNAME

from werkzeug.security import generate_password_hash as gen_pw_hash

import datetime

def ensure_db_contents(app):
    with app.app_context():
        now = datetime.datetime.now(datetime.timezone.utc)
        if User.query.count() == 0:
            db.session.add(User(
                name=SUPPORT_USERNAME,
                label="Support",
                email="admin@textileplatform.ch",
                email_lower="admin@textileplatform.ch",
                darkmode=True,
                verified=True,
                disabled=False,
                locale="en",
                timezone="CET",
                password=gen_pw_hash(app.config["ADMIN_PASSWORD"]),
                create_date=now,
                verify_date=now,
                access_date=None,
            ))
            db.session.commit()
        examples = User.query.filter(User.name == "examples").one_or_none()
        if not examples:
            examples = User(
                name="examples",
                label="Examples",
                email="examples@textileplatform.ch",
                email_lower="examples@textileplatform.ch",
                darkmode=True,
                verified=True,
                disabled=False,
                locale="en",
                timezone="CET",
                password=gen_pw_hash(app.config["ADMIN_PASSWORD"]),
                create_date=now,
                verify_date=now,
                access_date=None,
            )
            db.session.add(examples)
            db.session.flush()
            group = Group(
                name=examples.name,
                label=examples.label,
                description="",
                owner_id=examples.id,
                created=now,
            )
            db.session.add(group)
            membership = Membership(
                group=group,
                user=examples,
                role="owner",
                state="accepted",
            )
            db.session.add(membership)
            db.session.commit()
        beispiele = User.query.filter(User.name == "beispiele").one_or_none()
        if not beispiele:
            beispiele = User(
                name="beispiele",
                label="Beispiele",
                email="beispiele@textileplatform.ch",
                email_lower="beispiele@textileplatform.ch",
                darkmode=True,
                verified=True,
                disabled=False,
                locale="de",
                timezone="CET",
                password=gen_pw_hash(app.config["ADMIN_PASSWORD"]),
                create_date=now,
                verify_date=now,
                access_date=None,
            )
            db.session.add(beispiele)
            db.session.flush()
            group = Group(
                name=beispiele.name,
                label=beispiele.label,
                description="",
                owner_id=beispiele.id,
                created=now,
            )
            db.session.add(group)
            membership = Membership(
                group=group,
                user=beispiele,
                role="owner",
                state="accepted",
            )
            db.session.add(membership)
            db.session.commit()
        for user in User.query.all():
            if user.name == SUPPORT_USERNAME:
                continue
            group = Group.query.filter(
                Group.owner_id == user.id,
                Group.name == user.name,
            ).one_or_none()
            if not group:
                # Create default personal group for user and assign all
                # owned patterns to it.
                group = Group(
                    name=user.name,
                    label=user.label,
                    description="",
                    owner_id=user.id,
                    created=now,
                )
                db.session.add(group)
                membership = Membership(
                    group=group,
                    user=user,
                )
                db.session.add(membership)
                for pattern in user.mypatterns:
                    assignment = Assignment(
                        group=group,
                        pattern=pattern,
                    )
                    db.session.add(assignment)
                db.session.commit()

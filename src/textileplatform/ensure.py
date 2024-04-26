from textileplatform.db import db
from textileplatform.models import User
from textileplatform.models import Group
from textileplatform.models import Membership
from textileplatform.models import Assignment

from werkzeug.security import generate_password_hash as gen_pw_hash


def ensure_db_contents(app):
    with app.app_context():
        if User.query.count() == 0:
            db.session.add(User(
                name="superuser",
                label="Superuser",
                email="admin@textileplatform.ch",
                darkmode=True,
                verified=True,
                disabled=False,
                locale="en",
                timezone="CET",
                password=gen_pw_hash(app.config["ADMIN_PASSWORD"])
            ))
            db.session.commit()
        examples = User.query.filter(User.name == "examples").one_or_none()
        if not examples:
            examples = User(
                name="examples",
                label="Examples",
                email="examples@textileplatform.ch",
                darkmode=True,
                verified=True,
                disabled=False,
                locale="en",
                timezone="CET",
                password=gen_pw_hash(app.config["ADMIN_PASSWORD"])
            )
            db.session.add(examples)
            group = Group(
                name=examples.name,
                label=examples.label,
                description="",
            )
            db.session.add(group)
            membership = Membership(
                group=group,
                user=examples,
            )
            db.session.add(membership)
            superuser = (
                User.query.filter(User.name == "superuser").one_or_none()
            )
            if superuser:
                membership = Membership(
                    group=group,
                    user=superuser,
                )
                db.session.add(membership)
            db.session.commit()
        for user in User.query.all():
            group = Group.query.filter(Group.name == user.name).one_or_none()
            if not group:
                # Create default group for user and assign all owned
                # patterns to the group
                group = Group(
                    name=user.name,
                    label=user.label,
                    description="",
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

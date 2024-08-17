from textileplatform.app import app
from textileplatform.db import db
from textileplatform.ensure import ensure_db_contents
from textileplatform.patterns import add_weave_pattern
from textileplatform.patterns import add_bead_pattern
from textileplatform.palette import default_weave_palette
from textileplatform.palette import default_bead_palette
from textileplatform.models import User
from textileplatform.models import Group
from textileplatform.models import Membership
from textileplatform.models import Pattern
import textileplatform.controller  # noqa

import datetime
import os

import click
from dotenv import load_dotenv
from flask import g
from flask import request
from flask_babel import Babel
from flask_migrate import Migrate
from werkzeug.security import generate_password_hash

load_dotenv()

app.config.update(
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SQLALCHEMY_DATABASE_URI=os.environ["DATABASE"],
    SQLALCHEMY_TRACK_MODIFICATIONS=False,
    SECRET_KEY=os.environ["SECRET_KEY"],
    ADMIN_PASSWORD=os.environ["ADMIN_PASSWORD"],
)


def get_locale():
    user = getattr(g, "user", None)
    if user is not None and user.locale:
        return user.locale
    return request.accept_languages.best_match(["de", "en"])


def get_timezone():
    user = getattr(g, "user", None)
    if user is not None:
        return user.timezone


babel = Babel(app, locale_selector=get_locale, timezone_selector=get_timezone)

db.init_app(app)
Migrate(app, db)


@click.command("init-db")
def init_db_command():
    ensure_db_contents(app)
    click.echo("Prepared the database.")


@click.command("list-access")
def list_access():
    with app.app_context():
        for user in User.query.order_by(db.desc(User.access_date)).all():
            if user.access_date:
                print(
                    f"{user.id:3} {user.name:<25} "
                    f"{user.access_date.isoformat()}"
                )
        for user in User.query.order_by(db.desc(User.access_date)).all():
            if not user.access_date:
                print(
                    f"{user.id:3} {user.name:<25}"
                )


@click.command("list-users")
def list_users():
    with app.app_context():
        for user in User.query.order_by(User.id).all():
            print(
                f"{user.id:3} {user.name:<25} {user.label:<25} "
                f"{user.email:<50} {user.verified}"
            )


@click.command("user-patterns")
@click.argument("user-name")
def user_patterns(user_name):
    with app.app_context():
        user = User.query.filter(User.name == user_name).first()
        if not user:
            print("user not found")
            return
        for m in user.memberships:
            for a in m.group.assignments:
                print(
                    f"{m.group.name} {a.pattern.name}"
                )


@click.command("clean-up-non-verified-users")
def clean_up_non_verified_users():
    with app.app_context():
        todelete = []
        for user in User.query.order_by(User.id).all():
            # only clean up non-verified
            if user.verified:
                continue
            # never clean up accounts with patterns
            if user.mypatterns:
                continue
            # only clean up 24 hours after account creation
            if user.verify_date: 
                delta = datetime.datetime.now() - user.verify_date
                if delta.days < 1:
                    continue
            todelete.append(user)
        if todelete:
            ok = input(
                f"Really delete {', '.join([u.name for u in todelete])}? "
                "(y/N) "
            )
            if ok == "y":
                for user in todelete:
                    db.session.delete(user)
                db.session.commit()


@click.command("delete-user")
@click.argument("user-name")
def delete_user(user_name):
    with app.app_context():
        user = User.query.filter(User.name == user_name).first()
        if not user:
            print("user not found")
            return
        ok = input(f"Really delete user {user.name}? (y/N) ")
        if ok != "y":
            print("cancelled")
            return
        for m in user.memberships:
            if m.role == "owner":
                for a in m.group.assignments:
                    db.session.delete(a.pattern)
                    db.session.delete(a)
                db.session.delete(m.group)
                db.session.delete(m)
        db.session.delete(user)
        db.session.commit()


@click.command("delete-user-pattern")
@click.argument("user-name")
@click.argument("pattern-name")
def delete_user_pattern(user_name, pattern_name):
    with app.app_context():
        user = User.query.filter(User.name == user_name).first()
        if not user:
            print("user not found")
            return
        pattern = (
            Pattern.query
                .filter(Pattern.name == pattern_name)
                .filter(Pattern.owner_id == user.id)
                .first()
        )
        if not pattern:
            print("pattern not found")
            return
        ok = input(f"Really delete pattern {user.name} {pattern.name}? (y/N) ")
        if ok != "y":
            print("cancelled")
            return
        for a in pattern.assignments:
            db.session.delete(a)
        db.session.delete(pattern)
        db.session.commit()


@click.command("create-weave-pattern")
@click.argument("user-name")
@click.argument("pattern-name")
def create_weave_pattern(user_name, pattern_name):
    with app.app_context():
        user = User.query.filter(User.name == user_name).first()
        if not user:
            print("user not found")
            return
        width = 300
        height = 300
        pattern = dict()
        pattern["name"] = pattern_name
        pattern["author"] = user.label
        pattern["organization"] = ""
        pattern["notes"] = ""
        pattern["width"] = width
        pattern["height"] = height
        pattern["max_shafts"] = 32
        pattern["max_treadles"] = 32
        pattern["data_entering"] = [0] * width
        pattern["data_tieup"] = (
            [0] * (pattern["max_shafts"] * pattern["max_treadles"])
        )
        pattern["data_treadling"] = (
            [0] * (pattern["max_treadles"] * height)
        )
        pattern["data_reed"] = (
            ([0, 0, 1, 1] * ((width + 3) // 4))[0:width]
        )
        pattern["colors_warp"] = [55] * width
        pattern["colors_weft"] = [49] * height
        pattern["palette"] = default_weave_palette[:]
        pattern["visible_shafts"] = 12
        pattern["visible_treadles"] = 12
        pattern["warp_lifting"] = True
        pattern["zoom"] = 3
        pattern["single_treadling"] = True
        pattern["display_repeat"] = False
        pattern["display_reed"] = True
        pattern["display_colors_warp"] = True
        pattern["display_colors_weft"] = True
        pattern["display_entering"] = True
        pattern["display_threading"] = True
        pattern["direction_righttoleft"] = False
        pattern["directon_toptobottom"] = False
        pattern["direction_entering_at_bottom"] = False
        pattern["entering_style"] = "dash"
        pattern["treadling_style"] = "dot"
        pattern["tieup_style"] = "cross"
        pattern["weave_style"] = "draft"
        add_weave_pattern(pattern, user)
        db.session.commit()


@click.command("create-bead-pattern")
@click.argument("user-name")
@click.argument("pattern-name")
def create_bead_pattern(user_name, pattern_name):
    with app.app_context():
        user = User.query.filter(User.name == user_name).first()
        if not user:
            print("user not found")
            return
        width = 12
        height = 200
        pattern = dict()
        pattern["name"] = pattern_name
        pattern["author"] = user.label
        pattern["organization"] = ""
        pattern["notes"] = ""
        pattern["model"] = [[0] * width] * height
        pattern["colors"] = default_bead_palette[:]
        view = dict()
        view["draft-visible"] = True
        view["corrected-visible"] = True
        view["simulation-visible"] = True
        view["report-visible"] = True
        view["zoom"] = 2
        view["shift"] = 0
        view["scroll"] = 0
        view["selected-tool"] = "select"
        view["selected-color"] = 1
        pattern["view"] = view
        add_bead_pattern(pattern, user)
        db.session.commit()


@click.command("reset-password")
@click.argument("user-name")
def reset_password(user_name):
    with app.app_context():
        user = User.query.filter(User.name == user_name).first()
        if not user:
            print("user not found")
            return
        psw = input("new password: ")
        user.password = generate_password_hash(psw)
        db.session.commit()


@click.command("ensure-primary-groups")
def ensure_primary_groups():
    with app.app_context():
        changed = False
        for user in User.query.order_by(User.id).all():
            group = Group.query.filter(Group.name == user.name).one_or_none()
            if group:
                continue
            print(f"create primary group for {user.name}")
            group = Group(
                name=user.name,
                label=user.label,
                description='',
            )
            membership = Membership(
                user=user,
                group=group,
                role="owner",
                state="accepted",
            )
            db.session.add(group)
            db.session.add(membership)
            changed = True
        if changed:
            db.session.commit()


app.cli.add_command(init_db_command)
app.cli.add_command(list_access)
app.cli.add_command(list_users)
app.cli.add_command(user_patterns)
app.cli.add_command(delete_user)
app.cli.add_command(delete_user_pattern)
app.cli.add_command(create_weave_pattern)
app.cli.add_command(create_bead_pattern)
app.cli.add_command(reset_password)
app.cli.add_command(ensure_primary_groups)
app.cli.add_command(clean_up_non_verified_users)

application = app

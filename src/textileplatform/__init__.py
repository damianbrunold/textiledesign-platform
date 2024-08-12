from textileplatform.app import app
from textileplatform.db import db
from textileplatform.ensure import ensure_db_contents
from textileplatform.models import User
import textileplatform.controller  # noqa

import os

import click
from dotenv import load_dotenv
from flask import g
from flask import request
from flask_babel import Babel
from flask_migrate import Migrate

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


app.cli.add_command(init_db_command)
app.cli.add_command(list_users)
app.cli.add_command(user_patterns)
app.cli.add_command(delete_user)

application = app

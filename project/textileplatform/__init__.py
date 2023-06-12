from textileplatform import admin
from textileplatform import api
from textileplatform import auth
from textileplatform import main
from textileplatform.models import db
from textileplatform.models import ensure_db_contents

import os

import click
from dotenv import load_dotenv
from flask import Flask
from flask import g
from flask import request
from flask_babel import Babel
from flask_migrate import Migrate

load_dotenv()

app = Flask(__name__)

app.config.update(
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SQLALCHEMY_DATABASE_URI=os.environ["SQLALCHEMY_DATABASE_URI"],
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


try:
    os.makedirs(app.instance_path)
except OSError:
    pass

db.init_app(app)
Migrate(app, db)


@click.command("init-db")
def init_db_command():
    ensure_db_contents(app)
    click.echo("Prepared the database.")


app.cli.add_command(init_db_command)

app.register_blueprint(auth.bp)
app.register_blueprint(api.bp)
app.register_blueprint(admin.bp)
app.register_blueprint(main.bp)

app.add_url_rule("/", endpoint="index")

application = app

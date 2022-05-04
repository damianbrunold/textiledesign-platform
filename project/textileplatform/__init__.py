from . import main
from . import api
from . import auth
from . import db
import os

from flask import Flask, g, request
from flask_babel import Babel

app = Flask(__name__, instance_relative_config=True)
app.config.from_mapping(
    SECRET_KEY='dev',
    DATABASE="postgresql+pg8000://textileplatform:textileplatform@localhost/textileplatform",  # noqa
    ADMIN_PASSWORD='dev'
)
app.config.from_pyfile('config.py', silent=True)

babel = Babel(app)


@babel.localeselector
def get_locale():
    user = getattr(g, 'user', None)
    if user is not None:
        return user.locale
    return request.accept_languages.best_match(['de', 'fr', 'en'])


@babel.timezoneselector
def get_timezone():
    user = getattr(g, 'user', None)
    if user is not None:
        return user.timezone


try:
    os.makedirs(app.instance_path)
except OSError:
    pass

db.init_app(app)

app.register_blueprint(auth.bp)

app.register_blueprint(api.bp)

app.register_blueprint(main.bp)
app.add_url_rule('/', endpoint='index')

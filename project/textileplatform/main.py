from importlib.metadata import version
from sqlalchemy.exc import IntegrityError
from flask_babel import gettext

from flask import (
    Blueprint, flash, g, redirect, render_template, render_template_string, request, url_for
)

bp = Blueprint('main', __name__)

from textileplatform.persistence import update_user, get_user_by_name
from textileplatform.auth import login_required


@bp.route('/')
def index():
    return render_template('main/index.html')


@bp.route('/<string:name>')
def user(name):
    user = get_user_by_name(name.lower())
    if not user:
        return redirect(url_for('main.index'))
    elif g.user and g.user.name == user.name:
        # show private view
        patterns = [] # TODO load patterns
        return render_template('main/user_private.html', user=user, patterns=patterns)
    else:
        # show public view
        patterns = [] # TODO load patterns
        return render_template('main/user_public.html', user=user, patterns=patterns)


@bp.route('/status')
def status():
    try:
        v = version('textileplatform')
    except Exception:
        v = "-"
    return render_template('main/status.html', v = v)


@bp.route('/profile', methods=('GET', 'POST'))
@login_required
def profile():
    if request.method == 'POST':
        email = request.form['email']
        darkmode = 'darkmode' in request.form
        
        user = g.user
        user.email = email
        # TODO reset verified?!
        user.darkmode = darkmode

        error = None
        
        try:
            update_user(user)
        except IntegrityError as e:
            app.logger.exception("Profile changes not changed")
            error = gettext('Changes could not be saved.')
        else:
            return redirect(url_for("main.user", name=user.name))

        flash(error)

    return render_template('main/profile.html', user=g.user)


@bp.route('/upload', methods=('GET', 'POST'))
@login_required
def upload_pattern():
    if request.method == 'POST':
        pass

    return render_template('main/upload_pattern.html')


@bp.route('/create', methods=('GET', 'POST'))
@login_required
def create_pattern():
    if request.method == 'POST':
        pass

    return render_template('main/create_pattern.html')


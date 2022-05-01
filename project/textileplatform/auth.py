import datetime
import functools

from flask_babel import gettext, get_locale, get_timezone

from sqlalchemy.exc import IntegrityError

from flask import (
    Blueprint, flash, g, redirect, render_template, request, session, url_for
)
from werkzeug.security import check_password_hash, generate_password_hash

from textileplatform.model import User
from textileplatform.persistence import (
        get_user_by_name, 
        get_user_by_email, 
        add_user
)
from textileplatform.name import from_display

bp = Blueprint('auth', __name__, url_prefix='/auth')

@bp.route('/register', methods=('GET', 'POST'))
def register():
    if request.method == 'POST':
        name = request.form['name']
        email = request.form['email']
        password = request.form['password']

        error = None

        if not name:
            error = gettext('Name is required')
        elif not email:
            error = gettext('E-Mail is required')
        elif not password:
            error = gettext('Password is required')

        if error is None:
            try:
                user = User()
                user.name = from_display(name)
                user.label = name
                user.email = email
                user.password = generate_password_hash(password)
                user.darkmode = False
                user.verified = True
                user.disabled = False
                user.locale = get_locale()
                user.timezone = get_timezone()
                add_user(user)
            except IntegrityError:
                error = gettext('Name or E-Mail is already used')
            else:
                session.clear()
                session['user_name'] = user.name
                session.permanent = True
                return redirect(url_for('main.user', name=user.name))

        flash(error)

    return render_template('auth/register.html')


@bp.route('/login', methods=('GET', 'POST'))
def login():
    if request.method == 'POST':
        email = request.form['email']
        password = request.form['password']
        error = None
        user = get_user_by_email(email)

        if user is None:
            error = gettext('Login data are not correct')
        elif not check_password_hash(user.password, password):
            error = gettext('Login data are not correct')
        elif user.verified == 0:
            error = gettext('Account verification is pending')
        elif user.disabled == 1:
            error = gettext('Account is disabled')

        if error is None:
            session.clear()
            session['user_name'] = user.name
            session.permanent = True
            return redirect(url_for('main.user', name=user.name))

        flash(error)

    return render_template('auth/login.html')


@bp.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))


@bp.route('/recover', methods=('GET', 'POST'))
def recover():
    if request.method == 'POST':
        # TODO
        pass
    return render_template('auth/recover.html')


@bp.before_app_request
def load_logged_in_user():
    user_name = session.get('user_name')

    if user_name is None:
        g.user = None
    else:
        g.user = get_user_by_name(user_name)


def login_required(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            return redirect(url_for('auth.login'))
        return view(**kwargs)
    return wrapped_view

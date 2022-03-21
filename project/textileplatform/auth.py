import datetime
import functools

from sqlalchemy.exc import IntegrityError

from flask import (
    Blueprint, flash, g, redirect, render_template, request, session, url_for
)
from werkzeug.security import check_password_hash, generate_password_hash

from textileplatform.model import User
from textileplatform.persistence import (
        get_user_by_id, 
        get_user_by_email, 
        add_user
)

bp = Blueprint('auth', __name__, url_prefix='/auth')

@bp.route('/register', methods=('GET', 'POST'))
def register():
    if request.method == 'POST':
        name = request.form['name']
        email = request.form['email']
        password = request.form['password']

        error = None

        if not name:
            error = 'Name muss ausgefüllt werden.'
        elif not email:
            error = 'E-Mail muss ausgefüllt werden.'
        elif not password:
            error = 'Passwort muss ausgefüllt werden.'

        if error is None:
            try:
                user = User()
                user.name = name
                user.email = email
                user.password = generate_password_hash(password)
                user.darkmode = False
                user.verified = True
                user.disabled = False
                add_user(user)
            except IntegrityError:
                error = f"E-Mail {email} ist bereits registriert."
            else:
                return redirect(url_for("auth.login"))

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
            error = 'Benutzerdaten sind nicht korrekt.'
        elif not check_password_hash(user.password, password):
            error = 'Benutzerdaten sind nicht korrekt.'
        elif user.verified == 0:
            error = 'Konto muss zuerst verifiziert werden.'
        elif user.disabled == 1:
            error = 'Konto ist deaktiviert.'

        if error is None:
            session.clear()
            session['user_id'] = user.id
            session.permanent = True
            return redirect(url_for('main.index'))

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
    user_id = session.get('user_id')

    if user_id is None:
        g.user = None
    else:
        g.user = get_user_by_id(user_id)


def login_required(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            return redirect(url_for('auth.login'))
        return view(**kwargs)
    return wrapped_view


import email.message
import functools
import secrets
import smtplib

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
    add_user,
    update_user,
)
from textileplatform.name import (
    from_display,
    is_valid
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
            error = gettext('Name is required')
        elif not email:
            error = gettext('E-Mail is required')
        elif not password:
            error = gettext('Password is required')

        label = name
        name = from_display(label)

        if not is_valid(name):
            error = gettext('Name is reserved and cannot be used')

        if error is None:
            try:
                user = User()
                user.name = name
                user.label = label
                user.email = email
                user.password = generate_password_hash(password)
                user.darkmode = False
                user.verified = False
                user.disabled = False
                user.locale = get_locale()
                user.timezone = get_timezone()
                user.verification_code = secrets.token_urlsafe(30)
                add_user(user)
            except IntegrityError:
                error = gettext('Name or E-Mail is already used')
            else:
                send_verification_mail(user)
                print(f'verify/{user.name}/{user.verification_code}')
                return render_template(
                    'auth/verification_pending.html',
                    user=user
                )

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
        elif not user.verified:
            error = gettext('Account verification is pending')
        elif user.disabled:
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


@bp.route('/verify/<string:user_name>/<string:verification_code>')
def verify(user_name, verification_code):
    user = get_user_by_name(user_name)
    if not user:
        return render_template('auth/verification_failed.html')
    if not user.verified and user.verification_code == verification_code:
        user.verified = True
        user.verification_code = None
        try:
            update_user(user)
        except IntegrityError:
            # return render_template('auth/verification_failed.html')
            raise
        else:
            return render_template('auth/verification_successful.html')
    return render_template('auth/verification_failed.html')


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


def superuser_required(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None or g.user.name != "superuser":
            return redirect(url_for("main.index"))
        return view(**kwargs)
    return wrapped_view


def send_verification_mail(user):
    msg = email.message.EmailMessage()
    msg.set_content(
        gettext('Please verify your account by entering the following link:') +
        '\r\n' +
        '\r\n' +
        url_for(
            'auth.verify',
            user_name=user.name,
            verification_code=user.verification_code,
            _external=True
        )
    )
    msg['Subject'] = gettext('Texile-Platform account verification')
    msg['From'] = 'admin@textil-plattform.ch'
    msg['To'] = user.email
    s = smtplib.SMTP('localhost')
    s.send_message(msg)
    s.quit()

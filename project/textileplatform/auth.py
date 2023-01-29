from textileplatform.models import db
from textileplatform.models import User
from textileplatform.name import from_label
from textileplatform.name import is_valid

import email.message
import functools
import logging
import secrets
import smtplib

import babel
from flask_babel import gettext
from flask_babel import get_locale
from flask_babel import get_timezone
from flask import abort
from flask import Blueprint
from flask import flash
from flask import g
from flask import redirect
from flask import render_template
from flask import request
from flask import session
from flask import url_for
import pytz
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash
from werkzeug.security import check_password_hash
from werkzeug.exceptions import HTTPException


bp = Blueprint("auth", __name__, url_prefix="/auth")


@bp.route("/register", methods=("GET", "POST"))
def register():
    if request.method == "POST":
        name = request.form["name"]
        email = request.form["email"]
        password = request.form["password"]

        error = None

        if not name:
            error = gettext("Name is required")
        elif not email:
            error = gettext("E-Mail is required")
        elif not password:
            error = gettext("Password is required")

        label = name
        name = from_label(label)

        if not is_valid(name):
            error = gettext("Name is invalid and cannot be used")

        if error is None:
            try:
                locale = get_locale() or babel.Locale("de", "CH")
                tz = get_timezone() or pytz.timezone("Europe/Zurich")
                user = User(
                    name=name,
                    label=label,
                    email=email,
                    password=generate_password_hash(password),
                    darkmode=False,
                    verified=False,
                    disabled=False,
                    locale=str(locale),
                    timezone=str(tz),
                    verification_code=secrets.token_urlsafe(30),
                )
                db.session.add(user)
                db.session.commit()

                send_verification_mail(user)
                send_admin_notification_mail(user, "User created account")
                print(f"verify/{user.name}/{user.verification_code}")
                return render_template(
                    "auth/verification_pending.html",
                    user=user
                )
            except IntegrityError:
                error = gettext("Name or E-Mail is already used")
            except HTTPException:
                raise
            except Exception:
                logging.exception("System error")
                error = gettext("System error")

        flash(error)

    return render_template("auth/register.html")


@bp.route("/login", methods=("GET", "POST"))
def login():
    if request.method == "POST":
        email = request.form["email"]
        password = request.form["password"]
        error = None
        try:
            user = User.query.filter(User.email == email).first()

            if user is None:
                error = gettext("Login data are not correct")
            elif not check_password_hash(user.password, password):
                error = gettext("Login data are not correct")
            elif not user.verified:
                error = gettext("Account verification is pending")
            elif user.disabled:
                error = gettext("Account is disabled")
        except HTTPException:
            raise
        except Exception:
            logging.exception("system error")
            error = gettext("System error")

        if error is None:
            session.clear()
            session["user_name"] = user.name
            session.permanent = True
            return redirect(url_for("main.user", user_name=user.name))

        flash(error)

    return render_template("auth/login.html")


@bp.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@bp.route("/verify/<string:user_name>/<string:verification_code>")
def verify(user_name, verification_code):
    try:
        user = User.query.filter(User.name == user_name).first()
        if not user:
            return render_template("auth/verification_failed.html")
        if not user.verified and user.verification_code == verification_code:
            user.verified = True
            user.verification_code = None
            try:
                db.session.commit()
                send_admin_notification_mail(
                    user, "User completed email account verification step")
            except IntegrityError:
                return render_template("auth/verification_failed.html")
            else:
                return render_template("auth/verification_successful.html")
        return render_template("auth/verification_failed.html")
    except HTTPException:
        raise
    except Exception:
        logging.exception("system error")
        abort(500)


@bp.route("/recover", methods=("GET", "POST"))
def recover():
    if request.method == "POST":
        error = None

        email = request.form["email"]
        if not email:
            error = gettext("E-Mail is required.")
        try:
            user = User.query.filter(User.email == email).first()
            if not user:
                error = gettext("E-Mail is unknown.")
        except Exception:
            error = gettext("System error")

        if error is None:
            try:
                user.verification_code = secrets.token_urlsafe(30)
                db.session.commit()
                send_recover_mail(user)
                send_admin_notification_mail(
                    user,
                    "User requested password recovery",
                )
                return render_template(
                    "auth/recover_mail_sent.html",
                    user=user
                )
            except IntegrityError:
                error = gettext("Could not save changes.")
            except HTTPException:
                raise
            except Exception:
                logging.exception("system error")
                error = gettext("System error")

        flash(error)

    return render_template("auth/recover.html")


@bp.route("/reset-password/<string:user_name>/<string:verification_code>", methods=("GET", "POST"))  # noqa E501
def reset_password(user_name, verification_code):
    try:
        user = User.query.filter(User.name == user_name).first()
        if not user:
            return render_template("auth/recover_failed.html")
        if user.verification_code != verification_code:
            return render_template("auth/recover_failed.html")

        if request.method == "POST":
            error = None
            password = request.form["password"]
            if not password:
                error = gettext("Password is required.")

            if error is None:
                try:
                    user.password = generate_password_hash(password)
                    db.session.commit()
                    send_admin_notification_mail(
                        user,
                        "User successfully reset password",
                    )
                except IntegrityError:
                    error = gettext("Could not save changes.")
                else:
                    return render_template("auth/recover_success.html")

            flash(error)

        return render_template("auth/recover_set_password.html")
    except HTTPException:
        raise
    except Exception:
        logging.exception("system error")
        abort(500)


@bp.before_app_request
def load_logged_in_user():
    user_name = session.get("user_name")
    if user_name is None:
        g.user = None
    else:
        try:
            g.user = User.query.filter(User.name == user_name).first()
        except Exception:
            g.user = None


def login_required(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            return redirect(url_for("auth.login"))
        return view(**kwargs)
    return wrapped_view


def superuser_required(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None or g.user.name != "superuser":
            return redirect(url_for("main.index"))
        return view(**kwargs)
    return wrapped_view


def send_mail(receiver, subject, message):
    msg = email.message.EmailMessage()
    msg.set_content(message)
    msg["Subject"] = subject
    msg["From"] = "admin@texil-plattform.ch"
    msg["To"] = receiver
    s = smtplib.SMTP("localhost")
    s.send_message(msg)
    s.quit()


def send_verification_mail(user):
    message = "\r\n".join([
        gettext("Please verify your account by clicking or entering the following link:"),  # noqa E501
        "",
        "",
        url_for(
            "auth.verify",
            user_name=user.name,
            verification_code=user.verification_code,
            _external=True
        ),
    ])
    send_mail(
        user.email,
        gettext("Texile-Platform account verification"),
        message,
    )


def send_recover_mail(user):
    message = "\r\n".join([
        gettext("Reset your password by clicking or entering the following link:"),  # noqa E501
        "",
        "",
        url_for(
            "auth.reset_password",
            user_name=user.name,
            verification_code=user.verification_code,
            _external=True
        ),
    ])
    send_mail(
        user.email,
        gettext("Texile-Platform password reset"),
        message,
    )


def send_admin_notification_mail(user, message):
    send_mail(
        "admin@textil-plattform.ch",
        "Textile-Platform admin notification",
        f"{user.name} <{user.email}>: {message}",
    )

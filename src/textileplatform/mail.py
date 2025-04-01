from email import message
import smtplib

from flask import url_for
from flask_babel import gettext


def send_mail(receiver, subject, content):
    msg = message.EmailMessage()
    msg.set_content(content)
    msg["Subject"] = subject
    msg["From"] = "admin@textil-plattform.ch"
    msg["To"] = receiver
    s = smtplib.SMTP("localhost")
    s.send_message(msg)
    s.quit()


def send_verification_mail(user):
    message = "\r\n".join([
        gettext(
            "Please verify your account by clicking or entering the "
            "following link:"
        ),
        "",
        "",
        url_for(
            "verify",
            user_name=user.name,
            verification_code=user.verification_code,
            _external=True,
            _scheme="https",
        ),
    ])
    send_mail(
        user.email,
        gettext("Texile-Platform account verification"),
        message,
    )


def send_recover_mail(user):
    message = "\r\n".join([
        gettext(
            "Reset your password by clicking or entering the following link:"
        ),
        "",
        "",
        url_for(
            "reset_password",
            user_name=user.name,
            verification_code=user.verification_code,
            _external=True,
            _scheme="https",
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

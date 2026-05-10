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
            verification_code=user.password_reset_code,
            _external=True,
            _scheme="https",
        ),
    ])
    send_mail(
        user.email,
        gettext("Texile-Platform password reset"),
        message,
    )


def send_email_changed_notice(user, old_email):
    """Notify both the old and the new address that the user's e-mail
    was changed. Sent only after the change is committed. The message
    to the OLD address is the security-relevant one — it's the only
    channel a rightful owner still has if the change wasn't theirs."""
    new_email = user.email
    old_msg = "\r\n".join([
        gettext(
            "The e-mail address on your Textile-Platform account was "
            "changed."
        ),
        "",
        gettext("Old address: %(old)s", old=old_email),
        gettext("New address: %(new)s", new=new_email),
        "",
        gettext(
            "If you did not request this change, please contact support "
            "immediately."
        ),
    ])
    new_msg = "\r\n".join([
        gettext(
            "Your Textile-Platform account is now reachable at this "
            "e-mail address."
        ),
        "",
        gettext(
            "If you did not request this change, please contact support."
        ),
    ])
    subject = gettext("Textile-Platform: e-mail address changed")
    if old_email and old_email.lower() != new_email.lower():
        send_mail(old_email, subject, old_msg)
    send_mail(new_email, subject, new_msg)


def send_admin_notification_mail(user, message):
    send_mail(
        "admin@textil-plattform.ch",
        "Textile-Platform admin notification",
        f"{user.name} <{user.email}>: {message}",
    )


def send_support_dm_mail(sender, message_body, conversation_url):
    body = "\r\n".join([
        f"From: {sender.label} ({sender.name}) <{sender.email}>",
        f"Conversation: {conversation_url}",
        "",
        message_body,
    ])
    send_mail(
        "support@textil-plattform.ch",
        f"Support message from {sender.label}",
        body,
    )

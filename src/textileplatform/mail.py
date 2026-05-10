import datetime
from email import message
import smtplib

from flask import url_for
from flask_babel import force_locale, get_locale, gettext


SUPPORT_ADDRESS = "support@textil-plattform.ch"


def send_mail(receiver, subject, content):
    msg = message.EmailMessage()
    msg.set_content(content)
    msg["Subject"] = subject
    msg["From"] = SUPPORT_ADDRESS
    msg["To"] = receiver
    s = smtplib.SMTP("localhost")
    s.send_message(msg)
    s.quit()


def _greeting(user):
    return gettext("Hello %(label)s,", label=user.label)


def _signoff():
    return gettext("— The Textile-Platform team")


def _format_when(dt):
    """Format a UTC timestamp in the current locale. German uses
    dd.mm.yyyy; everything else falls back to ISO yyyy-mm-dd. The
    'UTC' suffix is appended literally so recipients across timezones
    don't have to guess."""
    loc = str(get_locale() or "en")
    if loc.startswith("de"):
        return dt.strftime("%d.%m.%Y %H:%M UTC")
    return dt.strftime("%Y-%m-%d %H:%M UTC")


def send_verification_mail(user):
    with force_locale(user.locale or "en"):
        verify_url = url_for(
            "verify",
            user_name=user.name,
            verification_code=user.verification_code,
            _external=True,
            _scheme="https",
        )
        body = "\r\n".join([
            _greeting(user),
            "",
            gettext(
                "Please verify your account by opening the following "
                "link:"
            ),
            "",
            verify_url,
            "",
            gettext(
                "If you did not create an account on Textile-Platform, "
                "you can ignore this message."
            ),
            "",
            _signoff(),
        ])
        send_mail(
            user.email,
            gettext("Confirm your Textile-Platform account"),
            body,
        )


def send_recover_mail(user):
    with force_locale(user.locale or "en"):
        reset_url = url_for(
            "reset_password",
            user_name=user.name,
            verification_code=user.password_reset_code,
            _external=True,
            _scheme="https",
        )
        body = "\r\n".join([
            _greeting(user),
            "",
            gettext(
                "We received a request to reset the password on your "
                "Textile-Platform account. Open the link below to "
                "choose a new password:"
            ),
            "",
            reset_url,
            "",
            gettext(
                "The link is valid for one hour. If you did not "
                "request a password reset, you can ignore this "
                "message — your password will not be changed."
            ),
            "",
            _signoff(),
        ])
        send_mail(
            user.email,
            gettext("Reset your Textile-Platform password"),
            body,
        )


def send_email_changed_notice(user, old_email):
    """Notify both the old and the new address that the user's e-mail
    was changed. Sent only after the change is committed. The message
    to the OLD address is the security-relevant one — it's the only
    channel a rightful owner still has if the change wasn't theirs.

    Forced into the recipient's preferred locale so an admin acting on
    a German user's account doesn't send an English e-mail — and the
    timestamp is formatted in the matching local convention."""
    new_email = user.email
    now = datetime.datetime.now(datetime.timezone.utc)
    # Use a mailto: link, not the in-app support page. If the change
    # wasn't authorised, the legitimate user can't log in any more
    # (e-mail is the login credential and the attacker now owns it),
    # so an in-app link would be a dead end exactly when it matters.
    support_link = f"mailto:{SUPPORT_ADDRESS}"

    with force_locale(user.locale or "en"):
        when = _format_when(now)
        old_msg = "\r\n".join([
            _greeting(user),
            "",
            gettext(
                "The e-mail address on your Textile-Platform account "
                "was changed on %(when)s.",
                when=when,
            ),
            "",
            gettext("Old address: %(old)s", old=old_email),
            gettext("New address: %(new)s", new=new_email),
            "",
            gettext(
                "If you requested this change, no further action is "
                "needed."
            ),
            gettext(
                "If you did not request this change, your account may "
                "have been compromised. Please contact support "
                "immediately:"
            ),
            support_link,
            "",
            _signoff(),
        ])
        new_msg = "\r\n".join([
            _greeting(user),
            "",
            gettext(
                "Your Textile-Platform account is now reachable at "
                "this e-mail address."
            ),
            "",
            gettext(
                "If you did not request this change, please contact "
                "support:"
            ),
            support_link,
            "",
            _signoff(),
        ])
        subject = gettext(
            "Your Textile-Platform e-mail address was changed"
        )
        if old_email and old_email.lower() != new_email.lower():
            send_mail(old_email, subject, old_msg)
        send_mail(new_email, subject, new_msg)


def send_admin_notification_mail(user, message):
    send_mail(
        SUPPORT_ADDRESS,
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
        SUPPORT_ADDRESS,
        f"Support message from {sender.label}",
        body,
    )

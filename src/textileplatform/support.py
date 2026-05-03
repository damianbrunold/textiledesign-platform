"""Support user constants and helpers.

The support user is the privileged admin account. It is identified by the
reserved username `support`. It can impersonate any other user, has access
to the admin console (users / groups / patterns), receives an email for
each direct message addressed to it, and may pull "investigation copies"
of any user pattern for debugging without touching the original.
"""
from textileplatform.models import User


SUPPORT_USERNAME = "support"
SUPPORT_EMAIL = "support@textil-plattform.ch"


def get_support_user():
    return User.query.filter(User.name == SUPPORT_USERNAME).first()


def is_support(user):
    return user is not None and user.name == SUPPORT_USERNAME

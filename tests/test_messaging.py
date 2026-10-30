"""Unread message counts."""
import datetime

from textileplatform.db import db
from textileplatform.messaging import (
    conversations_for_user,
    ensure_group_conversation,
    get_or_create_direct_conversation,
    get_or_create_group_participant,
    post_message,
    unread_count,
    unread_total,
)
from textileplatform.models import Group, Membership, Message

from test_patterns import _make_user


def _per_conversation_total(user):
    return sum(unread_count(c, user) for c in conversations_for_user(user))


def test_unread_total_matches_per_conversation_count(app):
    ann = _make_user(name="ann", email="ann@example.com")
    ben = _make_user(name="ben", email="ben@example.com")
    cyd = _make_user(name="cyd", email="cyd@example.com")
    # A group with three members, one with a pending invitation, and
    # a group ann is alone in (no chat).
    club = Group(name="club", label="Club", description="")
    solo = Group(name="solo", label="Solo", description="")
    db.session.add_all([
        club, solo,
        Membership(user=ann, group=club, role="owner", state="accepted"),
        Membership(user=ben, group=club, role="writer", state="accepted"),
        Membership(user=cyd, group=club, role="reader", state="invited"),
        Membership(user=ann, group=solo, role="owner", state="accepted"),
    ])
    db.session.flush()
    club_chat = ensure_group_conversation(club)
    solo_chat = ensure_group_conversation(solo)
    ab = get_or_create_direct_conversation(ann, ben)
    bc = get_or_create_direct_conversation(ben, cyd)

    post_message(ab, ben, "hi ann")
    post_message(ab, ann, "hi ben")
    post_message(ab, ben, "news")
    deleted = post_message(ab, ben, "oops")
    deleted.deleted = True
    post_message(bc, cyd, "hi ben")
    post_message(club_chat, ben, "club news")
    post_message(club_chat, ann, "thanks")
    post_message(solo_chat, ben, "not visible to anyone")
    # ann has read the club chat up to now; later messages are unread.
    seen = get_or_create_group_participant(club_chat, ann)
    seen.last_read_at = datetime.datetime.now(datetime.timezone.utc)
    later = post_message(club_chat, ben, "later")
    later.created = seen.last_read_at + datetime.timedelta(seconds=5)
    db.session.commit()

    for user in (ann, ben, cyd):
        assert unread_total(user) == _per_conversation_total(user), user.name
    assert unread_total(ann) == 3   # "hi ann", "news", "later"
    assert unread_total(ben) == 3   # "hi ben" x2, "thanks"
    assert unread_total(cyd) == 0   # only invited to the club
    assert Message.query.count() == 9

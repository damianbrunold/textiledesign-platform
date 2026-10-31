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
    seen.last_read_at = datetime.datetime.now(datetime.UTC)
    later = post_message(club_chat, ben, "later")
    later.created = seen.last_read_at + datetime.timedelta(seconds=5)
    db.session.commit()

    for user in (ann, ben, cyd):
        assert unread_total(user) == _per_conversation_total(user), user.name
    assert unread_total(ann) == 3   # "hi ann", "news", "later"
    assert unread_total(ben) == 3   # "hi ben" x2, "thanks"
    assert unread_total(cyd) == 0   # only invited to the club
    assert Message.query.count() == 9


# ---------- inbox list (/api/conversations) --------------------------


def _inbox_world(n_direct):
    """ann has a group chat and ``n_direct`` direct chats; messages at
    distinct, increasing times."""
    base = datetime.datetime(2026, 1, 1, tzinfo=datetime.UTC)
    ann = _make_user(name="ann", email="ann@example.com")
    club = Group(name="club", label="Club", description="")
    db.session.add(club)
    db.session.add(Membership(user=ann, group=club, role="owner",
                              state="accepted"))
    tick = [0]

    def post(conv, sender, body, deleted=False):
        tick[0] += 1
        msg = post_message(conv, sender, body)
        msg.created = base + datetime.timedelta(minutes=tick[0])
        msg.deleted = deleted
        return msg

    others = []
    for i in range(n_direct):
        other = _make_user(name=f"u{i}", email=f"u{i}@example.com")
        others.append(other)
        db.session.add(Membership(user=other, group=club, role="reader",
                                  state="accepted"))
        conv = get_or_create_direct_conversation(ann, other)
        post(conv, other, f"hello from u{i}")
        post(conv, ann, f"reply to u{i}")
    db.session.flush()
    chat = ensure_group_conversation(club)
    post(chat, others[0], "group news")
    post(chat, others[0], "oops", deleted=True)
    # u1's conversation gets the newest message overall.
    post(get_or_create_direct_conversation(ann, others[1]), others[1],
         "latest")
    db.session.commit()
    return ann


def _get_inbox(client, user):
    from test_limits import _login_as
    _login_as(client, user)
    return client.get("/api/conversations").get_json()["conversations"]


def test_inbox_list_content(csrf_disabled_client):
    ann = _inbox_world(3)
    convs = _get_inbox(csrf_disabled_client, ann)
    summary = [(c["kind"], (c.get("user") or c.get("group"))["name"],
                c["last_message"]["body"], c["unread"]) for c in convs]
    assert summary == [
        ("direct", "u1", "latest", 2),
        # Sorted by the last message, deleted ones included; the shown
        # last message skips deleted ones.
        ("group", "club", "group news", 1),
        ("direct", "u2", "reply to u2", 1),
        ("direct", "u0", "reply to u0", 1),
    ]
    assert convs[0]["url"] == "/messages/u/u1"
    assert convs[1]["url"] == "/messages/g/club"
    assert convs[0]["last_message"]["sender"]["name"] == "u1"


def test_inbox_list_query_count_is_constant(app, csrf_disabled_client):
    from sqlalchemy import event

    def count_queries(n_direct):
        db.session.remove()
        db.drop_all()
        db.create_all()
        ann = _inbox_world(n_direct)
        from test_limits import _login_as
        _login_as(csrf_disabled_client, ann)
        statements = []

        def on_execute(conn, cursor, statement, *args):
            statements.append(statement)

        engine = db.engine
        event.listen(engine, "before_cursor_execute", on_execute)
        try:
            r = csrf_disabled_client.get("/api/conversations")
        finally:
            event.remove(engine, "before_cursor_execute", on_execute)
        assert len(r.get_json()["conversations"]) == n_direct + 1
        return len(statements)

    assert count_queries(2) == count_queries(8)

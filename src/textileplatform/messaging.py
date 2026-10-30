"""Helpers for direct and group conversations.

Group conversations are created lazily/eagerly per-group; participants are
not duplicated in txconversation_participant for group chats — membership
is the source of truth, and `last_read_at` for group chats is tracked via
ad-hoc rows in txconversation_participant when the user first reads.
"""
import datetime

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import aliased, joinedload, selectinload

from textileplatform.db import db
from textileplatform.models import (
    Conversation,
    ConversationParticipant,
    Membership,
    Message,
)


def ensure_group_conversation(group):
    """Return the group's conversation, creating it if missing."""
    conv = (
        Conversation.query
        .filter(Conversation.group_id == group.id)
        .first()
    )
    if conv is None:
        conv = Conversation(
            kind="group",
            group_id=group.id,
            created=datetime.datetime.now(datetime.timezone.utc),
        )
        db.session.add(conv)
        db.session.flush()
    return conv


def find_direct_conversation(user_a, user_b):
    """The direct conversation between exactly these two users, or None."""
    convs = (
        Conversation.query
        .filter(Conversation.kind == "direct")
        .join(
            ConversationParticipant,
            Conversation.id == ConversationParticipant.conversation_id,
        )
        .filter(ConversationParticipant.user_id == user_a.id)
        .all()
    )
    for conv in convs:
        if {p.user_id for p in conv.participants} == {user_a.id, user_b.id}:
            return conv
    return None


def get_or_create_direct_conversation(user_a, user_b):
    """Find the canonical direct conversation between two users."""
    if user_a.id == user_b.id:
        return None
    conv = find_direct_conversation(user_a, user_b)
    if conv is not None:
        return conv

    conv = Conversation(
        kind="direct",
        group_id=None,
        created=datetime.datetime.now(datetime.timezone.utc),
    )
    db.session.add(conv)
    db.session.flush()
    db.session.add(ConversationParticipant(
        conversation_id=conv.id, user_id=user_a.id,
    ))
    db.session.add(ConversationParticipant(
        conversation_id=conv.id, user_id=user_b.id,
    ))
    db.session.flush()
    return conv


def get_or_create_group_participant(conversation, user):
    """Group chats use participant rows only to track last_read_at."""
    p = (
        ConversationParticipant.query
        .filter(ConversationParticipant.conversation_id == conversation.id)
        .filter(ConversationParticipant.user_id == user.id)
        .first()
    )
    if p is None:
        p = ConversationParticipant(
            conversation_id=conversation.id,
            user_id=user.id,
        )
        db.session.add(p)
        db.session.flush()
    return p


def can_access_conversation(conversation, user):
    if conversation.kind == "group":
        if conversation.group is None:
            return False
        return user.is_in_group(conversation.group_id)
    return any(p.user_id == user.id for p in conversation.participants)


def post_message(conversation, sender, body):
    body = (body or "").strip()
    if not body:
        return None
    msg = Message(
        conversation_id=conversation.id,
        sender_id=sender.id,
        body=body,
        created=datetime.datetime.now(datetime.timezone.utc),
        deleted=False,
    )
    db.session.add(msg)
    db.session.flush()
    return msg


def unread_count(conversation, user):
    """Count messages newer than the user's last_read_at, excluding own."""
    p = (
        ConversationParticipant.query
        .filter(ConversationParticipant.conversation_id == conversation.id)
        .filter(ConversationParticipant.user_id == user.id)
        .first()
    )
    last_read = p.last_read_at if p else None
    q = (
        Message.query
        .filter(Message.conversation_id == conversation.id)
        .filter(Message.sender_id != user.id)
        .filter(Message.deleted.is_not(True))
    )
    if last_read is not None:
        q = q.filter(Message.created > last_read)
    return q.count()


def _visible_to(user, me):
    """SQL condition: a Conversation the user can see. ``me`` is an
    alias of ConversationParticipant outer-joined on (conversation,
    user). Direct chats need the user's participant row; group chats
    exist for the user's groups with at least two accepted members (a
    chat with yourself is just noise)."""
    my_groups = (
        db.select(Membership.group_id)
        .where(Membership.user_id == user.id)
        .where(Membership.state == "accepted")
    )
    chat_groups = (
        db.select(Membership.group_id)
        .where(Membership.state == "accepted")
        .group_by(Membership.group_id)
        .having(func.count(Membership.id) >= 2)
    )
    return or_(
        and_(Conversation.kind == "direct", me.id.is_not(None)),
        and_(
            Conversation.kind == "group",
            Conversation.group_id.in_(my_groups),
            Conversation.group_id.in_(chat_groups),
        ),
    )


def _join_me(query, user):
    me = aliased(ConversationParticipant)
    return query.outerjoin(me, and_(
        me.conversation_id == Conversation.id,
        me.user_id == user.id,
    )), me


def unread_counts(user):
    """{conversation id: unread messages} over the conversations the
    user can see — messages from others, not deleted, newer than the
    user's last_read_at. One query."""
    query, me = _join_me(
        db.select(Message.conversation_id, func.count(Message.id))
        .join(Conversation, Conversation.id == Message.conversation_id),
        user,
    )
    query = (
        query
        .where(Message.sender_id != user.id)
        .where(Message.deleted.is_not(True))
        .where(or_(
            me.last_read_at.is_(None), Message.created > me.last_read_at,
        ))
        .where(_visible_to(user, me))
        .group_by(Message.conversation_id)
    )
    return dict(db.session.execute(query).all())


def unread_total(user):
    """Sum of unread_count over conversations_for_user (it runs for
    every rendered page)."""
    return sum(unread_counts(user).values())


def conversations_for_user(user):
    """The conversations the user can see, with participants, their
    users and the group loaded."""
    query, me = _join_me(db.select(Conversation), user)
    query = query.where(_visible_to(user, me)).options(
        selectinload(Conversation.participants)
        .joinedload(ConversationParticipant.user),
        joinedload(Conversation.group),
    )
    return list(db.session.execute(query).unique().scalars())


def inbox(user):
    """The inbox list: [(conversation, last visible message or None,
    unread count)], most recent activity first (deleted messages count
    as activity). A fixed number of queries, whatever the number of
    conversations."""
    convs = conversations_for_user(user)
    if not convs:
        return []
    ids = [c.id for c in convs]
    last_activity = dict(db.session.execute(
        db.select(Message.conversation_id, func.max(Message.created))
        .where(Message.conversation_id.in_(ids))
        .group_by(Message.conversation_id)
    ).all())
    # Newest non-deleted message per conversation.
    ranked = (
        db.select(
            Message.id,
            func.row_number().over(
                partition_by=Message.conversation_id,
                order_by=(Message.created.desc(), Message.id.desc()),
            ).label("rank"),
        )
        .where(Message.conversation_id.in_(ids))
        .where(Message.deleted.is_not(True))
        .subquery()
    )
    last_messages = {
        m.conversation_id: m for m in db.session.execute(
            db.select(Message)
            .where(Message.id.in_(
                db.select(ranked.c.id).where(ranked.c.rank == 1)))
            .options(joinedload(Message.sender))
        ).scalars()
    }
    unread = unread_counts(user)

    def activity(conv):
        when = last_activity.get(conv.id) or conv.created
        return when.timestamp() if when else 0

    return [
        (c, last_messages.get(c.id), unread.get(c.id, 0))
        for c in sorted(convs, key=activity, reverse=True)
    ]

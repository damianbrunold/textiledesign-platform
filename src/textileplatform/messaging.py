"""Helpers for direct and group conversations.

Group conversations are created lazily/eagerly per-group; participants are
not duplicated in txconversation_participant for group chats — membership
is the source of truth, and `last_read_at` for group chats is tracked via
ad-hoc rows in txconversation_participant when the user first reads.
"""
import datetime

from textileplatform.db import db
from textileplatform.models import (
    Conversation,
    ConversationParticipant,
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
            created=datetime.datetime.utcnow(),
        )
        db.session.add(conv)
        db.session.flush()
    return conv


def get_or_create_direct_conversation(user_a, user_b):
    """Find the canonical direct conversation between two users."""
    if user_a.id == user_b.id:
        return None
    # Look for an existing direct conversation that has both users.
    a_conv_ids = {
        p.conversation_id for p in
        ConversationParticipant.query
        .filter(ConversationParticipant.user_id == user_a.id)
        .all()
    }
    if a_conv_ids:
        candidate = (
            Conversation.query
            .filter(Conversation.kind == "direct")
            .filter(Conversation.id.in_(a_conv_ids))
            .all()
        )
        for conv in candidate:
            user_ids = {p.user_id for p in conv.participants}
            if user_ids == {user_a.id, user_b.id}:
                return conv

    conv = Conversation(
        kind="direct",
        group_id=None,
        created=datetime.datetime.utcnow(),
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
        created=datetime.datetime.utcnow(),
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


def conversations_for_user(user):
    """Return list of conversations the user can see."""
    direct_ids = [
        p.conversation_id for p in
        ConversationParticipant.query
        .filter(ConversationParticipant.user_id == user.id)
        .all()
    ]
    direct = (
        Conversation.query
        .filter(Conversation.kind == "direct")
        .filter(Conversation.id.in_(direct_ids))
        .all()
        if direct_ids else []
    )
    group_conv_ids = []
    for m in user.memberships:
        if m.state != "accepted":
            continue
        # Skip groups with only this user (personal groups, or any
        # singleton group) — a chat with yourself is just noise.
        accepted = sum(
            1 for mm in m.group.memberships if mm.state == "accepted"
        )
        if accepted < 2:
            continue
        group_conv_ids.append(m.group_id)
    group = (
        Conversation.query
        .filter(Conversation.kind == "group")
        .filter(Conversation.group_id.in_(group_conv_ids))
        .all()
        if group_conv_ids else []
    )
    return list(direct) + list(group)

"""The messaging API and pages, the pattern API (PUT actions and their
permission checks) and the upload route, exercised over HTTP."""
import base64
import io
import json

import pytest

from textileplatform.db import db
from textileplatform.messaging import (
    get_or_create_direct_conversation,
    post_message,
)
from textileplatform.models import (
    Conversation,
    ConversationParticipant,
    Group,
    Membership,
    Message,
    Pattern,
    User,
)
from textileplatform.patterns import (
    add_pattern,
    new_bead_pattern,
    new_weave_pattern,
)

from test_limits import _bead, _login_as, _weave
from test_patterns import _make_user


def _switch(client, user):
    client.post("/auth/logout")
    _login_as(client, user)


def _flashes(client):
    with client.session_transaction() as s:
        return [message for _, message in s.get("_flashes", [])]


# ---------- messaging ------------------------------------------------


@pytest.fixture
def chat(app):
    """ann and ben are accepted members of the shared group 'club',
    cyd is invited there; nobody has written yet."""
    ann = _make_user(name="ann", email="ann@example.com")
    ben = _make_user(name="ben", email="ben@example.com")
    cyd = _make_user(name="cyd", email="cyd@example.com")
    club = Group(name="club", label="Club", description="")
    db.session.add_all([
        club,
        Membership(user=ann, group=club, role="owner", state="accepted"),
        Membership(user=ben, group=club, role="writer", state="accepted"),
        Membership(user=cyd, group=club, role="reader", state="invited"),
    ])
    db.session.commit()
    return {"ann": ann, "ben": ben, "cyd": cyd, "club": club}


def _dm(client, to, body):
    return client.post(f"/api/conversations/direct/{to}",
                       json={"body": body})


class TestDirectConversation:
    def test_first_message_creates_the_conversation(
        self, csrf_disabled_client, chat
    ):
        _login_as(csrf_disabled_client, chat["ann"])
        r = _dm(csrf_disabled_client, "ben", "  hello ben  ")
        assert r.status_code == 200
        data = r.get_json()
        assert data["message"]["body"] == "hello ben"
        assert data["message"]["sender"]["name"] == "ann"
        conv = Conversation.query.one()
        assert conv.id == data["conversation_id"]
        assert conv.kind == "direct"
        assert {p.user_id for p in conv.participants} == {
            chat["ann"].id, chat["ben"].id}
        assert Message.query.one().body == "hello ben"

    def test_reply_reuses_the_conversation(self, csrf_disabled_client,
                                           chat):
        _login_as(csrf_disabled_client, chat["ann"])
        _dm(csrf_disabled_client, "ben", "hi")
        _switch(csrf_disabled_client, chat["ben"])
        r = _dm(csrf_disabled_client, "ANN", "hi back")
        assert r.status_code == 200
        assert Conversation.query.count() == 1
        assert Message.query.count() == 2

    def test_history_without_conversation_is_empty(
        self, csrf_disabled_client, chat
    ):
        _login_as(csrf_disabled_client, chat["ann"])
        data = csrf_disabled_client.get(
            "/api/conversations/direct/ben").get_json()
        assert data["conversation_id"] is None
        assert data["messages"] == []
        assert data["user"] == {"name": "ben", "label": "Ben"}
        assert data["blocked"] is False
        assert Conversation.query.count() == 0

    def test_history_pages_backwards(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["ann"])
        for i in range(5):
            _dm(csrf_disabled_client, "ben", f"m{i}")
        url = "/api/conversations/direct/ben"
        newest = csrf_disabled_client.get(url + "?limit=2").get_json()
        assert [m["body"] for m in newest["messages"]] == ["m3", "m4"]
        assert newest["has_more"] is True
        before = newest["messages"][0]["id"]
        older = csrf_disabled_client.get(
            f"{url}?limit=2&before={before}").get_json()
        assert [m["body"] for m in older["messages"]] == ["m1", "m2"]
        everything = csrf_disabled_client.get(url).get_json()
        assert len(everything["messages"]) == 5
        assert everything["has_more"] is False

    def test_messaging_yourself_is_refused(self, csrf_disabled_client,
                                           chat):
        _login_as(csrf_disabled_client, chat["ann"])
        assert _dm(csrf_disabled_client, "ann", "me").status_code == 400
        r = csrf_disabled_client.get("/api/conversations/direct/ann")
        assert r.status_code == 400
        assert Conversation.query.count() == 0

    def test_unknown_user_is_404(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["ann"])
        assert _dm(csrf_disabled_client, "nobody", "hi").status_code == 404
        r = csrf_disabled_client.get("/api/conversations/direct/nobody")
        assert r.status_code == 404

    def test_empty_message_is_refused(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["ann"])
        r = _dm(csrf_disabled_client, "ben", "   ")
        assert r.status_code == 400
        assert r.get_json()["message"] == "Empty message"
        assert Message.query.count() == 0

    # Regression: api_direct_conversation creates (flushes) the conversation
    # before rejecting an empty body; flush_usage_stats then commits it,
    # leaving an empty chat in both inboxes
    def test_empty_first_message_creates_no_conversation(
        self, csrf_disabled_client, chat
    ):
        _login_as(csrf_disabled_client, chat["ann"])
        r = _dm(csrf_disabled_client, "ben", "   ")
        assert r.status_code == 400
        assert r.get_json()["message"] == "Empty message"
        # The request's session is not committed; the test shares it.
        db.session.rollback()
        assert Conversation.query.count() == 0
        assert Message.query.count() == 0

    # Regression: post_message calls .strip() on the body unchecked: a non-
    # string body raises AttributeError, a 500 instead of a 400
    def test_non_string_body_is_refused(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["ann"])
        r = _dm(csrf_disabled_client, "ben", 42)
        assert r.status_code == 400

    def test_blocking_user_cannot_be_contacted(self, csrf_disabled_client,
                                               chat):
        chat["ben"].block_invitations = True
        db.session.commit()
        _login_as(csrf_disabled_client, chat["ann"])
        r = csrf_disabled_client.get("/api/conversations/direct/ben")
        assert r.get_json()["blocked"] is True
        r = _dm(csrf_disabled_client, "ben", "hi")
        assert r.status_code == 403
        db.session.rollback()
        assert Conversation.query.count() == 0

    def test_blocking_does_not_close_an_existing_conversation(
        self, csrf_disabled_client, chat
    ):
        _login_as(csrf_disabled_client, chat["ann"])
        _dm(csrf_disabled_client, "ben", "before")
        chat["ben"].block_invitations = True
        db.session.commit()
        r = _dm(csrf_disabled_client, "ben", "after")
        assert r.status_code == 200
        assert Message.query.count() == 2

    def test_support_accepts_messages_and_gets_mail(
        self, csrf_disabled_client, chat, captured_mails
    ):
        support = _make_user(name="support", email="support@example.com")
        support.block_invitations = True
        db.session.commit()
        _login_as(csrf_disabled_client, chat["ann"])
        r = _dm(csrf_disabled_client, "support", "please help")
        assert r.status_code == 200
        assert len(captured_mails) == 1
        assert captured_mails[0]["subject"] == "Support message from Ann"
        assert "please help" in captured_mails[0]["content"]
        assert "/messages/u/ann" in captured_mails[0]["content"]

    def test_disabled_user_without_conversation_is_hidden(
        self, csrf_disabled_client, chat
    ):
        chat["ben"].disabled = True
        db.session.commit()
        _login_as(csrf_disabled_client, chat["ann"])
        r = csrf_disabled_client.get("/api/conversations/direct/ben")
        assert r.status_code == 404
        assert _dm(csrf_disabled_client, "ben", "hi").status_code == 404

    def test_disabled_user_history_is_read_only(self, csrf_disabled_client,
                                                chat):
        conv = get_or_create_direct_conversation(chat["ann"], chat["ben"])
        post_message(conv, chat["ben"], "goodbye")
        chat["ben"].disabled = True
        db.session.commit()
        _login_as(csrf_disabled_client, chat["ann"])
        r = csrf_disabled_client.get("/api/conversations/direct/ben")
        assert [m["body"] for m in r.get_json()["messages"]] == ["goodbye"]
        assert _dm(csrf_disabled_client, "ben", "hi").status_code == 403
        assert Message.query.count() == 1

    def test_anonymous_gets_401(self, csrf_disabled_client, chat):
        client = csrf_disabled_client
        assert client.get("/api/conversations").status_code == 401
        r = client.post("/api/conversations/direct/ben",
                        json={"body": "x"})
        assert r.status_code == 401
        assert Message.query.count() == 0


class TestGroupConversation:
    def test_member_posts_and_reads(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["ann"])
        r = csrf_disabled_client.post("/api/conversations/group/club",
                                      json={"body": "club news"})
        assert r.status_code == 200
        conv = Conversation.query.one()
        assert (conv.kind, conv.group_id) == ("group", chat["club"].id)
        _switch(csrf_disabled_client, chat["ben"])
        data = csrf_disabled_client.get(
            "/api/conversations/group/club").get_json()
        assert data["conversation_id"] == conv.id
        assert data["group"] == {"name": "club", "label": "Club"}
        assert [m["body"] for m in data["messages"]] == ["club news"]
        assert data["has_more"] is False

    def test_invited_member_is_refused(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["cyd"])
        r = csrf_disabled_client.get("/api/conversations/group/club")
        assert r.status_code == 403
        r = csrf_disabled_client.post("/api/conversations/group/club",
                                      json={"body": "let me in"})
        assert r.status_code == 403
        assert Message.query.count() == 0

    def test_unknown_group_is_refused(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["ann"])
        r = csrf_disabled_client.get("/api/conversations/group/nothing")
        assert r.status_code == 403

    def test_personal_groups_have_no_chat(self, csrf_disabled_client,
                                          chat):
        # ann's primary group is personal (owner_id set).
        _login_as(csrf_disabled_client, chat["ann"])
        r = csrf_disabled_client.get("/api/conversations/group/ann")
        assert r.status_code == 403

    def test_empty_message_is_refused(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["ann"])
        r = csrf_disabled_client.post("/api/conversations/group/club",
                                      json={"body": ""})
        assert r.status_code == 400
        assert Message.query.count() == 0


class TestDeleteMessage:
    def _message(self, client, chat):
        _login_as(client, chat["ann"])
        return _dm(client, "ben", "secret").get_json()["message"]["id"]

    def test_sender_deletes_own_message(self, csrf_disabled_client, chat):
        msg_id = self._message(csrf_disabled_client, chat)
        r = csrf_disabled_client.delete(f"/api/messages/{msg_id}")
        assert r.status_code == 200
        assert db.session.get(Message, msg_id).deleted is True
        history = csrf_disabled_client.get(
            "/api/conversations/direct/ben").get_json()["messages"]
        assert history[0]["deleted"] is True
        assert history[0]["body"] == ""

    def test_deleting_twice_is_ok(self, csrf_disabled_client, chat):
        msg_id = self._message(csrf_disabled_client, chat)
        csrf_disabled_client.delete(f"/api/messages/{msg_id}")
        r = csrf_disabled_client.delete(f"/api/messages/{msg_id}")
        assert r.get_json()["status"] == "OK"

    def test_cannot_delete_someone_elses_message(self, csrf_disabled_client,
                                                 chat):
        msg_id = self._message(csrf_disabled_client, chat)
        _switch(csrf_disabled_client, chat["ben"])
        r = csrf_disabled_client.delete(f"/api/messages/{msg_id}")
        assert r.status_code == 403
        assert db.session.get(Message, msg_id).deleted is False

    def test_unknown_message_is_404(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["ann"])
        assert csrf_disabled_client.delete(
            "/api/messages/999").status_code == 404


class TestMarkRead:
    def _unread(self, client):
        return [c["unread"] for c in
                client.get("/api/conversations").get_json()["conversations"]]

    def test_direct_conversation(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["ben"])
        _dm(csrf_disabled_client, "ann", "one")
        conv_id = _dm(csrf_disabled_client, "ann",
                      "two").get_json()["conversation_id"]
        _switch(csrf_disabled_client, chat["ann"])
        assert self._unread(csrf_disabled_client) == [2]
        r = csrf_disabled_client.post(f"/api/conversations/{conv_id}/read")
        assert r.get_json() == {"status": "OK", "unread_total": 0}
        assert self._unread(csrf_disabled_client) == [0]

    def test_group_conversation_adds_a_read_marker(
        self, csrf_disabled_client, chat
    ):
        _login_as(csrf_disabled_client, chat["ann"])
        conv_id = csrf_disabled_client.post(
            "/api/conversations/group/club", json={"body": "news"},
        ).get_json()["conversation_id"]
        _switch(csrf_disabled_client, chat["ben"])
        assert self._unread(csrf_disabled_client) == [1]
        r = csrf_disabled_client.post(f"/api/conversations/{conv_id}/read")
        assert r.get_json()["unread_total"] == 0
        marker = ConversationParticipant.query.filter_by(
            conversation_id=conv_id, user_id=chat["ben"].id).one()
        assert marker.last_read_at is not None

    def test_outsider_cannot_mark_read(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["ann"])
        direct = _dm(csrf_disabled_client, "ben",
                     "hi").get_json()["conversation_id"]
        group = csrf_disabled_client.post(
            "/api/conversations/group/club", json={"body": "hi"},
        ).get_json()["conversation_id"]
        _switch(csrf_disabled_client, chat["cyd"])
        for conv_id in (direct, group):
            r = csrf_disabled_client.post(
                f"/api/conversations/{conv_id}/read")
            assert r.status_code == 404
        assert ConversationParticipant.query.filter_by(
            user_id=chat["cyd"].id).count() == 0

    def test_unknown_conversation_is_404(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["ann"])
        r = csrf_disabled_client.post("/api/conversations/999/read")
        assert r.status_code == 404


class TestMessagePages:
    def test_inbox(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["ann"])
        assert csrf_disabled_client.get("/messages").status_code == 200

    def test_inbox_needs_login(self, client, chat):
        r = client.get("/messages")
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]

    def test_direct_page(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["ann"])
        r = csrf_disabled_client.get("/messages/u/ben")
        assert r.status_code == 200
        assert "/api/conversations/direct/ben" in r.get_data(as_text=True)

    @pytest.mark.parametrize("target", ["ann", "nobody"])
    def test_direct_page_redirects_to_inbox(self, csrf_disabled_client,
                                            chat, target):
        _login_as(csrf_disabled_client, chat["ann"])
        r = csrf_disabled_client.get(f"/messages/u/{target}")
        assert r.status_code == 302
        assert r.headers["Location"] == "/messages"

    def test_disabled_user_page_needs_a_conversation(
        self, csrf_disabled_client, chat
    ):
        chat["ben"].disabled = True
        db.session.commit()
        _login_as(csrf_disabled_client, chat["ann"])
        r = csrf_disabled_client.get("/messages/u/ben")
        assert r.headers["Location"] == "/messages"
        conv = get_or_create_direct_conversation(chat["ann"], chat["ben"])
        post_message(conv, chat["ben"], "old")
        db.session.commit()
        assert csrf_disabled_client.get(
            "/messages/u/ben").status_code == 200

    def test_group_page(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["ann"])
        r = csrf_disabled_client.get("/messages/g/club")
        assert r.status_code == 200
        assert "/api/conversations/group/club" in r.get_data(as_text=True)

    def test_group_page_for_non_member(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["cyd"])
        r = csrf_disabled_client.get("/messages/g/club")
        assert r.headers["Location"] == "/messages"

    def test_group_page_needs_two_members(self, csrf_disabled_client,
                                          chat):
        solo = Group(name="solo", label="Solo", description="")
        db.session.add_all([solo, Membership(
            user=chat["ann"], group=solo, role="owner", state="accepted")])
        db.session.commit()
        _login_as(csrf_disabled_client, chat["ann"])
        r = csrf_disabled_client.get("/messages/g/solo")
        assert r.status_code == 302
        assert r.headers["Location"] == "/groups/edit/solo"

    def test_dismiss_intro(self, csrf_disabled_client, chat):
        _login_as(csrf_disabled_client, chat["ann"])
        r = csrf_disabled_client.post("/api/intro/dismiss")
        assert r.get_json()["status"] == "OK"
        assert db.session.get(User, chat["ann"].id).intro_seen is True


# ---------- pattern API ----------------------------------------------


@pytest.fixture
def owned(app):
    """alice owns the private weave 'twill' and the public bead 'rope';
    bob is another user."""
    alice = _make_user()
    bob = _make_user(name="bob", email="bob@example.com")
    add_pattern(_weave(), alice, "DB-WEAVE Pattern")
    add_pattern(_bead(), alice, "JBead Pattern")
    _pattern("rope").public = True
    db.session.commit()
    return {"alice": alice, "bob": bob}


def _pattern(name, owner=None):
    q = Pattern.query.filter_by(name=name)
    if owner is not None:
        q = q.filter_by(owner_id=owner.id)
    return q.one()


def _put(client, path, **data):
    return client.put(f"/api/pattern/{path}", json=data)


class TestGetPattern:
    def test_owner_gets_stored_contents(self, csrf_disabled_client, owned):
        _login_as(csrf_disabled_client, owned["alice"])
        data = csrf_disabled_client.get("/api/pattern/alice/twill").get_json()
        assert data["status"] == "OK"
        assert data["pattern"] == _weave()

    def test_publishing_controls_anonymous_access(self, csrf_disabled_client,
                                                  owned, app):
        anonymous = app.test_client()
        assert anonymous.get("/api/pattern/alice/twill").status_code == 403
        _login_as(csrf_disabled_client, owned["alice"])
        _put(csrf_disabled_client, "alice/twill",
             action="set-publication-state", publication_state=True)
        assert anonymous.get("/api/pattern/alice/twill").status_code == 200
        _put(csrf_disabled_client, "alice/twill",
             action="set-publication-state", publication_state=False)
        assert _pattern("twill").public is False
        assert anonymous.get("/api/pattern/alice/twill").status_code == 403


class TestUpdatePatternRequests:
    @pytest.mark.parametrize("body", [
        b"not json", b"[1, 2]", b'"save-pattern"',
    ])
    def test_non_object_body_is_400(self, csrf_disabled_client, owned,
                                    body):
        _login_as(csrf_disabled_client, owned["alice"])
        r = csrf_disabled_client.put("/api/pattern/alice/twill", data=body,
                                     content_type="application/json")
        assert r.status_code == 400
        assert r.get_json()["message"] == "Invalid request"

    @pytest.mark.parametrize("data", [{}, {"action": "delete-pattern"}])
    def test_unknown_action_is_400(self, csrf_disabled_client, owned,
                                   data):
        _login_as(csrf_disabled_client, owned["alice"])
        r = csrf_disabled_client.put("/api/pattern/alice/twill", json=data)
        assert r.status_code == 400
        assert r.get_json()["message"] == "Illegal action"

    def test_unknown_pattern_is_404(self, csrf_disabled_client, owned):
        _login_as(csrf_disabled_client, owned["alice"])
        r = _put(csrf_disabled_client, "alice/missing",
                 action="rename-pattern", label="X")
        assert r.status_code == 404

    def test_stranger_cannot_touch_a_private_pattern(
        self, csrf_disabled_client, owned
    ):
        _login_as(csrf_disabled_client, owned["bob"])
        r = _put(csrf_disabled_client, "alice/twill",
                 action="clone-pattern")
        assert r.status_code == 403
        assert Pattern.query.filter_by(owner_id=owned["bob"].id).count() == 0

    @pytest.mark.parametrize("data", [
        {"action": "set-publication-state", "publication_state": False},
        {"action": "save-pattern", "contents": _bead()},
        {"action": "clone-pattern"},
        {"action": "rename-pattern", "label": "Taken"},
    ])
    def test_anonymous_cannot_change_a_public_pattern(
        self, csrf_disabled_client, owned, data
    ):
        r = csrf_disabled_client.put("/api/pattern/alice/rope", json=data)
        assert r.status_code == 403
        rope = _pattern("rope")
        assert (rope.public, rope.label) == (True, "Rope")
        assert Pattern.query.count() == 2

    def test_stranger_cannot_unpublish(self, csrf_disabled_client, owned):
        _login_as(csrf_disabled_client, owned["bob"])
        r = _put(csrf_disabled_client, "alice/rope",
                 action="set-publication-state", publication_state=False)
        assert r.status_code == 403
        assert _pattern("rope").public is True


class TestSavePattern:
    def test_save_updates_metadata(self, csrf_disabled_client, owned):
        _login_as(csrf_disabled_client, owned["alice"])
        r = _put(csrf_disabled_client, "alice/rope", action="save-pattern",
                 contents=_bead(width=7, height=4))
        assert r.status_code == 200
        rope = _pattern("rope")
        assert rope.pattern_width == 7
        assert json.loads(rope.contents)["model"] == _bead(7, 4)["model"]

    def test_stranger_cannot_save_a_public_pattern(self, csrf_disabled_client,
                                                   owned):
        _login_as(csrf_disabled_client, owned["bob"])
        r = _put(csrf_disabled_client, "alice/rope", action="save-pattern",
                 contents=_bead(width=3))
        assert r.status_code == 403
        assert json.loads(_pattern("rope").contents) == _bead()

    # Regression: update_pattern reads data['contents'] unchecked: a save
    # without contents raises KeyError and answers 500 instead of 400
    def test_save_without_contents_is_400(self, csrf_disabled_client,
                                          owned):
        _login_as(csrf_disabled_client, owned["alice"])
        r = _put(csrf_disabled_client, "alice/rope", action="save-pattern")
        assert r.status_code == 400

    def test_emptying_a_weave_stashes_the_old_contents(
        self, csrf_disabled_client, owned
    ):
        before = _pattern("twill").contents
        _login_as(csrf_disabled_client, owned["alice"])
        empty = new_weave_pattern("Twill", "Alice", 40, 30)
        r = _put(csrf_disabled_client, "alice/twill", action="save-pattern",
                 contents=empty)
        assert r.status_code == 200
        twill = _pattern("twill")
        assert twill.contents_salvage == before
        assert json.loads(twill.contents) == empty

    def test_emptying_a_bead_pattern_stashes_the_old_contents(
        self, csrf_disabled_client, owned
    ):
        before = _pattern("rope").contents
        _login_as(csrf_disabled_client, owned["alice"])
        _put(csrf_disabled_client, "alice/rope", action="save-pattern",
             contents=new_bead_pattern("Rope", "Alice", 10, 20))
        assert _pattern("rope").contents_salvage == before

    def test_second_empty_save_keeps_the_salvage(self, csrf_disabled_client,
                                                 owned):
        before = _pattern("rope").contents
        _login_as(csrf_disabled_client, owned["alice"])
        empty = new_bead_pattern("Rope", "Alice", 10, 20)
        for _ in range(2):
            _put(csrf_disabled_client, "alice/rope", action="save-pattern",
                 contents=empty)
        assert _pattern("rope").contents_salvage == before

    def test_ordinary_saves_leave_no_salvage(self, csrf_disabled_client,
                                             owned):
        _login_as(csrf_disabled_client, owned["alice"])
        _put(csrf_disabled_client, "alice/rope", action="save-pattern",
             contents=_bead(width=5))
        add_pattern(new_bead_pattern("Blank", "Alice", 8, 8),
                    owned["alice"], "JBead Pattern")
        _put(csrf_disabled_client, "alice/blank", action="save-pattern",
             contents=new_bead_pattern("Blank", "Alice", 9, 9))
        assert _pattern("rope").contents_salvage is None
        assert _pattern("blank").contents_salvage is None

    def test_thumbnail_is_set_kept_and_cleared(self, csrf_disabled_client,
                                               owned):
        png = b"\x89PNG\r\n\x1a\nfake"
        url = "data:image/png;base64," + base64.b64encode(png).decode()
        _login_as(csrf_disabled_client, owned["alice"])

        def save(**extra):
            _put(csrf_disabled_client, "alice/rope", action="save-pattern",
                 contents=_bead(), **extra)
            return _pattern("rope")

        assert save(thumbnail=url, preview=url).thumbnail_image == png
        assert save().thumbnail_image == png
        rope = save(thumbnail=None, preview="data:image/gif;base64,AAAA")
        assert rope.thumbnail_image is None
        assert rope.preview_image is None


class TestClonePattern:
    def test_owner_clone_gets_a_free_name(self, csrf_disabled_client,
                                          owned):
        _login_as(csrf_disabled_client, owned["alice"])
        r = _put(csrf_disabled_client, "alice/twill", action="clone-pattern")
        assert r.status_code == 200
        clone = _pattern("twill-1")
        assert clone.label == "Twill - 1"
        assert clone.contents == _pattern("twill").contents
        assert clone.public is False

    def test_clone_of_public_pattern_is_private(self, csrf_disabled_client,
                                                owned):
        _login_as(csrf_disabled_client, owned["bob"])
        _put(csrf_disabled_client, "alice/rope", action="clone-pattern")
        clone = _pattern("rope", owner=owned["bob"])
        assert clone.public is False
        assert [a.group.name for a in clone.assignments] == ["bob"]

    def test_clone_with_contents_uses_them(self, csrf_disabled_client,
                                           owned):
        _login_as(csrf_disabled_client, owned["bob"])
        edited = _bead(width=4, height=6)
        r = _put(csrf_disabled_client, "alice/rope", action="clone-pattern",
                 contents=edited)
        assert r.status_code == 200
        clone = _pattern("rope", owner=owned["bob"])
        assert json.loads(clone.contents) == edited
        assert clone.pattern_width == 4
        assert json.loads(_pattern("rope", owned["alice"]).contents) == (
            _bead())

    def test_clone_with_invalid_contents_is_refused(
        self, csrf_disabled_client, owned
    ):
        _login_as(csrf_disabled_client, owned["bob"])
        r = _put(csrf_disabled_client, "alice/rope", action="clone-pattern",
                 contents={"model": "nope"})
        assert r.status_code == 400
        assert Pattern.query.filter_by(owner_id=owned["bob"].id).count() == 0

    def test_clone_explains_when_all_names_are_taken(
        self, csrf_disabled_client, owned
    ):
        """clone_pattern tries "Twill", "Twill - 1" … "Twill - 10"."""
        for i in range(1, 11):
            add_pattern(dict(_weave(), name=f"Twill - {i}"),
                        owned["alice"], "DB-WEAVE Pattern")
        _login_as(csrf_disabled_client, owned["alice"])
        r = _put(csrf_disabled_client, "alice/twill", action="clone-pattern")
        assert r.status_code == 409
        assert "no free name" in r.get_json()["message"]
        assert Pattern.query.filter_by(
            owner_id=owned["alice"].id).count() == 12


    def test_create_explains_when_all_names_are_taken(
        self, csrf_disabled_client, owned
    ):
        alice = owned["alice"]
        for i in range(11):
            add_pattern(dict(_bead(), name="Rope" + (f" - {i}" if i else "")),
                        alice, "JBead Pattern")
        _login_as(csrf_disabled_client, alice)
        count = Pattern.query.filter_by(owner_id=alice.id).count()
        r = csrf_disabled_client.post("/patterns/create", data={
            "pattern_type": "JBead Pattern", "name": "Rope",
            "width": "8", "height": "10",
        })
        assert r.status_code in (301, 302)
        with csrf_disabled_client.session_transaction() as s:
            messages = [m for _, m in s.get("_flashes", [])]
        assert any("no free name" in m for m in messages)
        assert Pattern.query.filter_by(owner_id=alice.id).count() == count

class TestRenamePattern:
    def test_rename_moves_the_pattern(self, csrf_disabled_client, owned):
        _login_as(csrf_disabled_client, owned["alice"])
        r = _put(csrf_disabled_client, "alice/twill",
                 action="rename-pattern", label="  Broken Twill ")
        assert r.get_json() == {"status": "OK", "name": "broken-twill",
                                "label": "Broken Twill"}
        assert csrf_disabled_client.get(
            "/api/pattern/alice/broken-twill").status_code == 200
        assert csrf_disabled_client.get(
            "/api/pattern/alice/twill").status_code == 404

    def test_relabel_keeping_the_name(self, csrf_disabled_client, owned):
        _login_as(csrf_disabled_client, owned["alice"])
        r = _put(csrf_disabled_client, "alice/twill",
                 action="rename-pattern", label="TWILL")
        assert r.status_code == 200
        assert _pattern("twill").label == "TWILL"

    @pytest.mark.parametrize("label,message", [
        ("", "Label is required"),
        ("   ", "Label is required"),
        (None, "Label is required"),
        ("!!!", "Invalid name"),
        ("x" * 101, "Invalid name"),
    ])
    def test_invalid_labels_are_refused(self, csrf_disabled_client, owned,
                                        label, message):
        _login_as(csrf_disabled_client, owned["alice"])
        r = _put(csrf_disabled_client, "alice/twill",
                 action="rename-pattern", label=label)
        assert r.status_code == 400
        assert r.get_json()["message"] == message
        assert _pattern("twill").label == "Twill"

    def test_name_of_another_users_pattern_is_free(
        self, csrf_disabled_client, owned
    ):
        add_pattern(dict(_bead(), name="Chain"), owned["bob"],
                    "JBead Pattern")
        _login_as(csrf_disabled_client, owned["alice"])
        r = _put(csrf_disabled_client, "alice/rope",
                 action="rename-pattern", label="Chain")
        assert r.status_code == 200
        assert Pattern.query.filter_by(name="chain").count() == 2

    def test_stranger_cannot_rename_a_public_pattern(
        self, csrf_disabled_client, owned
    ):
        _login_as(csrf_disabled_client, owned["bob"])
        r = _put(csrf_disabled_client, "alice/rope",
                 action="rename-pattern", label="Mine")
        assert r.status_code == 403
        assert _pattern("rope").label == "Rope"


# ---------- upload ---------------------------------------------------


def _upload(client, *files, name="", group=None):
    data = {"name": name, "file": [
        (io.BytesIO(payload), filename) for payload, filename in files
    ]}
    if group is not None:
        data["group"] = group
    return client.post("/patterns/upload", data=data,
                       content_type="multipart/form-data")


def _json(obj):
    return json.dumps(obj).encode()


@pytest.fixture
def uploader(app, csrf_disabled_client):
    """alice, logged in; writer in 'club', reader in 'readers'."""
    alice = _make_user()
    club = Group(name="club", label="Club", description="")
    readers = Group(name="readers", label="Readers", description="")
    db.session.add_all([
        club, readers,
        Membership(user=alice, group=club, role="writer", state="accepted"),
        Membership(user=alice, group=readers, role="reader",
                   state="accepted"),
    ])
    db.session.commit()
    _login_as(csrf_disabled_client, alice)
    return csrf_disabled_client


def _groups_of(name):
    return sorted(a.group.name for a in _pattern(name).assignments)


class TestUpload:
    def test_form_page(self, uploader):
        r = uploader.get("/patterns/upload")
        assert r.status_code == 200
        assert 'name="file"' in r.get_data(as_text=True)

    def test_needs_login(self, client, app):
        r = client.get("/patterns/upload")
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]

    def test_single_file_opens_the_editor(self, uploader):
        bead = _bead()
        del bead["name"]
        r = _upload(uploader, (_json(bead), "x.json"), name="My../Rope")
        assert r.status_code == 302
        location = r.headers["Location"]
        assert location.startswith("/alice/myrope?")
        assert "autosave=1" in location
        p = _pattern("myrope")
        assert (p.label, p.pattern_type) == ("MyRope", "JBead Pattern")
        assert _groups_of("myrope") == ["alice"]

    def test_several_files_are_named_after_the_files(self, uploader):
        weave = _weave()
        del weave["name"]
        bead = _bead()
        del bead["name"]
        r = _upload(uploader, (_json(weave), "plain weave.json"),
                    (_json(bead), "spiral.json"), name="Ignored")
        assert r.headers["Location"] == "/alice"
        assert _pattern("plain-weave").pattern_type == "DB-WEAVE Pattern"
        assert _pattern("spiral").pattern_type == "JBead Pattern"
        assert Pattern.query.count() == 2
        assert _flashes(uploader) == []

    @pytest.mark.parametrize("payload,filename", [
        (b"GIF89a not a pattern", "picture.gif"),
        (b"[1, 2, 3]", "list.json"),
        (b"@dbw3:garbage", "broken.dbw"),
        (b"(jbb (version 1) (model (row 1 2", "broken.jbb"),
    ])
    def test_unreadable_file_stays_on_the_listing(self, uploader, payload,
                                                  filename):
        r = _upload(uploader, (payload, filename))
        assert r.headers["Location"] == "/alice"
        assert Pattern.query.count() == 0
        flashes = _flashes(uploader)
        assert len(flashes) == 1
        assert filename in flashes[0]

    def test_good_files_survive_a_bad_one(self, uploader):
        r = _upload(uploader, (_json(_bead()), "a.json"),
                    (b"@dbw3:garbage", "bad.dbw"),
                    (_json(_weave()), "b.json"), group="club")
        assert r.headers["Location"] == "/alice?group=club"
        assert _groups_of("rope") == ["alice", "club"]
        assert _groups_of("twill") == ["alice", "club"]
        assert "bad.dbw" in _flashes(uploader)[0]

    def test_single_file_into_a_group(self, uploader):
        r = _upload(uploader, (_json(_bead()), "rope.json"), group="club")
        assert "origin=user-tab-club" in r.headers["Location"]
        assert _groups_of("rope") == ["alice", "club"]

    @pytest.mark.parametrize("group", ["readers", "alice", "nowhere"])
    def test_group_without_write_access_is_ignored(self, uploader, group):
        r = _upload(uploader, (_json(_bead()), "a.json"),
                    (_json(_weave()), "b.json"), group=group)
        assert r.headers["Location"] == "/alice"
        assert _groups_of("rope") == ["alice"]
        assert _groups_of("twill") == ["alice"]

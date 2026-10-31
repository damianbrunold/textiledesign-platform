"""Input handling and failure paths: names, logout, search, message
paging, group texts, stale sessions, failing mail."""
import pytest

from textileplatform.db import db
from textileplatform.models import Group, User
from textileplatform.name import from_label, is_valid

from test_limits import _login_as
from test_patterns import _make_user, _reset_access_date


class TestNames:
    @pytest.mark.parametrize("label,name", [
        ("Anna Müller", "anna-müller"),
        ("  two  spaces__and_underscores ", "-two-spaces-and-underscores-"),
        ("c++ #1 50% ?", "c-1-50-"),
        ("a/b\\c..d", "abcd"),
    ])
    def test_from_label(self, label, name):
        assert from_label(label) == name

    @pytest.mark.parametrize("name", [
        "", "..", "a b", "a#b", "a%20", "a?b", "a/b", "messages", "terms",
        "static", "beispiele", "x" * 51,
    ])
    def test_rejected(self, name):
        assert not is_valid(name, max_len=50)

    @pytest.mark.parametrize("name", ["anna", "anna-müller", "a.b", "x1"])
    def test_accepted(self, name):
        assert is_valid(name, max_len=50)


def test_logout_requires_post(csrf_disabled_client):
    user = _make_user()
    _login_as(csrf_disabled_client, user)
    # A GET (e.g. an <img> on another site) must not end the session.
    csrf_disabled_client.get("/auth/logout")
    _reset_access_date(user)
    assert csrf_disabled_client.get("/profile").status_code == 200
    _reset_access_date(user)
    assert csrf_disabled_client.post("/auth/logout").status_code == 302
    assert csrf_disabled_client.get("/profile").status_code == 302


def test_user_search_treats_wildcards_literally(csrf_disabled_client):
    user = _make_user()
    _make_user(name="bob", email="bob@example.com")
    _login_as(csrf_disabled_client, user)
    r = csrf_disabled_client.get("/api/users/search?q=__")
    assert r.get_json()["users"] == []
    _reset_access_date(user)
    r = csrf_disabled_client.get("/api/users/search?q=bo")
    assert [u["name"] for u in r.get_json()["users"]] == ["bob"]


@pytest.mark.parametrize("limit", ["abc", "-5", "0", "100000"])
def test_message_history_limit_is_sanitised(csrf_disabled_client, limit):
    user = _make_user()
    _make_user(name="bob", email="bob@example.com")
    _login_as(csrf_disabled_client, user)
    csrf_disabled_client.post("/api/conversations/direct/bob",
                              json={"body": "hi"})
    _reset_access_date(user)
    r = csrf_disabled_client.get(
        f"/api/conversations/direct/bob?limit={limit}")
    assert r.status_code == 200
    assert len(r.get_json()["messages"]) == 1


def test_conversation_list_without_messages(csrf_disabled_client):
    user = _make_user()
    other = _make_user(name="bob", email="bob@example.com")
    club = Group(name="club", label="Club", description="")
    db.session.add(club)
    db.session.commit()
    from textileplatform.messaging import ensure_group_conversation
    from textileplatform.models import Membership
    db.session.add_all([
        Membership(user=user, group=club, role="owner", state="accepted"),
        Membership(user=other, group=club, role="reader", state="accepted"),
    ])
    ensure_group_conversation(club)
    db.session.commit()
    _login_as(csrf_disabled_client, user)
    csrf_disabled_client.post("/api/conversations/direct/bob",
                              json={"body": "hi"})
    _reset_access_date(user)
    r = csrf_disabled_client.get("/api/conversations")
    assert r.status_code == 200
    assert len(r.get_json()["conversations"]) == 2


class TestGroupTexts:
    def test_too_long_label_is_refused(self, csrf_disabled_client):
        user = _make_user()
        _login_as(csrf_disabled_client, user)
        r = csrf_disabled_client.post("/groups/add", data={
            "kind": "shared", "name": "x" * 30 + "!" * 30,
        })
        assert r.status_code == 200
        assert Group.query.filter(Group.owner_id.is_(None)).count() == 0

    def test_update_refuses_long_label(self, csrf_disabled_client):
        user = _make_user()
        _login_as(csrf_disabled_client, user)
        csrf_disabled_client.post("/groups/add", data={
            "kind": "shared", "name": "Club",
        })
        _reset_access_date(user)
        csrf_disabled_client.post("/groups/club/update", data={
            "label": "y" * 60, "description": "d",
        })
        club = Group.query.filter_by(name="club").one()
        assert club.label == "Club"


def test_stale_session_on_api_gets_401(csrf_disabled_client):
    user = _make_user()
    _login_as(csrf_disabled_client, user)
    user.session_token_version = 7   # password changed elsewhere
    db.session.commit()
    r = csrf_disabled_client.get("/api/user/settings")
    assert r.status_code == 401


def test_registration_survives_failing_verification_mail(
    csrf_disabled_client, monkeypatch
):
    import textileplatform.mail as mail

    def _boom(*args, **kwargs):
        raise ConnectionRefusedError("no smtp")

    monkeypatch.setattr(mail, "send_mail", _boom)
    client = csrf_disabled_client
    page = client.get("/auth/register").get_data(as_text=True)
    import re
    a, b = map(int, re.search(r"(\d+)\s*\+\s*(\d+)", page).groups())
    r = client.post("/auth/register", data={
        "label": "Zoe", "email": "zoe@example.com",
        "password": "a-long-passphrase", "confirm_password":
        "a-long-passphrase", "x": str(a + b),
    })
    assert r.status_code == 200
    assert User.query.filter_by(name="zoe").count() == 1


class TestInactivityLogout:
    """One limit for the session cookie and the account-inactivity check
    (it used to be 14 vs. 30 days, so the 30-day check never applied)."""

    def _set_last_access(self, user, days_ago):
        import datetime
        user.access_date = (
            datetime.datetime.now(datetime.UTC)
            - datetime.timedelta(days=days_ago)
        )
        db.session.commit()

    def test_cookie_and_check_use_30_days(self, app):
        import datetime
        assert app.permanent_session_lifetime == datetime.timedelta(days=30)

    def test_active_within_30_days_stays_logged_in(self, csrf_disabled_client):
        user = _make_user()
        _login_as(csrf_disabled_client, user)
        self._set_last_access(user, 29)
        assert csrf_disabled_client.get("/profile").status_code == 200

    def test_inactive_for_31_days_is_logged_out(self, csrf_disabled_client):
        user = _make_user()
        _login_as(csrf_disabled_client, user)
        self._set_last_access(user, 31)
        r = csrf_disabled_client.get("/profile")
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]
        with csrf_disabled_client.session_transaction() as s:
            assert "user_name" not in s

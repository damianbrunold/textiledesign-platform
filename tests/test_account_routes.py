"""Account routes: the profile page (settings, display name, password),
the settings API, account export and deletion, the admin rename, the
password recovery flow, registration edge cases and e-mail
verification."""
import datetime
import io
import json
import zipfile

import pytest
import pytz

from textileplatform.db import db
from textileplatform.mail import SUPPORT_ADDRESS
from textileplatform.messaging import (
    get_or_create_direct_conversation,
    post_message,
)
from textileplatform.models import (
    Assignment,
    Conversation,
    Group,
    Membership,
    Message,
    Pattern,
    User,
)
from werkzeug.security import check_password_hash

from test_limits import _login_as, _weave
from test_patterns import _login, _make_user, _reset_access_date


# ---------- helpers ---------------------------------------------------


def _flashes(client):
    with client.session_transaction() as s:
        return [message for _, message in s.get("_flashes", [])]


def _logged_in_name(client):
    with client.session_transaction() as s:
        return s.get("user_name")


def _user(name):
    return User.query.filter_by(name=name).one_or_none()


def _primary(user):
    return Group.query.filter_by(owner_id=user.id, name=user.name).one()


def _mails_to(mails, receiver):
    return [m for m in mails if m["receiver"] == receiver]


def _as_utc(dt):
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.UTC)
    return dt


def _restore_reset_tz(user):
    """SQLite drops tzinfo, and reset_password compares the expiry with
    an aware timestamp. Put the aware value back into the identity map
    (the request uses the same session) — PostgreSQL returns it aware."""
    user.password_reset_expires = _as_utc(user.password_reset_expires)


def _issue_reset_code(user, code="reset-code-123", hours=1):
    user.password_reset_code = code
    db.session.commit()
    user.password_reset_expires = (
        datetime.datetime.now(datetime.UTC)
        + datetime.timedelta(hours=hours)
    )
    return code


def _reset_url(user, code):
    return f"/auth/reset-password/{user.name}/{code}"


def _register(client, **fields):
    """Fetch the form (minting a captcha), then post it with the right
    answer unless `x` is given."""
    client.get("/auth/register")
    with client.session_transaction() as s:
        answer = s["captcha_answer"]
    data = {
        "label": "Newbie",
        "email": "newbie@example.com",
        "password": "correcthorse1",
        "confirm_password": "correcthorse1",
        "x": str(answer),
    }
    data.update(fields)
    return client.post("/auth/register", data=data)


# ---------- profile page ----------------------------------------------


class TestProfilePage:
    def test_requires_login(self, client):
        r = client.get("/profile")
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]

    def test_post_requires_login(self, csrf_disabled_client):
        _make_user()
        r = csrf_disabled_client.post("/profile", data={"locale": "de"})
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]
        assert _user("alice").locale is None

    def test_renders_for_logged_in_user(self, csrf_disabled_client):
        alice = _make_user()
        _login_as(csrf_disabled_client, alice)
        r = csrf_disabled_client.get("/profile")
        assert r.status_code == 200
        assert b"alice@example.com" in r.data
        assert b"Europe/Zurich" in r.data


class TestProfileSettings:
    def test_saves_all_settings(self, csrf_disabled_client):
        alice = _make_user()
        _login_as(csrf_disabled_client, alice)
        r = csrf_disabled_client.post("/profile", data={
            "action": "settings",
            "darkmode": "1",
            "locale": "de",
            "timezone": "Europe/Zurich",
            "block_invitations": "1",
        })
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/profile")
        alice = _user("alice")
        assert alice.darkmode is True
        assert alice.locale == "de"
        assert alice.timezone == "Europe/Zurich"
        assert alice.block_invitations is True

    def test_action_defaults_to_settings(self, csrf_disabled_client):
        alice = _make_user()
        _login_as(csrf_disabled_client, alice)
        csrf_disabled_client.post("/profile", data={"locale": "en"})
        assert _user("alice").locale == "en"
        assert "Profile updated" in _flashes(csrf_disabled_client)

    @pytest.mark.parametrize("raw, stored", [
        ("1", True), ("0", False), ("auto", None), ("", None),
    ])
    def test_darkmode_values(self, csrf_disabled_client, raw, stored):
        alice = _make_user()
        alice.darkmode = not stored  # start from a different value
        db.session.commit()
        _login_as(csrf_disabled_client, alice)
        csrf_disabled_client.post("/profile", data={"darkmode": raw})
        assert _user("alice").darkmode is stored

    def test_unknown_locale_and_timezone_are_cleared(
        self, csrf_disabled_client
    ):
        alice = _make_user()
        alice.locale = "de"
        alice.timezone = "Europe/Zurich"
        db.session.commit()
        _login_as(csrf_disabled_client, alice)
        csrf_disabled_client.post("/profile", data={
            "locale": "fr", "timezone": "Mars/Olympus_Mons",
        })
        alice = _user("alice")
        assert alice.locale is None
        assert alice.timezone is None

    def test_unchecked_block_invitations_turns_it_off(
        self, csrf_disabled_client
    ):
        alice = _make_user()
        alice.block_invitations = True
        db.session.commit()
        _login_as(csrf_disabled_client, alice)
        csrf_disabled_client.post("/profile", data={"locale": "en"})
        assert _user("alice").block_invitations is False

    def test_email_field_is_ignored(self, csrf_disabled_client):
        alice = _make_user()
        _login_as(csrf_disabled_client, alice)
        csrf_disabled_client.post("/profile", data={
            "email": "evil@example.com", "locale": "en",
        })
        alice = _user("alice")
        assert alice.email == "alice@example.com"
        assert alice.email_lower == "alice@example.com"

    # Regression: User.timezone is String(20) but the profile offers every pytz
    # common timezone, e.g. America/Argentina/Buenos_Aires (30 chars);
    # PostgreSQL rejects the save
    def test_column_holds_every_offered_timezone(self):
        longest = max(pytz.common_timezones, key=len)
        assert len(longest) <= User.__table__.c.timezone.type.length


class TestProfileLabel:
    def test_updates_user_and_primary_group(self, csrf_disabled_client):
        alice = _make_user()
        _login_as(csrf_disabled_client, alice)
        r = csrf_disabled_client.post("/profile", data={
            "action": "label", "label": "  Alice Smith  ",
        })
        assert r.status_code == 302
        alice = _user("alice")
        assert alice.label == "Alice Smith"
        assert alice.name == "alice"
        assert _primary(alice).label == "Alice Smith"
        assert "Display name updated" in _flashes(csrf_disabled_client)

    def test_duplicate_labels_are_allowed(self, csrf_disabled_client):
        _make_user(name="bob", email="bob@example.com")
        alice = _make_user()
        _login_as(csrf_disabled_client, alice)
        csrf_disabled_client.post("/profile", data={
            "action": "label", "label": "Bob",
        })
        assert _user("alice").label == "Bob"

    @pytest.mark.parametrize("label, message", [
        ("   ", "Label is required"),
        ("x" * 51, "Label is too long"),
    ])
    def test_rejects_bad_label(self, csrf_disabled_client, label, message):
        alice = _make_user()
        _login_as(csrf_disabled_client, alice)
        csrf_disabled_client.post("/profile", data={
            "action": "label", "label": label,
        })
        alice = _user("alice")
        assert alice.label == "Alice"
        assert _primary(alice).label == "Alice"
        assert message in _flashes(csrf_disabled_client)


class TestProfilePassword:
    def _post(self, client, current="correcthorse1", new="new-passphrase-7",
              confirm=None):
        return client.post("/profile", data={
            "action": "password",
            "current_password": current,
            "new_password": new,
            "confirm_password": new if confirm is None else confirm,
        })

    def test_change_succeeds_and_keeps_this_session(
        self, csrf_disabled_client
    ):
        alice = _make_user()
        alice.password_reset_code = "pending"
        db.session.commit()
        _login_as(csrf_disabled_client, alice)
        r = self._post(csrf_disabled_client)
        assert r.status_code == 302
        alice = _user("alice")
        assert check_password_hash(alice.password, "new-passphrase-7")
        assert alice.session_token_version == 1
        assert alice.password_reset_code is None
        assert "Password changed" in _flashes(csrf_disabled_client)
        _reset_access_date(alice)
        assert csrf_disabled_client.get("/profile").status_code == 200

    @pytest.mark.parametrize("kwargs, message", [
        ({"current": "wrong-password"}, "Current password is incorrect"),
        ({"new": ""}, "Password cannot be empty"),
        ({"confirm": "something-else"}, "Passwords do not match"),
        ({"new": "password"}, "Password must be at least 8 characters"),
        ({"new": "alice"}, "Password must be at least 8 characters"),
    ])
    def test_rejections_keep_old_password(
        self, csrf_disabled_client, kwargs, message
    ):
        alice = _make_user()
        _login_as(csrf_disabled_client, alice)
        self._post(csrf_disabled_client, **kwargs)
        alice = _user("alice")
        assert check_password_hash(alice.password, "correcthorse1")
        assert alice.session_token_version == 0
        flashes = _flashes(csrf_disabled_client)
        assert any(f.startswith(message) for f in flashes)


# ---------- settings API ----------------------------------------------


class TestUserSettingsApi:
    def test_requires_login(self, client):
        assert client.get("/api/user/settings").status_code == 401

    def test_put_requires_login(self, csrf_disabled_client):
        r = csrf_disabled_client.put(
            "/api/user/settings", json={"zoom": 3},
        )
        assert r.status_code == 401

    def test_get_empty_settings(self, csrf_disabled_client):
        alice = _make_user()
        _login_as(csrf_disabled_client, alice)
        r = csrf_disabled_client.get("/api/user/settings")
        assert r.status_code == 200
        assert r.get_json() == {"status": "OK", "settings": {}}

    def test_put_merges_with_stored_settings(self, csrf_disabled_client):
        alice = _make_user()
        alice.settings = json.dumps({"zoom": 2, "grid": True})
        db.session.commit()
        _login_as(csrf_disabled_client, alice)
        r = csrf_disabled_client.put(
            "/api/user/settings", json={"zoom": 5, "sort": "name"},
        )
        assert r.status_code == 200
        expected = {"zoom": 5, "grid": True, "sort": "name"}
        assert r.get_json()["settings"] == expected
        assert json.loads(_user("alice").settings) == expected
        _reset_access_date(alice)
        r = csrf_disabled_client.get("/api/user/settings")
        assert r.get_json()["settings"] == expected

    @pytest.mark.parametrize("body", ["[1, 2]", "42", "not json"])
    def test_put_rejects_non_object(self, csrf_disabled_client, body):
        alice = _make_user()
        alice.settings = json.dumps({"zoom": 2})
        db.session.commit()
        _login_as(csrf_disabled_client, alice)
        r = csrf_disabled_client.put(
            "/api/user/settings", data=body,
            content_type="application/json",
        )
        assert r.status_code == 400
        assert json.loads(_user("alice").settings) == {"zoom": 2}

    @pytest.mark.parametrize("stored", ["{broken", "[1, 2]"])
    def test_corrupt_stored_settings_are_replaced(
        self, csrf_disabled_client, stored
    ):
        alice = _make_user()
        alice.settings = stored
        db.session.commit()
        _login_as(csrf_disabled_client, alice)
        r = csrf_disabled_client.put(
            "/api/user/settings", json={"zoom": 1},
        )
        assert r.status_code == 200
        assert json.loads(_user("alice").settings) == {"zoom": 1}

    def test_get_with_corrupt_settings_returns_empty(
        self, csrf_disabled_client
    ):
        alice = _make_user()
        alice.settings = "{broken"
        db.session.commit()
        _login_as(csrf_disabled_client, alice)
        r = csrf_disabled_client.get("/api/user/settings")
        assert r.get_json()["settings"] == {}


# ---------- profile export --------------------------------------------


@pytest.fixture
def exportable(app):
    """alice owns pattern 'twill' (shared into her primary group and
    the global group 'club') and has a direct chat with bob; bob owns
    pattern 'secret'."""
    alice = _make_user()
    bob = _make_user(name="bob", email="bob@example.com")
    primary = _primary(alice)
    club = Group(name="club", label="Club", description="Weavers")
    twill = Pattern(
        name="twill", label="Twill", owner=alice, public=False,
        pattern_type="DB-WEAVE Pattern", contents=json.dumps(_weave()),
    )
    secret = Pattern(
        name="secret", label="Secret", owner=bob, public=False,
        pattern_type="DB-WEAVE Pattern", contents=json.dumps(_weave()),
    )
    db.session.add_all([
        club, twill, secret,
        Membership(user=alice, group=club, role="writer", state="accepted"),
        Assignment(pattern=twill, group=primary),
        Assignment(pattern=twill, group=club),
    ])
    db.session.flush()
    conv = get_or_create_direct_conversation(alice, bob)
    post_message(conv, alice, "Hello Bob")
    post_message(conv, bob, "Hi Alice")
    db.session.commit()
    return alice


class TestProfileExport:
    def test_requires_login(self, client):
        r = client.get("/profile/export")
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]

    def test_zip_contents(self, csrf_disabled_client, exportable):
        _login_as(csrf_disabled_client, exportable)
        r = csrf_disabled_client.get("/profile/export")
        assert r.status_code == 200
        assert r.mimetype == "application/zip"
        assert "alice-export.zip" in r.headers["Content-Disposition"]
        zf = zipfile.ZipFile(io.BytesIO(r.data))
        names = set(zf.namelist())
        assert {
            "profile.json", "groups.json", "patterns/twill.json",
            "patterns/twill.meta.json", "messages/direct-bob.json",
        } <= names
        assert not any("secret" in n for n in names)

        profile = json.loads(zf.read("profile.json"))
        assert profile["name"] == "alice"
        assert profile["email"] == "alice@example.com"
        assert profile["verified"] is True

        assert json.loads(zf.read("patterns/twill.json")) == _weave()
        meta = json.loads(zf.read("patterns/twill.meta.json"))
        assert meta["label"] == "Twill"
        assert meta["pattern_type"] == "DB-WEAVE Pattern"
        assert sorted(meta["groups"]) == ["alice", "club"]

        groups = {g["group_name"]: g for g in
                  json.loads(zf.read("groups.json"))}
        assert groups["alice"]["role"] == "owner"
        assert groups["club"]["role"] == "writer"
        assert groups["club"]["description"] == "Weavers"

        chat = json.loads(zf.read("messages/direct-bob.json"))
        assert chat["kind"] == "direct"
        assert chat["partner"] == "bob"
        bodies = [(m["sender"], m["body"]) for m in chat["messages"]]
        assert bodies == [("alice", "Hello Bob"), ("bob", "Hi Alice")]


# ---------- profile delete --------------------------------------------


class TestProfileDelete:
    def test_requires_login(self, csrf_disabled_client):
        _make_user()
        r = csrf_disabled_client.post("/profile/delete", data={
            "password": "correcthorse1", "confirm": "DELETE",
        })
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]
        assert _user("alice") is not None

    def test_requires_typed_confirmation(self, csrf_disabled_client):
        alice = _make_user()
        _login_as(csrf_disabled_client, alice)
        r = csrf_disabled_client.post("/profile/delete", data={
            "password": "correcthorse1", "confirm": "yes",
        })
        assert r.headers["Location"].endswith("/profile")
        assert _user("alice") is not None
        assert 'Please type "DELETE" to confirm.' in _flashes(
            csrf_disabled_client)

    def test_requires_correct_password(self, csrf_disabled_client):
        alice = _make_user()
        _login_as(csrf_disabled_client, alice)
        csrf_disabled_client.post("/profile/delete", data={
            "password": "wrong-password", "confirm": "DELETE",
        })
        assert _user("alice") is not None
        assert "Incorrect password." in _flashes(csrf_disabled_client)

    def test_support_account_cannot_be_deleted(self, csrf_disabled_client):
        support = _make_user(name="support", email="support@example.com")
        _login_as(csrf_disabled_client, support)
        csrf_disabled_client.post("/profile/delete", data={
            "password": "correcthorse1", "confirm": "DELETE",
        })
        assert _user("support") is not None

    def test_deletes_account_and_owned_data(
        self, csrf_disabled_client, exportable
    ):
        alice_id = exportable.id
        _login_as(csrf_disabled_client, exportable)
        r = csrf_disabled_client.post("/profile/delete", data={
            "password": "correcthorse1", "confirm": " delete ",
        })
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/")
        assert _logged_in_name(csrf_disabled_client) is None
        assert _user("alice") is None
        assert Pattern.query.filter_by(owner_id=alice_id).count() == 0
        assert Group.query.filter_by(owner_id=alice_id).count() == 0
        assert Membership.query.filter_by(user_id=alice_id).count() == 0
        # Other people's data survives.
        assert Pattern.query.filter_by(name="secret").count() == 1
        assert Group.query.filter_by(name="club").count() == 1

    def test_direct_chat_survives_for_partner(
        self, csrf_disabled_client, exportable
    ):
        _login_as(csrf_disabled_client, exportable)
        csrf_disabled_client.post("/profile/delete", data={
            "password": "correcthorse1", "confirm": "DELETE",
        })
        conv = Conversation.query.filter_by(kind="direct").one()
        partners = {p.user.name for p in conv.participants}
        assert "bob" in partners
        placeholder = next(p.user for p in conv.participants
                           if p.user.name != "bob")
        assert placeholder.name.startswith("_deleted_")
        assert placeholder.disabled is True
        msgs = {m.sender.name: m for m in Message.query.all()}
        assert msgs["bob"].body == "Hi Alice"
        wiped = msgs[placeholder.name]
        assert wiped.deleted is True
        assert wiped.body == ""


# ---------- admin rename (change_user_name) ---------------------------


class TestAdminRename:
    def _rename(self, client, target, new_name):
        return client.post(f"/admin/users/{target}/set-name",
                           data={"name": new_name})

    def _support(self, client):
        support = _make_user(name="support", email="support@example.com")
        _login_as(client, support)
        return support

    def test_renames_user_and_primary_group(
        self, csrf_disabled_client, captured_mails
    ):
        alice = _make_user()
        self._support(csrf_disabled_client)
        r = self._rename(csrf_disabled_client, "alice", "  Alicia ")
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/admin/users/alicia")
        assert _user("alice") is None
        alice = _user("alicia")
        assert alice.session_token_version == 1
        assert _primary(alice).name == "alicia"
        assert "Name updated." in _flashes(csrf_disabled_client)
        assert len(_mails_to(captured_mails, SUPPORT_ADDRESS)) == 1

    def test_same_name_is_a_no_op(self, csrf_disabled_client):
        _make_user()
        self._support(csrf_disabled_client)
        self._rename(csrf_disabled_client, "alice", "alice")
        assert _user("alice").session_token_version == 0

    @pytest.mark.parametrize("new_name, message", [
        ("", "Name is required"),
        ("admin", "Name is invalid and cannot be used"),
        ("a/b", "Name is invalid and cannot be used"),
        ("bob", "Another account already uses this name"),
        ("club", "Another group already uses this name"),
    ])
    def test_rejections(self, csrf_disabled_client, new_name, message):
        _make_user()
        _make_user(name="bob", email="bob@example.com")
        db.session.add(Group(name="club", label="Club", description=""))
        db.session.commit()
        self._support(csrf_disabled_client)
        r = self._rename(csrf_disabled_client, "alice", new_name)
        assert r.headers["Location"].endswith("/admin/users/alice")
        alice = _user("alice")
        assert alice is not None
        assert alice.session_token_version == 0
        assert message in _flashes(csrf_disabled_client)

    def test_other_users_personal_group_does_not_clash(
        self, csrf_disabled_client
    ):
        _make_user()
        bob = _make_user(name="bob", email="bob@example.com")
        db.session.add(Group(name="weavers", label="W", description="",
                             owner_id=bob.id))
        db.session.commit()
        self._support(csrf_disabled_client)
        self._rename(csrf_disabled_client, "alice", "weavers")
        assert _user("weavers") is not None

    def test_non_support_cannot_rename(self, csrf_disabled_client):
        _make_user()
        bob = _make_user(name="bob", email="bob@example.com")
        _login_as(csrf_disabled_client, bob)
        r = self._rename(csrf_disabled_client, "alice", "alicia")
        assert r.status_code == 302
        assert _user("alice") is not None

    def test_unknown_user_is_404(self, csrf_disabled_client):
        self._support(csrf_disabled_client)
        r = self._rename(csrf_disabled_client, "ghost", "casper")
        assert r.status_code == 404


# ---------- password recovery -----------------------------------------


class TestRecoverRequest:
    def test_form_renders(self, client):
        r = client.get("/auth/recover")
        assert r.status_code == 200
        assert b'name="email"' in r.data

    def test_empty_email_is_flashed(self, csrf_disabled_client):
        r = csrf_disabled_client.post("/auth/recover", data={"email": " "})
        assert r.status_code == 200
        assert b"E-Mail is required." in r.data

    def test_known_user_gets_reset_mail(
        self, csrf_disabled_client, captured_mails
    ):
        alice = _make_user()
        r = csrf_disabled_client.post(
            "/auth/recover", data={"email": "ALICE@example.com"},
        )
        assert r.status_code == 200
        alice = _user("alice")
        code = alice.password_reset_code
        assert code
        remaining = (_as_utc(alice.password_reset_expires)
                     - datetime.datetime.now(datetime.UTC))
        assert datetime.timedelta(minutes=59) < remaining
        assert remaining <= datetime.timedelta(hours=1)
        mails = _mails_to(captured_mails, "alice@example.com")
        assert len(mails) == 1
        assert f"/auth/reset-password/alice/{code}" in mails[0]["content"]

    def test_unverified_user_gets_no_code(
        self, csrf_disabled_client, captured_mails
    ):
        alice = _make_user()
        alice.verified = False
        db.session.commit()
        csrf_disabled_client.post(
            "/auth/recover", data={"email": "alice@example.com"},
        )
        assert _user("alice").password_reset_code is None
        assert captured_mails == []

    def test_invalid_email_sends_nothing(
        self, csrf_disabled_client, captured_mails
    ):
        r = csrf_disabled_client.post(
            "/auth/recover", data={"email": "not-an-email"},
        )
        assert r.status_code == 200
        assert b"If an account exists" in r.data
        assert captured_mails == []


class TestResetPassword:
    def _post(self, client, user, code, password="new-passphrase-7",
              confirm=None):
        _restore_reset_tz(user)
        return client.post(_reset_url(user, code), data={
            "password": password,
            "confirm_password": password if confirm is None else confirm,
        })

    def test_valid_link_shows_form(self, csrf_disabled_client):
        alice = _make_user()
        code = _issue_reset_code(alice)
        r = csrf_disabled_client.get(_reset_url(alice, code))
        assert r.status_code == 200
        assert b"Please choose a new password" in r.data

    def test_full_flow_from_recover_mail(
        self, csrf_disabled_client, captured_mails
    ):
        alice = _make_user()
        csrf_disabled_client.post(
            "/auth/recover", data={"email": "alice@example.com"},
        )
        alice = _user("alice")
        code = alice.password_reset_code
        r = self._post(csrf_disabled_client, alice, code)
        assert b"Reset password successfully" in r.data
        alice = _user("alice")
        assert check_password_hash(alice.password, "new-passphrase-7")
        assert alice.password_reset_code is None
        assert alice.password_reset_expires is None
        assert alice.session_token_version == 1
        _reset_access_date(alice)
        # _login asserts a redirect, i.e. the new password works.
        _login(csrf_disabled_client, password="new-passphrase-7")
        assert _logged_in_name(csrf_disabled_client) == "alice"

    def test_reset_logs_out_existing_sessions(self, app):
        alice = _make_user()
        logged_in = app.test_client()
        app.config["WTF_CSRF_ENABLED"] = False
        try:
            _login_as(logged_in, alice)
            code = _issue_reset_code(alice)
            self._post(app.test_client(), alice, code)
            r = logged_in.get("/profile")
        finally:
            app.config["WTF_CSRF_ENABLED"] = True
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]

    def test_link_cannot_be_reused(self, csrf_disabled_client):
        alice = _make_user()
        code = _issue_reset_code(alice)
        self._post(csrf_disabled_client, alice, code)
        r = self._post(csrf_disabled_client, alice, code,
                       password="another-passphrase-8")
        assert b"Password reset failed" in r.data
        assert check_password_hash(_user("alice").password,
                                   "new-passphrase-7")

    def test_wrong_code_fails(self, csrf_disabled_client):
        alice = _make_user()
        _issue_reset_code(alice)
        r = self._post(csrf_disabled_client, alice, "guessed-code")
        assert b"Password reset failed" in r.data
        assert check_password_hash(_user("alice").password,
                                   "correcthorse1")

    def test_expired_code_fails(self, csrf_disabled_client):
        alice = _make_user()
        code = _issue_reset_code(alice, hours=-1)
        r = csrf_disabled_client.post(_reset_url(alice, code), data={
            "password": "new-passphrase-7",
            "confirm_password": "new-passphrase-7",
        })
        assert b"Password reset failed" in r.data
        assert check_password_hash(_user("alice").password,
                                   "correcthorse1")

    def test_no_pending_code_fails(self, csrf_disabled_client):
        alice = _make_user()
        r = csrf_disabled_client.get(_reset_url(alice, "anything"))
        assert b"Password reset failed" in r.data

    def test_unknown_user_fails(self, csrf_disabled_client):
        r = csrf_disabled_client.get("/auth/reset-password/ghost/code")
        assert b"Password reset failed" in r.data

    def test_unverified_user_fails(self, csrf_disabled_client):
        alice = _make_user()
        alice.verified = False
        code = _issue_reset_code(alice)
        r = csrf_disabled_client.get(_reset_url(alice, code))
        assert b"Password reset failed" in r.data

    @pytest.mark.parametrize("password, confirm, message", [
        ("", "", b"Password is required."),
        ("new-passphrase-7", "different-7", b"Passwords do not match"),
        ("short", "short", b"Password must be at least 8 characters"),
        ("alice", "alice", b"Password must be at least 8 characters"),
    ])
    def test_rejected_password_keeps_link_valid(
        self, csrf_disabled_client, password, confirm, message
    ):
        alice = _make_user()
        code = _issue_reset_code(alice)
        r = self._post(csrf_disabled_client, alice, code,
                       password=password, confirm=confirm)
        assert message in r.data
        assert b"Please choose a new password" in r.data
        alice = _user("alice")
        assert check_password_hash(alice.password, "correcthorse1")
        assert alice.password_reset_code == code


# ---------- registration edge cases -----------------------------------


class TestRegisterEdgeCases:
    def test_name_clash_switches_to_two_field_mode(
        self, csrf_disabled_client
    ):
        _make_user()
        r = _register(csrf_disabled_client, label="Alice",
                      email="alice2@example.com")
        assert r.status_code == 200
        page = r.get_data(as_text=True)
        assert 'name="mode" value="two"' in page
        assert 'value="alice-2"' in page
        assert "already in use" in page
        assert User.query.count() == 1
        with csrf_disabled_client.session_transaction() as s:
            assert "captcha_answer" in s

    def test_two_field_mode_registers_chosen_handle(
        self, csrf_disabled_client
    ):
        _make_user()
        r = _register(csrf_disabled_client, mode="two", label="Alice",
                      name="Alice-2", email="alice2@example.com")
        assert b"Verification pending" in r.data
        user = _user("alice-2")
        assert user.label == "Alice"
        assert user.verified is False
        assert _primary(user).label == "Alice"

    def test_two_field_mode_with_taken_handle_is_rejected(
        self, csrf_disabled_client
    ):
        _make_user()
        r = _register(csrf_disabled_client, mode="two", label="Alice",
                      name="alice", email="alice2@example.com")
        assert b"Name or E-Mail is already used" in r.data
        assert b'name="mode" value="two"' in r.data
        assert User.query.count() == 1

    def test_clash_with_global_group_name(self, csrf_disabled_client):
        db.session.add(Group(name="club", label="Club", description=""))
        db.session.commit()
        r = _register(csrf_disabled_client, label="Club")
        assert b'value="club-2"' in r.data
        assert User.query.count() == 0

    def test_email_typed_as_name_suggests_a_name(
        self, csrf_disabled_client
    ):
        r = _register(csrf_disabled_client,
                      label="charlie.chesterton@example.com")
        assert r.status_code == 200
        page = r.get_data(as_text=True)
        assert "looks like an e-mail address" in page
        assert 'value="Charlie Chesterton"' in page
        assert User.query.count() == 0

    @pytest.mark.parametrize("label", ["Admin", "@@@", "x" * 51])
    def test_invalid_name_is_rejected(self, csrf_disabled_client, label):
        r = _register(csrf_disabled_client, label=label)
        assert b"Name is invalid and cannot be used" in r.data
        assert User.query.count() == 0

    def test_password_mismatch(self, csrf_disabled_client):
        r = _register(csrf_disabled_client, confirm_password="other-pass1")
        assert b"Passwords do not match" in r.data
        assert User.query.count() == 0

    def test_wrong_calculation_answer(self, csrf_disabled_client):
        # _register fetches a fresh question; answers are 4..18, so 99
        # is always wrong.
        r = _register(csrf_disabled_client, x="99")
        assert b"Calculation result required" in r.data
        assert User.query.count() == 0

    def test_captcha_answer_is_single_use(self, csrf_disabled_client):
        csrf_disabled_client.get("/auth/register")
        with csrf_disabled_client.session_transaction() as s:
            answer = s["captcha_answer"]
            del s["captcha_answer"]
        r = csrf_disabled_client.post("/auth/register", data={
            "label": "Newbie", "email": "newbie@example.com",
            "password": "correcthorse1",
            "confirm_password": "correcthorse1", "x": str(answer),
        })
        assert b"Calculation result required" in r.data
        assert User.query.count() == 0

    @pytest.mark.parametrize("fields, message", [
        ({"label": " "}, b"Name is required"),
        ({"email": ""}, b"E-Mail is required"),
        ({"email": "nope"}, b"E-Mail is not valid"),
        ({"password": "", "confirm_password": ""}, b"Password is required"),
    ])
    def test_missing_fields(self, csrf_disabled_client, fields, message):
        r = _register(csrf_disabled_client, **fields)
        assert message in r.data
        assert User.query.count() == 0

    def test_duplicate_email_is_rejected(self, csrf_disabled_client):
        _make_user()
        r = _register(csrf_disabled_client, label="Someone",
                      email="alice@example.com")
        assert b"Name or E-Mail is already used" in r.data
        db.session.rollback()
        assert _user("someone") is None

    def test_success_sends_verification_mail(
        self, csrf_disabled_client, captured_mails
    ):
        _register(csrf_disabled_client, label="Newbie Two")
        user = _user("newbie-two")
        assert user.verification_code
        mails = _mails_to(captured_mails, "newbie@example.com")
        assert len(mails) == 1
        assert (f"/auth/verify/newbie-two/{user.verification_code}"
                in mails[0]["content"])


# ---------- e-mail verification ---------------------------------------


class TestVerify:
    def _pending(self):
        user = _make_user()
        user.verified = False
        user.verification_code = "verify-code-123"
        db.session.commit()
        return user

    def test_valid_code_verifies(self, client, captured_mails):
        self._pending()
        r = client.get("/auth/verify/alice/verify-code-123")
        assert b"Verification successful" in r.data
        alice = _user("alice")
        assert alice.verified is True
        assert alice.verification_code is None
        assert alice.verify_date is not None
        assert len(_mails_to(captured_mails, SUPPORT_ADDRESS)) == 1

    def test_verified_user_can_log_in(self, csrf_disabled_client):
        self._pending()
        csrf_disabled_client.get("/auth/verify/alice/verify-code-123")
        _login_as(csrf_disabled_client, _user("alice"))
        assert _logged_in_name(csrf_disabled_client) == "alice"

    def test_unverified_user_cannot_log_in(self, csrf_disabled_client):
        self._pending()
        r = csrf_disabled_client.post("/auth/login", data={
            "email": "alice@example.com", "password": "correcthorse1",
        })
        assert b"Account verification is pending" in r.data
        assert _logged_in_name(csrf_disabled_client) is None

    def test_wrong_code_fails(self, client):
        self._pending()
        r = client.get("/auth/verify/alice/wrong-code")
        assert b"Verification failed" in r.data
        alice = _user("alice")
        assert alice.verified is False
        assert alice.verification_code == "verify-code-123"

    def test_unknown_user_fails(self, client):
        r = client.get("/auth/verify/ghost/verify-code-123")
        assert b"Verification failed" in r.data

    def test_missing_code_fails(self, client):
        user = self._pending()
        user.verification_code = None
        db.session.commit()
        r = client.get("/auth/verify/alice/verify-code-123")
        assert b"Verification failed" in r.data
        assert _user("alice").verified is False

    def test_already_verified_reports_success(self, client):
        _make_user()
        r = client.get("/auth/verify/alice/anything")
        assert b"Verification successful" in r.data

"""Admin console and support-only routes: who may reach them, what the
admin actions change, impersonation and site-wide announcements."""
import datetime
import json
import os
import types

import flask_babel
import pytest

from textileplatform import controller
from textileplatform.db import db
from textileplatform.models import (
    Announcement, Assignment, Group, Membership, Pattern, User,
)
from textileplatform.support import SUPPORT_USERNAME

from test_limits import _bead, _login_as
from test_patterns import _make_user, _reset_access_date


ADMIN_PAGES = [
    "/admin",
    "/admin/users",
    "/admin/users/alice",
    "/admin/groups",
    "/admin/groups/club",
    "/admin/patterns",
    "/admin/pending",
    "/admin/system",
]

ADMIN_ACTIONS = [
    ("/admin/users/alice/set-name", {"name": "alicia"}),
    ("/admin/users/alice/set-email", {"email": "new@example.com"}),
    ("/admin/users/alice/set-disabled", {"disabled": "1"}),
    ("/admin/users/alice/delete", {"confirm_name": "alice"}),
    ("/admin/pending/pete/resend", {}),
    ("/admin/pending/pete/delete", {}),
    ("/admin/investigate/alice/rope", {}),
    ("/admin/announcement",
     {"body_de": "Hallo", "body_en": "Hello", "days": "3"}),
    ("/admin/announcement/retire", {}),
]


@pytest.fixture
def world(app):
    """support, alice (with a bead pattern shared into the global group
    'club'), and pete, who has not verified his e-mail yet."""
    support = _make_user(name=SUPPORT_USERNAME, email="support@example.com")
    alice = _make_user()
    pete = _make_user(name="pete", email="pete@example.com")
    pete.verified = False
    pete.verification_code = None
    club = Group(name="club", label="Club", description="", public=True)
    rope = Pattern(name="rope", label="Rope", owner=alice, public=False,
                   pattern_type="JBead Pattern",
                   contents=json.dumps(_bead()))
    db.session.add_all([
        club, rope,
        Membership(user=alice, group=club, role="owner", state="accepted"),
        Assignment(pattern=rope, group=club),
    ])
    db.session.commit()
    return types.SimpleNamespace(support=support, alice=alice, pete=pete)


@pytest.fixture(autouse=True)
def _loadavg(monkeypatch):
    """os.getloadavg does not exist on Windows; see
    test_system_page_without_loadavg."""
    monkeypatch.setattr(os, "getloadavg", lambda: (0.5, 0.4, 0.3),
                        raising=False)


@pytest.fixture
def admin(world, csrf_disabled_client):
    _login_as(csrf_disabled_client, world.support)
    return csrf_disabled_client


def _flashes(client):
    with client.session_transaction() as sess:
        return [message for _, message in sess.get("_flashes", [])]


def _user(name):
    db.session.expire_all()
    return User.query.filter_by(name=name).first()


# ---------- permissions -------------------------------------------


class TestPermissions:
    @pytest.mark.parametrize("path", ADMIN_PAGES)
    def test_anonymous_page_goes_to_login(self, world, client, path):
        r = client.get(path)
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]

    @pytest.mark.parametrize("path", ADMIN_PAGES)
    def test_normal_user_page_goes_to_index(
        self, world, csrf_disabled_client, path
    ):
        _login_as(csrf_disabled_client, world.alice)
        r = csrf_disabled_client.get(path)
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/")

    @pytest.mark.parametrize("path", ADMIN_PAGES)
    def test_support_sees_page(self, admin, path):
        assert admin.get(path).status_code == 200

    @pytest.mark.parametrize("path,data", ADMIN_ACTIONS)
    def test_anonymous_action_goes_to_login(
        self, world, csrf_disabled_client, path, data
    ):
        r = csrf_disabled_client.post(path, data=data)
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]

    @pytest.mark.parametrize("path,data", ADMIN_ACTIONS)
    def test_normal_user_action_changes_nothing(
        self, world, csrf_disabled_client, path, data
    ):
        _login_as(csrf_disabled_client, world.alice)
        r = csrf_disabled_client.post(path, data=data)
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/")
        alice = _user("alice")
        assert alice.email == "alice@example.com"
        assert not alice.disabled
        assert _user("pete") is not None
        assert Pattern.query.count() == 1
        assert Announcement.query.count() == 0

    def test_normal_user_cannot_impersonate(
        self, world, csrf_disabled_client
    ):
        bob = _make_user(name="bob", email="bob@example.com")
        _login_as(csrf_disabled_client, world.alice)
        r = csrf_disabled_client.post("/admin/impersonate/bob")
        assert r.status_code == 403
        with csrf_disabled_client.session_transaction() as sess:
            assert sess["user_name"] == "alice"
            assert "impersonator" not in sess
        assert bob is not None

    def test_anonymous_cannot_impersonate(self, world, csrf_disabled_client):
        r = csrf_disabled_client.post("/admin/impersonate/alice")
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]

    def test_admin_actions_require_csrf_token(self, world, admin, app):
        app.config["WTF_CSRF_ENABLED"] = True
        r = admin.post("/admin/users/alice/set-disabled",
                        data={"disabled": "1"})
        assert r.status_code == 400
        assert not _user("alice").disabled

    def test_status_page_is_public(self, client):
        r = client.get("/admin/status")
        assert r.status_code == 200
        assert b"textileplatform version" in r.data


# ---------- admin pages -------------------------------------------


class TestAdminPages:
    def test_users_lists_users_but_not_support(self, admin):
        r = admin.get("/admin/users")
        assert b"alice" in r.data
        assert b"pete" in r.data
        assert b"/admin/users/support" not in r.data

    def test_unknown_user_is_404(self, admin):
        assert admin.get("/admin/users/nobody").status_code == 404

    def test_edit_user_shows_patterns(self, admin):
        r = admin.get("/admin/users/alice")
        assert b"alice@example.com" in r.data
        assert b">rope</button>" in r.data

    def test_groups_lists_shared_but_not_personal_groups(self, admin):
        r = admin.get("/admin/groups")
        assert b"/admin/groups/club" in r.data
        assert b"/admin/groups/alice" not in r.data

    def test_view_group_shows_members_and_patterns(self, admin):
        r = admin.get("/admin/groups/club")
        assert b"/admin/users/alice" in r.data
        assert b">rope</button>" in r.data

    def test_personal_group_is_not_an_admin_group(self, admin):
        assert admin.get("/admin/groups/alice").status_code == 404

    def test_patterns_lists_user_patterns(self, admin):
        assert b">rope</button>" in admin.get("/admin/patterns").data

    def test_pending_lists_only_unverified_users(self, admin):
        r = admin.get("/admin/pending")
        assert b"pete@example.com" in r.data
        assert b"alice@example.com" not in r.data

    def test_system_page_shows_load(self, admin):
        r = admin.get("/admin/system")
        assert r.status_code == 200
        assert b"0.5" in r.data

    # Regression: sysinfo._host_info calls _safe(os.getloadavg), but the
    # attribute lookup itself raises AttributeError where os.getloadavg does
    # not exist (Windows), so /admin/system fails with a 500 instead of showing
    # no load
    def test_system_page_without_loadavg(self, admin, monkeypatch):
        monkeypatch.delattr(os, "getloadavg", raising=False)
        assert admin.get("/admin/system").status_code == 200

    def test_console_lists_investigations(self, admin):
        admin.post("/admin/investigate/alice/rope")
        r = admin.get("/admin")
        assert b"Rope [Alice]" in r.data


# ---------- rename ------------------------------------------------


class TestSetName:
    def test_rename_moves_user_and_primary_group(
        self, admin, captured_mails
    ):
        r = admin.post("/admin/users/alice/set-name", data={"name": "Alicia"})
        assert r.headers["Location"].endswith("/admin/users/alicia")
        assert _user("alice") is None
        alicia = _user("alicia")
        assert alicia.session_token_version == 1
        assert Group.query.filter_by(
            owner_id=alicia.id, name="alicia",
        ).one()
        assert "Name updated." in _flashes(admin)
        assert any("Admin changed name from alice" in m["content"]
                   for m in captured_mails)

    def test_rename_logs_the_user_out(self, world, admin, app):
        other = app.test_client()
        _login_as(other, world.alice)
        admin.post("/admin/users/alice/set-name", data={"name": "alicia"})
        r = other.get("/profile")
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]

    def test_taken_name_is_refused(self, admin):
        r = admin.post("/admin/users/alice/set-name", data={"name": "pete"})
        assert r.headers["Location"].endswith("/admin/users/alice")
        assert _user("alice") is not None
        assert "Another account already uses this name" in _flashes(admin)

    def test_name_of_global_group_is_refused(self, admin):
        admin.post("/admin/users/alice/set-name", data={"name": "club"})
        assert _user("alice") is not None
        assert "Another group already uses this name" in _flashes(admin)

    @pytest.mark.parametrize("name", ["", "admin", "a/b"])
    def test_invalid_name_is_refused(self, admin, name):
        admin.post("/admin/users/alice/set-name", data={"name": name})
        assert _user("alice") is not None
        assert _user("alice").session_token_version == 0

    def test_same_name_changes_nothing(self, admin, captured_mails):
        admin.post("/admin/users/alice/set-name", data={"name": "alice"})
        assert _user("alice").session_token_version == 0
        assert captured_mails == []

    def test_support_cannot_be_renamed(self, admin):
        admin.post("/admin/users/support/set-name", data={"name": "boss"})
        assert _user(SUPPORT_USERNAME) is not None
        assert "The support account cannot be renamed." in _flashes(admin)

    def test_unknown_user_is_404(self, admin):
        r = admin.post("/admin/users/nobody/set-name", data={"name": "x"})
        assert r.status_code == 404


# ---------- e-mail ------------------------------------------------


class TestSetEmail:
    def test_change_updates_email_and_notifies(self, admin, captured_mails):
        r = admin.post("/admin/users/alice/set-email",
                       data={"email": "Alice@New.example"})
        assert r.headers["Location"].endswith("/admin/users/alice")
        alice = _user("alice")
        assert alice.email == "Alice@New.example"
        assert alice.email_lower == "alice@new.example"
        assert alice.session_token_version == 1
        receivers = {m["receiver"] for m in captured_mails}
        assert {"alice@example.com", "Alice@New.example"} <= receivers
        assert "E-Mail updated." in _flashes(admin)

    def test_user_can_log_in_with_new_email(self, world, admin, app):
        admin.post("/admin/users/alice/set-email",
                   data={"email": "alice@new.example"})
        other = app.test_client()
        _reset_access_date(world.alice)
        r = other.post("/auth/login", data={
            "email": "alice@new.example", "password": "correcthorse1",
        })
        assert r.status_code == 302
        with other.session_transaction() as sess:
            assert sess["user_name"] == "alice"

    @pytest.mark.parametrize("email", ["", "not-an-email", "a@b"])
    def test_invalid_email_is_refused(self, admin, captured_mails, email):
        admin.post("/admin/users/alice/set-email", data={"email": email})
        assert _user("alice").email == "alice@example.com"
        assert "E-Mail is not valid" in _flashes(admin)
        assert captured_mails == []

    def test_email_of_another_account_is_refused(self, admin):
        admin.post("/admin/users/alice/set-email",
                   data={"email": "PETE@example.com"})
        assert _user("alice").email == "alice@example.com"
        assert ("Another account already uses this e-mail address"
                in _flashes(admin))

    def test_unchanged_email_sends_no_mail(self, admin, captured_mails):
        admin.post("/admin/users/alice/set-email",
                   data={"email": "ALICE@example.com"})
        assert _user("alice").session_token_version == 0
        assert captured_mails == []

    def test_unknown_user_is_404(self, admin):
        r = admin.post("/admin/users/nobody/set-email",
                       data={"email": "x@example.com"})
        assert r.status_code == 404


# ---------- disable -----------------------------------------------


class TestSetDisabled:
    def test_disable_and_enable(self, admin):
        admin.post("/admin/users/alice/set-disabled", data={"disabled": "1"})
        assert _user("alice").disabled
        assert "Account disabled." in _flashes(admin)
        admin.post("/admin/users/alice/set-disabled", data={"disabled": "0"})
        assert not _user("alice").disabled
        assert "Account enabled." in _flashes(admin)

    def test_disabling_logs_the_user_out(self, world, admin, app):
        other = app.test_client()
        _login_as(other, world.alice)
        admin.post("/admin/users/alice/set-disabled", data={"disabled": "1"})
        r = other.get("/profile")
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]

    def test_unchanged_state_flashes_nothing(self, admin):
        admin.post("/admin/users/alice/set-disabled", data={"disabled": "0"})
        assert not _user("alice").disabled
        assert _flashes(admin) == []

    def test_support_cannot_be_disabled(self, admin):
        admin.post("/admin/users/support/set-disabled",
                   data={"disabled": "1"})
        assert not _user(SUPPORT_USERNAME).disabled
        assert "The support account cannot be disabled." in _flashes(admin)

    def test_unknown_user_is_404(self, admin):
        r = admin.post("/admin/users/nobody/set-disabled",
                       data={"disabled": "1"})
        assert r.status_code == 404


# ---------- delete ------------------------------------------------


class TestDeleteUser:
    def test_delete_removes_user_and_patterns(self, admin):
        r = admin.post("/admin/users/alice/delete",
                       data={"confirm_name": "alice"})
        assert r.headers["Location"].endswith("/admin/users")
        assert _user("alice") is None
        assert Pattern.query.count() == 0
        assert Assignment.query.count() == 0
        assert 'Account "Alice" deleted.' in _flashes(admin)

    def test_wrong_confirmation_is_refused(self, admin):
        r = admin.post("/admin/users/alice/delete",
                       data={"confirm_name": "Alice"})
        assert r.headers["Location"].endswith("/admin/users/alice")
        assert _user("alice") is not None
        assert Pattern.query.count() == 1

    def test_support_cannot_be_deleted(self, admin):
        admin.post("/admin/users/support/delete",
                   data={"confirm_name": SUPPORT_USERNAME})
        assert _user(SUPPORT_USERNAME) is not None
        assert "The support account cannot be deleted." in _flashes(admin)

    def test_unknown_user_is_404(self, admin):
        r = admin.post("/admin/users/nobody/delete",
                       data={"confirm_name": "nobody"})
        assert r.status_code == 404


# ---------- pending users -----------------------------------------


class TestPendingUsers:
    def test_resend_creates_code_and_mails_it(self, admin, captured_mails):
        r = admin.post("/admin/pending/pete/resend")
        assert r.headers["Location"].endswith("/admin/pending")
        pete = _user("pete")
        assert pete.verification_code
        assert [m["receiver"] for m in captured_mails] == ["pete@example.com"]
        assert pete.verification_code in captured_mails[0]["content"]
        assert ("Verification e-mail sent to pete@example.com."
                in _flashes(admin))

    def test_resend_keeps_an_existing_code(self, world, admin, captured_mails):
        world.pete.verification_code = "existing-code"
        db.session.commit()
        admin.post("/admin/pending/pete/resend")
        assert _user("pete").verification_code == "existing-code"
        assert "existing-code" in captured_mails[0]["content"]

    def test_resend_to_verified_user_is_refused(self, admin, captured_mails):
        admin.post("/admin/pending/alice/resend")
        assert captured_mails == []
        assert "This account is already verified." in _flashes(admin)

    def test_resend_unknown_user_is_404(self, admin):
        assert admin.post("/admin/pending/nobody/resend").status_code == 404

    def test_delete_pending_user(self, admin):
        r = admin.post("/admin/pending/pete/delete")
        assert r.headers["Location"].endswith("/admin/pending")
        assert _user("pete") is None
        assert 'Account "Pete" deleted.' in _flashes(admin)

    def test_verified_user_cannot_be_deleted_as_pending(self, admin):
        admin.post("/admin/pending/alice/delete")
        assert _user("alice") is not None
        assert ("Only non-verified accounts can be deleted here."
                in _flashes(admin))

    def test_delete_unknown_pending_user_is_404(self, admin):
        assert admin.post("/admin/pending/nobody/delete").status_code == 404


# ---------- investigation copies ----------------------------------


class TestInvestigate:
    def test_creates_private_copy_owned_by_support(self, world, admin):
        r = admin.post("/admin/investigate/alice/rope")
        assert r.headers["Location"].endswith("/admin")
        copy = Pattern.query.filter_by(owner_id=world.support.id).one()
        rope = Pattern.query.filter_by(owner_id=world.alice.id).one()
        assert copy.contents == rope.contents
        assert copy.public is False
        assert copy.label.startswith("Rope [Alice] ")
        assert copy.investigation_origin_user_id == world.alice.id
        assert copy.investigation_origin_pattern_id == rope.id
        assert copy.investigation_origin_label == "alice/rope"
        assert copy.assignments == []
        assert "Investigation copy created" in _flashes(admin)

    def test_unknown_owner_is_404(self, admin):
        assert admin.post("/admin/investigate/nobody/rope").status_code == 404

    def test_unknown_pattern_is_404(self, admin):
        r = admin.post("/admin/investigate/alice/nothing")
        assert r.status_code == 404

    def test_delete_investigation_copy(self, world, admin):
        admin.post("/admin/investigate/alice/rope")
        copy = Pattern.query.filter_by(owner_id=world.support.id).one()
        r = admin.post(f"/admin/investigate/{copy.id}/delete")
        assert r.headers["Location"].endswith("/admin")
        assert Pattern.query.filter_by(owner_id=world.support.id).count() == 0
        assert Pattern.query.filter_by(owner_id=world.alice.id).count() == 1

    def test_original_cannot_be_deleted_as_investigation(self, world, admin):
        rope = Pattern.query.filter_by(owner_id=world.alice.id).one()
        r = admin.post(f"/admin/investigate/{rope.id}/delete")
        assert r.status_code == 404
        assert Pattern.query.count() == 1

    # Regression: investigate_pattern names the copy after the label plus a
    # seconds timestamp; a second investigation of the same pattern within one
    # second violates the (owner_id, name) unique constraint and fails with a
    # 500
    def test_two_investigations_in_the_same_second(
        self, world, admin, monkeypatch
    ):
        fixed = datetime.datetime(2026, 5, 1, 12, 0, 0, tzinfo=datetime.UTC)

        class FrozenDatetime(datetime.datetime):
            @classmethod
            def now(cls, tz=None):
                return fixed

        monkeypatch.setattr(controller, "datetime", types.SimpleNamespace(
            datetime=FrozenDatetime, UTC=datetime.UTC,
            timedelta=datetime.timedelta,
        ))
        admin.post("/admin/investigate/alice/rope")
        admin.post("/admin/investigate/alice/rope")
        assert Pattern.query.filter_by(owner_id=world.support.id).count() == 2

    # Regression: investigate_pattern appends ' [<owner label>] <timestamp>' to
    # the pattern label without truncating; txpattern.label and .name are
    # String(100), so on PostgreSQL a long label fails the insert with a 500
    # (SQLite does not enforce the length)
    def test_long_label_fits_the_columns(self, world, admin):
        world.alice.mypatterns[0].label = "R" * 90
        db.session.commit()
        admin.post("/admin/investigate/alice/rope")
        copy = Pattern.query.filter_by(owner_id=world.support.id).one()
        assert len(copy.label) <= 100
        assert len(copy.name) <= 100


# ---------- impersonation -----------------------------------------


class TestImpersonation:
    def test_impersonated_session_acts_as_target(self, world, admin):
        r = admin.post("/admin/impersonate/alice")
        assert r.headers["Location"].endswith("/alice")
        with admin.session_transaction() as sess:
            assert sess["user_name"] == "alice"
            assert sess["impersonator"] == SUPPORT_USERNAME
        r = admin.get("/alice")
        assert r.status_code == 200
        assert b"impersonation-banner" in r.data
        r = admin.get("/api/pattern/alice/rope")
        assert r.status_code == 200

    def test_impersonated_session_has_no_admin_rights(self, admin):
        admin.post("/admin/impersonate/alice")
        r = admin.get("/admin/users")
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/")

    def test_stop_impersonating_returns_to_support(self, admin):
        admin.post("/admin/impersonate/alice")
        r = admin.post("/admin/stop-impersonating")
        assert r.headers["Location"].endswith("/support")
        with admin.session_transaction() as sess:
            assert sess["user_name"] == SUPPORT_USERNAME
            assert "impersonator" not in sess
        assert admin.get("/admin/users").status_code == 200

    def test_stop_without_impersonation_changes_nothing(
        self, world, csrf_disabled_client
    ):
        _login_as(csrf_disabled_client, world.alice)
        r = csrf_disabled_client.post("/admin/stop-impersonating")
        assert r.headers["Location"].endswith("/")
        with csrf_disabled_client.session_transaction() as sess:
            assert sess["user_name"] == "alice"

    def test_impersonation_can_switch_target(self, world, admin):
        bob = _make_user(name="bob", email="bob@example.com")
        admin.post("/admin/impersonate/alice")
        admin.post("/admin/impersonate/bob")
        with admin.session_transaction() as sess:
            assert sess["user_name"] == bob.name
            assert sess["impersonator"] == SUPPORT_USERNAME

    def test_next_url_is_followed(self, admin):
        r = admin.post("/admin/impersonate/alice",
                       data={"next_url": "/alice/rope"})
        assert r.headers["Location"].endswith("/alice/rope")

    def test_external_next_url_is_ignored(self, admin):
        r = admin.post("/admin/impersonate/alice",
                       data={"next_url": "https://evil.example/"})
        assert "evil.example" not in r.headers["Location"]
        assert r.headers["Location"].endswith("/alice")

    def test_disabled_user_cannot_be_impersonated(self, world, admin):
        world.alice.disabled = True
        db.session.commit()
        r = admin.post("/admin/impersonate/alice")
        assert r.headers["Location"].endswith("/admin/users")
        with admin.session_transaction() as sess:
            assert sess["user_name"] == SUPPORT_USERNAME
        assert "Cannot impersonate a disabled user" in _flashes(admin)

    @pytest.mark.parametrize("name", ["nobody", SUPPORT_USERNAME])
    def test_unknown_or_support_target_is_404(self, admin, name):
        assert admin.post(f"/admin/impersonate/{name}").status_code == 404

    def test_impersonation_does_not_touch_target_activity(self, world, admin):
        admin.post("/admin/impersonate/alice")
        admin.get("/alice")
        assert _user("alice").access_date is None


# ---------- announcements -----------------------------------------


def _publish(client, days="7"):
    return client.post("/admin/announcement", data={
        "body_de": "Wartung am Sonntag",
        "body_en": "Maintenance on Sunday",
        "days": days,
    })


class TestAnnouncements:
    def test_publish_creates_announcement(self, world, admin):
        r = _publish(admin)
        assert r.headers["Location"].endswith("/admin")
        ann = Announcement.query.one()
        assert ann.body_en == "Maintenance on Sunday"
        assert ann.author_id == world.support.id
        assert (ann.expires - ann.created) == datetime.timedelta(days=7)
        assert "Announcement published." in _flashes(admin)
        assert b"Maintenance on Sunday" in admin.get("/admin").data

    @pytest.mark.parametrize("data", [
        {"body_de": "", "body_en": "Hello", "days": "3"},
        {"body_de": "Hallo", "body_en": "  ", "days": "3"},
    ])
    def test_both_languages_are_required(self, admin, data):
        admin.post("/admin/announcement", data=data)
        assert Announcement.query.count() == 0
        assert ("Both German and English text are required."
                in _flashes(admin))

    @pytest.mark.parametrize("days", ["0", "366", "abc", ""])
    def test_duration_must_be_in_range(self, admin, days):
        _publish(admin, days=days)
        assert Announcement.query.count() == 0
        assert ("Duration must be between 1 and 365 days."
                in _flashes(admin))

    def test_shown_to_user_until_dismissed(self, world, admin, app):
        _publish(admin)
        ann_id = Announcement.query.one().id
        user = app.test_client()
        _login_as(user, world.alice)
        r = user.get("/alice", headers={"Accept-Language": "en"})
        assert b"tx-announcement" in r.data
        assert b"Maintenance on Sunday" in r.data
        r = user.post("/api/announcement/dismiss", json={"id": ann_id})
        assert r.status_code == 200
        assert _user("alice").last_seen_announcement_id == ann_id
        r = user.get("/alice")
        assert b"Maintenance on Sunday" not in r.data

    def test_german_text_for_german_users(self, world, admin, app):
        world.alice.locale = "de"
        db.session.commit()
        _publish(admin)
        user = app.test_client()
        _login_as(user, world.alice)
        # The tests share one app context, where Flask-Babel caches the
        # locale of earlier requests.
        flask_babel.refresh()
        r = user.get("/alice")
        assert b"Wartung am Sonntag" in r.data

    def test_not_shown_while_impersonating(self, admin):
        _publish(admin)
        admin.post("/admin/impersonate/alice")
        r = admin.get("/alice")
        assert b"Maintenance on Sunday" not in r.data

    def test_dismiss_while_impersonating_keeps_pointer(self, admin):
        _publish(admin)
        ann_id = Announcement.query.one().id
        admin.post("/admin/impersonate/alice")
        r = admin.post("/api/announcement/dismiss", json={"id": ann_id})
        assert r.status_code == 200
        assert _user("alice").last_seen_announcement_id is None

    def test_newer_announcement_shows_again(self, world, admin, app):
        _publish(admin)
        first = Announcement.query.one().id
        user = app.test_client()
        _login_as(user, world.alice)
        user.post("/api/announcement/dismiss", json={"id": first})
        admin.post("/admin/announcement", data={
            "body_de": "Neu", "body_en": "Brand new", "days": "1",
        })
        r = user.get("/alice", headers={"Accept-Language": "en"})
        assert b"Brand new" in r.data

    def test_dismiss_never_moves_pointer_back(self, world, admin, app):
        _publish(admin)
        _publish(admin)
        newest = Announcement.query.order_by(Announcement.id.desc()).first()
        world.alice.last_seen_announcement_id = newest.id
        db.session.commit()
        user = app.test_client()
        _login_as(user, world.alice)
        user.post("/api/announcement/dismiss", json={"id": newest.id - 1})
        assert _user("alice").last_seen_announcement_id == newest.id

    @pytest.mark.parametrize("payload", [{}, {"id": 0}, {"id": "x"}])
    def test_dismiss_rejects_invalid_id(self, world, admin, payload):
        r = admin.post("/api/announcement/dismiss", json=payload)
        assert r.status_code == 400

    def test_dismiss_requires_login(self, world, csrf_disabled_client):
        r = csrf_disabled_client.post("/api/announcement/dismiss",
                                      json={"id": 1})
        assert r.status_code == 401

    def test_retire_hides_announcement(self, world, admin, app):
        _publish(admin)
        r = admin.post("/admin/announcement/retire")
        assert r.headers["Location"].endswith("/admin")
        assert "Announcement retired." in _flashes(admin)
        assert controller._current_announcement() is None
        user = app.test_client()
        _login_as(user, world.alice)
        assert b"Maintenance on Sunday" not in user.get("/alice").data

    def test_retire_without_announcement_flashes_nothing(self, admin):
        admin.post("/admin/announcement/retire")
        assert _flashes(admin) == []

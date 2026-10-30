"""Tests for pattern metadata (bead repeat) and the upload flow."""
import io
import json

from textileplatform.db import db
from textileplatform.models import Group, Membership, Pattern, User
from textileplatform.patterns import _bead_repeat
from textileplatform.patterns import extract_pattern_metadata
from werkzeug.security import generate_password_hash


def _make_user(name="alice", email="alice@example.com",
               password="correcthorse1"):
    user = User(
        name=name,
        label=name.capitalize(),
        email=email,
        email_lower=email.lower(),
        password=generate_password_hash(password),
        verified=True,
        disabled=False,
        session_token_version=0,
    )
    group = Group(name=name, label=name.capitalize(), description="")
    membership = Membership(
        user=user, group=group, role="owner", state="accepted",
    )
    db.session.add_all([user, group, membership])
    db.session.commit()
    return user


def _login(client, email="alice@example.com", password="correcthorse1"):
    r = client.post("/auth/login", data={
        "email": email,
        "password": password,
    })
    assert r.status_code in (301, 302)


def _reset_access_date(user):
    """SQLite hands back access_date without tzinfo, which makes the
    inactivity check in load_logged_in_user fail and drop the login.
    Clearing it before a request sidesteps that test-only quirk."""
    user.access_date = None
    db.session.commit()


# ---------- bead repeat ----------------------------------------------


class TestBeadRepeat:
    def test_empty_model_has_no_repeat(self):
        assert _bead_repeat([[0, 0, 0], [0, 0, 0]]) is None
        assert _bead_repeat([]) is None
        assert _bead_repeat(None) is None

    def test_periodic_pattern(self):
        # Width 4, period 6 beads: 1 2 3 1 2 3 ... over three rows,
        # the unused top rows are ignored.
        beads = [1, 2, 3] * 4
        model = [beads[0:4], beads[4:8], beads[8:12], [0, 0, 0, 0]]
        assert _bead_repeat(model) == 3

    def test_repeat_crosses_row_boundary(self):
        # Period 5 on a rope of circumference 3.
        beads = [1, 1, 2, 2, 3] * 3
        model = [beads[i:i + 3] for i in range(0, 15, 3)]
        assert _bead_repeat(model) == 5

    def test_no_repeat_is_whole_used_area(self):
        model = [[1, 2], [3, 4]]
        assert _bead_repeat(model) == 4

    def test_metadata_uses_saved_repeat_first(self):
        model = [[1, 2], [1, 2]]
        md = extract_pattern_metadata(
            {"model": model, "repeat": 4}, "JBead Pattern"
        )
        assert md["rapport_height"] == 4

    def test_metadata_derives_missing_repeat(self):
        model = [[1, 2], [1, 2], [0, 0]]
        md = extract_pattern_metadata({"model": model}, "JBead Pattern")
        assert md["rapport_height"] == 2
        assert md["pattern_width"] == 2
        assert md["pattern_height"] == 2


# ---------- upload ---------------------------------------------------


class TestUpload:
    def test_unreadable_file_is_reported(self, csrf_disabled_client):
        user = _make_user()
        _login(csrf_disabled_client)
        bead = {
            "name": "Rope",
            "notes": "",
            "model": [[1, 2, 1, 2], [1, 2, 1, 2]] + [[0] * 4] * 3,
            "colors": [[255, 255, 255], [255, 0, 0], [0, 0, 255]],
        }
        _reset_access_date(user)
        r = csrf_disabled_client.post("/patterns/upload", data={
            "name": "",
            "file": [
                (io.BytesIO(b"this is not a pattern"), "junk.txt"),
                (io.BytesIO(json.dumps(bead).encode()), "rope.json"),
            ],
        }, content_type="multipart/form-data")
        # With a failed file we stay on the listing (not the editor),
        # so the message is visible.
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/alice")
        _reset_access_date(user)
        page = csrf_disabled_client.get(r.headers["Location"]).get_data(
            as_text=True
        )
        assert "junk.txt" in page
        p = Pattern.query.filter_by(pattern_type="JBead Pattern").one()
        assert p.rapport_height == 2


# ---------- verification ---------------------------------------------


class TestVerify:
    def test_failing_admin_mail_does_not_break_verification(
        self, client, monkeypatch
    ):
        import textileplatform.controller as controller

        def _boom(*args, **kwargs):
            raise ConnectionRefusedError("no smtp")

        monkeypatch.setattr(
            controller, "send_admin_notification_mail", _boom
        )
        user = _make_user(name="frank", email="frank@example.com")
        user.verified = False
        user.verification_code = "abc123"
        db.session.commit()
        r = client.get("/auth/verify/frank/abc123")
        assert r.status_code == 200
        frank = User.query.filter_by(name="frank").one()
        assert frank.verified
        assert frank.verify_date is not None


# ---------- group access to shared patterns --------------------------


def _shared_setup():
    """Anna owns a private bead pattern shared into group 'course';
    Carla is an accepted member, Dora is not."""
    from textileplatform.models import Assignment
    anna = _make_user(name="anna", email="anna@example.com")
    carla = _make_user(name="carla", email="carla@example.com")
    _make_user(name="dora", email="dora@example.com")
    course = Group(name="course", label="Course", description="")
    db.session.add_all([
        course,
        Membership(user=anna, group=course, role="owner",
                   state="accepted"),
        Membership(user=carla, group=course, role="reader",
                   state="accepted"),
    ])
    p = Pattern(
        name="rope", label="Rope", owner=anna,
        pattern_type="JBead Pattern", public=False,
        contents=json.dumps({"name": "Rope", "notes": "",
                             "model": [[1, 2]], "colors": [],
                             "view": {}}),
    )
    db.session.add(p)
    db.session.add(Assignment(pattern=p, group=course))
    db.session.commit()
    return anna, carla


class TestGroupAccess:
    def _as(self, client, name):
        _reset_access_date(User.query.filter_by(name=name).one())
        _login(client, email=f"{name}@example.com")
        _reset_access_date(User.query.filter_by(name=name).one())

    def test_member_can_view_and_clone_private_shared_pattern(
        self, csrf_disabled_client
    ):
        _shared_setup()
        self._as(csrf_disabled_client, "carla")
        r = csrf_disabled_client.get("/api/pattern/anna/rope")
        assert r.status_code == 200
        _reset_access_date(User.query.filter_by(name="carla").one())
        r = csrf_disabled_client.put("/api/pattern/anna/rope", json={
            "action": "clone-pattern",
        })
        assert r.get_json()["status"] == "OK"
        carla = User.query.filter_by(name="carla").one()
        assert Pattern.query.filter_by(owner_id=carla.id).count() == 1

    def test_member_cannot_save(self, csrf_disabled_client):
        _shared_setup()
        self._as(csrf_disabled_client, "carla")
        r = csrf_disabled_client.put("/api/pattern/anna/rope", json={
            "action": "save-pattern", "contents": {},
        })
        assert r.status_code == 403

    def test_non_member_cannot_view(self, csrf_disabled_client):
        _shared_setup()
        self._as(csrf_disabled_client, "dora")
        r = csrf_disabled_client.get("/api/pattern/anna/rope")
        assert r.status_code == 403

    def test_anonymous_cannot_view(self, client):
        _shared_setup()
        r = client.get("/api/pattern/anna/rope")
        assert r.status_code in (401, 403)

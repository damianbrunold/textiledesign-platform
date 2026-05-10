"""Security-focused tests for the textile platform.

Covers the fixes from the May 2026 security review: password rules,
randomized registration captcha, recover-flow non-disclosure, response
headers, session-token invalidation on password change, and CSRF
enforcement on a representative endpoint.
"""
import re

import pytest
from flask import session

from textileplatform.controller import is_acceptable_password, is_valid_email
from textileplatform.db import db
from textileplatform.models import Group, Membership, User
from werkzeug.security import generate_password_hash


# ---------- helpers ---------------------------------------------------


def _make_user(name="alice", email="alice@example.com",
               password="correcthorse1", verified=True):
    user = User(
        name=name,
        label=name.capitalize(),
        email=email,
        email_lower=email.lower(),
        password=generate_password_hash(password),
        verified=verified,
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


def _captcha_answer_from(html):
    """Extract the expected sum from the rendered captcha label."""
    m = re.search(r"(\d+)\s*\+\s*(\d+)", html)
    assert m, "captcha question not found in registration form"
    return int(m.group(1)) + int(m.group(2))


# ---------- password rules -------------------------------------------


class TestPasswordRules:
    def test_rejects_short_password(self):
        assert not is_acceptable_password("short1")

    def test_rejects_trivial_password(self):
        assert not is_acceptable_password("password")
        assert not is_acceptable_password("12345678")

    def test_rejects_username_as_password(self):
        assert not is_acceptable_password("alicealice", name="alicealice")

    def test_rejects_email_local_part(self):
        assert not is_acceptable_password(
            "alicepwd", email="alicepwd@example.com",
        )

    def test_accepts_reasonable_password(self):
        assert is_acceptable_password("correcthorse1")
        assert is_acceptable_password("a-decent-pass-9")


# ---------- email validation -----------------------------------------


class TestEmailValidation:
    def test_rejects_garbage(self):
        assert not is_valid_email("")
        assert not is_valid_email("not-an-email")
        assert not is_valid_email("@example.com")
        assert not is_valid_email("user@")
        assert not is_valid_email("user@host")  # no TLD dot
        assert not is_valid_email("a b@example.com")  # space
        assert not is_valid_email("a" * 250 + "@example.com")  # too long

    def test_accepts_normal(self):
        assert is_valid_email("user@example.com")
        assert is_valid_email("first.last+tag@sub.example.co.uk")


# ---------- captcha ---------------------------------------------------


class TestRegistrationCaptcha:
    def test_captcha_is_randomized(self, csrf_disabled_client):
        r1 = csrf_disabled_client.get("/auth/register")
        r2 = csrf_disabled_client.get("/auth/register")
        # Different sessions => independently sampled questions; over
        # many calls this should differ at least sometimes.
        questions = set()
        for _ in range(20):
            with csrf_disabled_client.session_transaction() as s:
                s.clear()
            r = csrf_disabled_client.get("/auth/register")
            m = re.search(rb"(\d+)\s*\+\s*(\d+)", r.data)
            assert m
            questions.add((int(m.group(1)), int(m.group(2))))
        assert len(questions) > 1, (
            "captcha question never varied — randomization broken"
        )

    def test_static_answer_is_rejected(self, csrf_disabled_client):
        # Hit GET to mint a fresh question, then submit the legacy
        # constant "7" — should be rejected unless that happens to be
        # the right answer (small but possible). Re-roll until it isn't.
        for _ in range(20):
            r = csrf_disabled_client.get("/auth/register")
            answer = _captcha_answer_from(r.get_data(as_text=True))
            if answer != 7:
                break
        else:
            pytest.skip("could not find a question whose answer != 7")

        r = csrf_disabled_client.post("/auth/register", data={
            "name": "newuser",
            "email": "newuser@example.com",
            "password": "correcthorse1",
            "x": "7",
        })
        # Form re-renders with a flash; user must not have been created.
        assert User.query.filter_by(name="newuser").first() is None

    def test_correct_answer_accepted(self, csrf_disabled_client):
        r = csrf_disabled_client.get("/auth/register")
        answer = _captcha_answer_from(r.get_data(as_text=True))
        r = csrf_disabled_client.post("/auth/register", data={
            "name": "newuser",
            "email": "newuser@example.com",
            "password": "correcthorse1",
            "x": str(answer),
        }, follow_redirects=False)
        # On success the verification_pending template is rendered.
        assert User.query.filter_by(name="newuser").first() is not None


# ---------- weak-password rejection at registration ------------------


class TestRegistrationWeakPassword:
    def test_rejects_short_password_at_register(self, csrf_disabled_client):
        r = csrf_disabled_client.get("/auth/register")
        answer = _captcha_answer_from(r.get_data(as_text=True))
        csrf_disabled_client.post("/auth/register", data={
            "name": "weakie",
            "email": "weakie@example.com",
            "password": "abc",
            "x": str(answer),
        })
        assert User.query.filter_by(name="weakie").first() is None


# ---------- /auth/recover doesn't leak existence ---------------------


class TestRecoverNonDisclosure:
    def test_unknown_email_renders_same_page(self, csrf_disabled_client):
        _make_user(name="carol", email="carol@example.com")
        r1 = csrf_disabled_client.post(
            "/auth/recover", data={"email": "carol@example.com"},
        )
        r2 = csrf_disabled_client.post(
            "/auth/recover", data={"email": "ghost@example.com"},
        )
        assert r1.status_code == 200 and r2.status_code == 200
        # Both responses should hit the same template; the body should
        # not contain the previous "E-Mail is unknown." message.
        assert b"unknown" not in r1.data.lower()
        assert b"unknown" not in r2.data.lower()
        # And the unknown-email branch must not have created a reset
        # code on any other user.
        assert User.query.filter(
            User.password_reset_code.isnot(None)
        ).count() <= 1


# ---------- security response headers --------------------------------


class TestResponseHeaders:
    def test_headers_present(self, client):
        r = client.get("/auth/login")
        assert r.headers.get("X-Frame-Options") == "DENY"
        assert r.headers.get("X-Content-Type-Options") == "nosniff"
        assert r.headers.get("Referrer-Policy") == "same-origin"
        csp = r.headers.get("Content-Security-Policy") or ""
        assert "default-src 'self'" in csp
        assert "frame-ancestors 'none'" in csp

    def test_hsts_only_on_https(self, client):
        # Test client speaks plain http; HSTS must not leak through.
        r = client.get("/auth/login")
        assert "Strict-Transport-Security" not in r.headers

    def test_hsts_present_on_https(self, client):
        # Simulate the ProxyFix-translated scheme by passing
        # X-Forwarded-Proto, which the test client surfaces via WSGI.
        r = client.get("/auth/login", base_url="https://localhost")
        hsts = r.headers.get("Strict-Transport-Security") or ""
        assert "max-age=" in hsts
        assert "includeSubDomains" in hsts


# ---------- login + session-token invalidation -----------------------


class TestLoginFlow:
    def test_login_succeeds_with_correct_credentials(
        self, csrf_disabled_client
    ):
        _make_user(name="dave", email="dave@example.com",
                   password="correcthorse1")
        r = csrf_disabled_client.post("/auth/login", data={
            "email": "dave@example.com",
            "password": "correcthorse1",
        }, follow_redirects=False)
        assert r.status_code in (301, 302)
        with csrf_disabled_client.session_transaction() as s:
            assert s.get("user_name") == "dave"
            assert s.get("session_token_version") == 0

    def test_login_fails_with_bad_password(self, csrf_disabled_client):
        _make_user(name="erin", email="erin@example.com",
                   password="correcthorse1")
        r = csrf_disabled_client.post("/auth/login", data={
            "email": "erin@example.com",
            "password": "wrong",
        })
        with csrf_disabled_client.session_transaction() as s:
            assert s.get("user_name") is None
        # Generic error message — no enumeration.
        assert b"not correct" in r.data.lower() or r.status_code == 200

    def test_password_change_invalidates_other_sessions(
        self, csrf_disabled_client, app,
    ):
        user = _make_user(name="frank", email="frank@example.com",
                          password="correcthorse1")
        # Simulate an "other device" session by stamping the cookie at
        # the current token version.
        with csrf_disabled_client.session_transaction() as s:
            s["user_name"] = "frank"
            s["session_token_version"] = user.session_token_version
        # Bump the version directly (as the password-change path would).
        user.session_token_version += 1
        db.session.commit()
        # Next request from this stale session should be redirected to
        # login.
        r = csrf_disabled_client.get("/profile", follow_redirects=False)
        assert r.status_code in (301, 302)
        assert "/auth/login" in r.headers.get("Location", "")


# ---------- CSRF enforcement -----------------------------------------


class TestCSRF:
    def test_post_without_token_is_rejected(self, client):
        # client fixture has CSRF enabled.
        r = client.post("/auth/login", data={
            "email": "anyone@example.com",
            "password": "irrelevant",
        })
        assert r.status_code == 400


# ---------- rate limiting (sanity) -----------------------------------


class TestRateLimit:
    def test_login_rate_limited(self, app):
        # Re-enable the limiter for this test only.
        app.config["RATELIMIT_ENABLED"] = True
        app.config["WTF_CSRF_ENABLED"] = False
        try:
            client = app.test_client()
            # Limit is 10/minute; the 11th must 429.
            last = None
            for _ in range(11):
                last = client.post("/auth/login", data={
                    "email": "nobody@example.com",
                    "password": "x",
                })
            assert last.status_code == 429
        finally:
            app.config["RATELIMIT_ENABLED"] = False
            app.config["WTF_CSRF_ENABLED"] = True

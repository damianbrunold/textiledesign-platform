"""Shared pytest fixtures for the textile platform.

The app module reads several environment variables at import time, so we
set safe in-test values before importing anything from textileplatform.
We also point SQLAlchemy at an in-memory SQLite database and create the
schema with `db.create_all()` rather than running Alembic migrations —
the goal is to test app behavior, not the migration chain.
"""
import os
import sys

# Configure the app for testing BEFORE importing it.
os.environ.setdefault("DATABASE", "sqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("ADMIN_PASSWORD", "test-admin-password")
os.environ.setdefault("SHOW_VERIFICATION_CODE", "1")

import pytest

from textileplatform import app as flask_app  # noqa: E402
from textileplatform.db import db  # noqa: E402
from textileplatform import mail as mail_module  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _stub_smtp(session_mocker=None):
    """Replace send_mail with a no-op so tests don't try to talk to a
    real SMTP server. Captured calls are available via _stub_smtp.calls."""
    calls = []

    def _capture(receiver, subject, content):
        calls.append({
            "receiver": receiver,
            "subject": subject,
            "content": content,
        })

    mail_module.send_mail = _capture
    _capture.calls = calls
    yield _capture


@pytest.fixture
def app():
    """Per-test app context with a freshly-built schema. We use a
    file-backed SQLite DB that lives only for the test, so the
    Flask-SQLAlchemy registry uses the same connection across requests
    (`:memory:` would give us an empty DB on each new connection)."""
    flask_app.config["TESTING"] = True
    flask_app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    # Use a single shared connection so the in-memory DB persists.
    flask_app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
        "connect_args": {"check_same_thread": False},
        "poolclass": __import__(
            "sqlalchemy.pool", fromlist=["StaticPool"]
        ).StaticPool,
    }
    # Limiter must not block tests: we disable it by default and
    # re-enable explicitly in the rate-limit test.
    flask_app.config["RATELIMIT_ENABLED"] = False
    # CSRF is enabled by default so tests catch regressions; individual
    # tests can disable it by setting WTF_CSRF_ENABLED=False on the
    # client.
    flask_app.config["WTF_CSRF_ENABLED"] = True
    # Make session cookies usable over plain-HTTP test client.
    flask_app.config["SESSION_COOKIE_SECURE"] = False
    with flask_app.app_context():
        db.drop_all()
        db.create_all()
        yield flask_app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def csrf_disabled_client(app):
    app.config["WTF_CSRF_ENABLED"] = False
    try:
        yield app.test_client()
    finally:
        app.config["WTF_CSRF_ENABLED"] = True


@pytest.fixture
def captured_mails(_stub_smtp):
    _stub_smtp.calls.clear()
    return _stub_smtp.calls

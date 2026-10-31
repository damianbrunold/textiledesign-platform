"""Browser end-to-end tests (Playwright).

The app runs in a background thread on a real port, against the same
in-memory SQLite database the `app` fixture builds for every test. The
server handles one request at a time under `DB_LOCK`; test code takes
the same lock (`db_access()`) whenever it touches the database, so the
two threads never use the shared connection at once.

Never hold `db_access()` while the browser is doing something: the
server would wait for the lock and the test for the server.

Run them alone with `pytest tests/e2e`, skip them with `-m "not e2e"`,
watch them with `--headed --slowmo 300`.
"""
import logging
import threading

import pytest
from werkzeug.serving import make_server

from textileplatform import app as flask_app

from helpers import DB_LOCK, login, make_user


def pytest_collection_modifyitems(items):
    for item in items:
        if "/e2e/" in item.nodeid.replace("\\", "/"):
            item.add_marker(pytest.mark.e2e)


class _LockedApp:
    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        with DB_LOCK:
            # Consume the body inside the lock: Flask may still touch the
            # session while the response is generated.
            result = self.wsgi_app(environ, start_response)
            try:
                return list(result)
            finally:
                if hasattr(result, "close"):
                    result.close()


@pytest.fixture(scope="session")
def live_server():
    # One log line per request (and asset) buries test failures.
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    server = make_server("127.0.0.1", 0, _LockedApp(flask_app),
                         threaded=False)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
    thread.join(timeout=5)


@pytest.fixture(scope="session")
def base_url(live_server):
    """pytest-playwright resolves relative page.goto() URLs against
    this."""
    return live_server


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {
        **browser_context_args,
        "locale": "en-US",
        "viewport": {"width": 1400, "height": 900},
    }


@pytest.fixture(autouse=True)
def _fresh_database(app):
    """Every e2e test gets the empty schema of the `app` fixture."""


@pytest.fixture(autouse=True)
def page_errors(request):
    """Fail the test on uncaught exceptions in the page. Tests that
    expect some can clear the list."""
    if "page" not in request.fixturenames:
        yield []
        return
    page = request.getfixturevalue("page")
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    yield errors
    assert errors == [], f"uncaught errors in the page: {errors}"


@pytest.fixture
def alice():
    return make_user("alice")


@pytest.fixture
def alice_page(page, alice):
    """A page logged in as alice."""
    login(page, alice)
    return page


@pytest.fixture
def bob_page(browser, browser_context_args):
    """A second browser session, logged in as bob, for scenarios with
    two users. Uncaught page errors fail the test here, too."""
    user = make_user("bob")
    # browser_context_args carry the live server's base_url
    context = browser.new_context(**browser_context_args)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    login(page, user)
    yield page
    context.close()
    assert errors == [], f"uncaught errors in bob's page: {errors}"

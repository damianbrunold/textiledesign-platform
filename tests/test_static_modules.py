"""ES modules served from the versioned path /static/m/<version>/..."""
import re

from textileplatform import _js_module_version, module_url
from textileplatform.patterns import add_pattern, new_weave_pattern

from test_patterns import _login, _make_user


def test_module_url_carries_the_tree_version(app):
    with app.test_request_context():
        url = module_url("weave/model.js")
    assert url == f"/static/m/{_js_module_version()}/weave/model.js"
    assert re.fullmatch(r"[0-9a-f]{12}", _js_module_version())


def test_current_version_is_cached_as_immutable(client):
    r = client.get(f"/static/m/{_js_module_version()}/weave/model.js")
    assert r.status_code == 200
    assert r.mimetype == "text/javascript"
    assert b"export class Pattern" in r.data
    assert r.cache_control.immutable
    assert r.cache_control.max_age == 365 * 24 * 3600


def test_relative_imports_stay_in_the_versioned_directory(client):
    """globals.js imports ./model.js: the browser resolves it against
    the versioned URL of globals.js."""
    version = _js_module_version()
    r = client.get(f"/static/m/{version}/weave/globals.js")
    assert b'from "./model.js"' in r.data
    assert client.get(f"/static/m/{version}/weave/model.js").status_code \
        == 200


def test_old_version_is_served_but_not_cached(client):
    r = client.get("/static/m/000000000000/weave/model.js")
    assert r.status_code == 200
    assert r.cache_control.no_store
    assert not r.cache_control.immutable


def test_missing_files_and_traversal_are_404(client):
    version = _js_module_version()
    assert client.get(f"/static/m/{version}/nope.js").status_code == 404
    assert client.get(
        f"/static/m/{version}/../../__init__.py").status_code == 404
    assert client.get(
        f"/static/m/{version}/..%2F..%2F__init__.py").status_code == 404


def test_weave_editor_loads_the_bridge_module(csrf_disabled_client):
    client = csrf_disabled_client
    user = _make_user()
    name = add_pattern(new_weave_pattern("twill", "Alice", 10, 10), user,
                       "DB-WEAVE Pattern")
    _login(client)
    page = client.get(f"/alice/{name}").get_data(as_text=True)
    assert (f'<script type="module" src="/static/m/{_js_module_version()}'
            f'/weave/globals.js"></script>') in page

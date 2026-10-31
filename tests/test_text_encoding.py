"""Lone UTF-16 surrogates in pattern text.

A browser sends half an emoji as a lone surrogate escape ("\\ud83d");
json.loads keeps it as a surrogate code point, which can't be encoded
as UTF-8. Patterns are scrubbed on the way in (save, clone, export /
print of unsaved state) and on the way out (downloads, exports, the
profile export), so text like that never breaks a download.
"""
import io
import json
import zipfile

from textileplatform.db import db
from textileplatform.models import Pattern
from textileplatform.patterns import add_pattern
from textileplatform.validation import scrub_surrogates

from test_limits import _bead, _login_as
from test_patterns import _make_user

LONE = "\ud83d"   # first half of an emoji


def _put(client, name, body):
    """PUT raw JSON text (json.dumps would escape the surrogate the same
    way a browser does)."""
    return client.put(f"/api/pattern/alice/{name}", data=body,
                      content_type="application/json")


def _bead_body(action, symbols):
    contents = _bead()
    contents["view"] = {"symbols": symbols, "draw-symbols": True}
    return json.dumps({"action": action, "contents": contents})


class TestScrub:
    def test_replaces_lone_surrogates_everywhere(self):
        value = {"a" + LONE: ["x" + LONE, {"k": LONE}], "n": 3}
        assert scrub_surrogates(value) == {
            "a�": ["x�", {"k": "�"}], "n": 3,
        }

    def test_keeps_complete_characters(self):
        # A complete pair arrives as one character from json.loads.
        assert json.loads('"\\ud83c\\udf38"') == "🌸"
        assert scrub_surrogates("🌸 · ü") == "🌸 · ü"

    def test_leaves_other_values_alone(self):
        assert scrub_surrogates([1, None, True, 2.5]) == [1, None, True, 2.5]


class TestSaveAndDownload:
    def _setup(self, client):
        user = _make_user()
        name = add_pattern(_bead(), user, "JBead Pattern")
        _login_as(client, user)
        return name

    def test_save_scrubs_and_downloads_work(self, csrf_disabled_client):
        c = csrf_disabled_client
        name = self._setup(c)
        r = _put(c, name, _bead_body("save-pattern", "·a" + LONE + "b"))
        assert r.status_code == 200
        stored = json.loads(Pattern.query.filter_by(name=name).one().contents)
        assert stored["view"]["symbols"] == "·a�b"
        for url in (f"/alice/{name}/download",
                    f"/alice/{name}/download/legacy",
                    f"/alice/{name}/export/svg"):
            assert c.get(url).status_code == 200, url

    def test_export_of_unsaved_state(self, csrf_disabled_client):
        c = csrf_disabled_client
        name = self._setup(c)
        contents = _bead()
        contents["view"] = {"symbols": "a" + LONE, "draw-symbols": True}
        r = c.post(f"/alice/{name}/export/svg",
                   data=json.dumps({"contents": contents}),
                   content_type="application/json")
        assert r.status_code == 200
        assert "�" in r.get_data(as_text=True)

    def test_clone_scrubs(self, csrf_disabled_client):
        c = csrf_disabled_client
        name = self._setup(c)
        r = _put(c, name, _bead_body("clone-pattern", "x" + LONE))
        assert r.status_code == 200
        clone = Pattern.query.filter(Pattern.name != name).one()
        assert json.loads(clone.contents)["view"]["symbols"] == "x�"

    def test_already_stored_patterns_still_download(
            self, csrf_disabled_client):
        """Patterns saved before the scrubbing carry the escape in their
        stored JSON."""
        c = csrf_disabled_client
        name = self._setup(c)
        p = Pattern.query.filter_by(name=name).one()
        contents = _bead()
        contents["view"] = {"symbols": "a" + LONE, "draw-symbols": True}
        p.contents = json.dumps(contents)   # ASCII, with "\ud83d"
        db.session.commit()
        for url in (f"/alice/{name}/download",
                    f"/alice/{name}/download/legacy",
                    f"/alice/{name}/export/svg",
                    f"/alice/{name}/export/png"):
            assert c.get(url).status_code == 200, url
        r = c.get("/profile/export")
        assert r.status_code == 200
        with zipfile.ZipFile(io.BytesIO(r.data)) as zf:
            assert zf.testzip() is None

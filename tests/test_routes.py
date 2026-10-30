"""Route behaviour for owners, group members, other users and anonymous
visitors: who may view, download, export, print and edit a pattern, and
what the listing pages show. Written before the controller refactoring
to pin the behaviour down."""
import json

import pytest

from textileplatform.db import db
from textileplatform.models import Assignment, Group, Membership, Pattern

from test_limits import _bead, _login_as, _weave
from test_patterns import _make_user, _reset_access_date


@pytest.fixture
def world(app):
    """alice owns a private weave and a public bead pattern; the weave
    is shared into group 'club' where carla is a member; dora is just
    another user."""
    alice = _make_user()
    carla = _make_user(name="carla", email="carla@example.com")
    dora = _make_user(name="dora", email="dora@example.com")
    primary = Group.query.filter_by(owner_id=alice.id, name="alice").one()
    club = Group(name="club", label="Club", description="", public=True)
    weave = Pattern(name="twill", label="Twill", owner=alice, public=False,
                    pattern_type="DB-WEAVE Pattern",
                    contents=json.dumps(_weave()))
    bead = Pattern(name="rope", label="Rope", owner=alice, public=True,
                   pattern_type="JBead Pattern",
                   contents=json.dumps(_bead()))
    db.session.add_all([
        club, weave, bead,
        Membership(user=alice, group=club, role="owner", state="accepted"),
        Membership(user=carla, group=club, role="reader", state="accepted"),
        Assignment(pattern=weave, group=primary),
        Assignment(pattern=bead, group=primary),
        Assignment(pattern=weave, group=club),
    ])
    db.session.commit()
    return {"alice": alice, "carla": carla, "dora": dora}


def _as(client, world, who):
    if who is not None:
        _login_as(client, world[who])
        _reset_access_date(world[who])
    return client


VIEW_ROUTES = [
    "/alice/{p}", "/alice/{p}/download", "/alice/{p}/download/legacy",
    "/alice/{p}/export/png", "/alice/{p}/print", "/alice/{p}/source",
    "/api/pattern/alice/{p}", "/thumbnail/alice/{p}", "/preview/alice/{p}",
]


@pytest.mark.parametrize("route", VIEW_ROUTES)
@pytest.mark.parametrize("who,pattern,allowed", [
    ("alice", "twill", True),    # owner, private
    ("carla", "twill", True),    # group member, private
    ("dora", "twill", False),    # stranger, private
    (None, "twill", False),      # anonymous, private
    ("dora", "rope", True),      # stranger, public
    (None, "rope", True),        # anonymous, public
])
def test_view_permissions(csrf_disabled_client, world, route, who,
                          pattern, allowed):
    client = _as(csrf_disabled_client, world, who)
    r = client.get(route.format(p=pattern))
    if allowed:
        assert r.status_code == 200
    elif route.startswith("/api/"):
        assert r.status_code == 403
    elif route.startswith(("/thumbnail/", "/preview/")):
        assert r.status_code == 403
    else:
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/alice")


@pytest.mark.parametrize("route", [
    "/nobody/twill", "/nobody/twill/download", "/nobody/twill/print",
])
def test_unknown_user_redirects_home(client, world, route):
    r = client.get(route)
    assert r.status_code == 302
    assert r.headers["Location"] == "/"


@pytest.mark.parametrize("route", [
    "/alice/missing", "/alice/missing/download", "/alice/missing/source",
])
def test_unknown_pattern_redirects_to_owner(client, world, route):
    r = client.get(route)
    assert r.status_code == 302
    assert r.headers["Location"].endswith("/alice")


def test_api_unknown_pattern_is_404(client, world):
    assert client.get("/api/pattern/alice/missing").status_code == 404
    assert client.get("/api/pattern/nobody/x").status_code == 404
    assert client.get("/thumbnail/alice/missing").status_code == 404


def test_editor_is_readonly_for_viewers(csrf_disabled_client, world):
    owner_page = _as(csrf_disabled_client, world, "alice").get(
        "/alice/twill").get_data(as_text=True)
    assert 'id="readonly" value="False"' in owner_page
    csrf_disabled_client.post("/auth/logout")
    member_page = _as(csrf_disabled_client, world, "carla").get(
        "/alice/twill").get_data(as_text=True)
    assert 'id="readonly" value="True"' in member_page


def test_only_owner_may_save_or_rename(csrf_disabled_client, world):
    client = _as(csrf_disabled_client, world, "carla")
    for action in ({"action": "save-pattern", "contents": _weave()},
                   {"action": "rename-pattern", "label": "X"},
                   {"action": "set-publication-state",
                    "publication_state": True}):
        r = client.put("/api/pattern/alice/twill", json=action)
        assert r.status_code == 403


def test_public_toggle_stores_a_boolean(csrf_disabled_client, world):
    client = _as(csrf_disabled_client, world, "alice")
    r = client.put("/api/pattern/alice/twill", json={
        "action": "set-publication-state", "publication_state": "yes",
    })
    assert r.status_code == 200
    assert Pattern.query.filter_by(name="twill").one().public is True


def test_rename(csrf_disabled_client, world):
    client = _as(csrf_disabled_client, world, "alice")
    r = client.put("/api/pattern/alice/twill", json={
        "action": "rename-pattern", "label": "Fine Twill",
    })
    assert r.get_json()["name"] == "fine-twill"
    _reset_access_date(world["alice"])
    r = client.put("/api/pattern/alice/fine-twill", json={
        "action": "rename-pattern", "label": "Rope",
    })
    assert r.status_code == 409


def test_member_clone_lands_in_own_primary_group(csrf_disabled_client,
                                                 world):
    client = _as(csrf_disabled_client, world, "carla")
    r = client.put("/api/pattern/alice/twill",
                   json={"action": "clone-pattern"})
    assert r.status_code == 200
    clone = Pattern.query.filter_by(owner_id=world["carla"].id).one()
    assert clone.label == "Twill"
    assert [a.group.name for a in clone.assignments] == ["carla"]
    assert clone.pattern_width == 40


def test_cloning_twice_gets_a_suffix(csrf_disabled_client, world):
    client = _as(csrf_disabled_client, world, "carla")
    for _ in range(2):
        client.put("/api/pattern/alice/rope",
                   json={"action": "clone-pattern"})
        _reset_access_date(world["carla"])
    names = sorted(p.name for p in Pattern.query.filter_by(
        owner_id=world["carla"].id))
    assert names == ["rope", "rope-1"]


class TestListings:
    def test_private_listing_shows_groups_and_patterns(
        self, csrf_disabled_client, world
    ):
        page = _as(csrf_disabled_client, world, "alice").get(
            "/alice").get_data(as_text=True)
        assert "Twill" in page and "Rope" in page and "Club" in page

    def test_public_listing_shows_only_public_own_patterns(
        self, csrf_disabled_client, world
    ):
        page = _as(csrf_disabled_client, world, "dora").get(
            "/alice").get_data(as_text=True)
        assert "Rope" in page
        assert "Twill" not in page

    def test_public_group_page_lists_only_public_patterns(self, client,
                                                          world):
        page = client.get("/groups/club").get_data(as_text=True)
        assert "Twill" not in page


class TestCreate:
    def _create(self, client, kind, **form):
        data = {"pattern_type": kind, "name": "New", "width": "20",
                "height": "30"}
        data.update(form)
        return client.post("/patterns/create", data=data)

    def test_weave_defaults(self, csrf_disabled_client, world):
        client = _as(csrf_disabled_client, world, "alice")
        r = self._create(client, "DB-WEAVE Pattern")
        assert r.status_code == 302
        p = json.loads(Pattern.query.filter_by(name="new").one().contents)
        assert (p["width"], p["height"]) == (20, 30)
        assert len(p["data_treadling"]) == 32 * 30
        assert p["data_reed"][:4] == [0, 0, 1, 1]
        assert p["author"] == "Alice"

    def test_bead_defaults(self, csrf_disabled_client, world):
        client = _as(csrf_disabled_client, world, "alice")
        self._create(client, "JBead Pattern", width="8", height="10")
        p = json.loads(Pattern.query.filter_by(name="new").one().contents)
        assert len(p["model"]) == 10 and len(p["model"][0]) == 8
        assert p["view"]["selected-tool"] == "pencil"
        assert p["view"]["zoom"] == 12

    def test_into_group(self, csrf_disabled_client, world):
        client = _as(csrf_disabled_client, world, "alice")
        self._create(client, "JBead Pattern", width="8", height="10",
                     group="club")
        p = Pattern.query.filter_by(name="new").one()
        assert sorted(a.group.name for a in p.assignments) == [
            "alice", "club"]

    def test_out_of_range_is_refused(self, csrf_disabled_client, world):
        client = _as(csrf_disabled_client, world, "alice")
        self._create(client, "DB-WEAVE Pattern", width="5000")
        assert Pattern.query.filter_by(name="new").count() == 0

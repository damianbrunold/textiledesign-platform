"""Admin CLI commands and database initialisation."""
import json

from textileplatform import app as flask_app
from textileplatform.db import db
from textileplatform.ensure import ensure_db_contents
from textileplatform.models import (
    Assignment, Group, Membership, Pattern, User,
)

from test_limits import _bead
from test_patterns import _make_user


def _run(app, *args, answer="y"):
    return app.test_cli_runner().invoke(args=list(args), input=answer + "\n")


def test_delete_user_keeps_other_users_patterns(app):
    alice = _make_user()
    carla = _make_user(name="carla", email="carla@example.com")
    club = Group(name="club", label="Club", description="")
    mine = Pattern(name="mine", label="Mine", owner=alice,
                   pattern_type="JBead Pattern", contents=json.dumps(_bead()))
    theirs = Pattern(name="theirs", label="Theirs", owner=carla,
                     pattern_type="JBead Pattern",
                     contents=json.dumps(_bead()))
    db.session.add_all([
        club, mine, theirs,
        Membership(user=alice, group=club, role="owner", state="accepted"),
        Membership(user=carla, group=club, role="writer", state="accepted"),
        Assignment(pattern=mine, group=club),
        Assignment(pattern=theirs, group=club),
    ])
    db.session.commit()

    result = _run(app, "delete-user", "alice")
    assert result.exit_code == 0, result.output
    db.session.expire_all()
    assert User.query.filter_by(name="alice").count() == 0
    assert [p.name for p in Pattern.query.all()] == ["theirs"]
    assert Membership.query.filter_by(user_id=None).count() == 0
    assert Group.query.filter_by(name="alice").count() == 0
    assert Group.query.filter_by(name="club").count() == 1


def test_delete_user_refuses_support(app):
    _make_user(name="support", email="support@example.com")
    result = _run(app, "delete-user", "support")
    assert "cannot be deleted" in result.output
    assert User.query.filter_by(name="support").count() == 1


def test_ensure_db_contents_creates_owner_memberships(app):
    flask_app.config["ADMIN_PASSWORD"] = "test-admin-password"
    user = User(name="legacy", label="Legacy", email="l@example.com",
                email_lower="l@example.com", password="x", verified=True)
    db.session.add(user)
    db.session.commit()
    ensure_db_contents(flask_app)
    for name in ("legacy", "examples", "beispiele"):
        owner = User.query.filter_by(name=name).one()
        group = Group.query.filter_by(owner_id=owner.id, name=name).one()
        (m,) = group.memberships
        assert (m.user_id, m.role, m.state) == (
            owner.id, "owner", "accepted",
        )


def test_create_pattern_commands(app):
    _make_user()
    assert _run(app, "create-weave-pattern", "alice", "W").exit_code == 0
    assert _run(app, "create-bead-pattern", "alice", "B").exit_code == 0
    weave = json.loads(Pattern.query.filter_by(name="w").one().contents)
    bead = json.loads(Pattern.query.filter_by(name="b").one().contents)
    assert (weave["width"], weave["height"]) == (300, 300)
    assert len(bead["model"]) == 200
    assert len(bead["model"][0]) == 12

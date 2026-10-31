"""Group and sharing routes: creating, editing and deleting groups,
invitations, memberships, sharing patterns into groups and deleting
patterns. Covers owner, writer, reader, non-member and anonymous."""
import pytest

from textileplatform.db import db
from textileplatform.models import (
    Assignment, Conversation, Group, Membership, Pattern,
)
from textileplatform.patterns import (
    add_pattern, new_bead_pattern, new_weave_pattern,
)

from test_limits import _login_as
from test_patterns import _make_user


@pytest.fixture
def world(app):
    """Shared private group 'club': alice owns it, wendy writes, rita
    reads. otto is a user outside the club."""
    users = {
        name: _make_user(name=name, email=f"{name}@example.com")
        for name in ("alice", "wendy", "rita", "otto")
    }
    club = Group(name="club", label="Club", description="", public=False)
    db.session.add(club)
    for name, role in (("alice", "owner"), ("wendy", "writer"),
                       ("rita", "reader")):
        db.session.add(Membership(user=users[name], group=club, role=role,
                                  state="accepted"))
    db.session.commit()
    return users


def _as(client, user):
    _login_as(client, user)
    return client


def _flashes(client):
    with client.session_transaction() as s:
        return [message for _, message in s.get("_flashes", [])]


def _group(name, owner=None):
    q = Group.query.filter(Group.name == name)
    if owner is None:
        q = q.filter(Group.owner_id.is_(None))
    else:
        q = q.filter(Group.owner_id == owner.id)
    return q.one_or_none()


def _membership(user, group):
    return Membership.query.filter_by(
        user_id=user.id, group_id=group.id).one_or_none()


def _personal_group(user, name):
    group = Group(name=name, label=name.capitalize(), description="",
                  owner_id=user.id)
    db.session.add_all([group, Membership(user=user, group=group,
                                          role="owner", state="accepted")])
    db.session.commit()
    return group


def _bead(user, name="Rope"):
    pname = add_pattern(new_bead_pattern(name, user.label, 8, 10), user,
                        "JBead Pattern")
    db.session.commit()
    return Pattern.query.filter_by(owner_id=user.id, name=pname).one()


def _weave(user, name="Twill"):
    pname = add_pattern(new_weave_pattern(name, user.label, 20, 20), user,
                        "DB-WEAVE Pattern")
    db.session.commit()
    return Pattern.query.filter_by(owner_id=user.id, name=pname).one()


def _assigned_groups(pattern):
    return sorted(
        a.group.name for a in
        Assignment.query.filter_by(pattern_id=pattern.id))


# ---------- add_group --------------------------------------------------


class TestAddGroup:
    def test_form_renders(self, csrf_disabled_client, world):
        r = _as(csrf_disabled_client, world["otto"]).get("/groups/add")
        assert r.status_code == 200

    def test_anonymous_is_sent_to_login(self, client, world):
        r = client.get("/groups/add")
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]

    def test_anonymous_post_creates_nothing(self, csrf_disabled_client,
                                            world):
        r = csrf_disabled_client.post("/groups/add", data={
            "kind": "shared", "name": "Knitters"})
        assert r.status_code == 302
        assert _group("knitters") is None

    def test_shared_group(self, csrf_disabled_client, world):
        otto = world["otto"]
        r = _as(csrf_disabled_client, otto).post("/groups/add", data={
            "kind": "shared", "name": "Night Knitters",
            "description": "Late", "public": "on"})
        assert r.status_code == 302
        assert r.headers["Location"].split("?")[0].endswith("/groups")
        group = _group("night-knitters")
        assert (group.label, group.description) == ("Night Knitters", "Late")
        assert group.public is True
        m = _membership(otto, group)
        assert (m.role, m.state) == ("owner", "accepted")
        assert Conversation.query.filter_by(group_id=group.id).count() == 1

    def test_personal_group(self, csrf_disabled_client, world):
        otto = world["otto"]
        r = _as(csrf_disabled_client, otto).post("/groups/add", data={
            "kind": "personal", "name": "Drafts"})
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/otto?group=drafts")
        group = _group("drafts", owner=otto)
        assert group.public is False
        assert _membership(otto, group).role == "owner"
        assert Conversation.query.filter_by(group_id=group.id).count() == 0

    def test_kind_is_required(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["otto"])
        r = c.post("/groups/add", data={"name": "Drafts"})
        assert r.status_code == 200
        assert b"Please choose a group kind" in r.data
        assert Group.query.filter_by(name="drafts").count() == 0

    def test_name_is_required(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["otto"])
        r = c.post("/groups/add", data={"kind": "shared", "name": "  "})
        assert b"Group Name is required" in r.data

    def test_label_too_long(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["otto"])
        r = c.post("/groups/add", data={"kind": "shared", "name": "x" * 51})
        assert b"Label is too long" in r.data
        assert Group.query.filter_by(name="x" * 51).count() == 0

    def test_description_too_long(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["otto"])
        r = c.post("/groups/add", data={
            "kind": "shared", "name": "Knitters", "description": "x" * 5001})
        assert b"Description is too long" in r.data
        assert _group("knitters") is None

    def test_unusable_name(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["otto"])
        r = c.post("/groups/add", data={"kind": "shared", "name": "!!!"})
        assert b"Name is invalid" in r.data

    def test_shared_name_of_a_user_is_refused(self, csrf_disabled_client,
                                              world):
        c = _as(csrf_disabled_client, world["otto"])
        r = c.post("/groups/add", data={"kind": "shared", "name": "Alice"})
        assert b"Group already exists" in r.data
        assert _group("alice") is None

    def test_shared_name_must_be_globally_unique(self, csrf_disabled_client,
                                                 world):
        c = _as(csrf_disabled_client, world["otto"])
        r = c.post("/groups/add", data={"kind": "shared", "name": "Club"})
        assert b"Group already exists" in r.data
        assert Group.query.filter_by(name="club").count() == 1

    def test_personal_name_unique_per_owner(self, csrf_disabled_client,
                                            world):
        otto = world["otto"]
        _personal_group(otto, "drafts")
        r = _as(csrf_disabled_client, otto).post("/groups/add", data={
            "kind": "personal", "name": "Drafts"})
        assert b"You already have a group with this name" in r.data
        assert Group.query.filter_by(name="drafts").count() == 1

    def test_personal_name_may_repeat_across_owners(
        self, csrf_disabled_client, world
    ):
        _personal_group(world["alice"], "drafts")
        otto = world["otto"]
        r = _as(csrf_disabled_client, otto).post("/groups/add", data={
            "kind": "personal", "name": "Drafts"})
        assert r.status_code == 302
        assert _group("drafts", owner=otto) is not None

    def test_personal_name_of_shared_group_is_refused(
        self, csrf_disabled_client, world
    ):
        otto = world["otto"]
        r = _as(csrf_disabled_client, otto).post("/groups/add", data={
            "kind": "personal", "name": "Club"})
        assert b"A shared group already uses this name" in r.data
        assert _group("club", owner=otto) is None

    # Regression: add_group only checks users and shared groups for a shared
    # name, so it may take another user's personal group name;
    # _user_group_by_name then prefers the shared group and the personal group
    # can no longer be edited or deleted
    def test_shared_group_cannot_shadow_a_personal_group(
        self, csrf_disabled_client, world
    ):
        alice, otto = world["alice"], world["otto"]
        _personal_group(alice, "drafts")
        c = _as(csrf_disabled_client, otto)
        c.post("/groups/add", data={"kind": "shared", "name": "Drafts"})
        c.post("/auth/logout")
        _as(c, alice)
        c.post("/groups/drafts/delete")
        assert _group("drafts", owner=alice) is None


# ---------- update_group / update_group_visibility -----------------------


class TestUpdateGroup:
    def test_owner_updates_label_and_description(self, csrf_disabled_client,
                                                 world):
        c = _as(csrf_disabled_client, world["alice"])
        r = c.post("/groups/club/update", data={
            "label": "Book Club", "description": "Weekly"})
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/groups/edit/club")
        assert "Group updated" in _flashes(c)
        club = _group("club")
        assert (club.label, club.description) == ("Book Club", "Weekly")
        assert club.modified is not None

    def test_empty_label_keeps_the_old_one(self, csrf_disabled_client,
                                           world):
        c = _as(csrf_disabled_client, world["alice"])
        c.post("/groups/club/update", data={"label": "", "description": "D"})
        club = _group("club")
        assert (club.label, club.description) == ("Club", "D")

    def test_too_long_description_is_refused(self, csrf_disabled_client,
                                             world):
        c = _as(csrf_disabled_client, world["alice"])
        c.post("/groups/club/update", data={
            "label": "New", "description": "x" * 5001})
        assert "Description is too long" in _flashes(c)
        assert _group("club").label == "Club"

    @pytest.mark.parametrize("who", ["wendy", "rita", "otto"])
    def test_non_owner_is_forbidden(self, csrf_disabled_client, world, who):
        c = _as(csrf_disabled_client, world[who])
        r = c.post("/groups/club/update", data={"label": "Hacked"})
        assert r.status_code == 403
        assert _group("club").label == "Club"

    def test_unknown_group(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        r = c.post("/groups/nope/update", data={"label": "X"})
        assert r.status_code == 404

    def test_primary_group_cannot_be_edited(self, csrf_disabled_client,
                                            world):
        alice = world["alice"]
        c = _as(csrf_disabled_client, alice)
        c.post("/groups/alice/update", data={"label": "Renamed"})
        assert "Cannot edit your primary group" in _flashes(c)
        assert _group("alice", owner=alice).label == "Alice"

    def test_own_personal_group_can_be_edited(self, csrf_disabled_client,
                                              world):
        alice = world["alice"]
        _personal_group(alice, "drafts")
        c = _as(csrf_disabled_client, alice)
        c.post("/groups/drafts/update", data={"label": "Sketches"})
        assert _group("drafts", owner=alice).label == "Sketches"

    def test_others_personal_group_is_not_reachable(
        self, csrf_disabled_client, world
    ):
        _personal_group(world["alice"], "drafts")
        c = _as(csrf_disabled_client, world["otto"])
        r = c.post("/groups/drafts/update", data={"label": "Mine"})
        assert r.status_code == 404
        assert _group("drafts", owner=world["alice"]).label == "Drafts"


class TestVisibility:
    def test_owner_toggles_visibility(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        r = c.post("/groups/club/visibility", data={"public": "on"})
        assert r.status_code == 302
        assert _group("club").public is True
        c.post("/groups/club/visibility", data={})
        assert _group("club").public is False

    @pytest.mark.parametrize("who", ["wendy", "rita", "otto"])
    def test_non_owner_is_forbidden(self, csrf_disabled_client, world, who):
        c = _as(csrf_disabled_client, world[who])
        r = c.post("/groups/club/visibility", data={"public": "on"})
        assert r.status_code == 403
        assert _group("club").public is False

    def test_primary_group_visibility_is_fixed(self, csrf_disabled_client,
                                               world):
        alice = world["alice"]
        c = _as(csrf_disabled_client, alice)
        c.post("/groups/alice/visibility", data={"public": "on"})
        assert "Cannot change visibility of your primary group" in (
            _flashes(c))
        assert not _group("alice", owner=alice).public

    def test_own_personal_group(self, csrf_disabled_client, world):
        alice = world["alice"]
        _personal_group(alice, "drafts")
        c = _as(csrf_disabled_client, alice)
        c.post("/groups/drafts/visibility", data={"public": "on"})
        assert _group("drafts", owner=alice).public is True

    def test_unknown_group(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        assert c.post("/groups/nope/visibility").status_code == 404


# ---------- invitations ----------------------------------------------------


def _invite(client, user_name, role=None, group="club"):
    data = {"user_name": user_name}
    if role is not None:
        data["role"] = role
    return client.post(f"/groups/{group}/invite", data=data)


class TestInvite:
    def test_owner_invites(self, csrf_disabled_client, world, captured_mails):
        c = _as(csrf_disabled_client, world["alice"])
        r = _invite(c, "otto", "writer")
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/groups/edit/club")
        assert "Invitation sent" in _flashes(c)
        m = _membership(world["otto"], _group("club"))
        assert (m.role, m.state) == ("writer", "invited")

    def test_default_role_is_reader(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        _invite(c, "otto")
        assert _membership(world["otto"], _group("club")).role == "reader"

    def test_name_is_normalised(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        _invite(c, "  OTTO ")
        assert _membership(world["otto"], _group("club")) is not None

    def test_invalid_role(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        _invite(c, "otto", "admin")
        assert "Invalid role" in _flashes(c)
        assert _membership(world["otto"], _group("club")) is None

    def test_unknown_user(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        _invite(c, "nobody")
        assert "User not found" in _flashes(c)
        assert Membership.query.filter_by(state="invited").count() == 0

    def test_blocked_invitations_look_like_unknown_user(
        self, csrf_disabled_client, world
    ):
        otto = world["otto"]
        otto.block_invitations = True
        db.session.commit()
        c = _as(csrf_disabled_client, world["alice"])
        _invite(c, "otto")
        assert "User not found" in _flashes(c)
        assert _membership(otto, _group("club")) is None

    @pytest.mark.parametrize("field,value", [
        ("verified", False), ("disabled", True)])
    def test_inactive_user_is_not_found(self, csrf_disabled_client, world,
                                        field, value):
        otto = world["otto"]
        setattr(otto, field, value)
        db.session.commit()
        c = _as(csrf_disabled_client, world["alice"])
        _invite(c, "otto")
        assert "User not found" in _flashes(c)
        assert _membership(otto, _group("club")) is None

    def test_support_cannot_be_invited(self, csrf_disabled_client, world):
        support = _make_user(name="support", email="support@example.com")
        c = _as(csrf_disabled_client, world["alice"])
        _invite(c, "support")
        assert "User not found" in _flashes(c)
        assert _membership(support, _group("club")) is None

    def test_inviting_oneself(self, csrf_disabled_client, world):
        alice = world["alice"]
        c = _as(csrf_disabled_client, alice)
        _invite(c, "alice", "reader")
        assert "User is already a member" in _flashes(c)
        assert _membership(alice, _group("club")).role == "owner"

    def test_already_invited(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        _invite(c, "otto", "reader")
        _invite(c, "otto", "owner")
        assert "User has already been invited" in _flashes(c)
        assert Membership.query.filter_by(
            user_id=world["otto"].id, group_id=_group("club").id,
        ).one().role == "reader"

    def test_declined_user_can_be_invited_again(self, csrf_disabled_client,
                                                world):
        club = _group("club")
        db.session.add(Membership(user=world["otto"], group=club,
                                  role="reader", state="declined"))
        db.session.commit()
        c = _as(csrf_disabled_client, world["alice"])
        _invite(c, "otto", "writer")
        assert "Invitation sent" in _flashes(c)
        m = _membership(world["otto"], club)
        assert (m.role, m.state) == ("writer", "invited")

    @pytest.mark.parametrize("who", ["wendy", "rita"])
    def test_non_owner_member_is_forbidden(self, csrf_disabled_client,
                                           world, who):
        c = _as(csrf_disabled_client, world[who])
        assert _invite(c, "otto").status_code == 403
        assert _membership(world["otto"], _group("club")) is None

    def test_non_member_is_forbidden(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["otto"])
        assert _invite(c, "otto").status_code == 403
        assert _membership(world["otto"], _group("club")) is None

    def test_personal_group_takes_no_invitations(self, csrf_disabled_client,
                                                 world):
        _personal_group(world["alice"], "drafts")
        c = _as(csrf_disabled_client, world["alice"])
        _invite(c, "otto", group="drafts")
        assert "Cannot invite to a personal group" in _flashes(c)
        assert Membership.query.filter_by(
            user_id=world["otto"].id).count() == 1

    def test_unknown_group(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        assert _invite(c, "otto", group="nope").status_code == 404


@pytest.fixture
def invited(world):
    """otto has a pending writer invitation to club."""
    m = Membership(user=world["otto"], group=_group("club"), role="writer",
                   state="invited")
    db.session.add(m)
    db.session.commit()
    return m


class TestInvitationResponses:
    def test_invitations_page_lists_pending(self, csrf_disabled_client,
                                            world, invited):
        c = _as(csrf_disabled_client, world["otto"])
        r = c.get("/invitations")
        assert r.status_code == 200
        assert f"/invitations/{invited.id}/accept".encode() in r.data

    def test_invitations_page_empty_for_others(self, csrf_disabled_client,
                                               world, invited):
        r = _as(csrf_disabled_client, world["rita"]).get("/invitations")
        assert r.status_code == 200
        assert f"/invitations/{invited.id}/accept".encode() not in r.data

    def test_accept(self, csrf_disabled_client, world, invited):
        c = _as(csrf_disabled_client, world["otto"])
        r = c.post(f"/invitations/{invited.id}/accept")
        assert r.headers["Location"].endswith("/groups/edit/club")
        assert "Invitation accepted" in _flashes(c)
        assert db.session.get(Membership, invited.id).state == "accepted"
        assert world["otto"].can_assign_to(_group("club"))

    def test_decline(self, csrf_disabled_client, world, invited):
        c = _as(csrf_disabled_client, world["otto"])
        r = c.post(f"/invitations/{invited.id}/decline")
        assert r.headers["Location"].endswith("/invitations")
        assert "Invitation declined" in _flashes(c)
        assert db.session.get(Membership, invited.id).state == "declined"
        assert not world["otto"].is_in_group(_group("club").id)

    @pytest.mark.parametrize("action", ["accept", "decline"])
    def test_someone_elses_invitation(self, csrf_disabled_client, world,
                                      invited, action):
        c = _as(csrf_disabled_client, world["alice"])
        r = c.post(f"/invitations/{invited.id}/{action}")
        assert r.status_code == 404
        assert db.session.get(Membership, invited.id).state == "invited"

    @pytest.mark.parametrize("action", ["accept", "decline"])
    def test_unknown_invitation(self, csrf_disabled_client, world, action):
        c = _as(csrf_disabled_client, world["otto"])
        assert c.post(f"/invitations/9999/{action}").status_code == 404

    @pytest.mark.parametrize("action", ["accept", "decline"])
    def test_answered_invitation_is_unchanged(self, csrf_disabled_client,
                                              world, invited, action):
        invited.state = "declined"
        db.session.commit()
        c = _as(csrf_disabled_client, world["otto"])
        r = c.post(f"/invitations/{invited.id}/{action}")
        assert r.headers["Location"].endswith("/invitations")
        assert db.session.get(Membership, invited.id).state == "declined"

    def test_anonymous_cannot_accept(self, csrf_disabled_client, world,
                                     invited):
        r = csrf_disabled_client.post(f"/invitations/{invited.id}/accept")
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]
        assert db.session.get(Membership, invited.id).state == "invited"


# ---------- update_membership ---------------------------------------------


def _member_post(client, user_name, group="club", **data):
    return client.post(f"/groups/{group}/members/{user_name}", data=data)


class TestUpdateMembership:
    def test_owner_changes_role(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        r = _member_post(c, "rita", action="set_role", role="writer")
        assert r.headers["Location"].endswith("/groups/edit/club")
        assert "Role updated" in _flashes(c)
        assert _membership(world["rita"], _group("club")).role == "writer"

    def test_invalid_role(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        _member_post(c, "rita", action="set_role", role="boss")
        assert "Invalid role" in _flashes(c)
        assert _membership(world["rita"], _group("club")).role == "reader"

    def test_last_owner_cannot_be_demoted(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        _member_post(c, "alice", action="set_role", role="writer")
        assert "Cannot demote the last owner of a group" in _flashes(c)
        assert _membership(world["alice"], _group("club")).role == "owner"

    def test_owner_can_step_down_when_another_owner_exists(
        self, csrf_disabled_client, world
    ):
        _membership(world["wendy"], _group("club")).role = "owner"
        db.session.commit()
        c = _as(csrf_disabled_client, world["alice"])
        _member_post(c, "alice", action="set_role", role="reader")
        assert _membership(world["alice"], _group("club")).role == "reader"

    def test_remove_member(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        _member_post(c, "rita", action="remove")
        assert "Member removed" in _flashes(c)
        assert _membership(world["rita"], _group("club")) is None

    def test_last_owner_cannot_be_removed(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        _member_post(c, "alice", action="remove")
        assert "Cannot remove the last owner of a group" in _flashes(c)
        assert _membership(world["alice"], _group("club")) is not None

    @pytest.mark.parametrize("who", ["wendy", "rita", "otto"])
    def test_non_owner_is_forbidden(self, csrf_disabled_client, world, who):
        c = _as(csrf_disabled_client, world[who])
        r = _member_post(c, "rita", action="remove")
        assert r.status_code == 403
        assert _membership(world["rita"], _group("club")) is not None

    def test_pending_invitation_is_not_a_member(self, csrf_disabled_client,
                                                world, invited):
        c = _as(csrf_disabled_client, world["alice"])
        r = _member_post(c, "otto", action="set_role", role="owner")
        assert r.status_code == 404
        assert db.session.get(Membership, invited.id).role == "writer"

    def test_unknown_user(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        assert _member_post(c, "nobody", action="remove").status_code == 404

    def test_unknown_action(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        assert _member_post(c, "rita", action="ban").status_code == 400

    def test_personal_group(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        r = _member_post(c, "alice", group="alice", action="remove")
        assert r.status_code == 400
        assert _membership(
            world["alice"], _group("alice", owner=world["alice"])) is not None


# ---------- leave_group / delete_group --------------------------------------


class TestLeaveGroup:
    def test_member_leaves(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["rita"])
        r = c.post("/groups/club/leave")
        assert r.headers["Location"].endswith("/groups")
        assert "You left the group" in _flashes(c)
        assert _membership(world["rita"], _group("club")) is None

    def test_last_owner_cannot_leave(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        c.post("/groups/club/leave")
        assert any("last owner" in f for f in _flashes(c))
        assert _membership(world["alice"], _group("club")) is not None

    def test_owner_leaves_when_another_owner_exists(
        self, csrf_disabled_client, world
    ):
        _membership(world["wendy"], _group("club")).role = "owner"
        db.session.commit()
        c = _as(csrf_disabled_client, world["alice"])
        c.post("/groups/club/leave")
        assert _membership(world["alice"], _group("club")) is None

    def test_non_member(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["otto"])
        assert c.post("/groups/club/leave").status_code == 404

    def test_invited_user_cannot_leave(self, csrf_disabled_client, world,
                                       invited):
        c = _as(csrf_disabled_client, world["otto"])
        assert c.post("/groups/club/leave").status_code == 404
        assert db.session.get(Membership, invited.id) is not None

    def test_personal_group_cannot_be_left(self, csrf_disabled_client,
                                           world):
        alice = world["alice"]
        _personal_group(alice, "drafts")
        c = _as(csrf_disabled_client, alice)
        c.post("/groups/drafts/leave")
        assert "Cannot leave a personal group" in _flashes(c)
        assert _membership(alice, _group("drafts", owner=alice)) is not None

    def test_unknown_group(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["rita"])
        assert c.post("/groups/nope/leave").status_code == 404


class TestDeleteGroup:
    def test_owner_deletes_shared_group(self, csrf_disabled_client, world):
        from textileplatform.messaging import ensure_group_conversation
        club = _group("club")
        ensure_group_conversation(club)
        twill = _weave(world["alice"])
        db.session.add(Assignment(pattern=twill, group=club))
        db.session.commit()
        club_id = club.id
        c = _as(csrf_disabled_client, world["alice"])
        r = c.post("/groups/club/delete")
        assert r.headers["Location"].endswith("/groups")
        assert 'Group "Club" deleted' in _flashes(c)
        assert _group("club") is None
        assert Membership.query.filter_by(group_id=club_id).count() == 0
        assert Assignment.query.filter_by(group_id=club_id).count() == 0
        assert Conversation.query.filter_by(group_id=club_id).count() == 0
        assert _assigned_groups(twill) == ["alice"]

    @pytest.mark.parametrize("who", ["wendy", "rita", "otto"])
    def test_non_owner_is_forbidden(self, csrf_disabled_client, world, who):
        c = _as(csrf_disabled_client, world[who])
        assert c.post("/groups/club/delete").status_code == 403
        assert _group("club") is not None

    def test_primary_group_cannot_be_deleted(self, csrf_disabled_client,
                                             world):
        alice = world["alice"]
        c = _as(csrf_disabled_client, alice)
        c.post("/groups/alice/delete")
        assert "Cannot delete your primary group" in _flashes(c)
        assert _group("alice", owner=alice) is not None

    def test_own_personal_group(self, csrf_disabled_client, world):
        alice = world["alice"]
        drafts = _personal_group(alice, "drafts")
        twill = _weave(alice)
        db.session.add(Assignment(pattern=twill, group=drafts))
        db.session.commit()
        c = _as(csrf_disabled_client, alice)
        c.post("/groups/drafts/delete")
        assert _group("drafts", owner=alice) is None
        assert _assigned_groups(twill) == ["alice"]

    def test_unknown_group(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        assert c.post("/groups/nope/delete").status_code == 404

    def test_anonymous(self, csrf_disabled_client, world):
        r = csrf_disabled_client.post("/groups/club/delete")
        assert r.status_code == 302
        assert _group("club") is not None


# ---------- group pages ----------------------------------------------


class TestGroupPages:
    def test_public_shared_group(self, client, world):
        club = _group("club")
        club.public = True
        rope = _bead(world["alice"])
        rope.public = True
        db.session.add(Assignment(pattern=rope, group=club))
        db.session.commit()
        r = client.get("/groups/club")
        assert r.status_code == 200
        assert b"Rope" in r.data

    def test_private_shared_group_is_hidden_even_from_members(
        self, csrf_disabled_client, world
    ):
        c = _as(csrf_disabled_client, world["alice"])
        assert c.get("/groups/club").status_code == 404

    def test_unknown_group_goes_home(self, client, world):
        r = client.get("/groups/nope")
        assert r.status_code == 302

    def test_primary_group_handle_redirects_to_personal_url(self, client,
                                                            world):
        r = client.get("/groups/alice")
        assert r.status_code == 301
        assert r.headers["Location"].endswith("/alice/g/alice")

    def test_public_personal_group(self, client, world):
        drafts = _personal_group(world["alice"], "drafts")
        drafts.public = True
        db.session.commit()
        r = client.get("/alice/g/drafts")
        assert r.status_code == 200
        assert b"Drafts" in r.data

    def test_private_personal_group_redirects_owner(
        self, csrf_disabled_client, world
    ):
        _personal_group(world["alice"], "drafts")
        c = _as(csrf_disabled_client, world["alice"])
        r = c.get("/alice/g/drafts")
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/alice?group=drafts")

    def test_private_personal_group_hidden_from_others(
        self, csrf_disabled_client, world
    ):
        _personal_group(world["alice"], "drafts")
        c = _as(csrf_disabled_client, world["otto"])
        assert c.get("/alice/g/drafts").status_code == 404

    @pytest.mark.parametrize("url", ["/nobody/g/drafts", "/alice/g/nope"])
    def test_unknown_personal_group(self, client, world, url):
        assert client.get(url).status_code == 404

    def test_group_list_shows_accepted_groups_only(
        self, csrf_disabled_client, world
    ):
        hidden = Group(name="secret", label="Secret Circle", description="")
        db.session.add_all([hidden, Membership(
            user=world["rita"], group=hidden, role="reader",
            state="invited")])
        db.session.commit()
        r = _as(csrf_disabled_client, world["rita"]).get("/groups")
        assert r.status_code == 200
        assert b"Club" in r.data
        assert b"Secret Circle" not in r.data

    def test_group_list_needs_login(self, client, world):
        r = client.get("/groups")
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]

    def test_edit_page_for_owner_has_invite_form(self, csrf_disabled_client,
                                                 world):
        r = _as(csrf_disabled_client, world["alice"]).get("/groups/edit/club")
        assert r.status_code == 200
        assert b"/groups/club/invite" in r.data

    def test_edit_page_for_reader_has_no_invite_form(
        self, csrf_disabled_client, world
    ):
        r = _as(csrf_disabled_client, world["rita"]).get("/groups/edit/club")
        assert r.status_code == 200
        assert b"/groups/club/invite" not in r.data
        assert b"/groups/club/leave" in r.data

    def test_edit_page_for_own_personal_group(self, csrf_disabled_client,
                                              world):
        _personal_group(world["alice"], "drafts")
        c = _as(csrf_disabled_client, world["alice"])
        assert c.get("/groups/edit/drafts").status_code == 200

    @pytest.mark.parametrize("name", ["club", "nope"])
    def test_edit_page_refused_to_outsiders(self, csrf_disabled_client,
                                            world, name):
        c = _as(csrf_disabled_client, world["otto"])
        r = c.get(f"/groups/edit/{name}")
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/groups")


# ---------- assignments ----------------------------------------------


class TestAssignments:
    def _post(self, client, pattern, *group_ids):
        return client.post(f"/patterns/assignments/{pattern.name}",
                           data={"assignments": [str(i) for i in group_ids]})

    def test_form_lists_writable_groups_only(self, csrf_disabled_client,
                                             world):
        wendy = world["wendy"]
        rope = _bead(wendy)
        readonly = Group(name="readonly", label="Read Only Circle",
                         description="")
        db.session.add_all([readonly, Membership(
            user=wendy, group=readonly, role="reader", state="accepted")])
        db.session.commit()
        r = _as(csrf_disabled_client, wendy).get(
            f"/patterns/assignments/{rope.name}")
        assert r.status_code == 200
        assert b"Club" in r.data
        assert b"Read Only Circle" not in r.data

    def test_writer_shares_into_group(self, csrf_disabled_client, world):
        wendy = world["wendy"]
        rope = _bead(wendy)
        c = _as(csrf_disabled_client, wendy)
        r = self._post(c, rope, _group("club").id)
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/wendy")
        assert _assigned_groups(rope) == ["club", "wendy"]
        assert _group("club").modified is not None

    def test_unsharing_keeps_primary_group(self, csrf_disabled_client,
                                           world):
        alice = world["alice"]
        rope = _bead(alice)
        db.session.add(Assignment(pattern=rope, group=_group("club")))
        db.session.commit()
        self._post(_as(csrf_disabled_client, alice), rope)
        assert _assigned_groups(rope) == ["alice"]

    def test_reader_group_is_ignored(self, csrf_disabled_client, world):
        rita = world["rita"]
        rope = _bead(rita)
        self._post(_as(csrf_disabled_client, rita), rope, _group("club").id)
        assert _assigned_groups(rope) == ["rita"]

    def test_foreign_group_is_ignored(self, csrf_disabled_client, world):
        otto = world["otto"]
        rope = _bead(otto)
        self._post(_as(csrf_disabled_client, otto), rope, _group("club").id)
        assert _assigned_groups(rope) == ["otto"]

    def test_own_personal_group(self, csrf_disabled_client, world):
        alice = world["alice"]
        drafts = _personal_group(alice, "drafts")
        rope = _bead(alice)
        self._post(_as(csrf_disabled_client, alice), rope, drafts.id)
        assert _assigned_groups(rope) == ["alice", "drafts"]

    def test_garbage_id_is_reported(self, csrf_disabled_client, world):
        alice = world["alice"]
        rope = _bead(alice)
        c = _as(csrf_disabled_client, alice)
        r = c.post(f"/patterns/assignments/{rope.name}",
                   data={"assignments": ["x"]})
        assert r.status_code == 200
        assert b"Assignments could not be saved." in r.data
        assert _assigned_groups(rope) == ["alice"]

    def test_someone_elses_pattern(self, csrf_disabled_client, world):
        rope = _bead(world["alice"])
        c = _as(csrf_disabled_client, world["wendy"])
        r = self._post(c, rope, _group("club").id)
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/wendy")
        assert _assigned_groups(rope) == ["alice"]

    def test_anonymous(self, csrf_disabled_client, world):
        rope = _bead(world["alice"])
        r = self._post(csrf_disabled_client, rope, _group("club").id)
        assert r.status_code == 302
        assert _assigned_groups(rope) == ["alice"]

    # Regression: assignments() rebuilds pattern.assignments from fixed +
    # existing + new and drops assignments to groups the owner can no longer
    # write to; SQLAlchemy then nulls their pattern_id, so the pattern silently
    # leaves the group and an orphan row remains
    def test_assignment_in_read_only_group_survives(
        self, csrf_disabled_client, world
    ):
        rita = world["rita"]
        rope = _bead(rita)
        db.session.add(Assignment(pattern=rope, group=_group("club")))
        db.session.commit()
        self._post(_as(csrf_disabled_client, rita), rope)
        assert _assigned_groups(rope) == ["club", "rita"]


# ---------- delete pattern ---------------------------------------------------


class TestDeletePattern:
    def test_confirm_page(self, csrf_disabled_client, world):
        rope = _bead(world["alice"])
        r = _as(csrf_disabled_client, world["alice"]).get(
            f"/patterns/delete/{rope.name}")
        assert r.status_code == 200
        assert b"Rope" in r.data
        assert Pattern.query.filter_by(id=rope.id).count() == 1

    def test_owner_deletes(self, csrf_disabled_client, world):
        alice = world["alice"]
        rope = _bead(alice)
        db.session.add(Assignment(pattern=rope, group=_group("club")))
        db.session.commit()
        rope_id = rope.id
        r = _as(csrf_disabled_client, alice).post(
            f"/patterns/delete/{rope.name}")
        assert r.headers["Location"].endswith("/alice")
        assert db.session.get(Pattern, rope_id) is None
        assert Assignment.query.filter_by(pattern_id=rope_id).count() == 0

    def test_only_own_pattern_of_that_name_is_deleted(
        self, csrf_disabled_client, world
    ):
        alices = _bead(world["alice"])
        ottos = _bead(world["otto"])
        assert alices.name == ottos.name
        _as(csrf_disabled_client, world["otto"]).post(
            f"/patterns/delete/{ottos.name}")
        assert Pattern.query.filter_by(name=alices.name).one().owner_id == (
            world["alice"].id)

    def test_group_owner_cannot_delete_members_pattern(
        self, csrf_disabled_client, world
    ):
        twill = _weave(world["wendy"])
        db.session.add(Assignment(pattern=twill, group=_group("club")))
        db.session.commit()
        c = _as(csrf_disabled_client, world["alice"])
        r = c.post(f"/patterns/delete/{twill.name}")
        assert r.headers["Location"].endswith("/alice")
        assert db.session.get(Pattern, twill.id) is not None

    def test_unknown_pattern(self, csrf_disabled_client, world):
        c = _as(csrf_disabled_client, world["alice"])
        r = c.get("/patterns/delete/nope")
        assert r.status_code == 302
        assert r.headers["Location"].endswith("/alice")

    def test_anonymous(self, csrf_disabled_client, world):
        rope = _bead(world["alice"])
        r = csrf_disabled_client.post(f"/patterns/delete/{rope.name}")
        assert r.status_code == 302
        assert "/auth/login" in r.headers["Location"]
        assert db.session.get(Pattern, rope.id) is not None

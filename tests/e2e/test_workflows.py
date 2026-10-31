"""Multi-page workflows in a real browser: sharing a pattern with a
group member, messaging, uploading a desktop file, printing."""
import re
from pathlib import Path

from playwright.sync_api import expect

from editor import click_weave_cell, is_modified, open_editor
from helpers import db_access, make_weave_pattern, stored_contents
from textileplatform.models import Pattern

SAMPLES = Path(__file__).parent.parent / "data" / "formats"


def _page_count(pdf_bytes):
    return len(re.findall(rb"/Type /Page\b", pdf_bytes))


class TestSharing:
    def test_share_a_pattern_with_an_invited_member(self, alice_page,
                                                    bob_page):
        twill = make_weave_pattern("alice", "twill")

        # alice creates a shared group and invites bob
        alice_page.goto("/groups/add")
        alice_page.check("input[name=kind][value=shared]")
        alice_page.fill("#grp-name", "Club")
        with alice_page.expect_navigation():
            alice_page.click("button[type=submit]")
        alice_page.goto("/groups/edit/club")
        alice_page.fill("#invite-user", "bob")
        with alice_page.expect_navigation():
            alice_page.get_by_role("button", name="Invite").click()

        # bob sees the invitation and accepts it
        bob_page.goto("/bob")
        expect(bob_page.locator("a.invitation-badge",
                                has_text="Invitations (1)")).to_be_visible()
        bob_page.goto("/invitations")
        with bob_page.expect_navigation():
            bob_page.get_by_role("button", name="Accept").click()

        # alice shares her pattern into the group
        alice_page.goto(f"/patterns/assignments/{twill}")
        alice_page.get_by_label("Club").check()
        with alice_page.expect_navigation():
            alice_page.get_by_role("button", name="Save").click()

        # bob finds it in the group's tab on his page (/groups/<name> is
        # only the public view of public groups) and opens it read-only
        bob_page.goto("/bob?group=club")
        row = bob_page.locator(".group-content[data-group-name=club] "
                               f".pattern-row[data-pattern-name={twill}]")
        expect(row).to_be_visible()
        with bob_page.expect_navigation():
            row.locator(".row-name a").click()
        bob_page.wait_for_function("() => typeof readonly !== 'undefined'"
                                   " && view !== null")
        assert bob_page.evaluate("readonly") is True

    def test_unshared_pattern_is_not_visible(self, alice_page, bob_page):
        make_weave_pattern("alice", "secret")
        bob_page.goto("/alice/secret")
        expect(bob_page).not_to_have_url(re.compile(r"/alice/secret$"))


class TestMessaging:
    def test_message_and_reply(self, alice_page, bob_page):
        alice_page.goto("/messages/u/bob")
        alice_page.fill("#chat-body", "Shall we weave a twill?")
        alice_page.get_by_role("button", name="Send").click()
        expect(alice_page.locator("#chat-messages .msg .body")).to_have_text(
            ["Shall we weave a twill?"])

        # bob gets an unread count and reads the message
        bob_page.goto("/bob")
        expect(bob_page.locator("#nav-messages .nav-count")).to_have_text(
            "(1)")
        bob_page.goto("/messages/u/alice")
        expect(bob_page.locator("#chat-messages .msg .body")).to_have_text(
            ["Shall we weave a twill?"])
        bob_page.fill("#chat-body", "Yes, 2/2!")
        bob_page.get_by_role("button", name="Send").click()
        expect(bob_page.locator("#chat-messages .msg .body")).to_have_count(2)

        # reading it cleared bob's count; alice sees the reply
        bob_page.goto("/bob")
        expect(bob_page.locator("#nav-messages .nav-count")).to_have_count(0)
        alice_page.goto("/messages/u/bob")
        expect(alice_page.locator("#chat-messages .msg .body")).to_have_text(
            ["Shall we weave a twill?", "Yes, 2/2!"])


class TestUpload:
    def test_upload_a_desktop_file(self, alice_page):
        alice_page.goto("/patterns/upload")
        alice_page.fill("#name", "Satin")
        alice_page.set_input_files("#file", str(SAMPLES / "satin.dbw"))
        # The editor opens and saves once on its own (thumbnail,
        # detected repeat).
        with alice_page.expect_response(
                lambda r: "/api/pattern/alice/satin" in r.url
                and r.request.method == "PUT") as saved:
            alice_page.get_by_role("button", name="Upload").click()
        assert saved.value.ok
        expect(alice_page).to_have_url(re.compile(r"/alice/satin(\?|$)"))
        assert alice_page.evaluate("pattern.weave.data.some(v => v > 0)")
        assert not is_modified(alice_page)
        with db_access():
            p = Pattern.query.filter_by(name="satin").one()
            assert p.thumbnail_image
            assert p.pattern_width
        assert any(stored_contents("alice", "satin")["data_entering"])

    def test_unreadable_file_is_reported(self, alice_page, tmp_path):
        bad = tmp_path / "notes.txt"
        bad.write_text("not a pattern")
        alice_page.goto("/patterns/upload")
        alice_page.set_input_files("#file", str(bad))
        with alice_page.expect_navigation():
            alice_page.get_by_role("button", name="Upload").click()
        expect(alice_page.get_by_text("notes.txt")).to_be_visible()
        with db_access():
            assert Pattern.query.count() == 0


class TestPrint:
    def _draw(self, page):
        click_weave_cell(page, "entering", 0, 0)
        click_weave_cell(page, "tieup", 0, 0)
        click_weave_cell(page, "treadling", 0, 0)

    def test_print_renders_the_unsaved_pattern(self, alice_page):
        name = make_weave_pattern("alice", "twill")
        open_editor(alice_page, "alice", name)
        self._draw(alice_page)
        with alice_page.expect_request(
                lambda r: r.url.endswith(f"/alice/{name}/print")) as req, \
                alice_page.expect_download() as download:
            alice_page.keyboard.press("Control+p")
        assert req.value.post_data_json["contents"]["data_entering"][0] == 1
        pdf = Path(download.value.path()).read_bytes()
        assert pdf.startswith(b"%PDF")
        assert _page_count(pdf) >= 1
        assert is_modified(alice_page)   # printing doesn't save

    def test_print_part_sends_the_chosen_ranges(self, alice_page):
        name = make_weave_pattern("alice", "twill")
        open_editor(alice_page, "alice", name)
        self._draw(alice_page)
        alice_page.keyboard.press("Control+l")
        dialog = alice_page.locator(".tx-modal")
        expect(dialog).to_be_visible()
        dialog.locator("#tx-pp-wa").fill("1")
        dialog.locator("#tx-pp-wb").fill("2")
        with alice_page.expect_request(
                lambda r: r.url.endswith(f"/alice/{name}/print")) as req, \
                alice_page.expect_download() as download:
            dialog.get_by_role("button", name="OK").click()
        body = req.value.post_data_json
        assert (body["warp_from"], body["warp_to"]) == (1, 2)
        assert Path(download.value.path()).read_bytes().startswith(b"%PDF")
        expect(dialog).to_have_count(0)

"""DB-WEAVE editor in a real browser: editing, saving, undo, the
unsaved-changes guards and local drafts."""
import pytest
from playwright.sync_api import expect

from editor import (
    _WEAVE_CELL_JS as _CELL_JS, click_weave_cell, is_modified, open_editor,
    save,
)
from helpers import make_user, make_weave_pattern, login, stored_contents


@pytest.fixture
def twill(alice_page):
    """alice's empty weave pattern, open in her editor."""
    name = make_weave_pattern("alice", "twill")
    open_editor(alice_page, "alice", name)
    return name


def _draw_one_crossing(page):
    """Thread warp 0 on shaft 1, tie shaft 1 to treadle 1 and tread it
    in weft 0: the weave gets exactly cell (0, 0)."""
    click_weave_cell(page, "entering", 0, 0)
    click_weave_cell(page, "tieup", 0, 0)
    click_weave_cell(page, "treadling", 0, 0)


def _crossing(page):
    return page.evaluate("txEditor.pattern.weave.get(0, 0)") > 0


def _dialog(page):
    return page.locator(".navguard-overlay")


def test_login_lands_on_own_page(alice_page):
    expect(alice_page).to_have_url("/alice")


def test_edit_save_reload(alice_page, twill):
    assert not is_modified(alice_page)

    _draw_one_crossing(alice_page)
    assert _crossing(alice_page)
    assert alice_page.evaluate("txEditor.pattern.weave.get(1, 0)") == 0
    assert is_modified(alice_page)

    save(alice_page)
    assert not is_modified(alice_page)
    stored = stored_contents("alice", twill)
    assert stored["data_entering"][0] == 1
    assert any(stored["data_tieup"])
    assert any(stored["data_treadling"])

    alice_page.reload()
    open_editor(alice_page, "alice", twill)
    assert _crossing(alice_page)
    assert not is_modified(alice_page)


def test_tieup_prepared_first_survives_reload(alice_page, twill):
    """Tie up before threading or treading anything, save, reload."""
    click_weave_cell(alice_page, "tieup", 2, 3)
    assert alice_page.evaluate("txEditor.pattern.tieup.get(2, 3)") == 1
    save(alice_page)
    alice_page.reload()
    open_editor(alice_page, "alice", twill)
    assert alice_page.evaluate("txEditor.pattern.tieup.get(2, 3)") == 1


def _drag_select(page, part, i1, j1, i2, j2):
    start = page.evaluate(_CELL_JS, [part, i1, j1])
    end = page.evaluate(_CELL_JS, [part, i2, j2])
    page.mouse.move(start["x"], start["y"])
    page.mouse.down()
    page.mouse.move(end["x"], end["y"], steps=3)
    page.mouse.up()


def test_invert_restores_ranges_after_reload(alice_page, twill):
    """Inverting a set cell keeps its range as a negative value, so a
    second invert restores it, also after saving and reloading."""
    alice_page.evaluate("txEditor.settings.current_range = 2")
    click_weave_cell(alice_page, "tieup", 1, 1)
    alice_page.evaluate("txEditor.settings.current_range = 3")
    _drag_select(alice_page, "tieup", 1, 1, 2, 1)
    alice_page.keyboard.press("i")
    assert alice_page.evaluate(
        "[1, 2].map(i => txEditor.pattern.tieup.get(i, 1))") == [-2, 3]
    save(alice_page)
    alice_page.reload()
    open_editor(alice_page, "alice", twill)
    _drag_select(alice_page, "tieup", 1, 1, 2, 1)
    alice_page.keyboard.press("i")
    assert alice_page.evaluate(
        "[1, 2].map(i => txEditor.pattern.tieup.get(i, 1))") == [2, -3]


def test_clicking_a_set_cell_clears_it(alice_page, twill):
    click_weave_cell(alice_page, "entering", 3, 2)
    assert alice_page.evaluate("txEditor.pattern.entering.get_shaft(3)") == 3
    click_weave_cell(alice_page, "entering", 3, 2)
    assert alice_page.evaluate("txEditor.pattern.entering.get_shaft(3)") == 0


def test_undo_back_to_saved_state_clears_modified(alice_page, twill):
    _draw_one_crossing(alice_page)
    for _ in range(3):
        alice_page.keyboard.press("Control+z")
    assert not _crossing(alice_page)
    assert not is_modified(alice_page)

    alice_page.keyboard.press("Control+y")
    assert is_modified(alice_page)
    alice_page.keyboard.press("Control+y")
    alice_page.keyboard.press("Control+y")
    assert _crossing(alice_page)


def test_undo_after_save_marks_modified(alice_page, twill):
    _draw_one_crossing(alice_page)
    save(alice_page)
    alice_page.keyboard.press("Control+z")
    assert is_modified(alice_page)
    alice_page.keyboard.press("Control+y")
    assert not is_modified(alice_page)


class TestCloseGuard:
    def test_closes_without_asking_when_unchanged(self, alice_page, twill):
        with alice_page.expect_navigation():
            alice_page.click("#close")
        expect(alice_page).to_have_url("/alice")

    def test_cancel_stays_in_the_editor(self, alice_page, twill):
        _draw_one_crossing(alice_page)
        alice_page.click("#close")
        expect(_dialog(alice_page)).to_be_visible()
        alice_page.click(".navguard-cancel")
        expect(_dialog(alice_page)).to_have_count(0)
        assert alice_page.url.endswith(f"/alice/{twill}")
        assert is_modified(alice_page)

    def test_escape_cancels(self, alice_page, twill):
        _draw_one_crossing(alice_page)
        alice_page.click("#close")
        expect(_dialog(alice_page)).to_be_visible()
        alice_page.keyboard.press("Escape")
        expect(_dialog(alice_page)).to_have_count(0)
        # the dialog swallowed the key: the edit is still there
        assert _crossing(alice_page)

    def test_discard_leaves_the_server_unchanged(self, alice_page, twill):
        _draw_one_crossing(alice_page)
        alice_page.click("#close")
        with alice_page.expect_navigation():
            alice_page.click(".navguard-discard")
        expect(alice_page).to_have_url("/alice")
        assert not any(stored_contents("alice", twill)["data_entering"])
        # ... and leaves no draft behind
        open_editor(alice_page, "alice", twill)
        expect(_dialog(alice_page)).to_have_count(0)

    def test_save_stores_and_leaves(self, alice_page, twill):
        _draw_one_crossing(alice_page)
        alice_page.click("#close")
        with alice_page.expect_navigation():
            alice_page.click(".navguard-save")
        expect(alice_page).to_have_url("/alice")
        assert stored_contents("alice", twill)["data_entering"][0] == 1


def test_internal_links_are_guarded(alice_page, twill):
    _draw_one_crossing(alice_page)
    link = alice_page.locator("a[href='/alice']").first
    link.click()
    expect(_dialog(alice_page)).to_be_visible()
    alice_page.click(".navguard-cancel")
    assert alice_page.url.endswith(f"/alice/{twill}")


class TestDrafts:
    def _reload_with_unsaved_changes(self, page):
        # The browser asks before leaving; the guard has written the
        # draft by then.
        page.once("dialog", lambda d: d.accept())
        page.reload()

    def test_reload_offers_recovery(self, alice_page, twill):
        _draw_one_crossing(alice_page)
        self._reload_with_unsaved_changes(alice_page)
        expect(_dialog(alice_page)).to_be_visible()
        alice_page.click(".navguard-save")  # Recover
        alice_page.wait_for_function("() => txEditor.modified")
        assert _crossing(alice_page)
        assert is_modified(alice_page)
        # Not on the server until saved.
        assert not any(stored_contents("alice", twill)["data_entering"])
        save(alice_page)
        assert stored_contents("alice", twill)["data_entering"][0] == 1

    def test_discarding_the_draft_removes_it(self, alice_page, twill):
        _draw_one_crossing(alice_page)
        self._reload_with_unsaved_changes(alice_page)
        alice_page.click(".navguard-discard")
        expect(_dialog(alice_page)).to_have_count(0)
        assert not _crossing(alice_page)
        assert not is_modified(alice_page)
        alice_page.reload()
        open_editor(alice_page, "alice", twill)
        expect(_dialog(alice_page)).to_have_count(0)

    def test_draft_is_written_while_editing(self, alice_page, twill):
        _draw_one_crossing(alice_page)
        key = f"textile-draft:alice/{twill}"
        alice_page.wait_for_function(
            "(k) => localStorage.getItem(k) !== null", arg=key)
        save(alice_page)
        assert alice_page.evaluate(
            "(k) => localStorage.getItem(k)", key) is None


def test_export_renders_unsaved_state(alice_page, twill):
    _draw_one_crossing(alice_page)
    with alice_page.expect_request(
            lambda r: r.url.endswith(f"/alice/{twill}/export/png")) as req, \
            alice_page.expect_download() as download:
        alice_page.evaluate("txEditor.ActionRegistry.invoke('file.export-png')")
    sent = req.value.post_data_json["contents"]
    assert sent["data_entering"][0] == 1
    assert download.value.suggested_filename == f"alice-{twill}.png"
    with open(download.value.path(), "rb") as f:
        assert f.read(8) == b"\x89PNG\r\n\x1a\n"
    # Exporting doesn't save.
    assert is_modified(alice_page)
    assert not any(stored_contents("alice", twill)["data_entering"])


def test_other_users_see_public_patterns_read_only(page):
    make_user("alice")
    name = make_weave_pattern("alice", "rope", public=True)
    login(page, make_user("bob"))
    open_editor(page, "alice", name)
    assert page.evaluate("txEditor.readonly") is True
    click_weave_cell(page, "entering", 0, 0)
    assert page.evaluate("txEditor.pattern.entering.get_shaft(0)") == 0
    assert not page.evaluate("txEditor.modified")

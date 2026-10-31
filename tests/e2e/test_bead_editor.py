"""JBead editor in a real browser."""
import pytest

from editor import click_bead, is_modified, open_editor, save
from helpers import make_bead_pattern, stored_contents


@pytest.fixture
def rope(alice_page):
    name = make_bead_pattern("alice", "rope")
    open_editor(alice_page, "alice", name)
    return name


def _beads(contents):
    """(i, j, colour) of every non-background bead."""
    return {(i, j, c) for j, row in enumerate(contents["model"])
            for i, c in enumerate(row) if c}


def test_pencil_paints_and_save_stores(alice_page, rope):
    assert not is_modified(alice_page)
    click_bead(alice_page, 2, 0)
    click_bead(alice_page, 5, 3)
    assert alice_page.evaluate("txEditor.pattern.get(2, 0)") == 1
    assert alice_page.evaluate("txEditor.pattern.get(5, 3)") == 1
    assert is_modified(alice_page)

    save(alice_page)
    assert not is_modified(alice_page)
    assert _beads(stored_contents("alice", rope)) == {(2, 0, 1), (5, 3, 1)}

    alice_page.reload()
    open_editor(alice_page, "alice", rope)
    assert alice_page.evaluate("txEditor.pattern.get(5, 3)") == 1


def test_undo_redo(alice_page, rope):
    click_bead(alice_page, 1, 1)
    alice_page.keyboard.press("Control+z")
    assert alice_page.evaluate("txEditor.pattern.get(1, 1)") == 0
    assert not is_modified(alice_page)
    alice_page.keyboard.press("Control+y")
    assert alice_page.evaluate("txEditor.pattern.get(1, 1)") == 1
    assert is_modified(alice_page)


def test_close_guard_discard(alice_page, rope):
    click_bead(alice_page, 0, 0)
    alice_page.click("#close")
    with alice_page.expect_navigation():
        alice_page.click(".navguard-discard")
    assert _beads(stored_contents("alice", rope)) == set()

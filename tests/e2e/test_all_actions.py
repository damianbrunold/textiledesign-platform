"""Every editor action, run once in a real browser.

The editors register their commands (menus, toolbar, shortcuts) in
ActionRegistry. This test invokes each of them on a pattern with content
and a selection, confirms any dialog it opens with its defaults, and
fails on uncaught errors in the page, on exceptions from an action, and
on alerts (the editors use alert() only to report failures). It is the
safety net for restructuring the editors' code: a missing or misspelled
name in a rarely used dialog shows up here.

Every registered action must actually run (not just be disabled). When
a new action needs a state the setup doesn't provide, add one to the
retry states.
"""
import pytest

from editor import open_editor
from helpers import make_bead_pattern, make_weave_pattern

# Actions that leave the page.
SKIP = {"file.close"}

# Invoke an action and give its async work a moment; report exceptions
# instead of letting them escape page.evaluate.
_INVOKE_JS = """
async (id) => {
    let result;
    try {
        result = ActionRegistry.invoke(id) ? "ran" : "disabled";
    } catch (e) {
        return "threw: " + (e && e.stack || e);
    }
    await new Promise((r) => setTimeout(r, 30));
    return result;
}
"""

# Confirm the topmost dialog with its primary button (or close it), until
# no editor dialog is left. Returns how many were handled.
_CLOSE_DIALOGS_JS = """
async () => {
    let handled = 0;
    for (let round = 0; round < 6; round++) {
        const modals = document.querySelectorAll(".tx-modal");
        const guard = document.querySelector(".navguard-overlay");
        if (!modals.length && !guard) break;
        handled++;
        if (guard) {
            guard.querySelector(".navguard-cancel").click();
        } else {
            // Confirm once; if the dialog is still open after that (or
            // has no primary button), cancel or close it.
            const top = modals[modals.length - 1];
            const primary = top.querySelector(".tx-modal-btn-primary");
            const cancel = top.querySelector(".tx-modal-btn-cancel");
            if (primary && round === 0) primary.click();
            else if (cancel) cancel.click();
            else if (Modal.topmost()) Modal.topmost().close();
        }
        await new Promise((r) => setTimeout(r, 30));
    }
    return handled;
}
"""

_WEAVE_SETUP_JS = """
() => {
    // 2/2 twill on 8 shafts / treadles over the whole pattern, then a
    // selection in the weave.
    const w = pattern.weave.width, h = pattern.weave.height;
    for (let i = 0; i < w; i++) pattern.entering.set_shaft(i, (i % 8) + 1);
    for (let s = 0; s < 8; s++) {
        for (let t = 0; t < 8; t++) {
            if ((s - t + 8) % 8 < 2) pattern.tieup.set(t, s, 1);
        }
    }
    for (let j = 0; j < h; j++) pattern.treadling.set(j % 8, j, 1);
    pattern.recalc_weave();
    view.draw();
}
"""

# Before each action: a selection in the weave, and unsaved changes (so
# undo / revert have something to do).
_WEAVE_STATE_JS = """
() => {
    select_part("weave", 2, 2, 5, 5);
    setModified();
}
"""

# States to retry an action in when it was disabled in the first pass:
# the cursor in another pane, pegplan mode off (an earlier action turns
# it on), something to undo / redo.
_WEAVE_RETRY_STATES = [
    """() => {
        if (settings.display_pegplan) ActionRegistry.invoke("pegplan.toggle");
        select_part("entering", 2, 2); setModified();
    }""",
    """() => {
        if (settings.display_pegplan) ActionRegistry.invoke("pegplan.toggle");
        select_part("treadling", 2, 2); setModified();
    }""",
    """() => {
        if (settings.display_pegplan) ActionRegistry.invoke("pegplan.toggle");
        select_part("tieup", 1, 1, 3, 3); setModified();
    }""",
    """() => { select_part("color_warp", 1, 0, 4, 0); setModified(); }""",
    """() => { ActionRegistry.invoke("edit.undo"); setModified(); }""",
]

_BEAD_SETUP_JS = """
() => {
    for (let k = 0; k < pattern.data.length; k++) {
        pattern.data[k] = (k * 7) % 4;
    }
    beadlist.update();
    view.draw();
}
"""

_BEAD_STATE_JS = """
() => {
    pattern.selection = { i1: 1, j1: 1, i2: 3, j2: 3 };
    setModified();
}
"""


@pytest.mark.parametrize("editor", ["dbweave", "jbead"])
def test_every_action_runs_without_errors(alice_page, editor, page_errors):
    page = alice_page
    name = (make_weave_pattern if editor == "dbweave"
            else make_bead_pattern)("alice", "all")
    open_editor(page, "alice", name)
    page.evaluate(_WEAVE_SETUP_JS if editor == "dbweave"
                  else _BEAD_SETUP_JS)

    alerts = []

    def on_dialog(dialog):
        if dialog.type == "alert":
            alerts.append(dialog.message)
        dialog.dismiss()

    page.on("dialog", on_dialog)
    page.on("download", lambda download: None)

    state = _WEAVE_STATE_JS if editor == "dbweave" else _BEAD_STATE_JS
    ids = page.evaluate("ActionRegistry.all().map(a => a.id)")
    outcome = {}
    for action in ids:
        if action in SKIP:
            continue
        alerts_before = len(alerts)
        page.evaluate(state)
        outcome[action] = page.evaluate(_INVOKE_JS, action)
        page.evaluate(_CLOSE_DIALOGS_JS)
        if len(alerts) > alerts_before:
            outcome[action] = "alert: " + "; ".join(alerts[alerts_before:])
        if page_errors:
            # Attribute uncaught errors to the action that caused them
            # (and don't let them pile up on later actions).
            outcome[action] = "error: " + "; ".join(dict.fromkeys(page_errors))
            page_errors.clear()

    # Second chance for the disabled ones, in other states.
    retry = _WEAVE_RETRY_STATES if editor == "dbweave" else []
    for action in [a for a, o in outcome.items() if o == "disabled"]:
        for alt in retry:
            page.evaluate(alt)
            page.evaluate(_CLOSE_DIALOGS_JS)
            result = page.evaluate(_INVOKE_JS, action)
            page.evaluate(_CLOSE_DIALOGS_JS)
            if page_errors:
                result = "error: " + "; ".join(dict.fromkeys(page_errors))
                page_errors.clear()
            if result != "disabled":
                outcome[action] = result
                break

    problems = {a: o for a, o in outcome.items()
                if o.startswith(("threw", "alert", "error"))}
    assert problems == {}
    ran = [a for a, o in outcome.items() if o == "ran"]
    # Most actions must really run (not be disabled by the setup), or
    # this test would pass without checking anything.
    assert len(ran) == len(outcome), sorted(
        a for a, o in outcome.items() if o == "disabled")

"""Helpers for driving the pattern editors in a browser page.

The editors are classic scripts, so their top-level bindings (`view`,
`pattern`, `cursor`, `commandBus`, `modified`, ...) are reachable from
page.evaluate().
"""

# Document (i, j) -> canvas pixel of the cell centre for a DB-WEAVE
# pane. Inverts the mapping of mouseDown in dbweave.js: per pane, which
# axes follow the right-to-left / top-to-bottom settings.
_WEAVE_CELL_JS = """
([part, i, j]) => {
    const rtl = settings.direction_righttoleft;
    const ttb = settings.direction_toptobottom;
    const flags = {
        entering:   [rtl, ttb],
        tieup:      [false, ttb],
        treadling:  [false, false],
        pegplan:    [false, false],
        weave:      [rtl, false],
        color_warp: [rtl, false],
        color_weft: [false, false],
        reed:       [rtl, false],
    }[part];
    const v = view[part];
    const dx = v.dx || settings.dx, dy = v.dy || settings.dy;
    const vi = flags[0] ? v.width - 1 - (i - v.offset_i) : i - v.offset_i;
    const vj = flags[1] ? j - v.offset_j : v.height - 1 - (j - v.offset_j);
    if (vi < 0 || vi >= v.width || vj < 0 || vj >= v.height) {
        throw new Error(`cell ${part}(${i},${j}) is scrolled out of view`);
    }
    const canvas = document.getElementById("canvas");
    const r = canvas.getBoundingClientRect();
    return {
        x: r.left + canvas.clientLeft + v.x + (vi + 0.5) * dx,
        y: r.top + canvas.clientTop + v.y + (vj + 0.5) * dy,
    };
}
"""


def open_editor(page, owner, name):
    page.goto(f"/{owner}/{name}")
    wait_until_ready(page)


def wait_until_ready(page):
    """The editor has loaded the pattern and built its view."""
    page.wait_for_function(
        "() => typeof view !== 'undefined' && view !== null"
        " && typeof data !== 'undefined' && data !== null")


def click_weave_cell(page, part, i, j):
    pos = page.evaluate(_WEAVE_CELL_JS, [part, i, j])
    page.mouse.click(pos["x"], pos["y"])


def is_modified(page):
    """The editor's modified flag, checked against its indicator."""
    flag = page.evaluate("modified")
    css = page.get_attribute("#modified", "class")
    assert css == ("changed" if flag else "unchanged")
    return flag


def save(page):
    """Ctrl+S, waiting for the server's answer."""
    with page.expect_response(
            lambda r: "/api/pattern/" in r.url
            and r.request.method == "PUT") as resp:
        page.keyboard.press("Control+s")
    assert resp.value.ok
    page.wait_for_function("() => !modified")


# Data (i, j) -> client pixel of a bead in the JBead draft view. Inverts
# ViewDraft.pixelToDataCoord and the bitmap scaling of _canvasXY.
_BEAD_CELL_JS = """
([i, j]) => {
    const v = view.draft;
    const jv = j - v.offset;
    if (i < 0 || i >= v.width || jv < 0 || jv >= v.height) {
        throw new Error(`bead (${i},${j}) is scrolled out of view`);
    }
    const bx = 0.5 + (v.x + i + 0.5) * settings.dx;
    const by = 0.5 + (v.y + v.height - jv - 1 + 0.5) * settings.dy;
    const canvas = document.getElementById("canvas");
    const r = canvas.getBoundingClientRect();
    return {
        x: r.left + canvas.clientLeft + bx * r.width / canvas.width,
        y: r.top + canvas.clientTop + by * r.height / canvas.height,
    };
}
"""


def click_bead(page, i, j):
    pos = page.evaluate(_BEAD_CELL_JS, [i, j])
    page.mouse.click(pos["x"], pos["y"])

"""The DB-WEAVE tutorials of the desktop manual, replayed in the web editor.

Source: brunoldsoftware.ch, DB-WEAVE manual, "Tutorials"
(bsoft_www/src/help/tutorials.en.md). Each test follows one tutorial
section step by step with the menus and keys it names, and checks the
results the tutorial describes. Where the tutorial leaves the pattern
open ("enter a small pattern"), the test picks one.

Deliberate differences of the web editor:
- view modes are Alt+1 / Alt+2 / Alt+3 (Ctrl+1..3 switch browser tabs);
- the colour palette dialog is Color -> Palette; Ctrl+F toggles the
  palette side panel;
- the single-key copy / paste aliases K and E are not offered.
The "Weaving" tutorial needs a loom and has no counterpart here.
"""

from playwright.sync_api import expect

from editor import _WEAVE_CELL_JS, click_weave_cell, open_editor
from helpers import make_weave_pattern


# ---------- helpers ---------------------------------------------------


def choose(page, action):
    """Pick a menu item like a user: open its top-level menu and the
    submenus on the way, then click the item."""
    selector = f".tx-menu-item[data-action='{action}']"
    item = page.locator(f".tx-menubar {selector}")
    expect(item).to_have_count(1)
    top = page.locator(".tx-menu-top").filter(has=page.locator(selector))
    top.locator(":scope > span").first.click()
    subs = page.locator(".tx-menu-has-sub").filter(
        has=page.locator(selector))
    for k in range(subs.count()):
        # Submenus open on hover (a click would toggle them shut again).
        subs.nth(k).locator(":scope > .tx-menu-label").hover()
    item.click()


def dialog(page):
    return page.locator(".tx-modal").last


def ok(page):
    dialog(page).locator(".tx-modal-btn-primary").click()
    expect(page.locator(".tx-modal")).to_have_count(0)


def grid(page, name, w, h):
    """Rows j = 0..h-1 of columns i = 0..w-1 of a pattern grid."""
    return page.evaluate(
        """([name, w, h]) => {
            const g = txEditor.pattern[name];
            return Array.from({ length: h }, (_, j) =>
                Array.from({ length: w }, (_, i) => g.get(i, j)));
        }""", [name, w, h])


def bits(rows):
    return [[1 if v > 0 else 0 for v in row] for row in rows]


def entering(page, w):
    return page.evaluate(
        "(w) => Array.from({ length: w }, (_, i) =>"
        " txEditor.pattern.entering.get_shaft(i))", w)


def woven(page, w, h):
    """The weave that threading, tie-up and treadling give."""
    shafts = entering(page, w)
    tieup = grid(page, "tieup", 32, 32)
    treadling = grid(page, "treadling", 32, h)
    out = []
    for j in range(h):
        row = []
        for i in range(w):
            s = shafts[i]
            row.append(int(s > 0 and any(
                treadling[j][t] > 0 and tieup[s - 1][t] > 0
                for t in range(32))))
        out.append(row)
    return out


def twill22(w, h):
    return [[int((j - i) % 4 < 2) for i in range(w)] for j in range(h)]


def put_cursor(page, i, j):
    """Ctrl+click jumps the cursor without setting the cell."""
    page.keyboard.down("Control")
    click_weave_cell(page, "weave", i, j)
    page.keyboard.up("Control")
    cur = page.evaluate("[txEditor.cursor.x1, txEditor.cursor.y1]")
    assert cur == [i, j]


def setting(page, key):
    return page.evaluate(f"txEditor.settings.{key}")


# ---------- Basics: first steps --------------------------------------


def test_basics_first_steps(alice_page):
    page = alice_page
    open_editor(page, "alice", make_weave_pattern("alice", "first"))

    # Enter a small pattern in the pattern area: a 2/2 twill, 4 x 4.
    for j in range(4):
        for i in range(4):
            if twill22(4, 4)[j][i]:
                click_weave_cell(page, "weave", i, j)
    assert bits(grid(page, "weave", 6, 6)) == [
        [*row, 0, 0] for row in twill22(4, 4)] + [[0] * 6] * 2

    # Threading, treadling and tie-up follow automatically and give
    # exactly this weave.
    assert all(s > 0 for s in entering(page, 4))
    assert woven(page, 6, 6) == bits(grid(page, "weave", 6, 6))
    # The status bar shows the pattern size.
    expect(page.locator("#sb-rapport")).to_contain_text("4×4")

    # Repeat -> Repeat: enlarge to 2 x 2 repeats.
    choose(page, "repeat.rapportieren")
    dialog(page).locator("#tx-rap-horz").fill("2")
    dialog(page).locator("#tx-rap-vert").fill("2")
    ok(page)
    assert bits(grid(page, "weave", 9, 9)) == [
        [*row, 0] for row in twill22(8, 8)] + [[0] * 9]
    assert woven(page, 9, 9) == bits(grid(page, "weave", 9, 9))
    expect(page.locator("#sb-rapport")).to_contain_text("8×8")
    expect(page.locator("#sb-rapport")).to_contain_text("Rapport 4×4")

    # The three views (Alt+1..3 on the web).
    for key, style in (("Alt+2", "color"), ("Alt+3", "simulation"),
                       ("Alt+1", "draft")):
        page.keyboard.press(key)
        assert setting(page, "style") == style


# ---------- Basics: selecting and editing ------------------------------


def test_basics_selecting_and_editing(alice_page):
    page = alice_page
    open_editor(page, "alice", make_weave_pattern("alice", "satin"))

    # Extras -> Options -> For this pattern, Grid tab: emphasis 5.
    choose(page, "opt.pattern")
    dialog(page).locator("[data-tab=grid]").click()
    dialog(page).locator("#tx-opt-uw").fill("5")
    dialog(page).locator("#tx-opt-uh").fill("5")
    ok(page)
    assert (setting(page, "unit_width"), setting(page, "unit_height")) \
        == (5, 5)

    # Cursor to the corner of the pattern, Insert -> Satin -> Satin 5:
    # a 5-binding satin, selected.
    put_cursor(page, 0, 0)
    choose(page, "insert.atlas-5")
    satin = bits(grid(page, "weave", 5, 5))
    assert all(sum(row) == 1 for row in satin)
    assert all(sum(col) == 1 for col in zip(*satin))
    sel = page.evaluate(
        "[txEditor.cursor.x1, txEditor.cursor.y1,"
        " txEditor.cursor.x2, txEditor.cursor.y2]")
    assert sorted(sel[::2]) == [0, 4]
    assert sorted(sel[1::2]) == [0, 4]

    # Edit -> Make central symmetric (Z).
    page.keyboard.press("z")
    sym = bits(grid(page, "weave", 5, 5))
    assert all(sym[j][i] == sym[4 - j][4 - i]
               for i in range(5) for j in range(5))
    assert all(sum(row) == 1 for row in sym)

    # Copy the pattern, paste it at the first pick to the right, invert
    # and mirror vertically: the second half is the mirrored negative.
    page.keyboard.press("Control+c")
    put_cursor(page, 5, 0)
    page.keyboard.press("Control+v")
    page.keyboard.press("i")
    page.keyboard.press("v")
    both = bits(grid(page, "weave", 10, 5))
    first = [row[:5] for row in both]
    second = [row[5:] for row in both]
    assert first == sym
    assert second == [[1 - v for v in sym[4 - j]] for j in range(5)]
    # Threading and treadling still give the weave.
    assert woven(page, 10, 5) == both


# ---------- Ranges ----------------------------------------------------


def drag_weave(page, i1, j1, i2, j2):
    """Mouse drag in the pattern from cell (i1, j1) to (i2, j2)."""
    start = page.evaluate(_WEAVE_CELL_JS, ["weave", i1, j1])
    end = page.evaluate(_WEAVE_CELL_JS, ["weave", i2, j2])
    page.mouse.move(start["x"], start["y"])
    page.mouse.down()
    page.mouse.move(end["x"], end["y"], steps=4)
    page.mouse.up()


def blocks(rows, n):
    """Split a grid into n x n blocks: {(bi, bj): block rows}."""
    h, w = len(rows), len(rows[0])
    return {(bi, bj): [row[bi * n:(bi + 1) * n]
                       for row in rows[bj * n:(bj + 1) * n]]
            for bj in range(h // n) for bi in range(w // n)}


def test_ranges_switching(alice_page):
    page = alice_page
    open_editor(page, "alice", make_weave_pattern("alice", "ranges"))
    for key, rng, text in (("Shift+3", 3, "Range 3"),
                           ("Shift+9", 9, "Range 9"),
                           ("Shift+0", 10, "Lift out"),
                           ("Control+0", 11, "Binding"),
                           ("Shift+1", 1, "Range 1")):
        page.keyboard.press(key)
        assert setting(page, "current_range") == rng
        expect(page.locator("#sb-range")).to_have_text(text)
    # A point set in range 3 carries that range.
    page.keyboard.press("Shift+3")
    click_weave_cell(page, "weave", 2, 2)
    assert grid(page, "weave", 3, 3)[2][2] == 3


def test_ranges_block_substitution(alice_page):
    page = alice_page
    open_editor(page, "alice", make_weave_pattern("alice", "block"))
    # A small structural pattern: a 3 x 3 diagonal.
    for k in range(3):
        click_weave_cell(page, "weave", k, k)
    structure = bits(grid(page, "weave", 3, 3))

    choose(page, "edit.blockmuster")
    d = dialog(page)
    # Base pattern: Satin 5, made central symmetric (Z).
    d.locator("select").first.select_option(label="Satin 5×5")
    page.keyboard.press("z")
    # Pattern 1 (Shift+1): copy of the base (Shift+Ctrl+0), inverted
    # (I) and mirrored horizontally (H). Apply (Ctrl+Enter).
    page.keyboard.press("Shift+1")
    page.keyboard.press("Control+Shift+0")
    page.keyboard.press("i")
    page.keyboard.press("h")
    page.keyboard.press("Control+Enter")
    expect(page.locator(".tx-modal")).to_have_count(0)

    result = bits(grid(page, "weave", 15, 15))
    parts = blocks(result, 5)
    base = parts[(0, 1)]           # structure point unset -> base
    pattern1 = parts[(0, 0)]       # structure point set -> pattern 1
    for (bi, bj), block in parts.items():
        assert block == (pattern1 if structure[bj][bi] else base), \
            (bi, bj)
    # The base is a central symmetric 5-satin, pattern 1 its mirrored
    # negative.
    assert all(sum(row) == 1 for row in base)
    assert all(sum(col) == 1 for col in zip(*base))
    assert all(base[j][i] == base[4 - j][4 - i]
               for i in range(5) for j in range(5))
    assert pattern1 == [[1 - base[j][4 - i] for i in range(5)]
                        for j in range(5)]
    assert woven(page, 15, 15) == result


def test_ranges_range_substitution(alice_page):
    page = alice_page
    open_editor(page, "alice", make_weave_pattern("alice", "areas"))
    # View -> Tool palette, filled ellipse: one circle in range 1, a
    # second one in range 2.
    choose(page, "tools.toolbox")
    page.locator("#tools-panel-list [data-tool=fillellipse]").click()
    drag_weave(page, 1, 1, 9, 9)
    page.keyboard.press("Shift+2")
    drag_weave(page, 12, 1, 20, 9)
    areas = grid(page, "weave", 22, 11)
    assert {v for row in areas for v in row} == {0, 1, 2}

    # Back to the pointer; select the circles plus a border.
    page.locator("#tools-panel-list [data-tool=point]").click()
    drag_weave(page, 0, 0, 21, 10)
    choose(page, "edit.bereichmuster")
    d = dialog(page)
    presets = d.locator("select").first
    presets.select_option(label="Tabby")           # base pattern
    page.keyboard.press("Shift+1")
    presets.select_option(label="Twill 2/2")       # pattern 1
    page.keyboard.press("Shift+2")
    presets.select_option(label="Twill 3/1")       # pattern 2
    page.keyboard.press("Control+Enter")
    expect(page.locator(".tx-modal")).to_have_count(0)

    result = bits(grid(page, "weave", 22, 11))
    # Each area shows its pattern (in some phase): range 1 the 2/2
    # twill, range 2 the 3/1 twill, the rest of the selection tabby.
    patterns = {
        1: (4, lambda i, j: int((j - i) % 4 < 2)),
        2: (4, lambda i, j: int((j - i) % 4 >= 1)),
        0: (2, lambda i, j: int((j - i) % 2 == 0)),
    }
    for r, (n, pat) in patterns.items():
        cells = [(i, j) for j in range(11) for i in range(22)
                 if areas[j][i] == r]
        assert any(all(result[j][i] == pat(i + pi, j + pj)
                       for i, j in cells)
                   for pi in range(n) for pj in range(n)), r
    assert woven(page, 22, 11) == result


# ---------- Double and multiple weaves ---------------------------------


def two_choirs(n):
    """1, 5, 2, 6, 3, 7, 4, 8 for n = 8: alternate the two halves."""
    half = n // 2
    return [k // 2 + 1 + (half if k % 2 else 0) for k in range(n)]


def pick_colour(page, idx):
    """Click a swatch in the palette side panel (current colour)."""
    page.locator(f"#palette-panel-grid [data-idx='{idx}']").click()
    assert setting(page, "current_color") == idx


def test_double_weave(alice_page):
    page = alice_page
    open_editor(page, "alice", make_weave_pattern("alice", "double"))
    # Threading and treadling in two choirs: odd ends / picks on shafts
    # / treadles 1-4 (top layer), even ones on 5-8 (bottom layer).
    order = two_choirs(8)
    for k, s in enumerate(order):
        click_weave_cell(page, "entering", k, s - 1)
        click_weave_cell(page, "treadling", s - 1, k)
    assert entering(page, 8) == order

    # Tie-up: range 1 a warp-faced 3/1 twill for the top layer, range 2
    # a weft-faced 1/3 twill for the bottom layer, lift-out points
    # raising the top ends on the bottom picks.
    page.keyboard.press("Shift+1")
    for t in range(4):
        for s in range(4):
            if (s - t) % 4 != 0:
                click_weave_cell(page, "tieup", t, s)
    page.keyboard.press("Shift+2")
    for t in range(4):
        click_weave_cell(page, "tieup", 4 + t, 4 + t)
    page.keyboard.press("Shift+0")
    for t in range(4, 8):
        for s in range(4):
            click_weave_cell(page, "tieup", t, s)

    tieup = grid(page, "tieup", 8, 8)
    weave = grid(page, "weave", 8, 8)
    for j in range(8):
        for i in range(8):
            assert weave[j][i] == tieup[order[i] - 1][order[j] - 1], (i, j)
    assert {v for row in weave for v in row} == {0, 1, 2, 10}

    # Fabric view, 2 x 2 repeats, warp and weft coloured alternately.
    page.keyboard.press("Alt+3")
    choose(page, "repeat.rapportieren")
    dialog(page).locator("#tx-rap-horz").fill("2")
    dialog(page).locator("#tx-rap-vert").fill("2")
    ok(page)
    assert bits(grid(page, "weave", 16, 16))[8:] \
        == bits(grid(page, "weave", 16, 8))
    page.keyboard.press("Control+f")
    expect(page.locator("#palette-panel")).to_be_visible()
    pick_colour(page, 2)
    for k in range(1, 16, 2):
        click_weave_cell(page, "color_warp", k, 0)
        click_weave_cell(page, "color_weft", 0, k)
    warp = grid(page, "color_warp", 16, 1)[0]
    weft = [row[0] for row in grid(page, "color_weft", 1, 16)]
    assert warp[1::2] == [2] * 8
    assert 2 not in warp[0::2]
    assert weft[1::2] == [2] * 8
    assert 2 not in weft[0::2]

    # Binding (Ctrl+0) and unbinding (Ctrl+Shift+0) points between the
    # layers: bottom ends (shafts 5-8) on top picks (treadles 1-4).
    page.keyboard.press("Control+0")
    click_weave_cell(page, "tieup", 0, 4)
    page.keyboard.press("Control+Shift+0")
    click_weave_cell(page, "tieup", 1, 5)
    tieup = grid(page, "tieup", 8, 8)
    assert (tieup[4][0], tieup[5][1]) == (11, 12)
    weave = grid(page, "weave", 8, 8)
    assert weave[0][1] == 11      # end 1 on shaft 5, pick 0 on treadle 1
    assert weave[2][3] == 12      # end 3 on shaft 6, pick 2 on treadle 2


def test_double_weave_treadling_as_threading(alice_page):
    page = alice_page
    open_editor(page, "alice", make_weave_pattern("alice", "layers"))
    order = two_choirs(8)
    for k, s in enumerate(order):
        click_weave_cell(page, "entering", k, s - 1)
    for t in range(8):
        click_weave_cell(page, "tieup", t, t)
    # Treadling -> Treadling as threading: the treadling copies the
    # threading.
    choose(page, "tf.copy-from-ez")
    treadling = bits(grid(page, "treadling", 8, 8))
    assert treadling == [[int(t == order[j] - 1) for t in range(8)]
                         for j in range(8)]
    assert woven(page, 8, 8) == bits(grid(page, "weave", 8, 8))


# ---------- Lancée weaves --------------------------------------------


def tabby_4x4_repeats(page):
    click_weave_cell(page, "weave", 0, 0)
    click_weave_cell(page, "weave", 1, 1)
    page.keyboard.press("F8")
    dialog(page).locator("#tx-rap-horz").fill("4")
    dialog(page).locator("#tx-rap-vert").fill("4")
    ok(page)
    assert bits(grid(page, "weave", 8, 8)) == [
        [int((i + j) % 2 == 0) for i in range(8)] for j in range(8)]


def lancee_ratio(page, *ratio):
    inputs = dialog(page).locator("#tx-vv-row input")
    for k, v in enumerate(ratio):
        inputs.nth(k).fill(str(v))
    ok(page)


def test_warp_lancee(alice_page):
    page = alice_page
    open_editor(page, "alice", make_weave_pattern("alice", "warplancee"))
    tabby_4x4_repeats(page)
    # Edit -> Lancée -> Warp lancée, one ground end per lancée end.
    choose(page, "edit.warp-lancee")
    lancee_ratio(page, 1, 1)
    weave = bits(grid(page, "weave", 16, 8))
    ground = [[row[2 * k] for k in range(8)] for row in weave]
    assert ground == [[int((i + j) % 2 == 0) for i in range(8)]
                      for j in range(8)]
    assert all(row[2 * k + 1] == 0 for row in weave for k in range(8))

    # Fill the lancée ends in range 2 (a float over four picks).
    page.keyboard.press("Shift+2")
    for k in range(1, 16, 2):
        for j in range(4):
            click_weave_cell(page, "weave", k, j)
    # Threading -> 2 choir: ground and lancée ends on separate shafts.
    choose(page, "ez.chorig-2")
    shafts = entering(page, 16)
    assert set(shafts[0::2]).isdisjoint(shafts[1::2])
    assert woven(page, 16, 8) == bits(grid(page, "weave", 16, 8))
    assert {v for row in grid(page, "weave", 16, 8) for v in row} \
        == {0, 1, 2}


def test_weft_lancee(alice_page):
    page = alice_page
    open_editor(page, "alice", make_weave_pattern("alice", "weftlancee"))
    tabby_4x4_repeats(page)
    # Weft lancée 2:1: two ground picks, then one lancée pick.
    choose(page, "edit.weft-lancee")
    lancee_ratio(page, 2, 1)
    weave = bits(grid(page, "weave", 8, 12))
    assert [sum(weave[j]) == 0 for j in range(12)] \
        == [False, False, True] * 4

    # Cursor movement left (Extras -> Cursor -> Movement), range 2,
    # fill the lancée pick point by point.
    # (The dialog toggles directions; "up" is on by default.)
    choose(page, "cursor.movement")
    dialog(page).locator("#tx-cd-left").click()
    dialog(page).locator("#tx-cd-up").click()
    ok(page)
    assert setting(page, "cursor_dir") == 2     # CD_LEFT
    page.keyboard.press("Shift+2")
    put_cursor(page, 5, 2)
    for _ in range(3):
        page.keyboard.press(" ")
    row = grid(page, "weave", 8, 3)[2]
    filled = [i for i, v in enumerate(row) if v]
    assert len(filled) == 3
    assert all(row[i] == 2 for i in filled)
    assert filled[-1] - filled[0] == 2
    x = page.evaluate("txEditor.cursor.x1")
    assert x in (filled[0] - 1, filled[-1] + 1)


# ---------- Colours --------------------------------------------------


def palette(page):
    return page.evaluate("txEditor.pattern.palette.map(c => [...c])")


def test_colours(alice_page):
    page = alice_page
    open_editor(page, "alice", make_weave_pattern("alice", "colours"))
    for j in range(4):
        for i in range(4):
            if twill22(4, 4)[j][i]:
                click_weave_cell(page, "weave", i, j)
    page.keyboard.press("Alt+2")
    assert setting(page, "style") == "color"
    page.keyboard.press("F8")
    dialog(page).locator("#tx-rap-horz").fill("2")
    dialog(page).locator("#tx-rap-vert").fill("2")
    ok(page)

    # Set warp colour / set weft colour (picked in the palette).
    page.keyboard.press("Control+f")
    pick_colour(page, 3)
    choose(page, "colors.set-warp")
    ok(page)
    pick_colour(page, 5)
    choose(page, "colors.set-weft")
    ok(page)
    warp = grid(page, "color_warp", 8, 1)[0]
    weft = [row[0] for row in grid(page, "color_weft", 1, 8)]
    assert set(warp) == {3}
    assert set(weft) == {5}

    # Paint single ends and picks in the colour bars.
    for k in range(0, 8, 2):
        click_weave_cell(page, "color_warp", k, 0)
    pick_colour(page, 3)
    for k in range(0, 8, 2):
        click_weave_cell(page, "color_weft", 0, k)
    warp = grid(page, "color_warp", 8, 1)[0]
    weft = [row[0] for row in grid(page, "color_weft", 1, 8)]
    assert warp == [5, 3] * 4
    assert weft == [3, 5] * 4

    # Color -> Color blending: a gradient between two palette entries.
    before = palette(page)
    choose(page, "colors.blend")
    dialog(page).locator("#tx-bl-steps").fill("5")
    dialog(page).locator("#tx-bl-pos").fill("20")
    ok(page)
    after = palette(page)
    changed = [k for k in range(len(after)) if after[k] != before[k]]
    assert changed
    assert min(changed) >= 19
    run = after[min(changed):max(changed) + 1]
    for ch in range(3):
        values = [c[ch] for c in run]
        assert values == sorted(values) or values == sorted(values)[::-1]

"""Server-side export of DB-WEAVE patterns to PNG, JPEG, SVG and PDF.

Direct port of desktop ``exportbitmap.cpp``. The desktop ``paintPattern``
helper draws onto a generic ``QPainter`` so the same code drives raster
and vector output; here we abstract over a small ``DrawTarget``
interface (defined in :mod:`exportcommon`) and provide concrete
backends for Pillow (PNG/JPEG), pure SVG, and reportlab (PDF).

The four core grids (einzug / aufknuepfung / trittfolge / gewebe) are
laid out exactly like the desktop (see exportbitmap.cpp:196-405):

    [einzug ............] [gap] [aufknuepfung ...]
    [..................] [...] [...............]
    [gewebe ............] [gap] [trittfolge .....]

Cells use a fixed 16-px logical base; ``warp_factor``/``weft_factor``
stretch one axis the same way :func:`patterncanvas.cpp::recomputeLayout`
does. Pattern extent is auto-detected from ``data_entering`` /
``data_treadling`` so empty rows/columns at the edges don't bloat the
output. PDF output places the rendered pattern at a natural physical
size (2.5 mm per cell); if the result wouldn't fit on the page it
shrinks proportionally to the printable area.
"""

from __future__ import annotations

import io
from dataclasses import dataclass

from textileplatform.exportcommon import (
    BLACK, GRID_LINE,
    DARST_FILLED, DARST_DOT, DARST_CROSS, DARST_CIRCLE,
    DARST_RISING, DARST_VDASH,
    DrawTarget, PILTarget, SVGTarget, PDFTarget, PDFTargetNoFlip,
    paint_cell as _paint_cell,
    page_size as _page_size,
    svg_document,
)

# Range colours. Keep in sync with the JS rangecolors["light"] table —
# exports are always rendered on a white background, so the dark-mode
# variant is irrelevant. Indices 0..12 mirror the in-app ranges.
RANGE_COLORS = [
    (255, 255, 255),  # 0 background
    (0, 0, 0),        # 1 black
    (50, 50, 255),    # 2 blue
    (128, 0, 0),      # 3 dark red
    (0, 140, 255),    # 4 light blue
    (56, 56, 56),     # 5 dark grey
    (0, 194, 78),     # 6 green
    (255, 123, 0),    # 7 orange
    (255, 210, 0),    # 8 yellow
    (0, 87, 0),       # 9 dark green
    (255, 255, 255),  # 10 aushebung — special, painted via symbol glyph
    (0xfb, 0xfb, 0x8e),  # 11 anbindung
    (0x72, 0xb4, 0x72),  # 12 abbindung
]

AUSHEBUNG = 10
ANBINDUNG = 11
ABBINDUNG = 12


# ---------- Header / footer token expansion ----------------------
#
# Direct port of dbweave's expandTokens (print.cpp). Recognises both
# English and German token names and the paren-wrapped form (e.g.
# ``(&Author)`` collapses to nothing when the author is empty).
#
# Default header matches dbweave's PAGE_HEADER_DEFAULT; default footer
# is empty.

DEFAULT_HEADER_TEXT = "DB-WEAVE - &Pattern (&Author)"
DEFAULT_FOOTER_TEXT = ""

_HEADER_TOKENS = [
    # Paren forms first so they win over the bare-name match.
    ("(&Pattern)",      "muster",   True),
    ("(&Muster)",       "muster",   True),
    ("(&File)",         "datei",    True),
    ("(&Datei)",        "datei",    True),
    ("(&Author)",       "autor",    True),
    ("(&Autor)",        "autor",    True),
    ("(&Autorin)",      "autor",    True),
    ("(&Organisation)", "org",      True),
    ("&Pattern",        "muster",   False),
    ("&Muster",         "muster",   False),
    ("&File",           "datei",    False),
    ("&Datei",          "datei",    False),
    ("&Author",         "autor",    False),
    ("&Autor",          "autor",    False),
    ("&Autorin",        "autor",    False),
    ("&Organisation",   "org",      False),
    ("&Page",           "seite",    False),
    ("&Seite",          "seite",    False),
]


def expand_header_tokens(text, data, pattern_label, page_idx, total_pages):
    """Substitute header/footer tokens. Mirrors dbweave's expandTokens
    + replacePattern: paren-wrapped tokens collapse to nothing when
    their value is empty; bare tokens are replaced verbatim. Tokens
    are matched anywhere in the string and all occurrences replaced
    (the desktop replaces only the first; the difference is only
    visible when the user repeats a token, which is rare)."""
    if not text:
        return ""
    values = {
        "muster": (pattern_label or "").strip(),
        "datei":  (pattern_label or "").strip(),
        "autor":  (data.get("author") or "").strip(),
        "org":    (data.get("organization") or "").strip(),
        "seite":  str(page_idx),
    }
    out = text
    for token, key, paren in _HEADER_TOKENS:
        if token not in out:
            continue
        v = values.get(key, "")
        if paren:
            replacement = f"({v})" if v else ""
        else:
            replacement = v
        out = out.replace(token, replacement)
    return out


# ---------- Layout / extent helpers ------------------------------

@dataclass
class Layout:
    gw: int
    gh: int
    dx: int   # warp count (used range)
    dy: int   # weft count (used range)
    shafts: int     # number of shaft rows shown (count, after clipping)
    treadles: int   # number of treadle columns shown (count, after clipping)
    width: int
    height: int
    kette_a: int
    schuesse_a: int
    shafts_a: int = 0     # 0-based index of the first shaft shown
    treadles_a: int = 0   # 0-based index of the first treadle shown


@dataclass
class Bands:
    """Geometry of the visible bands, mirroring the on-screen layout in
    dbweave.js (PatternView.layout). Bands the user has hidden collapse
    to zero and are not drawn, so the export reflects exactly what the
    editor shows. All offsets are in logical pixels.

        [warp colour bar ..] [.................]
        [..................] [.................]
        [einzug ...........] [gap] [aufknuepfung]
        [reed .............] [.................]
        [gewebe ...........] [gap] [trittfolge .] [gap] [weft colours]

    ``entering_at_bottom`` flips the vertical order (gewebe on top)."""
    width: int
    height: int
    # Column-group X origins (px). Main column starts at 0.
    side_x: int    # aufknuepfung / trittfolge / pegplan column
    weft_x: int    # weft colour bar column
    # Row-group Y origins (px).
    y_warpbar: int
    y_einzug: int
    y_reed: int
    y_gewebe: int
    # Visibility, derived from the display_* flags in ``data``.
    show_einzug: bool
    show_tieup: bool
    show_side: bool
    show_reed: bool
    show_warpbar: bool
    show_weftbar: bool
    pattern_only: bool


def _bands(data, layout: "Layout") -> "Bands":
    """Compute the visible-band geometry for ``data`` / ``layout``. This
    is the single source of truth for both the image extent
    (:func:`_pattern_layout`, :func:`print_pdf`) and the painter
    (:func:`paint_pattern`), so sizing and drawing can never disagree."""
    gw, gh = layout.gw, layout.gh
    dx, dy = layout.dx, layout.dy
    shafts, treadles = layout.shafts, layout.treadles

    entering = bool(data.get("display_entering", True))
    treadling = bool(data.get("display_treadling", True))
    pegplan = bool(data.get("display_pegplan"))
    side_on = pegplan or treadling

    show_einzug = entering and shafts > 0
    show_side = side_on and treadles > 0
    show_tieup = entering and side_on and shafts > 0 and treadles > 0
    show_reed = bool(data.get("display_reed", True)) and dx > 0
    show_warpbar = bool(data.get("display_colors_warp", True)) and dx > 0
    show_weftbar = bool(data.get("display_colors_weft", True)) and dy > 0
    pattern_only = bool(data.get("pattern_only"))
    einzugunten = bool(data.get("entering_at_bottom"))

    # Row groups, top to bottom (heights in cells), separated by one-cell
    # gaps like the pre-band layout's ``sdy``. ``gap_h`` separates the
    # threading (einzug) from the reed/fabric and is present only when
    # the threading is shown; ``reed_gap_h`` separates the reed from the
    # gewebe and is present only when the reed is shown. So the reed
    # floats between two gaps when visible, and when it is hidden the
    # pair collapses to a single einzug<->gewebe gap. ``warp_gap_h``
    # keeps the warp colour bar off the einzug — the legacy export
    # reserved two rows for the colour bar (``clry``, exportbitmap.cpp)
    # and the editor separates the panes by a PANE_GAP, so the bar never
    # sits flush against the threading.
    # einzugunten puts the gewebe on top and the threading below it.
    warp_h = 1 if show_warpbar else 0
    einz_h = shafts if show_einzug else 0
    reed_h = 1 if show_reed else 0
    gap_h = 1 if show_einzug else 0
    reed_gap_h = 1 if show_reed else 0
    warp_gap_h = 1 if show_warpbar else 0
    if einzugunten:
        order = (("gewebe", dy), ("_reedgap", reed_gap_h), ("reed", reed_h),
                 ("_gap", gap_h), ("einzug", einz_h),
                 ("_warpgap", warp_gap_h), ("warpbar", warp_h))
    else:
        order = (("warpbar", warp_h), ("_warpgap", warp_gap_h),
                 ("einzug", einz_h), ("_gap", gap_h),
                 ("reed", reed_h), ("_reedgap", reed_gap_h), ("gewebe", dy))
    y = {}
    cy = 0
    for name, h in order:
        y[name] = cy * gh
        cy += h
    total_rows = cy

    # Column groups: main (dx) | gap | side pane | gap | weft colour bar.
    # The first one-cell gap (the former ``tdx``) separates the
    # drawdown/threading from the treadling/tie-up and is present only
    # when the side pane is shown; the second keeps the weft colour bar
    # off the trittfolge, mirroring the legacy export's ``clrx`` and the
    # editor's PANE_GAP.
    side_w = treadles if show_side else 0
    weft_w = 1 if show_weftbar else 0
    gap_w = 1 if show_side else 0
    weft_gap_w = 1 if show_weftbar else 0
    side_x = (dx + gap_w) * gw
    weft_x = (dx + gap_w + side_w + weft_gap_w) * gw
    total_cols = dx + gap_w + side_w + weft_gap_w + weft_w

    width = gw * total_cols + 1
    height = gh * total_rows + 1
    if width < 2 or height < 2:
        width = max(width, 32)
        height = max(height, 32)

    return Bands(
        width=width, height=height,
        side_x=side_x, weft_x=weft_x,
        y_warpbar=y["warpbar"], y_einzug=y["einzug"],
        y_reed=y["reed"], y_gewebe=y["gewebe"],
        show_einzug=show_einzug, show_tieup=show_tieup, show_side=show_side,
        show_reed=show_reed, show_warpbar=show_warpbar,
        show_weftbar=show_weftbar, pattern_only=pattern_only,
    )


def _apply_ratio(base, warp_factor, weft_factor):
    """Same formula as patterncanvas.cpp::recomputeLayout: smaller-
    factor axis stays at base; larger-factor axis stretches by the
    ratio. Returns (gw, gh)."""
    gw = base
    gh = base
    if warp_factor > 0 and weft_factor > 0:
        if weft_factor > warp_factor:
            gh = int(base * weft_factor / warp_factor)
        elif warp_factor > weft_factor:
            gw = int(base * warp_factor / weft_factor)
    return gw, gh


def _pattern_layout(data, base=16):
    """Compute layout from a pattern dict. Mirrors
    exportbitmap.cpp::patternPixelSize."""
    width = int(data.get("width", 0))
    height = int(data.get("height", 0))
    max_treadles = int(data.get("max_treadles", 0))
    max_shafts = int(data.get("max_shafts", 0))
    entering = data.get("data_entering") or []
    treadling = data.get("data_treadling") or []

    # Active warp range (kette.a..kette.b) — first / last column with
    # a non-zero entering value.
    kette_a = 0
    kette_b = -1
    for i in range(width):
        if i < len(entering) and entering[i] != 0:
            if kette_b < 0:
                kette_a = i
            kette_b = i
    if kette_b < 0:
        kette_a, kette_b = 0, -1

    # Active weft range (schuesse.a..schuesse.b) — first / last row
    # with a non-zero treadling value.
    schuesse_a = 0
    schuesse_b = -1
    if max_treadles > 0 and treadling:
        for j in range(height):
            row_used = False
            for i in range(max_treadles):
                idx = i + j * max_treadles
                if idx < len(treadling) and treadling[idx] != 0:
                    row_used = True
                    break
            if row_used:
                if schuesse_b < 0:
                    schuesse_a = j
                schuesse_b = j

    # Highest-numbered shaft used.
    shafts = 0
    for i in range(kette_a, max(kette_a, kette_b + 1)):
        s = entering[i] if i < len(entering) else 0
        if s > shafts:
            shafts = s

    # Highest-numbered treadle used.
    treadles = 0
    if max_treadles > 0 and treadling:
        for j in range(schuesse_a, max(schuesse_a, schuesse_b + 1)):
            for i in range(max_treadles - 1, -1, -1):
                idx = i + j * max_treadles
                if idx < len(treadling) and treadling[idx] != 0:
                    if treadles < i + 1:
                        treadles = i + 1
                    break

    warp_factor = float(data.get("warp_factor") or 1.0)
    weft_factor = float(data.get("weft_factor") or 1.0)
    gw, gh = _apply_ratio(base, warp_factor, weft_factor)

    # Pegplan mode: the side strip shows pegplan (shafts × wefts)
    # instead of treadling (treadles × wefts), so its column count is
    # the number of shafts. Mirrors the editor's layout in dbweave.js
    # (sidePaneWidth = visible_shafts when display_pegplan).
    if bool(data.get("display_pegplan")):
        treadles = shafts
        # Recompute active weft range from data_pegplan rather than
        # treadling, since treadling is unused in pegplan mode.
        peg = data.get("data_pegplan") or []
        if max_shafts > 0 and peg:
            schuesse_a, schuesse_b = 0, -1
            for j in range(height):
                row_used = False
                for i in range(max_shafts):
                    idx = i + j * max_shafts
                    if idx < len(peg) and peg[idx] != 0:
                        row_used = True
                        break
                if row_used:
                    if schuesse_b < 0:
                        schuesse_a = j
                    schuesse_b = j

    dx = max(0, kette_b - kette_a + 1)
    dy = max(0, schuesse_b - schuesse_a + 1)
    layout = Layout(
        gw=gw, gh=gh, dx=dx, dy=dy,
        shafts=shafts, treadles=treadles,
        width=0, height=0,
        kette_a=kette_a, schuesse_a=schuesse_a,
    )
    b = _bands(data, layout)
    layout.width = b.width
    layout.height = b.height
    return layout


# ---------- Pattern painter ---------------------------------------

def _palette_color(data, idx):
    palette = data.get("palette") or []
    if 0 <= idx < len(palette):
        c = palette[idx]
        if isinstance(c, (list, tuple)) and len(c) >= 3:
            return (int(c[0]) & 0xFF, int(c[1]) & 0xFF, int(c[2]) & 0xFF)
    return BLACK


def _get_entering(data, i):
    arr = data.get("data_entering") or []
    return int(arr[i]) if 0 <= i < len(arr) else 0


def _get_tieup(data, i, j):
    arr = data.get("data_tieup") or []
    mt = int(data.get("max_treadles", 0))
    if mt <= 0:
        return 0
    idx = i + j * mt
    return int(arr[idx]) if 0 <= idx < len(arr) else 0


def _get_treadling(data, i, j):
    arr = data.get("data_treadling") or []
    mt = int(data.get("max_treadles", 0))
    if mt <= 0:
        return 0
    idx = i + j * mt
    return int(arr[idx]) if 0 <= idx < len(arr) else 0


def _get_pegplan(data, i, j):
    arr = data.get("data_pegplan") or []
    ms = int(data.get("max_shafts", 0))
    if ms <= 0:
        return 0
    idx = i + j * ms
    return int(arr[idx]) if 0 <= idx < len(arr) else 0


def _get_reed(data, i):
    arr = data.get("data_reed") or []
    return int(arr[i]) if 0 <= i < len(arr) else 0


def _is_empty_weft(data, j):
    """True when weft row ``j`` has no treadling (no pegplan cell, in
    pegplan mode) set at all. Port of legacy ``IsEmptyTrittfolge``:
    such rows weave nothing, so the fabric leaves them blank."""
    if bool(data.get("display_pegplan")):
        ms = int(data.get("max_shafts", 0))
        return not any(_get_pegplan(data, i, j) > 0 for i in range(ms))
    mt = int(data.get("max_treadles", 0))
    return not any(_get_treadling(data, i, j) > 0 for i in range(mt))


def _calc_weave(data, i, j):
    """Recompute weave[i,j] from entering+treadling+tieup. Direct
    port of _recalc_weave_from_treadling in dbweave.js. In pegplan
    mode the weave is derived from entering+pegplan instead, mirroring
    _recalc_weave_from_pegplan."""
    shaft = _get_entering(data, i)
    if shaft <= 0:
        return 0
    if bool(data.get("display_pegplan")):
        return _get_pegplan(data, shaft - 1, j)
    mt = int(data.get("max_treadles", 0))
    value = 0
    for k in range(mt):
        if _get_treadling(data, k, j) <= 0:
            continue
        v = _get_tieup(data, k, shaft - 1)
        if v > 0:
            value = v
    return value


def paint_pattern(t: DrawTarget, data, layout: Layout):
    """Render the four core grids onto ``t``. Direct port of
    ``paintPattern`` in exportbitmap.cpp:159-405."""
    gw, gh = layout.gw, layout.gh
    shafts, treadles = layout.shafts, layout.treadles
    shafts_a, treadles_a = layout.shafts_a, layout.treadles_a
    dx, dy = layout.dx, layout.dy

    rtl = bool(data.get("direction_righttoleft"))
    ttb = bool(data.get("direction_toptobottom"))
    pegplan = bool(data.get("display_pegplan"))

    # Which bands are visible and where they sit. This is the single
    # source of truth for the layout — hidden bands collapse to nothing,
    # so the export matches exactly what the editor shows.
    b = _bands(data, layout)
    einzug_y0 = b.y_einzug
    gewebe_y0 = b.y_gewebe

    ez_darst = data.get("entering_style", DARST_VDASH)
    au_darst = data.get("tieup_style", DARST_CROSS)
    tf_darst = data.get("treadling_style", DARST_DOT)
    sp_darst = data.get("pegplan_style", DARST_FILLED)
    aus_darst = data.get("aushebung_style", DARST_RISING)
    anb_darst = data.get("anbindung_style", DARST_CROSS)
    abb_darst = data.get("abbindung_style", DARST_CIRCLE)

    warp_colors = data.get("colors_warp") or [0]
    weft_colors = data.get("colors_weft") or [0]

    def _warp_col(i_abs):
        idx = (
            warp_colors[min(i_abs, len(warp_colors) - 1)]
            if warp_colors else 0
        )
        return _palette_color(data, idx)

    def _weft_col(j_abs):
        idx = (
            weft_colors[min(j_abs, len(weft_colors) - 1)]
            if weft_colors else 0
        )
        return _palette_color(data, idx)

    def _warp_x(i):
        return (dx - i - 1) * gw if rtl else i * gw

    def _hstrip_grid(y0):
        # Grid lines + outline for a one-row strip over the dx main
        # columns (shared by the warp colour bar and the reed strip).
        for i in range(dx + 1):
            t.line(i * gw, y0, i * gw, y0 + gh, GRID_LINE)
        t.line(0, y0, dx * gw, y0, GRID_LINE)
        t.line(0, y0 + gh, dx * gw, y0 + gh, GRID_LINE)
        t.stroke_rect(0, y0, dx * gw, gh, BLACK)

    # Warp colour bar — one row above (below, when einzugunten) the
    # threading, filled with each warp thread's colour.
    if b.show_warpbar:
        y0 = b.y_warpbar
        for i in range(dx):
            t.fill_tile(
                _warp_x(i), y0, gw, gh, _warp_col(layout.kette_a + i)
            )
        _hstrip_grid(y0)

    # Einzug — top-left in standard layout, bottom-left when einzugunten.
    if b.show_einzug:
        x0, y0 = 0, einzug_y0
        for i in range(dx + 1):
            t.line(x0 + i * gw, y0, x0 + i * gw, y0 + shafts * gh, GRID_LINE)
        for j in range(shafts + 1):
            t.line(x0, y0 + j * gh, x0 + dx * gw, y0 + j * gh, GRID_LINE)
        if not b.pattern_only:
            for i in range(dx):
                s = _get_entering(data, layout.kette_a + i)
                if s == 0:
                    continue
                # Clip to the visible shaft window
                # [shafts_a+1 .. shafts_a+shafts].
                s_rel = s - shafts_a
                if s_rel < 1 or s_rel > shafts:
                    continue
                x = _warp_x(i)
                y = (
                    y0 + (s_rel - 1) * gh if ttb
                    else y0 + (shafts - s_rel) * gh
                )
                _paint_cell(t, ez_darst, x, y, gw, gh, BLACK)
        t.stroke_rect(x0, y0, dx * gw, shafts * gh, BLACK)

    # Aufknuepfung — shares the einzug row group, in the side column. In
    # pegplan mode it shows the implicit diagonal (treadle i ↔ shaft i)
    # instead of the tie-up data.
    if b.show_tieup:
        x0 = b.side_x
        y0 = einzug_y0
        for i in range(treadles + 1):
            t.line(x0 + i * gw, y0, x0 + i * gw, y0 + shafts * gh, GRID_LINE)
        for j in range(shafts + 1):
            t.line(x0, y0 + j * gh, x0 + treadles * gw, y0 + j * gh, GRID_LINE)
        if pegplan:
            # The diagonal is grid decoration, not editable data, so it
            # is drawn even under pattern_only (mirrors dbweave.js).
            for k in range(min(treadles, shafts)):
                x = x0 + k * gw
                y = y0 + k * gh if ttb else y0 + (shafts - k - 1) * gh
                _paint_cell(t, DARST_FILLED, x, y, gw, gh, GRID_LINE)
        elif not b.pattern_only:
            for j in range(shafts):
                for i in range(treadles):
                    s = _get_tieup(data, i + treadles_a, j + shafts_a)
                    if s <= 0:
                        continue
                    x = x0 + i * gw
                    y = y0 + j * gh if ttb else y0 + (shafts - j - 1) * gh
                    if s == AUSHEBUNG:
                        _paint_cell(t, aus_darst, x, y, gw, gh, BLACK)
                    elif s == ANBINDUNG:
                        _paint_cell(t, anb_darst, x, y, gw, gh, BLACK)
                    elif s == ABBINDUNG:
                        _paint_cell(t, abb_darst, x, y, gw, gh, BLACK)
                    else:
                        col = RANGE_COLORS[s] if 1 <= s <= 9 else BLACK
                        _paint_cell(t, au_darst, x, y, gw, gh, col)
        t.stroke_rect(x0, y0, treadles * gw, shafts * gh, BLACK)

    # Reed (Blatteinzug) — one row above the gewebe; each warp column is
    # half-filled black (top half when threaded through the reed, else
    # bottom half). Mirrors GridViewReed.drawData in dbweave.js.
    if b.show_reed:
        y0 = b.y_reed
        half = gh // 2
        for i in range(dx):
            x = _warp_x(i)
            if _get_reed(data, layout.kette_a + i) > 0:
                t.fill_tile(x, y0, gw, half, BLACK)
            else:
                t.fill_tile(x, y0 + gh - half, gw, half, BLACK)
        _hstrip_grid(y0)

    # Trittfolge — shares the gewebe row group, in the side column.
    if b.show_side:
        x0 = b.side_x
        y0 = gewebe_y0
        for i in range(treadles + 1):
            t.line(x0 + i * gw, y0, x0 + i * gw, y0 + dy * gh, GRID_LINE)
        for j in range(dy + 1):
            t.line(x0, y0 + j * gh, x0 + treadles * gw, y0 + j * gh, GRID_LINE)
        darst = sp_darst if pegplan else tf_darst
        if not b.pattern_only:
            for j in range(dy):
                for i in range(treadles):
                    if pegplan:
                        s = _get_pegplan(
                            data, i + treadles_a, layout.schuesse_a + j)
                    else:
                        s = _get_treadling(
                            data, i + treadles_a, layout.schuesse_a + j)
                    if s <= 0:
                        continue
                    x = x0 + i * gw
                    y = y0 + (dy - j - 1) * gh
                    if pegplan and s == AUSHEBUNG:
                        _paint_cell(t, aus_darst, x, y, gw, gh, BLACK)
                    elif pegplan and s == ANBINDUNG:
                        _paint_cell(t, anb_darst, x, y, gw, gh, BLACK)
                    elif pegplan and s == ABBINDUNG:
                        _paint_cell(t, abb_darst, x, y, gw, gh, BLACK)
                    else:
                        col = RANGE_COLORS[s] if 1 <= s <= 9 else BLACK
                        _paint_cell(t, darst, x, y, gw, gh, col)
        t.stroke_rect(x0, y0, treadles * gw, dy * gh, BLACK)

    # Weft colour bar — one column right of the trittfolge (or the
    # gewebe, when the side pane is hidden), filled with each weft
    # thread's colour.
    if b.show_weftbar:
        x0 = b.weft_x
        y0 = gewebe_y0
        for j in range(dy):
            y = y0 + (dy - j - 1) * gh
            t.fill_tile(x0, y, gw, gh, _weft_col(layout.schuesse_a + j))
        for j in range(dy + 1):
            t.line(x0, y0 + j * gh, x0 + gw, y0 + j * gh, GRID_LINE)
        t.line(x0, y0, x0, y0 + dy * gh, GRID_LINE)
        t.line(x0 + gw, y0, x0 + gw, y0 + dy * gh, GRID_LINE)
        t.stroke_rect(x0, y0, gw, dy * gh, BLACK)

    # Gewebe — bottom-left in standard layout, top-left when einzugunten.
    x0, y0 = 0, gewebe_y0
    style = data.get("weave_style", "draft")
    sinking_shed = bool(data.get("sinking_shed"))

    # Farbeffekt and simulation fill their cells edge to edge, so a grid
    # underneath only survives as a stray seam between the threads and
    # breaks up the woven surface. The desktop suppresses the grid on
    # exactly those cells (patterncanvas.cpp: cells drawn by
    # DrawGewebeSimulation never get a grid overlay, DrawGewebeFarbeffekt
    # cells only with "Farbeffekt mit Raster"), while cells that stay
    # blank keep theirs. A cell is blank when its warp column carries no
    # threading or its weft row no treadling — legacy's IsEmptyEinzug /
    # IsEmptyTrittfolge.
    covering = style in ("color", "simulation")

    def _cell_x(i):
        return x0 + (dx - i - 1) * gw if rtl else x0 + i * gw

    if covering:
        blank_warp = [
            _get_entering(data, layout.kette_a + i) == 0 for i in range(dx)
        ]
        blank_weft = [
            _is_empty_weft(data, layout.schuesse_a + j) for j in range(dy)
        ]
        if any(blank_warp) or any(blank_weft):
            for i in range(dx):
                for j in range(dy):
                    if not (blank_warp[i] or blank_weft[j]):
                        continue
                    t.stroke_rect(
                        _cell_x(i), y0 + (dy - j - 1) * gh, gw, gh, GRID_LINE
                    )
    else:
        for i in range(dx + 1):
            t.line(x0 + i * gw, y0, x0 + i * gw, y0 + dy * gh, GRID_LINE)
        for j in range(dy + 1):
            t.line(x0, y0 + j * gh, x0 + dx * gw, y0 + j * gh, GRID_LINE)

    if style not in ("empty", "invisible"):
        # Patrone cells are drawn with a small margin so the grid stays
        # visible around them, matching the editor (bxf/byf = 0.15 in
        # dbweave.js) and the desktop's AUSGEFUELLT inset.
        bx = max(1, gw * 15 // 100)
        by = max(1, gh * 15 // 100)
        # The anbindung / abbindung background sits between the cell
        # border and its symbol, so it uses half the margin (bxf / 2 in
        # dbweave.js) and stays clear of the glyph drawn on top.
        hbx = max(1, bx // 2)
        hby = max(1, by // 2)
        for i in range(dx):
            for j in range(dy):
                i_abs = layout.kette_a + i
                j_abs = layout.schuesse_a + j
                if covering and (blank_warp[i] or blank_weft[j]):
                    continue
                s = _calc_weave(data, i_abs, j_abs)
                x = _cell_x(i)
                y = y0 + (dy - j - 1) * gh
                if style == "color":
                    # Farbeffekt: every cell filled edge-to-edge in
                    # warp colour ("hebung") or weft colour. Mirrors
                    # exportbitmap.cpp PrintGewebeFarbeffekt.
                    hebung = s > 0
                    if sinking_shed:
                        hebung = not hebung
                    col = _warp_col(i_abs) if hebung else _weft_col(j_abs)
                    t.fill_tile(x, y, gw, gh, col)
                    continue
                if style == "simulation":
                    # Simulated thread render: warp/weft on top with
                    # the other peeking out, plus a 1-px shadow line.
                    # Mirrors exportbitmap.cpp PrintGewebeSimulation.
                    hebung = s > 0 and s != ABBINDUNG
                    if sinking_shed:
                        hebung = not hebung
                    kc = _warp_col(i_abs)
                    sc = _weft_col(j_abs)
                    sw = max(1, gw // 5)
                    sh = max(1, gh // 5)
                    if hebung:
                        t.fill_tile(x + sw, y, gw - 2 * sw, gh, kc)
                        t.fill_tile(x, y + sh, sw, gh - 2 * sh, sc)
                        t.fill_tile(x + gw - sw, y + sh, sw, gh - 2 * sh, sc)
                        t.line(x + gw - sw, y + sh,
                               x + gw - sw, y + gh - sh, BLACK)
                    else:
                        t.fill_tile(x, y + sh, gw, gh - 2 * sh, sc)
                        t.fill_tile(x + sw, y, gw - 2 * sw, sh, kc)
                        t.fill_tile(x + sw, y + gh - sh, gw - 2 * sw, sh, kc)
                        t.line(x + sw, y + gh - sh,
                               x + gw - sw, y + gh - sh, BLACK)
                    continue
                # draft (default): symbol/range-coloured cells, inset
                # so neighbouring cells stay separated by the grid.
                if s <= 0:
                    continue
                if s == AUSHEBUNG and aus_darst != DARST_FILLED:
                    _paint_cell(t, aus_darst, x, y, gw, gh, BLACK)
                elif s == ANBINDUNG and anb_darst != DARST_FILLED:
                    t.fill_cell(x, y, gw, gh, hbx, hby,
                                RANGE_COLORS[ANBINDUNG])
                    _paint_cell(t, anb_darst, x, y, gw, gh, BLACK)
                elif s == ABBINDUNG and abb_darst != DARST_FILLED:
                    t.fill_cell(x, y, gw, gh, hbx, hby,
                                RANGE_COLORS[ABBINDUNG])
                    _paint_cell(t, abb_darst, x, y, gw, gh, BLACK)
                else:
                    col = RANGE_COLORS[s] if 1 <= s <= 12 else BLACK
                    t.fill_cell(x, y, gw, gh, bx, by, col)
    t.stroke_rect(x0, y0, dx * gw, dy * gh, BLACK)

    # ---- Rapport overlay --------------------------------------------
    # Mirrors the on-screen _drawRapport in dbweave.js: cells inside the
    # rapport (or outside, with inverse_repeat) are repainted as a red
    # patrone on white; vertical red boundary lines span the einzug
    # strip at the warp rapport edges; horizontal red lines span the
    # treadling/pegplan strip at the weft rapport edges.
    if data.get("display_repeat"):
        ka = int(data.get("rapport_k_a", 0))
        kb = int(data.get("rapport_k_b", -1))
        sa = int(data.get("rapport_s_a", 0))
        sb = int(data.get("rapport_s_b", -1))
        # The bounds are computed and persisted by the editor. Clamp them
        # to the drawn extent so a stale rapport (saved before the extent
        # of a pattern starting mid-grid was tracked correctly) cannot
        # place its boundary lines outside the pattern.
        ka = max(ka, layout.kette_a)
        kb = min(kb, layout.kette_a + dx - 1)
        sa = max(sa, layout.schuesse_a)
        sb = min(sb, layout.schuesse_a + dy - 1)
        if kb >= ka and sb >= sa:
            inv = bool(data.get("inverse_repeat"))
            red = (0xdd, 0, 0)
            # Gewebe overlay
            for i in range(dx):
                i_abs = layout.kette_a + i
                in_kette = (ka <= i_abs <= kb)
                for j in range(dy):
                    j_abs = layout.schuesse_a + j
                    in_rap = in_kette and (sa <= j_abs <= sb)
                    if (not in_rap) if inv else in_rap:
                        s = _calc_weave(data, i_abs, j_abs)
                        x = x0 + (dx - i - 1) * gw if rtl else x0 + i * gw
                        y = y0 + (dy - j - 1) * gh
                        # Clear cell (covers farbeffekt/simulation fill)
                        # then redraw cell edges in grid grey, then
                        # paint inset red patrone for warp-on-top cells.
                        t.fill_rect(x, y, gw, gh, (255, 255, 255))
                        t.stroke_rect(x, y, gw, gh, GRID_LINE)
                        if s > 0 and s != ABBINDUNG:
                            bx = max(1, gw * 15 // 100)
                            by = max(1, gh * 15 // 100)
                            t.fill_cell(x, y, gw, gh, bx, by, red)
            # Vertical boundary lines in einzug strip (only when shown).
            if b.show_einzug:
                ez_x_left = (ka - layout.kette_a) * gw if not rtl \
                    else (dx - (ka - layout.kette_a)) * gw
                ez_x_right = (kb + 1 - layout.kette_a) * gw if not rtl \
                    else (dx - (kb + 1 - layout.kette_a)) * gw
                ez_top = einzug_y0
                ez_bottom = einzug_y0 + shafts * gh
                t.line(ez_x_left, ez_top, ez_x_left, ez_bottom, red, width=2)
                t.line(ez_x_right, ez_top, ez_x_right, ez_bottom, red, width=2)
            # Horizontal boundary lines in trittfolge strip (only when shown).
            if b.show_side:
                tf_x_left = b.side_x
                tf_x_right = b.side_x + treadles * gw
                tf_y_top = (
                    gewebe_y0 + (dy - (sb + 1 - layout.schuesse_a)) * gh
                )
                tf_y_bottom = (
                    gewebe_y0 + (dy - (sa - layout.schuesse_a)) * gh
                )
                t.line(
                    tf_x_left, tf_y_top, tf_x_right, tf_y_top, red, width=2
                )
                t.line(
                    tf_x_left, tf_y_bottom, tf_x_right, tf_y_bottom, red,
                    width=2
                )
            # Re-stroke the gewebe outline so the red overlay doesn't
            # leave a gap where it covered the existing border.
            t.stroke_rect(x0, y0, dx * gw, dy * gh, BLACK)


# ---------- Raster (PNG / JPEG) ----------------------------------

def _export_raster(data, fmt: str, jpeg_quality=92):
    layout = _pattern_layout(data)
    target = PILTarget(layout.width, layout.height)
    paint_pattern(target, data, layout)
    buf = io.BytesIO()
    save_kwargs = {}
    if fmt.upper() == "JPEG":
        save_kwargs["quality"] = jpeg_quality
        save_kwargs["optimize"] = True
    target.img.save(buf, fmt.upper(), **save_kwargs)
    return buf.getvalue()


def export_png(data) -> bytes:
    return _export_raster(data, "PNG")


def export_jpeg(data) -> bytes:
    return _export_raster(data, "JPEG")


# ---------- SVG --------------------------------------------------

def export_svg(data) -> bytes:
    layout = _pattern_layout(data)
    target = SVGTarget(layout.width, layout.height)
    paint_pattern(target, data, layout)
    return svg_document(target)


# ---------- PDF (single-page) ------------------------------------

def export_pdf(data, title=None) -> bytes:
    """Single-page PDF. Cell size is fixed at 2.5 mm; if the rendered
    pattern is larger than the page's printable area it shrinks
    proportionally to fit. Mirrors exportbitmap.cpp::DoExportPdf."""
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import mm

    layout = _pattern_layout(data)
    page_w, page_h = _page_size()
    margin = 10 * mm
    paint_w = page_w - 2 * margin
    paint_h = page_h - 2 * margin

    # Natural size: 2.5 mm per (smaller-axis) cell. The non-equal axis
    # already reflects the warp/weft ratio in layout.gw/gh.
    mm_per_cell = 2.5
    base = min(layout.gw, layout.gh)
    pt_per_logical = (mm_per_cell / base) * mm
    natural_w = layout.width * pt_per_logical
    natural_h = layout.height * pt_per_logical
    scale = 1.0
    if natural_w > paint_w or natural_h > paint_h:
        scale = min(paint_w / natural_w, paint_h / natural_h)
    final_w = natural_w * scale
    final_h = natural_h * scale

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w, page_h))
    c.setCreator("textileplatform")
    if title:
        c.setTitle(title)

    c.saveState()
    c.translate(margin, page_h - margin - final_h)
    c.scale(final_w / layout.width, final_h / layout.height)
    target = PDFTarget(c, layout.width, layout.height)
    paint_pattern(target, data, layout)
    c.restoreState()
    c.showPage()
    c.save()
    return buf.getvalue()


# ---------- Print (multi-page tiled PDF) -------------------------

def print_pdf(data, title=None,
              warp_from=None, warp_to=None,
              weft_from=None, weft_to=None,
              harness_from=None, harness_to=None,
              treadle_from=None, treadle_to=None,
              cell_mm=2.5):
    """Multi-page PDF print of the pattern.

    Tiles the rendered pattern across as many A4 pages as needed at a
    fixed physical cell size (default 2.5 mm). Pages are laid out
    column-major (left-to-right, then top-to-bottom).

    ``warp_from`` / ``warp_to`` (1-based, inclusive) optionally clip
    the warp range; same for ``weft_from`` / ``weft_to`` on the weft
    axis, ``harness_from`` / ``harness_to`` on the shaft axis, and
    ``treadle_from`` / ``treadle_to`` on the treadle axis. When all
    are omitted the auto-detected pattern extent is used — matching
    desktop "Drucken" vs. "Teil drucken".
    """
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import mm

    layout = _pattern_layout(data)

    # Apply optional ranges by overriding kette_a/dx and schuesse_a/dy
    # on the layout. Convert from 1-based inclusive UI values to the
    # 0-based half-open view the painter uses.
    if warp_from is not None or warp_to is not None:
        a = (
            layout.kette_a if warp_from is None
            else max(0, int(warp_from) - 1)
        )
        b = (
            (layout.kette_a + layout.dx - 1) if warp_to is None
            else max(0, int(warp_to) - 1)
        )
        if b < a:
            a, b = b, a
        layout.kette_a = a
        layout.dx = b - a + 1
    if weft_from is not None or weft_to is not None:
        a = (
            layout.schuesse_a if weft_from is None
            else max(0, int(weft_from) - 1)
        )
        b = (
            (layout.schuesse_a + layout.dy - 1) if weft_to is None
            else max(0, int(weft_to) - 1)
        )
        if b < a:
            a, b = b, a
        layout.schuesse_a = a
        layout.dy = b - a + 1
    # Harness / treadle ranges. Sentinel (None, None) keeps the auto-
    # detected count; explicit values clip to that window. A value of
    # 0 in both fields is the desktop "skip section" marker — collapse
    # the strip to zero rows / columns.
    if harness_from is not None or harness_to is not None:
        if (harness_from == 0 and harness_to == 0):
            layout.shafts_a = 0
            layout.shafts = 0
        else:
            a = (
                layout.shafts_a if harness_from is None
                else max(0, int(harness_from) - 1)
            )
            b = (
                (layout.shafts_a + layout.shafts - 1) if harness_to is None
                else max(0, int(harness_to) - 1)
            )
            if b < a:
                a, b = b, a
            layout.shafts_a = a
            layout.shafts = b - a + 1
    if treadle_from is not None or treadle_to is not None:
        if (treadle_from == 0 and treadle_to == 0):
            layout.treadles_a = 0
            layout.treadles = 0
        else:
            a = (
                layout.treadles_a if treadle_from is None
                else max(0, int(treadle_from) - 1)
            )
            b = (
                (layout.treadles_a + layout.treadles - 1)
                if treadle_to is None
                else max(0, int(treadle_to) - 1)
            )
            if b < a:
                a, b = b, a
            layout.treadles_a = a
            layout.treadles = b - a + 1
    bands = _bands(data, layout)
    layout.width = bands.width
    layout.height = bands.height

    page_w, page_h = _page_size()
    margin = 10 * mm
    paint_w = page_w - 2 * margin
    paint_h = page_h - 2 * margin

    # Logical pixels → page points. min(gw, gh) maps to cell_mm; the
    # other axis stretches by the warp/weft ratio (already encoded in
    # gw vs. gh).
    base = max(1, min(layout.gw, layout.gh))
    pt_per_logical = (cell_mm / base) * mm
    total_pt_w = layout.width * pt_per_logical
    total_pt_h = layout.height * pt_per_logical

    # Number of pages along each axis. Always at least 1.
    cols = max(1, int(-(-total_pt_w // paint_w)))   # ceil-div
    rows = max(1, int(-(-total_pt_h // paint_h)))

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w, page_h))
    c.setCreator("textileplatform")
    if title:
        c.setTitle(title)

    # Header / footer text, with dbweave-style token expansion.
    # Defaults mirror dbweave's PAGE_HEADER_DEFAULT.
    header_tpl = data.get("header_text")
    if header_tpl is None:
        header_tpl = DEFAULT_HEADER_TEXT
    footer_tpl = data.get("footer_text") or ""
    total_pages = cols * rows

    for row in range(rows):
        for col in range(cols):
            # Page (col, row): clip the painter's logical-coord output
            # to the [page_x, page_x+paint_w) × [page_y, page_y+paint_h)
            # slice of the full pattern (in PDF points, top-left origin).
            page_x_pt = col * paint_w
            page_y_pt = row * paint_h
            c.saveState()
            c.setFont("Helvetica", 8)
            c.setFillColorRGB(0, 0, 0)
            page_idx = col + 1 + row * cols
            header = expand_header_tokens(
                header_tpl, data, title, page_idx, total_pages,
            )
            footer = expand_header_tokens(
                footer_tpl, data, title, page_idx, total_pages,
            )
            if header:
                c.drawString(margin, page_h - margin / 2, header)
            if total_pages > 1:
                page_str = f"{page_idx} / {total_pages}"
                c.drawRightString(
                    page_w - margin, page_h - margin / 2, page_str
                )
            if footer:
                c.drawString(margin, margin / 2, footer)
            p = c.beginPath()
            p.rect(margin, margin, paint_w, paint_h)
            c.clipPath(p, stroke=0, fill=0)
            c.translate(margin - page_x_pt, page_h - margin + page_y_pt)
            c.scale(pt_per_logical, -pt_per_logical)
            target = PDFTargetNoFlip(c)
            paint_pattern(target, data, layout)
            c.restoreState()
            c.showPage()
    c.save()
    return buf.getvalue()

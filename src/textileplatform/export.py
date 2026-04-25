"""Server-side export of DB-WEAVE patterns to PNG, JPEG, SVG and PDF.

Direct port of desktop ``exportbitmap.cpp``. The desktop ``paintPattern``
helper draws onto a generic ``QPainter`` so the same code drives raster
and vector output; here we abstract over a small ``DrawTarget``
interface and provide concrete backends for Pillow (PNG/JPEG), pure
SVG, and reportlab (PDF).

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
from typing import Callable, Tuple

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

GRID_LINE = (105, 105, 105)
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)

AUSHEBUNG = 10
ANBINDUNG = 11
ABBINDUNG = 12

# Symbol darstellung names — same keys the JS uses on settings.
DARST_FILLED = "filled"
DARST_DOT    = "dot"
DARST_CROSS  = "cross"
DARST_CIRCLE = "circle"
DARST_RISING = "rising"
DARST_FALLING = "falling"
DARST_VDASH  = "vdash"
DARST_DASH   = "dash"
DARST_HDASH  = "hdash"
DARST_PLUS   = "plus"
DARST_SMALLCROSS  = "smallcross"
DARST_SMALLCIRCLE = "smallcircle"
DARST_NUMBER = "number"


# ---------- Drawing target abstraction -----------------------------

class DrawTarget:
    """Minimal painter interface — fill_rect / stroke_rect / line /
    ellipse / text. All coordinates in logical pixels (16 px = one
    cell at unit ratio). Backends translate to their native units."""

    def fill_rect(self, x, y, w, h, color):
        raise NotImplementedError

    def stroke_rect(self, x, y, w, h, color, width=1):
        raise NotImplementedError

    def line(self, x1, y1, x2, y2, color, width=1):
        raise NotImplementedError

    def ellipse_filled(self, cx, cy, rx, ry, color):
        raise NotImplementedError

    def ellipse_outlined(self, cx, cy, rx, ry, color, width=1):
        raise NotImplementedError

    def text_centered(self, x, y, w, h, text, color):
        raise NotImplementedError


# ---------- Cell painters -----------------------------------------

def _paint_cell(t: DrawTarget, darst, x, y, gw, gh, color):
    """Render one cell in the requested darstellung. AUSGEFUELLT fills
    the full footprint (so neighbouring filled cells merge); the symbol
    variants leave the background untouched. Direct port of the
    paintExportCell lambda in exportbitmap.cpp:189-196."""
    if darst == DARST_FILLED:
        t.fill_rect(x, y, gw, gh, color)
        return
    # Compute inset for symbols. Mirrors the bxf=byf=0.15 frame
    # the JS painters use.
    bx = max(1, gw * 15 // 100)
    by = max(1, gh * 15 // 100)
    if darst == DARST_DOT:
        rx = max(1, (gw - 2 * bx) // 4)
        ry = max(1, (gh - 2 * by) // 4)
        t.ellipse_filled(x + gw // 2, y + gh // 2, rx, ry, color)
    elif darst == DARST_CIRCLE:
        rx = max(1, (gw - 2 * bx) // 2)
        ry = max(1, (gh - 2 * by) // 2)
        t.ellipse_outlined(x + gw // 2, y + gh // 2, rx, ry, color, width=1)
    elif darst == DARST_CROSS:
        t.line(x + bx, y + by, x + gw - bx, y + gh - by, color, width=1)
        t.line(x + bx, y + gh - by, x + gw - bx, y + by, color, width=1)
    elif darst == DARST_RISING:
        t.line(x + bx, y + gh - by, x + gw - bx, y + by, color, width=1)
    elif darst == DARST_FALLING:
        t.line(x + bx, y + by, x + gw - bx, y + gh - by, color, width=1)
    elif darst in (DARST_VDASH, DARST_DASH):
        # Vertical dash: thin rectangle centred horizontally.
        w = max(1, gw // 5)
        t.fill_rect(x + (gw - w) // 2, y + by, w, gh - 2 * by, color)
    elif darst == DARST_HDASH:
        h = max(1, gh // 5)
        t.fill_rect(x + bx, y + (gh - h) // 2, gw - 2 * bx, h, color)
    elif darst == DARST_PLUS:
        t.line(x + gw // 2, y + by, x + gw // 2, y + gh - by, color, width=1)
        t.line(x + bx, y + gh // 2, x + gw - bx, y + gh // 2, color, width=1)
    elif darst == DARST_SMALLCROSS:
        rx = max(1, (gw - 2 * bx) // 4)
        ry = max(1, (gh - 2 * by) // 4)
        cx, cy = x + gw // 2, y + gh // 2
        t.line(cx - rx, cy - ry, cx + rx, cy + ry, color, width=1)
        t.line(cx - rx, cy + ry, cx + rx, cy - ry, color, width=1)
    elif darst == DARST_SMALLCIRCLE:
        rx = max(1, (gw - 2 * bx) // 4)
        ry = max(1, (gh - 2 * by) // 4)
        t.ellipse_outlined(x + gw // 2, y + gh // 2, rx, ry, color, width=1)
    elif darst == DARST_NUMBER:
        t.text_centered(x, y, gw, gh, "1", color)
    else:
        # Unknown — fall back to filled.
        t.fill_rect(x, y, gw, gh, color)


# ---------- Layout / extent helpers ------------------------------

@dataclass
class Layout:
    gw: int
    gh: int
    dx: int   # warp count (used range)
    dy: int   # weft count (used range)
    shafts: int
    treadles: int
    width: int
    height: int
    kette_a: int
    schuesse_a: int


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

    sdy = 1 if shafts != 0 else 0
    tdx = 1 if treadles != 0 else 0
    dx = max(0, kette_b - kette_a + 1)
    dy = max(0, schuesse_b - schuesse_a + 1)
    img_w = gw * (dx + tdx + treadles) + 1
    img_h = gh * (dy + sdy + shafts) + 1
    if img_w < 2 or img_h < 2:
        img_w = max(img_w, 32)
        img_h = max(img_h, 32)

    return Layout(
        gw=gw, gh=gh, dx=dx, dy=dy,
        shafts=shafts, treadles=treadles,
        width=img_w, height=img_h,
        kette_a=kette_a, schuesse_a=schuesse_a,
    )


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


def _calc_weave(data, i, j):
    """Recompute weave[i,j] from entering+treadling+tieup. Direct
    port of _recalc_weave_from_treadling in dbweave.js."""
    shaft = _get_entering(data, i)
    if shaft <= 0:
        return 0
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
    dx, dy = layout.dx, layout.dy
    sdy = 1 if shafts != 0 else 0
    tdx = 1 if treadles != 0 else 0

    rtl = bool(data.get("direction_righttoleft"))
    ttb = bool(data.get("direction_toptobottom"))
    pegplan = bool(data.get("display_pegplan"))
    einzugunten = bool(data.get("entering_at_bottom"))

    # Block Y origins. Standard layout puts einzug / aufknuepfung at
    # the top and gewebe / trittfolge below them; einzugunten swaps the
    # two pairs. Direct port of exportbitmap.cpp:178-185.
    einzug_y0 = (dy + sdy) * gh if einzugunten else 0
    gewebe_y0 = 0 if einzugunten else (shafts + sdy) * gh
    auf_y0    = einzug_y0
    tritt_y0  = gewebe_y0

    ez_darst = data.get("entering_style", DARST_VDASH)
    au_darst = data.get("tieup_style", DARST_CROSS)
    tf_darst = data.get("treadling_style", DARST_DOT)
    sp_darst = data.get("pegplan_style", DARST_FILLED)
    aus_darst = data.get("aushebung_style", DARST_RISING)
    anb_darst = data.get("anbindung_style", DARST_CROSS)
    abb_darst = data.get("abbindung_style", DARST_CIRCLE)

    # Einzug — top-left in standard layout, bottom-left when einzugunten.
    if shafts != 0:
        x0, y0 = 0, einzug_y0
        for i in range(dx + 1):
            t.line(x0 + i * gw, y0, x0 + i * gw, y0 + shafts * gh, GRID_LINE)
        for j in range(shafts + 1):
            t.line(x0, y0 + j * gh, x0 + dx * gw, y0 + j * gh, GRID_LINE)
        for i in range(dx):
            s = _get_entering(data, layout.kette_a + i)
            if s == 0:
                continue
            x = x0 + (dx - i - 1) * gw if rtl else x0 + i * gw
            y = y0 + (s - 1) * gh if ttb else y0 + (shafts - s) * gh
            _paint_cell(t, ez_darst, x, y, gw, gh, BLACK)
        t.stroke_rect(x0, y0, dx * gw, shafts * gh, BLACK)

    # Aufknuepfung — top-right in standard layout, bottom-right when
    # einzugunten.
    if treadles != 0 and shafts != 0:
        x0 = (dx + tdx) * gw
        y0 = auf_y0
        for i in range(treadles + 1):
            t.line(x0 + i * gw, y0, x0 + i * gw, y0 + shafts * gh, GRID_LINE)
        for j in range(shafts + 1):
            t.line(x0, y0 + j * gh, x0 + treadles * gw, y0 + j * gh, GRID_LINE)
        darst = DARST_FILLED if pegplan else au_darst
        for j in range(shafts):
            for i in range(treadles):
                s = _get_tieup(data, i, j)
                if s <= 0:
                    continue
                x = x0 + i * gw
                y = y0 + j * gh if ttb else y0 + (shafts - j - 1) * gh
                if not pegplan and s == AUSHEBUNG:
                    _paint_cell(t, aus_darst, x, y, gw, gh, BLACK)
                elif not pegplan and s == ANBINDUNG:
                    _paint_cell(t, anb_darst, x, y, gw, gh, BLACK)
                elif not pegplan and s == ABBINDUNG:
                    _paint_cell(t, abb_darst, x, y, gw, gh, BLACK)
                else:
                    col = RANGE_COLORS[s] if 1 <= s <= 9 else BLACK
                    _paint_cell(t, darst, x, y, gw, gh, col)
        t.stroke_rect(x0, y0, treadles * gw, shafts * gh, BLACK)

    # Trittfolge — bottom-right in standard layout, top-right when
    # einzugunten.
    if treadles != 0:
        x0 = (dx + tdx) * gw
        y0 = tritt_y0
        for i in range(treadles + 1):
            t.line(x0 + i * gw, y0, x0 + i * gw, y0 + dy * gh, GRID_LINE)
        for j in range(dy + 1):
            t.line(x0, y0 + j * gh, x0 + treadles * gw, y0 + j * gh, GRID_LINE)
        darst = sp_darst if pegplan else tf_darst
        for j in range(dy):
            for i in range(treadles):
                s = _get_treadling(data, i, layout.schuesse_a + j)
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

    # Gewebe — bottom-left in standard layout, top-left when einzugunten.
    x0, y0 = 0, gewebe_y0
    for i in range(dx + 1):
        t.line(x0 + i * gw, y0, x0 + i * gw, y0 + dy * gh, GRID_LINE)
    for j in range(dy + 1):
        t.line(x0, y0 + j * gh, x0 + dx * gw, y0 + j * gh, GRID_LINE)
    style = data.get("weave_style", "draft")
    if style != "empty" and style != "invisible":
        for i in range(dx):
            for j in range(dy):
                s = _calc_weave(data, layout.kette_a + i, layout.schuesse_a + j)
                if s <= 0:
                    continue
                x = x0 + (dx - i - 1) * gw if rtl else x0 + i * gw
                y = y0 + (dy - j - 1) * gh
                if style == "color":
                    # Farbeffekt: cell coloured from kettfarben if "up",
                    # schussfarben if "down". s>0 means warp on top.
                    is_up = s > 0 and s != ABBINDUNG
                    if is_up:
                        col = _palette_color(data, (data.get("colors_warp") or [0])[
                            min(layout.kette_a + i, len(data.get("colors_warp") or []) - 1)])
                    else:
                        col = _palette_color(data, (data.get("colors_weft") or [0])[
                            min(layout.schuesse_a + j, len(data.get("colors_weft") or []) - 1)])
                    t.fill_rect(x, y, gw, gh, col)
                elif s == AUSHEBUNG and aus_darst != DARST_FILLED:
                    _paint_cell(t, aus_darst, x, y, gw, gh, BLACK)
                elif s == ANBINDUNG and anb_darst != DARST_FILLED:
                    t.fill_rect(x, y, gw, gh, RANGE_COLORS[ANBINDUNG])
                    _paint_cell(t, anb_darst, x, y, gw, gh, BLACK)
                elif s == ABBINDUNG and abb_darst != DARST_FILLED:
                    t.fill_rect(x, y, gw, gh, RANGE_COLORS[ABBINDUNG])
                    _paint_cell(t, abb_darst, x, y, gw, gh, BLACK)
                else:
                    col = RANGE_COLORS[s] if 1 <= s <= 12 else BLACK
                    t.fill_rect(x, y, gw, gh, col)
    t.stroke_rect(x0, y0, dx * gw, dy * gh, BLACK)


# ---------- Pillow backend (PNG / JPEG) ---------------------------

class _PILTarget(DrawTarget):
    def __init__(self, w, h):
        from PIL import Image, ImageDraw
        self.img = Image.new("RGB", (w, h), WHITE)
        self.draw = ImageDraw.Draw(self.img)

    def fill_rect(self, x, y, w, h, color):
        self.draw.rectangle([x, y, x + w - 1, y + h - 1], fill=color)

    def stroke_rect(self, x, y, w, h, color, width=1):
        self.draw.rectangle([x, y, x + w, y + h], outline=color, width=width)

    def line(self, x1, y1, x2, y2, color, width=1):
        self.draw.line([x1, y1, x2, y2], fill=color, width=width)

    def ellipse_filled(self, cx, cy, rx, ry, color):
        self.draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=color)

    def ellipse_outlined(self, cx, cy, rx, ry, color, width=1):
        self.draw.ellipse(
            [cx - rx, cy - ry, cx + rx, cy + ry],
            outline=color, width=width,
        )

    def text_centered(self, x, y, w, h, text, color):
        # Tiny text using PIL's default font.
        try:
            bbox = self.draw.textbbox((0, 0), text)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        except Exception:
            tw, th = 6, 8
        self.draw.text((x + (w - tw) // 2, y + (h - th) // 2), text, fill=color)


def _export_raster(data, fmt: str, jpeg_quality=92):
    layout = _pattern_layout(data)
    target = _PILTarget(layout.width, layout.height)
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


# ---------- SVG backend -------------------------------------------

class _SVGTarget(DrawTarget):
    def __init__(self, w, h):
        self.w = w
        self.h = h
        self.parts = []

    def _color(self, color):
        return f"#{color[0]:02x}{color[1]:02x}{color[2]:02x}"

    def fill_rect(self, x, y, w, h, color):
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" '
            f'fill="{self._color(color)}" stroke="none"/>'
        )

    def stroke_rect(self, x, y, w, h, color, width=1):
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" '
            f'fill="none" stroke="{self._color(color)}" stroke-width="{width}"/>'
        )

    def line(self, x1, y1, x2, y2, color, width=1):
        self.parts.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
            f'stroke="{self._color(color)}" stroke-width="{width}"/>'
        )

    def ellipse_filled(self, cx, cy, rx, ry, color):
        self.parts.append(
            f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" '
            f'fill="{self._color(color)}" stroke="none"/>'
        )

    def ellipse_outlined(self, cx, cy, rx, ry, color, width=1):
        self.parts.append(
            f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" '
            f'fill="none" stroke="{self._color(color)}" stroke-width="{width}"/>'
        )

    def text_centered(self, x, y, w, h, text, color):
        self.parts.append(
            f'<text x="{x + w // 2}" y="{y + h - 2}" '
            f'text-anchor="middle" font-family="sans-serif" '
            f'font-size="{max(6, h - 4)}" fill="{self._color(color)}">{text}</text>'
        )


def export_svg(data) -> bytes:
    layout = _pattern_layout(data)
    target = _SVGTarget(layout.width, layout.height)
    paint_pattern(target, data, layout)
    body = "".join(target.parts)
    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{layout.width}" height="{layout.height}" '
        f'viewBox="0 0 {layout.width} {layout.height}">'
        f'<rect width="100%" height="100%" fill="#ffffff"/>'
        f'{body}</svg>'
    )
    return svg.encode("utf-8")


# ---------- reportlab backend (PDF) -------------------------------

class _PDFTarget(DrawTarget):
    """Logical-pixel painter that writes to a reportlab Canvas. The
    caller sets up the Canvas's coordinate system so that one logical
    px == one PDF point's worth of scaled space; this class just emits
    primitives. Y-axis is flipped internally so callers can use the
    top-left origin convention used everywhere else."""

    def __init__(self, c, w, h):
        self.c = c
        self.h = h  # for Y-flip
        self.w = w

    def _y(self, y):
        return self.h - y

    def _set_color(self, color, fill=False):
        r, g, b = color
        if fill:
            self.c.setFillColorRGB(r / 255.0, g / 255.0, b / 255.0)
        else:
            self.c.setStrokeColorRGB(r / 255.0, g / 255.0, b / 255.0)

    def fill_rect(self, x, y, w, h, color):
        self._set_color(color, fill=True)
        self.c.rect(x, self._y(y + h), w, h, stroke=0, fill=1)

    def stroke_rect(self, x, y, w, h, color, width=1):
        self._set_color(color, fill=False)
        self.c.setLineWidth(width)
        self.c.rect(x, self._y(y + h), w, h, stroke=1, fill=0)

    def line(self, x1, y1, x2, y2, color, width=1):
        self._set_color(color, fill=False)
        self.c.setLineWidth(width)
        self.c.line(x1, self._y(y1), x2, self._y(y2))

    def ellipse_filled(self, cx, cy, rx, ry, color):
        self._set_color(color, fill=True)
        self.c.ellipse(cx - rx, self._y(cy + ry), cx + rx, self._y(cy - ry),
                       stroke=0, fill=1)

    def ellipse_outlined(self, cx, cy, rx, ry, color, width=1):
        self._set_color(color, fill=False)
        self.c.setLineWidth(width)
        self.c.ellipse(cx - rx, self._y(cy + ry), cx + rx, self._y(cy - ry),
                       stroke=1, fill=0)

    def text_centered(self, x, y, w, h, text, color):
        self._set_color(color, fill=True)
        size = max(4, h - 4)
        self.c.setFont("Helvetica", size)
        self.c.drawCentredString(x + w / 2, self._y(y + h - 2), text)


# Page-size selection: PAPERSIZE env, then locale-default. For the
# web port a fixed A4 default is fine — most users in central Europe.
def _page_size():
    from reportlab.lib.pagesizes import A4, LETTER
    import os
    env = os.environ.get("PAPERSIZE", "").strip().lower()
    if env in ("letter", "us-letter"):
        return LETTER
    return A4


# ---------- Print (multi-page tiled PDF) -------------------------

def print_pdf(data, title=None,
              warp_from=None, warp_to=None,
              weft_from=None, weft_to=None,
              cell_mm=2.5):
    """Multi-page PDF print of the pattern.

    Tiles the rendered pattern across as many A4 pages as needed at a
    fixed physical cell size (default 2.5 mm). Pages are laid out
    column-major (left-to-right, then top-to-bottom).

    ``warp_from`` / ``warp_to`` (1-based, inclusive) optionally clip
    the warp range; same for ``weft_from`` / ``weft_to`` on the weft
    axis. When omitted the auto-detected pattern extent is used —
    matching desktop "Drucken" vs. "Teil drucken".
    """
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import mm

    layout = _pattern_layout(data)

    # Apply optional ranges by overriding kette_a/dx and schuesse_a/dy
    # on the layout. Convert from 1-based inclusive UI values to the
    # 0-based half-open view the painter uses.
    if warp_from is not None or warp_to is not None:
        a = layout.kette_a if warp_from is None else max(0, int(warp_from) - 1)
        b = (layout.kette_a + layout.dx - 1) if warp_to is None else max(0, int(warp_to) - 1)
        if b < a:
            a, b = b, a
        layout.kette_a = a
        layout.dx = b - a + 1
    if weft_from is not None or weft_to is not None:
        a = layout.schuesse_a if weft_from is None else max(0, int(weft_from) - 1)
        b = (layout.schuesse_a + layout.dy - 1) if weft_to is None else max(0, int(weft_to) - 1)
        if b < a:
            a, b = b, a
        layout.schuesse_a = a
        layout.dy = b - a + 1
    sdy = 1 if layout.shafts != 0 else 0
    tdx = 1 if layout.treadles != 0 else 0
    layout.width  = layout.gw * (layout.dx + tdx + layout.treadles) + 1
    layout.height = layout.gh * (layout.dy + sdy + layout.shafts) + 1

    page_w, page_h = _page_size()
    margin = 10 * mm
    paint_w = page_w - 2 * margin
    paint_h = page_h - 2 * margin

    # Logical pixels → page points. min(gw, gh) maps to cell_mm; the
    # other axis stretches by the warp/weft ratio (already encoded in
    # gw vs. gh).
    base = max(1, min(layout.gw, layout.gh))
    pt_per_logical = (cell_mm / base) * mm
    total_pt_w = layout.width  * pt_per_logical
    total_pt_h = layout.height * pt_per_logical

    # Number of pages along each axis. Always at least 1.
    cols = max(1, int(-(-total_pt_w // paint_w)))   # ceil-div
    rows = max(1, int(-(-total_pt_h // paint_h)))

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w, page_h))
    c.setCreator("textileplatform")
    if title:
        c.setTitle(title)

    for row in range(rows):
        for col in range(cols):
            # Page (col, row): clip the painter's logical-coord output
            # to the [page_x, page_x+paint_w) × [page_y, page_y+paint_h)
            # slice of the full pattern (in PDF points, top-left origin).
            page_x_pt = col * paint_w
            page_y_pt = row * paint_h
            c.saveState()
            # Optional: page header — pattern title + page index. Kept
            # minimal so it doesn't eat into the printable area.
            if title and (cols * rows) > 1:
                c.setFont("Helvetica", 8)
                c.setFillColorRGB(0, 0, 0)
                hdr = f"{title}    {col + 1 + row * cols} / {cols * rows}"
                c.drawString(margin, page_h - margin / 2, hdr)
            # Clip to the printable rectangle (margin .. margin + paint).
            p = c.beginPath()
            p.rect(margin, margin, paint_w, paint_h)
            c.clipPath(p, stroke=0, fill=0)
            # Translate so the (page_x_pt, page_y_pt) tile origin lands
            # on the top-left of the printable area, then scale logical
            # → points so the painter's coordinates draw at the right
            # position. The DrawTarget flips Y internally, so we use a
            # top-left origin: PDF y_top = page_h - margin.
            c.translate(margin - page_x_pt, page_h - margin + page_y_pt)
            c.scale(pt_per_logical, -pt_per_logical)
            target = _PDFTargetNoFlip(c)
            paint_pattern(target, data, layout)
            c.restoreState()
            c.showPage()
    c.save()
    return buf.getvalue()


class _PDFTargetNoFlip(DrawTarget):
    """PDF backend used when the canvas has already been transformed
    so that one logical px = one unit and the Y axis is flipped via
    a negative scale. Lets us draw with top-left origin without the
    per-call Y flip _PDFTarget does."""

    def __init__(self, c):
        self.c = c

    def _set_color(self, color, fill=False):
        r, g, b = color
        if fill:
            self.c.setFillColorRGB(r / 255.0, g / 255.0, b / 255.0)
        else:
            self.c.setStrokeColorRGB(r / 255.0, g / 255.0, b / 255.0)

    def fill_rect(self, x, y, w, h, color):
        self._set_color(color, fill=True)
        self.c.rect(x, y, w, h, stroke=0, fill=1)

    def stroke_rect(self, x, y, w, h, color, width=1):
        self._set_color(color, fill=False)
        self.c.setLineWidth(width)
        self.c.rect(x, y, w, h, stroke=1, fill=0)

    def line(self, x1, y1, x2, y2, color, width=1):
        self._set_color(color, fill=False)
        self.c.setLineWidth(width)
        self.c.line(x1, y1, x2, y2)

    def ellipse_filled(self, cx, cy, rx, ry, color):
        self._set_color(color, fill=True)
        self.c.ellipse(cx - rx, cy - ry, cx + rx, cy + ry, stroke=0, fill=1)

    def ellipse_outlined(self, cx, cy, rx, ry, color, width=1):
        self._set_color(color, fill=False)
        self.c.setLineWidth(width)
        self.c.ellipse(cx - rx, cy - ry, cx + rx, cy + ry, stroke=1, fill=0)

    def text_centered(self, x, y, w, h, text, color):
        self._set_color(color, fill=True)
        size = max(4, h - 4)
        # Y is flipped via negative scale; flip back locally so text
        # draws right-side up.
        self.c.saveState()
        self.c.scale(1, -1)
        self.c.setFont("Helvetica", size)
        self.c.drawCentredString(x + w / 2, -(y + h - 2), text)
        self.c.restoreState()


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

    # Translate to top-left of pattern area (margin), then scale logical
    # coordinates into PDF points. The DrawTarget exposes a top-left
    # origin and flips Y internally; we set up the Canvas matrix to
    # match.
    c.saveState()
    c.translate(margin, page_h - margin - final_h)
    c.scale(final_w / layout.width, final_h / layout.height)
    target = _PDFTarget(c, layout.width, layout.height)
    paint_pattern(target, data, layout)
    c.restoreState()
    c.showPage()
    c.save()
    return buf.getvalue()

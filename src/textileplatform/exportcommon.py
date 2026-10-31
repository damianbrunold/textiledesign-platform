"""Drawing primitives shared by the weave (`export.py`) and bead
(`beadexport.py`) exporters.

Originally these classes lived in ``export.py`` next to the weave
painter; they were split out so the bead exporter can share the same
Pillow / SVG / reportlab back-ends without circular imports.
"""

from __future__ import annotations

import os
import re
from xml.sax.saxutils import escape as xml_escape

_FONT_DIR = os.path.join(os.path.dirname(__file__), "static", "fonts")

# Text fonts for PDF (and non-Latin-1 raster) output, all bundled; each
# character is drawn with the first font that has a glyph for it.
TEXT_FONTS = (
    # Latin, Greek, Cyrillic — the site's web font (SIL OFL).
    ("Carlito", "Carlito-Regular.ttf"),
    # Arabic (incl. the presentation forms shaping produces), Hebrew and
    # many symbols (Bitstream Vera licence).
    ("DejaVuSans", "DejaVuSans.ttf"),
    # Chinese / Japanese ideographs and kana (Apache 2.0).
    ("DroidSansFallback", "DroidSansFallbackFull.ttf"),
)
PDF_CAP_HEIGHT = 0.64   # Carlito cap height as a fraction of font size

_text_fonts = None


def _fonts():
    """[(name, path, codepoints)] for TEXT_FONTS, registered with
    reportlab on first use."""
    global _text_fonts
    if _text_fonts is None:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        loaded = []
        for name, filename in TEXT_FONTS:
            path = os.path.join(_FONT_DIR, filename)
            font = TTFont(name, path)
            pdfmetrics.registerFont(font)
            loaded.append((name, path, frozenset(font.face.charToGlyph)))
        _text_fonts = loaded
    return _text_fonts


# Right-to-left scripts (Hebrew, Arabic, Syriac, … and their
# presentation forms).
_RTL = re.compile("[֐-ࣿיִ-﷿ﹰ-﻿]")


def visual_text(text):
    """``text`` ready to be drawn left to right: Arabic letters joined
    into their contextual forms and right-to-left runs in display order.
    The paragraph direction is left to right, like the documents, so
    e.g. a bead count "100 م" keeps the number first. Text without
    right-to-left characters is returned unchanged."""
    text = str(text)
    if not _RTL.search(text):
        return text
    import arabic_reshaper
    from bidi import get_display
    return get_display(arabic_reshaper.reshape(text), base_dir="L")


def text_runs(text):
    """``text`` in display order, split into (font name, font path,
    chunk) runs so every character uses a font that has it."""
    fonts = _fonts()
    runs = []
    for ch in visual_text(text):
        name, path, _ = next(
            (f for f in fonts if ord(ch) in f[2]), fonts[0])
        if runs and runs[-1][0] == name:
            runs[-1][2] += ch
        else:
            runs.append([name, path, ch])
    return [tuple(run) for run in runs]


def draw_pdf_text(c, x, y, text, size, align="left"):
    """Draw ``text`` on reportlab canvas ``c`` with its baseline at y,
    using the text font chain; ``align`` is left, center or right."""
    from reportlab.pdfbase.pdfmetrics import stringWidth
    runs = text_runs(text)
    widths = [stringWidth(chunk, name, size) for name, _, chunk in runs]
    total = sum(widths)
    if align == "center":
        x -= total / 2
    elif align == "right":
        x -= total
    for (name, _, chunk), width in zip(runs, widths):
        c.setFont(name, size)
        c.drawString(x, y, chunk)
        x += width


class TooLargeError(ValueError):
    """The requested output would be too large to render. Callers turn
    this into a 400 so the user learns to export or print a part."""


# Common colour constants used by both exporters.
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
GRID_LINE = (105, 105, 105)


# Symbol "darstellung" names used by `_paint_cell`. Kept as bare string
# constants so JSON pattern data flows through unchanged.
DARST_FILLED = "filled"
DARST_DOT = "dot"
DARST_CROSS = "cross"
DARST_CIRCLE = "circle"
DARST_RISING = "rising"
DARST_FALLING = "falling"
DARST_VDASH = "vdash"
DARST_DASH = "dash"
DARST_HDASH = "hdash"
DARST_PLUS = "plus"
DARST_SMALLCROSS = "smallcross"
DARST_SMALLCIRCLE = "smallcircle"
DARST_NUMBER = "number"


# ---------- Drawing target abstraction -----------------------------

class DrawTarget:
    """Minimal painter interface — fill_rect / stroke_rect / line /
    ellipse / text. All coordinates in logical pixels (16 px = one
    weave cell at unit ratio). Backends translate to native units."""

    def fill_rect(self, x, y, w, h, color):
        raise NotImplementedError

    # Two named variants of fill_rect that let the backends compensate
    # for how they rasterise. Callers use them to say what the rectangle
    # *is*, and each backend decides what that has to mean in its own
    # coordinate system.

    def fill_tile(self, x, y, w, h, color):
        """Fill a rectangle that butts up against its neighbours (fabric
        cells, colour bars, the simulation's thread bands). A renderer
        that antialiases two abutting rectangles separately leaves a
        pale seam along the join, so the vector backends take care to
        cover the shared edge; the raster one lands on whole pixels and
        needs nothing."""
        self.fill_rect(x, y, w, h, color)

    def fill_cell(self, x, y, w, h, bx, by, color):
        """Fill the inside of the cell at ``(x, y, w, h)``, leaving a
        margin of ``bx`` / ``by`` on all four sides so the grid stays
        visible around it. Backends whose grid line sits *inside* the
        cell footprint (the raster one) shift the block to keep the
        margin even on every side."""
        self.fill_rect(x + bx, y + by, w - 2 * bx, h - 2 * by, color)

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

    # Optional: left-aligned text. Default falls back to centered so
    # subclasses don't all need to implement it.
    def text_left(self, x, y, h, text, color):
        self.text_centered(x, y, max(1, h * len(text)), h, text, color)


# ---------- Shared cell painter -----------------------------------

def paint_cell(t: DrawTarget, darst, x, y, gw, gh, color):
    """Render one cell in the requested ``darstellung``. ``DARST_FILLED``
    fills a block inset by the same margin the symbol variants use, so
    the grid stays visible around it (cellPainterFilled in dbweave.js
    insets by bxf/byf, and the desktop's AUSGEFUELLT by two pixels); the
    symbol variants leave the background untouched. Port of the
    paintExportCell lambda in exportbitmap.cpp:189-196."""
    bx = max(1, gw * 15 // 100)
    by = max(1, gh * 15 // 100)
    if darst == DARST_FILLED:
        t.fill_cell(x, y, gw, gh, bx, by, color)
        return
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
        t.fill_rect(x, y, gw, gh, color)


# ---------- Pillow backend (PNG / JPEG) ---------------------------

_PIL_FONT_CACHE = {}


def _pil_font(size):
    """Best-effort TrueType font for PIL raster output. The default
    bitmap font is small, has poor glyph coverage (e.g. no ×), and
    can't be sized — so we look for a few common system fonts and
    cache by size. Falls back to load_default() when nothing fits."""
    key = int(max(6, size))
    if key in _PIL_FONT_CACHE:
        return _PIL_FONT_CACHE[key]
    from PIL import ImageFont
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "C:/Windows/Fonts/arial.ttf",
        # Bundled, so there is always a TrueType font.
        os.path.join(_FONT_DIR, "Carlito-Regular.ttf"),
    ]
    font = None
    for path in candidates:
        try:
            font = ImageFont.truetype(path, key)
            break
        except OSError:
            continue
    if font is None:
        font = ImageFont.load_default()
    _PIL_FONT_CACHE[key] = font
    return font


def _is_latin1(text):
    return all(ord(ch) < 256 for ch in str(text))


def _pil_font_file(path, size):
    """Font for pre-shaped text runs. Basic layout: with Raqm, Pillow
    would apply bidi again and reverse the visual_text() result."""
    key = (path, int(max(4, size)))
    if key not in _PIL_FONT_CACHE:
        from PIL import ImageFont
        _PIL_FONT_CACHE[key] = ImageFont.truetype(
            path, key[1], layout_engine=ImageFont.Layout.BASIC)
    return _PIL_FONT_CACHE[key]


class PILTarget(DrawTarget):
    def __init__(self, w, h):
        from PIL import Image, ImageDraw
        self.img = Image.new("RGB", (w, h), WHITE)
        self.draw = ImageDraw.Draw(self.img)

    def fill_rect(self, x, y, w, h, color):
        self.draw.rectangle([x, y, x + w - 1, y + h - 1], fill=color)

    def fill_cell(self, x, y, w, h, bx, by, color):
        # A grid line lands on whole pixels, so the one along the cell's
        # left/top edge eats the first pixel column/row of the footprint
        # while the one along the right/bottom edge belongs to the next
        # cell. Filling [x+bx, x+w-bx) would therefore leave bx-1 pixels
        # of margin on the left and bx on the right. Start one pixel in
        # and end one pixel short so both margins come out as bx.
        x1, y1 = x + bx + 1, y + by + 1
        x2, y2 = max(x1, x + w - bx - 1), max(y1, y + h - by - 1)
        self.draw.rectangle([x1, y1, x2, y2], fill=color)

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
        # Use the same nominal point size the PDF backend uses
        # (`h - 4`) so layouts computed against `_FONT_SIZE` stay in
        # sync across the two backends. We offset by the bbox origin
        # so the *visible* glyph centers on the box — PIL text() places
        # the bbox's (left, top) at the given point, but for many fonts
        # the bbox's top isn't at y=0 (there's leading whitespace), so
        # without this correction text drifts a couple of pixels low.
        if not _is_latin1(text):
            self._text_runs(x, y, h, text, color, box_w=w)
            return
        font = _pil_font(max(4, h - 4))
        try:
            bbox = self.draw.textbbox((0, 0), text, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            ox, oy = bbox[0], bbox[1]
        except Exception:
            tw, th, ox, oy = 6 * len(text), int(h), 0, 0
        self.draw.text((x + (w - tw) // 2 - ox,
                        y + (h - th) // 2 - oy),
                       text, fill=color, font=font)

    def _text_runs(self, x, y, h, text, color, box_w=None):
        """Text beyond Latin-1 (Cyrillic, Arabic, CJK, …): drawn run by
        run with the bundled font chain on a common baseline, centered
        in ``box_w`` when given."""
        size = max(4, h - 4)
        runs = [(_pil_font_file(path, size), chunk)
                for _, path, chunk in text_runs(text)]
        widths = [font.getlength(chunk) for font, chunk in runs]
        if box_w is not None:
            x += (box_w - sum(widths)) / 2
        baseline = y + (h + PDF_CAP_HEIGHT * size) / 2
        for (font, chunk), width in zip(runs, widths):
            self.draw.text((x, baseline), chunk, fill=color, font=font,
                           anchor="ls")
            x += width

    def text_left(self, x, y, h, text, color):
        if not _is_latin1(text):
            self._text_runs(x, y, h, text, color)
            return
        font = _pil_font(max(4, h - 4))
        try:
            bbox = self.draw.textbbox((0, 0), text, font=font)
            th = bbox[3] - bbox[1]
            ox, oy = bbox[0], bbox[1]
        except Exception:
            th, ox, oy = int(h), 0, 0
        self.draw.text((x - ox, y + max(0, (h - th) // 2) - oy),
                       text, fill=color, font=font)


# ---------- SVG backend -------------------------------------------

class SVGTarget(DrawTarget):
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

    def fill_tile(self, x, y, w, h, color):
        # ``crispEdges`` turns antialiasing off for this rectangle, so
        # its edge snaps to the device grid instead of being blended
        # over the boundary pixel. Without it two abutting blocks are
        # each blended half-way into the pixel they share and leave a
        # pale hairline between them — visible right across the fabric
        # in the farbeffekt and simulation renders.
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" '
            f'fill="{self._color(color)}" stroke="none" '
            f'shape-rendering="crispEdges"/>'
        )

    def stroke_rect(self, x, y, w, h, color, width=1):
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" '
            f'fill="none" stroke="{self._color(color)}" '
            f'stroke-width="{width}"/>'
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
            f'fill="none" stroke="{self._color(color)}" '
            f'stroke-width="{width}"/>'
        )

    def text_centered(self, x, y, w, h, text, color):
        self.parts.append(
            f'<text x="{x + w // 2}" y="{y + h - 2}" '
            f'text-anchor="middle" font-family="sans-serif" '
            f'font-size="{max(6, h - 4)}" '
            f'fill="{self._color(color)}">{_xml_text(text)}</text>'
        )

    def text_left(self, x, y, h, text, color):
        self.parts.append(
            f'<text x="{x}" y="{y + h - 2}" '
            f'text-anchor="start" font-family="sans-serif" '
            f'font-size="{max(6, h - 4)}" '
            f'fill="{self._color(color)}">{_xml_text(text)}</text>'
        )


def _xml_text(text) -> str:
    """Escape user text (author, notes, bead symbols) for SVG <text>,
    dropping control characters XML 1.0 cannot carry."""
    return xml_escape("".join(
        ch for ch in str(text) if ch >= " " or ch in "\t\n\r"
    ))


def svg_document(target: SVGTarget) -> bytes:
    """Wrap an :class:`SVGTarget`'s primitives in a complete SVG XML
    document with a white background."""
    body = "".join(target.parts)
    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{target.w}" height="{target.h}" '
        f'viewBox="0 0 {target.w} {target.h}">'
        f'<rect width="100%" height="100%" fill="#ffffff"/>'
        f'{body}</svg>'
    )
    return svg.encode("utf-8")


# ---------- reportlab backend (PDF) -------------------------------

class PDFTarget(DrawTarget):
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

    def fill_tile(self, x, y, w, h, color):
        # Outline the block in its own colour with a zero-width line.
        # PDF renders width 0 as the thinnest line the device can draw —
        # exactly one device pixel, at any zoom or resolution — which is
        # precisely what is needed here: two rectangles that merely abut
        # are antialiased independently, so neither covers their shared
        # pixel fully and a pale hairline shows through the fabric. The
        # hairline outline covers that pixel without changing geometry.
        self._set_color(color, fill=True)
        self._set_color(color, fill=False)
        self.c.setLineWidth(0)
        self.c.rect(x, self._y(y + h), w, h, stroke=1, fill=1)

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
        # Place the baseline so cap-height glyphs sit centered in
        # [y, y+h].
        cap_h = PDF_CAP_HEIGHT * size
        baseline = y + (h + cap_h) / 2
        draw_pdf_text(self.c, x + w / 2, self._y(baseline), text, size,
                      "center")

    def text_left(self, x, y, h, text, color):
        self._set_color(color, fill=True)
        size = max(4, h - 4)
        cap_h = PDF_CAP_HEIGHT * size
        baseline = y + (h + cap_h) / 2
        draw_pdf_text(self.c, x, self._y(baseline), text, size)


class PDFTargetNoFlip(DrawTarget):
    """PDF backend used when the canvas has already been transformed
    so that one logical px = one unit and the Y axis is flipped via
    a negative scale. Lets us draw with top-left origin without the
    per-call Y flip :class:`PDFTarget` does."""

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

    def fill_tile(self, x, y, w, h, color):
        # Zero-width outline in the fill colour — see PDFTarget.fill_tile.
        self._set_color(color, fill=True)
        self._set_color(color, fill=False)
        self.c.setLineWidth(0)
        self.c.rect(x, y, w, h, stroke=1, fill=1)

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
        cap_h = PDF_CAP_HEIGHT * size
        baseline = y + (h + cap_h) / 2
        # Y is flipped via negative scale; flip back locally so text
        # draws right-side up.
        self.c.saveState()
        self.c.scale(1, -1)
        draw_pdf_text(self.c, x + w / 2, -baseline, text, size, "center")
        self.c.restoreState()

    def text_left(self, x, y, h, text, color):
        self._set_color(color, fill=True)
        size = max(4, h - 4)
        cap_h = PDF_CAP_HEIGHT * size
        baseline = y + (h + cap_h) / 2
        self.c.saveState()
        self.c.scale(1, -1)
        draw_pdf_text(self.c, x, -baseline, text, size)
        self.c.restoreState()


def page_size():
    """Return the (width, height) of the configured page in points."""
    from reportlab.lib.pagesizes import A4, LETTER
    import os
    env = os.environ.get("PAPERSIZE", "").strip().lower()
    if env in ("letter", "us-letter"):
        return LETTER
    return A4

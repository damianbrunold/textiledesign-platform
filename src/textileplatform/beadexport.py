"""Server-side export and print of JBead bead patterns.

Mirrors the desktop ``ch.jbead.print`` package: the pattern is split
into part printers (draft, corrected, simulation, bead-list,
report-info) that each emit a fixed-width column. Parts are then
packed left-to-right onto pages of the configured size, starting a
new page whenever the next column would no longer fit. Tall patterns
emit several columns per part (continuing the same view further
down the bead string).

Provides:

- :func:`export_pdf`  — single-page PDF, scaled to fit.
- :func:`print_pdf`   — multi-page A4 PDF, paginated like desktop.
- :func:`export_png`  — single-page PNG raster.
- :func:`export_jpeg` — single-page JPEG raster.
- :func:`export_svg`  — single-page SVG.

The pattern model is the JSON form used by :mod:`beadpattern` —
``data["model"]`` is a list of rows of palette indices, ``data["colors"]``
is a list of ``[r, g, b]`` triples. The pattern's ``width`` and
``height`` are derived from ``model``; ``used_height`` is the topmost
non-empty row.
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import List, Tuple

try:
    from flask_babel import gettext
except Exception:
    def gettext(s):
        return s

from textileplatform.exportcommon import (
    BLACK, WHITE,
    DrawTarget, PILTarget, SVGTarget, PDFTargetNoFlip,
    page_size as _page_size,
    svg_document,
)


# ---------- Bead model wrapper -----------------------------------

@dataclass
class BeadModel:
    width: int
    height: int
    rows: List[List[int]]                     # rows[y][x] = palette idx
    palette: List[Tuple[int, int, int]]       # rgb tuples
    title: str = ""
    author: str = ""
    organization: str = ""
    notes: str = ""

    used_height: int = 0
    repeat: int = 0
    bead_list: List[Tuple[int, int]] = field(default_factory=list)
    # View-only rotation of the simulated rope. Mirrors desktop's
    # Model.shift / SimulationPanel.getShift — only the simulation
    # printer reads it; bead-list / draft / corrected / repeat are
    # unaffected.
    shift: int = 0

    def get(self, x, y):
        if 0 <= y < self.height and 0 <= x < self.width:
            return int(self.rows[y][x])
        return 0

    def color(self, idx):
        if 0 <= idx < len(self.palette):
            return self.palette[idx]
        return BLACK


def _contrast(rgb):
    """Black or white text colour for legibility on ``rgb``. Same
    luminance test the JS editor uses (jbead.js contrastingColor)."""
    r, g, b = rgb
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return WHITE if lum < 128 else BLACK


def _to_rgb(c):
    if isinstance(c, (list, tuple)) and len(c) >= 3:
        return (int(c[0]) & 0xFF, int(c[1]) & 0xFF, int(c[2]) & 0xFF)
    return BLACK


def load_model(data) -> BeadModel:
    rows = data.get("model") or []
    height = len(rows)
    width = len(rows[0]) if rows else 0
    palette = [_to_rgb(c) for c in (data.get("colors") or [])]
    if not palette:
        palette = [WHITE]
    view = data.get("view") or {}
    shift = 0
    try:
        shift = int(view.get("shift", 0))
    except (TypeError, ValueError):
        shift = 0
    if width > 0:
        shift = ((shift % width) + width) % width
    m = BeadModel(
        width=width,
        height=height,
        rows=[list(r) for r in rows],
        palette=palette,
        title=str(data.get("name") or ""),
        author=str(data.get("author") or ""),
        organization=str(data.get("organization") or ""),
        notes=str(data.get("notes") or ""),
        shift=shift,
    )
    _compute_used_height(m)
    _compute_repeat(m)
    _compute_bead_list(m)
    return m


def _compute_used_height(m: BeadModel) -> None:
    used = 0
    for j in range(m.height):
        for i in range(m.width):
            if m.get(i, j) > 0:
                used = j + 1
                break
    m.used_height = used


def _compute_repeat(m: BeadModel) -> None:
    """Smallest period in the linear bead sequence (i + j*width).
    Direct port of jbead.js BeadList.updateRepeat."""
    n = m.used_height * m.width
    m.repeat = n
    if n <= 0:
        return
    # Flatten the used portion into a 1-D array of palette indices.
    flat = []
    for j in range(m.used_height):
        flat.extend(m.rows[j])
    for i in range(1, n):
        if flat[i] != flat[0]:
            continue
        ok = True
        for k in range(i + 1, n):
            if flat[(k - i) % i] != flat[k]:
                ok = False
                break
        if ok:
            m.repeat = i
            return


def _compute_bead_list(m: BeadModel) -> None:
    """Run-length-encode one repeat from top to bottom (last bead first
    — desktop reads from end of repeat). Mirrors jbead.js BeadList."""
    m.bead_list = []
    if m.repeat <= 0:
        return
    flat = []
    for j in range(m.used_height):
        flat.extend(m.rows[j])
    flat = flat[: m.repeat]
    color = flat[-1]
    count = 1
    for i in range(len(flat) - 2, -1, -1):
        if flat[i] == color:
            count += 1
        else:
            m.bead_list.append((color, count))
            color = flat[i]
            count = 1
    m.bead_list.append((color, count))


# ---------- Corrected coordinate helper --------------------------

def _correct_y_for_index(width: int, idx: int) -> Tuple[int, int]:
    """Return (x_corr, y_corr) for linear bead index ``idx`` in the
    hexagonally corrected grid, where rows alternate widths
    [width, width+1, width, ...]. Mirrors Model.correct."""
    m1 = width
    m2 = width + 1
    k = 0
    m = m1
    while idx >= m:
        idx -= m
        k += 1
        m = m1 if k % 2 == 0 else m2
    return idx, k


# ---------- Painters --------------------------------------------

# Layout constants (in PDF points). 1 mm ≈ 2.835 pt.
_MM = 72.0 / 25.4

_GX = 3.0 * _MM       # cell width
_GY = 3.0 * _MM       # cell height
_BORDER = 2.0 * _MM
_FONT_SIZE = 10
_MARKER_W = 10.0 * _MM    # row-label margin in draft view
_TITLE_FONT_SIZE = 14
_HEADER_FONT_SIZE = 9


@dataclass
class PageRect:
    x: float
    y: float
    w: float
    h: float


class PartPrinter:
    """Base class — emits a sequence of fixed-width columns. Each
    ``paint_column`` call paints one column at (x, y_top); the column
    extends downward by ``page_h``."""

    def layout_columns(self, page_w: float, page_h: float) -> List[float]:
        raise NotImplementedError

    def paint_column(self, t: DrawTarget, page_h: float,
                     x: float, y: float, column: int) -> None:
        raise NotImplementedError


# ---- Common grid base ------------------------------------------

class _GridPart(PartPrinter):
    def __init__(self, m: BeadModel, full_pattern: bool,
                 single_column: bool = False):
        self.m = m
        self.full_pattern = full_pattern
        # When True, layout_columns is clamped to one column even if
        # the pattern is taller — used by single-page exports so a
        # 300-row pattern doesn't blow up into 5 stacked columns.
        self.single_column = single_column

    def _rows_per_column(self, page_h: float) -> int:
        return max(1, int(page_h // _GY))

    def _printable_rows(self, page_h: float) -> int:
        rpc = self._rows_per_column(page_h)
        used = self.m.used_height
        if used <= rpc or self.full_pattern:
            return used
        # Repeat-aware: print just enough to capture the smallest
        # period, rounded up to a full column.
        if self.m.repeat > 0:
            repeat_rows = (self.m.repeat + self.m.width - 1) // self.m.width
            rounded = ((repeat_rows + rpc - 1) // rpc) * rpc
            return min(rounded, used)
        return used


# ---- Draft printer ---------------------------------------------

class DraftPart(_GridPart):
    """Rectangular grid view, with a 10-mm row-number margin to the
    left."""

    def _column_width(self) -> float:
        return self.m.width * _GX + _MARKER_W

    def layout_columns(self, page_w, page_h):
        rows = self._printable_rows(page_h)
        rpc = self._rows_per_column(page_h)
        cols = max(1, (rows + rpc - 1) // rpc)
        if self.single_column:
            cols = 1
        return [self._column_width() + 2 * _BORDER] * cols

    def paint_column(self, t, page_h, x, y, column):
        rpc = self._rows_per_column(page_h)
        rows = self._printable_rows(page_h)
        if self.single_column:
            rows = min(rows, rpc)
        start = rpc * column
        x_grid = x + _BORDER + _MARKER_W
        for j in range(rpc):
            row = start + j
            if row >= rows:
                break
            yj = y + (rpc - j - 1) * _GY
            for i in range(self.m.width):
                c = self.m.get(i, row)
                col = self.m.color(c)
                t.fill_rect(x_grid + i * _GX, yj, _GX, _GY, col)
                t.stroke_rect(x_grid + i * _GX, yj, _GX, _GY, BLACK)
        # Row-number labels every 10 rows. Label sits fully above the
        # marker line so the digits don't overlap the rule (PIL's
        # default bitmap font is taller than _GY, so a label box of
        # _GY would clip into the line below).
        label_h = _FONT_SIZE + 2
        for j in range(rpc):
            row = start + j
            if row >= rows:
                break
            if (row + 1) % 10 == 0:
                yj = y + (rpc - j - 1) * _GY
                t.line(x + _BORDER, yj, x_grid - _GX / 2, yj, BLACK)
                t.text_left(x + _BORDER, yj - label_h - 1,
                            label_h, str(row + 1), BLACK)


# ---- Corrected printer -----------------------------------------

class CorrectedPart(_GridPart):
    """Hexagonally offset grid: row j has x offset 0 (even) or
    -gx/2 (odd)."""

    def _column_width(self):
        return (self.m.width + 1) * _GX

    def layout_columns(self, page_w, page_h):
        # We have to count corrected rows, not data rows: with odd
        # rows holding width+1 beads, the corrected used_height is a
        # bit smaller than the data used_height.
        n = self._printable_rows(page_h) * self.m.width
        if n <= 0:
            return []
        _, last_y = _correct_y_for_index(self.m.width, n - 1)
        corrected_rows = last_y + 1
        rpc = self._rows_per_column(page_h)
        cols = max(1, (corrected_rows + rpc - 1) // rpc)
        if self.single_column:
            cols = 1
        return [self._column_width() + 2 * _BORDER] * cols

    def paint_column(self, t, page_h, x, y, column):
        rpc = self._rows_per_column(page_h)
        start = rpc * column
        end = start + rpc
        # Iterate over all data beads; the (yj < start or yj >= end)
        # filter below picks the slice that belongs to this column.
        # We deliberately DON'T cap n at rpc*width in single_column
        # mode: corrected rows alternate widths W and W+1, so a column
        # that displays rpc rows actually holds ~rpc*W + rpc//2 beads,
        # and a tighter cap would clip the last partial row.
        n = self._printable_rows(page_h) * self.m.width
        x_grid = x + _BORDER + _GX / 2
        for idx in range(n):
            xi, yj = _correct_y_for_index(self.m.width, idx)
            if yj < start or yj >= end:
                continue
            data_x = idx % self.m.width
            data_y = idx // self.m.width
            c = self.m.get(data_x, data_y)
            xoff = 0 if (yj % 2 == 0) else -_GX / 2
            xx = x_grid + xi * _GX + xoff
            yy = y + (rpc - (yj - start) - 1) * _GY
            t.fill_rect(xx, yy, _GX, _GY, self.m.color(c))
            t.stroke_rect(xx, yy, _GX, _GY, BLACK)


# ---- Simulation printer ----------------------------------------

class SimulationPart(_GridPart):
    """Half-width 'bracelet view': beads alternate between two columns,
    drawn as filled rectangles (close enough to the on-screen ovals
    for print)."""

    def _column_width(self):
        return self.m.width * _GX / 2

    def _visible_width(self):
        return self.m.width // 2

    def layout_columns(self, page_w, page_h):
        n = self._printable_rows(page_h) * self.m.width
        if n <= 0:
            return []
        # The shift pushes the last bead onto a later corrected row, so
        # account for it when computing how many rows we need.
        _, last_y = _correct_y_for_index(self.m.width, n - 1 + self.m.shift)
        corrected_rows = last_y + 1
        rpc = self._rows_per_column(page_h)
        cols = max(1, (corrected_rows + rpc - 1) // rpc)
        if self.single_column:
            cols = 1
        return [self._column_width() + 2 * _BORDER] * cols

    def paint_column(self, t, page_h, x, y, column):
        rpc = self._rows_per_column(page_h)
        start = rpc * column
        end = start + rpc
        # Same caveat as CorrectedPart: don't cap n in single_column.
        n = self._printable_rows(page_h) * self.m.width
        vw = self._visible_width()
        x_grid = x + _BORDER
        # `shift` rotates the simulated rope by sliding beads along the
        # linear index before the spiral fold, mirroring desktop's
        # SimulationPanel + BeadPoint::shifted. The colour stays with
        # the bead, the position moves diagonally with the seam.
        for idx in range(n):
            xi, yj = _correct_y_for_index(self.m.width, idx + self.m.shift)
            if yj < start or yj >= end:
                continue
            if yj % 2 == 0 and xi >= vw:
                continue
            if yj % 2 == 1 and xi > vw:
                continue
            data_x = idx % self.m.width
            data_y = idx // self.m.width
            c = self.m.get(data_x, data_y)
            # Position: even row beads are full-width centred; odd row
            # beads are shifted by gx/2; outermost odd-row beads are
            # half-width.
            if yj % 2 == 0:
                xx = x_grid + xi * _GX
                w = _GX
            else:
                if xi == 0:
                    xx = x_grid
                    w = _GX / 2
                elif xi == vw:
                    xx = x_grid + (xi - 1) * _GX + _GX / 2
                    w = _GX / 2
                else:
                    xx = x_grid + (xi - 1) * _GX + _GX / 2
                    w = _GX
            yy = y + (rpc - (yj - start) - 1) * _GY
            t.fill_rect(xx, yy, w, _GY, self.m.color(c))
            t.stroke_rect(xx, yy, w, _GY, BLACK)


# ---- Bead-list printer -----------------------------------------

class BeadListPart(PartPrinter):
    """Run-length-encoded bead list as filled coloured ovals with
    the bead count centred inside, mirroring the editor's
    ViewBeadList. Pill width adapts to the widest count so the
    text always fits."""

    PILL_H = _FONT_SIZE + 8
    GAP_V  = 3
    GAP_H  = 4
    # "Start here" arrow drawn to the left of the first column. Mirrors
    # the on-screen ViewBeadList arrow (jbead.js:467-474).
    ARROW_W = 12.0
    ARROW_LEN = 30.0

    def __init__(self, m: BeadModel):
        self.m = m

    def _pill_w(self) -> float:
        if not self.m.bead_list:
            return self.PILL_H * 1.6
        max_count = max((c for _, c in self.m.bead_list), default=0)
        text_w = len(str(max_count)) * _CHAR_W_BODY
        # Minimum: a near-circle. Maximum: whatever fits the digits
        # plus inner padding so the count doesn't kiss the rim.
        return max(self.PILL_H * 1.6, text_w + 14)

    def _row_h(self) -> float:
        return self.PILL_H + self.GAP_V

    def _beads_per_column(self, page_h):
        return max(1, int(page_h // self._row_h()))

    def _column_width(self, first=False) -> float:
        # First column reserves space for the start-direction arrow.
        return self._pill_w() + self.GAP_H + (self.ARROW_W if first else 0)

    def layout_columns(self, page_w, page_h):
        bpc = self._beads_per_column(page_h)
        n = len(self.m.bead_list)
        if n <= 0:
            return []
        cols = (n + bpc - 1) // bpc
        widths = []
        for ci in range(cols):
            widths.append(self._column_width(first=(ci == 0)) + 2 * _BORDER)
        return widths

    def paint_column(self, t, page_h, x, y, column):
        bpc = self._beads_per_column(page_h)
        start = bpc * column
        pw = self._pill_w()
        ph = self.PILL_H
        rh = self._row_h()
        first = (column == 0)
        x0 = x + _BORDER
        # Arrow to the left of the very first column, indicating where
        # to start beading. Three line segments: a vertical shaft and
        # two arrowhead strokes pointing down.
        if first:
            ax = x0 + self.ARROW_W / 2
            ay0 = y
            ay1 = y + self.ARROW_LEN
            head = self.ARROW_W / 2
            t.line(ax, ay0, ax, ay1, BLACK, width=1)
            t.line(ax, ay1, ax - head, ay1 - head, BLACK, width=1)
            t.line(ax, ay1, ax + head, ay1 - head, BLACK, width=1)
            x0 += self.ARROW_W
        for i in range(bpc):
            idx = start + i
            if idx >= len(self.m.bead_list):
                break
            color, count = self.m.bead_list[idx]
            yy = y + i * rh
            col = self.m.color(color)
            cx = x0 + pw / 2
            cy = yy + ph / 2
            t.ellipse_filled(cx, cy, pw / 2, ph / 2, col)
            t.ellipse_outlined(cx, cy, pw / 2, ph / 2, BLACK)
            t.text_centered(x0, yy, pw, ph, str(count), _contrast(col))


# ---- Report-info printer ---------------------------------------

# Approximate character widths for our default body / title fonts. We
# don't have the PDF/raster font metrics at layout time, so we use a
# coarse pt-per-char estimate based on Helvetica/DejaVu averages
# (≈ 0.55 × font-size for digits/lowercase). This is the same trick
# the desktop uses indirectly via its FontMetrics estimator.
_CHAR_W_BODY  = _FONT_SIZE * 0.65
_CHAR_W_TITLE = _TITLE_FONT_SIZE * 0.7


def _estimate_text_w(s: str, char_w: float) -> float:
    return len(s) * char_w


class ReportInfoPart(PartPrinter):
    """Pattern title + key stats + per-colour bead totals.

    Mirrors desktop ``ReportInfosPrinter``: lays out as a single
    column whose width adapts to the longest text/value pair, then
    fits a wrapping grid of per-colour bead counts below the info
    block — instead of reserving a fixed-width slot like the first
    cut did."""

    LINE_H = _FONT_SIZE + 4

    def __init__(self, m: BeadModel):
        self.m = m
        self._infos = self._build_infos()
        self._counts = self._build_counts()

    def _build_infos(self) -> List[Tuple[str, str]]:
        items: List[Tuple[str, str]] = []
        beads = gettext("beads")
        items.append((gettext("Pattern:"), self.m.title or ""))
        if self.m.author:
            items.append((gettext("Author:"), self.m.author))
        if self.m.organization:
            items.append((gettext("Organization:"), self.m.organization))
        items.append((gettext("Circumference:"), str(self.m.width)))
        if self.m.repeat:
            if self.m.repeat % self.m.width == 0:
                rows = self.m.repeat // self.m.width
                items.append((gettext("Rows per repeat:"), str(rows)))
            else:
                rows = self.m.repeat // self.m.width
                rest = self.m.repeat % self.m.width
                row_label = gettext("rows") if rows != 1 else gettext("row")
                bead_label = gettext("beads") if rest != 1 else gettext("bead")
                items.append(
                    (gettext("Rows per repeat:"),
                     f"{rows} {row_label} {rest} {bead_label}"))
            items.append((gettext("Repeat:"), f"{self.m.repeat} {beads}"))
        items.append((gettext("Number of rows:"), str(self.m.used_height)))
        items.append(
            (gettext("Total beads:"),
             f"{self.m.used_height * self.m.width} {beads}"))
        return items

    def _build_counts(self) -> List[Tuple[int, int]]:
        """Per-colour totals across the entire used pattern (desktop's
        BeadCounts). Skips colour 0 (background) and any colour that
        doesn't actually appear."""
        counts = {}
        for j in range(self.m.used_height):
            for i in range(self.m.width):
                c = self.m.get(i, j)
                if c <= 0:
                    continue
                counts[c] = counts.get(c, 0) + 1
        # Sort by palette index for stable output.
        return sorted(counts.items())

    # ---- layout -----------------------------------------------

    def _info_block_w(self) -> float:
        if not self._infos:
            return 0.0
        max_label = max(_estimate_text_w(lbl, _CHAR_W_BODY)
                        for lbl, _ in self._infos)
        max_val = max(_estimate_text_w(val, _CHAR_W_BODY)
                      for _, val in self._infos)
        return max_label + _CHAR_W_BODY + max_val

    # Pills in the per-colour grid use the same dimensions as
    # ``BeadListPart`` so the two visual languages match.
    _PILL_H = _FONT_SIZE + 8
    _PILL_GAP_H = 4
    _PILL_GAP_V = 3

    def _pill_w(self) -> float:
        if not self._counts:
            return self._PILL_H * 1.6
        max_count = max(c for _, c in self._counts)
        text_w = len(str(max_count)) * _CHAR_W_BODY
        return max(self._PILL_H * 1.6, text_w + 14)

    def _count_cell_w(self) -> float:
        return self._pill_w() + self._PILL_GAP_H

    def _column_w(self) -> float:
        return max(self._info_block_w(), 60.0)  # min ~60 pt readable

    def layout_columns(self, page_w, page_h):
        return [self._column_w() + 2 * _BORDER]

    def paint_column(self, t, page_h, x, y, column):
        if column != 0:
            return
        x0 = x + _BORDER
        col_w = self._column_w()
        # ----- info lines -----
        if self._infos:
            label_w = max(_estimate_text_w(lbl, _CHAR_W_BODY)
                          for lbl, _ in self._infos)
        else:
            label_w = 0
        yy = y
        for label, value in self._infos:
            t.text_left(x0, yy, self.LINE_H, label, BLACK)
            t.text_left(x0 + label_w + _CHAR_W_BODY,
                        yy, self.LINE_H, value, BLACK)
            yy += self.LINE_H

        # ----- per-colour totals grid (same pill style as BeadListPart) -----
        if self._counts:
            yy += self.LINE_H / 2
            cell_w = self._count_cell_w()
            per_row = max(1, int(col_w // cell_w))
            pw = self._pill_w()
            ph = self._PILL_H
            row_h = ph + self._PILL_GAP_V
            for idx, (color, count) in enumerate(self._counts):
                row = idx // per_row
                col = idx % per_row
                cx0 = x0 + col * cell_w
                cy0 = yy + row * row_h
                col_rgb = self.m.color(color)
                pcx = cx0 + pw / 2
                pcy = cy0 + ph / 2
                t.ellipse_filled(pcx, pcy, pw / 2, ph / 2, col_rgb)
                t.ellipse_outlined(pcx, pcy, pw / 2, ph / 2, BLACK)
                t.text_centered(cx0, cy0, pw, ph,
                                str(count), _contrast(col_rgb))


# ---------- Page packing -----------------------------------------

@dataclass
class _PagePart:
    part: PartPrinter
    column: int
    width: float


@dataclass
class _Page:
    parts: List[_PagePart] = field(default_factory=list)
    used_w: float = 0.0


def _layout_pages(parts: List[PartPrinter], page_w: float, page_h: float):
    pages: List[_Page] = []
    current = _Page()
    for part in parts:
        for ci, cw in enumerate(part.layout_columns(page_w, page_h)):
            if cw > page_w:
                # Just emit; will overflow — better than nothing.
                pass
            if current.used_w + cw > page_w and current.parts:
                pages.append(current)
                current = _Page()
            current.parts.append(_PagePart(part, ci, cw))
            current.used_w += cw
    if current.parts:
        pages.append(current)
    return pages


def _select_parts(m: BeadModel, view: dict, full_pattern: bool,
                  single_column_grids: bool = False):
    """Build the part list. ``single_column_grids`` clamps draft/
    corrected/simulation views to a single column (anything that
    won't fit is omitted) — used by the single-page exports so a
    long pattern doesn't expand into a giant horizontal strip."""
    parts: List[PartPrinter] = []
    if view.get("report-visible", True):
        parts.append(ReportInfoPart(m))
    if view.get("draft-visible", True):
        parts.append(DraftPart(m, full_pattern, single_column_grids))
    if view.get("corrected-visible", True):
        parts.append(CorrectedPart(m, full_pattern, single_column_grids))
    if view.get("simulation-visible", True):
        parts.append(SimulationPart(m, full_pattern, single_column_grids))
    if view.get("report-visible", True):
        parts.append(BeadListPart(m))
    return parts


# ---------- PDF entry points -------------------------------------

def _landscape_page():
    """Configured page size in landscape orientation. Desktop jbead
    defaults to landscape (PrintSettings.addOrientation:101) and the
    bead-list / pattern columns pack much better wide than tall."""
    w, h = _page_size()
    return (max(w, h), min(w, h))


def _draw_page_header(c, title, page_idx, total_pages, page_w, top,
                      include_title):
    """Page-corner annotation. The pattern title only appears here
    when the report-info part isn't rendered (otherwise we'd render
    it twice — desktop avoids this by not having a page title at
    all, and putting the filename inside ReportInfos)."""
    if total_pages <= 1 and not include_title:
        return
    c.setFont("Helvetica", _HEADER_FONT_SIZE)
    c.setFillColorRGB(0, 0, 0)
    parts = []
    if include_title and title:
        parts.append(title)
    if total_pages > 1:
        parts.append(f"{page_idx + 1} / {total_pages}")
    if not parts:
        return
    c.drawString(_BORDER, top - _HEADER_FONT_SIZE, "    ".join(parts))


# Default jbead header mirrors the weave default but with the JBead
# brand. Tokens (&Pattern / &Author / &Page / ...) are expanded by
# ``expand_header_tokens`` (shared with the weave printer).
DEFAULT_HEADER_TEXT = "JBead - &Pattern (&Author)"
DEFAULT_FOOTER_TEXT = ""


def _draw_print_header_footer(c, data, title, page_idx, total_pages,
                              page_w, page_h, margin):
    """Print-mode header (top-left) + page count (top-right, only when
    multi-page) + optional footer (bottom-left). Mirrors the weave
    printer's layout in :func:`textileplatform.export.print_pdf`."""
    from textileplatform.export import expand_header_tokens
    header_tpl = data.get("header_text")
    if header_tpl is None:
        header_tpl = DEFAULT_HEADER_TEXT
    footer_tpl = data.get("footer_text") or ""
    header = expand_header_tokens(
        header_tpl, data, title, page_idx + 1, total_pages,
    )
    footer = expand_header_tokens(
        footer_tpl, data, title, page_idx + 1, total_pages,
    )
    c.setFont("Helvetica", _HEADER_FONT_SIZE)
    c.setFillColorRGB(0, 0, 0)
    if header:
        c.drawString(margin, page_h - margin / 2, header)
    if total_pages > 1:
        c.drawRightString(page_w - margin, page_h - margin / 2,
                          f"{page_idx + 1} / {total_pages}")
    if footer:
        c.drawString(margin, margin / 2, footer)


def _paginated_pdf(data, title, full_pattern, fit_single_page):
    """Common renderer for :func:`print_pdf` and :func:`export_pdf`.
    Lays out parts column-major on landscape pages. When
    ``fit_single_page`` is True and everything fits on one page,
    nothing is scaled; if it doesn't fit, the entire output is
    rescaled onto a single page (single-page export). Otherwise
    overflow turns into additional pages (print)."""
    from reportlab.pdfgen import canvas

    m = load_model(data)
    if title:
        m.title = title
    view = data.get("view") or {}
    parts = _select_parts(m, view, full_pattern,
                          single_column_grids=fit_single_page)

    page_w, page_h = _landscape_page()
    margin = 10 * _MM
    paint_w = page_w - 2 * margin
    have_report = view.get("report-visible", True)
    # Only reserve a header strip when we'll actually print one
    # (multi-page output, or no report-info part to carry the title).
    header_h = (_HEADER_FONT_SIZE + 4)
    paint_h = page_h - 2 * margin - header_h

    pages = _layout_pages(parts, paint_w, paint_h)
    if not pages:
        pages = [_Page()]

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w, page_h))
    c.setCreator("textileplatform")
    if title or m.title:
        c.setTitle(title or m.title)

    if fit_single_page and len(pages) > 1:
        # Pack all columns side by side, then rescale to fit one page.
        total_w = sum(pp.width for page in pages for pp in page.parts)
        scale = min(1.0, paint_w / total_w, 1.0)
        # We also have to stay within paint_h: a column is one
        # paint_h tall, so if the original layout used full column
        # height, scaling by paint_w/total_w may be tighter than
        # what fits vertically; clamp by both axes.
        # All columns in the current pages were laid out at
        # paint_h, so vertical scale = horizontal scale keeps aspect.
        c.saveState()
        _draw_page_header(c, title or m.title, 0, 1, page_w,
                          page_h - margin,
                          include_title=not have_report)
        c.translate(margin, page_h - margin - header_h)
        c.scale(scale, -scale)
        target = PDFTargetNoFlip(c)
        cursor_x = 0.0
        for page in pages:
            for pp in page.parts:
                pp.part.paint_column(target, paint_h,
                                     cursor_x, 0.0, pp.column)
                cursor_x += pp.width
        c.restoreState()
        c.showPage()
    else:
        for pi, page in enumerate(pages):
            c.saveState()
            if fit_single_page:
                _draw_page_header(c, title or m.title, pi, len(pages),
                                  page_w, page_h - margin,
                                  include_title=not have_report)
            else:
                # Print mode: configurable header / footer with token
                # expansion, mirroring the weave printer.
                _draw_print_header_footer(
                    c, data, title or m.title, pi, len(pages),
                    page_w, page_h, margin,
                )
            c.translate(margin, page_h - margin - header_h)
            c.scale(1, -1)
            target = PDFTargetNoFlip(c)
            cursor_x = 0.0
            for pp in page.parts:
                pp.part.paint_column(target, paint_h,
                                     cursor_x, 0.0, pp.column)
                cursor_x += pp.width
            c.restoreState()
            c.showPage()
    c.save()
    return buf.getvalue()


def print_pdf(data, title=None, full_pattern=True) -> bytes:
    """Multi-page landscape PDF, mirroring desktop ``DesignPrinter``.

    ``full_pattern=True`` (the desktop "Drucken") emits the entire
    used height. ``full_pattern=False`` ("Teil drucken") rounds down
    to the smallest repeat that fits a column.
    """
    return _paginated_pdf(data, title, full_pattern,
                          fit_single_page=False)


def export_pdf(data, title=None) -> bytes:
    """Landscape PDF. Fits everything on a single page when possible
    (rescaling if necessary so a tall pattern's columns wrap rather
    than overflowing); falls through to multi-page when there's just
    too much to legibly squeeze."""
    return _paginated_pdf(data, title, full_pattern=True,
                          fit_single_page=True)


# ---------- Raster / SVG ----------------------------------------

def _layout_strip(parts: List[PartPrinter], page_h: float):
    """Pack all part columns into a single landscape strip of height
    ``page_h``. Returns (total_width, list[(part, column, x, w)])."""
    placements = []
    cursor_x = 0.0
    for part in parts:
        for ci, cw in enumerate(part.layout_columns(1e9, page_h)):
            placements.append((part, ci, cursor_x, cw))
            cursor_x += cw
    return cursor_x, placements


def _render_strip(target: DrawTarget, m: BeadModel, view: dict,
                  page_h: float, placements):
    for part, ci, x, _w in placements:
        part.paint_column(target, page_h, x, 0.0, ci)


def _export_image_size(view: dict, m: BeadModel):
    """Compute target image (or SVG canvas) dimensions for the
    flat single-page raster/SVG export. We use the landscape page
    height as the column height — matching the PDF layout — and let
    the width grow to whatever the parts pack into."""
    page_w, page_h = _landscape_page()
    margin = 6 * _MM
    paint_h = page_h - 2 * margin
    parts = _select_parts(m, view, full_pattern=True,
                          single_column_grids=True)
    total_w, placements = _layout_strip(parts, paint_h)
    img_w = int(total_w + 2 * margin + 1)
    img_h = int(page_h + 1)
    return img_w, img_h, margin, paint_h, placements


def _export_raster(data, fmt, jpeg_quality=92):
    m = load_model(data)
    view = data.get("view") or {}
    img_w, img_h, margin, paint_h, placements = _export_image_size(view, m)
    target = PILTarget(max(64, img_w), max(64, img_h))
    # Translate origin: columns are laid out at (x, 0, w, paint_h);
    # we shift them by (margin, margin) to keep a printable border.
    # PILTarget has no transform stack; emulate by passing offset
    # placements.
    offset_placements = [(p, ci, x + margin, w) for (p, ci, x, w) in placements]
    _render_strip_at(target, m, view, paint_h, offset_placements, margin)
    buf = io.BytesIO()
    save_kwargs = {}
    if fmt.upper() == "JPEG":
        save_kwargs["quality"] = jpeg_quality
        save_kwargs["optimize"] = True
    target.img.save(buf, fmt.upper(), **save_kwargs)
    return buf.getvalue()


def _render_strip_at(target, m, view, page_h, placements, y_offset):
    for part, ci, x, _w in placements:
        part.paint_column(target, page_h, x, y_offset, ci)


def export_png(data) -> bytes:
    return _export_raster(data, "PNG")


def export_jpeg(data) -> bytes:
    return _export_raster(data, "JPEG")


def export_svg(data) -> bytes:
    m = load_model(data)
    view = data.get("view") or {}
    img_w, img_h, margin, paint_h, placements = _export_image_size(view, m)
    target = SVGTarget(max(64, img_w), max(64, img_h))
    offset_placements = [(p, ci, x + margin, w) for (p, ci, x, w) in placements]
    _render_strip_at(target, m, view, paint_h, offset_placements, margin)
    return svg_document(target)

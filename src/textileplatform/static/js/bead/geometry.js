// Geometry of the bead editor's draft, corrected and simulated views:
// where each bead is drawn, and which bead a pixel hits. Drawing and
// hit-testing both use these functions, so they always agree.
//
// The bead rope is folded into "corrected" rows: even rows hold W
// beads, odd rows W + 1 (shifted by half a bead). A row's parity is a
// property of the rope, so it is the *absolute* row that counts, not
// the row within the scrolled window.
//
// A view is { x, y, width, height, offset } in cells (offset: rows
// scrolled away at the bottom); dx / dy are the cell size in pixels.
// Cells are drawn from 0.5 so the 1-px grid lines land on whole pixels.
// Rectangles are { x, y, w, h } in pixels. No DOM, no editor globals.

// ---------- fold -------------------------------------------------------

// Linear rope index -> { i, row } in corrected rows (closed form, as
// beadexport._correct_y_for_index).
export function foldIndex(idx, W) {
    const pair = Math.floor(idx / (2 * W + 1));
    const rest = idx - pair * (2 * W + 1);
    return rest < W ? { i: rest, row: 2 * pair }
        : { i: rest - W, row: 2 * pair + 1 };
}

// Linear index of the first bead of corrected row `row` (0 below the
// pattern).
export function rowStart(row, W) {
    if (row <= 0) return 0;
    return Math.floor(row / 2) * (2 * W + 1) + (row % 2 === 1 ? W : 0);
}

// Pixel row (from the top) of view row `jv` (from the bottom).
function rowTop(view, jv, dy) {
    return 0.5 + (view.y + view.height - jv - 1) * dy;
}

// View row (from the bottom) under pixel y.
function rowAt(view, py, dy) {
    return view.y + view.height - 1 - Math.floor((py - 0.5) / dy);
}

const inWindow = (view, jv) => jv >= 0 && jv < view.height;

// ---------- draft ------------------------------------------------------

// The draft is the plain grid: bead (i, j) of the pattern.
export function draftCell(view, i, j, dx, dy) {
    const jv = j - view.offset;
    if (!inWindow(view, jv)) return null;
    return { x: 0.5 + (view.x + i) * dx, y: rowTop(view, jv, dy), w: dx, h: dy };
}

export function draftHit(view, px, py, dx, dy) {
    return [Math.floor((px - 0.5) / dx) - view.x,
            rowAt(view, py, dy) + view.offset];
}

// ---------- corrected --------------------------------------------------

// Bead `idx` (linear) of a W-wide pattern in the corrected view.
export function correctedCell(view, idx, W, dx, dy) {
    const { i, row } = foldIndex(idx, W);
    const jv = row - view.offset;
    if (!inWindow(view, jv)) return null;
    const xoff = row % 2 === 1 ? -dx / 2 : 0;
    return { x: 0.5 + xoff + (view.x + i) * dx, y: rowTop(view, jv, dy),
             w: dx, h: dy };
}

// [i, j] in the pattern (may lie outside it; callers check).
export function correctedHit(view, px, py, W, dx, dy) {
    const row = rowAt(view, py, dy) + view.offset;
    const shift = row % 2 === 1 ? dx / 2 : 0;
    const i = Math.floor((px - 0.5 + shift) / dx) - view.x;
    const idx = rowStart(row, W) + i;
    return [idx % W, Math.trunc(idx / W)];
}

// ---------- simulated --------------------------------------------------
//
// The tube seen from the front: `view.width` columns of the folded
// rope, rotated by `shift` beads. Odd rows have a half bead at each
// edge (columns 0 and view.width).

// Columns of the tube's front shown for a W-wide pattern: half the
// circumference, as the desktop (SimulationPanel::visibleWidth) and
// the exports (SimulationPart._visible_width) show it.
export function simulatedWidth(W) {
    return Math.trunc(W / 2);
}

// Bead `idx` (linear) in the simulated view, or null when it is out of
// the window or on the back of the tube.
export function simulatedCell(view, idx, W, shift, dx, dy) {
    const { i, row } = foldIndex(idx + shift, W);
    const jv = row - view.offset;
    if (!inWindow(view, jv)) return null;
    const odd = row % 2 === 1;
    if (odd ? i > view.width : i >= view.width) return null;
    const xoff = odd ? -dx / 2 : 0;
    const y = rowTop(view, jv, dy);
    if (odd && i === 0) {
        return { x: 0.5 + xoff + view.x * dx, y, w: dx / 2, h: dy };
    }
    const x = 0.5 + xoff + (view.x + i - 1) * dx + dx / 2;
    const w = odd && i >= view.width ? dx / 2 : dx;
    return { x, y, w, h: dy };
}

// [i, j] in the pattern, or [undefined, undefined] when the pixel hits
// no bead of a W x H pattern.
export function simulatedHit(view, px, py, W, H, shift, dx, dy) {
    const none = [undefined, undefined];
    if (W <= 0) return none;
    const jv = rowAt(view, py, dy);
    if (!inWindow(view, jv)) return none;
    const row = jv + view.offset;
    const xRel = px - view.x * dx;
    let i;
    if (row % 2 === 0) {
        // W full cells; cell i spans [(i-1)*dx + dx/2, i*dx + dx/2).
        i = Math.floor((xRel + dx / 2) / dx);
        if (i < 0 || i >= W) return none;
    } else {
        // W + 1 cells, the edge ones half wide; cell i spans
        // [(i-1)*dx, i*dx).
        i = Math.floor((xRel + dx) / dx);
        if (i < 0 || i > W) return none;
    }
    const idx = rowStart(row, W) + i - shift;
    if (idx < 0) return none;
    const j = Math.trunc(idx / W);
    if (j >= H) return none;
    return [idx % W, j];
}

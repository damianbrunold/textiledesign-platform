// Bead pattern transforms: "Arrange" (copy the selection with an
// offset, n times) and the data side of resize / insert row / delete
// row.
//
//   selectionSource(pattern, sel)                     -> rows of beads
//   arrangeCopies(pattern, sel, src, dx, dy, copies)  (in place)
//   arrangeUndoRows(pattern, sel, dx, dy, copies)     -> { j1, j2 } | null
//   resizedData(data, oldW, oldH, newW, newH)         -> new data
//   withRowInserted(data, W, H, j)                    -> new data
//   withRowDeleted(data, W, H, j)                     -> new data | null
//
// No DOM and no editor globals; the editor (editor.js) keeps the
// dialogs and the undo commands.

// ---------- arrange ---------------------------------------------------
//
// (dx, dy) is a *linear* bead offset: each copy is shifted by
// dy * width + dx beads in row-major order, so running off the right
// edge continues in the next row, as on a beaded rope.

// The selected beads, captured before any writes (copies may overlap
// the source).
export function selectionSource(pattern, sel) {
    const src = [];
    for (let j = 0; j <= sel.j2 - sel.j1; j++) {
        const row = [];
        for (let i = 0; i <= sel.i2 - sel.i1; i++) {
            row.push(pattern.get(sel.i1 + i, sel.j1 + j));
        }
        src.push(row);
    }
    return src;
}

// Write copies k = 1..copies of `src` at linear offsets
// k * (dy * width + dx); beads that land outside the pattern are
// skipped.
export function arrangeCopies(pattern, sel, src, dx, dy, copies) {
    const PW = pattern.width;
    const linearOffset = dy * PW + dx;
    if (copies < 1 || linearOffset === 0) return;
    const total = PW * pattern.height;
    for (let k = 1; k <= copies; k++) {
        for (let j = 0; j < src.length; j++) {
            for (let i = 0; i < src[j].length; i++) {
                const srcLin = (sel.j1 + j) * PW + (sel.i1 + i);
                const tl = srcLin + k * linearOffset;
                if (tl < 0 || tl >= total) continue;
                pattern.set(tl % PW, Math.trunc(tl / PW), src[j][i]);
            }
        }
    }
}

// The rows an arrangement can change (whole rows, for the rectangular
// undo snapshot): every copy lies in the linear range between the
// source and the last copy. null when there is nothing to do.
export function arrangeUndoRows(pattern, sel, dx, dy, copies) {
    const PW = pattern.width;
    const linearOffset = dy * PW + dx;
    if (copies < 1 || linearOffset === 0) return null;
    const total = PW * pattern.height;
    const first = sel.j1 * PW + sel.i1;
    const last = sel.j2 * PW + sel.i2;
    const targets = [first, last,
                     first + copies * linearOffset,
                     last + copies * linearOffset];
    const minLin = Math.max(0, Math.min(...targets));
    const maxLin = Math.min(total - 1, Math.max(...targets));
    if (minLin > maxLin) return null;
    return { j1: Math.trunc(minLin / PW), j2: Math.trunc(maxLin / PW) };
}

// ---------- size and rows ----------------------------------------------

// The beads of a W x H pattern in a newW x newH one: the overlap is
// kept, new beads are 0.
export function resizedData(data, oldW, oldH, newW, newH) {
    const out = new Array(newW * newH).fill(0);
    const cw = Math.min(oldW, newW);
    const ch = Math.min(oldH, newH);
    for (let j = 0; j < ch; j++) {
        for (let i = 0; i < cw; i++) out[i + j * newW] = data[i + j * oldW];
    }
    return out;
}

// An empty row inserted at j (clamped to 0..H): rows below j stay,
// rows from j on move up by one.
export function withRowInserted(data, W, H, j) {
    j = Math.max(0, Math.min(H, j));
    const out = new Array(W * (H + 1)).fill(0);
    for (let r = 0; r < H; r++) {
        const to = r < j ? r : r + 1;
        for (let i = 0; i < W; i++) out[i + to * W] = data[i + r * W];
    }
    return out;
}

// Row j removed; null when j is outside the pattern or it is the last
// row (a pattern keeps at least one row).
export function withRowDeleted(data, W, H, j) {
    if (H <= 1 || j < 0 || j >= H) return null;
    const out = new Array(W * (H - 1)).fill(0);
    for (let r = 0; r < H; r++) {
        if (r === j) continue;
        const to = r < j ? r : r - 1;
        for (let i = 0; i < W; i++) out[i + to * W] = data[i + r * W];
    }
    return out;
}

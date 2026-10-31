// Selection group move: "pick up" everything in the pattern that
// matches the current selection's content and move it as a group
// (mouse drag of a selection, Shift+Arrow, toolbar arrows).
//
//   captureGroup(pattern)                       -> group | null
//   stampGroup(pattern, group, dx, dy, background)
//   affectedRect(group, dx, dy)                 -> { i1, j1, i2, j2 } | null
//
// The bead rope is a tube: beads are compared and moved by their linear
// index (row by row), so a shape that wraps across the seam is still
// the same shape. No DOM and no editor globals; moved out of jbead.js.

// The selection's shape as linear offsets from its first bead, its
// values, every linear position where the whole shape occurs, and the
// pattern data to restore before each (preview) stamp.
export function captureGroup(pattern) {
    if (!pattern.selection) return null;
    const sel = pattern.selection;
    const W = sel.i2 - sel.i1 + 1;
    const H = sel.j2 - sel.j1 + 1;
    const PW = pattern.width;
    const PH = pattern.height;
    const total = PW * PH;
    // Working linearly (instead of in x/y) means a 2x2 selection at the
    // seam — say (W-1, j) wrapping into (0, j+1) — is still recognised
    // as the same shape, so all symmetric copies move together.
    const offsets = [];
    const values = [];
    for (let m = 0; m < H; m++) {
        for (let k = 0; k < W; k++) {
            offsets.push(k + m * PW);
            values.push(pattern.get(sel.i1 + k, sel.j1 + m));
        }
    }
    const maxOffset = offsets[offsets.length - 1];
    // Every linear base where the full shape stays in bounds.
    const matches = [];
    for (let L = 0; L + maxOffset < total; L++) {
        let ok = true;
        for (let n = 0; n < offsets.length; n++) {
            if (pattern.data[L + offsets[n]] !== values[n]) { ok = false; break; }
        }
        if (ok) matches.push(L);
    }
    return {
        sel: { ...sel },
        W, H, PW, PH, total,
        offsets,
        values,
        matches,
        baseline: pattern.data.slice(),
    };
}

// Put the pattern back to the state the group was captured from.
export function restoreBaseline(pattern, group) {
    for (let k = 0; k < group.baseline.length; k++) {
        pattern.data[k] = group.baseline[k];
    }
}

// The group moved by (dx, dy), i.e. by the linear offset dy * PW + dx:
// restore the baseline, lift every match (paint `background`), stamp
// the shape at the moved positions. The selection rect moves by
// (dx, dy); past the seam it may extend outside the pattern (and isn't
// drawn there) while the data has wrapped.
export function stampGroup(pattern, group, dx, dy, background) {
    const { sel, PW, total, offsets, values, matches } = group;
    restoreBaseline(pattern, group);
    for (const L of matches) {
        for (const off of offsets) {
            const tl = L + off;
            if (tl < 0 || tl >= total) continue;
            pattern.data[tl] = background;
        }
    }
    const deltaLin = dy * PW + dx;
    for (const L of matches) {
        for (let n = 0; n < offsets.length; n++) {
            const tl = L + offsets[n] + deltaLin;
            if (tl < 0 || tl >= total) continue;
            pattern.data[tl] = values[n];
        }
    }
    pattern.selection = {
        i1: sel.i1 + dx, j1: sel.j1 + dy,
        i2: sel.i2 + dx, j2: sel.j2 + dy,
    };
}

// Bounding rect of every position the move lifts from or stamps into,
// for the undo snapshot (it over-captures when cells are scattered,
// which the rectangular snapshot needs anyway).
export function affectedRect(group, dx, dy) {
    const { offsets, matches, PW, total } = group;
    const deltaLin = dy * PW + dx;
    let i1 = PW, j1 = group.PH, i2 = -1, j2 = -1;
    const expand = (lin) => {
        if (lin < 0 || lin >= total) return;
        const x = lin % PW;
        const y = Math.trunc(lin / PW);
        if (x < i1) i1 = x;
        if (y < j1) j1 = y;
        if (x > i2) i2 = x;
        if (y > j2) j2 = y;
    };
    for (const L of matches) {
        for (const off of offsets) {
            expand(L + off);
            expand(L + off + deltaLin);
        }
    }
    if (i2 < i1 || j2 < j1) return null;
    return { i1, j1, i2, j2 };
}

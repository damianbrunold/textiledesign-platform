// Whole-pattern transforms: switch side (F11), the pegplan transforms
// (invert / mirror / delete) and repeat extension / reduction (F8 / F7).
//
//   switchSide(pattern, value, { pegplan })
//   invertPegplan(pattern, value), mirrorPegplan(pattern),
//   clearPegplan(pattern), pegplanBounds(pattern)
//   repeatWarp(pattern, times, { withColors })
//   repeatWeft(pattern, times, { withColors, pegplan })
//
// `value` is the editor's current range (set for switched-on cells).
// Ports of utilities.cpp::SwapSide, SpInvertClick / SpSpiegelnClick /
// ClearSchlagpatroneClick and RapportKette / RapportSchuss, moved out of
// dbweave.js (which keeps the undo commands).

// ---------- helpers ---------------------------------------------------

function isFreeTreadle(pattern, i) {
    for (let j = 0; j < pattern.treadling.height; j++) {
        if (pattern.treadling.get(i, j) > 0) return false;
    }
    return true;
}

function isFreeShaft(pattern, j) {
    for (let i = 0; i < pattern.entering.width; i++) {
        if (pattern.entering.get_shaft(i) === j + 1) return false;
    }
    return true;
}

const flip = (v, value) => (v === 0 ? value : -v);

// Bounding rectangle of the pegplan's used cells (any positive value):
// shafts s1..s2, wefts j1..j2. Empty when s2 < s1 or j2 < j1. Port of
// GetFirstTritt / GetLastTritt.
export function pegplanBounds(pattern) {
    const peg = pattern.pegplan;
    const used = (s, j) => peg.get(s, j) > 0;
    const firstCol = () => {
        for (let s = 0; s < peg.width; s++) {
            for (let j = 0; j < peg.height; j++) if (used(s, j)) return s;
        }
        return peg.width - 1;
    };
    const lastCol = () => {
        for (let s = peg.width - 1; s >= 0; s--) {
            for (let j = 0; j < peg.height; j++) if (used(s, j)) return s;
        }
        return 0;
    };
    const firstRow = () => {
        for (let j = 0; j < peg.height; j++) {
            for (let s = 0; s < peg.width; s++) if (used(s, j)) return j;
        }
        return peg.height - 1;
    };
    const lastRow = () => {
        for (let j = peg.height - 1; j >= 0; j--) {
            for (let s = 0; s < peg.width; s++) if (used(s, j)) return j;
        }
        return 0;
    };
    return { s1: firstCol(), s2: lastCol(), j1: firstRow(), j2: lastRow() };
}

// ---------- switch side -----------------------------------------------

// Turn the fabric over: invert the tie-up over every used treadle and
// shaft (or, in pegplan mode, the pegplan over its used rectangle) and
// mirror the warp side (threading, warp colours, reed) around the warp
// centre. Recomputes the weave.
export function switchSide(pattern, value, { pegplan = false } = {}) {
    if (pegplan) {
        // Every threaded shaft (the threading doesn't change, so a
        // second switch covers the same shafts) within the used wefts.
        // The weft range is computed once up front so the iteration
        // isn't influenced by the mutations. A weft with every threaded
        // shaft raised becomes empty, though, and drops out of the next
        // switch's range when it is the first or last used one: in the
        // pegplan alone it can't be told from "no weft".
        const { j1, j2 } = pegplanBounds(pattern);
        for (let j = j1; j <= j2; j++) {
            for (let s = 0; s < pattern.pegplan.width; s++) {
                if (isFreeShaft(pattern, s)) continue;
                pattern.pegplan.set(s, j, flip(pattern.pegplan.get(s, j), value));
            }
        }
    } else {
        for (let i = 0; i < pattern.tieup.width; i++) {
            if (isFreeTreadle(pattern, i)) continue;
            for (let j = 0; j < pattern.tieup.height; j++) {
                if (isFreeShaft(pattern, j)) continue;
                pattern.tieup.set(i, j, flip(pattern.tieup.get(i, j), value));
            }
        }
    }
    if (pattern.min_x <= pattern.max_x) {
        const mid = Math.floor((pattern.max_x - pattern.min_x + 1) / 2);
        for (let i = pattern.min_x; i < pattern.min_x + mid; i++) {
            const mirror = pattern.max_x - (i - pattern.min_x);
            const e = pattern.entering.get_shaft(i);
            pattern.entering.set_shaft(i, pattern.entering.get_shaft(mirror));
            pattern.entering.set_shaft(mirror, e);
            const cw = pattern.color_warp.get(i, 0);
            pattern.color_warp.set(i, 0, pattern.color_warp.get(mirror, 0));
            pattern.color_warp.set(mirror, 0, cw);
            const r = pattern.reed.get(i, 0);
            pattern.reed.set(i, 0, pattern.reed.get(mirror, 0));
            pattern.reed.set(mirror, 0, r);
        }
    }
    pattern.recalc_weave();
}

// ---------- pegplan ----------------------------------------------------
//
// These change the pegplan and the weave in lockstep; the caller
// updates the extent and repeat afterwards.

// Toggle every cell of the pegplan's used rectangle (empty cells get
// `value`, set ones are switched off) and derive the weave from it.
// (Inverting the weave rows directly also flipped warps threaded on a
// shaft outside the rectangle, so the weave disagreed with the pegplan
// until the next recalculation.)
export function invertPegplan(pattern, value) {
    const { s1, s2, j1, j2 } = pegplanBounds(pattern);
    if (s2 < s1 || j2 < j1) return;
    for (let j = j1; j <= j2; j++) {
        for (let s = s1; s <= s2; s++) {
            pattern.pegplan.set(s, j, flip(pattern.pegplan.get(s, j), value));
        }
    }
    pattern._recalc_weave_from_pegplan();
}

// Swap the used weft range top to bottom, in the pegplan and the weave.
export function mirrorPegplan(pattern) {
    if (pattern.min_y >= pattern.max_y) return;
    const half = pattern.min_y + Math.floor((pattern.max_y - pattern.min_y) / 2);
    for (let j = pattern.min_y; j <= half; j++) {
        const j2 = pattern.max_y - (j - pattern.min_y);
        if (j >= j2) break;
        for (let s = 0; s < pattern.pegplan.width; s++) {
            const a = pattern.pegplan.get(s, j);
            pattern.pegplan.set(s, j, pattern.pegplan.get(s, j2));
            pattern.pegplan.set(s, j2, a);
        }
        if (pattern.min_x <= pattern.max_x) {
            for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                const a = pattern.weave.get(i, j);
                pattern.weave.set(i, j, pattern.weave.get(i, j2));
                pattern.weave.set(i, j2, a);
            }
        }
    }
}

// Wipe the pegplan and the weave (desktop ClearTrittfolgeClick).
export function clearPegplan(pattern) {
    pattern.pegplan.data.fill(0);
    pattern.weave.data.fill(0);
}

// ---------- repeat extension / reduction -------------------------------

function copyWarp(pattern, from, to, withColors) {
    pattern.entering.set_shaft(to, pattern.entering.get_shaft(from));
    if (withColors) pattern.color_warp.set(to, 0, pattern.color_warp.get(from, 0));
    for (let j = pattern.min_y; j <= pattern.max_y; j++) {
        pattern.weave.set(to, j, pattern.weave.get(from, j));
    }
}

function clearWarp(pattern, i) {
    pattern.entering.set_shaft(i, 0);
    for (let j = pattern.min_y; j <= pattern.max_y; j++) pattern.weave.set(i, j, 0);
}

function copyWeft(pattern, from, to, withColors, pegplan) {
    const grid = pegplan ? pattern.pegplan : pattern.treadling;
    for (let k = 0; k < grid.width; k++) grid.set(k, to, grid.get(k, from));
    if (withColors) pattern.color_weft.set(0, to, pattern.color_weft.get(0, from));
    for (let i = pattern.min_x; i <= pattern.max_x; i++) {
        pattern.weave.set(i, to, pattern.weave.get(i, from));
    }
}

function clearWeft(pattern, j, pegplan) {
    const grid = pegplan ? pattern.pegplan : pattern.treadling;
    for (let k = 0; k < grid.width; k++) grid.set(k, j, 0);
    for (let i = pattern.min_x; i <= pattern.max_x; i++) pattern.weave.set(i, j, 0);
}

// Keep one warp repeat and replicate it `times` times (-1: up to the
// full width; 1: reduce to a single repeat). The repeat comes from
// Pattern.calcRapport, or the whole extent when there is none.
export function repeatWarp(pattern, times, { withColors = false } = {}) {
    pattern.recalc_weave_extent();
    const i1 = pattern.min_x, i2 = pattern.max_x;
    if (i1 > i2) return;
    pattern.calcRapport();
    let a = pattern.rapport_k_a;
    let b = pattern.rapport_k_b;
    if (a === 0 && b === -1) { a = i1; b = i2; }
    for (let i = i1; i < a; i++) clearWarp(pattern, i);
    for (let i = b + 1; i <= i2; i++) clearWarp(pattern, i);
    const len = b - a + 1;
    let end = times !== -1 ? a + len * times : pattern.weave.width;
    if (end > pattern.weave.width) end = pattern.weave.width;
    for (let i = b + 1; i < end; i++) {
        copyWarp(pattern, a + (i - b - 1) % len, i, withColors);
    }
    pattern.recalc_weave_extent();
}

// The same for the weft (treadling, or the pegplan in pegplan mode).
export function repeatWeft(pattern, times,
                           { withColors = false, pegplan = false } = {}) {
    pattern.recalc_weave_extent();
    const j1 = pattern.min_y, j2 = pattern.max_y;
    if (j1 > j2) return;
    pattern.calcRapport();
    let a = pattern.rapport_s_a;
    let b = pattern.rapport_s_b;
    if (a === 0 && b === -1) { a = j1; b = j2; }
    for (let j = j1; j < a; j++) clearWeft(pattern, j, pegplan);
    for (let j = b + 1; j <= j2; j++) clearWeft(pattern, j, pegplan);
    const len = b - a + 1;
    let end = times !== -1 ? a + len * times : pattern.weave.height;
    if (end > pattern.weave.height) end = pattern.weave.height;
    for (let j = b + 1; j < end; j++) {
        copyWeft(pattern, a + (j - b - 1) % len, j, withColors, pegplan);
    }
    pattern.recalc_weave_extent();
}

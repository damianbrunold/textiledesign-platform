// Lancée (Lancierung): spread the warps or wefts of a range apart by
// inserting empty threads in a ratio, behind the dialog in lancee.js.
//
//   lanceeRange(pattern, cursor, axis)       axis "warp" | "weft"
//   lanceePlan(vv, a, b, size)               -> plan | null
//   applyWarpLancee(pattern, plan, a, b)
//   applyWeftLancee(pattern, plan, a, b, sideGrid)
//
// vv is the dialog's ratio (up to 6 numbers): vv[0] original threads,
// then vv[1] empty ones, vv[2] original, ... cyclically. An odd count of
// numbers folds the last into the first (3:1:2 is 5:1). The plan lists,
// for each position a .. a + plan.length - 1, the source thread or -1
// for an inserted empty one; threads right of b move right by the
// number of inserted ones. No DOM, no editor globals; port of
// utilities.cpp::KettLancierungClick / SchussLancierungClick. The
// dialog keeps the undo command.

// The range a lancée spreads: a selection's columns (warp) or rows
// (weft), otherwise the pattern extent. Empty when a > b.
export function lanceeRange(pattern, cursor, axis) {
    const hasSel = (cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2);
    if (axis === "warp") {
        if (hasSel) {
            return { a: Math.min(cursor.x1, cursor.x2), b: Math.max(cursor.x1, cursor.x2) };
        }
        return { a: pattern.min_x, b: pattern.max_x };
    }
    if (hasSel) {
        return { a: Math.min(cursor.y1, cursor.y2), b: Math.max(cursor.y1, cursor.y2) };
    }
    return { a: pattern.min_y, b: pattern.max_y };
}

// The ratio as used: { vv, maxi } with maxi the (even) number of
// entries, or null when there is nothing to insert.
export function lanceeRatio(vvIn) {
    const vv = vvIn.slice();
    let maxi = 0;
    for (let k = 0; k < 6; k++) if (vv[k] !== 0) maxi = k + 1;
    if (maxi > 1 && (maxi % 2) !== 0) {
        vv[0] += vv[maxi - 1];
        vv[maxi - 1] = 0;
        maxi--;
    }
    if (maxi <= 1) return null;
    return { vv, maxi };
}

// Source plan for spreading threads a..b of an axis of `size` threads,
// or null when there is nothing to do. The plan never reaches the last
// thread of the axis (desktop: a + needed < MAXX1).
export function lanceePlan(vvIn, a, b, size) {
    const ratio = lanceeRatio(vvIn);
    if (!ratio) return null;
    const { vv, maxi } = ratio;
    if (a > b) return null;

    // Compute "needed" extra width (port of legacy do/while).
    let needed = b - a + 1;
    {
        let i = a, idx = 0;
        do {
            let v = vv[idx];
            while (i <= b && v-- > 0) i++;
            idx = (idx + 1) % maxi;
            if (i <= b + 1) {
                needed += vv[idx];
                idx = (idx + 1) % maxi;
            }
        } while (i <= b);
    }
    if (a + needed >= size) {
        needed = size - 1 - a;
    }
    if (needed <= 0) return null;

    // buff[0..needed-1]: source index, or -1 for blank.
    const buff = new Array(needed);
    let idx = 0, ii = 0;
    for (let i = a; i <= b; i++) {
        for (let j = 0; j < vv[idx]; j++) {
            buff[ii++] = i++;
            // Stop after the range's last thread (i is past it now).
            // The desktop checks i - 1 > b and so copies thread b + 1
            // in place of the inserted thread after an incomplete run.
            if (ii >= needed || i > b) break;
        }
        i--;
        if (ii >= needed) break;
        idx = (idx + 1) % maxi;
        for (let j = 0; j < vv[idx]; j++) {
            buff[ii++] = -1;
            if (ii >= needed) break;
        }
        idx = (idx + 1) % maxi;
        if (ii >= needed) break;
    }
    return buff;
}

// Spread warps a..b by the plan: threading and weave columns move.
export function applyWarpLancee(pattern, buff, a, b) {
    const needed = buff.length;
    // Shift right side to make room.
    const maxii = Math.min(pattern.weave.width, pattern.max_x - b + 1);
    for (let i = b + maxii - 1; i > b; i--) {
        const dst = a + needed + i - b - 1;
        if (dst >= pattern.entering.width) continue;
        pattern.entering.set_shaft(dst, pattern.entering.get_shaft(i));
        for (let j = pattern.min_y; j <= pattern.max_y; j++) {
            pattern.weave.set(dst, j, pattern.weave.get(i, j));
        }
    }
    // Auseinanderziehen — write expanded values from buff.
    for (let i = a + needed - 1; i >= a; i--) {
        const src = buff[i - a];
        if (src === undefined) continue;
        if (src === -1) {
            pattern.entering.set_shaft(i, 0);
            for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                pattern.weave.set(i, j, 0);
            }
        } else {
            pattern.entering.set_shaft(i, pattern.entering.get_shaft(src));
            for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                pattern.weave.set(i, j, pattern.weave.get(src, j));
            }
        }
    }
    pattern.recalc_weave_extent();
}

// Spread wefts a..b by the plan: the rows of sideGrid (treadling or
// pegplan) and of the weave move.
export function applyWeftLancee(pattern, buff, a, b, sideGrid) {
    const needed = buff.length;
    const maxjj = Math.min(pattern.weave.height, pattern.max_y - b + 1);
    // Shift right side rows down to make room.
    for (let j = b + maxjj - 1; j > b; j--) {
        const dst = a + needed + j - b - 1;
        if (dst >= pattern.weave.height) continue;
        for (let i = 0; i < sideGrid.width; i++) {
            sideGrid.set(i, dst, sideGrid.get(i, j));
        }
        for (let i = pattern.min_x; i <= pattern.max_x; i++) {
            pattern.weave.set(i, dst, pattern.weave.get(i, j));
        }
    }
    // Apply buff to rows [a..a+needed-1].
    for (let j = a + needed - 1; j >= a; j--) {
        const src = buff[j - a];
        if (src === undefined) continue;
        if (src === -1) {
            for (let i = 0; i < sideGrid.width; i++) sideGrid.set(i, j, 0);
            for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                pattern.weave.set(i, j, 0);
            }
        } else {
            for (let i = 0; i < sideGrid.width; i++) {
                sideGrid.set(i, j, sideGrid.get(i, src));
            }
            for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                pattern.weave.set(i, j, pattern.weave.get(i, src));
            }
        }
    }
    pattern.recalc_weave_extent();
}

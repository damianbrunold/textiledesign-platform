// Block and range substitution (desktop Blockmuster / Bereichmuster):
// the substitution itself and the muster slot presets behind the
// dialog in blocks.js.
//
//   musterRange(slots)                      -> { mx, my }
//   toggleMusterValue(s, current)
//   stampMusterTwill(m, h, s, current), stampMusterSatin(m, n, current),
//   stampMusterPanama(m, h, s, current), recolourMuster(from, to, ...)
//   substituteBlocks(pattern, blockmuster, { mx, my, einzugZ, trittfolgeZ })
//   rangeFillRect(pattern, cursor)          -> { i0, i1, j0, j1 }
//   fillRanges(pattern, bereichmuster, rect)
//
// Block substitution replaces every tie-up cell (value 0 = base pattern,
// n = pattern n) with that slot as an (mx + 1) x (my + 1) tile, and
// expands threading and treadling by the same factors so the weave
// lines up. Range substitution replaces every weave cell of range n
// with bereichmuster[n] tiled over the weave. No DOM, no editor
// globals; ports of blockmuster.cpp / blockmusterdialog.cpp and
// bereiche.cpp::BereicheFillPattern. The dialog keeps the undo command
// and the pegplan handling.

// Highest used column / row over all ten slots (-1 / -1 when all are
// empty): the tile size is (mx + 1) x (my + 1).
export function musterRange(slots) {
    let mx = -1, my = -1;
    for (let k = 0; k < 10; k++) {
        for (let i = 0; i < 12; i++) {
            for (let j = 0; j < 12; j++) {
                if (slots[k].get(i, j) !== 0) {
                    if (mx < i) mx = i;
                    if (my < j) my = j;
                }
            }
        }
    }
    return { mx, my };
}

// Toggled cell value in slot `current`: set cells get the slot number
// (1 for the base pattern), set cells are cleared.
export function toggleMusterValue(s, current) {
    if (s === 0) return current !== 0 ? current : 1;
    return 0;
}

const slotValue = (current) => (current !== 0 ? current : 1);

// Twill h/s (h raised, s lowered per column) in an (h + s) square.
export function stampMusterTwill(m, h, s, current) {
    m.clear();
    const n = h + s;
    const v = slotValue(current);
    if (h <= s) {
        for (let i = 0; i < n; i++)
            for (let j = i; j < i + h; j++) m.set(i, j % n, v);
    } else {
        for (let i = 0; i < n; i++)
            for (let j = i + s; j < i + n; j++) m.set(i, j % n, v);
    }
}

// Desktop satin tables (column, row).
export const MUSTER_SATIN = Object.freeze({
    5: [[0, 0], [1, 2], [2, 4], [3, 1], [4, 3]],
    7: [[0, 2], [1, 6], [2, 3], [3, 0], [4, 4], [5, 1], [6, 5]],
    9: [[0, 0], [1, 2], [2, 4], [3, 6], [4, 8], [5, 1], [6, 3], [7, 5], [8, 7]],
});

// Satin n x n; false (slot untouched except cleared) for an unknown n.
export function stampMusterSatin(m, n, current) {
    m.clear();
    const offsets = MUSTER_SATIN[n];
    if (!offsets) return false;
    const v = slotValue(current);
    for (const [i, j] of offsets) m.set(i, j, v);
    return true;
}

// Panama (basket) h/s: an h x h block, then an s x s block diagonally.
export function stampMusterPanama(m, h, s, current) {
    m.clear();
    const v = slotValue(current);
    for (let i = 0; i < h; i++)
        for (let j = 0; j < h; j++) m.set(i, j, v);
    for (let i = h; i < h + s; i++)
        for (let j = h; j < h + s; j++) m.set(i, j, v);
}

// Copy slot `from` into slot `to` within the 0..mx x 0..my range,
// recoloured to slot `current`'s value (double toggle).
export function recolourMuster(from, to, current, mx, my) {
    for (let i = 0; i <= mx; i++) {
        for (let j = 0; j <= my; j++) {
            const c = toggleMusterValue(
                toggleMusterValue(from.get(i, j), current), current);
            to.set(i, j, c);
        }
    }
}

// ---------- block substitution ----------------------------------------

// Each threaded warp i in the extent becomes warps i*count .. i*count +
// count - 1 on shafts (s-1)*count + 1 .. (s-1)*count + count, rising
// (einzugZ) or falling. Shafts beyond the tie-up are skipped (the
// desktop adds shafts instead).
export function blockExpandThreading(pattern, count, einzugZ) {
    const ka = pattern.min_x, kb = pattern.max_x;
    if (ka > kb) return;
    const len = kb - ka + 1;
    const pData = new Array(len);
    for (let i = ka; i <= kb; i++) {
        pData[i - ka] = pattern.entering.get_shaft(i);
        pattern.entering.set_shaft(i, 0);
    }
    const maxWarp = pattern.entering.width;
    const maxShaft = pattern.tieup.height;
    for (let i = ka; i <= kb; i++) {
        const v = pData[i - ka];
        if (v <= 0) continue;
        if (einzugZ) {
            for (let k = 0; k < count; k++) {
                const idx = i * count + k;
                if (idx >= maxWarp) break;
                const newShaft = (v - 1) * count + k + 1;
                if (newShaft > maxShaft) continue;
                pattern.entering.set_shaft(idx, newShaft);
            }
        } else {
            for (let k = 0; k < count; k++) {
                const idx = (i + 1) * count - 1 - k;
                if (idx >= maxWarp || idx < 0) break;
                const newShaft = (v - 1) * count + k + 1;
                if (newShaft > maxShaft) continue;
                pattern.entering.set_shaft(idx, newShaft);
            }
        }
    }
}

// Each treadled cell (treadle i, weft j) in the extent becomes the
// diagonal of a count x count block (treadles i*count.., wefts
// j*count..), rising (trittfolgeZ) or falling.
export function blockExpandTreadling(pattern, count, trittfolgeZ) {
    const sa = pattern.min_y, sb = pattern.max_y;
    if (sa > sb) return;
    const w = pattern.treadling.width;
    const pData = new Array((sb - sa + 1) * w);
    for (let j = sa; j <= sb; j++) {
        for (let i = 0; i < w; i++) {
            pData[(j - sa) * w + i] = pattern.treadling.get(i, j);
            pattern.treadling.set(i, j, 0);
        }
    }
    const maxWeft = pattern.treadling.height;
    const maxTreadle = pattern.treadling.width;
    for (let j = sa; j <= sb; j++) {
        for (let i = 0; i < w; i++) {
            if (pData[(j - sa) * w + i] === 0) continue;
            if (trittfolgeZ) {
                for (let k = 0; k < count; k++) {
                    const newJ = j * count + k;
                    if (newJ >= maxWeft) break;
                    const newI = i * count + k;
                    if (newI >= maxTreadle) continue;
                    pattern.treadling.set(newI, newJ, 1);
                }
            } else {
                for (let k = 0; k < count; k++) {
                    const newJ = j * count + k;
                    if (newJ >= maxWeft) break;
                    const newI = (i + 1) * count - 1 - k;
                    if (newI >= maxTreadle || newI < 0) continue;
                    pattern.treadling.set(newI, newJ, 1);
                }
            }
        }
    }
}

// Every tie-up cell (treadle i, shaft j) inside the bounding box of the
// used cells becomes blockmuster[value] as an x by y tile at (x*i, y*j).
// An empty tie-up stays empty.
export function blockExpandTieup(pattern, x, y, blockmuster) {
    const w = pattern.tieup.width, h = pattern.tieup.height;
    const pData = new Array(h * w);
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            pData[j * w + i] = pattern.tieup.get(i, j);
            pattern.tieup.set(i, j, 0);
        }
    }
    let i1 = w - 1, i2 = 0, j1 = h - 1, j2 = 0, nonempty = false;
    for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
            if (pData[j * w + i] !== 0) {
                if (i1 > i) i1 = i;
                if (i2 < i) i2 = i;
                if (j1 > j) j1 = j;
                if (j2 < j) j2 = j;
                nonempty = true;
            }
        }
    }
    if (!nonempty) return;
    for (let i = i1; i <= i2; i++) {
        for (let j = j1; j <= j2; j++) {
            const bindung = pData[j * w + i];
            if (bindung < 0 || bindung >= 10) continue;
            for (let ii = x * i; ii < x * (i + 1); ii++) {
                if (ii >= w) break;
                for (let jj = y * j; jj < y * (j + 1); jj++) {
                    if (jj >= h) break;
                    const v = blockmuster[bindung].get(ii - x * i, jj - y * j);
                    pattern.tieup.set(ii, jj, v);
                }
            }
        }
    }
}

// The whole block substitution with tile size (mx + 1) x (my + 1):
// threading expanded by my + 1, treadling by mx + 1, tie-up
// substituted, weave recalculated (from the treadling: the caller
// switches pegplan mode off around it).
export function substituteBlocks(pattern, blockmuster, { mx, my, einzugZ, trittfolgeZ }) {
    if (mx < 0 || my < 0) return false;
    const x = mx + 1;
    const y = my + 1;
    blockExpandThreading(pattern, y, einzugZ);
    blockExpandTreadling(pattern, x, trittfolgeZ);
    blockExpandTieup(pattern, x, y, blockmuster);
    pattern.recalc_weave_extent();
    pattern.recalc_weave();
    return true;
}

// ---------- range substitution ----------------------------------------

// The cells range substitution works on: a weave selection of more
// than one cell, otherwise the pattern extent (empty when i0 > i1 or
// j0 > j1).
export function rangeFillRect(pattern, cursor) {
    const hasSel = (cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2);
    if (hasSel && cursor.selected_part === "weave") {
        return {
            i0: Math.min(cursor.x1, cursor.x2),
            i1: Math.max(cursor.x1, cursor.x2),
            j0: Math.min(cursor.y1, cursor.y2),
            j1: Math.max(cursor.y1, cursor.y2),
        };
    }
    return { i0: pattern.min_x, i1: pattern.max_x,
             j0: pattern.min_y, j1: pattern.max_y };
}

// Replace each weave cell of value n (0 = unset) in rect by
// bereichmuster[n] tiled from the weave origin: cell (i, j) takes
// m.get(i % sizeX, j % sizeY). Empty slots leave their cells alone.
export function fillRanges(pattern, bereichmuster, { i0, i1, j0, j1 }) {
    if (i0 > i1 || j0 > j1) return;
    for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
            const bindung = pattern.weave.get(i, j);
            if (bindung < 0 || bindung >= 10) continue;
            const m = bereichmuster[bindung];
            const sx = m.sizeX(), sy = m.sizeY();
            if (sx === 0 || sy === 0) continue;
            pattern.weave.set(i, j, m.get(i % sx, j % sy));
        }
    }
}

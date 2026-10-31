// Binding generators on the weave grid: atlas / satin and twill
// insertion, and twill completion.
//
//   stampAtlas(grid, n, i0, j0, value)        n in ATLAS_OFFSETS
//   stampTwill(grid, h, s, i0, j0, value)     h up, s down
//   completeTwill(grid, selection, value)
//
// Each sets cells to `value` (the editor's current range) and returns
// the block to select afterwards, as { i1, j1, i2, j2 }, or null when
// there is nothing to do. Cells outside the grid are skipped. Ports of
// insertbindung.cpp::AtlasEinfuegen / KoeperEinfuegen and
// utilities.cpp::FillKoeper, moved out of the editor (which keeps the
// undo command, the cursor and the recalculation).

// Row offset of the cell in each of the n columns (desktop table).
export const ATLAS_OFFSETS = Object.freeze({
    5: [0, 2, 4, 1, 3],
    6: [0, 2, 4, 1, 5, 3],
    7: [2, 6, 3, 0, 4, 1, 5],
    8: [2, 5, 0, 3, 6, 1, 4, 7],
    9: [0, 2, 4, 6, 8, 1, 3, 5, 7],
    10: [0, 7, 4, 1, 8, 5, 2, 9, 6, 3],
});

function block(grid, i0, j0, n) {
    return {
        i1: i0, j1: j0,
        i2: Math.min(i0 + n - 1, grid.width - 1),
        j2: Math.min(j0 + n - 1, grid.height - 1),
    };
}

export function stampAtlas(grid, n, i0, j0, value) {
    const offsets = ATLAS_OFFSETS[n];
    if (!offsets) return null;
    for (let di = 0; di < n; di++) {
        const i = i0 + di;
        const j = j0 + offsets[di];
        if (i >= grid.width) continue;
        if (j >= grid.height) continue;
        grid.set(i, j, value);
    }
    return block(grid, i0, j0, n);
}

// Twill: h cells per column over a period of n = h + s, shifted by one
// row per column. Two cases mirror the desktop:
//   h <= s : balanced or weft-sided — column i gets rows [i .. i + h)
//   h > s  : warp-sided — column i gets rows [i + s .. i + n)
// (both modulo n).
export function stampTwill(grid, h, s, i0, j0, value) {
    const n = h + s;
    if (n <= 0) return null;
    const first = h <= s ? 0 : s;
    const last = h <= s ? h : n;
    for (let i = 0; i < n; i++) {
        for (let j = i + first; j < i + last; j++) {
            const ii = i0 + i;
            const jj = j0 + (j % n);
            if (ii < grid.width && jj < grid.height) grid.set(ii, jj, value);
        }
    }
    return block(grid, i0, j0, n);
}

// Twill completion (Ctrl+K): a selection that is a single column (or
// row) with the seed binding is extended diagonally to the right (or
// upwards) until the twill is square or a column (row) that already
// has set cells is reached. `selection` is normalised ({ i1 <= i2,
// j1 <= j2 }).
export function completeTwill(grid, { i1, j1, i2, j2 }, value) {
    if (i1 === i2) {
        // Vertical seed → extend right.
        const dy = j2 - j1;
        if (dy <= 0) return null;
        const iStart = i1;
        let iEnd = iStart + dy;
        // Stop early at a column that already has a set cell within
        // [j1..j2].
        let i = iStart + 1;
        for (; i <= iEnd && i < grid.width; i++) {
            let blocked = false;
            for (let j = j1; j <= j2; j++) {
                if (grid.get(i, j) > 0) { blocked = true; break; }
            }
            if (blocked) break;
        }
        iEnd = i - 1;
        for (let ii = iStart + 1; ii <= iEnd; ii++) {
            for (let j = j1; j <= j1 + dy; j++) {
                let jj = j - j1 - (ii - iStart);
                while (jj < 0) jj += dy + 1;
                while (jj > dy) jj -= dy + 1;
                if (grid.get(iStart, j1 + jj) > 0) grid.set(ii, j, value);
            }
        }
        // Select the resulting twill block (the desktop updates
        // selection.end.i to iEnd).
        return { i1: iStart, j1, i2: Math.min(iEnd, grid.width - 1), j2 };
    }
    if (j1 === j2) {
        // Horizontal seed → extend upward.
        const dx = i2 - i1;
        if (dx <= 0) return null;
        const jStart = j1;
        let jEnd = jStart + dx;
        let j = jStart + 1;
        for (; j <= jEnd && j < grid.height; j++) {
            let blocked = false;
            for (let i = i1; i <= i2; i++) {
                if (grid.get(i, j) > 0) { blocked = true; break; }
            }
            if (blocked) break;
        }
        jEnd = j - 1;
        for (let jj = jStart + 1; jj <= jEnd; jj++) {
            for (let i = i1; i <= i1 + dx; i++) {
                let ii = i - i1 - (jj - jStart);
                while (ii < 0) ii += dx + 1;
                while (ii > dx) ii -= dx + 1;
                if (grid.get(i1 + ii, jStart) > 0) grid.set(i, jj, value);
            }
        }
        return { i1, j1: jStart, i2, j2: Math.min(jEnd, grid.height - 1) };
    }
    return null;
}

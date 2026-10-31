// The DB-WEAVE data model: grids, the threading (Entering), the
// block / range substitution patterns (Muster) and the Pattern that
// ties them together (weave calculation in both directions, repeat
// detection). No DOM and no editor globals: the editor connects
// through Pattern's hooks.

export class Grid {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Array(this.width * this.height);
        this.data.fill(0);
    }

    clear() {
        this.data.fill(0);
    }

    clearRow(j) {
        for (let i = 0; i < this.width; i++) {
            this.set(i, j, 0);
        }
    }

    clearCol(i) {
        for (let j = 0; j < this.height; j++) {
            this.set(i, j, 0);
        }
    }

    clearRange(i1, j1, i2, j2) {
        for (let i = i1; i <= i2; i++) {
            for (let j = j1; j <= j2; j++) {
                this.set(i, j, 0);
            }
        }
    }

    // Empty cells get `value` (the editor passes its current range),
    // set cells are switched off (negated).
    invertRange(i1, j1, i2, j2, value = 1) {
        for (let i = i1; i <= i2; i++) {
            for (let j = j1; j <= j2; j++) {
                const val = this.get(i, j);
                if (val === 0) this.set(i, j, value);
                else this.set(i, j, -val);
            }
        }
    }

    // Flip the rows (top <-> bottom) of the region.
    mirrorV(i1, j1, i2, j2) {
        if (j1 === j2) return;
        for (let j = j1; j <= j1 + Math.trunc((j2-j1) / 2); j++) {
            for (let i = i1; i <= i2; i++) {
                const v = this.get(i, j);
                this.set(i, j, this.get(i, j2 - (j-j1)));
                this.set(i, j2 - (j-j1), v);
            }
        }
    }

    // Flip the columns (left <-> right) of the region.
    mirrorH(i1, j1, i2, j2) {
        if (i1 === i2) return;
        for (let i = i1; i <= i1 + Math.trunc((i2-i1)/2); i++) {
            for (let j = j1; j <= j2; j++) {
                const v = this.get(i, j);
                this.set(i, j, this.get(i2 - (i-i1), j));
                this.set(i2 - (i-i1), j, v);
            }
        }
    }

    rotateRight(i1, j1, i2, j2) {
        if ((i2-i1) != (j2-j1)) return;
        const w = i2 - i1 + 1;
        const data = [];
        data[w - 1] = 0;
        data.fill(0);
        const bidx = function(i, j) { return i + j * w; }
        const bget = function(i, j) { return data[bidx(i, j)]; }
        const bset = function(i, j, value) { data[bidx(i, j)] = value; }
        // copy to buffer
        for (let i = i1; i <= i2; i++) {
            for (let j = j1; j <= j2; j++) {
                bset(i - i1, j - j1, this.get(i, j));
            }
        }
        // restore in rotated form
        for (let i = 0; i < w; i++) {
            for (let j = 0; j < w; j++) {
                this.set(i1 + j, j1 + w - 1 - i, bget(i, j));
            }
        }
    }

    rotateLeft(i1, j1, i2, j2) {
        if ((i2-i1) != (j2-j1)) return;
        const w = i2 - i1 + 1;
        const data = [];
        data[w - 1] = 0;
        data.fill(0);
        const bidx = function(i, j) { return i + j * w; }
        const bget = function(i, j) { return data[bidx(i, j)]; }
        const bset = function(i, j, value) { data[bidx(i, j)] = value; }
        // copy to buffer
        for (let i = i1; i <= i2; i++) {
            for (let j = j1; j <= j2; j++) {
                bset(i - i1, j - j1, this.get(i, j));
            }
        }
        // restore in rotated form
        for (let i = 0; i < w; i++) {
            for (let j = 0; j < w; j++) {
                this.set(i1 + w - 1 - j, j1 + i, bget(i, j));
            }
        }
    }

    idx(i, j) {
        return i + j * this.width;
    }

    get(i, j) {
        return this.data[this.idx(i, j)];
    }

    set(i, j, value) {
        this.data[this.idx(i, j)] = value;
    }

    toggle(i, j, default_value=1) {
        const idx = this.idx(i, j);
        const value = this.data[idx];
        if (value === 0) this.data[idx] = default_value;
        else this.data[idx] = -value;
    }

    rowsEqual(j1, j2) {
        for (let i = 0; i < this.width; i++) {
            // we only compare values >= 0
            // everything <= 0 is "empty"
            const v1 = Math.max(0, this.get(i, j1));
            const v2 = Math.max(0, this.get(i, j2));
            if (v1 != v2) return false;
        }
        return true;
    }

    colsEqual(i1, i2) {
        for (let j = 0; j < this.height; j++) {
            // we only compare values >= 0
            // everything <= 0 is "empty"
            const v1 = Math.max(0, this.get(i1, j));
            const v2 = Math.max(0, this.get(i2, j));
            if (v1 != v2) return false;
        }
        return true;
    }

    copyRow(src, dst) {
        for (let i = 0; i < this.width; i++) {
            this.set(i, dst, this.get(i, src));
        }
    }

    copyCol(src, dst) {
        for (let j = 0; j < this.height; j++) {
            this.set(dst, j, this.get(src, j));
        }
    }

    isColEmpty(i) {
        for (let j = 0; j < this.height; j++) {
            if (this.get(i, j) > 0) return false;
        }
        return true;
    }

    isRowEmpty(j) {
        for (let i = 0; i < this.width; i++) {
            if (this.get(i, j) > 0) return false;
        }
        return true;
    }

    // Structural in-place shifts. Grid dimensions stay fixed: when inserting
    // a row/col, the last one is dropped; when removing, the vacated
    // position at the far end becomes empty.
    insertRow(at) {
        for (let j = this.height - 1; j > at; j--) {
            for (let i = 0; i < this.width; i++) this.set(i, j, this.get(i, j - 1));
        }
        for (let i = 0; i < this.width; i++) this.set(i, at, 0);
    }

    removeRow(at) {
        for (let j = at; j < this.height - 1; j++) {
            for (let i = 0; i < this.width; i++) this.set(i, j, this.get(i, j + 1));
        }
        for (let i = 0; i < this.width; i++) this.set(i, this.height - 1, 0);
    }

    insertCol(at) {
        for (let i = this.width - 1; i > at; i--) {
            for (let j = 0; j < this.height; j++) this.set(i, j, this.get(i - 1, j));
        }
        for (let j = 0; j < this.height; j++) this.set(at, j, 0);
    }

    removeCol(at) {
        for (let i = at; i < this.width - 1; i++) {
            for (let j = 0; j < this.height; j++) this.set(i, j, this.get(i + 1, j));
        }
        for (let j = 0; j < this.height; j++) this.set(this.width - 1, j, 0);
    }

    // Grow or shrink the grid in place, preserving values in the overlap
    // and zero-filling new cells. Used by the Optionen dialog when the
    // user changes warp/weft/shaft/treadle counts on an existing pattern.
    resize(newW, newH) {
        const w = Math.min(this.width, newW);
        const h = Math.min(this.height, newH);
        const nd = new Array(newW * newH).fill(0);
        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                nd[i + j * newW] = this.data[i + j * this.width];
            }
        }
        this.width = newW;
        this.height = newH;
        this.data = nd;
    }

    swapRows(a, b) {
        if (a === b) return;
        for (let i = 0; i < this.width; i++) {
            const va = this.get(i, a);
            this.set(i, a, this.get(i, b));
            this.set(i, b, va);
        }
    }

    swapCols(a, b) {
        if (a === b) return;
        for (let j = 0; j < this.height; j++) {
            const va = this.get(a, j);
            this.set(a, j, this.get(b, j));
            this.set(b, j, va);
        }
    }

    // Cyclic roll of a rectangular region. RollUp: each row takes the row
    // below it (row j2 wraps back from row j1). RollLeft/Right analogous.
    rollUp(i1, j1, i2, j2) {
        if (j1 === j2) return;
        const saved = [];
        for (let i = i1; i <= i2; i++) saved.push(this.get(i, j1));
        for (let j = j1; j < j2; j++) {
            for (let i = i1; i <= i2; i++) this.set(i, j, this.get(i, j + 1));
        }
        for (let i = i1; i <= i2; i++) this.set(i, j2, saved[i - i1]);
    }
    rollDown(i1, j1, i2, j2) {
        if (j1 === j2) return;
        const saved = [];
        for (let i = i1; i <= i2; i++) saved.push(this.get(i, j2));
        for (let j = j2; j > j1; j--) {
            for (let i = i1; i <= i2; i++) this.set(i, j, this.get(i, j - 1));
        }
        for (let i = i1; i <= i2; i++) this.set(i, j1, saved[i - i1]);
    }
    rollLeft(i1, j1, i2, j2) {
        if (i1 === i2) return;
        const saved = [];
        for (let j = j1; j <= j2; j++) saved.push(this.get(i1, j));
        for (let i = i1; i < i2; i++) {
            for (let j = j1; j <= j2; j++) this.set(i, j, this.get(i + 1, j));
        }
        for (let j = j1; j <= j2; j++) this.set(i2, j, saved[j - j1]);
    }
    rollRight(i1, j1, i2, j2) {
        if (i1 === i2) return;
        const saved = [];
        for (let j = j1; j <= j2; j++) saved.push(this.get(i2, j));
        for (let i = i2; i > i1; i--) {
            for (let j = j1; j <= j2; j++) this.set(i, j, this.get(i - 1, j));
        }
        for (let j = j1; j <= j2; j++) this.set(i1, j, saved[j - j1]);
    }

    // Slope: each successive row within the selection is cyclically rolled
    // along the i axis by one more cell than the previous row. Increase
    // shifts right; decrease shifts left. Corresponds to the desktop
    // "Slope Increase / Decrease" operations for diagonal-style patterns.
    slopeIncrease(i1, j1, i2, j2) {
        const w = i2 - i1 + 1;
        if (w < 2 || j1 === j2) return;
        // capture a copy of the region, then write shifted rows back.
        const buf = [];
        for (let j = j1; j <= j2; j++) {
            const row = [];
            for (let i = i1; i <= i2; i++) row.push(this.get(i, j));
            buf.push(row);
        }
        for (let j = j1; j <= j2; j++) {
            const row = buf[j - j1];
            const shift = ((j - j1) % w + w) % w;
            for (let i = 0; i < w; i++) {
                this.set(i1 + ((i + shift) % w), j, row[i]);
            }
        }
    }
    slopeDecrease(i1, j1, i2, j2) {
        const w = i2 - i1 + 1;
        if (w < 2 || j1 === j2) return;
        const buf = [];
        for (let j = j1; j <= j2; j++) {
            const row = [];
            for (let i = i1; i <= i2; i++) row.push(this.get(i, j));
            buf.push(row);
        }
        for (let j = j1; j <= j2; j++) {
            const row = buf[j - j1];
            const shift = ((j - j1) % w + w) % w;
            for (let i = 0; i < w; i++) {
                this.set(i1 + ((i - shift + w * w) % w), j, row[i]);
            }
        }
    }

    // Central symmetry: search for a cyclic (i, j) shift of the selection
    // such that the selection becomes point-symmetric — i.e. cell (i, j) in
    // the region equals cell (w-1-i, h-1-j). The desktop algorithm tries
    // every combination of RollLeft × RollUp shifts and applies the first
    // one that produces a symmetric configuration; leaves the grid
    // untouched if no such shift exists.
    //
    // Returns one of:
    //   "noop"    — region was already symmetric; nothing written
    //   "applied" — a symmetric shift was found and written back
    //   "none"    — no symmetric configuration exists; nothing written
    centralSymmetry(i1, j1, i2, j2) {
        const w = i2 - i1 + 1;
        const h = j2 - j1 + 1;
        if (w <= 0 || h <= 0) return "noop";
        const buf = new Array(w * h);
        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                buf[i * h + j] = this.get(i1 + i, j1 + j);
            }
        }
        const bget = (i, j) => buf[i * h + j];
        const bset = (i, j, v) => { buf[i * h + j] = v; };
        const isSym = () => {
            // Match desktop: only i < floor(w/2) pairs checked. For odd w
            // the middle column pairs with itself; the desktop omits a
            // palindrome check on it, so we do too.
            for (let i = 0; i < Math.floor(w / 2); i++) {
                for (let j = 0; j < h; j++) {
                    if (bget(i, j) !== bget(w - 1 - i, h - 1 - j)) return false;
                }
            }
            return true;
        };
        const rollLeft = () => {
            const t = new Array(h);
            for (let j = 0; j < h; j++) t[j] = bget(0, j);
            for (let i = 1; i < w; i++) {
                for (let j = 0; j < h; j++) bset(i - 1, j, bget(i, j));
            }
            for (let j = 0; j < h; j++) bset(w - 1, j, t[j]);
        };
        const rollUp = () => {
            const t = new Array(w);
            for (let i = 0; i < w; i++) t[i] = bget(i, 0);
            for (let j = 1; j < h; j++) {
                for (let i = 0; i < w; i++) bset(i, j - 1, bget(i, j));
            }
            for (let i = 0; i < w; i++) bset(i, h - 1, t[i]);
        };

        if (isSym()) return "noop";
        let found = false;
        outer:
        for (let i = 0; i < w; i++) {
            rollLeft();
            if (isSym()) { found = true; break; }
            for (let j = 0; j < h; j++) {
                rollUp();
                if (isSym()) { found = true; break outer; }
            }
        }
        if (!found) return "none";
        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                this.set(i1 + i, j1 + j, bget(i, j));
            }
        }
        return "applied";
    }
}


export class Entering {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Array(this.width);
        this.data.fill(0);
    }

    clear() {
        this.data.fill(0);
    }

    clearRange(i1, j1, i2, j2) {
        for (let i = i1; i <= i2; i++) {
            const shaft = this.get_shaft(i) - 1;
            if (j1 <= shaft && shaft <= j2) {
                this.set_shaft(i, 0);
            }
        };
    }

    invertRange(i1, j1, i2, j2) {
        // empty
    }

    // Swap the warps (left <-> right), as the desktop's horizontal
    // mirror of the threading does.
    mirrorH(i1, j1, i2, j2) {
        if (i1 === i2) return;
        for (let i = i1; i <= i1 + Math.trunc((i2-i1)/2); i++) {
            const shaft1 = this.get_shaft(i);
            const shaft2 = this.get_shaft(i2 - (i-i1));
            this.set_shaft(i, shaft2);
            this.set_shaft(i2 - (i-i1), shaft1);
        }
    }

    // Reverse the order of the shafts j1..j2 (vertical mirror).
    mirrorV(i1, j1, i2, j2) {
        if (j1 === j2) return;
        for (let i = i1; i <= i2; i++) {
            const shaft = this.get_shaft(i) - 1;
            if (j1 <= shaft && shaft <= j2) {
                const new_shaft = j2 - (shaft - j1);
                this.set_shaft(i, new_shaft + 1);
            }
        }
    }

    rotateRight(i1, j1, i2, j2) {
        // empty
    }

    rotateLeft(i1, j1, i2, j2) {
        // empty
    }

    get_shaft(i) {
        return this.data[i];
    }

    set_shaft(i, shaft) {
        this.data[i] = shaft;
    }

    get(i, j) {
        return this.get_shaft(i) - 1 == j ? 1 : 0;
    }

    set(i, j, value) {
        if (value > 0) this.set_shaft(i, j + 1);
        else this.set_shaft(i, 0);
    }

    toggle(i, j) {
        const shaft = this.get_shaft(i);
        if (shaft !== j + 1) {
            this.set_shaft(i, j + 1);
        }
    }

    // Resize. width is the warp count; height is max_shafts. Shafts that
    // would point past the new max are reset to 0.
    resize(newW, newH) {
        const w = Math.min(this.width, newW);
        const nd = new Array(newW).fill(0);
        for (let i = 0; i < w; i++) {
            const s = this.data[i];
            nd[i] = (s > 0 && s <= newH) ? s : 0;
        }
        this.width = newW;
        this.height = newH;
        this.data = nd;
    }

    // Insert empty slot at index `at`; shift right; last slot dropped.
    insertAt(at) {
        for (let i = this.width - 1; i > at; i--) {
            this.set_shaft(i, this.get_shaft(i - 1));
        }
        this.set_shaft(at, 0);
    }

    removeAt(at) {
        for (let i = at; i < this.width - 1; i++) {
            this.set_shaft(i, this.get_shaft(i + 1));
        }
        this.set_shaft(this.width - 1, 0);
    }
}


// Muster — 12×12 small binding pattern used by the block-substitution
// (Blockmuster) and range-substitution (Bereichmuster) editors. Cell
// values are 0 (empty) or 1..9 (which sub-pattern). Verbatim port of
// blockmuster.h / .cpp.
export class Muster {
    constructor() {
        this.maxx = 12;
        this.maxy = 12;
        this.feld = new Array(this.maxx * this.maxy).fill(0);
    }
    set(i, j, value) {
        if (i < 0 || j < 0 || i >= this.maxx || j >= this.maxy) return;
        this.feld[i + this.maxx * j] = value;
    }
    get(i, j) {
        if (i < 0 || j < 0 || i >= this.maxx || j >= this.maxy) return 0;
        return this.feld[i + this.maxx * j];
    }
    clear() { this.feld.fill(0); }
    isEmpty() {
        for (let k = 0; k < this.feld.length; k++) if (this.feld[k] !== 0) return false;
        return true;
    }
    sizeX() {
        let nonempty = false;
        let i1 = this.maxx - 1, i2 = 0;
        for (let i = 0; i < this.maxx; i++) {
            for (let j = 0; j < this.maxy; j++) {
                if (this.feld[i + this.maxx * j] !== 0) {
                    if (i1 > i) i1 = i;
                    if (i2 < i) i2 = i;
                    nonempty = true;
                }
            }
        }
        return nonempty ? (i2 - i1 + 1) : 0;
    }
    sizeY() {
        let nonempty = false;
        let j1 = this.maxy - 1, j2 = 0;
        for (let j = 0; j < this.maxy; j++) {
            for (let i = 0; i < this.maxx; i++) {
                if (this.feld[i + this.maxx * j] !== 0) {
                    if (j1 > j) j1 = j;
                    if (j2 < j) j2 = j;
                    nonempty = true;
                }
            }
        }
        return nonempty ? (j2 - j1 + 1) : 0;
    }
    copyFrom(other) {
        for (let k = 0; k < this.feld.length; k++) this.feld[k] = other.feld[k];
    }
    snapshot() { return this.feld.slice(); }
    restore(snap) { for (let k = 0; k < this.feld.length; k++) this.feld[k] = snap[k]; }
}


export class Pattern {
    // `hooks` connect the model to the editor:
    //   isPegplan()                   pegplan mode is active
    //   recalcFixedEntering(pattern)  rebuild the entering from a
    //                                 fixed threading template;
    //                                 returns the highest shaft
    //   afterRecalcFromWeave(settings) re-apply the arrangement style
    constructor(width, height, max_shaft, max_treadle, hooks = {}) {
        this.hooks = {
            isPegplan: () => false,
            recalcFixedEntering: (p) => p.recalc_entering(),
            afterRecalcFromWeave: () => {},
            ...hooks,
        };
        this.color_warp = new Grid(width, 1);
        this.empty_warp = new Grid(width, 1);
        this.color_weft = new Grid(1, height);
        this.empty_weft = new Grid(1, height);
        this.reed = new Grid(width, 1);
        this.entering = new Entering(width, max_shaft);
        this.tieup = new Grid(max_treadle, max_shaft);
        this.treadling = new Grid(max_treadle, height);
        // Pegplan: shafts × wefts. Direct shaft-up specification used as an
        // alternative to tie-up + treadling on peg/table looms.
        this.pegplan = new Grid(max_shaft, height);
        this.weave = new Grid(width, height);
        // Auto-computed rapport bounds (inclusive). -1 means "none".
        this.rapport_k_a = 0; this.rapport_k_b = -1;
        this.rapport_s_a = 0; this.rapport_s_b = -1;
        // Block-substitution + range-substitution muster slots (each 12×12).
        this.blockmuster   = []; for (let k = 0; k < 10; k++) this.blockmuster.push(new Muster());
        this.bereichmuster = []; for (let k = 0; k < 10; k++) this.bereichmuster.push(new Muster());
        // Fixed (user-defined) threading template — port of TDBWFRM::fixeinzug.
        // One entry per warp; non-zero entries hold a 1-based shaft number.
        // Used when settings.threading_arrangement === "fixiert".
        this.fixeinzug = new Array(width).fill(0);
        this.fixsize = 0;
        this.firstfree = 0;
        // Palette: array of [r, g, b] triples. Initialized from data.palette
        // in initPatternData; kept in sync with the global `colors` map via
        // _paletteSetEntry / _paletteRefreshColors. 236 slots in the
        // desktop (palette.h MAX_PAL_ENTRY); web sizes follow data.palette.
        this.palette = [];
        // Hilfslinien (guide lines): array of { typ: "horz"|"vert", feld:
        // 0|1, pos: int }. typ indicates orientation, feld which axis (0
        // = top/left half of the editor, 1 = bottom/right half), pos is
        // the 0-based pattern index. Direct port of Hilfslinien class
        // (hilfslinien.cpp / .h).
        this.hlines = [];
    }

    // Resize all constituent grids to the new warp/weft/shaft/treadle
    // counts, preserving overlapping cells. Used by the Optionen dialog
    // (For this pattern… / Global…) so the user can grow or shrink an
    // existing pattern. Caller is responsible for rebuilding the flat
    // arrays in `data` and triggering view.layout() / recalc_weave().
    resize(newW, newH, newMS, newMT) {
        this.color_warp.resize(newW, 1);
        this.empty_warp.resize(newW, 1);
        this.color_weft.resize(1, newH);
        this.empty_weft.resize(1, newH);
        this.reed.resize(newW, 1);
        this.entering.resize(newW, newMS);
        this.tieup.resize(newMT, newMS);
        this.treadling.resize(newMT, newH);
        this.pegplan.resize(newMS, newH);
        this.weave.resize(newW, newH);
        const fw = Math.min(this.fixeinzug.length, newW);
        const newFix = new Array(newW).fill(0);
        for (let i = 0; i < fw; i++) {
            const v = this.fixeinzug[i] | 0;
            newFix[i] = (v > 0 && v <= newMS) ? v : 0;
        }
        this.fixeinzug = newFix;
        if (this.fixsize    > newW) this.fixsize    = newW;
        if (this.firstfree  > newW) this.firstfree  = newW;
    }

    // Seed the active-pattern extent for a fresh scan. "Empty" is
    // encoded as min > max (same convention as recalc_weave_extent), so
    // a pattern that starts in the middle of the grid keeps its real
    // left/top bound: seeding min at 0 would drag the leading empty
    // warps/wefts into the extent and make rapport detection, the info
    // dialog and the print ranges span the whole grid.
    _resetExtent() {
        this.min_x = this.weave.width;  this.max_x = 0;
        this.min_y = this.weave.height; this.max_y = 0;
    }

    // True when the pattern has at least one used warp and weft.
    hasExtent() {
        return this.min_x <= this.max_x && this.min_y <= this.max_y;
    }

    recalc_weave() {
        // Dispatch based on the active mode. In pegplan mode the weave is
        // derived from shaft-up data directly (no treadle indirection).
        if (this.hooks.isPegplan()) {
            this._recalc_weave_from_pegplan();
        } else {
            this._recalc_weave_from_treadling();
        }
        this.calcRapport();
    }

    _recalc_weave_from_treadling() {
        this.weave.data.fill(0);
        this._resetExtent();
        for (let i = 0; i < this.weave.width; i++) {
            const shaft = this.entering.get_shaft(i);
            if (shaft <= 0) continue;
            this.min_x = Math.min(this.min_x, i);
            this.max_x = Math.max(this.max_x, i);
            for (let j = 0; j < this.weave.height; j++) {
                for (let k = 0; k < this.treadling.width; k++) {
                    if (this.treadling.get(k, j) <= 0) continue;
                    this.min_y = Math.min(this.min_y, j);
                    this.max_y = Math.max(this.max_y, j);
                    const value = this.tieup.get(k, shaft - 1);
                    if (value > 0) {
                        this.weave.set(i, j, value);
                    }
                }
            }
        }
    }

    _recalc_weave_from_pegplan() {
        this.weave.data.fill(0);
        this._resetExtent();
        for (let i = 0; i < this.weave.width; i++) {
            const shaft = this.entering.get_shaft(i);
            if (shaft <= 0) continue;
            this.min_x = Math.min(this.min_x, i);
            this.max_x = Math.max(this.max_x, i);
            for (let j = 0; j < this.weave.height; j++) {
                const v = this.pegplan.get(shaft - 1, j);
                if (v > 0) {
                    this.min_y = Math.min(this.min_y, j);
                    this.max_y = Math.max(this.max_y, j);
                    this.weave.set(i, j, v);
                }
            }
        }
    }

    // Reverse-direction: when weave is edited directly in pegplan mode,
    // reconstruct the pegplan grid so the pane reflects the edit.
    _recalc_pegplan_from_weave() {
        this.pegplan.data.fill(0);
        for (let i = 0; i < this.weave.width; i++) {
            const shaft = this.entering.get_shaft(i);
            if (shaft <= 0) continue;
            for (let j = 0; j < this.weave.height; j++) {
                const v = this.weave.get(i, j);
                if (v > 0) this.pegplan.set(shaft - 1, j, v);
            }
        }
    }

    recalc_from_weave(settings) {
        this.recalc_weave_extent();
        let max_shaft;
        const fixiert = settings && settings.threading_arrangement === "fixiert"
                       && this.fixeinzug && this.fixeinzug[0] !== 0;
        if (fixiert) {
            max_shaft = this.hooks.recalcFixedEntering(this);
        } else {
            max_shaft = this.recalc_entering();
        }
        if (settings && settings.display_pegplan) {
            // Pegplan mode: derive pegplan directly from the weave+entering,
            // bypassing treadling/tie-up.
            this._recalc_pegplan_from_weave();
        } else {
            const max_treadle = this.recalc_treadling(settings);
            this.recalc_tieup(max_shaft, max_treadle);
        }
        // Apply the persistent arrangement style — port of desktop
        // RcRecalcAll::Recalc which always calls RearrangeSchaefte +
        // RearrangeTritte at the end (only in non-pegplan mode for
        // treadling). Lets the user pick a "normal rising" / "crossed"
        // / etc. style once and have every subsequent weave-driven
        // recalc keep the threading / treadling tidy.
        this.hooks.afterRecalcFromWeave(settings);
        this.calcRapport();
    }

    // Automatic rapport (repeat unit) detection within the active pattern
    // extent (min_x..max_x, min_y..max_y). Port of desktop
    // RpRapportImpl::CalcRapport.
    calcRapport() {
        this._calcKetteRapport();
        this._calcSchussRapport();
    }

    _einzugEqual(i1, i2) {
        if (this.entering.get_shaft(i1) !== this.entering.get_shaft(i2)) return false;
        const j1 = this.min_y, j2 = this.max_y;
        for (let j = j1; j <= j2; j++) {
            const s1 = this.weave.get(i1, j);
            const s2 = this.weave.get(i2, j);
            if (s1 <= 0 && s2 > 0) return false;
            if (s1 > 0 && s2 <= 0) return false;
            if (s1 > 0 && s2 > 0 && s1 !== s2) return false;
        }
        return true;
    }

    _trittfolgeEqual(j1, j2) {
        const grid = this.hooks.isPegplan() ? this.pegplan : this.treadling;
        for (let i = 0; i < grid.width; i++) {
            const s1 = grid.get(i, j1);
            const s2 = grid.get(i, j2);
            if (s1 <= 0 && s2 > 0) return false;
            if (s1 > 0 && s2 <= 0) return false;
            if (s1 > 0 && s2 > 0 && s1 !== s2) return false;
        }
        const i1 = this.min_x, i2 = this.max_x;
        for (let i = i1; i <= i2; i++) {
            const s1 = this.weave.get(i, j1);
            const s2 = this.weave.get(i, j2);
            if (s1 <= 0 && s2 > 0) return false;
            if (s1 > 0 && s2 <= 0) return false;
            if (s1 > 0 && s2 > 0 && s1 !== s2) return false;
        }
        return true;
    }

    _calcKetteRapport() {
        this.rapport_k_a = 0;
        this.rapport_k_b = -1;
        const i1 = this.min_x, i2 = this.max_x;
        if (i1 > i2) return;
        this.rapport_k_a = i1;
        this.rapport_k_b = i1;
        // Safety cap: pattern width.
        let iter = 0;
        outer: while (iter++ < this.weave.width) {
            // Find next warp that matches the rapport start.
            let i;
            for (i = this.rapport_k_b + 1; i <= i2; i++) {
                if (this._einzugEqual(this.rapport_k_a, i)) break;
            }
            this.rapport_k_b = i - 1;
            // Verify that everything further is a valid cyclic continuation.
            const len = this.rapport_k_b - this.rapport_k_a + 1;
            if (len <= 0) break;
            for (let k = this.rapport_k_b + 1; k <= i2; k++) {
                const expected = this.rapport_k_a + ((k - this.rapport_k_b - 1) % len);
                if (!this._einzugEqual(expected, k)) {
                    this.rapport_k_b++;
                    continue outer;
                }
            }
            break;
        }
    }

    _calcSchussRapport() {
        this.rapport_s_a = 0;
        this.rapport_s_b = -1;
        const j1 = this.min_y, j2 = this.max_y;
        if (j1 > j2) return;
        this.rapport_s_a = j1;
        this.rapport_s_b = j1;
        let iter = 0;
        outer: while (iter++ < this.weave.height) {
            let j;
            for (j = this.rapport_s_b + 1; j <= j2; j++) {
                if (this._trittfolgeEqual(this.rapport_s_a, j)) break;
            }
            this.rapport_s_b = j - 1;
            const len = this.rapport_s_b - this.rapport_s_a + 1;
            if (len <= 0) break;
            for (let k = this.rapport_s_b + 1; k <= j2; k++) {
                const expected = this.rapport_s_a + ((k - this.rapport_s_b - 1) % len);
                if (!this._trittfolgeEqual(expected, k)) {
                    this.rapport_s_b++;
                    continue outer;
                }
            }
            break;
        }
    }

    recalc_weave_extent() {
        this._resetExtent();
        for (let i = 0; i < this.weave.width; i++) {
            if (!this.weave.isColEmpty(i)) {
                this.min_x = Math.min(this.min_x, i);
                this.max_x = Math.max(this.max_x, i);
                this.empty_warp.set(i, 0, 1);
            } else {
                this.empty_warp.set(i, 0, 0);
            }
        }
        for (let j = 0; j < this.weave.height; j++) {
            if (!this.weave.isRowEmpty(j)) {
                this.min_y = Math.min(this.min_y, j);
                this.max_y = Math.max(this.max_y, j);
                this.empty_weft.set(0, j, 1);
            } else {
                this.empty_weft.set(0, j, 0);
            }
        }
    }

    recalc_entering() {
        this.entering.clear();
        let next_shaft = 1;
        for (let i = this.min_x; i <= this.max_x; i++) {
            if (this.empty_warp.get(i, 0) == 0) continue;
            let shaft = null;
            for (let ii = this.min_x; ii < i; ii++) {
                if (this.weave.colsEqual(i, ii)) {
                    shaft = this.entering.get_shaft(ii);
                    break;
                }
            }
            if (shaft === null) {
                shaft = next_shaft++;
            }
            this.entering.set_shaft(i, shaft);
        }
        return next_shaft - 1;
    }

    recalc_treadling(settings) {
        // Desktop's RecalcTrittfolge runs the same algorithm regardless
        // of einzeltritt vs multitritt — the flag only controls how the
        // editor *writes* into the treadling pane (single-treadle
        // clears the row first; multi-treadle leaves existing cells).
        // So we always rebuild the same way here, otherwise switching
        // to multi-treadle leaves recalc_tieup with max_treadle=undefined
        // and the tie-up gets wiped.
        this.treadling.clear();
        let next_treadle = 0;
        for (let j = this.min_y; j <= this.max_y; j++) {
            if (this.empty_weft.get(0, j) == 0) continue;
            let found = false;
            for (let jj = this.min_y; jj < j; jj++) {
                if (this.weave.rowsEqual(j, jj)) {
                    found = true;
                    this.treadling.copyRow(jj, j);
                    break;
                }
            }
            if (!found) {
                this.treadling.set(next_treadle++, j, 1); // TODO use current bereich?
            }
        }
        return next_treadle - 1;
    }

    recalc_tieup(max_shaft, max_treadle) {
        this.tieup.clear();
        for (let i = 0; i <= max_treadle; i++) {
            for (let j = 0; j <= max_shaft - 1; j++) {
                let entering_i = null;
                let treadling_j = null;
                for (let ii = this.min_x; ii <= this.max_x; ii++) {
                    if (this.entering.get_shaft(ii) == j + 1) {
                        entering_i = ii;
                        break;
                    }
                }
                for (let jj = this.min_y; jj <= this.max_y; jj++) {
                    if (this.treadling.get(i, jj) > 0) {
                        treadling_j = jj;
                        break;
                    }
                }
                if (entering_i !== null && treadling_j !== null) {
                    this.tieup.set(i, j, this.weave.get(entering_i, treadling_j));
                }
            }
        }
    }
}

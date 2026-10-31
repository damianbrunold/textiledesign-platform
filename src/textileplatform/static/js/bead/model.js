// The JBead data model: the bead grid (Pattern) and the bead list
// (BeadList: used height, repeat, run-length list of the repeat), and
// conversion of the grid to and from the stored pattern JSON.
//
//   loadModel(data, pattern)          data.model -> pattern
//   storeModel(data, pattern, repeat) pattern -> data.model, data.repeat
//
// No DOM and no editor globals. Moved out of jbead.js; the classic
// editor script reaches these through bead/globals.js.

export class Pattern {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Array(this.width * this.height);
        // Active rectangular selection (or null). Stored as inclusive
        // [i1, i2] × [j1, j2] in data coordinates so transforms can
        // iterate it uniformly.
        this.selection = null;
        // Vertical scroll offset: number of rows skipped at the bottom
        // before the visible window begins. Mirrors desktop's
        // Model.scroll. Driven by the scrollbar / wheel.
        this.scroll = 0;
        // Horizontal "rotation" of the simulation view. Like desktop's
        // Model.shift it is a *view-only* offset — the bead-list,
        // repeat detection, draft and corrected views are unaffected;
        // only the simulated tube is rotated by `shift` cells.
        this.shift = 0;
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

    inSelection(i, j) {
        const s = this.selection;
        return s != null && i >= s.i1 && i <= s.i2
                         && j >= s.j1 && j <= s.j2;
    }
}

export class BeadList {
    constructor(data) {
        this.data = data;
        this.usedHeight = null;
        this.repeat = null;
        this.list = [];
    }

    updateUsedHeight() {
        this.usedHeight = 0;
        for (let idx = 0; idx < this.data.height * this.data.width; idx++) {
            if (this.data.data[idx] > 0) {
                this.usedHeight = Math.trunc(idx / this.data.width) + 1;
            }
        }
    }

    updateRepeat() {
        this.repeat = this.usedHeight * this.data.width;
        for (let i = 1; i < this.usedHeight * this.data.width; i++) {
            if (this.data.data[i] == this.data.data[0]) {
                let ok = true;
                for (let k = i + 1; k < this.usedHeight * this.data.width; k++) {
                    if (this.data.data[(k - i) % i] != this.data.data[k]) {
                        ok = false;
                        break;
                    }
                }
                if (ok) {
                    this.repeat = i;
                    break;
                }
            }
        }
    }

    updateBeadList() {
        this.list = [];
        // Empty pattern → repeat=0 and data[-1] would be undefined; skip
        // so the list stays empty and ViewBeadList renders nothing.
        if (!(this.repeat > 0)) return;
        let color = this.data.data[this.repeat - 1];
        let count = 1;
        for (let i = this.repeat - 2; i >= 0; i--) {
            if (this.data.data[i] == color) {
                count++;
            } else {
                this.list.push([color, count]);
                color = this.data.data[i];
                count = 1;
            }
        }
        this.list.push([color, count]);
    }

    update() {
        this.updateUsedHeight();
        this.updateRepeat();
        this.updateBeadList();
    }
}


// Fill `pattern` (sized from data.model) from the stored rows.
export function loadModel(data, pattern) {
    for (let j = 0; j < pattern.height; j++) {
        const row = data.model[j];
        for (let i = 0; i < row.length; i++) {
            pattern.set(i, j, row[i]);
        }
    }
}

// Rebuild data.model from the pattern's current dimensions (so resize /
// insert row / delete row persist even when the old data.model had
// other dimensions) and store the repeat for the server's list views.
export function storeModel(data, pattern, repeat) {
    const rows = [];
    for (let j = 0; j < pattern.height; j++) {
        const row = new Array(pattern.width);
        for (let i = 0; i < pattern.width; i++) row[i] = pattern.get(i, j);
        rows.push(row);
    }
    data.model = rows;
    if (Number.isInteger(repeat) && repeat > 0) {
        data.repeat = repeat;
    } else {
        delete data.repeat;
    }
}

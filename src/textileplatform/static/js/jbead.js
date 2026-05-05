"use strict";

// data is provided by common.js and contains the "raw" json data of the pattern.

// The pattern is an instance of the Pattern class and encapsulates the
// data from the data object in order to manipulate and visualize it easier.
let pattern = null;


// The view is an instance of the View class and provides the visualization
// of a pattern.
let view = null;


// The settings is an instance of the ViewSettings class and gathers drawing
// related settings for all the views.
let settings = null;


// The beadlist is an instance of the BeadList class and provides information
// about the current repeat, i.e. the sequence of bead colors and counts.
let beadlist = null;


// The colors variable represents the color palette
let colors = [];


let readonly = false;


let selected_color = 1;
let background_color = 0;


// View visibility flags — toggled from the View menu. Mirror desktop's
// View → Draft / Corrected / Simulation / Report items.
let show_draft = true;
let show_corrected = true;
let show_simulation = true;
let show_report = true;
let draw_colors = true;
let draw_symbols = false;


// Per-colour symbol glyphs. Stored as a single string indexed by
// palette position — same encoding as desktop's
// BeadSymbols.SAVED_SYMBOLS ("·abcdefg…"). Persisted in
// data.view.symbols.
const _DEFAULT_SYMBOLS = "·abcdefghijklmnopqrstuvwxyz+-/\\*";
let pattern_symbols = _DEFAULT_SYMBOLS;

function _symbolFor(colorIdx) {
    if (colorIdx <= 0) return "";
    const s = pattern_symbols || _DEFAULT_SYMBOLS;
    if (colorIdx < s.length) return s.charAt(colorIdx);
    return "";
}


// Active drawing tool. "pencil" / "select" / "fill" / "pipette".
let current_tool = "pencil";


// Pencil drag accumulator — populated during a single mousedown→mouseup
// stroke so we can commit one CommandBus entry per stroke instead of
// one per cell.
let _pencil_stroke = null;


// Mouse drag state for the rectangular select tool. While dragging,
// `_drag` holds the anchor (data coords); on every mousemove we update
// `pattern.selection`.
let _drag = null;


// i18n table loaded from #tx-i18n. Action ids contain dots, so we keep
// them as a single key under `_i18n.actions` rather than nesting.
let _i18n = { actions: {}, menus: {} };
function _actionLabel(id, fallback) {
    const a = _i18n.actions && _i18n.actions[id];
    if (a && a.label) return a.label;
    return fallback != null ? fallback : id;
}
function _menuLabel(id, fallback) {
    const m = _i18n.menus && _i18n.menus[id];
    return m != null ? m : (fallback != null ? fallback : id);
}


class Pattern {
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

class BeadList {
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
	this.list = []
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


class ViewRuler {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.offset = 0;
    }

    contains(i, j) {
        return this.x <= i && i < this.x + this.width &&
               this.y <= j && j < this.y + Math.min(pattern.height, this.height);
    }

    draw(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;

        ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
        ctx.fillStyle = settings.darcula ? "#aaa" : "#222";
        ctx.font = `${settings.dy}px sans-serif`;
        ctx.textAlign = 'end';
        for (let j = 0; j <= Math.min(pattern.height, this.height); j++) {
            const jj = j + this.offset + 1;
            if (jj % 10 == 0) {
                ctx.moveTo(
                    0.5 + (this.x + 0.5) * dx,
                    0.5 + (this.y + this.height - j - 1) * dy
                )
                ctx.lineTo(
                    0.5 + (this.x + this.width) * dx,
                    0.5 + (this.y + this.height - j - 1) * dy
                )
                ctx.stroke();

                ctx.fillText(
                    `${jj}`,
                    (this.x + this.width) * dx,
                    (this.y + this.height - j) * dy);
            }
        }
    }
}



class ViewDraft {
    constructor(data, x, y, width, height) {
        this.data = data;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.offset = 0;
    }

    contains(i, j) {
        return this.x <= i && i < this.x + this.width &&
               this.y <= j && j < this.y + Math.min(pattern.height, this.height);
    }

    pixelToDataCoord(x, y) {
        // Cells are drawn at i*dx + 0.5 / j*dy + 0.5 so the 1-px grid
        // strokes land crisp on integer pixels. So visible cell N
        // occupies x in [N*dx + 0.5, N*dx + dx + 0.5). Use
        // Math.floor((x - 0.5) / dx) so a click at the right-hand
        // half of cell N maps back to N and not to N+1.
        let i = Math.floor((x - 0.5) / settings.dx);
        let j = this.height - 1 - Math.floor((y - 0.5) / settings.dy);
        return [i - this.x, j - this.y + this.offset];
    }

    pixelToViewCoord(x, y) {
        let i = Math.floor((x - 0.5) / settings.dx);
        let j = this.height - 1 - Math.floor((y - 0.5) / settings.dy);
        return [i - this.x, j - this.y];
    }


    draw(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;
        const drawSymbol = draw_symbols && dx >= 8;
        if (drawSymbol) {
            ctx.font = `${Math.round(dx * 0.8)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
        }

        const visible = Math.min(pattern.height - this.offset, this.height);
        for (let j = 0; j < visible; j++) {
            const j_data = j + this.offset;
            for (let i = 0; i < this.width; i++) {
                const state = this.data.get(i, j_data);
                const x = 0.5 + (this.x + i) * dx;
                const y = 0.5 + (this.y + this.height - j - 1) * dy;
                if (draw_colors) {
                    ctx.fillStyle = colors[state];
                    ctx.fillRect(x, y, dx, dy);
                } else {
                    ctx.fillStyle = settings.darcula ? "#444" : "#fff";
                    ctx.fillRect(x, y, dx, dy);
                }
                ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
                ctx.strokeRect(x, y, dx, dy);
                if (drawSymbol && state > 0) {
                    const sym = _symbolFor(state);
                    if (sym) {
                        ctx.fillStyle = draw_colors
                            ? contrastingColor(colors[state])
                            : (settings.darcula ? "#eee" : "#222");
                        ctx.fillText(sym, x + dx / 2, y + dy / 2);
                    }
                }
            }
        }

        // Selection highlight — yellow rectangle drawn on top of the
        // grid lines. Selection is in data coords; subtract offset to
        // get view coords, and clip to the visible window.
        const sel = this.data.selection;
        if (sel != null) {
            const j1v = sel.j1 - this.offset;
            const j2v = sel.j2 - this.offset;
            if (j2v >= 0 && j1v < this.height) {
                const cj1 = Math.max(0, j1v);
                const cj2 = Math.min(this.height - 1, j2v);
                const x1 = (this.x + sel.i1) * dx;
                const x2 = (this.x + sel.i2 + 1) * dx;
                const y2 = (this.y + this.height - cj1) * dy;
                const y1 = (this.y + this.height - cj2 - 1) * dy;
                ctx.save();
                ctx.lineWidth = 2;
                ctx.strokeStyle = "#ff5";
                ctx.strokeRect(x1 + 0.5, y1 + 0.5, x2 - x1, y2 - y1);
                ctx.restore();
            }
        }
    }
}


class ViewCorrected {
    constructor(data, x, y, width, height) {
        this.data = data;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.offset = 0;
        this.rotation = 0;
    }

    contains(i, j) {
        return this.x - 1 <= i && i < this.x + this.width + 1 &&
               this.y <= j && j < this.y + this.height;
    }

    pixelToDataCoord(x, y) {
        let j = this.height - 1 - Math.floor((y - 0.5) / settings.dy);
        j = j - this.y + this.offset;
        let i;
        if (j % 2 == 0) {
            i = Math.floor((x - 0.5) / settings.dx) - this.x;
        } else {
            i = Math.floor((x - 0.5 + settings.dx / 2) / settings.dx) - this.x;
        }
        let idx = i;
        j--;
        while (j >= 0) {
            idx += j % 2 == 0 ? this.data.width : this.data.width + 1;
            j--;
        }
        return [idx % this.data.width, Math.trunc(idx / this.data.width)];
    }

    pixelToViewCoord(x, y) {
        const [i, j] = this.pixelToDataCoord(x, y);
        return [i, j - this.offset];
    }

    idxToDataCoord(idx) {
        let j = 0;
        let w = this.data.width;
        while (idx >= w) {
            j++;
            idx -= w;
            w = j % 2 == 0 ? this.data.width : this.data.width + 1;
        }
        let i = idx;
        return [i, j];
    }

    idxToViewCoord(idx) {
        const [i, j] = this.idxToDataCoord(idx);
        return [i, j - this.offset];
    }

    draw(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;

        for (let jj = 0; jj < this.data.height; jj++) {
            for (let ii = 0; ii < this.data.width; ii++) {
                const idx = ii + jj * this.data.width;
                const [i, j] = this.idxToViewCoord(idx);

                // j only increases monotonically with idx, so we can
                // short-circuit once we leave the visible window
                // downward; on the way to it we must `continue`, not
                // `break`, or we'd skip everything past the first
                // hidden row when scrolled.
                if (j < 0) continue;
                if (j >= this.height) break;

                const xoff = j % 2 == 0 ? 0 : -dx/2;

                const state = this.data.get(ii, jj);

                const x = 0.5 + xoff + (this.x + i) * dx;
                const y = 0.5 + (this.y + this.height - j - 1) * dy;

                ctx.fillStyle = colors[state];
                ctx.fillRect(x, y, dx, dy);
                ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
                ctx.strokeRect(x, y, dx, dy);
            }
        }
    }
}


class ViewSimulated {
    constructor(data, x, y, width, height) {
        this.data = data;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.offset = 0;
    }

    contains(i, j) {
        // Half-cells extend dx/2 to the left of this.x and to the
        // right of this.x + this.width on odd rows, so the floor()-
        // derived `i` may land one cell outside the nominal range
        // and still hit a bead. Match ViewCorrected's tolerance.
        return this.x - 1 <= i && i < this.x + this.width + 1 &&
               this.y <= j && j < this.y + this.height;
    }

    pixelToDataCoord(x, y) {
        // Inverse of the spiral fold + shift in draw(): pixel ->
        // (i_view, j_view) in simulation space -> linear rope index ->
        // (data_x, data_y) in the pattern. Mirrors desktop
        // SimulationPanel::mouseToField + Model::correctedIndex.
        const dx = settings.dx;
        const dy = settings.dy;
        const W = this.data.width;
        if (W <= 0) return [undefined, undefined];
        const j_view = this.height - 1 - Math.floor((y - 0.5) / dy);
        if (j_view < 0 || j_view >= this.height) {
            return [undefined, undefined];
        }
        const j_abs = j_view + this.offset;
        const x_rel = x - this.x * dx;
        let i;
        if (j_abs % 2 === 0) {
            // Even rows: W full-width cells centred on the column grid;
            // cell i spans [(i-1)*dx + dx/2, i*dx + dx/2).
            i = Math.floor((x_rel + dx / 2) / dx);
            if (i < 0 || i >= W) return [undefined, undefined];
        } else {
            // Odd rows: W+1 cells, with i=0 and i=W as half-width
            // edges. Cell i (1..W-1) spans [(i-1)*dx, i*dx).
            i = Math.floor((x_rel + dx) / dx);
            if (i < 0 || i > W) return [undefined, undefined];
        }
        const pairs = Math.trunc(j_abs / 2);
        const linearPos = pairs * (2 * W + 1)
            + ((j_abs % 2 === 1) ? W : 0) + i;
        const idx = linearPos - (this.data.shift | 0);
        if (idx < 0) return [undefined, undefined];
        const data_x = idx % W;
        const data_y = Math.trunc(idx / W);
        if (data_y >= this.data.height) return [undefined, undefined];
        return [data_x, data_y];
    }

    pixelToViewCoord(x, y) {
        const [i, j] = this.pixelToDataCoord(x, y);
        if (i === undefined || j === undefined) return [undefined, undefined];
        return [i, j - this.offset];
    }

    draw(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;

        const even = this.width == Math.trunc(this.width);

        ctx.fillStyle = settings.darcula ? "#444" : "#aaa";
        ctx.fillRect(
            this.x * dx - dx / 2,
            this.y * dy,
            this.width * dx,
            this.height * dy
        );

        for (let jj = 0; jj < this.data.height; jj++) {
            for (let ii = 0; ii < this.data.width; ii++) {
                // Apply pattern.shift to the linear index *before* the
                // spiral fold — mirrors desktop SimulationPanel's
                // `raw.shifted(shift, W)`. Shifting the source lookup
                // instead (the previous approach) breaks diagonal
                // patterns because the visual seam wrap doesn't move
                // with the colours.
                let idx = ii + jj * this.data.width + (this.data.shift | 0);
                let j = 0;
                let w = this.data.width;
                while (idx >= w) {
                    j++;
                    idx -= w;
                    w = j % 2 == 0 ? this.data.width : this.data.width + 1;
                }
                let i = idx;

                j -= this.offset;
                if (j < 0) continue;
                if (j >= this.height) break;
                if (j % 2 == 0 && i >= this.width) continue;
                if (j % 2 == 1 && i > this.width) continue;

                const xoff = j % 2 == 0 ? 0 : -dx/2;

                const state = this.data.get(ii, jj);

                let x = 0;
                let d = dx;

                if (even) {
                    if (i === 0 && j % 2 == 1) {
                        x = 0.5 + xoff + this.x * dx;
                        d = dx / 2;
                    } else if (i >= Math.trunc(this.width) && j % 2 == 1) {
                        x = 0.5 + xoff + (this.x + i - 1) * dx + dx/2;
                        d = dx / 2;
                    } else {
                        x = 0.5 + xoff + (this.x + i - 1) * dx + dx/2;
                    }
                } else {
                    if (i === 0 && j % 2 == 1) {
                        x = 0.5 + xoff + this.x * dx;
                        d = dx / 2;
                    } else if (i + 1 >= this.width && j % 2 == 0) {
                        x = 0.5 + xoff + (this.x + i - 1) * dx + dx/2;
                        d = dx / 2;
                    } else {
                        x = 0.5 + xoff + (this.x + i - 1) * dx + dx/2;
                    }
                }

                const y = 0.5 + (this.y + this.height - j - 1) * dy;

                ctx.fillStyle = colors[state];
                ctx.beginPath();
                ctx.ellipse(x + d / 2, y + dy / 2, d / 2, dy / 2, 0, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    }
}


class ViewColors {
    constructor(palette, x, y, width, height) {
        this.palette = palette;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    contains(x, y) {
        return this.x <= x && x < this.x + this.width &&
               this.y <= y && y < this.y + this.height;
    }

    draw(ctx, settings) {
        const d = 25; // TODO adapt on hdpi screens?

        let i = 0;
        let j = 0;
        for (let idx = 0; idx < this.palette.length; idx++) {
            const x = 0.5 + this.x + i * d;
            const y = 0.5 + this.y + j * d;
            ctx.fillStyle = this.palette[idx];
            ctx.fillRect(x, y, d, d);
            ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
            ctx.strokeRect(x, y, d, d);
            j++;
            if (j == 16) {
                j = 0;
                i = 1;
            }
        }

        i = 0;
        j = 0;
        for (let idx = 0; idx < this.palette.length; idx++) {
            if (selected_color === idx) {
                const x = 0.5 + this.x + i * d;
                const y = 0.5 + this.y + j * d;
                ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
                ctx.lineWidth = 4;
                ctx.strokeRect(x, y, d, d);
                ctx.lineWidth = 1;
                break;
            }
            j++;
            if (j == 16) {
                j = 0;
                i = 1;
            }
        }
    }
}



class ViewBeadList {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.offset = 0;
    }

    contains(i, j) {
        return this.x <= i && i < this.x + this.width &&
               this.y <= j && j < this.y + this.height;
    }

    draw(ctx, settings) {
	const dx = 50; // TODO make scalable?
	const dy = 25;
	const b = 5;

        ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
	ctx.beginPath();
	ctx.moveTo(this.x + b, this.y);
	ctx.lineTo(this.x + b, this.y + 60);
	ctx.lineTo(this.x + 1, this.y + 60 - b*2);
	ctx.moveTo(this.x + b, this.y + 60);
	ctx.lineTo(this.x + b*2 - 1, this.y + 60 - b*2);
	ctx.stroke();
        ctx.font = "16px sans-serif";
	ctx.textAlign = "center";
	let x = this.x + 2*b;
	let y = this.y;
	for (let [color, count] of beadlist.list) {
	    ctx.fillStyle = colors[color];
	    ctx.beginPath();
            ctx.roundRect(x, y, dx, dy, dx / 3);
            ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
	    ctx.fill();
	    ctx.stroke();
	    ctx.fillStyle = contrastingColor(colors[color]);
	    ctx.fillText(`${count}`, x + dx / 2, y + dy / 2 + 5);
	    y += dy + b;
	    if (y + dy > this.y + this.height * settings.dy) {
		x += dx + b;
		y = this.y;
	    }
	}
    }
}


function contrastingColor(color) {
    // Defensive: callers occasionally pass undefined when a palette
    // slot is missing (e.g. cell value past the end of the palette).
    // Default to black-on-white in that case.
    if (typeof color !== "string") return "#000";
    const parts = color.slice(4, color.length - 1).split(",");
    const r = parseInt(parts[0].trim(), 10);
    const g = parseInt(parts[1].trim(), 10);
    const b = parseInt(parts[2].trim(), 10);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 128 ? "#000" : "#fff";
}


class ViewSettings {
    constructor(dx=12, dy=null) {
        this.dx = dx;
        this.dy = dy || this.dx;
        this.darcula = true;
    }
}


class PatternView {
    constructor(pattern, beadlist, settings, ctx) {
        this.settings = settings;
	this.beadlist = beadlist;
        this.pattern = pattern;
        this.ctx = ctx;
        this.layout();
    }

    layout() {
        const dx = this.settings.dx;
        const dy = this.settings.dy;

        const availy = Math.trunc((this.ctx.canvas.height - 2) / dy);

        const width_ruler = 3;
        const width_draft = show_draft ? this.pattern.width : 0;
        const gap_draft = show_draft ? 2 : 0;
        const width_corrected = show_corrected ? this.pattern.width + 1 : 0;
        const gap_corrected = show_corrected ? 2 : 0;
        const width_simulated = show_simulation
            ? Math.trunc((this.pattern.width + 1) / 2) : 0;
        const gap_simulated = show_simulation ? 1 : 0;

        const x1 = 0;
        const x2 = width_ruler + 1;
        const x3 = x2 + width_draft + gap_draft;
        const x4 = x3 + width_corrected + gap_corrected;
        const x5 = x4 + width_simulated + gap_simulated;

        this.ruler = new ViewRuler(x1, 0, width_ruler, availy);
        this.draft = show_draft
            ? new ViewDraft(this.pattern, x2, 0, width_draft, availy) : null;
        this.corrected = show_corrected
            ? new ViewCorrected(this.pattern, x3, 0, width_corrected, availy)
            : null;
        this.simulated = show_simulation
            ? new ViewSimulated(this.pattern, x4, 0, width_simulated, availy)
            : null;
        this.colors = new ViewColors(colors, x5 * dx, 0, 2 * 25, 16 * 25);
        this.beads = show_report
            ? new ViewBeadList(x5 * dx + 2 * 25 + dx, 0, 5 * 25, availy)
            : null;
    }

    draw() {
        // Sync each view's per-instance offset with the pattern's
        // shared scroll value before painting. Views were originally
        // designed to scroll independently, but the desktop has a
        // single shared scrollbar — match that.
        const s = this.pattern.scroll | 0;
        if (this.ruler) this.ruler.offset = s;
        if (this.draft) this.draft.offset = s;
        if (this.corrected) this.corrected.offset = s;
        if (this.simulated) this.simulated.offset = s;
        this.clearCanvas();
        if (this.draft) this.draft.draw(this.ctx, this.settings);
        if (this.corrected) this.corrected.draw(this.ctx, this.settings);
        if (this.simulated) this.simulated.draw(this.ctx, this.settings);
        this.colors.draw(this.ctx, this.settings);
        this.ruler.draw(this.ctx, this.settings);
        if (this.beads) this.beads.draw(this.ctx, this.settings);
    }

    // Number of data rows visible at once in the rectangular views.
    visibleRows() {
        return (this.draft || this.corrected || this.simulated || this.ruler)
            .height;
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }
}


function init() {
    const darkmodeRaw = document.getElementById("darkmode").value;
    const darkmode = darkmodeRaw === "True"
        || (darkmodeRaw === "auto"
            && window.matchMedia
            && window.matchMedia("(prefers-color-scheme: dark)").matches);
    pattern = new Pattern(data.model[0].length, data.model.length);
    settings = new ViewSettings();
    settings.darcula = darkmode;
    beadlist = new BeadList(pattern);

    const canvas = document.getElementById("canvas");
    canvas.style.backgroundColor = settings.darcula ? "#444" : "#fff";
    canvas.style.border = "none";
    const ctx = canvas.getContext('2d');
    // Size the bitmap to the canvas's *own* CSS box (same approach
    // resizeWindow() in common.js uses). Using container.client* as
    // a fallback is wrong — it includes the scrollbar (~18 px) and
    // any padding/borders, producing a bitmap that doesn't match the
    // CSS box. The browser then scales offsetX/offsetY by a factor
    // ≠ 1 when mapping CSS-pixel mouse events to bitmap coords,
    // visibly shifting clicks one cell up/right. Force layout via
    // getBoundingClientRect so the values are populated even on the
    // very first paint.
    const rect = canvas.getBoundingClientRect();
    ctx.canvas.width  = Math.max(1, Math.round(rect.width));
    ctx.canvas.height = Math.max(1, Math.round(rect.height));

    view = new PatternView(pattern, beadlist, settings, ctx);

    initPattern(data, pattern);
    const v = data['view'] || {};
    if (v['selected-color'] != null) selected_color = v['selected-color'] | 0;
    if (v['shift']  != null) pattern.shift  = v['shift']  | 0;
    if (v['scroll'] != null) pattern.scroll = v['scroll'] | 0;
    if (v['zoom']   != null) {
        const z = v['zoom'] | 0;
        if (z >= 4 && z <= 48) { settings.dx = z; settings.dy = z; }
    }
    if (v['draft-visible']      != null) show_draft      = !!v['draft-visible'];
    if (v['corrected-visible']  != null) show_corrected  = !!v['corrected-visible'];
    if (v['simulation-visible'] != null) show_simulation = !!v['simulation-visible'];
    if (v['report-visible']     != null) show_report     = !!v['report-visible'];
    if (typeof v['selected-tool'] === "string"
        && ["pencil", "select", "fill", "pipette"]
            .indexOf(v['selected-tool']) >= 0) {
        current_tool = v['selected-tool'];
    }
    if (typeof v['symbols'] === "string" && v['symbols'].length > 0) {
        pattern_symbols = v['symbols'];
    }
    if (v['draw-colors']  != null) draw_colors  = !!v['draw-colors'];
    if (v['draw-symbols'] != null) draw_symbols = !!v['draw-symbols'];
    view.layout();
    beadlist.update();

    commandBus = new CommandBus();
    commandBus.subscribe(() => {
        if (typeof ActionRegistry !== "undefined") ActionRegistry.notify();
    });

    view.draw();

    // Pointer Events unify mouse, touch and pen. The wrappers below add
    // a long-press gesture (~500ms) that simulates Ctrl+click — this is
    // how a finger/stylus user reaches the pipette and other Ctrl-only
    // gestures.
    canvas.addEventListener('pointerdown', _pointerDown);
    canvas.addEventListener('pointermove', _pointerMove);
    window.addEventListener('pointerup', _pointerUp);
    window.addEventListener('pointercancel', _pointerUp);
    canvas.addEventListener('dblclick', _onDoubleClick);
    canvas.addEventListener('pointerleave', () => {
        const sb = document.getElementById("sb-cursor");
        if (sb) sb.textContent = "";
    });
    // Disable the browser's default touch gestures (pan/zoom) on the
    // canvas — the editor needs full control of pointer drags.
    canvas.style.touchAction = "none";
    // Prevent the browser's long-press context menu so our long-press
    // gesture (Ctrl synthesis) is unimpeded on touch.
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Mouse wheel = pattern scroll. One notch ≈ 3 rows.
    canvas.addEventListener('wheel', (e) => {
        const step = Math.sign(e.deltaY) * 3;
        if (step === 0) return;
        if (_setScroll(pattern.scroll + step)) e.preventDefault();
    }, { passive: false });

    const range = document.getElementById('scrollbar');
    if (range) {
        range.addEventListener('input', () => {
            _setScroll(parseInt(range.value, 10) || 0);
        });
    }
    _refreshScrollbar();
}


// ---- Scroll handling --------------------------------------------

function _maxScroll() {
    if (!view) return 0;
    return Math.max(0, pattern.height - view.visibleRows());
}

function _refreshScrollbar() {
    const range = document.getElementById('scrollbar');
    if (!range) return;
    const max = _maxScroll();
    range.max = String(max);
    range.value = String(pattern.scroll);
    if (max <= 0) range.setAttribute('data-disabled', '1');
    else range.removeAttribute('data-disabled');
}

function _setScroll(value) {
    const max = _maxScroll();
    const clamped = Math.max(0, Math.min(max, value | 0));
    if (clamped === pattern.scroll) return false;
    pattern.scroll = clamped;
    const range = document.getElementById('scrollbar');
    if (range) range.value = String(clamped);
    if (view) view.draw();
    return true;
}


// ---- Mouse / pointer dispatch -----------------------------------

function _eventCoords(event) {
    // Convert event.offsetX/Y (CSS pixels) into canvas bitmap coords.
    // When the canvas's bitmap is sized to its CSS box exactly the
    // ratio is 1, but sub-pixel rounding (or a stale bitmap from a
    // resize that hasn't propagated) can leave the bitmap a hair
    // shorter or taller than the CSS box — and the browser then
    // scales mouse events by that ratio. Using the live rect each
    // time we read a click guarantees the click lands on the bitmap
    // pixel under the user's cursor, regardless of any drift.
    const c = event.currentTarget || event.target;
    if (!c || c.nodeName !== "CANVAS") {
        return [event.offsetX, event.offsetY];
    }
    const rect = c.getBoundingClientRect();
    const sx = rect.width  > 0 ? c.width  / rect.width  : 1;
    const sy = rect.height > 0 ? c.height / rect.height : 1;
    return [event.offsetX * sx, event.offsetY * sy];
}

function _hitGridView(x, y) {
    // Match the half-pixel offset the views use when drawing.
    const i = Math.floor((x - 0.5) / settings.dx);
    const refHeight = (view.draft || view.corrected || view.simulated
                       || view.ruler).height;
    const j = refHeight - 1 - Math.floor((y - 0.5) / settings.dy);
    if (j < 0) return null;
    if (view.draft && view.draft.contains(i, j)) {
        return { v: view.draft, coord: view.draft.pixelToDataCoord(x, y) };
    }
    if (view.corrected && view.corrected.contains(i, j)) {
        return {
            v: view.corrected,
            coord: view.corrected.pixelToDataCoord(x, y),
        };
    }
    if (view.simulated && view.simulated.contains(i, j)) {
        return {
            v: view.simulated,
            coord: view.simulated.pixelToDataCoord(x, y),
        };
    }
    return null;
}

function _paletteIndexAt(x, y) {
    if (!view || !view.colors || !view.colors.contains(x, y)) return -1;
    // ViewColors paints swatches at +0.5 too — same half-pixel
    // adjustment as the grid views.
    const ii = Math.floor((x - view.colors.x - 0.5) / 25);
    const jj = Math.floor((y - view.colors.y - 0.5) / 25);
    if (ii < 0 || jj < 0) return -1;
    const idx = ii * 16 + jj;
    if (idx < 0 || idx >= colors.length) return -1;
    return idx;
}

function _onDoubleClick(event) {
    if (readonly) return;
    const [ex, ey] = _eventCoords(event);
    const idx = _paletteIndexAt(ex, ey);
    if (idx < 0) return;
    event.preventDefault();
    selected_color = idx;
    view.draw();
    // Open the picker on this single colour. Commit through the
    // bus so it's undoable.
    const before = colors.map(_rgbFromString);
    const initial = before[idx].slice();
    ColorPicker.pickHSV(initial, (rgb) => {
        const after = before.map(c => c.slice());
        after[idx] = [rgb[0] | 0, rgb[1] | 0, rgb[2] | 0];
        let firstApply = true;
        commandBus.execute({
            label: "palette.entry",
            apply: () => {
                _applyPalette(after);
                view.draw();
                if (!firstApply) setModified();
                firstApply = false;
            },
            revert: () => {
                _applyPalette(before);
                view.draw();
                setModified();
            },
        });
        // Live update for the first apply too.
        _applyPalette(after);
        view.draw();
        setModified();
    }, _actionLabel);
}

// ---- Long-press → Ctrl synthesis -------------------------------
//
// On touch/pen there are no modifier keys, so a pressed-and-held
// gesture (≥500ms with little movement) maps to "Ctrl+click". The
// down-event is buffered until we know whether it's a tap, a drag,
// or a long-press; this matters because _onMouseDown for some tools
// starts a stroke or selection, which would conflict with a later
// long-press → pipette decision.

const _LP_DELAY_MS = 500;
const _LP_MOVE_TOL = 8;
let _lpTimer = null;
let _lpDownEvent = null;
let _lpStartXY = null;
let _ctrlOverride = false;
let _activePointerId = null;

function _ctrlOrLp(event) {
    return event.ctrlKey || _ctrlOverride;
}

function _pointerDown(event) {
    if (_activePointerId !== null) return;
    _activePointerId = event.pointerId;
    _ctrlOverride = false;
    if (event.pointerType === 'mouse') {
        _onMouseDown(event);
        return;
    }
    // Buffer the down so the handler isn't called until we know what
    // kind of gesture this is.
    _lpDownEvent = event;
    _lpStartXY = { x: event.clientX, y: event.clientY };
    _lpTimer = setTimeout(() => {
        _lpTimer = null;
        if (!_lpDownEvent) return;
        _ctrlOverride = true;
        _onMouseDown(_lpDownEvent);
        _lpDownEvent = null;
    }, _LP_DELAY_MS);
}

function _pointerMove(event) {
    if (_activePointerId !== null && event.pointerId !== _activePointerId
        && _lpDownEvent) return;
    if (_lpTimer && _lpStartXY) {
        const dx = event.clientX - _lpStartXY.x;
        const dy = event.clientY - _lpStartXY.y;
        if ((dx * dx + dy * dy) > (_LP_MOVE_TOL * _LP_MOVE_TOL)) {
            // Movement: this is a drag, commit the buffered down now.
            clearTimeout(_lpTimer);
            _lpTimer = null;
            _onMouseDown(_lpDownEvent);
            _lpDownEvent = null;
        } else {
            return;
        }
    }
    _onMouseMove(event);
}

function _pointerUp(event) {
    // pointerup is registered on window so that drag-out-then-release
    // still finishes the drag — but that means it also fires for clicks
    // on menus, toolbars, and anything else outside the canvas. Only
    // act if pointerdown was first received on the canvas (which sets
    // _activePointerId), and only for that same pointer.
    if (_activePointerId === null) return;
    if (event.pointerId !== _activePointerId) return;
    if (_lpTimer) {
        // Quick tap before long-press fired: commit the down then up.
        clearTimeout(_lpTimer);
        _lpTimer = null;
        if (_lpDownEvent) {
            _onMouseDown(_lpDownEvent);
            _lpDownEvent = null;
        }
        _onMouseUp(event);
    } else {
        // Either a real drag (down already committed in _pointerMove)
        // or a long-press already fired in _pointerDown's timer. Both
        // need _onMouseUp to finish the stroke / commit selection.
        _onMouseUp(event);
    }
    _ctrlOverride = false;
    _activePointerId = null;
}


function _onMouseDown(event) {
    if (readonly) return;
    const [x, y] = _eventCoords(event);
    const palIdx = _paletteIndexAt(x, y);
    if (palIdx >= 0) {
        selected_color = palIdx;
        view.draw();
        return;
    }
    const hit = _hitGridView(x, y);
    if (!hit) return;
    const [i, j] = hit.coord;
    if (i === undefined || j === undefined) return;

    if (_ctrlOrLp(event)) {
        // Ctrl-click is the universal pipette gesture, regardless of tool.
        selected_color = pattern.get(i, j);
        view.draw();
        return;
    }

    switch (current_tool) {
    case "pipette":
        selected_color = pattern.get(i, j);
        view.draw();
        return;
    case "fill":
        _bucketFill(i, j);
        return;
    case "select": {
        // Click *inside* an existing selection starts a "move group"
        // gesture: lift every tile in the pattern that has the same
        // content as the selection and drag them all together. Click
        // *outside* (or with no current selection) starts a fresh
        // rectangular selection — and a no-drag click on that fresh
        // selection still falls through to the pencil-style toggle.
        const sel = pattern.selection;
        const inside = sel
            && i >= sel.i1 && i <= sel.i2
            && j >= sel.j1 && j <= sel.j2;
        if (inside) {
            const group = _captureSelectionGroup();
            if (group) {
                _drag = {
                    kind: "move",
                    i0: i, j0: j,
                    lastDx: 0, lastDy: 0,
                    group,
                    sel0: { ...sel },
                };
                return;
            }
        }
        _drag = { kind: "select", i0: i, j0: j, leftStart: false };
        pattern.selection = { i1: i, j1: j, i2: i, j2: j };
        view.draw();
        return;
    }
    case "pencil":
    default:
        // Pencil is line-mode (matches the desktop's "stift draws
        // a line"): mousedown records the start cell, mousemove
        // updates a translucent tracer, and the actual cells are
        // committed on mouseup. A single click without movement
        // toggles the start cell.
        _pencil_stroke = {
            mode: "click",
            startI: i, startJ: j,
            endI: i,   endJ: j,
            previewCells: [],
            changes: [],
            visited: new Set(),
        };
        return;
    }
}

function _onMouseMove(event) {
    if (!view) return;
    const [x, y] = _eventCoords(event);
    const hit = _hitGridView(x, y);
    const sb = document.getElementById("sb-cursor");
    if (sb) {
        if (hit) {
            const [ci, cj] = hit.coord;
            sb.textContent = (ci != null && cj != null)
                ? `(${ci + 1}, ${cj + 1})` : "";
        } else {
            sb.textContent = "";
        }
    }
    if (readonly || !hit) return;
    const [i, j] = hit.coord;
    if (i === undefined || j === undefined) return;
    if (_drag) {
        if (_drag.kind === "move") {
            const dx = i - _drag.i0;
            const dy = j - _drag.j0;
            if (dx !== _drag.lastDx || dy !== _drag.lastDy) {
                _drag.lastDx = dx;
                _drag.lastDy = dy;
                _stampSelectionGroup(_drag.group, dx, dy);
                beadlist.update();
                view.draw();
                _updateStatusbar();
            }
            return;
        }
        // Drag rectangle for the select tool — recompute on every move.
        // Latch `leftStart` once the pointer ever leaves the origin
        // cell so a click-without-drag can be detected on mouseup
        // even if the pointer wanders out and back in.
        if (i !== _drag.i0 || j !== _drag.j0) _drag.leftStart = true;
        const i1 = Math.min(_drag.i0, i);
        const i2 = Math.max(_drag.i0, i);
        const j1 = Math.min(_drag.j0, j);
        const j2 = Math.max(_drag.j0, j);
        pattern.selection = { i1, j1, i2, j2 };
        view.draw();
        _updateStatusbar();
        return;
    }
    if (_pencil_stroke && current_tool === "pencil") {
        let endI = i, endJ = j;
        if (_ctrlOrLp(event)) {
            [endI, endJ] = _constrainTo8Dir(
                _pencil_stroke.startI, _pencil_stroke.startJ, endI, endJ);
        }
        if (endI !== _pencil_stroke.endI || endJ !== _pencil_stroke.endJ
            || (_pencil_stroke.mode === "click"
                && (endI !== _pencil_stroke.startI
                    || endJ !== _pencil_stroke.startJ))) {
            _pencil_stroke.endI = endI;
            _pencil_stroke.endJ = endJ;
            if (endI !== _pencil_stroke.startI
                || endJ !== _pencil_stroke.startJ) {
                _pencil_stroke.mode = "drag";
            }
            _pencil_stroke.previewCells = _bresenhamCells(
                _pencil_stroke.startI, _pencil_stroke.startJ,
                endI, endJ);
            view.draw();
            _drawPencilPreview();
        }
    }
}

function _onMouseUp(event) {
    if (_drag) {
        const drag = _drag;
        _drag = null;
        if (drag.kind === "move") {
            // Commit the dragged group through the command bus. The
            // live preview already mutated pattern.data; we roll back
            // to the baseline first so the snapshot captures the
            // original state, then commandBus.execute re-applies.
            _finalizeSelectionGroupMove(drag.group, drag.sel0,
                                        drag.lastDx, drag.lastDy);
            return;
        }
        if (!drag.leftStart && !readonly) {
            // Click-without-drag on the select tool: treat as a
            // pencil-toggle so quick clicks still feel productive.
            // Selection collapses (so it doesn't visually linger as a
            // 1-cell box around the toggled cell). Goes through the
            // pencil command-bus path so it's a single undoable step.
            pattern.selection = null;
            _pencil_stroke = {
                mode: "click",
                startI: drag.i0, startJ: drag.j0,
                endI:   drag.i0, endJ:   drag.j0,
                previewCells: [],
                changes: [],
                visited: new Set(),
            };
            _pencilSetCell(drag.i0, drag.j0, "toggle");
            beadlist.update();
            view.draw();
            setModified();
            _commitPencilStroke();
            ActionRegistry.notify();
            return;
        }
        view.draw();
        _updateStatusbar();
        // Selection just finalised — refresh toolbar/menu so the
        // selection-dependent actions (Anordnen / Mirror / …) flip
        // their enabled state.
        ActionRegistry.notify();
    }
    if (_pencil_stroke) {
        if (_pencil_stroke.mode === "click") {
            // No drag — apply the desktop's "click toggles"
            // behaviour: a cell already in the active colour clears,
            // anything else gets painted.
            _pencilSetCell(_pencil_stroke.startI,
                           _pencil_stroke.startJ, "toggle");
        } else {
            // Drag — commit the previewed line by painting every
            // cell along it with the active colour.
            for (const [pi, pj] of _pencil_stroke.previewCells) {
                _pencilSetCell(pi, pj, "paint");
            }
        }
        beadlist.update();
        view.draw();
        setModified();
        _commitPencilStroke();
    }
}


// ---- Pencil tool -------------------------------------------------

// Apply a change to a single cell within the in-progress stroke.
// `mode` is either "toggle" (single click — selected_color → bg, else
// → selected_color) or "paint" (drag — always set to selected_color).
function _pencilSetCell(i, j, mode) {
    if (!_pencil_stroke) return;
    if (i < 0 || j < 0 || i >= pattern.width || j >= pattern.height) return;
    const key = i + "," + j;
    if (_pencil_stroke.visited.has(key)) return;
    _pencil_stroke.visited.add(key);
    const oldVal = pattern.get(i, j);
    const newVal = (mode === "toggle" && oldVal === selected_color)
        ? background_color
        : selected_color;
    if (oldVal === newVal) return;
    _pencil_stroke.changes.push({ i, j, oldVal, newVal });
    pattern.set(i, j, newVal);
}

// Bresenham cell list between two grid points (inclusive).
function _bresenhamCells(x0, y0, x1, y1) {
    const cells = [];
    let x = x0, y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
        cells.push([x, y]);
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 <  dx) { err += dx; y += sy; }
    }
    return cells;
}

// Snap (i, j) so the line from (startI, startJ) becomes one of the
// 8 cardinal/diagonal directions. Used when Ctrl is held during a
// pencil drag.
function _constrainTo8Dir(startI, startJ, i, j) {
    const dx = i - startI, dy = j - startJ;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx === 0 && ady === 0) return [startI, startJ];
    const sx = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
    const sy = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
    if (adx > ady * 2) {
        return [startI + dx, startJ];      // horizontal
    }
    if (ady > adx * 2) {
        return [startI, startJ + dy];      // vertical
    }
    const len = Math.max(adx, ady);
    return [startI + sx * len, startJ + sy * len];  // diagonal
}

// Translucent tracer overlay drawn after view.draw() while the user
// is dragging the pencil — shows where the line will land without
// touching the underlying pattern data. Drawn only on the draft
// view (the tool that's most natural for line-drawing); other views
// will pick up the line once it's committed on mouseup.
function _drawPencilPreview() {
    if (!_pencil_stroke
        || _pencil_stroke.mode !== "drag"
        || !view || !view.draft
        || !_pencil_stroke.previewCells.length) return;
    const ctx = view.ctx;
    const dx = settings.dx, dy = settings.dy;
    const off = pattern.scroll | 0;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = colors[selected_color] || "#888";
    ctx.strokeStyle = "#ff5";
    ctx.lineWidth = 1;
    for (const [i, j] of _pencil_stroke.previewCells) {
        const j_view = j - off;
        if (i < 0 || i >= view.draft.width) continue;
        if (j_view < 0 || j_view >= view.draft.height) continue;
        const x = 0.5 + (view.draft.x + i) * dx;
        const y = 0.5 + (view.draft.y + view.draft.height - j_view - 1) * dy;
        ctx.fillRect(x, y, dx, dy);
        ctx.strokeRect(x, y, dx, dy);
    }
    ctx.restore();
}

function _commitPencilStroke() {
    if (!_pencil_stroke || _pencil_stroke.changes.length === 0) {
        _pencil_stroke = null;
        return;
    }
    const changes = _pencil_stroke.changes;
    _pencil_stroke = null;
    // Wrap the in-progress edits as one undo entry; apply() is a no-op
    // the first time (work already done) but applies on redo.
    let applied = true;
    commandBus.execute({
        label: "stroke",
        apply: () => {
            if (applied) { applied = false; return; }
            for (const c of changes) pattern.set(c.i, c.j, c.newVal);
            beadlist.update();
            view.draw();
        },
        revert: () => {
            for (let k = changes.length - 1; k >= 0; k--) {
                pattern.set(changes[k].i, changes[k].j, changes[k].oldVal);
            }
            beadlist.update();
            view.draw();
        },
    });
}


// ---- Selection transforms ----------------------------------------

function _selectionRegion() {
    const s = pattern.selection;
    if (!s) return null;
    return {
        i1: Math.max(0, s.i1),
        j1: Math.max(0, s.j1),
        i2: Math.min(pattern.width - 1, s.i2),
        j2: Math.min(pattern.height - 1, s.j2),
    };
}

function _selectionTransform(kind) {
    const r = _selectionRegion();
    if (!r) return;
    const W = r.i2 - r.i1 + 1, H = r.j2 - r.j1 + 1;
    if (kind === "rotate" && W !== H) return;
    const before = snapshotGridRegion(pattern, r.i1, r.j1, r.i2, r.j2);
    const apply = () => {
        switch (kind) {
        case "delete":
            for (let j = r.j1; j <= r.j2; j++)
                for (let i = r.i1; i <= r.i2; i++)
                    pattern.set(i, j, background_color);
            break;
        case "mirror-h": {
            for (let j = r.j1; j <= r.j2; j++) {
                const row = [];
                for (let i = r.i1; i <= r.i2; i++) row.push(pattern.get(i, j));
                row.reverse();
                for (let i = 0; i < row.length; i++)
                    pattern.set(r.i1 + i, j, row[i]);
            }
            break;
        }
        case "mirror-v": {
            for (let j = 0; j < Math.floor(H / 2); j++) {
                for (let i = r.i1; i <= r.i2; i++) {
                    const a = pattern.get(i, r.j1 + j);
                    const b = pattern.get(i, r.j2 - j);
                    pattern.set(i, r.j1 + j, b);
                    pattern.set(i, r.j2 - j, a);
                }
            }
            break;
        }
        case "rotate": {
            // 90° clockwise (relative to canvas-up coords). Snapshot
            // the region first, then write back transposed.
            const src = [];
            for (let j = r.j1; j <= r.j2; j++) {
                const row = [];
                for (let i = r.i1; i <= r.i2; i++) row.push(pattern.get(i, j));
                src.push(row);
            }
            // src[y][x] → out[x][H-1-y]
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    pattern.set(r.i1 + (H - 1 - y), r.j1 + x, src[y][x]);
                }
            }
            break;
        }
        }
        beadlist.update();
        view.draw();
        setModified();
    };
    let applied = false;
    commandBus.execute({
        label: "selection." + kind,
        apply: () => {
            if (!applied) { apply(); applied = true; }
            else { apply(); }
        },
        revert: () => {
            restoreGridRegion(pattern, before);
            beadlist.update();
            view.draw();
        },
    });
}

// ---- Resize / row ops -------------------------------------------

function _replacePatternData(newWidth, newHeight, newData) {
    pattern.width = newWidth;
    pattern.height = newHeight;
    pattern.data = newData;
    pattern.selection = null;
    if (pattern.scroll > Math.max(0, newHeight - 1)) {
        pattern.scroll = Math.max(0, newHeight - 1);
    }
    if (newWidth > 0 && pattern.shift >= newWidth) {
        pattern.shift = ((pattern.shift % newWidth) + newWidth) % newWidth;
    }
    if (view) view.layout();
    if (beadlist) beadlist.update();
    _refreshScrollbar();
    if (view) view.draw();
    setModified();
}

function _doResize(newWidth, newHeight) {
    if (newWidth <= 0 || newHeight <= 0) return;
    if (newWidth === pattern.width && newHeight === pattern.height) return;
    const oldW = pattern.width, oldH = pattern.height;
    const oldData = pattern.data.slice();
    const newData = new Array(newWidth * newHeight).fill(0);
    const cw = Math.min(oldW, newWidth);
    const ch = Math.min(oldH, newHeight);
    for (let j = 0; j < ch; j++) {
        for (let i = 0; i < cw; i++) {
            newData[i + j * newWidth] = oldData[i + j * oldW];
        }
    }
    let applied = false;
    commandBus.execute({
        label: "resize",
        apply: () => {
            _replacePatternData(newWidth, newHeight, newData.slice());
            applied = true;
        },
        revert: () => {
            _replacePatternData(oldW, oldH, oldData.slice());
        },
    });
}

function _insertRowAt(j) {
    const W = pattern.width, H = pattern.height;
    if (j < 0) j = 0;
    if (j > H) j = H;
    const oldData = pattern.data.slice();
    const newData = new Array(W * (H + 1)).fill(0);
    // Rows below j (lower y indices) stay; new zero row at j;
    // rows >= j shift up by one.
    for (let r = 0; r < j; r++) {
        for (let i = 0; i < W; i++) {
            newData[i + r * W] = oldData[i + r * W];
        }
    }
    for (let r = j; r < H; r++) {
        for (let i = 0; i < W; i++) {
            newData[i + (r + 1) * W] = oldData[i + r * W];
        }
    }
    let applied = false;
    commandBus.execute({
        label: "insert-row",
        apply: () => {
            _replacePatternData(W, H + 1, newData.slice());
            applied = true;
        },
        revert: () => {
            _replacePatternData(W, H, oldData.slice());
        },
    });
}

function _deleteRowAt(j) {
    const W = pattern.width, H = pattern.height;
    if (H <= 1) return;            // refuse to leave an empty pattern
    if (j < 0 || j >= H) return;
    const oldData = pattern.data.slice();
    const newData = new Array(W * (H - 1)).fill(0);
    for (let r = 0; r < j; r++) {
        for (let i = 0; i < W; i++) {
            newData[i + r * W] = oldData[i + r * W];
        }
    }
    for (let r = j + 1; r < H; r++) {
        for (let i = 0; i < W; i++) {
            newData[i + (r - 1) * W] = oldData[i + r * W];
        }
    }
    let applied = false;
    commandBus.execute({
        label: "delete-row",
        apply: () => {
            _replacePatternData(W, H - 1, newData.slice());
            applied = true;
        },
        revert: () => {
            _replacePatternData(W, H, oldData.slice());
        },
    });
}

function _activeRow() {
    // Top-of-selection if there is one; otherwise topmost used row.
    if (pattern.selection) return pattern.selection.j2;
    return Math.max(0, (beadlist.usedHeight | 0) - 1);
}

function _openSizeDialog(axis) {
    const isWidth = axis === "width";
    const cur = isWidth ? pattern.width : pattern.height;
    const wrap = document.createElement("div");
    const lbl = document.createElement("label");
    lbl.textContent = isWidth
        ? _actionLabel("pattern.new-width",  "New width:")
        : _actionLabel("pattern.new-height", "New height:");
    lbl.style.marginRight = "8px";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "5000";
    input.value = String(cur);
    input.style.width = "5rem";
    wrap.appendChild(lbl);
    wrap.appendChild(input);

    Modal.open({
        title: isWidth
            ? _actionLabel("pattern.width-title",  "Pattern width")
            : _actionLabel("pattern.height-title", "Pattern height"),
        body: wrap,
        buttons: [
            { label: _actionLabel("btn.cancel", "Cancel"), role: "cancel" },
            {
                label: _actionLabel("btn.ok", "OK"), role: "primary",
                onClick: (m) => {
                    const v = parseInt(input.value, 10);
                    if (!Number.isFinite(v) || v < 1) return;
                    if (v < cur) {
                        if (!confirm(_actionLabel(
                            "pattern.confirm-shrink",
                            "Shrinking will discard data outside the new "
                            + "size. Continue?"))) return;
                    }
                    if (isWidth) _doResize(v, pattern.height);
                    else         _doResize(pattern.width, v);
                    m.close();
                },
            },
        ],
    });
}


// ---- Properties dialog ------------------------------------------

function _openPropertiesDialog() {
    if (readonly) return;
    const cur = {
        author:       (data && data.author) || "",
        organization: (data && data.organization) || "",
        notes:        (data && data.notes) || "",
    };
    const body = document.createElement("div");
    body.style.minWidth = "420px";
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:0.4rem 1rem;align-items:start">
            <label>${_actionLabel("props.author", "Author:")}</label>
            <input id="tx-pp-author" type="text" style="width:100%">
            <label>${_actionLabel("props.organization", "Organization:")}</label>
            <input id="tx-pp-org" type="text" style="width:100%">
            <label>${_actionLabel("props.notes", "Notes:")}</label>
            <textarea id="tx-pp-notes" rows="6" style="width:100%;resize:vertical"></textarea>
        </div>`;
    const $ = (sel) => body.querySelector(sel);
    $("#tx-pp-author").value = cur.author;
    $("#tx-pp-org").value    = cur.organization;
    $("#tx-pp-notes").value  = cur.notes;
    setTimeout(() => {
        $("#tx-pp-author").focus();
        $("#tx-pp-author").select();
    }, 0);

    let modal;
    const accept = () => {
        const next = {
            author:       $("#tx-pp-author").value,
            organization: $("#tx-pp-org").value,
            notes:        $("#tx-pp-notes").value,
        };
        if (next.author === cur.author
            && next.organization === cur.organization
            && next.notes === cur.notes) {
            modal.close();
            return;
        }
        const before = { ...cur };
        const after  = { ...next };
        let firstApply = true;
        commandBus.execute({
            label: "properties",
            apply: () => {
                data.author       = after.author;
                data.organization = after.organization;
                data.notes        = after.notes;
                if (!firstApply) setModified();
                firstApply = false;
            },
            revert: () => {
                data.author       = before.author;
                data.organization = before.organization;
                data.notes        = before.notes;
                setModified();
            },
        });
        setModified();
        modal.close();
    };
    modal = Modal.open({
        title: _actionLabel("props.title", "Properties"),
        body,
        buttons: [
            { label: _actionLabel("btn.cancel", "Cancel"), role: "cancel" },
            { label: _actionLabel("btn.ok", "OK"), role: "primary",
              onClick: accept },
        ],
    });
}


// Page setup — header / footer template strings for printing. Tokens
// (&Pattern / &Author / &Organisation / &File / &Page and the German
// &Muster / &Autor / &Seite / &Datei) are expanded server-side. Mirrors
// dbweave's PageSetupDialog.
const _DEFAULT_HEADER_TEXT = "JBead - &Pattern (&Author)";
const _DEFAULT_FOOTER_TEXT = "";

function _openPageSetupDialog() {
    if (readonly) return;
    const curHeader = (data && typeof data.header_text === "string")
        ? data.header_text : _DEFAULT_HEADER_TEXT;
    const curFooter = (data && typeof data.footer_text === "string")
        ? data.footer_text : _DEFAULT_FOOTER_TEXT;
    const tokenHelp = _actionLabel("page-setup.tokens",
        "Tokens: &Pattern, &Author, &Organisation, &File, &Page");
    const body = document.createElement("div");
    body.style.minWidth = "460px";
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:0.4rem 1rem;align-items:center">
            <label>${_actionLabel("page-setup.header", "Header:")}</label>
            <input id="tx-ps-header" type="text" style="width:100%">
            <label>${_actionLabel("page-setup.footer", "Footer:")}</label>
            <input id="tx-ps-footer" type="text" style="width:100%">
        </div>
        <p style="margin-top:0.6rem;font-size:0.85em;color:#666">${tokenHelp}</p>`;
    const $ = (sel) => body.querySelector(sel);
    $("#tx-ps-header").value = curHeader;
    $("#tx-ps-footer").value = curFooter;
    setTimeout(() => {
        $("#tx-ps-header").focus();
        $("#tx-ps-header").select();
    }, 0);

    let modal;
    const accept = () => {
        const newHeader = $("#tx-ps-header").value;
        const newFooter = $("#tx-ps-footer").value;
        if (newHeader === curHeader && newFooter === curFooter) {
            modal.close();
            return;
        }
        const before = { header_text: data.header_text, footer_text: data.footer_text };
        const after  = { header_text: newHeader,        footer_text: newFooter };
        let firstApply = true;
        commandBus.execute({
            label: "page-setup",
            apply: () => {
                data.header_text = after.header_text;
                data.footer_text = after.footer_text;
                if (!firstApply) setModified();
                firstApply = false;
            },
            revert: () => {
                data.header_text = before.header_text;
                data.footer_text = before.footer_text;
                setModified();
            },
        });
        setModified();
        modal.close();
    };
    modal = Modal.open({
        title: _actionLabel("page-setup.title", "Page setup"),
        body,
        buttons: [
            { label: _actionLabel("btn.cancel", "Cancel"), role: "cancel" },
            { label: _actionLabel("btn.ok", "OK"), role: "primary",
              onClick: accept },
        ],
    });
}


// ---- Technical info dialog --------------------------------------

function _openTechInfoDialog() {
    const root = document.createElement("div");
    root.style.minWidth = "260px";

    const used = beadlist.usedHeight | 0;
    const total = used * pattern.width;
    const repeat = beadlist.repeat | 0;

    const items = [
        [_actionLabel("info.circumference", "Circumference:"), pattern.width],
        [_actionLabel("info.rows", "Rows:"), used],
        [_actionLabel("info.total-beads", "Total beads:"), total],
        [_actionLabel("info.repeat", "Repeat:"), repeat],
        [_actionLabel("info.bead-runs", "Colour runs:"), beadlist.list.length],
    ];

    const tbl = document.createElement("table");
    tbl.style.borderCollapse = "collapse";
    for (const [label, value] of items) {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = label;
        th.style.textAlign = "left";
        th.style.padding = "2px 12px 2px 0";
        const td = document.createElement("td");
        td.textContent = String(value);
        td.style.padding = "2px 0";
        td.style.fontFamily = "monospace";
        tr.appendChild(th);
        tr.appendChild(td);
        tbl.appendChild(tr);
    }
    root.appendChild(tbl);

    // Per-colour totals.
    const counts = new Map();
    for (let j = 0; j < used; j++) {
        for (let i = 0; i < pattern.width; i++) {
            const c = pattern.get(i, j);
            if (c <= 0) continue;
            counts.set(c, (counts.get(c) || 0) + 1);
        }
    }
    if (counts.size > 0) {
        const h = document.createElement("h4");
        h.textContent = _actionLabel("info.per-color",
                                     "Beads per colour:");
        h.style.margin = "12px 0 4px";
        root.appendChild(h);
        const grid = document.createElement("div");
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(60px, 1fr))";
        grid.style.gap = "4px";
        const sorted = Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
        for (const [c, n] of sorted) {
            const cell = document.createElement("div");
            cell.style.display = "flex";
            cell.style.alignItems = "center";
            cell.style.gap = "4px";
            const sw = document.createElement("span");
            sw.style.display = "inline-block";
            sw.style.width = "16px";
            sw.style.height = "16px";
            sw.style.border = "1px solid #888";
            sw.style.background = colors[c];
            cell.appendChild(sw);
            const label = document.createElement("span");
            label.textContent = `${n}×`;
            label.style.fontFamily = "monospace";
            cell.appendChild(label);
            grid.appendChild(cell);
        }
        root.appendChild(grid);
    }

    Modal.open({
        title: _actionLabel("info.title", "Technical info"),
        body: root,
        buttons: [
            { label: _actionLabel("btn.ok", "OK"), role: "primary" },
        ],
    });
}


// ---- Colour palette editor --------------------------------------

function _rgbFromString(rgbStr) {
    // colors[] entries are "rgb(R, G, B)" strings.
    const m = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(rgbStr || "");
    if (!m) return [0, 0, 0];
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

function _applyPalette(palette) {
    // palette is an array of [r, g, b] triples.
    for (let i = 0; i < palette.length; i++) {
        const [r, g, b] = palette[i];
        colors[i] = `rgb(${r}, ${g}, ${b})`;
        if (data && data.colors && data.colors[i]) {
            data.colors[i] = [r | 0, g | 0, b | 0];
        }
    }
}

function _openPaletteDialog() {
    // Live state we have to be able to roll back: colors[] (display
    // strings) and data.colors (canonical [r, g, b] triples). We
    // snapshot both up front, then use ColorPicker.showPaletteEditor
    // for the actual UI — same widget the weave editor uses
    // (showPaletteDialog in dbweave.js: hue ring + S/V square +
    // numeric sliders + palette grid).
    const before = colors.map(_rgbFromString);

    ColorPicker.showPaletteEditor({
        palette: before,
        currentIndex: selected_color | 0,
        getLabel: _actionLabel,
        cols: 8,
        // Live preview while the dialog is open.
        onPreview: (draft) => {
            _applyPalette(draft);
            if (view) view.draw();
        },
        // Cancel rolls colour state back; the onPreview hook also
        // restores it when ColorPicker calls `onPreview(before)`.
        onCancel: () => { /* preview hook already reverted */ },
        // OK commits the change as one undoable command. apply() is
        // a no-op on first call (state is already live), but applies
        // on redo.
        onCommit: (after, currentIdx) => {
            selected_color = currentIdx | 0;
            const beforeSnap = before.map(c => c.slice());
            const afterSnap  = after.map(c => c.slice());
            let firstApply = true;
            commandBus.execute({
                label: "palette",
                apply: () => {
                    if (firstApply) { firstApply = false; return; }
                    _applyPalette(afterSnap);
                    if (view) view.draw();
                    setModified();
                },
                revert: () => {
                    _applyPalette(beforeSnap);
                    if (view) view.draw();
                    setModified();
                },
            });
            setModified();
        },
    });
}


// ---- Arrange (copy selection with offset, N times) ---------------

function _openArrangeDialog() {
    if (!pattern.selection) return;
    const sel = pattern.selection;
    const W = sel.i2 - sel.i1 + 1;
    const H = sel.j2 - sel.j1 + 1;
    const PW = pattern.width;
    const PH = pattern.height;

    // Snapshot the full pattern data at dialog open. Live preview
    // mutates pattern.data in place; on every input change (and on
    // Cancel) we restore this baseline before re-running the
    // arrangement, so previews don't pile up.
    const baseline = pattern.data.slice();
    // Capture the source cells once — they don't change while the
    // dialog is open and they reference pattern coords inside the
    // selection (which the preview won't overwrite for k=0).
    const src = [];
    for (let j = 0; j < H; j++) {
        const row = [];
        for (let i = 0; i < W; i++) row.push(pattern.get(sel.i1 + i, sel.j1 + j));
        src.push(row);
    }

    const restore = () => {
        for (let i = 0; i < baseline.length; i++) pattern.data[i] = baseline[i];
    };
    const renderPreview = (dx, dy, copies) => {
        restore();
        _applyArrangeMutation(sel, src, W, H, PW, PH, dx, dy, copies);
        beadlist.update();
        view.draw();
    };

    const wrap = document.createElement("div");
    const mk = (id, labelKey, label, def) => {
        const row = document.createElement("div");
        row.style.margin = "6px 0";
        const lbl = document.createElement("label");
        lbl.textContent = _actionLabel(labelKey, label);
        lbl.style.display = "inline-block";
        lbl.style.minWidth = "9rem";
        lbl.htmlFor = id;
        const inp = document.createElement("input");
        inp.type = "number";
        inp.id = id;
        inp.value = def;
        inp.style.width = "5rem";
        row.appendChild(lbl);
        row.appendChild(inp);
        wrap.appendChild(row);
        return inp;
    };
    const inDx = mk("arr-dx", "arrange.dx", "Horizontal offset:", W);
    const inDy = mk("arr-dy", "arrange.dy", "Vertical offset:", H);
    const inN  = mk("arr-n",  "arrange.copies", "Number of copies:", 1);

    const refresh = () => {
        const dx = parseInt(inDx.value, 10) || 0;
        const dy = parseInt(inDy.value, 10) || 0;
        const n  = Math.max(1, parseInt(inN.value, 10) || 1);
        renderPreview(dx, dy, n);
    };
    for (const inp of [inDx, inDy, inN]) {
        inp.addEventListener("input", refresh);
    }
    // Initial preview matches the dialog's defaults.
    refresh();

    let committing = false;
    Modal.open({
        title: _actionLabel("arrange.title", "Arrange selection"),
        body: wrap,
        buttons: [
            { label: _actionLabel("btn.cancel", "Cancel"), role: "cancel" },
            {
                label: _actionLabel("btn.ok", "OK"), role: "primary",
                onClick: (m) => {
                    committing = true;
                    const dx = parseInt(inDx.value, 10) || 0;
                    const dy = parseInt(inDy.value, 10) || 0;
                    const n  = Math.max(1, parseInt(inN.value, 10) || 1);
                    // Roll back the preview before the real apply so
                    // _arrangeSelection's snapshot captures the
                    // original baseline (otherwise undo would only
                    // revert to a previewed state).
                    restore();
                    beadlist.update();
                    view.draw();
                    _arrangeSelection(dx, dy, n);
                    m.close();
                },
            },
        ],
        onClose: () => {
            // ESC / cancel / backdrop click — discard the preview.
            if (!committing) {
                restore();
                beadlist.update();
                view.draw();
            }
        },
    });
}

// ---- Selection group move ---------------------------------------
//
// "Pick up" everything in the pattern that matches the current
// selection's content and drag it as a group. Anchored on three
// gestures: mouse drag of an existing selection, Shift+Arrow on a
// keyboard, and the toolbar arrow buttons (TODO).

function _captureSelectionGroup() {
    if (!pattern.selection) return null;
    const sel = pattern.selection;
    const W = sel.i2 - sel.i1 + 1;
    const H = sel.j2 - sel.j1 + 1;
    const PW = pattern.width;
    const PH = pattern.height;
    const total = PW * PH;
    // The selection's "shape" is a set of linear offsets relative to
    // the top-left bead's linear index. Working linearly (instead of
    // in 2D x/y coordinates) means a 2x2 selection at the seam — say
    // (W-1, j) wrapping into (0, j+1) — is still recognised as the
    // same shape, so all symmetric copies move together when the
    // group is dragged.
    const offsets = [];
    const values = [];
    for (let m = 0; m < H; m++) {
        for (let k = 0; k < W; k++) {
            offsets.push(k + m * PW);
            values.push(pattern.get(sel.i1 + k, sel.j1 + m));
        }
    }
    const maxOffset = offsets[offsets.length - 1];
    // Scan every linear base where the full shape stays in-bounds.
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
        matches,  // array of linear base positions
        baseline: pattern.data.slice(),
    };
}

// Render `group` translated by linear offset `dy * PW + dx`: restore
// baseline, lift every match (paint background_color), stamp the
// captured shape at the linearly-offset positions. Selection rect
// moves by the (dx, dy) the user gestured; if that pushes it past the
// seam the visual rect may extend outside the pattern (and won't be
// drawn there) but the underlying data has wrapped correctly.
function _stampSelectionGroup(group, dx, dy) {
    const { sel, PW, total, offsets, values, matches, baseline } = group;
    for (let k = 0; k < baseline.length; k++) pattern.data[k] = baseline[k];
    for (const L of matches) {
        for (const off of offsets) {
            const tl = L + off;
            if (tl < 0 || tl >= total) continue;
            pattern.data[tl] = background_color;
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

// Bounding rect over every linear position that the group either
// lifts from or stamps into. Used by the snapshot for undo — it
// over-captures (rect covers whole rows when cells are scattered),
// but that's correct for `snapshotGridRegion`'s rectangular API.
function _affectedRectForGroupMove(group, dx, dy) {
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

// Single-arrow / toolbar entry point: capture, commit, push one undo
// step. Called once per Shift+Arrow press / button click.
function _moveSelectionGroup(dx, dy) {
    if (!pattern.selection || readonly) return;
    if (dx === 0 && dy === 0) return;
    const group = _captureSelectionGroup();
    if (!group) return;
    _finalizeSelectionGroupMove(group, group.sel, dx, dy);
}

// Roll the live-preview mutation back to the baseline, snapshot the
// affected region, then commandBus.execute the actual move so undo
// reverts to the original state in one step.
function _finalizeSelectionGroupMove(group, sel0, dx, dy) {
    if (dx === 0 && dy === 0) {
        // No-op drag — restore baseline and selection just in case
        // the live preview drifted, but don't push an undo entry.
        for (let k = 0; k < group.baseline.length; k++) {
            pattern.data[k] = group.baseline[k];
        }
        pattern.selection = { ...sel0 };
        beadlist.update();
        view.draw();
        _updateStatusbar();
        return;
    }
    const affected = _affectedRectForGroupMove(group, dx, dy);
    // Roll back any preview mutations before snapshotting.
    for (let k = 0; k < group.baseline.length; k++) {
        pattern.data[k] = group.baseline[k];
    }
    pattern.selection = { ...sel0 };
    if (!affected) {
        beadlist.update();
        view.draw();
        return;
    }
    const before = snapshotGridRegion(pattern, affected.i1, affected.j1,
                                      affected.i2, affected.j2);
    let firstApply = true;
    commandBus.execute({
        label: "selection.move",
        apply: () => {
            _stampSelectionGroup(group, dx, dy);
            beadlist.update();
            view.draw();
            if (!firstApply) setModified();
            firstApply = false;
            _updateStatusbar();
            ActionRegistry.notify();
        },
        revert: () => {
            restoreGridRegion(pattern, before);
            pattern.selection = { ...sel0 };
            beadlist.update();
            view.draw();
            _updateStatusbar();
            ActionRegistry.notify();
        },
    });
    setModified();
}


// Pure mutation helper shared between the live-preview path in
// _openArrangeDialog and the committed apply in _arrangeSelection.
// Writes copies of `src` into pattern.data at linear-bead offsets
// `k * (dy * PW + dx)` for k = 1..copies; out-of-bounds linear
// indices are skipped.
function _applyArrangeMutation(sel, src, W, H, PW, PH, dx, dy, copies) {
    const linearOffset = dy * PW + dx;
    if (copies < 1 || linearOffset === 0) return;
    const total = PW * PH;
    for (let k = 1; k <= copies; k++) {
        for (let j = 0; j < H; j++) {
            for (let i = 0; i < W; i++) {
                const srcLin = (sel.j1 + j) * PW + (sel.i1 + i);
                const tl = srcLin + k * linearOffset;
                if (tl < 0 || tl >= total) continue;
                pattern.set(tl % PW, Math.trunc(tl / PW), src[j][i]);
            }
        }
    }
}

function _arrangeSelection(dx, dy, copies) {
    if (!pattern.selection) return;
    const sel = pattern.selection;
    const W = sel.i2 - sel.i1 + 1;
    const H = sel.j2 - sel.j1 + 1;
    const PW = pattern.width;
    const PH = pattern.height;
    // (dx, dy) is interpreted as a *linear* bead offset: each successive
    // copy is shifted by `dy * PW + dx` beads in the row-major linear
    // order. So overflowing the right edge wraps to the next row up,
    // matching how a beaded rope is arranged. (The desktop jbead's
    // single-offset version is the same idea, just with dx folded into
    // dy implicitly.)
    const linearOffset = dy * PW + dx;
    if (copies < 1 || linearOffset === 0) return;
    // Capture source cells before any writes (in case copies overlap).
    const src = [];
    for (let j = 0; j < H; j++) {
        const row = [];
        for (let i = 0; i < W; i++) row.push(pattern.get(sel.i1 + i, sel.j1 + j));
        src.push(row);
    }
    // Snapshot region: the linear range from min to max target index
    // is contiguous; for a rectangular snapshot we cover whole rows.
    const total = PW * PH;
    const sourceFirst = sel.j1 * PW + sel.i1;
    const sourceLast  = sel.j2 * PW + sel.i2;
    const targets = [
        sourceFirst, sourceLast,
        sourceFirst + copies * linearOffset,
        sourceLast  + copies * linearOffset,
    ];
    let minLin = Math.min(...targets);
    let maxLin = Math.max(...targets);
    if (minLin < 0) minLin = 0;
    if (maxLin >= total) maxLin = total - 1;
    if (minLin > maxLin) return;
    const i1 = 0;
    const i2 = PW - 1;
    const j1 = Math.trunc(minLin / PW);
    const j2 = Math.trunc(maxLin / PW);
    const before = snapshotGridRegion(pattern, i1, j1, i2, j2);
    const apply = () => {
        _applyArrangeMutation(sel, src, W, H, PW, PH, dx, dy, copies);
        beadlist.update();
        view.draw();
        setModified();
    };
    let applied = false;
    commandBus.execute({
        label: "arrange",
        apply: () => {
            if (!applied) { apply(); applied = true; }
            else { apply(); }
        },
        revert: () => {
            restoreGridRegion(pattern, before);
            beadlist.update();
            view.draw();
        },
    });
}


function _shiftPattern(delta) {
    // View-only operation: rotates the simulated bead tube by `delta`
    // cells. The underlying data is not touched, so the bead-list,
    // repeat, draft and corrected views are unaffected — matching
    // desktop's Model.shift / SimulationPanel.getShift behaviour
    // (only ch.jbead.view.SimulationPanel reads the shift value).
    //
    // The shift is *not* part of the undo stack (a single keystroke
    // reverses it) and does not mark the pattern modified — but it is
    // persisted via savePatternData so save/load round-trips it.
    const W = pattern.width;
    const before = pattern.shift | 0;
    const after = (((before + delta) % W) + W) % W;
    if (after === before) return;
    pattern.shift = after;
    view.draw();
}


// ---- Fill tool ---------------------------------------------------

function _bucketFill(i, j) {
    const target = pattern.get(i, j);
    if (target === selected_color) return;
    const W = pattern.width, H = pattern.height;
    const queue = [[i, j]];
    const changes = [];
    const seen = new Uint8Array(W * H);
    seen[i + j * W] = 1;
    while (queue.length) {
        const [ci, cj] = queue.shift();
        if (pattern.get(ci, cj) !== target) continue;
        changes.push({ i: ci, j: cj, oldVal: target, newVal: selected_color });
        const tries = [[ci - 1, cj], [ci + 1, cj], [ci, cj - 1], [ci, cj + 1]];
        for (const [ni, nj] of tries) {
            if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
            const k = ni + nj * W;
            if (seen[k]) continue;
            seen[k] = 1;
            queue.push([ni, nj]);
        }
    }
    if (!changes.length) return;
    let firstApply = true;
    commandBus.execute({
        label: "fill",
        apply: () => {
            if (firstApply) {
                for (const c of changes) pattern.set(c.i, c.j, c.newVal);
                firstApply = false;
            } else {
                for (const c of changes) pattern.set(c.i, c.j, c.newVal);
            }
            beadlist.update();
            view.draw();
        },
        revert: () => {
            for (const c of changes) pattern.set(c.i, c.j, c.oldVal);
            beadlist.update();
            view.draw();
        },
    });
    setModified();
}

function initPattern(data, pattern) {
    for (let i = 0; i < data.colors.length; i++) {
        const spec = data.colors[i];
        colors.push(`rgb(${spec[0]}, ${spec[1]}, ${spec[2]})`);
    }
    for (let j = 0; j < pattern.height; j++) {
        const row = data.model[j];
        for (let i = 0; i < row.length; i++) {
            pattern.set(i, j, row[i]);
        }
    }
}

function saveSettings(data, settings) {
    if (!data.view) data.view = {};
    data.view["selected-color"] = selected_color;
    data.view["shift"] = pattern.shift | 0;
    data.view["scroll"] = pattern.scroll | 0;
    data.view["zoom"] = settings.dx | 0;
    data.view["draft-visible"] = !!show_draft;
    data.view["corrected-visible"] = !!show_corrected;
    data.view["simulation-visible"] = !!show_simulation;
    data.view["report-visible"] = !!show_report;
    data.view["selected-tool"] = current_tool;
    data.view["draw-colors"] = !!draw_colors;
    data.view["draw-symbols"] = !!draw_symbols;
    data.view["symbols"] = pattern_symbols || _DEFAULT_SYMBOLS;
}

function savePatternData(data, pattern) {
    // Rebuild data.model from the live Pattern dimensions so that
    // resize/insert-row/delete-row are persisted correctly even
    // when data.model's old dimensions don't match.
    const rows = [];
    for (let j = 0; j < pattern.height; j++) {
        const row = new Array(pattern.width);
        for (let i = 0; i < pattern.width; i++) row[i] = pattern.get(i, j);
        rows.push(row);
    }
    data.model = rows;
    // Persist the detected repeat length so the server can index it.
    if (Number.isInteger(pattern.repeat) && pattern.repeat > 0) {
        data.repeat = pattern.repeat;
    }
}

// ---- Menubar / toolbar / shortcuts wiring ------------------------

function _updateStatusbar() {
    const sbTool = document.getElementById("sb-tool");
    if (sbTool) {
        const toolLabel = current_tool
            ? _actionLabel("tool." + current_tool, current_tool) : "";
        sbTool.textContent = current_tool
            ? `${_actionLabel("sb.tool", "Tool")}: ${toolLabel}` : "";
    }
    const sbRepeat = document.getElementById("sb-repeat");
    if (sbRepeat && beadlist) {
        const total = beadlist.list.reduce((acc, [, c]) => acc + c, 0);
        sbRepeat.textContent = beadlist.repeat
            ? `${_actionLabel("sb.repeat", "Repeat")}: ${beadlist.repeat} `
              + `(${total} ${_actionLabel("sb.beads", "beads")})`
            : "";
    }
    const sbSel = document.getElementById("sb-selection");
    if (sbSel) {
        const s = pattern && pattern.selection;
        sbSel.textContent = s
            ? `${_actionLabel("sb.selection", "Sel")}: `
              + `${s.i2 - s.i1 + 1} × ${s.j2 - s.j1 + 1}` : "";
    }
}

// Discard in-memory edits and reload the pattern from the server.
// Mirrors weave's _revertChanges in dbweave.js.
async function _revertChanges() {
    if (readonly || !modified) return;
    if (!window.confirm(_actionLabel("file.revert-confirm",
        "Discard all unsaved changes and reload the pattern from the server?"))) {
        return;
    }
    await getPattern();

    // Rebuild the in-memory model from the freshly-loaded `data`.
    pattern = new Pattern(data.model[0].length, data.model.length);
    beadlist = new BeadList(pattern);
    initPattern(data, pattern);

    // Re-apply persisted view state (kept in sync with init()).
    const v = data['view'] || {};
    if (v['selected-color'] != null) selected_color = v['selected-color'] | 0;
    pattern.shift  = (v['shift']  != null) ? (v['shift']  | 0) : 0;
    pattern.scroll = (v['scroll'] != null) ? (v['scroll'] | 0) : 0;
    pattern.selection = null;
    if (v['zoom'] != null) {
        const z = v['zoom'] | 0;
        if (z >= 4 && z <= 48) { settings.dx = z; settings.dy = z; }
    }
    if (v['draft-visible']      != null) show_draft      = !!v['draft-visible'];
    if (v['corrected-visible']  != null) show_corrected  = !!v['corrected-visible'];
    if (v['simulation-visible'] != null) show_simulation = !!v['simulation-visible'];
    if (v['report-visible']     != null) show_report     = !!v['report-visible'];
    if (typeof v['selected-tool'] === "string"
        && ["pencil", "select", "fill", "pipette"].indexOf(v['selected-tool']) >= 0) {
        current_tool = v['selected-tool'];
    }
    if (typeof v['symbols'] === "string" && v['symbols'].length > 0) {
        pattern_symbols = v['symbols'];
    }
    if (v['draw-colors']  != null) draw_colors  = !!v['draw-colors'];
    if (v['draw-symbols'] != null) draw_symbols = !!v['draw-symbols'];

    // Wire the new pattern through the existing view; layout()
    // re-creates the sub-views with the fresh pattern reference.
    view.pattern  = pattern;
    view.beadlist = beadlist;
    view.layout();
    beadlist.update();

    if (commandBus) {
        commandBus.undoStack.length = 0;
        commandBus.redoStack.length = 0;
    }
    await clearModified();
    _refreshScrollbar();
    view.draw();
    _updateStatusbar();
    ActionRegistry.notify();
}

async function _printPattern() {
    if (!readonly) {
        saveSettings(data, settings);
        savePatternData(data, pattern);
    }
    const user = document.getElementById("user").value;
    const name = document.getElementById("pattern").value;
    const resp = await fetch(`/${user}/${name}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: data, full_pattern: true }),
    });
    if (!resp.ok) { alert(`Print failed: ${resp.status}`); return; }
    const blob = await resp.blob();
    _downloadBlob(blob, `${name}.pdf`);
}

async function _exportPattern(fmt) {
    if (!readonly) {
        saveSettings(data, settings);
        savePatternData(data, pattern);
    }
    const user = document.getElementById("user").value;
    const name = document.getElementById("pattern").value;
    const resp = await fetch(`/${user}/${name}/export/${fmt}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: data }),
    });
    if (!resp.ok) { alert(`Export failed: ${resp.status}`); return; }
    const blob = await resp.blob();
    const ext = fmt === "jpeg" ? "jpg" : fmt;
    _downloadBlob(blob, `${name}.${ext}`);
}

function _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function _setZoom(dx) {
    dx = Math.max(4, Math.min(48, Math.round(dx)));
    settings.dx = dx;
    settings.dy = dx;
    if (view) {
        view.layout();
        // Visible-rows count may have changed — clamp scroll and
        // refresh the scrollbar's max.
        if (pattern.scroll > _maxScroll()) pattern.scroll = _maxScroll();
        _refreshScrollbar();
        view.draw();
    }
    _updateStatusbar();
}

function setupEditorActions() {
    const i18nEl = document.getElementById("tx-i18n");
    if (i18nEl) {
        try { _i18n = JSON.parse(i18nEl.textContent); }
        catch (e) { console.warn("tx-i18n parse failed", e); }
    }
    const reg = (id, opts) => {
        ActionRegistry.registerAction({
            id,
            label: _actionLabel(id, id),
            ...opts,
        });
    };

    reg("file.save", {
        shortcut: "Ctrl+S",
        enabledWhen: () => !readonly,
        handler: () => {
            saveSettings(data, settings);
            savePatternData(data, pattern);
            savePattern();
        },
    });
    reg("file.revert", {
        enabledWhen: () => !readonly && modified,
        handler: () => _revertChanges(),
    });
    reg("file.print", {
        shortcut: "Ctrl+P",
        handler: () => _printPattern(),
    });
    reg("file.properties", {
        enabledWhen: () => !readonly,
        handler: () => _openPropertiesDialog(),
    });
    reg("file.page-setup", {
        enabledWhen: () => !readonly,
        handler: () => _openPageSetupDialog(),
    });
    reg("file.export-png",  { handler: () => _exportPattern("png")  });
    reg("file.export-jpeg", { handler: () => _exportPattern("jpeg") });
    reg("file.export-svg",  { handler: () => _exportPattern("svg")  });
    reg("file.export-pdf",  { handler: () => _exportPattern("pdf")  });
    reg("file.close", { handler: () => closePattern() });

    reg("view.zoom-in",     { shortcut: "Ctrl+I",
        handler: () => _setZoom(settings.dx + 2) });
    reg("view.zoom-out",    { shortcut: "Ctrl+U",
        handler: () => _setZoom(settings.dx - 2) });
    reg("view.zoom-normal", { handler: () => _setZoom(12) });

    const toggleView = (varName, getter, setter) => () => {
        setter(!getter());
        if (view) { view.layout(); view.draw(); }
        ActionRegistry.notify();
    };
    reg("view.show-draft", {
        checkedWhen: () => show_draft,
        handler: toggleView("draft",
            () => show_draft, v => { show_draft = v; }),
    });
    reg("view.show-corrected", {
        checkedWhen: () => show_corrected,
        handler: toggleView("corrected",
            () => show_corrected, v => { show_corrected = v; }),
    });
    reg("view.show-simulation", {
        checkedWhen: () => show_simulation,
        handler: toggleView("simulation",
            () => show_simulation, v => { show_simulation = v; }),
    });
    reg("view.show-report", {
        checkedWhen: () => show_report,
        handler: toggleView("report",
            () => show_report, v => { show_report = v; }),
    });
    reg("view.draw-colors", {
        checkedWhen: () => draw_colors,
        handler: () => {
            draw_colors = !draw_colors;
            if (view) view.draw();
            ActionRegistry.notify();
        },
    });
    reg("view.draw-symbols", {
        checkedWhen: () => draw_symbols,
        handler: () => {
            draw_symbols = !draw_symbols;
            if (view) view.draw();
            ActionRegistry.notify();
        },
    });

    // ---- Tool selection ----
    const setTool = name => () => {
        current_tool = name;
        if (name !== "select") {
            pattern.selection = null;
            view.draw();
        }
        ActionRegistry.notify();
        _updateStatusbar();
    };
    reg("tool.pencil",  {
        checkedWhen: () => current_tool === "pencil",
        handler: setTool("pencil"),
    });
    reg("tool.select",  {
        checkedWhen: () => current_tool === "select",
        handler: setTool("select"),
    });
    reg("tool.fill",    {
        checkedWhen: () => current_tool === "fill",
        handler: setTool("fill"),
    });
    reg("tool.pipette", {
        checkedWhen: () => current_tool === "pipette",
        handler: setTool("pipette"),
    });
    reg("info.tech",    { handler: () => _openTechInfoDialog() });

    const _okLabel = _actionLabel("btn.ok", "OK");
    reg("legal.terms",   { handler: () => LegalDialog.open("/terms",   _actionLabel("legal.terms",   "Terms"),          _okLabel) });
    reg("legal.privacy", { handler: () => LegalDialog.open("/privacy", _actionLabel("legal.privacy", "Privacy Policy"), _okLabel) });
    reg("legal.imprint", { handler: () => LegalDialog.open("/imprint", _actionLabel("legal.imprint", "Imprint"),        _okLabel) });

    // ---- Edit actions ----
    reg("edit.undo", {
        shortcut: "Ctrl+Z",
        enabledWhen: () => commandBus && commandBus.canUndo(),
        handler: () => {
            if (commandBus.undo()) { setModified(); }
        },
    });
    reg("edit.redo", {
        shortcut: "Ctrl+Y",
        enabledWhen: () => commandBus && commandBus.canRedo(),
        handler: () => {
            if (commandBus.redo()) { setModified(); }
        },
    });
    const hasSelection = () => pattern && pattern.selection != null;
    reg("edit.delete", {
        shortcut: "Delete",
        enabledWhen: hasSelection,
        handler: () => _selectionTransform("delete"),
    });
    reg("edit.mirror-h", {
        shortcut: "H",
        enabledWhen: hasSelection,
        handler: () => _selectionTransform("mirror-h"),
    });
    reg("edit.mirror-v", {
        shortcut: "V",
        enabledWhen: hasSelection,
        handler: () => _selectionTransform("mirror-v"),
    });
    reg("edit.rotate", {
        shortcut: "R",
        enabledWhen: () => {
            if (!hasSelection()) return false;
            const s = pattern.selection;
            return (s.i2 - s.i1) === (s.j2 - s.j1);
        },
        handler: () => _selectionTransform("rotate"),
    });
    reg("edit.shift-left", {
        shortcut: "ArrowLeft",
        handler: () => _shiftPattern(-1),
    });
    reg("edit.shift-right", {
        shortcut: "ArrowRight",
        handler: () => _shiftPattern(1),
    });
    // Selection group move — Shift+Arrow on the keyboard. The same
    // logic also runs from mouse drag (see _onMouseDown for select
    // tool) so tablet users can drag the selection without a keyboard.
    reg("selection.move-left", {
        shortcut: "Shift+ArrowLeft",
        enabledWhen: hasSelection,
        handler: () => _moveSelectionGroup(-1, 0),
    });
    reg("selection.move-right", {
        shortcut: "Shift+ArrowRight",
        enabledWhen: hasSelection,
        handler: () => _moveSelectionGroup(1, 0),
    });
    reg("selection.move-up", {
        shortcut: "Shift+ArrowUp",
        enabledWhen: hasSelection,
        handler: () => _moveSelectionGroup(0, 1),
    });
    reg("selection.move-down", {
        shortcut: "Shift+ArrowDown",
        enabledWhen: hasSelection,
        handler: () => _moveSelectionGroup(0, -1),
    });
    reg("edit.arrange", {
        enabledWhen: hasSelection,
        handler: () => _openArrangeDialog(),
    });
    reg("edit.insert-row", {
        handler: () => _insertRowAt(_activeRow()),
    });
    reg("edit.delete-row", {
        enabledWhen: () => pattern && pattern.height > 1,
        handler: () => _deleteRowAt(_activeRow()),
    });
    reg("pattern.width",  { handler: () => _openSizeDialog("width") });
    reg("pattern.height", { handler: () => _openSizeDialog("height") });
    reg("colors.palette", {
        handler: () => _openPaletteDialog(),
    });

    // Bind shortcuts.
    for (const a of ActionRegistry.all()) Shortcuts.bindAction(a);
    Shortcuts.install();

    // Extra one-off shortcuts: 0-9 select colour, F5 redraw. The
    // generic Shortcuts dispatcher binds one combo per action so we
    // install a small auxiliary listener here for the digit keys.
    window.addEventListener("keydown", (e) => {
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"
                  || t.isContentEditable)) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.key >= "0" && e.key <= "9") {
            const idx = parseInt(e.key, 10);
            if (idx < colors.length) {
                selected_color = idx;
                view.draw();
                e.preventDefault();
            }
        } else if (e.key === "F5") {
            if (view) { view.layout(); view.draw(); }
            e.preventDefault();
        }
    });

    // Render menubar.
    const fileItems = [];
    if (!readonly) fileItems.push({ action: "file.save" });
    if (!readonly) fileItems.push({ action: "file.revert" });
    fileItems.push({ action: "file.print" });
    fileItems.push({ label: _menuLabel("export", "Export"), items: [
        { action: "file.export-png" },
        { action: "file.export-jpeg" },
        { action: "file.export-svg" },
        { action: "file.export-pdf" },
    ]});
    fileItems.push({ separator: true });
    if (!readonly) fileItems.push({ action: "file.properties" });
    if (!readonly) fileItems.push({ action: "file.page-setup" });
    fileItems.push({ action: "file.close" });

    const tree = [
        { label: _menuLabel("file", "File"),  items: fileItems },
        { label: _menuLabel("edit", "Edit"),  items: [
            { action: "edit.undo" },
            { action: "edit.redo" },
            { separator: true },
            { action: "edit.delete" },
            { action: "edit.mirror-h" },
            { action: "edit.mirror-v" },
            { action: "edit.rotate" },
            { action: "edit.arrange" },
            { separator: true },
            { action: "edit.insert-row" },
            { action: "edit.delete-row" },
            { separator: true },
            { action: "edit.shift-left" },
            { action: "edit.shift-right" },
        ], visibleWhen: () => !readonly },
        { label: _menuLabel("pattern", "Pattern"), items: [
            { action: "pattern.width" },
            { action: "pattern.height" },
        ], visibleWhen: () => !readonly },
        { label: _menuLabel("view", "View"),  items: [
            { action: "view.zoom-in" },
            { action: "view.zoom-out" },
            { action: "view.zoom-normal" },
            { separator: true },
            { action: "view.show-draft" },
            { action: "view.show-corrected" },
            { action: "view.show-simulation" },
            { action: "view.show-report" },
            { separator: true },
            { action: "view.draw-colors" },
            { action: "view.draw-symbols" },
        ]},
        { label: _menuLabel("tools", "Tools"), items: [
            { action: "tool.pencil"  },
            { action: "tool.select"  },
            { action: "tool.fill"    },
            { action: "tool.pipette" },
        ]},
        { label: _menuLabel("colors", "Colors"), items: [
            { action: "colors.palette" },
        ], visibleWhen: () => !readonly },
        { label: _menuLabel("info", "Info"),  items: [
            { action: "info.tech" },
        ]},
        { label: _menuLabel("help", "?"), align: "right", items: [
            { action: "legal.terms" },
            { action: "legal.privacy" },
            { action: "legal.imprint" },
        ]},
    ];
    Menu.render(document.getElementById("tx-menubar"), tree);

    // Wire any element with a data-action: toolbar buttons in the
    // top icon strip *and* the side tools panel.
    const TBSEL = "#tx-toolbar .tx-tb-btn, #tools-panel .tx-tool-btn";
    document.querySelectorAll(TBSEL).forEach(btn => {
        const id = btn.dataset.action;
        if (!id) return;
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            if (!ActionRegistry.isEnabled(id)) return;
            ActionRegistry.invoke(id, e);
        });
    });
    const refreshTb = () => {
        document.querySelectorAll(TBSEL).forEach(btn => {
            const id = btn.dataset.action;
            if (!id) return;
            btn.disabled = !ActionRegistry.isEnabled(id);
            // Toolbar uses .checked (highlight); side tools panel
            // uses .active (matches weave editor's CSS).
            const checked = ActionRegistry.isChecked(id);
            btn.classList.toggle("checked", checked);
            btn.classList.toggle("active", checked);
        });
    };
    ActionRegistry.subscribe(refreshTb);
    refreshTb();
}


window.addEventListener("load", () => {
    readonly = document.getElementById("readonly").value === "True";
    getPattern().then(init).then(() => {
        setupEditorActions();
        _updateStatusbar();
        const params = new URLSearchParams(window.location.search);
        if (!readonly && params.get("autosave") === "1") {
            setTimeout(() => {
                try {
                    saveSettings(data, settings);
                    savePatternData(data, pattern);
                    savePattern();
                } catch (e) { console.error(e); }
                params.delete("autosave");
                const url = window.location.pathname
                    + (params.toString() ? "?" + params : "");
                history.replaceState(null, "", url);
            }, 100);
        }
    });
    if (!readonly) {
        installBeforeUnloadGuard(() => {
            saveSettings(data, settings);
            savePatternData(data, pattern);
        });
        const pub = document.getElementById("public");
        if (pub) pub.addEventListener("click", togglePublic);
    } else {
        const clone = document.getElementById("clone");
        if (clone) clone.addEventListener("click", clonePattern);
    }
    document.getElementById("close").addEventListener("click", closePattern);
});

// ---- Thumbnail / preview capture --------------------------------
//
// Mirrors `window.captureThumbnails` in dbweave.js (which common.js
// invokes during save). The bead version paints two halves into an
// offscreen canvas:
//
//   left half:  the rectangular draft view, scaled to fill the half
//               completely (cells stretch slightly when the pattern's
//               aspect doesn't match the half — the call site is a
//               thumbnail, slight distortion is fine).
//   right half: the hexagonally-offset simulation view. The natural
//               width of the simulation is roughly half the draft's,
//               so the right half ends up letterboxed horizontally
//               (empty space on each side) — exactly what the user
//               requested.

function _thumbColor(palette, idx) {
    if (idx < 0 || !palette || idx >= palette.length) return null;
    const c = palette[idx];
    if (!Array.isArray(c) || c.length < 3) return null;
    return `rgb(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0})`;
}

function _renderBeadThumbnail(currentData, w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);

    if (!currentData || !Array.isArray(currentData.model)
        || currentData.model.length === 0) {
        return canvas;
    }
    const rows = currentData.model;
    const ph = rows.length;
    const pw = (rows[0] || []).length;
    if (pw <= 0 || ph <= 0) return canvas;

    // Used-height: prefer the live beadlist (already up to date during
    // save). Fall back to a manual scan for cold callers.
    let usedH = 0;
    if (typeof beadlist !== "undefined" && beadlist
        && Number.isInteger(beadlist.usedHeight)
        && beadlist.usedHeight > 0) {
        usedH = beadlist.usedHeight;
    } else {
        for (let j = 0; j < ph; j++) {
            for (let i = 0; i < pw; i++) {
                if (rows[j][i] > 0) { usedH = j + 1; break; }
            }
        }
    }
    if (usedH < 1) usedH = 1;

    const palette = currentData.colors || [];
    const halfW = Math.floor(w / 2);

    // Square cells (1:1) for both halves — bead patterns are
    // displayed with square beads in the editor, and stretching to
    // non-square here would misrepresent the shape. Pick the largest
    // square cell that fits both axes (`min`); if that's so small
    // that the simulation beads wouldn't read as round, bump up to
    // a minimum and crop the topmost rows that no longer fit.
    // 6 px is roughly the smallest size at which the half-bead
    // ellipses on odd rows still look like beads instead of slivers.
    const MIN_CELL = 6;
    let cell = Math.min(halfW / pw, h / usedH);
    let visRows = usedH;
    if (cell < MIN_CELL) {
        cell = MIN_CELL;
        visRows = Math.max(1, Math.min(usedH, Math.floor(h / cell)));
    }
    const dCellW = cell;
    const dCellH = cell;
    // Letterbox offsets so the patterns sit centred in their half.
    const draftContentW = pw * dCellW;
    const draftContentH = visRows * dCellH;
    const draftX0 = Math.floor((halfW - draftContentW) / 2);
    const draftY1 = Math.floor((h + draftContentH) / 2);  // bottom edge

    // ----- Left half: draft -----
    // Anchor row 0 at the bottom of the content rectangle so the
    // start of beading is visible — same as the editor. If visRows
    // < usedH (very tall pattern, cells clamped to MIN_CELL), the
    // topmost rows are simply not drawn.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, halfW, h);
    ctx.clip();
    for (let j = 0; j < visRows; j++) {
        for (let i = 0; i < pw; i++) {
            const c = rows[j][i] | 0;
            const fill = _thumbColor(palette, c);
            if (!fill) continue;
            const px = Math.floor(draftX0 + i * dCellW);
            const py = Math.floor(draftY1 - (j + 1) * dCellH);
            const cw = Math.max(1, Math.ceil(draftX0 + (i + 1) * dCellW) - px);
            const ch = Math.max(1, Math.ceil(draftY1 - j * dCellH) - py);
            ctx.fillStyle = fill;
            ctx.fillRect(px, py, cw, ch);
        }
    }
    // Light grid on top, only when cells are big enough to be worth it.
    if (dCellW >= 4) {
        ctx.strokeStyle = "#aaa";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const top = draftY1 - draftContentH;
        for (let i = 0; i <= pw; i++) {
            const x = Math.round(draftX0 + i * dCellW) + 0.5;
            ctx.moveTo(x, top + 0.5);
            ctx.lineTo(x, draftY1 - 0.5);
        }
        for (let j = 0; j <= visRows; j++) {
            const y = Math.round(draftY1 - j * dCellH) + 0.5;
            ctx.moveTo(draftX0 + 0.5, y);
            ctx.lineTo(draftX0 + draftContentW - 0.5, y);
        }
        ctx.stroke();
    }
    ctx.restore();

    // ----- Right half: simulation -----
    // True simulation view (not corrected) — only the front half of
    // the bead rope is shown, like ViewSimulated.draw in jbead.js.
    // Beads are laid out in rows of alternating widths W and W+1,
    // and clipped to xi < simWidth on even rows / xi <= simWidth on
    // odd rows. Half-beads appear at the start and end of every odd
    // row so the rope reads as continuous. Beads on odd rows are
    // shifted left by half a cell.
    const W = pw;
    const W2 = pw + 1;
    const simWidth = Math.trunc((pw + 1) / 2);
    const total = visRows * pw;
    const idxToCorrected = (idx) => {
        let k = 0, m = W;
        while (idx >= m) { idx -= m; k++; m = (k % 2 === 0) ? W : W2; }
        return [idx, k];
    };

    // Sim pane: visible rope-front area, sim_width cells wide. Use a
    // soft grey background so the rope reads against it (mirrors the
    // editor's #aaa fill).
    const simPaneW = simWidth * dCellW;
    const simPaneX = Math.floor(halfW + (halfW - simPaneW) / 2);
    // Vertical extent: walk one bead to discover how many corrected
    // rows the visRows data rows produce, then size the bg from there.
    let simRowCount = 0;
    if (total > 0) {
        const [, lastY] = idxToCorrected(total - 1);
        simRowCount = lastY + 1;
    }
    const simPaneH = simRowCount * dCellH;
    const simPaneY = Math.floor(draftY1 - simPaneH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(halfW, 0, w - halfW, h);
    ctx.clip();
    ctx.fillStyle = "#aaa";
    ctx.fillRect(simPaneX, simPaneY, simPaneW, simPaneH);

    for (let idx = 0; idx < total; idx++) {
        const [xi, yj] = idxToCorrected(idx);
        // Front-half visibility (mirrors ViewSimulated.draw).
        if (yj % 2 === 0 && xi >= simWidth) continue;
        if (yj % 2 === 1 && xi >  simWidth) continue;
        const dataI = idx % pw;
        const dataJ = Math.floor(idx / pw);
        const c = rows[dataJ][dataI] | 0;
        const fill = _thumbColor(palette, c);
        if (!fill) continue;

        // Compute the bead's centre and radii. Even rows: beads at
        // (xi + 0.5)·cellW, full size. Odd rows: half-bead at xi=0
        // and xi=simWidth, full beads at integer xi in between, all
        // shifted by -cellW/2 versus the even rows.
        let cx, rx;
        const ry = dCellH / 2;
        const isOdd = (yj % 2) === 1;
        if (!isOdd) {
            cx = simPaneX + (xi + 0.5) * dCellW;
            rx = dCellW / 2;
        } else if (xi === 0) {
            cx = simPaneX + dCellW / 4;
            rx = dCellW / 4;
        } else if (xi === simWidth) {
            cx = simPaneX + simPaneW - dCellW / 4;
            rx = dCellW / 4;
        } else {
            cx = simPaneX + xi * dCellW;
            rx = dCellW / 2;
        }
        const cy = draftY1 - (yj + 0.5) * dCellH;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // 1-px separator between the halves.
    ctx.fillStyle = "#bbb";
    ctx.fillRect(halfW, 0, 1, h);

    return canvas;
}


window.captureThumbnails = function (currentData) {
    // Empty patterns (no painted cells) get explicit nulls so the
    // server clears any prior thumbnail. Mirrors the dbweave editor.
    const model = currentData && currentData.model;
    let hasContent = false;
    if (Array.isArray(model)) {
        outer: for (const row of model) {
            if (!Array.isArray(row)) continue;
            for (const c of row) {
                if (c) { hasContent = true; break outer; }
            }
        }
    }
    if (!hasContent) {
        return { thumbnail: null, preview: null };
    }
    try {
        // Wider than the weave editor's 192×96 / 512×256 — bead
        // patterns need horizontal room because the rendered draft
        // and simulation sit side by side, and the simulation has
        // additional empty space on each side.
        const t = _renderBeadThumbnail(currentData, 256, 128);
        const p = _renderBeadThumbnail(currentData, 640, 320);
        return {
            thumbnail: t.toDataURL("image/png"),
            preview:   p.toDataURL("image/png"),
        };
    } catch (e) {
        console.error("captureThumbnails error", e);
        return null;
    }
};


window.addEventListener("resize", () => {
    resizeWindow();
    if (pattern && pattern.scroll > _maxScroll()) {
        pattern.scroll = _maxScroll();
    }
    _refreshScrollbar();
});

// No autosave — the weave editor doesn't have one either; unsaved
// changes are protected by `installBeforeUnloadGuard` (set up in the
// load handler), which runs the standard "leave site?" prompt and
// fires a best-effort beacon save when the page is closing.

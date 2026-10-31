import {
    correctedCell, correctedHit, draftCell, draftHit, foldIndex,
    simulatedCell, simulatedHit, simulatedWidth,
} from "./geometry.js";
import { contrastingColor, symbolFor } from "./symbols.js";

// The JBead editor's views: ruler, draft, corrected and simulated
// views, palette and bead list, laid out side by side by PatternView.
// Geometry (draw positions and hit tests) is in geometry.js.
//
// Every view gets the editor's `env`: an object with the current
// `pattern`, `settings` (dx, dy, darcula), `colors`, `drawColors`,
// `drawSymbols`, `symbols`, `selectedColor`, `beadlist` and the
// `showDraft` / `showCorrected` / `showSimulation` / `showReport`
// flags. The editor passes getters over its state; tests pass a plain
// object.

export class ViewRuler {
    constructor(env, x, y, width, height) {
        this.env = env;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.offset = 0;
    }

    contains(i, j) {
        return this.x <= i && i < this.x + this.width &&
               this.y <= j && j < this.y + Math.min(this.env.pattern.height, this.height);
    }

    draw(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;

        ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
        ctx.fillStyle = settings.darcula ? "#aaa" : "#222";
        ctx.font = `${settings.dy}px sans-serif`;
        ctx.textAlign = 'end';
        for (let j = 0; j <= Math.min(this.env.pattern.height, this.height); j++) {
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



export class ViewDraft {
    constructor(env, data, x, y, width, height) {
        this.env = env;
        this.data = data;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.offset = 0;
    }

    contains(i, j) {
        return this.x <= i && i < this.x + this.width &&
               this.y <= j && j < this.y + Math.min(this.data.height, this.height);
    }

    // Geometry (draw position and hit test) is in bead/geometry.js.
    pixelToDataCoord(x, y) {
        return draftHit(this, x, y, this.env.settings.dx, this.env.settings.dy);
    }

    pixelToViewCoord(x, y) {
        const [i, j] = draftHit(this, x, y, this.env.settings.dx, this.env.settings.dy);
        return [i, j - this.offset];
    }


    draw(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;
        const drawSymbol = this.env.drawSymbols && dx >= 8;
        if (drawSymbol) {
            ctx.font = `${Math.round(dx * 0.8)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
        }

        const visible = Math.min(this.data.height - this.offset, this.height);
        for (let j = 0; j < visible; j++) {
            const j_data = j + this.offset;
            for (let i = 0; i < this.width; i++) {
                const state = this.data.get(i, j_data);
                const { x, y } = draftCell(this, i, j_data, dx, dy);
                if (this.env.drawColors) {
                    ctx.fillStyle = this.env.colors[state];
                    ctx.fillRect(x, y, dx, dy);
                } else {
                    ctx.fillStyle = settings.darcula ? "#444" : "#fff";
                    ctx.fillRect(x, y, dx, dy);
                }
                ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
                ctx.strokeRect(x, y, dx, dy);
                if (drawSymbol) {
                    const sym = symbolFor(this.env.symbols, state);
                    if (sym) {
                        ctx.fillStyle = this.env.drawColors
                            ? contrastingColor(this.env.colors[state])
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


export class ViewCorrected {
    constructor(env, data, x, y, width, height) {
        this.env = env;
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

    // Geometry (draw position and hit test) is in bead/geometry.js.
    pixelToDataCoord(x, y) {
        return correctedHit(this, x, y, this.data.width,
                            this.env.settings.dx, this.env.settings.dy);
    }

    pixelToViewCoord(x, y) {
        const [i, j] = this.pixelToDataCoord(x, y);
        return [i, j - this.offset];
    }

    draw(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;
        const drawSymbol = this.env.drawSymbols && dx >= 8;
        if (drawSymbol) {
            ctx.font = `${Math.round(dx * 0.8)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
        }

        for (let jj = 0; jj < this.data.height; jj++) {
            for (let ii = 0; ii < this.data.width; ii++) {
                const idx = ii + jj * this.data.width;
                const cell = correctedCell(this, idx, this.data.width, dx, dy);
                if (!cell) {
                    // The row only grows with idx: past the window's
                    // top nothing more is visible; below it, go on.
                    const { row } = foldIndex(idx, this.data.width);
                    if (row >= this.offset + this.height) break;
                    continue;
                }
                const { x, y } = cell;

                const state = this.data.get(ii, jj);

                if (this.env.drawColors) {
                    ctx.fillStyle = this.env.colors[state];
                    ctx.fillRect(x, y, dx, dy);
                } else {
                    ctx.fillStyle = settings.darcula ? "#444" : "#fff";
                    ctx.fillRect(x, y, dx, dy);
                }
                ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
                ctx.strokeRect(x, y, dx, dy);
                if (drawSymbol) {
                    const sym = symbolFor(this.env.symbols, state);
                    if (sym) {
                        ctx.fillStyle = this.env.drawColors
                            ? contrastingColor(this.env.colors[state])
                            : (settings.darcula ? "#eee" : "#222");
                        ctx.fillText(sym, x + dx / 2, y + dy / 2);
                    }
                }
            }
        }
    }
}


export class ViewSimulated {
    constructor(env, data, x, y, width, height) {
        this.env = env;
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

    // Geometry (draw position and hit test) is in bead/geometry.js.
    // Mirrors desktop SimulationPanel::mouseToField + Model::correctedIndex.
    pixelToDataCoord(x, y) {
        return simulatedHit(this, x, y, this.data.width, this.data.height,
                            this.data.shift | 0, this.env.settings.dx, this.env.settings.dy);
    }

    pixelToViewCoord(x, y) {
        const [i, j] = this.pixelToDataCoord(x, y);
        if (i === undefined || j === undefined) return [undefined, undefined];
        return [i, j - this.offset];
    }

    draw(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;

        ctx.fillStyle = settings.darcula ? "#444" : "#aaa";
        ctx.fillRect(
            this.x * dx - dx / 2,
            this.y * dy,
            this.width * dx,
            this.height * dy
        );

        for (let jj = 0; jj < this.data.height; jj++) {
            for (let ii = 0; ii < this.data.width; ii++) {
                // pattern.shift rotates the linear index *before* the
                // spiral fold — mirrors desktop SimulationPanel's
                // `raw.shifted(shift, W)` (shifting the colour lookup
                // instead breaks diagonal patterns: the seam wouldn't
                // move with the colours).
                const idx = ii + jj * this.data.width;
                const shift = this.data.shift | 0;
                const cell = simulatedCell(this, idx, this.data.width, shift,
                                           dx, dy);
                if (!cell) {
                    const { row } = foldIndex(idx + shift, this.data.width);
                    if (row >= this.offset + this.height) break;
                    continue;
                }
                const { x, y } = cell;
                const d = cell.w;

                const state = this.data.get(ii, jj);

                ctx.fillStyle = this.env.drawColors
                    ? this.env.colors[state]
                    : (settings.darcula ? "#444" : "#fff");
                ctx.beginPath();
                ctx.ellipse(x + d / 2, y + dy / 2, d / 2, dy / 2, 0, 0, 2 * Math.PI);
                ctx.fill();
                if (!this.env.drawColors) {
                    ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
                    ctx.stroke();
                }
                if (this.env.drawSymbols && d >= 8) {
                    const sym = symbolFor(this.env.symbols, state);
                    if (sym) {
                        ctx.font = `${Math.round(Math.min(d, dy) * 0.8)}px sans-serif`;
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillStyle = this.env.drawColors
                            ? contrastingColor(this.env.colors[state])
                            : (settings.darcula ? "#eee" : "#222");
                        ctx.fillText(sym, x + d / 2, y + dy / 2);
                    }
                }
            }
        }
    }
}


export class ViewColors {
    constructor(env, palette, x, y, width, height) {
        this.env = env;
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
        const showSymbols = !!this.env.drawSymbols;
        if (showSymbols) {
            ctx.font = `${Math.round(d * 0.7)}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
        }

        let i = 0;
        let j = 0;
        for (let idx = 0; idx < this.palette.length; idx++) {
            const x = 0.5 + this.x + i * d;
            const y = 0.5 + this.y + j * d;
            if (this.env.drawColors) {
                ctx.fillStyle = this.palette[idx];
                ctx.fillRect(x, y, d, d);
            } else {
                ctx.fillStyle = settings.darcula ? "#444" : "#fff";
                ctx.fillRect(x, y, d, d);
            }
            ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
            ctx.strokeRect(x, y, d, d);
            if (showSymbols) {
                const sym = symbolFor(this.env.symbols, idx);
                if (sym) {
                    ctx.fillStyle = this.env.drawColors
                        ? contrastingColor(this.palette[idx])
                        : (settings.darcula ? "#eee" : "#222");
                    ctx.fillText(sym, x + d / 2, y + d / 2);
                }
            }
            j++;
            if (j == 16) {
                j = 0;
                i = 1;
            }
        }

        i = 0;
        j = 0;
        for (let idx = 0; idx < this.palette.length; idx++) {
            if (this.env.selectedColor === idx) {
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



export class ViewBeadList {
    constructor(env, x, y, width, height) {
        this.env = env;
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
	for (let [color, count] of this.env.beadlist.list) {
	    ctx.fillStyle = this.env.drawColors
	        ? this.env.colors[color]
	        : (settings.darcula ? "#444" : "#fff");
	    ctx.beginPath();
            ctx.roundRect(x, y, dx, dy, dx / 3);
            ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
	    ctx.fill();
	    ctx.stroke();
	    ctx.fillStyle = this.env.drawColors
	        ? contrastingColor(this.env.colors[color])
	        : (settings.darcula ? "#eee" : "#222");
	    const sym = this.env.drawSymbols ? symbolFor(this.env.symbols, color) : "";
	    const label = sym ? `${count} ${sym}` : `${count}`;
	    ctx.fillText(label, x + dx / 2, y + dy / 2 + 5);
	    y += dy + b;
	    if (y + dy > this.y + this.height * settings.dy) {
		x += dx + b;
		y = this.y;
	    }
	}
    }
}


export class ViewSettings {
    constructor(dx=12, dy=null) {
        this.dx = dx;
        this.dy = dy || this.dx;
        this.darcula = true;
    }
}


export class PatternView {
    constructor(env, pattern, beadlist, settings, ctx) {
        this.env = env;
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
        const width_draft = this.env.showDraft ? this.pattern.width : 0;
        const gap_draft = this.env.showDraft ? 2 : 0;
        const width_corrected = this.env.showCorrected ? this.pattern.width + 1 : 0;
        const gap_corrected = this.env.showCorrected ? 2 : 0;
        const width_simulated = this.env.showSimulation
            ? simulatedWidth(this.pattern.width) : 0;
        const gap_simulated = this.env.showSimulation ? 1 : 0;

        const x1 = 0;
        const x2 = width_ruler + 1;
        const x3 = x2 + width_draft + gap_draft;
        const x4 = x3 + width_corrected + gap_corrected;
        const x5 = x4 + width_simulated + gap_simulated;

        this.ruler = new ViewRuler(this.env, x1, 0, width_ruler, availy);
        this.draft = this.env.showDraft
            ? new ViewDraft(this.env, this.pattern, x2, 0, width_draft, availy) : null;
        this.corrected = this.env.showCorrected
            ? new ViewCorrected(this.env, this.pattern, x3, 0, width_corrected, availy)
            : null;
        this.simulated = this.env.showSimulation
            ? new ViewSimulated(this.env, this.pattern, x4, 0, width_simulated, availy)
            : null;
        this.colors = new ViewColors(this.env, this.env.colors, x5 * dx, 0, 2 * 25, 16 * 25);
        this.beads = this.env.showReport
            ? new ViewBeadList(this.env, x5 * dx + 2 * 25 + dx, 0, 5 * 25, availy)
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

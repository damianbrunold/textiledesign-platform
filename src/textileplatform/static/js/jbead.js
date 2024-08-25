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


// The colors variable represents the color palette
let colors = [];


let readonly = false;


let selected_color = 1;
let background_color = 0;


class Pattern {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Array(this.width * this.height);
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
               this.y <= j && j < this.y + this.height;
    }

    draw(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;

        ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
        ctx.fillStyle = settings.darcula ? "#aaa" : "#222";
        ctx.font = `${settings.dy}px sans-serif`;
        ctx.textAlign = 'end';
        for (let j = 0; j <= this.height; j++) {
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
               this.y <= j && j < this.y + this.height;
    }

    pixelToDataCoord(x, y) {
        let i = Math.trunc(x / settings.dx);
        let j = this.height - 1 - Math.trunc(y / settings.dy);
        return [i - this.x, j - this.y + this.offset];
    }

    pixelToViewCoord(x, y) {
        let i = Math.trunc(x / settings.dx);
        let j = this.height - 1 - Math.trunc(y / settings.dy);
        return [i - this.x, j - this.y];
    }


    draw(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;

        for (let j = 0; j < this.height; j++) {
            for (let i = 0; i < this.width; i++) {
                const state = this.data.get(i, j);
                const x = 0.5 + (this.x + i) * dx;
                const y = 0.5 + (this.y + this.height - j - 1) * dy;
                ctx.fillStyle = colors[state];
                ctx.fillRect(x, y, dx, dy);
                ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
                ctx.strokeRect(x, y, dx, dy);
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
        let j = this.height - 1 - Math.trunc(y / settings.dy);
        j = j - this.y + this.offset;
        let i;
        if (j % 2 == 0) {
            i = Math.trunc(x / settings.dx) - this.x;
        } else {
            i = Math.trunc((x + settings.dx/2) / settings.dx) - this.x;
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

                if (0 > j || j >= this.height) break;

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
        return this.x <= i && i < this.x + this.width &&
               this.y <= j && j < this.y + this.height;
    }

    pixelToDataCoord(x, y) {
        let i = Math.trunc(x / settings.dx);
        let j = this.height - 1 - Math.trunc(y / settings.dy);
        // TODO use equivalent technique with coord->idx as in corrected view
        // return [i - this.x, j - this.y + this.offset];
        return [undefined, undefined];
    }

    pixelToViewCoord(x, y) {
        const [i, j] = this.pixelToDataCoord(x, y);
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
                let idx = ii + jj * this.data.width;
                let j = 0;
                let w = this.data.width;
                while (idx >= w) {
                    j++;
                    idx -= w;
                    w = j % 2 == 0 ? this.data.width : this.data.width + 1;
                }
                let i = idx;

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



class ViewSettings {
    constructor(dx=12, dy=null) {
        this.dx = dx;
        this.dy = dy || this.dx;
        this.darcula = true;
    }
}


class PatternView {
    constructor(pattern, settings, ctx) {
        this.settings = settings;
        this.pattern = pattern;
        this.ctx = ctx;
        this.layout();
    }

    layout() {
        const dx = this.settings.dx;
        const dy = this.settings.dy;

        const availx = Math.trunc(this.ctx.canvas.width / dx);
        const availy = Math.trunc(this.ctx.canvas.height / dy);

        const width_ruler = 3;
        const width_draft = this.pattern.width;
        const width_corrected = this.pattern.width + 1;
        const width_simulated = Math.trunc((this.pattern.width + 1) / 2);

        const x1 = 0;
        const x2 = width_ruler + 1;
        const x3 = x2 + width_draft + 2;
        const x4 = x3 + width_corrected + 2;
        const x5 = x4 + width_simulated + 2;

        this.ruler = new ViewRuler(x1, 0, width_ruler, availy);
        this.draft = new ViewDraft(this.pattern, x2, 0, width_draft, availy);
        this.corrected = new ViewCorrected(this.pattern, x3, 0, width_corrected, availy);
        this.simulated = new ViewSimulated(this.pattern, x4, 0, width_simulated, availy);
        this.colors = new ViewColors(colors, x5 * dx, 0, 2 * 25, 16 * 25);
        // TODO bead-list
    }

    draw() {
        this.clearCanvas();
        this.draft.draw(this.ctx, this.settings);
        this.corrected.draw(this.ctx, this.settings);
        this.simulated.draw(this.ctx, this.settings);
        this.colors.draw(this.ctx, this.settings);
        this.ruler.draw(this.ctx, this.settings);
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }
}


function init() {
    const darkmode = document.getElementById("darkmode").value === "True";
    pattern = new Pattern(data.model[0].length, data.model.length);
    settings = new ViewSettings();
    settings.darcula = darkmode;

    const container = document.getElementById("container");
    const canvas = document.getElementById('canvas');
    canvas.style.backgroundColor = settings.darcula ? "#444" : "#fff";
    canvas.style.border = "none";
    const ctx = canvas.getContext('2d');
    ctx.canvas.width = container.clientWidth - 2;
    ctx.canvas.height = container.clientHeight - 2;

    view = new PatternView(pattern, settings, ctx);

    initPattern(data, pattern);
    selected_color = data['view']['selected-color']

    view.draw();

    canvas.addEventListener('click', function(event) {
        const x = event.offsetX;
        const y = event.offsetY;
        const i = Math.trunc(x / settings.dx);
        const j = view.draft.height - 1 - Math.trunc(y / settings.dy);
        if (j < 0) return;
        if (view.draft.contains(i, j)) {
            togglePattern(view.draft.pixelToDataCoord(x, y));
            setModified();
        } else if (view.corrected.contains(i, j)) {
            togglePattern(view.corrected.pixelToDataCoord(x, y));
            setModified();
        } else if (view.simulated.contains(i, j)) {
            togglePattern(view.simulated.pixelToDataCoord(x, y));
            setModified();
        } else if (view.colors.contains(x, y)) {
            const ii = Math.trunc((x - view.colors.x) / 25);
            const jj = Math.trunc((y - view.colors.y) / 25);
            const idx = ii * 16 + jj;
            if (idx < colors.length) {
                selected_color = idx;
            }
        }
        view.draw();
    });
}

function togglePattern(coord) {
    const [i, j] = coord;
    if (i === undefined || j === undefined) return;
    const val = pattern.get(i, j);
    if (event.ctrlKey) {
        selected_color = pattern.get(i, j);
    } else if (val !== selected_color) {
        pattern.set(i, j, selected_color);
    } else {
        pattern.set(i, j, background_color);
    }
}

function initPattern(data, pattern) {
    console.log(data);
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
    // TODO
}

function savePatternData(data, pattern) {
    for (let j = 0; j < data.model.length; j++) {
        const row = data.model[j];
        for (let i = 0; i < row.length; i++) {
            row[i] = pattern.get(i, j);
        }
    }
}

window.addEventListener("load", () => {
    readonly = document.getElementById("readonly").value === "True";
    getPattern().then(init);
    if (!readonly) {
        document.getElementById("public").addEventListener("click", togglePublic);
        document.getElementById("save").addEventListener("click", () => {
            saveSettings(data, settings);
            savePatternData(data, pattern);
            savePattern();
        });
    } else {
        const clone = document.getElementById("clone");
        if (clone) clone.addEventListener("click", clonePattern);
    }
    document.getElementById("close").addEventListener("click", closePattern);
});

window.addEventListener("resize", resizeWindow);

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


class ViewDraft {
    constructor(data, x, y, width, height) {
        this.data = data;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.offset = 0;
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

    draw(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;

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

    draw(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;

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
                if (i > this.width) continue;


                const xoff = j % 2 == 0 ? 0 : -dx/2;

                const state = this.data.get(ii, jj);

                let x = 0;
                let d = dx;

                if (i === 0 && j % 2 == 1) {
                    x = 0.5 + xoff + this.x * dx;
                    d = dx / 2;
                } else if (i + 1 >= this.width && j % 2 == 0) {
                    x = 0.5 + xoff + (this.x + i - 1) * dx + dx/2;
                    d = dx / 2;
                } else {
                    x = 0.5 + xoff + (this.x + i - 1) * dx + dx/2;
                }

                const y = 0.5 + (this.y + this.height - j - 1) * dy;


                ctx.fillStyle = colors[state];
                ctx.fillRect(x, y, d, dy);
                ctx.strokeStyle = settings.darcula ? "#aaa" : "#222";
                ctx.strokeRect(x, y, d, dy);
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
        const width_simulated = this.pattern.width / 2;

        const x1 = 0;
        const x2 = width_ruler + 1;
        const x3 = x2 + width_draft + 2;
        const x4 = x3 + width_corrected + 2;
        const x5 = x4 + width_simulated + 2;

        this.draft = new ViewDraft(this.pattern, x2, 0, width_draft, availy);
        this.corrected = new ViewCorrected(this.pattern, x3, 0, width_corrected, availy);
        this.simulated = new ViewSimulated(this.pattern, x4, 0, width_simulated, availy);
        // TODO bead-list
    }

    draw() {
        this.clearCanvas();
        this.draft.draw(this.ctx, this.settings);
        this.corrected.draw(this.ctx, this.settings);
        this.simulated.draw(this.ctx, this.settings);
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }
}


function init() {
    pattern = new Pattern(data.model[0].length, data.model.length);
    settings = new ViewSettings();

    const container = document.getElementById("container");
    const canvas = document.getElementById('canvas');
    canvas.style.backgroundColor = settings.darcula ? "#444" : "#aaa";
    canvas.style.border = "none";
    const ctx = canvas.getContext('2d');
    ctx.canvas.width = container.clientWidth - 2;
    ctx.canvas.height = container.clientHeight - 2;

    view = new PatternView(pattern, settings, ctx);

    initPattern(data, pattern);

    view.draw();

    canvas.addEventListener('click', function(event) {
        const x = event.offsetX;
        const y = event.offsetY;
        const i = Math.trunc(x / settings.dx);
        const j = view.draft.height - 1 - Math.trunc(y / settings.dy);
        if (j < 0) return;
        console.log(i, j);
        // TODO convert coordinates to matching view coordinates
        // TODO toggle pattern point
        view.draw();
    });
}

function initPattern(data, pattern) {
    for (let i = 0; i < data.colors.length; i++) {
        const spec = data.colors[i];
        colors.push(`rgb(${spec[0]}, ${spec[1]}, ${spec[2]})`);
    }
    console.log(colors);
    for (let j = 0; j < pattern.height; j++) {
        const row = data.model[j];
        for (let i = 0; i < row.length; i++) {
            pattern.set(i, j, row[i]);
        }
    }
}

window.addEventListener("load", () => {
    readonly = document.getElementById("readonly").value === "True";
    getPattern().then(init);
    if (!readonly) {
        document.getElementById("public").addEventListener("click", togglePublic);
        document.getElementById("save").addEventListener("click", savePattern);
    } else {
        const clone = document.getElementById("clone");
        if (clone) clone.addEventListener("click", clonePattern);
    }
    document.getElementById("close").addEventListener("click", closePattern);
});

window.addEventListener("resize", resizeWindow);

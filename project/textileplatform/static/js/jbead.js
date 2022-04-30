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
        this.drawGrid(ctx, settings);
        this.drawData(ctx, settings);
    }

    drawGrid(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;

        ctx.beginPath();
        for (let i = 0; i <= this.width; i++) {
            ctx.moveTo(0.5 + (this.x + i) * dx, 0.5);
            ctx.lineTo(0.5 + (this.x + i) * dx, 0.5 + this.height * dy);
        }
        for (let j = 0; j <= this.height; j++) {
            ctx.moveTo(0.5 + this.x * dx, 0.5 + j * dy);
            ctx.lineTo(0.5 + (this.x + this.width) * dx, 0.5 + j * dy);
        }
        ctx.closePath();
        ctx.strokeStyle = settings.darcula ? "#fff" : "#000";
        ctx.lineWidth = 1.0;
        ctx.stroke();
    }

    drawData(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;

        for (let j = 0; j < this.height; j++) {
            for (let i = 0; i < this.width; i++) {
                const state = this.data.get(i, j);
                if (state > 0) {
                    ctx.fillStyle = colors[state];
                    ctx.fillRect(
                        0.5 + (this.x + i) * dx + 0.5,
                        0.5 + (this.y + this.height - j - 1) * dy + 0.5,
                        dx - 1,
                        dy - 1);
                }
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
        // TODO
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
        // TODO
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
        const x3 = x2 + width_draft + 1;
        const x4 = x3 + width_corrected + 1;
        const x5 = x4 + width_simulated + 1;

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
    //settings.darcula = false;

    const container = document.getElementById("container");
    const canvas = document.getElementById('canvas');
    canvas.style.backgroundColor = settings.darcula ? "#000" : "#fff";
    const ctx = canvas.getContext('2d');
    ctx.canvas.width = container.clientWidth - 2;
    ctx.canvas.height = container.clientHeight - 2;

    view = new PatternView(pattern, settings, ctx);

    initPattern(data, pattern);
    
    view.draw();

    canvas.addEventListener('click', function(event) {
        const x = event.offsetX;
        const y = gridh * dy - event.offsetY;
        const i = Math.trunc(x / dx);
        const j = Math.trunc(y / dy);
        toggle_pattern_at(pattern, i, j);
        repaint(ctx, pattern);
    });
}

function draw_grid(ctx) {
    ctx.beginPath();
    for (let i = 0; i <= gridw; i++) {
        ctx.moveTo(offset_x + 0.5 + i * dx, offset_y + 0.5);
        ctx.lineTo(offset_x + 0.5 + i * dx, offset_y + 0.5 + gridh * dy);
    }
    for (let j = 0; j <= gridh; j++) {
        ctx.moveTo(offset_x + 0.5, offset_y + 0.5 + j * dy);
        ctx.lineTo(offset_x + 0.5 + gridw * dx, offset_y + 0.5 + j * dy);
    }
    ctx.closePath();
    ctx.strokeStyle = darcula ? "#fff" : "#000";
    ctx.lineWidth = 1.0;
    ctx.stroke();
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

window.addEventListener("load", () => {
    getPattern().then(init);
    document.getElementById("public").addEventListener("click", togglePublic);
    document.getElementById("save").addEventListener("click", savePattern);
    document.getElementById("close").addEventListener("click", closePattern);
});

window.addEventListener("resize", resizeWindow);

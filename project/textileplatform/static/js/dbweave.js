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
let colors = {};


class Grid {
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

    toggle(i, j) {
        const idx_ = this.idx(i, j);
        const value = this.data[idx_];
        if (value === 0) this.data[idx_] = 1;
        else this.data[idx_] = -value;
    }
}


class Threading {
    constructor(width) {
        this.width = width;
        this.data = new Array(this.width);
    }

    get_heddle(i) {
        return this.data[i];
    }

    set_heddle(i, heddle) {
        this.data[i] = heddle;
    }

    get(i, j) {
        return this.get_heddle(i) == j ? 1 : 0;
    }

    set(i, j, value) {
        if (value) this.set_heddle(i, j);
    }
}


class GridView {
    constructor(data, x, y, width, height) {
        this.data = data;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.offset_i = 0;
        this.offset_j = 0;
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
            ctx.moveTo(0.5 + (this.x + i) * dx, 0.5 + this.y * dy);
            ctx.lineTo(0.5 + (this.x + i) * dx, 0.5 + (this.y + this.height) * dy);
        }
        for (let j = 0; j <= this.height; j++) {
            ctx.moveTo(0.5 + this.x * dx, 0.5 + (this.y + j) * dy);
            ctx.lineTo(0.5 + (this.x + this.width) * dx, 0.5 + (this.y + j) * dy);
        }
        ctx.closePath();
        ctx.strokeStyle = settings.darcula ? "#aaa" : "#000";
        ctx.lineWidth = 1.0;
        ctx.stroke();
    }

    drawData(ctx, settings) {
        for (let i = this.offset_i; i < this.offset_i + this.width; i++) {
            for (let j = this.offset_j; j < this.offset_j + this.height; j++) {
                this.drawCell(ctx, settings, i - this.offset_i, j - this.offset_j, this.data.get(i, j));
            }
        }
    }
    
    drawCell(ctx, settings, i, j, value) {
        if (value > 0) {
            ctx.fillStyle = settings.darcula ? "#fff" : "#000";
            ctx.fillRect(
                0.5 + (this.x + i) * settings.dx + settings.bx,
                0.5 + (this.y + this.height - j - 1) * settings.dy + settings.by,
                settings.dx - 2 * settings.bx,
                settings.dy - 2 * settings.by
            );
        }
    }
}


class Pattern {
    constructor(width, height, max_heddle, max_treadle) {
        this.color_warp = new Grid(width, 1);
        this.color_weft = new Grid(1, height);
        this.blade = new Grid(width, 1);
        this.threading = new Threading(width);
        this.tieup = new Grid(max_treadle, max_heddle);
        this.treadling = new Grid(max_treadle, height);
        this.pattern = new Grid(width, height);
    }
}


class ViewSettings {
    constructor(dx=12, dy=null) {
        this.dx = dx;
        this.dy = dy || this.dx;
        this.darcula = true;
        this.bx = this.dx * 0.15;
        this.by = this.dy * 0.15;
        this.style = "pattern";
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

        // TODO allow parts to hide/show

        const width3 = 1;
        const width2 = 16; // TODO take from saved data
        const width1 = availx - width3 - 1 - width2 - 1 - 1;

        const height4 = 1;
        const height3 = 16; // TODO take from saved data
        const height2 = 1;
        const height1 = availy - height4 - 1 - height3 - 1 - height2 - 1 - 1;

        const y4 = 0;
        const y3 = y4 + height4 + 1;
        const y2 = y3 + height3 + 1;
        const y1 = y2 + height2 + 1;

        const x1 = 0;
        const x2 = x1 + width1 + 1;
        const x3 = x2 + width2 + 1;

        const p = this.pattern;

        this.color_warp = new GridView(p.color_warp, x1, y4, width1, height4);
        this.threading  = new GridView(p.threading,  x1, y3, width1, height3);
        this.tieup      = new GridView(p.tieup,      x2, y3, width2, height3);
        this.blade      = new GridView(p.blade,      x1, y2, width1, height2);
        this.pattern    = new GridView(p.pattern,    x1, y1, width1, height1);
        this.treadling  = new GridView(p.treadling,  x2, y1, width2, height1);
        this.color_weft = new GridView(p.color_weft, x3, y1, width3, height1);

        // TODO scrollbars...
    }

    draw() {
        this.clearCanvas();
        this.color_warp.draw(this.ctx, this.settings);
        this.threading.draw(this.ctx, this.settings);
        this.tieup.draw(this.ctx, this.settings);
        this.blade.draw(this.ctx, this.settings);
        this.treadling.draw(this.ctx, this.settings);
        this.pattern.draw(this.ctx, this.settings);
        this.color_weft.draw(this.ctx, this.settings);
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }
}


function init() {
    const darkmode = document.getElementById("darkmode").value === "True";
    let canvas = document.getElementById('canvas');
    let ctx = canvas.getContext('2d');
    
    pattern = new Pattern(300, 300, 35, 35); // TODO take dimensions from data!
    settings = new ViewSettings();
    settings.darcula = darkmode;

    const container = document.getElementById("container");
    canvas.style.backgroundColor = settings.darcula ? "#444" : "#fff";
    canvas.style.border = "none";
    canvas.width = container.clientWidth - 2;
    canvas.height = container.clientHeight - 2;

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


function initPattern(data, pattern) {
    console.log(data);
    let idx = 0;
    for (const spec of data.palette) {
        colors[idx++] = (`rgb(${spec[0]}, ${spec[1]}, ${spec[2]})`);
    }

    let min_pattern_x = 0;
    let max_pattern_x = 0;
    for (let i = 0; i < data.width; i++) {
        if (data.data_threading[i] !== 0) {
            min_pattern_x = Math.min(min_pattern_x, i);
            max_pattern_x = Math.max(max_pattern_x, i);
        }
    }

    let min_pattern_y = 0;
    let max_pattern_y = 0;
    for (let j = 0; j < data.height; j++) {
        for (let i = 0; i < data.max_treadles; i++) {
            const idx = i + j * data.max_treadles;
            if (data.data_treadling[idx] !== 0) {
                min_pattern_y = Math.min(min_pattern_y, j);
                max_pattern_y = Math.max(max_pattern_y, j);
            }
        }
    }

    for (let i = min_pattern_x; i <= max_pattern_x; i++) {
        const heddle = data.data_threading[i];
        if (heddle === 0) continue;
        for (let j = min_pattern_y; j <= max_pattern_y; j++) {
            for (let k = 0; k < data.max_treadles; k++) {
                const treadle = data.data_treadling[k + j * data.max_treadles];
                if (treadle === 0) continue;
                const tieup = data.data_tieup[k + (heddle - 1) * data.max_treadles];
                if (tieup !== 0) {
                    pattern.pattern.set(i, j, tieup);
                    break;
                }
            }
        }
    }

    let max_heddle = 0;
    for (let i = min_pattern_x; i <= max_pattern_x; i++) {
        const heddle = data.data_threading[i];
        if (heddle == 0) continue;
        max_heddle = Math.max(max_heddle, heddle - 1);
        pattern.threading.set_heddle(i, heddle);
    }

    let max_treadle = 0;
    for (let j = min_pattern_y; j <= max_pattern_y; j++) {
        for (let k = 0; k < data.max_treadles; k++) {
            const treadle = data.data_treadling[k + j * data.max_treadles];
            if (treadle != 0) {
                max_treadle = Math.max(max_treadle, k);
                pattern.treadling.set(k, j, 1);
            }
        }
    }

    for (let i = 0; i <= max_treadle; i++) {
        for (let j = 0; j <= max_heddle; j++) {
            const tieup = data.data_tieup[i + j * data.max_treadles];
            if (tieup !== 0) {
                pattern.tieup.set(i, j, tieup);
            }
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

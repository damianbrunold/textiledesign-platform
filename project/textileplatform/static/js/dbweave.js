"use strict";

window.addEventListener("load", () => {
    getPattern().then(init);
    document.getElementById("public").addEventListener("click", togglePublic);
    document.getElementById("save").addEventListener("click", savePattern);
    document.getElementById("close").addEventListener("click", function() { window.history.back() });
});
window.addEventListener("resize", () => {
    resize_canvas();
    viewobj.layout();
    viewobj.draw();
});

function resize_canvas() {
    canvas = document.getElementById('canvas');
    const container = document.getElementById("container");
    canvas.width = container.clientWidth - 2;
    canvas.height = container.clientHeight - 2;
}

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
        return this.data[idx(i, j)];
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
    constructor(data, view_width, view_height, x=0, y=0, dx=12, dy=null) {
        this.data = data;
        this.width = view_width;
        this.height = view_height;
        this.offsetx = 0;
        this.offsety = 0;
        this.x = x;
        this.y = y;
        this.dx = dx;
        this.dy = dy || dx;
    }

    draw(ctx) {
        this.draw_grid(ctx);
        this.draw_data(ctx);
    }

    draw_grid(ctx) {
        ctx.beginPath();
        for (let i = 0; i <= this.width; i++) {
            ctx.moveTo(this.x + 0.5 + i * this.dx, this.y + 0.5);
            ctx.lineTo(this.x + 0.5 + i * this.dx, this.y + 0.5 + this.height * this.dy);
        }
        for (let j = 0; j <= this.height; j++) {
            ctx.moveTo(this.x + 0.5, this.y + 0.5 + j * this.dy);
            ctx.lineTo(this.x + 0.5 + this.width * this.dx, this.y + 0.5 + j * this.dy);
        }
        ctx.closePath();
        ctx.strokeStyle = darcula ? "#aaa" : "#000";
        ctx.lineWidth = 1.0;
        ctx.stroke();
    }

    draw_data(ctx) {
        // TODO
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

class PatternView {
    constructor(pattern, ctx, dx=12, dy=null) {
        this.pattern = pattern;
        this.ctx = ctx;
        this.dx = dx;
        this.dy = dy || this.dx;
        this.layout();
    }

    layout() {
        let availx = Math.trunc(this.ctx.canvas.width / this.dx);
        let availy = Math.trunc(this.ctx.canvas.height / this.dy);

        // TODO allow parts to hide/show

        let width3 = 1;
        let width2 = 16; // TODO take from saved data
        let width1 = availx - width3 - 1 - width2 - 1 - 1;

        let height4 = 1;
        let height3 = 16; // TODO take from saved data
        let height2 = 1;
        let height1 = availy - height4 - 1 - height3 - 1 - height2 - 1 - 1;

        this.color_warp = new GridView(this.pattern.color_warp, width1, height4, 0, 0);
        this.threading = new GridView(this.pattern.threading, width1, height3, 0, (height4 + 1) * this.dy);
        this.blade = new GridView(this.pattern.blade, width1, height2, 0, (height4 + 1 + height3 + 1) * this.dy);
        this.tieup = new GridView(this.pattern.tieup, width2, height3, (width1 + 1) * this.dx, (height4 + 1) * this.dy);
        this.pattern = new GridView(this.pattern.pattern, width1, height1, 0, (height4 + 1 + height3 + 1 + height2 + 1) * this.dy);
        this.treadling = new GridView(this.pattern.treadling, width2, height1, (width1 + 1) * this.dx, (height4 + 1 + height3 + 1 + height2 + 1) * this.dy);
        this.color_weft = new GridView(this.pattern.color_weft, width3, height1, (width1 + 1 + width2 + 1) * this.dx, (height4 + 1 + height3 + 1 + height2 + 1) * this.dy);

        // TODO colorweft
        // TODO colorwarp
        // TODO blatteinzug
        // TODO scrollbars...
    }

    draw() {
        this.color_warp.draw(this.ctx);
        this.threading.draw(this.ctx);
        this.tieup.draw(this.ctx);
        this.blade.draw(this.ctx);
        this.treadling.draw(this.ctx);
        this.pattern.draw(this.ctx);
        this.color_weft.draw(this.ctx);
    }
}

let dataobj = null;
let viewobj = null;

let view = "pattern";

let colors = {};

let canvas = null;
let ctx = null;
let darcula = true;

let gridw = 60;
let gridh = 35;

const dx = 12;
const dy = 12;

const bx = dx * 0.15;
const by = dy * 0.15;

const offset_x = 0;
const offset_y = 0;

const pattern = new Array(gridw * gridh);

const filled_style = darcula ? "#bbb" : "#000";

for (let i = 0; i < pattern.length; i++) {
    pattern[i] = -1;
}

function init() {
    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');
    
    canvas.style.backgroundColor = darcula ? "#333" : "#aaa";

    const container = document.getElementById("container");

    gridw = Math.trunc((container.clientWidth - 1) / dx);
    gridh = Math.trunc((container.clientHeight - 1) / dy);

    ctx.canvas.width = gridw * dx + 1;
    ctx.canvas.height = gridh * dy + 1;

    dataobj = new Pattern(300, 300, 35, 35);
    viewobj = new PatternView(dataobj, ctx);

    canvas.addEventListener('click', function(event) {
        const x = event.offsetX;
        const y = gridh * dy - event.offsetY;
        const i = Math.trunc(x / dx);
        const j = Math.trunc(y / dy);
        toggle_pattern_at(pattern, i, j);
        repaint(ctx, pattern);
    });

    //init_example_pattern(pattern);
    repaint(ctx, pattern);
}

function get_pattern_at(pattern, i, j) {
    const idx = i + j * gridw;
    return pattern[idx];
}

function set_pattern_at(pattern, i, j, value) {
    const idx = i + j * gridw;
    pattern[idx] = value;
}

function toggle_pattern_at(pattern, i, j) {
    const idx = i + j * gridw;
    pattern[idx] = - pattern[idx];
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
    ctx.strokeStyle = darcula ? "#aaa" : "#000";
    ctx.lineWidth = 1.0;
    ctx.stroke();
}

function draw_cell(ctx, i, j, state) {
    if (view == "color") {
        if (state > 0) {
            ctx.fillStyle = colors[data.colors_warp[i]];
        } else {            
            ctx.fillStyle = colors[data.colors_weft[j]];
        }
        ctx.fillRect(
            offset_x + 0.5 + i * dx,
            offset_y + 0.5 + j * dy,
            dx,
            dy
        );
    } else {
        if (state > 0) {
            ctx.fillStyle = filled_style;
            ctx.fillRect(
                offset_x + 0.5 + i * dx + bx,
                offset_y + 0.5 + j * dy + by,
                dx - 2 * bx,
                dy - 2 * by
            );
        }
    }
}

function draw_pattern(ctx, pattern) {
    for (let i = 0; i < gridw; i++) {
        for (let j = 0; j < gridh; j++) {
            draw_cell(ctx, i, gridh - j - 1, get_pattern_at(pattern, i, j));
        }
    }
}

function clear_canvas(ctx) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

function repaint(ctx, pattern) {
    clear_canvas(ctx);
    //draw_grid(ctx);
    //draw_pattern(ctx, pattern);
    viewobj.draw(ctx);
}

function init_example_pattern(pattern) {
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
                    set_pattern_at(pattern, i, j, 1);
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
        set_pattern_at(pattern, i, (max_pattern_y - min_pattern_y + 1) + 1 + heddle - 1, 1);
    }

    let max_treadle = 0;
    for (let j = min_pattern_y; j <= max_pattern_y; j++) {
        for (let k = 0; k < data.max_treadles; k++) {
            const treadle = data.data_treadling[k + j * data.max_treadles];
            if (treadle != 0) {
                max_treadle = Math.max(max_treadle, k);
                set_pattern_at(pattern, (max_pattern_x - min_pattern_x + 1) + 1 + k, j, 1);
            }
        }
    }

    for (let i = 0; i <= max_treadle; i++) {
        for (let j = 0; j <= max_heddle; j++) {
            const tieup = data.data_tieup[i + j * data.max_treadles];
            if (tieup !== 0) {
                set_pattern_at(pattern,
                    (max_pattern_x - min_pattern_x + 1) + 1 + i,
                    (max_pattern_y - min_pattern_y + 1) + 1 + j,
                    1);
            }
        }
    }
}

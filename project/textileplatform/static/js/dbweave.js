"use strict";

window.addEventListener("load", () => {
    getPattern().then(init);
    document.getElementById("public").addEventListener("click", togglePublic);
    document.getElementById("save").addEventListener("click", savePattern);
    document.getElementById("close").addEventListener("click", function() { window.history.back() });
});


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

    gridw = Math.trunc(container.clientWidth / dx);
    gridh = Math.trunc(container.clientHeight / dy);

    ctx.canvas.width = gridw * dx + 1;
    ctx.canvas.height = gridh * dy + 1;

    canvas.addEventListener('click', function(event) {
        const x = event.offsetX;
        const y = gridh * dy - event.offsetY;
        const i = Math.trunc(x / dx);
        const j = Math.trunc(y / dy);
        toggle_pattern_at(pattern, i, j);
        repaint(ctx, pattern);
    });

    init_example_pattern(pattern);
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
    if (state > 0) {
        ctx.fillStyle = filled_style;
        ctx.fillRect(offset_x + 0.5 + i * dx + bx, offset_y + 0.5 + j * dy + by, dx - 2 * bx, dy - 2 * by);
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
    draw_grid(ctx);
    draw_pattern(ctx, pattern);
}

function init_example_pattern(pattern) {
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

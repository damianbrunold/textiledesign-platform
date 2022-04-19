"use strict";

window.addEventListener("load", () => {
    getPattern().then(init);
    document.getElementById("public").addEventListener("click", togglePublic);
    document.getElementById("save").addEventListener("click", savePattern);
    document.getElementById("close").addEventListener("click", function() { window.history.back() });
});


let colors = [];

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
        ctx.fillStyle = colors[state];
        ctx.fillRect(
            offset_x + 0.5 + i * dx + 1, 
            offset_y + 0.5 + j * dy + 1, 
            dx - 1, 
            dy - 1);
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
    console.log(data);
    for (let i = 0; i < data.colors.length; i++) {
        const spec = data.colors[i];
        colors.push(`rgb(${spec[0]}, ${spec[1]}, ${spec[2]})`);
    }
    for (let j = 0; j < gridh; j++) {
        const row = data.model[j];
        for (let i = 0; i < row.length; i++) {
            set_pattern_at(pattern, i, j, row[i]);
        }
    }
}


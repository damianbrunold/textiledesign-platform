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


// The fixed colors for the various ranges
let rangecolors = {
    "light": [
        "rgb(255, 255, 255)",
        "rgb(0, 0, 0)",
        "rgb(50, 50, 255)",
        "rgb(128, 0, 0)",
        "rgb(0, 140, 255)",
        "rgb(56, 56, 56)",
        "rgb(0, 194, 78)",
        "rgb(255, 123, 0)",
        "rgb(255, 210, 0)",
        "rgb(0, 87, 0)",
        "rgb(255, 255, 255)", // aushebung
        "#fbfb8e",   // anbindung
        "#72b472",   // abbindung
    ],
    "dark": [
        "rgb(30, 30, 30)",      // 0 background
        "rgb(230, 230, 230)",   // 1 foreground
        "rgb(110, 140, 255)",   // 2 blue
        "rgb(230, 100, 100)",   // 3 red
        "rgb(90, 180, 255)",    // 4 light blue
        "rgb(170, 170, 170)",   // 5 gray
        "rgb(80, 210, 120)",    // 6 green
        "rgb(255, 150, 60)",    // 7 orange
        "rgb(255, 220, 80)",    // 8 yellow
        "rgb(90, 190, 90)",     // 9 dark green
        "rgb(160, 160, 160)",   // 10 aushebung
        "rgb(180, 180, 70)",    // 11 anbindung
        "rgb(120, 180, 120)",   // 12 abbindung
    ],
};


let cursor = {
    x1: 0,
    x2: 0,
    y1: 0,
    y2: 0,
    // entering, tieup, treadling, weave, color_warp, color_weft
    selected_part: "weave",
}
let mousedown = false;
let had_selection = false;
let saved_x_weave = 0;
let saved_y_weave = 0;
let saved_x_tieup = 0;
let saved_y_tieup = 0;


let readonly = false;


function goto_next_part() {
    if (cursor.selected_part === "weave") {
        select_part("entering", saved_x_weave, saved_y_tieup);
    } else if (cursor.selected_part === "entering") {
        select_part("treadling", saved_x_tieup, saved_y_weave);
    } else if (cursor.selected_part === "treadling") {
        select_part("tieup", saved_x_tieup, saved_y_tieup);
    } else if (cursor.selected_part === "tieup") {
        select_part("pegplan", saved_x_tieup, saved_y_weave);
    } else if (cursor.selected_part === "pegplan") {
        select_part("color_weft", 0, saved_y_weave);
    } else if (cursor.selected_part === "color_weft") {
        select_part("color_warp", saved_x_weave, 0);
    } else if (cursor.selected_part === "color_warp") {
        select_part("weave", saved_x_weave, saved_y_weave);
    }
    if (cursor.selected_view instanceof GridViewDummy) goto_next_part();
}

function goto_prev_part() {
    if (cursor.selected_part === "weave") {
        select_part("color_warp", saved_x_weave, 0);
    } else if (cursor.selected_part === "entering") {
        select_part("weave", saved_x_weave, saved_y_weave);
    } else if (cursor.selected_part === "treadling") {
        select_part("entering", saved_x_weave, saved_y_tieup);
    } else if (cursor.selected_part === "tieup") {
        select_part("treadling", saved_x_tieup, saved_y_weave);
    } else if (cursor.selected_part === "pegplan") {
        select_part("entering", saved_x_weave, saved_y_tieup);
    } else if (cursor.selected_part === "color_weft") {
        select_part("pegplan", saved_x_tieup, saved_y_weave);
    } else if (cursor.selected_part === "color_warp") {
        select_part("color_weft", 0, saved_y_weave);
    }
    if (cursor.selected_view instanceof GridViewDummy) goto_prev_part();
}

function save_part_position() {
    if (cursor.selected_part === "weave") {
        saved_x_weave = cursor.x2;
        saved_y_weave = cursor.y2;
    } else if (cursor.selected_part === "entering") {
        saved_x_weave = cursor.x2;
        saved_y_tieup = cursor.y2;
    } else if (cursor.selected_part === "treadling") {
        saved_x_tieup = cursor.x2;
        saved_y_weave = cursor.y2;
    } else if (cursor.selected_part === "tieup") {
        saved_x_tieup = cursor.x2;
        saved_y_tieup = cursor.y2;
    } else if (cursor.selected_part === "color_weft") {
        saved_y_weave = cursor.y2;
    } else if (cursor.selected_part === "color_warp") {
        saved_x_weave = cursor.x2;
    }
}

function select_part(part, x1, y1, x2, y2) {
    if (x1 !== undefined) cursor.x1 = x1;
    if (y1 !== undefined) cursor.y1 = y1;
    if (x2 !== undefined) cursor.x2 = x2; else cursor.x2 = x1;
    if (y2 !== undefined) cursor.y2 = y2; else cursor.y2 = y1;
    if (part === "entering") {
        saved_x_weave = cursor.x2;
        saved_y_tieup = cursor.y2;
        cursor.selected_part = "entering";
        cursor.selected_pattern = pattern.entering;
        cursor.selected_view = view.entering;
    } else if (part === "tieup") {
        saved_x_tieup = cursor.x2;
        saved_y_tieup = cursor.y2;
        cursor.selected_part = "tieup";
        cursor.selected_pattern = pattern.tieup;
        cursor.selected_view = view.tieup;
    } else if (part === "treadling") {
        saved_x_tieup = cursor.x2;
        saved_y_weave = cursor.y2;
        cursor.selected_part = "treadling";
        cursor.selected_pattern = pattern.treadling;
        cursor.selected_view = view.treadling;
    } else if (part === "weave") {
        saved_x_weave = cursor.x2;
        saved_y_weave = cursor.y2;
        cursor.selected_part = "weave";
        cursor.selected_pattern = pattern.weave;
        cursor.selected_view = view.weave;
    } else if (part === "color_warp") {
        saved_x_weave = cursor.x2;
        cursor.selected_part = "color_warp";
        cursor.selected_pattern = pattern.color_warp;
        cursor.selected_view = view.color_warp;
    } else if (part === "color_weft") {
        saved_y_weave = cursor.y2;
        cursor.selected_part = "color_weft";
        cursor.selected_pattern = pattern.color_weft;
        cursor.selected_view = view.color_weft;
    } else if (part === "pegplan") {
        saved_x_tieup = cursor.x2;
        saved_y_weave = cursor.y2;
        cursor.selected_part = "pegplan";
        cursor.selected_pattern = pattern.pegplan;
        cursor.selected_view = view.pegplan;
    } else {
        console.log("ERR: cannot select part", part);
    }
}


function get_x_calculator(view, settings, righttoleft) {
    if (righttoleft) {
        return function(i) {
            return 0.5 + (view.x + view.width - i) * settings.dx;
        }
    } else {
        return function(i) {
            return 0.5 + (view.x + i) * settings.dx;
        }
    }
}


function get_y_calculator(view, settings, toptobottom) {
    if (toptobottom) {
        return function(j) {
            return 0.5 + (view.y + j) * settings.dy;
        }
    } else {
        return function(j) {
            return 0.5 + (view.y + view.height - j) * settings.dy;
        }
    }
}


function fillRect(ctx, x1, y1, x2, y2, b=0.0) {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x1 - x2);
    const h = Math.abs(y1 - y2);
    ctx.fillRect(x+b, y+b, w-2*b, h-2*b);
}


function strokeRect(ctx, x1, y1, x2, y2, b=0.0) {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x1 - x2);
    const h = Math.abs(y1 - y2);
    ctx.strokeRect(x+b, y+b, w-2*b, h-2*b);
}


function getRangeColor(settings, value) {
    // Mismatch override (used by the entering view when the user-defined
    // / fixiert threading template doesn't match the actual entering;
    // see GridView.drawData). One-shot — caller is responsible for
    // setting and clearing _fixForceRed around individual painter calls.
    if (settings && settings._fixForceRed) return "#e02020";
    if (settings.darcula) {
        return rangecolors["dark"][value];
    } else {
        return rangecolors["light"][value];
    }
}


function aushebungPainter(ctx, settings, view, i, j) {
    ctx.beginPath();
    ctx.moveTo(
        view.calc_x(i + settings.bxf),
        view.calc_y(j + settings.byf)
    )
    ctx.lineTo(
        view.calc_x(i + 1 - settings.bxf),
        view.calc_y(j + 1 - settings.byf)
    )
    ctx.closePath();
    ctx.strokeStyle = getRangeColor(settings, 1);
    ctx.lineWidth = 2;
    ctx.stroke();
}


function anbindungPainter(ctx, settings, view, i, j, withBackground) {
    if (withBackground) {
        ctx.fillStyle = getRangeColor(settings, 11);
        fillRect(
            ctx,
            view.calc_x(i + settings.bxf / 2),
            view.calc_y(j + settings.byf / 2),
            view.calc_x(i + 1 - settings.bxf / 2),
            view.calc_y(j + 1 - settings.byf / 2)
        );
    }
    ctx.beginPath();
    ctx.moveTo(
        view.calc_x(i + settings.bxf * 2),
        view.calc_y(j + settings.byf * 2)
    )
    ctx.lineTo(
        view.calc_x(i + 1 - settings.bxf * 2),
        view.calc_y(j + 1 - settings.byf * 2)
    )
    ctx.moveTo(
        view.calc_x(i + settings.bxf * 2),
        view.calc_y(j + 1 - settings.byf * 2)
    )
    ctx.lineTo(
        view.calc_x(i + 1 - settings.bxf * 2),
        view.calc_y(j + settings.byf * 2)
    )
    ctx.closePath();
    ctx.strokeStyle = getRangeColor(settings, 1);
    ctx.lineWidth = 2;
    ctx.stroke();
}

function abbindungPainter(ctx, settings, view, i, j, withBackground) {
    if (withBackground) {
        ctx.fillStyle = getRangeColor(settings, 12);
        fillRect(
            ctx,
            view.calc_x(i + settings.bxf / 2),
            view.calc_y(j + settings.byf / 2),
            view.calc_x(i + 1 - settings.bxf / 2),
            view.calc_y(j + 1 - settings.byf / 2)
        );
    }
    ctx.beginPath();
    ctx.ellipse(
        view.calc_x(i + 0.5),
        view.calc_y(j + 0.5),
        (settings.dx - 2 * settings.bx) / 3,
        (settings.dy - 2 * settings.by) / 3,
        0,
        0,
        2*Math.PI
    );
    ctx.closePath();
    ctx.fillStyle = getRangeColor(settings, 1);
    ctx.strokeStyle = getRangeColor(settings, 1);
    ctx.lineWidth = 1;
    ctx.stroke();
}

function cellPainterFilled(ctx, settings, view, i, j, value) {
    if (value > 0) {
        ctx.fillStyle = getRangeColor(settings, value);
        fillRect(
            ctx,
            view.calc_x(i + settings.bxf),
            view.calc_y(j + settings.byf),
            view.calc_x(i + 1 - settings.bxf),
            view.calc_y(j + 1 - settings.byf)
        );
    }
}


function cellPainterDot(ctx, settings, view, i, j, value) {
    if (value > 0) {
        ctx.beginPath();
        ctx.fillStyle = getRangeColor(settings, value);
        ctx.ellipse(
            view.calc_x(i + 0.5),
            view.calc_y(j + 0.5),
            (settings.dx - 2 * settings.bx) / 4,
            (settings.dy - 2 * settings.by) / 4,
            0,
            0,
            2*Math.PI
        );
        ctx.fill();
    }
}


function cellPainterCross(ctx, settings, view, i, j, value) {
    if (value > 0) {
        ctx.beginPath();
        ctx.moveTo(
            view.calc_x(i + settings.bxf),
            view.calc_y(j + settings.byf)
        )
        ctx.lineTo(
            view.calc_x(i + 1 - settings.bxf),
            view.calc_y(j + 1 - settings.byf)
        )
        ctx.moveTo(
            view.calc_x(i + settings.bxf),
            view.calc_y(j + 1 - settings.byf)
        )
        ctx.lineTo(
            view.calc_x(i + 1 - settings.bxf),
            view.calc_y(j + settings.byf)
        )
        ctx.closePath();
        ctx.strokeStyle = getRangeColor(settings, value);
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}


function cellPainterCircle(ctx, settings, view, i, j, value) {
    if (value > 0) {
        ctx.beginPath();
        ctx.ellipse(
            view.calc_x(i + 0.5),
            view.calc_y(j + 0.5),
            (settings.dx - 2 * settings.bx) / 2.5,
            (settings.dy - 2 * settings.by) / 2.5,
            0, 0, 2 * Math.PI
        );
        ctx.strokeStyle = getRangeColor(settings, value);
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}


function cellPainterRising(ctx, settings, view, i, j, value) {
    if (value > 0) {
        ctx.beginPath();
        ctx.moveTo(
            view.calc_x(i + settings.bxf),
            view.calc_y(j + 1 - settings.byf)
        );
        ctx.lineTo(
            view.calc_x(i + 1 - settings.bxf),
            view.calc_y(j + settings.byf)
        );
        ctx.strokeStyle = getRangeColor(settings, value);
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}


function cellPainterFalling(ctx, settings, view, i, j, value) {
    if (value > 0) {
        ctx.beginPath();
        ctx.moveTo(
            view.calc_x(i + settings.bxf),
            view.calc_y(j + settings.byf)
        );
        ctx.lineTo(
            view.calc_x(i + 1 - settings.bxf),
            view.calc_y(j + 1 - settings.byf)
        );
        ctx.strokeStyle = getRangeColor(settings, value);
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}


function cellPainterHDash(ctx, settings, view, i, j, value) {
    if (value > 0) {
        ctx.beginPath();
        ctx.moveTo(
            view.calc_x(i + settings.bxf),
            view.calc_y(j + 0.5)
        )
        ctx.lineTo(
            view.calc_x(i + 1 - settings.bxf),
            view.calc_y(j + 0.5)
        )
        ctx.closePath();
        ctx.strokeStyle = getRangeColor(settings, value);
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }
}


function cellPainterVDash(ctx, settings, view, i, j, value) {
    if (value > 0) {
        ctx.beginPath();
        ctx.moveTo(
            view.calc_x(i + 0.5),
            view.calc_y(j + settings.byf)
        )
        ctx.lineTo(
            view.calc_x(i + 0.5),
            view.calc_y(j + 1 - settings.byf)
        )
        ctx.closePath();
        ctx.strokeStyle = getRangeColor(settings, value);
        ctx.lineWidth = 2.5;
        ctx.stroke();
    }
}


function cellPainterPlus(ctx, settings, view, i, j, value) {
    if (value > 0) {
        ctx.beginPath();
        ctx.moveTo(view.calc_x(i + settings.bxf), view.calc_y(j + 0.5));
        ctx.lineTo(view.calc_x(i + 1 - settings.bxf), view.calc_y(j + 0.5));
        ctx.moveTo(view.calc_x(i + 0.5), view.calc_y(j + settings.byf));
        ctx.lineTo(view.calc_x(i + 0.5), view.calc_y(j + 1 - settings.byf));
        ctx.strokeStyle = getRangeColor(settings, value);
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}


function cellPainterSmallcircle(ctx, settings, view, i, j, value) {
    if (value > 0) {
        ctx.beginPath();
        ctx.ellipse(
            view.calc_x(i + 0.5),
            view.calc_y(j + 0.5),
            (settings.dx - 2 * settings.bx) / 5,
            (settings.dy - 2 * settings.by) / 5,
            0, 0, 2 * Math.PI
        );
        ctx.strokeStyle = getRangeColor(settings, value);
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
}


function cellPainterSmallcross(ctx, settings, view, i, j, value) {
    if (value > 0) {
        const cx = view.calc_x(i + 0.5);
        const cy = view.calc_y(j + 0.5);
        const r = Math.min(
            (settings.dx - 2 * settings.bx) / 5,
            (settings.dy - 2 * settings.by) / 5
        );
        ctx.beginPath();
        ctx.moveTo(cx - r, cy - r);
        ctx.lineTo(cx + r, cy + r);
        ctx.moveTo(cx - r, cy + r);
        ctx.lineTo(cx + r, cy - r);
        ctx.strokeStyle = getRangeColor(settings, value);
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
}


function cellPainterNumber(ctx, settings, view, i, j, value) {
    if (value > 0) {
        const fontSize = Math.max(
            8,
            Math.min(settings.dx, settings.dy) - 2 * Math.max(settings.bx, settings.by) - 2
        );
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = getRangeColor(settings, value);
        ctx.fillText(
            String(value),
            view.calc_x(i + 0.5),
            view.calc_y(j + 0.5)
        );
    }
}


const cellPainters = {
    'filled':      cellPainterFilled,
    'dot':         cellPainterDot,
    'cross':       cellPainterCross,
    'circle':      cellPainterCircle,
    'rising':      cellPainterRising,
    'falling':     cellPainterFalling,
    'dash':        cellPainterVDash,
    'hdash':       cellPainterHDash,
    'vdash':       cellPainterVDash,
    'plus':        cellPainterPlus,
    'smallcircle': cellPainterSmallcircle,
    'smallcross':  cellPainterSmallcross,
    'number':      cellPainterNumber
}


class Grid {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Array(this.width * this.height);
        this.data.fill(0);
    }

    clear() {
        this.data.fill(0);
    }

    clearRow(j) {
        for (let i = 0; i < this.width; i++) {
            this.set(i, j, 0);
        }
    }

    clearCol(i) {
        for (let j = 0; j < this.height; j++) {
            this.set(i, j, 0);
        }
    }

    clearRange(i1, j1, i2, j2) {
        for (let i = i1; i <= i2; i++) {
            for (let j = j1; j <= j2; j++) {
                this.set(i, j, 0);
            }
        }
    }

    invertRange(i1, j1, i2, j2) {
        for (let i = i1; i <= i2; i++) {
            for (let j = j1; j <= j2; j++) {
                const val = this.get(i, j);
                if (val === 0) this.set(i, j, settings.current_range);
                else this.set(i, j, -val);
            }
        }
    }

    mirrorV(i1, j1, i2, j2) {
        if (i1 === i2) return;
        for (let j = j1; j <= j1 + Math.trunc((j2-j1) / 2); j++) {
            for (let i = i1; i <= i2; i++) {
                const v = this.get(i, j);
                this.set(i, j, this.get(i, j2 - (j-j1)));
                this.set(i, j2 - (j-j1), v);
            }
        }
    }

    mirrorH(i1, j1, i2, j2) {
        if (j1 === j2) return;
        for (let i = i1; i <= i1 + Math.trunc((i2-i1)/2); i++) {
            for (let j = j1; j <= j2; j++) {
                const v = this.get(i, j);
                this.set(i, j, this.get(i2 - (i-i1), j));
                this.set(i2 - (i-i1), j, v);
            }
        }
    }

    rotateRight(i1, j1, i2, j2) {
        if ((i2-i1) != (j2-j1)) return;
        const w = i2 - i1 + 1;
        const size = w * w;
        const data = [];
        data[w - 1] = 0;
        data.fill(0);
        const bidx = function(i, j) { return i + j * w; }
        const bget = function(i, j) { return data[bidx(i, j)]; }
        const bset = function(i, j, value) { data[bidx(i, j)] = value; }
        // copy to buffer
        for (let i = i1; i <= i2; i++) {
            for (let j = j1; j <= j2; j++) {
                bset(i - i1, j - j1, this.get(i, j));
            }
        }
        // restore in rotated form
        for (let i = 0; i < w; i++) {
            for (let j = 0; j < w; j++) {
                this.set(i1 + j, j1 + w - 1 - i, bget(i, j));
            }
        }
    }

    rotateLeft(i1, j1, i2, j2) {
        if ((i2-i1) != (j2-j1)) return;
        const w = i2 - i1 + 1;
        const size = w * w;
        const data = [];
        data[w - 1] = 0;
        data.fill(0);
        const bidx = function(i, j) { return i + j * w; }
        const bget = function(i, j) { return data[bidx(i, j)]; }
        const bset = function(i, j, value) { data[bidx(i, j)] = value; }
        // copy to buffer
        for (let i = i1; i <= i2; i++) {
            for (let j = j1; j <= j2; j++) {
                bset(i - i1, j - j1, this.get(i, j));
            }
        }
        // restore in rotated form
        for (let i = 0; i < w; i++) {
            for (let j = 0; j < w; j++) {
                this.set(i1 + w - 1 - j, j1 + i, bget(i, j));
            }
        }
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

    toggle(i, j, default_value=1) {
        const idx = this.idx(i, j);
        const value = this.data[idx];
        if (value === 0) this.data[idx] = default_value;
        else this.data[idx] = -value;
    }

    rowsEqual(j1, j2) {
        for (let i = 0; i < this.width; i++) {
            // we only compare values >= 0
            // everything <= 0 is "empty"
            const v1 = Math.max(0, this.get(i, j1));
            const v2 = Math.max(0, this.get(i, j2));
            if (v1 != v2) return false;
        }
        return true;
    }

    colsEqual(i1, i2) {
        for (let j = 0; j < this.height; j++) {
            // we only compare values >= 0
            // everything <= 0 is "empty"
            const v1 = Math.max(0, this.get(i1, j));
            const v2 = Math.max(0, this.get(i2, j));
            if (v1 != v2) return false;
        }
        return true;
    }

    copyRow(src, dst) {
        for (let i = 0; i < this.width; i++) {
            this.set(i, dst, this.get(i, src));
        }
    }

    copyCol(src, dst) {
        for (let j = 0; j < this.height; j++) {
            this.set(dst, j, this.get(src, j));
        }
    }

    isColEmpty(i) {
        for (let j = 0; j < this.height; j++) {
            if (this.get(i, j) > 0) return false;
        }
        return true;
    }

    isRowEmpty(j) {
        for (let i = 0; i < this.width; i++) {
            if (this.get(i, j) > 0) return false;
        }
        return true;
    }

    // Structural in-place shifts. Grid dimensions stay fixed: when inserting
    // a row/col, the last one is dropped; when removing, the vacated
    // position at the far end becomes empty.
    insertRow(at) {
        for (let j = this.height - 1; j > at; j--) {
            for (let i = 0; i < this.width; i++) this.set(i, j, this.get(i, j - 1));
        }
        for (let i = 0; i < this.width; i++) this.set(i, at, 0);
    }

    removeRow(at) {
        for (let j = at; j < this.height - 1; j++) {
            for (let i = 0; i < this.width; i++) this.set(i, j, this.get(i, j + 1));
        }
        for (let i = 0; i < this.width; i++) this.set(i, this.height - 1, 0);
    }

    insertCol(at) {
        for (let i = this.width - 1; i > at; i--) {
            for (let j = 0; j < this.height; j++) this.set(i, j, this.get(i - 1, j));
        }
        for (let j = 0; j < this.height; j++) this.set(at, j, 0);
    }

    removeCol(at) {
        for (let i = at; i < this.width - 1; i++) {
            for (let j = 0; j < this.height; j++) this.set(i, j, this.get(i + 1, j));
        }
        for (let j = 0; j < this.height; j++) this.set(this.width - 1, j, 0);
    }

    swapRows(a, b) {
        if (a === b) return;
        for (let i = 0; i < this.width; i++) {
            const va = this.get(i, a);
            this.set(i, a, this.get(i, b));
            this.set(i, b, va);
        }
    }

    swapCols(a, b) {
        if (a === b) return;
        for (let j = 0; j < this.height; j++) {
            const va = this.get(a, j);
            this.set(a, j, this.get(b, j));
            this.set(b, j, va);
        }
    }

    // Cyclic roll of a rectangular region. RollUp: each row takes the row
    // below it (row j2 wraps back from row j1). RollLeft/Right analogous.
    rollUp(i1, j1, i2, j2) {
        if (j1 === j2) return;
        const saved = [];
        for (let i = i1; i <= i2; i++) saved.push(this.get(i, j1));
        for (let j = j1; j < j2; j++) {
            for (let i = i1; i <= i2; i++) this.set(i, j, this.get(i, j + 1));
        }
        for (let i = i1; i <= i2; i++) this.set(i, j2, saved[i - i1]);
    }
    rollDown(i1, j1, i2, j2) {
        if (j1 === j2) return;
        const saved = [];
        for (let i = i1; i <= i2; i++) saved.push(this.get(i, j2));
        for (let j = j2; j > j1; j--) {
            for (let i = i1; i <= i2; i++) this.set(i, j, this.get(i, j - 1));
        }
        for (let i = i1; i <= i2; i++) this.set(i, j1, saved[i - i1]);
    }
    rollLeft(i1, j1, i2, j2) {
        if (i1 === i2) return;
        const saved = [];
        for (let j = j1; j <= j2; j++) saved.push(this.get(i1, j));
        for (let i = i1; i < i2; i++) {
            for (let j = j1; j <= j2; j++) this.set(i, j, this.get(i + 1, j));
        }
        for (let j = j1; j <= j2; j++) this.set(i2, j, saved[j - j1]);
    }
    rollRight(i1, j1, i2, j2) {
        if (i1 === i2) return;
        const saved = [];
        for (let j = j1; j <= j2; j++) saved.push(this.get(i2, j));
        for (let i = i2; i > i1; i--) {
            for (let j = j1; j <= j2; j++) this.set(i, j, this.get(i - 1, j));
        }
        for (let j = j1; j <= j2; j++) this.set(i1, j, saved[j - j1]);
    }

    // Slope: each successive row within the selection is cyclically rolled
    // along the i axis by one more cell than the previous row. Increase
    // shifts right; decrease shifts left. Corresponds to the desktop
    // "Slope Increase / Decrease" operations for diagonal-style patterns.
    slopeIncrease(i1, j1, i2, j2) {
        const w = i2 - i1 + 1;
        if (w < 2 || j1 === j2) return;
        // capture a copy of the region, then write shifted rows back.
        const buf = [];
        for (let j = j1; j <= j2; j++) {
            const row = [];
            for (let i = i1; i <= i2; i++) row.push(this.get(i, j));
            buf.push(row);
        }
        for (let j = j1; j <= j2; j++) {
            const row = buf[j - j1];
            const shift = ((j - j1) % w + w) % w;
            for (let i = 0; i < w; i++) {
                this.set(i1 + ((i + shift) % w), j, row[i]);
            }
        }
    }
    slopeDecrease(i1, j1, i2, j2) {
        const w = i2 - i1 + 1;
        if (w < 2 || j1 === j2) return;
        const buf = [];
        for (let j = j1; j <= j2; j++) {
            const row = [];
            for (let i = i1; i <= i2; i++) row.push(this.get(i, j));
            buf.push(row);
        }
        for (let j = j1; j <= j2; j++) {
            const row = buf[j - j1];
            const shift = ((j - j1) % w + w) % w;
            for (let i = 0; i < w; i++) {
                this.set(i1 + ((i - shift + w * w) % w), j, row[i]);
            }
        }
    }

    // Central symmetry: search for a cyclic (i, j) shift of the selection
    // such that the selection becomes point-symmetric — i.e. cell (i, j) in
    // the region equals cell (w-1-i, h-1-j). The desktop algorithm tries
    // every combination of RollLeft × RollUp shifts and applies the first
    // one that produces a symmetric configuration; leaves the grid
    // untouched if no such shift exists.
    //
    // Returns one of:
    //   "noop"    — region was already symmetric; nothing written
    //   "applied" — a symmetric shift was found and written back
    //   "none"    — no symmetric configuration exists; nothing written
    centralSymmetry(i1, j1, i2, j2) {
        const w = i2 - i1 + 1;
        const h = j2 - j1 + 1;
        if (w <= 0 || h <= 0) return "noop";
        const buf = new Array(w * h);
        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                buf[i * h + j] = this.get(i1 + i, j1 + j);
            }
        }
        const bget = (i, j) => buf[i * h + j];
        const bset = (i, j, v) => { buf[i * h + j] = v; };
        const isSym = () => {
            // Match desktop: only i < floor(w/2) pairs checked. For odd w
            // the middle column pairs with itself; the desktop omits a
            // palindrome check on it, so we do too.
            for (let i = 0; i < Math.floor(w / 2); i++) {
                for (let j = 0; j < h; j++) {
                    if (bget(i, j) !== bget(w - 1 - i, h - 1 - j)) return false;
                }
            }
            return true;
        };
        const rollLeft = () => {
            const t = new Array(h);
            for (let j = 0; j < h; j++) t[j] = bget(0, j);
            for (let i = 1; i < w; i++) {
                for (let j = 0; j < h; j++) bset(i - 1, j, bget(i, j));
            }
            for (let j = 0; j < h; j++) bset(w - 1, j, t[j]);
        };
        const rollUp = () => {
            const t = new Array(w);
            for (let i = 0; i < w; i++) t[i] = bget(i, 0);
            for (let j = 1; j < h; j++) {
                for (let i = 0; i < w; i++) bset(i, j - 1, bget(i, j));
            }
            for (let i = 0; i < w; i++) bset(i, h - 1, t[i]);
        };

        if (isSym()) return "noop";
        let found = false;
        outer:
        for (let i = 0; i < w; i++) {
            rollLeft();
            if (isSym()) { found = true; break; }
            for (let j = 0; j < h; j++) {
                rollUp();
                if (isSym()) { found = true; break outer; }
            }
        }
        if (!found) return "none";
        for (let j = 0; j < h; j++) {
            for (let i = 0; i < w; i++) {
                this.set(i1 + i, j1 + j, bget(i, j));
            }
        }
        return "applied";
    }
}


class Entering {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Array(this.width);
        this.data.fill(0);
    }

    clear() {
        this.data.fill(0);
    }

    clearRange(i1, j1, i2, j2) {
        for (let i = i1; i <= i2; i++) {
            const shaft = this.get_shaft(i) - 1;
            if (j1 <= shaft && shaft <= j2) {
                this.set_shaft(i, 0);
            }
        };
    }

    invertRange(i1, j1, i2, j2) {
        // empty
    }

    mirrorV(i1, j1, i2, j2) {
        if (j1 === j2) return;
        for (let i = i1; i <= i1 + Math.trunc((i2-i1)/2); i++) {
            const shaft1 = this.get_shaft(i);
            const shaft2 = this.get_shaft(i2 - (i-i1));
            this.set_shaft(i, shaft2);
            this.set_shaft(i2 - (i-i1), shaft1);
        }
    }

    mirrorH(i1, j1, i2, j2) {
        if (i1 === i2) return;
        for (let i = i1; i <= i2; i++) {
            const shaft = this.get_shaft(i) - 1;
            if (j1 <= shaft && shaft <= j2) {
                const new_shaft = j2 - (shaft - j1);
                this.set_shaft(i, new_shaft + 1);
            }
        }
    }

    rotateRight(i1, j1, i2, j2) {
        // empty
    }

    rotateLeft(i1, j1, i2, j2) {
        // empty
    }

    get_shaft(i) {
        return this.data[i];
    }

    set_shaft(i, shaft) {
        this.data[i] = shaft;
    }

    get(i, j) {
        return this.get_shaft(i) - 1 == j ? 1 : 0;
    }

    set(i, j, value) {
        if (value > 0) this.set_shaft(i, j + 1);
        else this.set_shaft(i, 0);
    }

    toggle(i, j) {
        const shaft = this.get_shaft(i);
        if (shaft !== j + 1) {
            this.set_shaft(i, j + 1);
        }
    }

    // Insert empty slot at index `at`; shift right; last slot dropped.
    insertAt(at) {
        for (let i = this.width - 1; i > at; i--) {
            this.set_shaft(i, this.get_shaft(i - 1));
        }
        this.set_shaft(at, 0);
    }

    removeAt(at) {
        for (let i = at; i < this.width - 1; i++) {
            this.set_shaft(i, this.get_shaft(i + 1));
        }
        this.set_shaft(this.width - 1, 0);
    }
}


class GridViewDummy {
    contains(i, j) {
        return false;
    }

    draw(ctx, settings) {
        // empty
    }

    drawCursor(ctx, settings, cursor) {
        // empty
    }

    registerScrollbars(sb_horz, sb_vert) {
        // empty
    }

    scroll(direction, increment) {
        // empty
    }
}


class GridView {
    constructor(data, x, y, width, height, painter_prop, righttoleft, toptobottom) {
        this.data = data;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.offset_i = 0;
        this.offset_j = 0;
        this.righttoleft = righttoleft;
        this.toptobottom = toptobottom;
        this.painter_prop = painter_prop;
        this.calc_x = get_x_calculator(this, settings, righttoleft);
        this.calc_y = get_y_calculator(this, settings, toptobottom);
        this.sb_horz = null;
        this.sb_vert = null;
    }

    registerScrollbars(sb_horz, sb_vert) {
        if (sb_horz !== null && sb_horz instanceof GridViewDummy) sb_horz = null;
        if (sb_vert !== null && sb_vert instanceof GridViewDummy) sb_vert = null;
        this.sb_horz = sb_horz;
        this.sb_vert = sb_vert;
    }

    scroll(direction, increment) {
        if (direction === "h") {
            if (this.sb_horz === null) return;
            this.sb_horz.views.forEach((v) => {
                v.offset_i += increment;
            });
        } else if (direction === "v") {
            if (this.sb_vert === null) return;
            this.sb_vert.views.forEach((v) => {
                v.offset_j += increment;
            });
        }
    }

    contains(i, j) {
        return this.x <= i && i < this.x + this.width &&
               this.y <= j && j < this.y + this.height;
    }

    draw(ctx, settings) {
        this.drawGrid(ctx, settings);
        this.drawData(ctx, settings);
    }

    drawCursor(ctx, settings, cursor) {
        const dx = settings.dx;
        const dy = settings.dy;
        const width = Math.min(this.width, this.data.width);
        const height = Math.min(this.height, this.data.height);

        let i1 = Math.min(cursor.x1, cursor.x2);
        let i2 = Math.max(cursor.x1, cursor.x2);
        let j1 = Math.min(cursor.y1, cursor.y2);
        let j2 = Math.max(cursor.y1, cursor.y2);

        i1 = Math.min(Math.max(i1, this.offset_i), this.offset_i + this.width);
        i2 = Math.min(Math.max(i2, this.offset_i), this.offset_i + this.width - 1);

        j1 = Math.min(Math.max(j1, this.offset_j), this.offset_j + this.height);
        j2 = Math.min(Math.max(j2, this.offset_j), this.offset_j + this.height - 1);

        const ic = Math.min(Math.max(cursor.x2, this.offset_i), this.offset_i + this.width);
        const jc = Math.min(Math.max(cursor.y2, this.offset_j), this.offset_j + this.height);

        const x1 = this.calc_x(i1 - this.offset_i);
        const x2 = this.calc_x(i2 - this.offset_i + 1);
        const y1 = this.calc_y(j1 - this.offset_j);
        const y2 = this.calc_y(j2 - this.offset_j + 1);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x1, y2);
        ctx.lineTo(x1, y1);
        ctx.closePath();
        ctx.strokeStyle = settings.darcula ? "#f99" : "#500";
        ctx.lineWidth = 3.0;
        ctx.stroke();
    }

    drawGrid(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;
        const width = Math.min(this.width, this.data.width);
        const height = Math.min(this.height, this.data.height);

        ctx.beginPath();
        for (let i = 0; i <= width; i++) {
            const x = this.calc_x(i);
            ctx.moveTo(x, this.calc_y(0));
            ctx.lineTo(x, this.calc_y(height));
        }
        for (let j = 0; j <= height; j++) {
            const y = this.calc_y(j);
            ctx.moveTo(this.calc_x(0), y);
            ctx.lineTo(this.calc_x(width), y);
        }
        ctx.closePath();
        ctx.strokeStyle = settings.darcula ? "#aaa" : "#777";
        ctx.lineWidth = 1.0;
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i <= width; i++) {
            if ((i + this.offset_i) % settings.unit_width == 0) {
                const x = this.calc_x(i);
                ctx.moveTo(x, this.calc_y(0));
                ctx.lineTo(x, this.calc_y(height));
            }
        }
        for (let j = 0; j <= height; j++) {
            if ((j + this.offset_j) % settings.unit_height == 0) {
                const y = this.calc_y(j);
                ctx.moveTo(this.calc_x(0), y);
                ctx.lineTo(this.calc_x(width), y);
            }
        }
        ctx.closePath();
        ctx.strokeStyle = settings.darcula ? "#fff" : "#000";
        ctx.lineWidth = 1.0;
        ctx.stroke();
    }

    drawData(ctx, settings) {
        const painter = cellPainters[settings[this.painter_prop]];
        // Fixiert / user-defined threading: highlight warps whose
        // assigned shaft no longer matches the saved template. fixeinzug
        // is packed (empty warps skipped) and tiled across the array
        // by _updateEinzugFixiert, so the template slot for warp w is
        // fixeinzug[count of non-empty warps strictly before w].
        // Direct port of TDBWFRM::DrawEinzug's red-cell logic.
        let mismatchSet = null;
        if (typeof pattern !== "undefined" && pattern
            && this.data === pattern.entering
            && settings.threading_arrangement === "fixiert"
            && pattern.fixeinzug && pattern.fixeinzug[0] !== 0) {
            mismatchSet = new Set();
            let k = 0;
            for (let w = 0; w < pattern.entering.width; w++) {
                const s = pattern.entering.get_shaft(w);
                if (s === 0) continue;
                if (s !== pattern.fixeinzug[k]) mismatchSet.add(w);
                k++;
            }
        }
        for (let i = this.offset_i; i < this.offset_i + this.width; i++) {
            for (let j = this.offset_j; j < this.offset_j + this.height; j++) {
                const value = this.data.get(i, j);
                const mismatched = mismatchSet && mismatchSet.has(i);
                if (mismatched) settings._fixForceRed = true;
                if (value <= 9) {
                    painter(ctx, settings, this, i - this.offset_i, j - this.offset_j, value);
                } else if (value == 10) {
                    aushebungPainter(ctx, settings, this, i - this.offset_i, j - this.offset_j);
                } else if (value == 11) {
                    anbindungPainter(ctx, settings, this, i - this.offset_i, j - this.offset_j, false);
                } else if (value == 12) {
                    abbindungPainter(ctx, settings, this, i - this.offset_i, j - this.offset_j, false);
                }
                if (mismatched) settings._fixForceRed = false;
            }
        }
    }
}


class GridViewPattern {
    constructor(data, x, y, width, height, dummystyle, righttoleft, toptobottom) {
        this.data = data;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.offset_i = 0;
        this.offset_j = 0;
        this.righttoleft = righttoleft;
        this.toptobottom = toptobottom;
        this.calc_x = get_x_calculator(this, settings, righttoleft);
        this.calc_y = get_y_calculator(this, settings, toptobottom);
        this.sb_horz = null;
        this.sb_vert = null;
    }

    registerScrollbars(sb_horz, sb_vert) {
        if (sb_horz !== null && sb_horz instanceof GridViewDummy) sb_horz = null;
        if (sb_vert !== null && sb_vert instanceof GridViewDummy) sb_vert = null;
        this.sb_horz = sb_horz;
        this.sb_vert = sb_vert;
    }

    scroll(direction, increment) {
        if (direction === "h") {
            if (this.sb_horz === null) return;
            this.sb_horz.views.forEach((v) => {
                v.offset_i += increment;
            });
        } else if (direction === "v") {
            if (this.sb_vert === null) return;
            this.sb_vert.views.forEach((v) => {
                v.offset_j += increment;
            });
        }
    }

    contains(i, j) {
        return this.x <= i && i < this.x + this.width &&
               this.y <= j && j < this.y + this.height;
    }

    draw(ctx, settings) {
        this.drawGrid(ctx, settings);
        if (settings.style === "draft") {
            this.drawDataPattern(ctx, settings);
        } else if (settings.style === "color") {
            this.drawDataColor(ctx, settings);
        } else if (settings.style == "simulation") {
            this.drawDataSimulation(ctx, settings);
        } else if (settings.style === "invisible") {
            // empty!
        }
    }

    drawCursor(ctx, settings, cursor) {
        const dx = settings.dx;
        const dy = settings.dy;
        const width = Math.min(this.width, this.data.width);
        const height = Math.min(this.height, this.data.height);

        let i1 = Math.min(cursor.x1, cursor.x2);
        let i2 = Math.max(cursor.x1, cursor.x2);
        let j1 = Math.min(cursor.y1, cursor.y2);
        let j2 = Math.max(cursor.y1, cursor.y2);

        i1 = Math.min(Math.max(i1, this.offset_i), this.offset_i + this.width);
        i2 = Math.min(Math.max(i2, this.offset_i), this.offset_i + this.width - 1);

        j1 = Math.min(Math.max(j1, this.offset_j), this.offset_j + this.height);
        j2 = Math.min(Math.max(j2, this.offset_j), this.offset_j + this.height - 1);

        const ic = Math.min(Math.max(cursor.x2, this.offset_i), this.offset_i + this.width);
        const jc = Math.min(Math.max(cursor.y2, this.offset_j), this.offset_j + this.height);

        const x1 = this.calc_x(i1 - this.offset_i);
        const x2 = this.calc_x(i2+1 - this.offset_i);
        const y1 = this.calc_y(j1 - this.offset_j);
        const y2 = this.calc_y(j2+1 - this.offset_j);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x1, y2);
        ctx.lineTo(x1, y1);
        ctx.closePath();
        ctx.strokeStyle = settings.darcula ? "#f99" : "#500";
        ctx.lineWidth = 3.0;
        ctx.stroke();
    }

    drawGrid(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;
        const width = Math.min(this.width, this.data.width);
        const height = Math.min(this.height, this.data.height);

        ctx.beginPath();
        for (let i = 0; i <= width; i++) {
            const x = this.calc_x(i);
            ctx.moveTo(x, this.calc_y(0));
            ctx.lineTo(x, this.calc_y(height));
        }
        for (let j = 0; j <= height; j++) {
            const y = this.calc_y(j);
            ctx.moveTo(this.calc_x(0), y);
            ctx.lineTo(this.calc_x(width), y);
        }
        ctx.closePath();
        ctx.strokeStyle = settings.darcula ? "#aaa" : "#777";
        ctx.lineWidth = 1.0;
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i <= width; i++) {
            if ((i + this.offset_i) % settings.unit_width == 0) {
                const x = this.calc_x(i);
                ctx.moveTo(x, this.calc_y(0));
                ctx.lineTo(x, this.calc_y(height));
            }
        }
        for (let j = 0; j <= height; j++) {
            if ((j + this.offset_j) % settings.unit_height == 0) {
                const y = this.calc_y(j);
                ctx.moveTo(this.calc_x(0), y);
                ctx.lineTo(this.calc_x(width), y);
            }
        }
        ctx.closePath();
        ctx.strokeStyle = settings.darcula ? "#fff" : "#000";
        ctx.lineWidth = 1.0;
        ctx.stroke();
    }

    drawDataPattern(ctx, settings) {
        const width = Math.min(this.width, this.data.width);
        const height = Math.min(this.height, this.data.height);

        for (let i = this.offset_i; i < this.offset_i + width; i++) {
            for (let j = this.offset_j; j < this.offset_j + height; j++) {
                let value = this.data.get(i, j);
                if (value > 0) {
                    if (value <= 9) {
                        ctx.fillStyle = getRangeColor(settings, value);
                        fillRect(
                            ctx,
                            this.calc_x(i-this.offset_i + settings.bxf),
                            this.calc_y(j-this.offset_j + settings.byf),
                            this.calc_x(i-this.offset_i + 1 - settings.bxf),
                            this.calc_y(j-this.offset_j + 1 - settings.byf)
                        );
                    } else if (value == 10) {
                        aushebungPainter(ctx, settings, this, i - this.offset_i, j - this.offset_j);
                    } else if (value == 11) {
                        anbindungPainter(ctx, settings, this, i - this.offset_i, j - this.offset_j, true);
                    } else if (value == 12) {
                        abbindungPainter(ctx, settings, this, i - this.offset_i, j - this.offset_j, true);
                    }
                }
            }
        }
    }

    drawDataColor(ctx, settings) {
        const width = Math.min(this.width, this.data.width);
        const height = Math.min(this.height, this.data.height);

        for (let i = this.offset_i; i < this.offset_i + width; i++) {
            if (i < pattern.min_x || pattern.max_x < i) continue;
            for (let j = this.offset_j; j < this.offset_j + height; j++) {
                if (j < pattern.min_y || pattern.max_y < j) continue;
                const value = this.data.get(i, j);
                let color = null;
                if (value > 0) {
                    color = colors[pattern.color_warp.get(i, 0)];
                } else {
                    color = colors[pattern.color_weft.get(j, 0)];
                }
                ctx.fillStyle = color;
                fillRect(
                    ctx,
                    this.calc_x(i-this.offset_i),
                    this.calc_y(j-this.offset_j),
                    this.calc_x(i-this.offset_i + 1),
                    this.calc_y(j-this.offset_j + 1),
                    -0.5
                );
            }
        }
    }

    drawDataSimulation(ctx, settings) {
        const width = Math.min(this.width, this.data.width);
        const height = Math.min(this.height, this.data.height);

        const dx = settings.dx;
        const dy = settings.dy;

        for (let i = this.offset_i; i < this.offset_i + width; i++) {
            if (i < pattern.min_x || pattern.max_x < i) continue;
            for (let j = this.offset_j; j < this.offset_j + height; j++) {
                if (j < pattern.min_y || pattern.max_y < j) continue;

                const value = this.data.get(i, j);

                const color_warp = colors[pattern.color_warp.get(i, 0)];
                const color_weft = colors[pattern.color_weft.get(j, 0)];

                const x0 = this.calc_x(i-this.offset_i);
                const x1 = this.calc_x(i-this.offset_i + 0.2);
                const x2 = this.calc_x(i-this.offset_i + 1 - 0.2);
                const x3 = this.calc_x(i-this.offset_i + 1);

                const y0 = this.calc_y(j-this.offset_j);
                const y1 = this.calc_y(j-this.offset_j + 0.2);
                const y2 = this.calc_y(j-this.offset_j + 1 - 0.2);
                const y3 = this.calc_y(j-this.offset_j + 1);

                ctx.fillStyle = settings.darcula ? "#444" : "#fff";
                fillRect(ctx, x0, y0, x3, y3);
                if (value > 0) {
                    ctx.fillStyle = color_weft;
                    fillRect(ctx, x0, y1, x3, y2, -0.5);

                    ctx.fillStyle = color_warp;
                    fillRect(ctx, x1, y0, x2, y3, -0.5);

                    ctx.beginPath();
                    ctx.strokeStyle = "#999";
                    ctx.moveTo(settings.direction_righttoleft ? x1 : x2, y1);
                    ctx.lineTo(settings.direction_righttoleft ? x1 : x2, y2);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.strokeStyle = "#000";
                    ctx.moveTo(settings.direction_righttoleft ? x2 : x1, y1);
                    ctx.lineTo(settings.direction_righttoleft ? x2 : x1, y2);
                    ctx.stroke();
                } else {
                    ctx.fillStyle = color_warp;
                    fillRect(ctx, x1, y0, x2, y3, -0.5);

                    ctx.fillStyle = color_weft;
                    fillRect(ctx, x0, y1, x3, y2, -0.5);

                    ctx.beginPath();
                    ctx.strokeStyle = "#999";
                    ctx.moveTo(x1, settings.direction_toptobottom ? y1 : y2);
                    ctx.lineTo(x2, settings.direction_toptobottom ? y1 : y2);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.strokeStyle = "#000";
                    ctx.moveTo(x1, settings.direction_toptobottom ? y2 : y1);
                    ctx.lineTo(x2, settings.direction_toptobottom ? y2 : y1);
                    ctx.stroke();
                }
            }
        }
    }
}


class GridViewColors {
    constructor(data, x, y, width, height, dummystyle, righttoleft, toptobottom) {
        this.data = data;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.offset_i = 0;
        this.offset_j = 0;
        this.calc_x = get_x_calculator(this, settings, righttoleft);
        this.calc_y = get_y_calculator(this, settings, toptobottom);
        this.sb_horz = null;
        this.sb_vert = null;
    }

    registerScrollbars(sb_horz, sb_vert) {
        if (sb_horz !== null && sb_horz instanceof GridViewDummy) sb_horz = null;
        if (sb_vert !== null && sb_vert instanceof GridViewDummy) sb_vert = null;
        this.sb_horz = sb_horz;
        this.sb_vert = sb_vert;
    }

    scroll(direction, increment) {
        if (direction === "h") {
            if (this.sb_horz === null) return;
            this.sb_horz.views.forEach((v) => {
                v.offset_i += increment;
            });
        } else if (direction === "v") {
            if (this.sb_vert === null) return;
            this.sb_vert.views.forEach((v) => {
                v.offset_j += increment;
            });
        }
    }

    contains(i, j) {
        return this.x <= i && i < this.x + this.width &&
               this.y <= j && j < this.y + this.height;
    }

    draw(ctx, settings) {
        this.drawGrid(ctx, settings);
        this.drawDataColor(ctx, settings);
    }

    drawCursor(ctx, settings, cursor) {
        const dx = settings.dx;
        const dy = settings.dy;
        const width = Math.min(this.width, this.data.width);
        const height = Math.min(this.height, this.data.height);

        let i1 = Math.min(cursor.x1, cursor.x2);
        let i2 = Math.max(cursor.x1, cursor.x2);
        let j1 = Math.min(cursor.y1, cursor.y2);
        let j2 = Math.max(cursor.y1, cursor.y2);

        i1 = Math.min(Math.max(i1, this.offset_i), this.offset_i + this.width);
        i2 = Math.min(Math.max(i2, this.offset_i), this.offset_i + this.width);

        j1 = Math.min(Math.max(j1, this.offset_j), this.offset_j + this.height);
        j2 = Math.min(Math.max(j2, this.offset_j), this.offset_j + this.height);

        const ic = Math.min(Math.max(cursor.x2, this.offset_i), this.offset_i + this.width);
        const jc = Math.min(Math.max(cursor.y2, this.offset_j), this.offset_j + this.height);

        const x1 = this.calc_x(i1);
        const x2 = this.calc_x(i2+1);
        const y1 = this.calc_y(j1);
        const y2 = this.calc_y(j2+1);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x1, y2);
        ctx.lineTo(x1, y1);
        ctx.closePath();
        ctx.strokeStyle = settings.darcula ? "#f99" : "#500";
        ctx.lineWidth = 3.0;
        ctx.stroke();
    }

    drawGrid(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;
        const width = Math.min(this.width, this.data.width);
        const height = Math.min(this.height, this.data.height);

        ctx.beginPath();
        for (let i = 0; i <= width; i++) {
            const x = this.calc_x(i);
            ctx.moveTo(x, this.calc_y(0));
            ctx.lineTo(x, this.calc_y(height));
        }
        for (let j = 0; j <= height; j++) {
            const y = this.calc_y(j);
            ctx.moveTo(this.calc_x(0), y);
            ctx.lineTo(this.calc_x(width), y);
        }
        ctx.closePath();
        ctx.strokeStyle = settings.darcula ? "#aaa" : "#000";
        ctx.lineWidth = 1.0;
        ctx.stroke();
    }

    drawDataColor(ctx, settings) {
        const width = Math.min(this.width, this.data.width);
        const height = Math.min(this.height, this.data.height);

        for (let i = this.offset_i; i < this.offset_i + width; i++) {
            for (let j = this.offset_j; j < this.offset_j + height; j++) {
                const color = colors[this.data.get(i, j)];
                ctx.fillStyle = color;
                fillRect(
                    ctx,
                    this.calc_x(i-this.offset_i),
                    this.calc_y(j-this.offset_j),
                    this.calc_x(i-this.offset_i + 1),
                    this.calc_y(j-this.offset_j + 1),
                    0.5
                );
            }
        }
    }
}


class GridViewReed {
    constructor(data, x, y, width, dummystyle, righttoleft, toptobottom) {
        this.data = data;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = 1;
        this.offset_i = 0;
        this.offset_j = 0;
        this.calc_x = get_x_calculator(this, settings, righttoleft);
        this.calc_y = get_y_calculator(this, settings, toptobottom);
        this.sb_horz = null;
        this.sb_vert = null;
    }

    registerScrollbars(sb_horz, sb_vert) {
        if (sb_horz !== null && sb_horz instanceof GridViewDummy) sb_horz = null;
        if (sb_vert !== null && sb_vert instanceof GridViewDummy) sb_vert = null;
        this.sb_horz = sb_horz;
        this.sb_vert = sb_vert;
    }

    scroll(direction, increment) {
        if (direction === "h") {
            if (this.sb_horz === null) return;
            this.sb_horz.views.forEach((v) => {
                v.offset_i += increment;
            });
        } else if (direction === "v") {
            if (this.sb_vert === null) return;
            this.sb_vert.views.forEach((v) => {
                v.offset_j += increment;
            });
        }
    }

    contains(i, j) {
        return this.x <= i && i < this.x + this.width && this.y == j;
    }

    draw(ctx, settings) {
        this.drawGrid(ctx, settings);
        this.drawData(ctx, settings);
    }

    drawGrid(ctx, settings) {
        const dx = settings.dx;
        const dy = settings.dy;
        const width = Math.min(this.width, this.data.width);

        ctx.beginPath();
        for (let i = 0; i <= width; i++) {
            const x = this.calc_x(i);
            ctx.moveTo(x, this.calc_y(0));
            ctx.lineTo(x, this.calc_y(0));
        }
        for (let j = 0; j <= 1; j++) {
            const y = this.calc_y(j);
            ctx.moveTo(this.calc_x(0), y);
            ctx.lineTo(this.calc_x(width), y);
        }
        ctx.closePath();
        ctx.strokeStyle = settings.darcula ? "#aaa" : "#000";
        ctx.lineWidth = 1.0;
        ctx.stroke();
    }

    drawData(ctx, settings) {
        const width = Math.min(this.width, this.data.width);

        for (let i = this.offset_i; i < this.offset_i + width; i++) {
            const value = this.data.get(i, 0);
            ctx.fillStyle = settings.darcula ? "#fff" : "#000";
            if (value <= 0) {
                fillRect(
                    ctx,
                    this.calc_x(i-this.offset_i),
                    this.calc_y(0.5),
                    this.calc_x(i-this.offset_i+1),
                    this.calc_y(1)
                );
            } else {
                fillRect(
                    ctx,
                    this.calc_x(i-this.offset_i),
                    this.calc_y(0),
                    this.calc_x(i-this.offset_i+1),
                    this.calc_y(0.5)
                );
            }
        }
    }
}


// Muster — 12×12 small binding pattern used by the block-substitution
// (Blockmuster) and range-substitution (Bereichmuster) editors. Cell
// values are 0 (empty) or 1..9 (which sub-pattern). Verbatim port of
// blockmuster.h / .cpp.
class Muster {
    constructor() {
        this.maxx = 12;
        this.maxy = 12;
        this.feld = new Array(this.maxx * this.maxy).fill(0);
    }
    set(i, j, value) {
        if (i < 0 || j < 0 || i >= this.maxx || j >= this.maxy) return;
        this.feld[i + this.maxx * j] = value;
    }
    get(i, j) {
        if (i < 0 || j < 0 || i >= this.maxx || j >= this.maxy) return 0;
        return this.feld[i + this.maxx * j];
    }
    clear() { this.feld.fill(0); }
    isEmpty() {
        for (let k = 0; k < this.feld.length; k++) if (this.feld[k] !== 0) return false;
        return true;
    }
    sizeX() {
        let nonempty = false;
        let i1 = this.maxx - 1, i2 = 0;
        for (let i = 0; i < this.maxx; i++) {
            for (let j = 0; j < this.maxy; j++) {
                if (this.feld[i + this.maxx * j] !== 0) {
                    if (i1 > i) i1 = i;
                    if (i2 < i) i2 = i;
                    nonempty = true;
                }
            }
        }
        return nonempty ? (i2 - i1 + 1) : 0;
    }
    sizeY() {
        let nonempty = false;
        let j1 = this.maxy - 1, j2 = 0;
        for (let j = 0; j < this.maxy; j++) {
            for (let i = 0; i < this.maxx; i++) {
                if (this.feld[i + this.maxx * j] !== 0) {
                    if (j1 > j) j1 = j;
                    if (j2 < j) j2 = j;
                    nonempty = true;
                }
            }
        }
        return nonempty ? (j2 - j1 + 1) : 0;
    }
    copyFrom(other) {
        for (let k = 0; k < this.feld.length; k++) this.feld[k] = other.feld[k];
    }
    snapshot() { return this.feld.slice(); }
    restore(snap) { for (let k = 0; k < this.feld.length; k++) this.feld[k] = snap[k]; }
}


class Pattern {
    constructor(width, height, max_shaft, max_treadle) {
        this.color_warp = new Grid(width, 1);
        this.empty_warp = new Grid(width, 1);
        this.color_weft = new Grid(1, height);
        this.empty_weft = new Grid(1, height);
        this.reed = new Grid(width, 1);
        this.entering = new Entering(width, max_shaft);
        this.tieup = new Grid(max_treadle, max_shaft);
        this.treadling = new Grid(max_treadle, height);
        // Pegplan: shafts × wefts. Direct shaft-up specification used as an
        // alternative to tie-up + treadling on peg/table looms.
        this.pegplan = new Grid(max_shaft, height);
        this.weave = new Grid(width, height);
        // Auto-computed rapport bounds (inclusive). -1 means "none".
        this.rapport_k_a = 0; this.rapport_k_b = -1;
        this.rapport_s_a = 0; this.rapport_s_b = -1;
        // Block-substitution + range-substitution muster slots (each 12×12).
        this.blockmuster   = []; for (let k = 0; k < 10; k++) this.blockmuster.push(new Muster());
        this.bereichmuster = []; for (let k = 0; k < 10; k++) this.bereichmuster.push(new Muster());
        // Fixed (user-defined) threading template — port of TDBWFRM::fixeinzug.
        // One entry per warp; non-zero entries hold a 1-based shaft number.
        // Used when settings.threading_arrangement === "fixiert".
        this.fixeinzug = new Array(width).fill(0);
        this.fixsize = 0;
        this.firstfree = 0;
        // Palette: array of [r, g, b] triples. Initialized from data.palette
        // in initPatternData; kept in sync with the global `colors` map via
        // _paletteSetEntry / _paletteRefreshColors. 236 slots in the
        // desktop (palette.h MAX_PAL_ENTRY); web sizes follow data.palette.
        this.palette = [];
    }

    recalc_weave() {
        // Dispatch based on the active mode. In pegplan mode the weave is
        // derived from shaft-up data directly (no treadle indirection).
        if (typeof settings !== "undefined" && settings && settings.display_pegplan) {
            this._recalc_weave_from_pegplan();
        } else {
            this._recalc_weave_from_treadling();
        }
        this.calcRapport();
    }

    _recalc_weave_from_treadling() {
        this.weave.data.fill(0);
        this.min_x = this.max_x = 0;
        this.min_y = this.max_y = 0;
        for (let i = 0; i < this.weave.width; i++) {
            const shaft = this.entering.get_shaft(i);
            if (shaft <= 0) continue;
            this.min_x = Math.min(this.min_x, i);
            this.max_x = Math.max(this.max_x, i);
            for (let j = 0; j < this.weave.height; j++) {
                for (let k = 0; k < this.treadling.width; k++) {
                    if (this.treadling.get(k, j) <= 0) continue;
                    this.min_y = Math.min(this.min_y, j);
                    this.max_y = Math.max(this.max_y, j);
                    const value = this.tieup.get(k, shaft - 1);
                    if (value > 0) {
                        this.weave.set(i, j, value);
                    }
                }
            }
        }
    }

    _recalc_weave_from_pegplan() {
        this.weave.data.fill(0);
        this.min_x = this.max_x = 0;
        this.min_y = this.max_y = 0;
        for (let i = 0; i < this.weave.width; i++) {
            const shaft = this.entering.get_shaft(i);
            if (shaft <= 0) continue;
            this.min_x = Math.min(this.min_x, i);
            this.max_x = Math.max(this.max_x, i);
            for (let j = 0; j < this.weave.height; j++) {
                const v = this.pegplan.get(shaft - 1, j);
                if (v > 0) {
                    this.min_y = Math.min(this.min_y, j);
                    this.max_y = Math.max(this.max_y, j);
                    this.weave.set(i, j, v);
                }
            }
        }
    }

    // Reverse-direction: when weave is edited directly in pegplan mode,
    // reconstruct the pegplan grid so the pane reflects the edit.
    _recalc_pegplan_from_weave() {
        this.pegplan.data.fill(0);
        for (let i = 0; i < this.weave.width; i++) {
            const shaft = this.entering.get_shaft(i);
            if (shaft <= 0) continue;
            for (let j = 0; j < this.weave.height; j++) {
                const v = this.weave.get(i, j);
                if (v > 0) this.pegplan.set(shaft - 1, j, v);
            }
        }
    }

    recalc_from_weave(settings) {
        this.recalc_weave_extent();
        let max_shaft;
        const fixiert = settings && settings.threading_arrangement === "fixiert"
                       && this.fixeinzug && this.fixeinzug[0] !== 0;
        if (fixiert) {
            max_shaft = _recalcEinzugFixiert(this);
        } else {
            max_shaft = this.recalc_entering();
        }
        if (settings && settings.display_pegplan) {
            // Pegplan mode: derive pegplan directly from the weave+entering,
            // bypassing treadling/tie-up.
            this._recalc_pegplan_from_weave();
        } else {
            const max_treadle = this.recalc_treadling(settings);
            this.recalc_tieup(max_shaft, max_treadle);
        }
        // Apply the persistent arrangement style — port of desktop
        // RcRecalcAll::Recalc which always calls RearrangeSchaefte +
        // RearrangeTritte at the end (only in non-pegplan mode for
        // treadling). Lets the user pick a "normal rising" / "crossed"
        // / etc. style once and have every subsequent weave-driven
        // recalc keep the threading / treadling tidy.
        if (typeof _applyArrangementHook === "function") {
            _applyArrangementHook(settings);
        }
        this.calcRapport();
    }

    // Automatic rapport (repeat unit) detection within the active pattern
    // extent (min_x..max_x, min_y..max_y). Port of desktop
    // RpRapportImpl::CalcRapport.
    calcRapport() {
        this._calcKetteRapport();
        this._calcSchussRapport();
    }

    _einzugEqual(i1, i2) {
        if (this.entering.get_shaft(i1) !== this.entering.get_shaft(i2)) return false;
        const j1 = this.min_y, j2 = this.max_y;
        for (let j = j1; j <= j2; j++) {
            const s1 = this.weave.get(i1, j);
            const s2 = this.weave.get(i2, j);
            if (s1 <= 0 && s2 > 0) return false;
            if (s1 > 0 && s2 <= 0) return false;
            if (s1 > 0 && s2 > 0 && s1 !== s2) return false;
        }
        return true;
    }

    _trittfolgeEqual(j1, j2) {
        const grid = (typeof settings !== "undefined" && settings && settings.display_pegplan)
            ? this.pegplan : this.treadling;
        for (let i = 0; i < grid.width; i++) {
            const s1 = grid.get(i, j1);
            const s2 = grid.get(i, j2);
            if (s1 <= 0 && s2 > 0) return false;
            if (s1 > 0 && s2 <= 0) return false;
            if (s1 > 0 && s2 > 0 && s1 !== s2) return false;
        }
        const i1 = this.min_x, i2 = this.max_x;
        for (let i = i1; i <= i2; i++) {
            const s1 = this.weave.get(i, j1);
            const s2 = this.weave.get(i, j2);
            if (s1 <= 0 && s2 > 0) return false;
            if (s1 > 0 && s2 <= 0) return false;
            if (s1 > 0 && s2 > 0 && s1 !== s2) return false;
        }
        return true;
    }

    _calcKetteRapport() {
        this.rapport_k_a = 0;
        this.rapport_k_b = -1;
        const i1 = this.min_x, i2 = this.max_x;
        if (i1 > i2) return;
        this.rapport_k_a = i1;
        this.rapport_k_b = i1;
        // Safety cap: pattern width.
        let iter = 0;
        outer: while (iter++ < this.weave.width) {
            // Find next warp that matches the rapport start.
            let i;
            for (i = this.rapport_k_b + 1; i <= i2; i++) {
                if (this._einzugEqual(this.rapport_k_a, i)) break;
            }
            this.rapport_k_b = i - 1;
            // Verify that everything further is a valid cyclic continuation.
            const len = this.rapport_k_b - this.rapport_k_a + 1;
            if (len <= 0) break;
            for (let k = this.rapport_k_b + 1; k <= i2; k++) {
                const expected = this.rapport_k_a + ((k - this.rapport_k_b - 1) % len);
                if (!this._einzugEqual(expected, k)) {
                    this.rapport_k_b++;
                    continue outer;
                }
            }
            break;
        }
    }

    _calcSchussRapport() {
        this.rapport_s_a = 0;
        this.rapport_s_b = -1;
        const j1 = this.min_y, j2 = this.max_y;
        if (j1 > j2) return;
        this.rapport_s_a = j1;
        this.rapport_s_b = j1;
        let iter = 0;
        outer: while (iter++ < this.weave.height) {
            let j;
            for (j = this.rapport_s_b + 1; j <= j2; j++) {
                if (this._trittfolgeEqual(this.rapport_s_a, j)) break;
            }
            this.rapport_s_b = j - 1;
            const len = this.rapport_s_b - this.rapport_s_a + 1;
            if (len <= 0) break;
            for (let k = this.rapport_s_b + 1; k <= j2; k++) {
                const expected = this.rapport_s_a + ((k - this.rapport_s_b - 1) % len);
                if (!this._trittfolgeEqual(expected, k)) {
                    this.rapport_s_b++;
                    continue outer;
                }
            }
            break;
        }
    }

    recalc_weave_extent() {
        this.min_x = this.weave.width;
        this.max_x = 0;
        this.min_y = this.weave.height;
        this.max_y = 0;
        for (let i = 0; i < this.weave.width; i++) {
            if (!this.weave.isColEmpty(i)) {
                this.min_x = Math.min(this.min_x, i);
                this.max_x = Math.max(this.max_x, i);
                this.empty_warp.set(i, 0, 1);
            } else {
                this.empty_warp.set(i, 0, 0);
            }
        }
        for (let j = 0; j < this.weave.height; j++) {
            if (!this.weave.isRowEmpty(j)) {
                this.min_y = Math.min(this.min_y, j);
                this.max_y = Math.max(this.max_y, j);
                this.empty_weft.set(0, j, 1);
            } else {
                this.empty_weft.set(0, j, 0);
            }
        }
    }

    recalc_entering() {
        this.entering.clear();
        let next_shaft = 1;
        for (let i = this.min_x; i <= this.max_x; i++) {
            if (this.empty_warp.get(i, 0) == 0) continue;
            let shaft = null;
            for (let ii = this.min_x; ii < i; ii++) {
                if (this.weave.colsEqual(i, ii)) {
                    shaft = this.entering.get_shaft(ii);
                    break;
                }
            }
            if (shaft === null) {
                shaft = next_shaft++;
            }
            this.entering.set_shaft(i, shaft);
        }
        return next_shaft - 1;
    }

    recalc_treadling(settings) {
        // Desktop's RecalcTrittfolge runs the same algorithm regardless
        // of einzeltritt vs multitritt — the flag only controls how the
        // editor *writes* into the treadling pane (single-treadle
        // clears the row first; multi-treadle leaves existing cells).
        // So we always rebuild the same way here, otherwise switching
        // to multi-treadle leaves recalc_tieup with max_treadle=undefined
        // and the tie-up gets wiped.
        this.treadling.clear();
        let next_treadle = 0;
        for (let j = this.min_y; j <= this.max_y; j++) {
            if (this.empty_weft.get(0, j) == 0) continue;
            let found = false;
            for (let jj = this.min_y; jj < j; jj++) {
                if (this.weave.rowsEqual(j, jj)) {
                    found = true;
                    this.treadling.copyRow(jj, j);
                    break;
                }
            }
            if (!found) {
                this.treadling.set(next_treadle++, j, 1); // TODO use current bereich?
            }
        }
        return next_treadle - 1;
    }

    recalc_tieup(max_shaft, max_treadle) {
        this.tieup.clear();
        for (let i = 0; i <= max_treadle; i++) {
            for (let j = 0; j <= max_shaft - 1; j++) {
                let entering_i = null;
                let treadling_j = null;
                for (let ii = this.min_x; ii <= this.max_x; ii++) {
                    if (this.entering.get_shaft(ii) == j + 1) {
                        entering_i = ii;
                        break;
                    }
                }
                for (let jj = this.min_y; jj <= this.max_y; jj++) {
                    if (this.treadling.get(i, jj) > 0) {
                        treadling_j = jj;
                        break;
                    }
                }
                if (entering_i !== null && treadling_j !== null) {
                    this.tieup.set(i, j, this.weave.get(entering_i, treadling_j));
                }
            }
        }
    }
}


class ViewSettings {
    constructor(dx=12, dy=null) {
        this.dx = dx;
        this.dy = dy || this.dx;
        // base_dx is the equal-axis baseline cell size that zoom mutates;
        // dx/dy are derived from it via _applyAspectRatio() using
        // warp_factor / weft_factor. Mirrors desktop patterncanvas.cpp's
        // ZOOM_TABLE[zi] base + faktor_kette/faktor_schuss stretch.
        this.base_dx = this.dx;
        this.darcula = true;
        this.bxf = 0.15;
        this.byf = 0.15;
        this.bx = this.dx * this.bxf;
        this.by = this.dy * this.byf;
        this.style = "draft";
    }
}

// Stretch dx/dy from settings.base_dx according to the current
// warp_factor / weft_factor. Direct port of patterncanvas.cpp::
// recomputeLayout (lines 150-164): the smaller-factor axis stays at
// base_dx; the larger-factor axis is stretched by the ratio of the
// two factors. Called whenever the factors change AND on zoom.
function _applyAspectRatio(s) {
    if (!s) return;
    const base = Math.max(2, s.base_dx | 0 || s.dx | 0 || 12);
    const wf = +s.warp_factor || 1.0;
    const sf = +s.weft_factor || 1.0;
    let dx = base, dy = base;
    if (wf > 0 && sf > 0) {
        if (sf > wf)      dy = Math.round(base * sf / wf);
        else if (wf > sf) dx = Math.round(base * wf / sf);
    }
    s.dx = dx;
    s.dy = dy;
    s.bx = s.dx * s.bxf;
    s.by = s.dy * s.byf;
}


class ScrollbarHorz {
    constructor(pattern, gv, x, y, width, height, righttoleft) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.pattern = pattern;
        this.gv = gv;
        this.views = [];
        this.righttoleft = righttoleft;
        this.calc_x = get_x_calculator(this, settings, righttoleft);
        this.calc_y = get_y_calculator(this, settings, false);
        this.delta = 5;
    }

    registerView(view) {
        this.views.push(view)
    }

    contains(x, y) {
        let range = [
            Math.min(this.calc_x(0), this.calc_x(this.width)),
            Math.max(this.calc_x(0), this.calc_x(this.width))
        ];
        return range[0] <= x && x <= range[1] &&
               this.y * settings.dy + this.delta <= y && y <= this.y * settings.dy + this.height;
    }

    scrollTo(x) {
        let f = undefined;
        if (this.righttoleft) {
            f = 1.0 - 1.0 * (x - this.x * settings.dx) / (this.width * settings.dx);
        } else {
            f = 1.0 * (x - this.x * settings.dx) / (this.width * settings.dx);
        }
        const centre_i = Math.trunc(this.pattern.width * f);
        let start_i = Math.trunc(centre_i - this.width / 2);
        if (start_i < 0) {
            start_i = 0;
        } else if (start_i + this.width > this.pattern.width) {
            start_i = this.pattern.width - this.width;
        }
        this.views.forEach((view) => {
            view.offset_i = start_i;
        });
        this.gv.draw();
    }

    draw(ctx, settings) {
        const w = this.width * settings.dx - 1;
        const a = Math.min(w / this.pattern.width * this.views[0].offset_i, w);
        const b = Math.min(w / this.pattern.width * (this.views[0].offset_i + this.views[0].width), w);
        ctx.fillStyle = settings.darcula ? "#666" : "#999";
        fillRect(
            ctx,
            this.calc_x(a / settings.dx),
            0.5 + this.y * settings.dy + this.delta,
            this.calc_x(b / settings.dx),
            0.5 + this.y * settings.dy + this.height,
            1.0
        );
        ctx.strokeSyle = settings.darcula ? "#aaa" : "#000";
        ctx.lineWidth = 1;
        strokeRect(
            ctx,
            this.calc_x(0),
            0.5 + this.y * settings.dy + this.delta,
            this.calc_x(this.width),
            0.5 + this.y * settings.dy + this.height
        );
   }
}


class ScrollbarVert {
    constructor(pattern, gv, x, y, width, height, toptobottom) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.pattern = pattern;
        this.gv = gv;
        this.views = [];
        this.toptobottom = toptobottom;
        this.calc_x = get_x_calculator(this, settings, false);
        this.calc_y = get_y_calculator(this, settings, toptobottom);
        this.delta = 5;
    }

    registerView(view) {
        this.views.push(view)
    }

    contains(x, y) {
        let range = [
            Math.min(this.calc_y(0), this.calc_y(this.height)),
            Math.max(this.calc_y(0), this.calc_y(this.height))
        ];
        return range[0] <= y && y <= range[1] &&
               this.x * settings.dx + this.delta <= x && x <= this.x * settings.dx + this.width;
    }

    scrollTo(y) {
        let f = undefined;
        if (this.toptobottom) {
            f = 1.0 * (y - this.y * settings.dy) / (this.height * settings.dy);
        } else {
            f = 1.0 - 1.0 * (y - this.y * settings.dy) / (this.height * settings.dy);
        }
        const centre_j = Math.trunc(this.pattern.height * f);
        let start_j = Math.trunc(centre_j - this.height / 2);
        if (start_j < 0) {
            start_j = 0;
        } else if (start_j + this.height > this.pattern.height) {
            start_j = this.pattern.height - this.height;
        }
        this.views.forEach((view) => {
            view.offset_j = start_j;
        });
        this.gv.draw();
    }

    draw(ctx, settings) {
        const h = this.height * settings.dy - 1;
        const a = Math.min(h / this.pattern.height * this.views[0].offset_j, h);
        const b = Math.min(h / this.pattern.height * (this.views[0].offset_j + this.views[0].height), h);
        ctx.fillStyle = settings.darcula ? "#666" : "#999";
        fillRect(
            ctx,
            0.5 + this.x * settings.dx + this.delta,
            this.calc_y(a / settings.dy),
            0.5 + this.x * settings.dx + this.width,
            this.calc_y(b / settings.dy)
        );
        ctx.strokeSyle = settings.darcula ? "#aaa" : "#000";
        strokeRect(
            ctx,
            0.5 + this.x * settings.dx + this.delta,
            this.calc_y(0),
            0.5 + this.x * settings.dx + this.width,
            this.calc_y(this.height)
        );
    }
}


class PatternView {
    constructor(data, settings, ctx, visible_shafts=16, visible_treadles=16) {
        this.settings = settings;
        this.data = data;
        this.ctx = ctx;
        this.visible_shafts = visible_shafts;
        this.visible_treadles = visible_treadles;
        this.layout();
    }

    withBorder(n) {
        return n == 0 ? n : n + 1;
    }

    layout() {
        const dx = this.settings.dx;
        const dy = this.settings.dy;
        const scroll = 15;

        const availx = Math.trunc((this.ctx.canvas.width - scroll) / dx);
        const availy = Math.trunc((this.ctx.canvas.height - scroll) / dy);

        // In pegplan mode the treadling / tie-up panes are replaced by a
        // single pegplan pane, sized to `visible_shafts` wide (pegplan
        // columns are shafts, not treadles).
        const pegplanMode = !!this.settings.display_pegplan;
        const width3 = this.settings.display_colors_weft ? 1 : 0;
        const sidePaneWidth = pegplanMode ? this.visible_shafts : this.visible_treadles;
        const width2 = (pegplanMode ? true : this.settings.display_treadling)
            ? sidePaneWidth : 0;
        const width1 = availx - this.withBorder(width3) - this.withBorder(width2);

        const height4 = this.settings.display_colors_warp ? 1 : 0;
        const height3 = this.settings.display_entering ? this.visible_shafts : 0;
        const height2 = this.settings.display_reed ? 1 : 0;
        const height1 = availy - this.withBorder(height4) - this.withBorder(height3) - this.withBorder(height2);

        let y4; // warp color bar
        let y3; // entering
        let y2; // reed
        let y1; // weave

        if (this.settings.entering_at_bottom) {
            y1 = 0;
            y2 = y1 + this.withBorder(height1);
            y3 = y2 + this.withBorder(height2);
            y4 = y3 + this.withBorder(height3);
        } else {
            y4 = 0;
            y3 = y4 + this.withBorder(height4);
            y2 = y3 + this.withBorder(height3);
            y1 = y2 + this.withBorder(height2);
        }

        const x1 = 0;
        const x2 = x1 + this.withBorder(width1);
        const x3 = x2 + this.withBorder(width2);

        const p = this.data;
        const s = this.settings;

        this.color_warp = this.make(
            s.display_colors_warp,
            GridViewColors, p.color_warp,
            x1, y4, width1, height4,
            '',
            s.direction_righttoleft, false
        );
        this.entering = this.make(
            s.display_entering,
            GridView, p.entering,
            x1, y3, width1, height3,
            'entering_style',
            s.direction_righttoleft, s.direction_toptobottom
        );
        // Tie-up pane — visible in both modes when entering+side-pane are
        // shown. In pegplan mode it doesn't carry editable data (pegplan
        // supersedes the tie-up); it's rendered as a greyed-out implicit
        // diagonal in PatternView.draw() to mirror the desktop behaviour.
        this.tieup = this.make(
            s.display_entering && (pegplanMode || s.display_treadling),
            GridView, p.tieup,
            x2, y3, width2, height3,
            'tieup_style',
            false, s.direction_toptobottom
        );
        this.reed = this.make(
            s.display_reed,
            GridViewReed, p.reed,
            x1, y2, width1,
            '',
            s.direction_righttoleft, false
        );
        this.weave = this.make(
            true,
            GridViewPattern, p.weave,
            x1, y1, width1, height1,
            '',
            s.direction_righttoleft, false
        );
        // Pegplan pane (shafts × wefts) sits where the treadling pane would.
        // In pegplan mode it's visible and the treadling pane is a dummy.
        this.pegplan = this.make(
            pegplanMode,
            GridView, p.pegplan,
            x2, y1, width2, height1,
            'treadling_style',
            false, false
        );
        this.treadling = this.make(
            !pegplanMode && s.display_treadling,
            GridView, p.treadling,
            x2, y1, width2, height1,
            'treadling_style',
            false, false
        );
        this.color_weft = this.make(
            s.display_colors_weft,
            GridViewColors, p.color_weft,
            x3, y1, width3, height1,
            '',
            false, false
        );

        let sby = y1 + height1;
        if (this.settings.entering_at_bottom) {
            if (this.settings.display_colors_warp) {
                sby = y4 + height4;
            } else if (this.settings.display_entering) {
                sby = y3 + height3;
            } else if (this.settings.display_reed) {
                sby = y2 + height2;
            }
        }

        this.scroll_1_hor = new ScrollbarHorz(
            p.weave,
            this,
            x1, sby, width1, scroll,
            s.direction_righttoleft
        );
        this.scroll_1_hor.registerView(this.color_warp);
        this.scroll_1_hor.registerView(this.entering);
        this.scroll_1_hor.registerView(this.reed);
        this.scroll_1_hor.registerView(this.weave);

        if (pegplanMode) {
            this.scroll_2_hor = new ScrollbarHorz(
                p.pegplan,
                this,
                x2, sby, width2, scroll,
                false
            );
            this.scroll_2_hor.registerView(this.pegplan);
            this.scroll_2_hor.registerView(this.tieup);
        } else if (this.settings.display_treadling) {
            this.scroll_2_hor = new ScrollbarHorz(
                p.treadling,
                this,
                x2, sby, width2, scroll,
                false
            );
            this.scroll_2_hor.registerView(this.tieup);
            this.scroll_2_hor.registerView(this.treadling);
        } else {
            this.scroll_2_hor = new GridViewDummy();
        }

        let sbx = x1 + width1;
        if (this.settings.display_colors_weft) {
            sbx = x3 + width3;
        } else if (this.settings.display_treadling) {
            sbx = x2 + width2;
        }

        this.scroll_1_ver = new ScrollbarVert(
            p.weave,
            this,
            sbx, y1, scroll, height1,
            false
        );
        this.scroll_1_ver.registerView(this.weave);
        this.scroll_1_ver.registerView(this.treadling);
        this.scroll_1_ver.registerView(this.pegplan);
        this.scroll_1_ver.registerView(this.color_weft);

        if (this.settings.display_entering) {
            this.scroll_2_ver = new ScrollbarVert(
                p.entering,
                this,
                sbx, y3, scroll, height3,
                s.direction_toptobottom
            );
            this.scroll_2_ver.registerView(this.entering);
            this.scroll_2_ver.registerView(this.tieup);
        } else {
            this.scroll_2_ver = new GridViewDummy();
        }

        this.weave.registerScrollbars(this.scroll_1_hor, this.scroll_1_ver);
        this.entering.registerScrollbars(this.scroll_1_hor, this.scroll_2_ver);
        this.treadling.registerScrollbars(this.scroll_2_hor, this.scroll_1_ver);
        this.tieup.registerScrollbars(this.scroll_2_hor, this.scroll_2_ver);
        this.pegplan.registerScrollbars(this.scroll_2_hor, this.scroll_1_ver);
        this.color_warp.registerScrollbars(this.scroll_1_hor, null);
        this.color_weft.registerScrollbars(null, this.scroll_1_ver);
        this.reed.registerScrollbars(this.scroll_1_hor, null);

        if (cursor.selected_part === "weave") {
            cursor.selected_view = this.weave;
        } else if (cursor.selected_part === "entering") {
            cursor.selected_view = this.entering;
        } else if (cursor.selected_part === "treadling") {
            cursor.selected_view = pegplanMode ? this.pegplan : this.treadling;
        } else if (cursor.selected_part === "tieup") {
            cursor.selected_view = pegplanMode ? this.pegplan : this.tieup;
        } else if (cursor.selected_part === "pegplan") {
            cursor.selected_view = this.pegplan;
        } else if (cursor.selected_part === "color_warp") {
            cursor.selected_view = this.color_warp;
        } else if (cursor.selected_part === "color_weft") {
            cursor.selected_view = this.color_weft;
        }
    }

    make(visible, viewclass, data, x, y, w, h, style, righttoleft, toptobottom) {
        if (visible) {
            return new viewclass(data, x, y, w, h, style, righttoleft, toptobottom);
        } else {
            return new GridViewDummy();
        }
    }

    draw() {
        this.clearCanvas();
        // Pattern-only: entering/tieup/treadling keep their layout and
        // gridlines but their contents are suppressed. Reed, warp and weft
        // colour bars continue to render their data (matches desktop
        // DB-WEAVE's "Show Pattern Only" behaviour).
        const patternOnly = !!this.settings.pattern_only;
        const suppressData = (v) => patternOnly
            && (v === this.entering || v === this.tieup
                || v === this.treadling || v === this.pegplan)
            && typeof v.drawGrid === "function";
        const drawView = (v) => {
            if (suppressData(v)) v.drawGrid(this.ctx, this.settings);
            else v.draw(this.ctx, this.settings);
        };
        drawView(this.color_warp);
        drawView(this.entering);
        if (this.settings.display_pegplan
            && typeof this.tieup.drawGrid === "function") {
            // In pegplan mode the tie-up pane shows an implicit diagonal
            // (treadle i ↔ shaft i) in a muted colour — no editable data.
            this.tieup.drawGrid(this.ctx, this.settings);
            this._drawPegplanDiagonal(this.tieup);
        } else {
            drawView(this.tieup);
        }
        drawView(this.reed);
        drawView(this.treadling);
        drawView(this.pegplan);
        this.weave.draw(this.ctx, this.settings);
        drawView(this.color_weft);
        // Overlays after all pane draws so the highlight + rapport markers
        // sit on top of every pane they touch.
        this._drawHighlight();
        this._drawRapport();

        this.scroll_1_hor.draw(this.ctx, this.settings);
        this.scroll_1_ver.draw(this.ctx, this.settings);
        this.scroll_2_hor.draw(this.ctx, this.settings);
        this.scroll_2_ver.draw(this.ctx, this.settings);

        if (cursor.selected_view) {
            cursor.selected_view.drawCursor(this.ctx, this.settings, cursor);
        }
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
    }

    // Rapport overlay: draws the auto-computed repeat-unit boundaries.
    // Vertical red lines span the entering strip at the warp rapport's
    // left/right edges; horizontal red lines span the treadling / pegplan
    // strip at the weft rapport's top/bottom edges. Inside the rapport,
    // positive-range cells are repainted red on the canvas background so
    // the repeat unit is visible even over the normal cell rendering.
    // (Mirrors desktop DB-WEAVE's DrawRapport + DrawGewebeRapport.)
    _drawRapport() {
        if (!this.settings.display_repeat) return;
        const s = this.settings;
        const ka = pattern.rapport_k_a, kb = pattern.rapport_k_b;
        const sa = pattern.rapport_s_a, sb = pattern.rapport_s_b;
        if (kb < ka || sb < sa) return;
        const weavePane = this.weave;
        if (!weavePane || !weavePane.calc_x || !weavePane.calc_y) return;
        const ctx = this.ctx;
        ctx.save();

        // ---- Paint red-as-patrone cells over the rapport, or over the
        //      repeats if inverse_repeat is on ---------------------------
        //
        // Normal: cells INSIDE the rapport show as red patrone on btnFace;
        //         cells OUTSIDE (the repeats) keep their natural style.
        // Inverse: swap — rapport cells keep their natural style, repeat
        //          cells get the red patrone treatment.
        //
        // In farbeffekt/simulation the cell is filled edge-to-edge and
        // paints over the grid lines; to get the proper "draft look" on
        // the painted cells we clear the FULL cell to bg, then repaint
        // red with the usual inset. Grid lines are redrawn on top after.
        const bg = s.darcula ? "#444" : "#fff";
        const red = "#d00";
        const inv = !!s.inverse_repeat;
        const paintSet = [];
        const wLo = Math.max(0, pattern.min_x);
        const wHi = Math.min(pattern.weave.width - 1, pattern.max_x);
        const hLo = Math.max(0, pattern.min_y);
        const hHi = Math.min(pattern.weave.height - 1, pattern.max_y);
        for (let di = wLo; di <= wHi; di++) {
            const li = di - weavePane.offset_i;
            if (li < 0 || li >= weavePane.width) continue;
            const inRapKette = (di >= ka && di <= kb);
            for (let dj = hLo; dj <= hHi; dj++) {
                const lj = dj - weavePane.offset_j;
                if (lj < 0 || lj >= weavePane.height) continue;
                const inRapSchuss = (dj >= sa && dj <= sb);
                const inRap = inRapKette && inRapSchuss;
                const shouldPaint = inv ? !inRap : inRap;
                if (!shouldPaint) continue;
                paintSet.push([li, lj, di, dj]);
            }
        }
        for (const [li, lj, di, dj] of paintSet) {
            const cx1 = weavePane.calc_x(li);
            const cy1 = weavePane.calc_y(lj);
            const cx2 = weavePane.calc_x(li + 1);
            const cy2 = weavePane.calc_y(lj + 1);
            ctx.fillStyle = bg;
            fillRect(ctx, cx1, cy1, cx2, cy2);
            const v = pattern.weave.get(di, dj);
            if (v > 0 && v !== 12) {
                const x1 = weavePane.calc_x(li + s.bxf);
                const y1 = weavePane.calc_y(lj + s.byf);
                const x2 = weavePane.calc_x(li + 1 - s.bxf);
                const y2 = weavePane.calc_y(lj + 1 - s.byf);
                ctx.fillStyle = red;
                fillRect(ctx, x1, y1, x2, y2);
            }
        }
        // Redraw gray minor grid lines where we painted so cells get
        // their usual borders back (the full-cell clear above wiped out
        // the grid lines painted earlier by weave.drawGrid).
        if (paintSet.length) {
            ctx.strokeStyle = s.darcula ? "#aaa" : "#777";
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (const [li, lj] of paintSet) {
                const x1 = weavePane.calc_x(li);
                const y1 = weavePane.calc_y(lj);
                const x2 = weavePane.calc_x(li + 1);
                const y2 = weavePane.calc_y(lj + 1);
                ctx.moveTo(x1, y1); ctx.lineTo(x2, y1);
                ctx.moveTo(x2, y1); ctx.lineTo(x2, y2);
                ctx.moveTo(x2, y2); ctx.lineTo(x1, y2);
                ctx.moveTo(x1, y2); ctx.lineTo(x1, y1);
            }
            ctx.stroke();
        }

        // ---- Vertical boundary lines in the entering strip ----
        const ez = this.entering;
        if (ez && ez.calc_x) {
            const ezLi1 = ka - ez.offset_i;
            const ezLi2 = kb + 1 - ez.offset_i;
            const xLeft  = ez.calc_x(ezLi1);
            const xRight = ez.calc_x(ezLi2);
            const yTop = (typeof ez.calc_y === "function") ? ez.calc_y(0) : null;
            const yBot = (typeof ez.calc_y === "function") ? ez.calc_y(ez.height) : null;
            ctx.strokeStyle = "#d00";
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (yTop !== null) {
                ctx.moveTo(xLeft, yTop);  ctx.lineTo(xLeft, yBot);
                ctx.moveTo(xRight, yTop); ctx.lineTo(xRight, yBot);
            }
            ctx.stroke();
        }

        // ---- Horizontal boundary lines in the treadling / pegplan strip ----
        const sidePane = s.display_pegplan ? this.pegplan : this.treadling;
        if (sidePane && sidePane.calc_y) {
            const liJ1 = sa - sidePane.offset_j;
            const liJ2 = sb + 1 - sidePane.offset_j;
            const yTop = sidePane.calc_y(liJ1);
            const yBot = sidePane.calc_y(liJ2);
            const xLeft  = sidePane.calc_x(0);
            const xRight = sidePane.calc_x(sidePane.width);
            ctx.strokeStyle = "#d00";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(xLeft, yTop); ctx.lineTo(xRight, yTop);
            ctx.moveTo(xLeft, yBot); ctx.lineTo(xRight, yBot);
            ctx.stroke();
        }

        ctx.restore();
    }

    // Highlight overlay: translucent red on the cells in every pane that
    // depend on the cell under the cursor. Port of desktop
    // TDBWFRM::DrawHighlight — walks the dependency chain that connects
    // entering → tie-up → treadling/pegplan → weave.
    _drawHighlight() {
        if (!this.settings.highlight) return;
        const ctx = this.ctx;
        const s = this.settings;
        const pegplanMode = !!s.display_pegplan;
        // Paint helper: fill a cell of a given pane in translucent red.
        // i,j are DOCUMENT (pre-scroll) coordinates.
        const paint = (pane, i, j) => {
            if (!pane || !pane.calc_x || !pane.calc_y) return;
            if (!pane.data) return;
            const li = i - pane.offset_i;
            const lj = j - pane.offset_j;
            if (li < 0 || li >= pane.width) return;
            if (lj < 0 || lj >= pane.height) return;
            const x1 = pane.calc_x(li);
            const y1 = pane.calc_y(lj);
            const x2 = pane.calc_x(li + 1);
            const y2 = pane.calc_y(lj + 1);
            fillRect(ctx, x1, y1, x2, y2);
        };
        ctx.save();
        ctx.fillStyle = "rgba(255, 0, 0, 0.43)";

        const part = cursor.selected_part;
        const ci = cursor.x1, cj = cursor.y1;

        if (part === "weave") {
            const ez = pattern.entering.get_shaft(ci);
            if (ez > 0) {
                paint(this.entering, ci, ez - 1);
                if (!pegplanMode) {
                    for (let k = 0; k < pattern.treadling.width; k++) {
                        const t = pattern.treadling.get(k, cj);
                        if (t <= 0) continue;
                        const weaveCell = pattern.weave.get(ci, cj);
                        const tu = pattern.tieup.get(k, ez - 1);
                        if (weaveCell === 0 || tu > 0) {
                            paint(this.treadling, k, cj);
                            paint(this.tieup, k, ez - 1);
                        }
                    }
                } else {
                    // Pegplan: dependent pegplan cell at (shaft, weft).
                    paint(this.pegplan, ez - 1, cj);
                }
            }
        } else if (part === "tieup" && !pegplanMode) {
            const treadle = ci, shaft = cj;
            for (let w = 0; w < pattern.entering.width; w++) {
                if (pattern.entering.get_shaft(w) === shaft + 1) {
                    paint(this.entering, w, shaft);
                    for (let j = 0; j < pattern.weave.height; j++) {
                        if (pattern.treadling.get(treadle, j) > 0) {
                            paint(this.treadling, treadle, j);
                            paint(this.weave, w, j);
                        }
                    }
                }
            }
        } else if (part === "treadling") {
            if (pegplanMode) {
                // Treated as "pegplan" elsewhere — handled below.
            } else {
                for (let w = 0; w < pattern.entering.width; w++) {
                    if (pattern.weave.get(w, cj) > 0) paint(this.weave, w, cj);
                }
                for (let shaft = 0; shaft < pattern.tieup.height; shaft++) {
                    if (pattern.tieup.get(ci, shaft) > 0) {
                        paint(this.tieup, ci, shaft);
                    }
                }
            }
        } else if (part === "pegplan") {
            // Cursor on pegplan (i = shaft, j = weft): highlight warps
            // mapped to that shaft, plus the entering cell.
            for (let w = 0; w < pattern.entering.width; w++) {
                if (pattern.entering.get_shaft(w) === ci + 1) {
                    paint(this.weave, w, cj);
                    paint(this.entering, w, ci);
                }
            }
        } else if (part === "entering") {
            // Cursor on entering (i = warp, j = shaft-1): highlight weave
            // cells in that warp that are woven, plus aufknuepfung cells
            // for treadles that bind this shaft.
            for (let j = 0; j < pattern.weave.height; j++) {
                if (pattern.weave.get(ci, j) > 0) paint(this.weave, ci, j);
            }
            if (!pegplanMode) {
                for (let t = 0; t < pattern.tieup.width; t++) {
                    if (pattern.tieup.get(t, cj) > 0) paint(this.tieup, t, cj);
                }
            }
        }

        ctx.restore();
    }

    // Paint a greyed-out diagonal in the tieup pane to indicate the
    // implicit treadle↔shaft mapping active in pegplan mode.
    _drawPegplanDiagonal(pane) {
        if (!pane || !pane.calc_x || !pane.calc_y) return;
        const ctx = this.ctx;
        const s = this.settings;
        const w = Math.min(pane.width, pane.data.width);
        const h = Math.min(pane.height, pane.data.height);
        const n = Math.min(w, h);
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = s.darcula ? "#aaa" : "#888";
        for (let k = 0; k < n; k++) {
            const li = k - pane.offset_i;
            const lj = k - pane.offset_j;
            if (li < 0 || li >= pane.width) continue;
            if (lj < 0 || lj >= pane.height) continue;
            const x1 = pane.calc_x(li + s.bxf);
            const y1 = pane.calc_y(lj + s.byf);
            const x2 = pane.calc_x(li + 1 - s.bxf);
            const y2 = pane.calc_y(lj + 1 - s.byf);
            fillRect(ctx, x1, y1, x2, y2);
        }
        ctx.restore();
    }
}


function i_to_doc(i, view, righttoleft) {
    if (righttoleft) {
        return view.width - 1 - (i - view.x) + view.offset_i;
    } else {
        return i - view.x + view.offset_i;
    }
}

function j_to_doc(j, view, toptobottom) {
    if (toptobottom) {
        return j - view.y + view.offset_j;
    } else {
        return view.height - 1 - (j - view.y) + view.offset_j;
    }
}

// _paintablePaneAt — returns metadata for a paintable 2D pane under the given
// screen-grid cell, or null. Drawing tools (line/rect/ellipse) operate only
// on these panes: weave, tieup, treadling.
function _paintablePaneAt(i, j) {
    if (view.weave.contains(i, j) && !settings.weave_locked) {
        return {
            part: "weave", pane: view.weave, grid: pattern.weave,
            rtl: settings.direction_righttoleft, ttb: false,
            recalc: "from_weave",
        };
    }
    if (view.tieup.contains(i, j) && !settings.display_pegplan) {
        return {
            part: "tieup", pane: view.tieup, grid: pattern.tieup,
            rtl: false, ttb: settings.direction_toptobottom,
            recalc: "weave_recalc",
        };
    }
    if (view.treadling.contains(i, j)) {
        return {
            part: "treadling", pane: view.treadling, grid: pattern.treadling,
            rtl: false, ttb: false,
            recalc: "weave_recalc",
        };
    }
    if (view.pegplan.contains(i, j)) {
        return {
            part: "pegplan", pane: view.pegplan, grid: pattern.pegplan,
            rtl: false, ttb: false,
            recalc: "weave_recalc",
        };
    }
    return null;
}

// Overlay the pending tool-shape preview on top of the current canvas.
// Called right after view.draw() while a tool drag is in progress.
function drawToolPreview() {
    if (!toolDrag || !toolDrag.active) return;
    const p = toolDrag.pane_info;
    const pane = p.pane;
    const cells = ToolRaster.rasterize(
        toolDrag.tool, toolDrag.i1, toolDrag.j1, toolDrag.i2, toolDrag.j2);
    const ctx = view.ctx;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = getRangeColor(settings, settings.current_range);
    for (const [ii, jj] of cells) {
        const li = ii - pane.offset_i;
        const lj = jj - pane.offset_j;
        if (li < 0 || li >= pane.width || lj < 0 || lj >= pane.height) continue;
        const x1 = pane.calc_x(li + settings.bxf);
        const y1 = pane.calc_y(lj + settings.byf);
        const x2 = pane.calc_x(li + 1 - settings.bxf);
        const y2 = pane.calc_y(lj + 1 - settings.byf);
        fillRect(ctx, x1, y1, x2, y2);
    }
    ctx.restore();
}

// Commit the in-flight tool drag as a single undoable command.
function _finishToolDrag() {
    if (!toolDrag || !toolDrag.active) { toolDrag = null; return; }
    const p = toolDrag.pane_info;
    const grid = p.grid;
    const cells = ToolRaster.rasterize(
        toolDrag.tool, toolDrag.i1, toolDrag.j1, toolDrag.i2, toolDrag.j2);
    // Clamp to grid bounds and compute bbox for snapshotting.
    let lo_i = Infinity, hi_i = -Infinity, lo_j = Infinity, hi_j = -Infinity;
    const valid = [];
    for (const [ii, jj] of cells) {
        if (ii < 0 || ii >= grid.width) continue;
        if (jj < 0 || jj >= grid.height) continue;
        valid.push([ii, jj]);
        if (ii < lo_i) lo_i = ii;
        if (ii > hi_i) hi_i = ii;
        if (jj < lo_j) lo_j = jj;
        if (jj > hi_j) hi_j = jj;
    }
    const toolLabel = toolDrag ? toolDrag.tool : "tool";
    toolDrag = null;
    if (valid.length === 0) { view.draw(); return; }
    const range = settings.current_range;
    const recalcKind = p.recalc;
    const afterApply = _recalcFor(recalcKind);
    const mutate = () => {
        for (const [ii, jj] of valid) grid.set(ii, jj, range);
    };
    if (commandBus) {
        commandBus.execute(makeGridRegionCommand({
            grid, i1: lo_i, j1: lo_j, i2: hi_i, j2: hi_j,
            mutate, afterApply, label: p.part + ":" + toolLabel,
        }));
    } else {
        mutate();
        afterApply();
    }
}


function mouseDown(event) {
    had_selection = cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2;
    mousedown = true;
    const x = event.offsetX;
    const y = event.offsetY;
    const i = Math.trunc(x / settings.dx);
    const j = Math.trunc(y / settings.dy);

    // Drawing tool drag — short-circuits the usual selection logic on
    // paintable 2D panes.
    if (settings.tool && settings.tool !== "point") {
        const p = _paintablePaneAt(i, j);
        if (p) {
            const ii = i_to_doc(i, p.pane, p.rtl);
            const jj = j_to_doc(j, p.pane, p.ttb);
            toolDrag = {
                tool: settings.tool, pane_info: p,
                i1: ii, j1: jj, i2: ii, j2: jj, active: true,
            };
            select_part(p.part, ii, jj, ii, jj);
            view.draw();
            drawToolPreview();
            return;
        }
    }

    if (view.entering.contains(i, j)) {
        const ii = i_to_doc(i, view.entering, settings.direction_righttoleft);
        const jj = j_to_doc(j, view.entering, settings.direction_toptobottom);
        select_part("entering", ii, jj, ii, jj);
    } else if (view.pegplan.contains(i, j)) {
        const ii = i_to_doc(i, view.pegplan, false);
        const jj = j_to_doc(j, view.pegplan, false);
        select_part("pegplan", ii, jj, ii, jj);
    } else if (view.treadling.contains(i, j)) {
        const ii = i_to_doc(i, view.treadling, false);
        const jj = j_to_doc(j, view.treadling, false);
        select_part("treadling", ii, jj, ii, jj);
    } else if (view.tieup.contains(i, j) && !settings.display_pegplan) {
        const ii = i_to_doc(i, view.tieup, false);
        const jj = j_to_doc(j, view.tieup, settings.direction_toptobottom);
        select_part("tieup", ii, jj, ii, jj);
    } else if (view.weave.contains(i, j) && !settings.weave_locked) {
        const ii = i_to_doc(i, view.weave, settings.direction_righttoleft);
        const jj = j_to_doc(j, view.weave, false);
        select_part("weave", ii, jj, ii, jj);
    } else if (view.color_warp.contains(i, j)) {
        const ii = i_to_doc(i, view.color_warp, settings.direction_righttoleft);
        select_part("color_warp", ii, 0, ii, 0);
    } else if (view.color_weft.contains(i, j)) {
        const jj = j_to_doc(j, view.color_weft, false);
        select_part("color_weft", 0, jj, 0, jj);
    }
}

function mouseMove(event) {
    if (!mousedown) return;
    const x = event.offsetX;
    const y = event.offsetY;
    const i = Math.trunc(x / settings.dx);
    const j = Math.trunc(y / settings.dy);

    // Update tool drag preview.
    if (toolDrag && toolDrag.active) {
        const p = toolDrag.pane_info;
        if (p.pane.contains(i, j)) {
            toolDrag.i2 = i_to_doc(i, p.pane, p.rtl);
            toolDrag.j2 = j_to_doc(j, p.pane, p.ttb);
        }
        view.draw();
        drawToolPreview();
        return;
    }

    if (view.entering.contains(i, j)) {
        const ii = i_to_doc(i, view.entering, settings.direction_righttoleft);
        const jj = j_to_doc(j, view.entering, settings.direction_toptobottom);
        cursor.x2 = ii;
        cursor.y2 = jj;
        updateSelectionIcons();
        view.draw();
    } else if (view.pegplan.contains(i, j)) {
        const ii = i_to_doc(i, view.pegplan, false);
        const jj = j_to_doc(j, view.pegplan, false);
        cursor.x2 = ii;
        cursor.y2 = jj;
        updateSelectionIcons();
        view.draw();
    } else if (view.treadling.contains(i, j)) {
        const ii = i_to_doc(i, view.treadling, false);
        const jj = j_to_doc(j, view.treadling, false);
        cursor.x2 = ii;
        cursor.y2 = jj;
        updateSelectionIcons();
        view.draw();
    } else if (view.tieup.contains(i, j) && !settings.display_pegplan) {
        const ii = i_to_doc(i, view.tieup, false);
        const jj = j_to_doc(j, view.tieup, settings.direction_toptobottom);
        cursor.x2 = ii;
        cursor.y2 = jj;
        updateSelectionIcons();
        view.draw();
    } else if (view.weave.contains(i, j) && !settings.weave_locked) {
        const ii = i_to_doc(i, view.weave, settings.direction_righttoleft);
        const jj = j_to_doc(j, view.weave, false);
        cursor.x2 = ii;
        cursor.y2 = jj;
        updateSelectionIcons();
        view.draw();
    } else if (view.color_warp.contains(i, j)) {
        const ii = i_to_doc(i, view.color_warp, settings.direction_righttoleft);
        cursor.x2 = ii;
        cursor.y2 = 0;
        updateSelectionIcons();
        view.draw();
    } else if (view.color_weft.contains(i, j)) {
        const jj = j_to_doc(j, view.color_weft, false);
        cursor.x2 = 0;
        cursor.y2 = jj;
        updateSelectionIcons();
        view.draw();
    }
}

function mouseUp(event) {
    mousedown = false;
    const x = event.offsetX;
    const y = event.offsetY;
    const i = Math.trunc(x / settings.dx);
    const j = Math.trunc(y / settings.dy);

    // Finish tool drag: commit shape as one undoable command.
    if (toolDrag && toolDrag.active) {
        const p = toolDrag.pane_info;
        if (p.pane.contains(i, j)) {
            toolDrag.i2 = i_to_doc(i, p.pane, p.rtl);
            toolDrag.j2 = j_to_doc(j, p.pane, p.ttb);
        }
        _finishToolDrag();
        return;
    }

    if (view.entering.contains(i, j)) {
        const ii = i_to_doc(i, view.entering, settings.direction_righttoleft);
        const jj = j_to_doc(j, view.entering, settings.direction_toptobottom);
        cursor.x2 = ii;
        cursor.y2 = jj;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            const current = pattern.entering.get_shaft(ii);
            const next = current == jj + 1 ? 0 : jj + 1;
            _applyEnteringChange(ii, next);
        }
        updateSelectionIcons();
        view.draw();
    } else if (view.pegplan.contains(i, j)) {
        const ii = i_to_doc(i, view.pegplan, false);
        const jj = j_to_doc(j, view.pegplan, false);
        cursor.x2 = ii;
        cursor.y2 = jj;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            _applyGridToggle(pattern.pegplan, ii, jj, settings.current_range, "weave_recalc");
        }
        updateSelectionIcons();
        view.draw();
    } else if (view.treadling.contains(i, j)) {
        const ii = i_to_doc(i, view.treadling, false);
        const jj = j_to_doc(j, view.treadling, false);
        cursor.x2 = ii;
        cursor.y2 = jj;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            if (settings.single_treadling && !event.ctrlKey) {
                _applyTreadlingSingle(ii, jj);
            } else {
                _applyGridToggle(pattern.treadling, ii, jj, 1, "weave_recalc");
            }
        }
        updateSelectionIcons();
        view.draw();
    } else if (view.tieup.contains(i, j) && !settings.display_pegplan) {
        const ii = i_to_doc(i, view.tieup, false);
        const jj = j_to_doc(j, view.tieup, settings.direction_toptobottom);
        cursor.x2 = ii;
        cursor.y2 = jj;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            _applyGridToggle(pattern.tieup, ii, jj, settings.current_range, "weave_recalc");
        }
        updateSelectionIcons();
        view.draw();
    } else if (view.weave.contains(i, j) && !settings.weave_locked) {
        const ii = i_to_doc(i, view.weave, settings.direction_righttoleft);
        const jj = j_to_doc(j, view.weave, false);
        cursor.x2 = ii;
        cursor.y2 = jj;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            _applyGridToggle(pattern.weave, ii, jj, settings.current_range, "from_weave");
        }
        updateSelectionIcons();
        view.draw();
    } else if (view.color_warp.contains(i, j)) {
        const ii = i_to_doc(i, view.color_warp, settings.direction_righttoleft);
        cursor.x2 = ii;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            // Ctrl- or Shift-click on a color bar acts as a sniffer:
            // pick the clicked cell's color into settings.current_color
            // instead of overwriting it with the current paint color.
            if (event.ctrlKey || event.shiftKey) {
                settings.current_color = pattern.color_warp.get(ii, 0);
                update_color_selector(settings);
            } else {
                _applyCellSet(pattern.color_warp, ii, 0, settings.current_color, null);
            }
        }
        updateSelectionIcons();
        view.draw();
    } else if (view.color_weft.contains(i, j)) {
        const jj = j_to_doc(j, view.color_weft, false);
        cursor.y2 = jj;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            if (event.ctrlKey || event.shiftKey) {
                settings.current_color = pattern.color_weft.get(0, jj);
                update_color_selector(settings);
            } else {
                _applyCellSet(pattern.color_weft, 0, jj, settings.current_color, null);
            }
        }
        updateSelectionIcons();
        view.draw();
    } else if (view.reed.contains(i, j)) {
        const ii = i_to_doc(i, view.reed, settings.direction_righttoleft);
        _applyGridToggle(pattern.reed, ii, 0, 1, null);
        view.draw();
    } else {
        if (view.scroll_1_hor.contains(x, y)) {
            view.scroll_1_hor.scrollTo(x);
        } else if (view.scroll_2_hor.contains(x, y)) {
            view.scroll_2_hor.scrollTo(x);
        } else if (view.scroll_1_ver.contains(x, y)) {
            view.scroll_1_ver.scrollTo(y);
        } else if (view.scroll_2_ver.contains(x, y)) {
            view.scroll_2_ver.scrollTo(y);
        }
    }
}

function init() {
    const darkmode = document.getElementById("darkmode").value === "True";
    let canvas = document.getElementById('canvas');
    let ctx = canvas.getContext('2d');

    const width = data['width'];
    const height = data['height'];
    const max_shafts = data['max_shafts'];
    const max_treadles = data['max_treadles'];

    pattern = new Pattern(width, height, max_shafts, max_treadles);
    settings = new ViewSettings();
    settings.darcula = darkmode;

    if (typeof CommandBus !== "undefined") {
        commandBus = new CommandBus();
    }

    // console.log(data);
    initSettings(data, settings);
    initPatternData(data, pattern);
    _applyAspectRatio(settings);
    update_color_selector(settings);
    update_view_options(settings);

    const container = document.getElementById("container");
    canvas.style.backgroundColor = settings.darcula ? "#444" : "#fff";
    canvas.style.border = "none";

    // Show/hide the palette panel BEFORE measuring container width so
    // the canvas's flex slot is already sized correctly when we set
    // canvas.width — otherwise the canvas takes the full container
    // width, then the panel pushes it narrower and the bitmap renders
    // squashed until the next reflow.
    const palettePanel = document.getElementById("palette-panel");
    if (palettePanel) {
        palettePanel.classList.toggle("hidden", !settings.display_palette);
    }
    // Force a synchronous layout pass so canvas.clientWidth reflects
    // the post-toggle flex distribution.
    void container.offsetWidth;

    canvas.width = canvas.clientWidth || (container.clientWidth - 2);
    canvas.height = canvas.clientHeight || (container.clientHeight - 2);

    const visible_shafts = data['visible_shafts'];
    const visible_treadles = data['visible_treadles'];

    view = new PatternView(
        pattern,
        settings,
        ctx,
        visible_shafts,
        visible_treadles
    );
    // Restore last cursor position if persisted, else default to (0,0) on weave.
    const savedPart = val(data, "cursor_part", "weave");
    const savedX = val(data, "cursor_x", 0);
    const savedY = val(data, "cursor_y", 0);
    const validParts = ["weave", "entering", "treadling", "tieup", "color_warp", "color_weft"];
    if (validParts.indexOf(savedPart) >= 0) {
        select_part(savedPart, savedX, savedY);
    } else {
        select_part("weave", 0, 0);
    }
    update_range_selector(settings);
    if (settings.display_palette) _paletteToolboxRefresh();
    view.draw();

    document.getElementById("icon-selection-mirrorv").addEventListener("click", selectionMirrorV);
    document.getElementById("icon-selection-mirrorh").addEventListener("click", selectionMirrorH);
    document.getElementById("icon-selection-clear").addEventListener("click", selectionClear);
    document.getElementById("icon-selection-rotate").addEventListener("click", selectionRotate);
    document.getElementById("icon-selection-invert").addEventListener("click", selectionInvert);

    canvas.addEventListener("touchstart", mouseDown);
    canvas.addEventListener("touchmove", mouseMove);
    // canvas.addEventListener("touchend", mouseUp);
    canvas.addEventListener("mousedown", mouseDown);
    canvas.addEventListener("mousemove", mouseMove);
    canvas.addEventListener("mouseup", mouseUp);
}

function updateSelectionIcons() {
    const has_selection = cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2;
    const is_square = has_selection && Math.abs(cursor.x2 - cursor.x1) === Math.abs(cursor.y2 - cursor.y1);
    if (has_selection) {
        document.getElementById("icon-selection-mirrorv").classList.remove("hidden");
        document.getElementById("icon-selection-mirrorh").classList.remove("hidden");
        if (is_square) {
            document.getElementById("icon-selection-rotate").classList.remove("hidden");
        } else {
            document.getElementById("icon-selection-rotate").classList.add("hidden");
        }
        if (cursor.selected_part === "weave") {
            document.getElementById("icon-selection-invert").classList.remove("hidden");
        } else {
            document.getElementById("icon-selection-invert").classList.add("hidden");
        }
        document.getElementById("icon-selection-clear").classList.remove("hidden");
    } else {
        document.getElementById("icon-selection-mirrorv").classList.add("hidden");
        document.getElementById("icon-selection-mirrorh").classList.add("hidden");
        document.getElementById("icon-selection-rotate").classList.add("hidden");
        document.getElementById("icon-selection-invert").classList.add("hidden");
        document.getElementById("icon-selection-clear").classList.add("hidden");
    }
}

function val(data, prop, defval) {
    const result = data[prop];
    if (result === undefined) return defval;
    return result;
}

// Discard in-memory edits and reload the pattern from the server —
// port of desktop "Änderungen verwerfen" (filehandling.cpp). Asks the
// user to confirm because the operation is destructive.
async function _revertChanges() {
    if (readonly || !modified) return;
    const i18n = _getI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    if (!window.confirm(L("file.revert-confirm",
        "Discard all unsaved changes and reload the pattern from the server?"))) return;
    await getPattern();
    initSettings(data, settings);
    initPatternData(data, pattern);
    if (commandBus) {
        commandBus.undoStack.length = 0;
        commandBus.redoStack.length = 0;
    }
    pattern.recalc_weave();
    if (view) {
        view.layout();
        view.draw();
    }
    update_color_selector(settings);
    update_view_options(settings);
    update_range_selector(settings);
    _paletteToolboxApply();
    clearModified();
    ActionRegistry.notify();
}

// Custom close prompt — port of the desktop's confirm-on-close dialog
// (filehandling.cpp:424). Three choices: Save & close, discard & close,
// cancel. When the pattern is unmodified or read-only, falls through
// straight to the existing `closePattern()` navigation.
function _closePatternGuarded() {
    if (readonly || !modified) {
        closePattern();
        return;
    }
    const i18n = _getI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    const body = document.createElement("div");
    body.style.minWidth = "360px";
    body.textContent = L("file.close-prompt",
        "The pattern has unsaved changes. Save before closing?");

    let modal;
    const doSave = async () => {
        saveSettings(data, settings);
        savePatternData(data, pattern);
        await savePattern();
        modal.close();
        closePattern();
    };
    const doDiscard = () => {
        clearModified();
        modal.close();
        closePattern();
    };
    modal = Modal.open({
        title: L("file.close-title", "Close pattern"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"),  role: "cancel" },
            { label: L("file.discard", "Don't save"), onClick: doDiscard },
            { label: L("file.save",    "Save"),  role: "primary", onClick: doSave },
        ],
    });
}


function initSettings(data, settings) {
    // Per-device preferences supply the defaults for any setting the
    // pattern JSON doesn't already specify (Phase 12). Saved patterns
    // continue to win — the prefs only fill the gaps.
    const prefs = (typeof _prefsLoad === "function") ? _prefsLoad() : {};
    settings.style = val(data, "weave_style", "draft");
    settings.entering_style = val(data, "entering_style", prefs.entering_style || "filled");
    settings.tieup_style = val(data, "tieup_style", prefs.tieup_style || "filled");
    settings.treadling_style = val(data, "treadling_style", prefs.treadling_style || "filled");
    settings.single_treadling = val(data, "single_treadling", true);
    settings.weave_locked = val(data, "weave_locked", false);
    settings.unit_width = val(data, "unit_width", prefs.unit_width || 4);
    settings.unit_height = val(data, "unit_height", prefs.unit_height || 4);
    settings.direction_righttoleft = val(data, "direction_righttoleft", !!prefs.direction_righttoleft);
    settings.direction_toptobottom = val(data, "direction_toptobottom", !!prefs.direction_toptobottom);
    settings.entering_at_bottom = val(data, "entering_at_bottom", !!prefs.entering_at_bottom);
    settings.warp_factor = val(data, "warp_factor", prefs.warp_factor || 1.0);
    settings.weft_factor = val(data, "weft_factor", prefs.weft_factor || 1.0);
    // Phase 12 extras (port of XOptionsDialog fields). Some are
    // currently no-ops (alt_palette, alt_pegplan, sinking_shed) but
    // are kept on `settings` so the Optionen dialog round-trips them.
    settings.pegplan_style    = val(data, "pegplan_style",    prefs.pegplan_style    || "filled");
    settings.aushebung_style  = val(data, "aushebung_style",  prefs.aushebung_style  || "rising");
    settings.anbindung_style  = val(data, "anbindung_style",  prefs.anbindung_style  || "cross");
    settings.abbindung_style  = val(data, "abbindung_style",  prefs.abbindung_style  || "circle");
    settings.alt_palette      = val(data, "alt_palette",      !!prefs.alt_palette);
    settings.alt_pegplan      = val(data, "alt_pegplan",      !!prefs.alt_pegplan);
    settings.sinking_shed     = val(data, "sinking_shed",     !!prefs.sinking_shed);
    settings.current_color = val(data, "current_color", 0);
    settings.display_colors_warp = val(data, "display_colors_warp", true);
    settings.display_colors_weft = val(data, "display_colors_weft", true);
    settings.display_hlines = val(data, "display_hlines", true);
    settings.display_palette = val(data, "display_palette", false);
    settings.display_pegplan = val(data, "display_pegplan", false);
    settings.display_reed = val(data, "display_reed", true);
    settings.display_repeat = val(data, "display_repeat", false);
    settings.display_entering = val(data, "display_entering", true);
    settings.display_treadling = val(data, "display_treadling", true);
    const savedRange = val(data, "current_range", 1);
    settings.current_range = (savedRange >= 1 && savedRange <= 12) ? savedRange : 1;
    // Rapport is auto-computed from the pattern (see Pattern.calcRapport);
    // no user-settable bounds to load here.
    settings.inverse_repeat = val(data, "inverse_repeat", false);
    settings.color_effect_with_grid = val(data, "color_effect_with_grid", false);
    settings.highlight = false;
    settings.threading_arrangement = val(data, "threading_arrangement", "minimal-z");
    settings.treadling_arrangement = val(data, "treadling_arrangement", "minimal-z");
}


function get_current_layout(settings) {
    if (settings.entering_style === "filled"
        && settings.tieup_style === "filled"
        && settings.treadling_style === "filled"
        && settings.direction_righttoleft === true
        && settings.direction_toptobottom === false
        && settings.entering_at_bottom === false) {
        return "US";
    } else if (settings.entering_style === "dash"
        && settings.tieup_style === "cross"
        && settings.treadling_style === "dot"
        && settings.direction_righttoleft === false
        && settings.direction_toptobottom === false
        && settings.entering_at_bottom === false) {
        return "DE";
    } else if (settings.entering_style === "filled"
        && settings.tieup_style === "filled"
        && settings.treadling_style === "filled"
        && settings.direction_righttoleft === true
        && settings.direction_toptobottom === true
        && settings.entering_at_bottom === true) {
        return "SK";
    } else {
        return "--";
    }
}


function set_current_layout(layout) {
    if (layout === "DE") {
        settings.entering_style = "dash";
        settings.treadling_style = "dot";
        settings.tieup_style = "cross";
        settings.entering_at_bottom = false;
        settings.direction_toptobottom = false;
        settings.direction_righttoleft = false;
        view.layout();
        view.draw();
    } else if (layout === "SK") {
        settings.entering_style = "filled";
        settings.treadling_style = "filled";
        settings.tieup_style = "filled";
        settings.entering_at_bottom = true;
        settings.direction_toptobottom = true;
        settings.direction_righttoleft = true;
        view.layout();
        view.draw();
    } else if (layout === "US") {
        settings.entering_style = "filled";
        settings.treadling_style = "filled";
        settings.tieup_style = "filled";
        settings.entering_at_bottom = false;
        settings.direction_toptobottom = false;
        settings.direction_righttoleft = true;
        view.layout();
        view.draw();
    }
}


function saveSettings(data, settings) {
    data["weave_style"] = settings.style;
    data["entering_style"] = settings.entering_style;
    data["tieup_style"] = settings.tieup_style;
    data["treadling_style"] = settings.treadling_style;
    data["single_treadling"] = settings.single_treadling;
    data["weave_locked"] = settings.weave_locked;
    data["unit_width"] = settings.unit_width;
    data["unit_height"] = settings.unit_height;
    data["direction_righttoleft"] = settings.direction_righttoleft;
    data["direction_toptobottom"] = settings.direction_toptobottom;
    data["entering_at_bottom"] = settings.entering_at_bottom;
    data["warp_factor"] = settings.warp_factor;
    data["weft_factor"] = settings.weft_factor;
    data["pegplan_style"]    = settings.pegplan_style;
    data["aushebung_style"]  = settings.aushebung_style;
    data["anbindung_style"]  = settings.anbindung_style;
    data["abbindung_style"]  = settings.abbindung_style;
    data["alt_palette"]      = settings.alt_palette;
    data["alt_pegplan"]      = settings.alt_pegplan;
    data["sinking_shed"]     = settings.sinking_shed;
    data["current_color"] = settings.current_color;
    data["display_colors_warp"] = settings.display_colors_warp;
    data["display_colors_weft"] = settings.display_colors_weft;
    data["display_hlines"] = settings.display_hlines;
    data["display_palette"] = settings.display_palette;
    data["display_pegplan"] = settings.display_pegplan;
    data["display_reed"] = settings.display_reed;
    data["display_repeat"] = settings.display_repeat;
    data["display_entering"] = settings.display_entering;
    data["display_treadling"] = settings.display_treadling;
    data["current_range"] = settings.current_range;
    data["inverse_repeat"] = settings.inverse_repeat;
    data["threading_arrangement"] = settings.threading_arrangement;
    data["treadling_arrangement"] = settings.treadling_arrangement;
    data["color_effect_with_grid"] = settings.color_effect_with_grid;
    // Cursor position persists across reloads so the user can pick up where
    // they left off. We only store a single cell, not the whole selection.
    if (typeof cursor !== "undefined" && cursor !== null) {
        data["cursor_part"] = cursor.selected_part;
        data["cursor_x"] = cursor.x1;
        data["cursor_y"] = cursor.y1;
    }
}


function initPatternData(data, pattern) {
    pattern.palette = [];
    let idx = 0;
    for (const spec of data.palette) {
        pattern.palette.push([spec[0] | 0, spec[1] | 0, spec[2] | 0]);
        colors[idx++] = `rgb(${spec[0]}, ${spec[1]}, ${spec[2]})`;
    }

    for (let i = 0; i < data.width; i++) {
        pattern.color_warp.set(i, 0, data.colors_warp[i]);
        pattern.reed.set(i, 0, data.data_reed[i]);
    }

    for (let j = 0; j < data.height; j++) {
        pattern.color_weft.set(0, j, data.colors_weft[j]);
    }

    let min_pattern_x = 0;
    let max_pattern_x = 0;
    for (let i = 0; i < data.width; i++) {
        if (data.data_entering[i] > 0) {
            min_pattern_x = Math.min(min_pattern_x, i);
            max_pattern_x = Math.max(max_pattern_x, i);
        }
    }
    pattern.min_x = min_pattern_x;
    pattern.max_x = max_pattern_x;

    let min_pattern_y = 0;
    let max_pattern_y = 0;
    for (let j = 0; j < data.height; j++) {
        for (let i = 0; i < data.max_treadles; i++) {
            const idx = i + j * data.max_treadles;
            if (data.data_treadling[idx] > 0) {
                min_pattern_y = Math.min(min_pattern_y, j);
                max_pattern_y = Math.max(max_pattern_y, j);
            }
        }
    }
    pattern.min_y = min_pattern_y;
    pattern.max_y = max_pattern_y;

    let max_shaft = 0;
    for (let i = min_pattern_x; i <= max_pattern_x; i++) {
        const shaft = data.data_entering[i];
        if (shaft <= 0) continue;
        max_shaft = Math.max(max_shaft, shaft - 1);
        pattern.entering.set_shaft(i, shaft);
    }

    let max_treadle = 0;
    for (let j = min_pattern_y; j <= max_pattern_y; j++) {
        for (let k = 0; k < data.max_treadles; k++) {
            const treadle = data.data_treadling[k + j * data.max_treadles];
            if (treadle > 0) {
                max_treadle = Math.max(max_treadle, k);
                pattern.treadling.set(k, j, treadle);
            }
        }
    }

    for (let i = 0; i <= max_treadle; i++) {
        for (let j = 0; j <= max_shaft; j++) {
            const tieup = data.data_tieup[i + j * data.max_treadles];
            if (tieup > 0) {
                pattern.tieup.set(i, j, tieup);
            }
        }
    }

    // Pegplan: optional — older patterns won't have it. Shape is
    // max_shafts × height, flattened by shaft-major order (i + j*max_shafts).
    if (Array.isArray(data.data_pegplan)) {
        for (let j = 0; j < data.height; j++) {
            for (let s = 0; s < data.max_shafts; s++) {
                const v = data.data_pegplan[s + j * data.max_shafts];
                if (v > 0) pattern.pegplan.set(s, j, v);
            }
        }
    }

    // Block- / Bereich-muster slots (10 each, 12×12 cells flat). Older
    // patterns without these arrays start with empty muster slots.
    _loadMusterArray(data.data_blockmuster,   pattern.blockmuster);
    _loadMusterArray(data.data_bereichmuster, pattern.bereichmuster);

    // Fixed-threading template (optional — older patterns lack it).
    if (Array.isArray(data.data_fixeinzug)) {
        for (let i = 0; i < pattern.fixeinzug.length && i < data.data_fixeinzug.length; i++) {
            pattern.fixeinzug[i] = data.data_fixeinzug[i] || 0;
        }
    }
    pattern.fixsize  = val(data, "fixsize", 0);
    pattern.firstfree = val(data, "firstfree", 0);

    pattern.recalc_weave();
}

function _loadMusterArray(arr, target) {
    if (!Array.isArray(arr)) return;
    for (let k = 0; k < 10 && k < arr.length; k++) {
        const slot = arr[k];
        if (!Array.isArray(slot)) continue;
        for (let i = 0; i < slot.length && i < 12 * 12; i++) {
            target[k].feld[i] = slot[i] || 0;
        }
    }
}


function savePatternData(data, pattern) {
    for (let i = 0; i < data.width; i++) {
        data.data_reed[i] = pattern.reed.get(i, 0);
        data.colors_warp[i] = pattern.color_warp.get(i, 0);
        data.data_entering[i] = pattern.entering.get_shaft(i);
    }

    for (let j = 0; j < data.height; j++) {
        data.colors_weft[j] = pattern.color_weft.get(0, j);
    }

    for (let j = 0; j < data.height; j++) {
        for (let i = 0; i < data.max_treadles; i++) {
            const idx = i + j * data.max_treadles;
            data.data_treadling[idx] = pattern.treadling.get(i, j);
        }
    }

    for (let i = 0; i < data.max_treadles; i++) {
        for (let j = 0; j <= data.max_shafts; j++) {
            const idx = i + j * data.max_treadles;
            data.data_tieup[idx] = pattern.tieup.get(i, j);
        }
    }

    // Pegplan (shafts × height, shaft-major flattening).
    const pegFlat = new Array(data.max_shafts * data.height);
    pegFlat.fill(0);
    for (let j = 0; j < data.height; j++) {
        for (let s = 0; s < data.max_shafts; s++) {
            pegFlat[s + j * data.max_shafts] = pattern.pegplan.get(s, j);
        }
    }
    data.data_pegplan = pegFlat;

    // Muster slots — 10 × 144 cells each, simple flat int arrays.
    data.data_blockmuster   = pattern.blockmuster.map(m => m.feld.slice());
    data.data_bereichmuster = pattern.bereichmuster.map(m => m.feld.slice());

    // Fixed-threading template + helper indices.
    data.data_fixeinzug = pattern.fixeinzug.slice();
    data.fixsize        = pattern.fixsize;
    data.firstfree      = pattern.firstfree;

    // Palette — write back as [r,g,b,0] triples to match the storage
    // format (the 4th slot mirrors the legacy alpha/marker channel).
    if (pattern.palette && pattern.palette.length) {
        data.palette = pattern.palette.map(([r, g, b], i) => {
            const orig = (Array.isArray(data.palette) && data.palette[i]) || [0, 0, 0, 0];
            return [r, g, b, orig[3] || 0];
        });
    }
}


function keyDown(e) {
    // Don't hijack keystrokes targeted at editable fields (modal inputs,
    // textareas). Lets Tab / Shift+Tab navigate, arrow keys adjust
    // numeric inputs, Space insert whitespace, etc.
    const t = e.target;
    if (t && (t.isContentEditable
              || t.tagName === "INPUT"
              || t.tagName === "TEXTAREA"
              || t.tagName === "SELECT")) {
        return;
    }
    // Alt+1..4 (weave style) and Ctrl+Z/Y/X/C/V/B/I/S/Del, H/V/R/I selection
    // transforms are handled by the Shortcuts dispatcher + action registry
    // (see setupEditorActions). Keep cursor navigation + pane-visibility
    // toggles here for now.
    if (e.key === "a") { // TODO use better key shortcut
        settings.display_entering = !settings.display_entering;
        update_view_options(settings);
        view.layout();
        view.draw();
        e.preventDefault();
    } else if (e.key === "b") { // TODO use better key shortcut
        settings.display_treadling = !settings.display_treadling;
        update_view_options(settings);
        view.layout();
        view.draw();
        e.preventDefault();
    } else if (e.key === "c") { // TODO use better key shortcut
        settings.display_reed = !settings.display_reed;
        update_view_options(settings);
        view.layout();
        view.draw();
        e.preventDefault();
    } else if (e.key === "d") { // TODO use better key shortcut
        settings.display_colors_warp = !settings.display_colors_warp;
        settings.display_colors_weft = !settings.display_colors_weft;
        update_view_options(settings);
        view.layout();
        view.draw();
        e.preventDefault();
    } else if (e.key === "e") { // TODO use better key shortcut
        settings.entering_at_bottom = !settings.entering_at_bottom;
        view.layout();
        view.draw();
        e.preventDefault();
    } else if ((e.key == " " || e.key === "Enter") && e.shiftKey
               && (cursor.selected_part === "color_warp"
                || cursor.selected_part === "color_weft")) {
        // Color sniffer via cursor: Shift+Space / Shift+Enter on a
        // color bar picks the cell at the cursor into current_color
        // instead of stamping the current_color into the cell.
        e.stopPropagation();
        e.preventDefault();
        const idx = (cursor.selected_part === "color_warp")
            ? pattern.color_warp.get(cursor.x1, 0)
            : pattern.color_weft.get(0, cursor.y1);
        settings.current_color = idx;
        update_color_selector(settings);
        view.draw();
    } else if (e.key == " ") {
        if (cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2) {
            e.stopPropagation();
            e.preventDefault();
            const i = cursor.x1, j = cursor.y1;
            const part = cursor.selected_part;
            const grid = cursor.selected_pattern;
            // Route through the command-bus helpers so keyboard edits are
            // undoable, mirroring the mouse-click path.
            if (part === "entering") {
                const current = pattern.entering.get_shaft(i);
                const next = current == j + 1 ? 0 : j + 1;
                _applyEnteringChange(i, next);
            } else if (part === "weave") {
                _applyGridToggle(grid, i, j, settings.current_range, "from_weave");
            } else if (part === "treadling") {
                if (settings.single_treadling && !e.ctrlKey) {
                    _applyTreadlingSingle(i, j);
                } else {
                    _applyGridToggle(grid, i, j, 1, "weave_recalc");
                }
            } else if (part === "tieup" && !settings.display_pegplan) {
                _applyGridToggle(grid, i, j, settings.current_range, "weave_recalc");
            } else if (part === "pegplan") {
                _applyGridToggle(grid, i, j, settings.current_range, "weave_recalc");
            } else if (part === "color_warp") {
                _applyCellSet(grid, i, 0, settings.current_color, null);
            } else if (part === "color_weft") {
                _applyCellSet(grid, 0, j, settings.current_color, null);
            } else if (part === "reed") {
                _applyGridToggle(grid, i, 0, 1, null);
            }
            cursor.y1 += 1; // TODO handle configurable cursor movement
            cursor.y2 = cursor.y1;
            view.draw();
        }
    } else if (e.key == "Enter" || e.key == "Tab") {
        e.stopPropagation();
        e.preventDefault();
        if (e.shiftKey) {
            goto_prev_part();
        } else {
            goto_next_part();
        }
        view.draw();
    } else if (e.key == "ArrowUp") {
        e.stopPropagation();
        e.preventDefault();
        if (cursor.selected_view.toptobottom) {
            cursorDown(e);
        } else {
            cursorUp(e);
        }
    } else if (e.key == "ArrowDown") {
        e.stopPropagation();
        e.preventDefault();
        if (cursor.selected_view.toptobottom) {
            cursorUp(e);
        } else {
            cursorDown(e);
        }
    } else if (e.key == "ArrowRight") {
        e.stopPropagation();
        e.preventDefault();
        if (cursor.selected_view.righttoleft) {
            cursorLeft(e);
        } else {
            cursorRight(e);
        }
    } else if (e.key == "ArrowLeft") {
        e.stopPropagation();
        e.preventDefault();
        if (cursor.selected_view.righttoleft) {
            cursorRight(e);
        } else {
            cursorLeft(e);
        }
    }
    // Note: Delete / V / H / R / I on an active selection are dispatched
    // through Shortcuts + ActionRegistry (see setupEditorActions).
}

function cursorUp(e) {
    if (e.shiftKey) {
        if (e.ctrlKey) {
            if (cursor.y1 === cursor.y2) {
                cursor.y2 += settings.unit_height - 1;
            } else if (cursor.y2 + settings.unit_height - 1 === cursor.y1) {
                cursor.y2 += settings.unit_height - 1;
            } else {
                cursor.y2 += settings.unit_height;
            }
        } else {
            cursor.y2++;
        }
        if (cursor.y2 >= cursor.selected_pattern.height) {
            cursor.y2 = cursor.selected_pattern.height;
        }
    } else {
        cursor.x1 = cursor.x2;
        if (e.ctrlKey) {
            cursor.y2 += settings.unit_height;
        } else {
            cursor.y2++;
        }
        if (cursor.y2 >= cursor.selected_pattern.height) {
            cursor.y2 = cursor.selected_pattern.height;
        }
        cursor.y1 = cursor.y2;
    }
    const max_y = cursor.selected_view.offset_j + cursor.selected_view.height;
    if (cursor.y2 >= max_y) {
        const scroll_delta = cursor.y2 - max_y + 1;
        cursor.selected_view.scroll("v", scroll_delta);
    }
    updateSelectionIcons();
    save_part_position();
    view.draw();
}

function cursorDown(e) {
    if (e.shiftKey) {
        if (e.ctrlKey) {
            if (cursor.y1 === cursor.y2) {
                cursor.y2 -= settings.unit_height - 1;
            } else if (cursor.y1 + settings.unit_height - 1 === cursor.y2) {
                cursor.y2 -= settings.unit_height - 1;
            } else {
                cursor.y2 -= settings.unit_height;
            }
        } else {
            cursor.y2--;
        }
        if (cursor.y2 < 0) {
            cursor.y2 = 0;
        }
    } else {
        cursor.x1 = cursor.x2;
        if (e.ctrlKey) {
            cursor.y2 -= settings.unit_height;
        } else {
            cursor.y2--;
        }
        if (cursor.y2 < 0) {
            cursor.y2 = 0;
        }
        cursor.y1 = cursor.y2;
    }
    const min_y = cursor.selected_view.offset_j;
    if (cursor.y2 < min_y) {
        const scroll_delta = cursor.y2 - min_y;
        cursor.selected_view.scroll("v", scroll_delta);
    }
    updateSelectionIcons();
    save_part_position();
    view.draw();
}

function cursorRight(e) {
    if (e.shiftKey) {
        if (e.ctrlKey) {
            if (cursor.x1 === cursor.x2) {
                cursor.x2 += settings.unit_width - 1;
            } else if (cursor.x2 + settings.unit_width - 1 == cursor.x1) {
                cursor.x2 += settings.unit_width - 1;
            } else {
                cursor.x2 += settings.unit_width;
            }
        } else {
            cursor.x2++;
        }
        if (cursor.x2 >= cursor.selected_pattern.width) {
            cursor.x2 = cursor.selected_pattern.width - 1;
        }
    } else {
        if (e.ctrlKey) {
            cursor.x2 += settings.unit_width;
        } else {
            cursor.x2++;
        }
        if (cursor.x2 >= cursor.selected_pattern.width) {
            cursor.x2 = cursor.selected_pattern.width - 1;
        }
        cursor.x1 = cursor.x2;
        cursor.y1 = cursor.y2;
    }
    const max_x = cursor.selected_view.offset_i + cursor.selected_view.width;
    if (cursor.x2 >= max_x) {
        const scroll_delta = cursor.x2 - max_x + 1;
        cursor.selected_view.scroll("h", scroll_delta);
    }
    updateSelectionIcons();
    save_part_position();
    view.draw();
}

function cursorLeft(e) {
    if (e.shiftKey) {
        if (e.ctrlKey) {
            if (cursor.x1 + settings.unit_width - 1 === cursor.x2) {
                cursor.x2 -= settings.unit_width - 1;
            } else if (cursor.x1 == cursor.x2) {
                cursor.x2 -= settings.unit_width - 1;
            } else {
                cursor.x2 -= settings.unit_width;
            }
        } else {
            cursor.x2--;
        }
        if (cursor.x2 < 0) {
            cursor.x2 = 0;
        }
    } else {
        if (e.ctrlKey) {
            cursor.x2 -= settings.unit_width;
        } else {
            cursor.x2--;
        }
        if (cursor.x2 < 0) {
            cursor.x2 = 0;
        }
        cursor.x1 = cursor.x2;
        cursor.y1 = cursor.y2;
    }
    const min_x = cursor.selected_view.offset_i;
    if (cursor.x2 < min_x) {
        const scroll_delta = cursor.x2 - min_x;
        cursor.selected_view.scroll("h", scroll_delta);
    }
    updateSelectionIcons();
    save_part_position();
    view.draw();
}

// _selBounds: read current selection bounds from cursor; returns null if
// nothing selected.
function _selBounds() {
    const i1 = Math.min(cursor.x1, cursor.x2);
    const i2 = Math.max(cursor.x1, cursor.x2);
    const j1 = Math.min(cursor.y1, cursor.y2);
    const j2 = Math.max(cursor.y1, cursor.y2);
    return { i1, i2, j1, j2 };
}

// _recalcAfterMutation: trigger the right recalc path based on which pane
// the mutation happened in, and redraw.
function _afterPatternMutation(part) {
    if (part === "weave") pattern.recalc_from_weave(settings);
    else pattern.recalc_weave();
    setModified();
    view.draw();
}

// Dispatch a snapshot-backed mutation as an undoable command.
function _runSelectionCommand(label, grid, mutate) {
    const { i1, i2, j1, j2 } = _selBounds();
    const part = cursor.selected_part;
    if (!commandBus) { mutate(); _afterPatternMutation(part); return; }
    const cmd = makeGridRegionCommand({
        grid, i1, j1, i2, j2,
        mutate,
        afterApply: () => _afterPatternMutation(part),
        label,
    });
    commandBus.execute(cmd);
}

function selectionClear() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("clear", grid, () => grid.clearRange(i1, j1, i2, j2));
}

function selectionInvert() {
    const { i1, i2, j1, j2 } = _selBounds();
    if (cursor.selected_part === "weave") {
        _runSelectionCommand("invert", pattern.weave,
            () => pattern.weave.invertRange(i1, j1, i2, j2));
    } else if (cursor.selected_part === "tieup") {
        _runSelectionCommand("invert", pattern.tieup,
            () => pattern.tieup.invertRange(i1, j1, i2, j2));
    }
}

function selectionRotate() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("rotate", grid, () => grid.rotateRight(i1, j1, i2, j2));
}

function selectionMirrorV() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("mirror-v", grid, () => grid.mirrorV(i1, j1, i2, j2));
}

function selectionMirrorH() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("mirror-h", grid, () => grid.mirrorH(i1, j1, i2, j2));
}

function selectionRollUp() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("roll-up", grid, () => grid.rollUp(i1, j1, i2, j2));
}
function selectionRollDown() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("roll-down", grid, () => grid.rollDown(i1, j1, i2, j2));
}
function selectionRollLeft() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("roll-left", grid, () => grid.rollLeft(i1, j1, i2, j2));
}
function selectionRollRight() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("roll-right", grid, () => grid.rollRight(i1, j1, i2, j2));
}

function selectionSlopeIncrease() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("slope-inc", grid, () => grid.slopeIncrease(i1, j1, i2, j2));
}
function selectionSlopeDecrease() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("slope-dec", grid, () => grid.slopeDecrease(i1, j1, i2, j2));
}

function selectionCentralSymmetry() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    const part = cursor.selected_part;
    // The algorithm either does nothing (already symmetric OR no symmetric
    // shift exists) or applies a specific cyclic shift. Avoid pushing a
    // no-op command onto the undo stack by capturing the before/after
    // snapshots ourselves.
    const before = snapshotGridRegion(grid, i1, j1, i2, j2);
    const result = grid.centralSymmetry(i1, j1, i2, j2);
    if (result !== "applied") {
        // Either already symmetric or no shift exists — nothing changed.
        return;
    }
    const after = snapshotGridRegion(grid, i1, j1, i2, j2);
    restoreGridRegion(grid, before);
    const afterApply = () => _afterPatternMutation(part);
    const cmd = {
        label: "central-symmetry",
        apply()  { restoreGridRegion(grid, after);  afterApply(); },
        revert() { restoreGridRegion(grid, before); afterApply(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else cmd.apply();
}

// Tie-up specific: mirror the entire tie-up matrix horizontally. This is the
// desktop's "Swap Sides" operation — commonly used to flip from Z to S style.
function tieupSwapSides() {
    if (readonly) return;
    const g = pattern.tieup;
    const w = g.width, h = g.height;
    const mutate = () => g.mirrorH(0, 0, w - 1, h - 1);
    const afterApply = _recalcFor("weave_recalc");
    if (!commandBus) { mutate(); afterApply(); return; }
    commandBus.execute(makeGridRegionCommand({
        grid: g, i1: 0, j1: 0, i2: w - 1, j2: h - 1,
        mutate, afterApply, label: "tieup swap sides",
    }));
}

// Cut / Copy / Paste — uses Selection + Clipboard modules from selection.js.
function selectionCopy() {
    if (typeof Selection === "undefined") return;
    Selection.copyToClipboard();
}

function selectionCut() {
    if (typeof Selection === "undefined") return;
    if (Selection.isEmpty()) return;
    Selection.copyToClipboard();
    selectionClear();
}

function _paste(transparent) {
    if (typeof Selection === "undefined") return;
    if (!Clipboard.has()) return;
    const sel = Selection.current();
    if (!sel) return;
    // Build a command that captures the destination region's before-state.
    const payload = Clipboard.get();
    const grid = cursor.selected_pattern;
    const i1 = sel.i1, j1 = sel.j1;
    let i2 = i1 + payload.w - 1;
    let j2 = j1 + payload.h - 1;
    // Clamp to grid bounds where applicable.
    if (grid && grid.width !== undefined) i2 = Math.min(i2, grid.width - 1);
    if (grid && grid.height !== undefined) j2 = Math.min(j2, grid.height - 1);
    const part = cursor.selected_part;
    if (!commandBus) {
        Selection.pasteFromClipboard(transparent);
        _afterPatternMutation(part);
        return;
    }
    if (part === "entering") {
        const snap = snapshotEntering(pattern.entering, i1, i2);
        commandBus.execute({
            label: transparent ? "paste-transparent" : "paste",
            apply() { Selection.pasteFromClipboard(transparent); _afterPatternMutation(part); },
            revert() { restoreEntering(pattern.entering, snap); _afterPatternMutation(part); },
        });
    } else if (grid && grid.get && grid.set) {
        const snap = snapshotGridRegion(grid, i1, j1, i2, j2);
        commandBus.execute({
            label: transparent ? "paste-transparent" : "paste",
            apply() { Selection.pasteFromClipboard(transparent); _afterPatternMutation(part); },
            revert() { restoreGridRegion(grid, snap); _afterPatternMutation(part); },
        });
    }
}
function selectionPaste() { _paste(false); }
function selectionPasteTransparent() { _paste(true); }

function update_layout_selector() {
    const layout = get_current_layout(settings);
    document.getElementById("current-layout").innerText = layout;
    document.getElementById(`layout-${layout}`).className = "current";
}


function update_color_selector(settings) {
    const elem = document.getElementById("current-color");
    if (elem) {
        elem.style.backgroundColor = colors[settings.current_color];
        elem.style.color = colors[settings.current_color];
    }
    if (typeof _paletteToolboxRefresh === "function" && settings && settings.display_palette) {
        _paletteToolboxRefresh();
    }
}


function update_range_selector(settings) {
    const currentLabel = document.getElementById("current-range");
    if (!currentLabel) return;
    for (let k = 1; k <= 12; k++) {
        const el = document.getElementById(`range${k}`);
        if (el) el.className = (k === settings.current_range) ? "current" : "";
    }
    const active = document.getElementById(`range${settings.current_range}`);
    if (active) currentLabel.innerText = active.innerText;
}


function update_view_options(settings) {
    document.getElementById("entering-visible").className = settings.display_entering ? "checked" : "";
    document.getElementById("treadling-visible").className = settings.display_treadling ? "checked" : "";
    document.getElementById("reed-visible").className = settings.display_reed ? "checked" : "";
    document.getElementById("colors-visible").className = settings.display_colors_warp || settings.display_colors_weft ? "checked" : "";
    document.getElementById("hlines-visible").className = settings.display_hlines ? "checked" : "";
}


// ---- Command-backed primitives for single-cell/thread edits ----
//
// Called from mouseUp and (later) keyboard-driven cell toggle. `recalc`:
//   "from_weave" -> recalc_from_weave(settings) after apply
//   "weave_recalc" -> recalc_weave() after apply
//   null -> no recalc
function _recalcFor(kind) {
    return () => {
        if (kind === "from_weave") pattern.recalc_from_weave(settings);
        else if (kind === "weave_recalc") pattern.recalc_weave();
        setModified();
        view.draw();
    };
}

function _applyEnteringChange(i, newShaft) {
    if (!commandBus) {
        pattern.entering.set_shaft(i, newShaft);
        pattern.recalc_weave();
        setModified();
        return;
    }
    commandBus.execute(makeEnteringCommand({
        entering: pattern.entering, i, newShaft,
        afterApply: _recalcFor("weave_recalc"),
        label: "set shaft",
    }));
}

function _applyGridToggle(grid, i, j, defaultValue, recalcKind) {
    const current = grid.get(i, j);
    // Toggling an "off" cell (zero or stored-as-negative) always uses
    // the *currently active* range, not the value the cell previously
    // held. Matches desktop SetGewebe / SetEintrag behaviour: switching
    // bereich and re-toggling stamps the new bereich.
    const newValue = current > 0 ? -current : defaultValue;
    // Weave edits inside an active rapport replicate the new value across
    // every rapport copy within the pattern extent — matches desktop
    // SetGewebe's rapport-propagation branch. Single undoable command.
    if (grid === pattern.weave
        && settings && settings.display_repeat
        && _isInRapport(i, j)
        && _rapportValid()) {
        _applyWeaveCellWithRapport(i, j, newValue, recalcKind);
        return;
    }
    _applyCellSet(grid, i, j, newValue, recalcKind);
}

function _rapportValid() {
    return pattern.rapport_k_b >= pattern.rapport_k_a
        && pattern.rapport_s_b >= pattern.rapport_s_a;
}

function _isInRapport(i, j) {
    return i >= pattern.rapport_k_a && i <= pattern.rapport_k_b
        && j >= pattern.rapport_s_a && j <= pattern.rapport_s_b;
}

// Collect all (i, j) inside the active extent that are rapport copies of
// the given seed cell, mutate them together, and wrap in one command.
function _applyWeaveCellWithRapport(seedI, seedJ, newValue, recalcKind) {
    const rw = pattern.rapport_k_b - pattern.rapport_k_a + 1;
    const rh = pattern.rapport_s_b - pattern.rapport_s_a + 1;
    const ka = pattern.rapport_k_a, kb_extent = pattern.max_x;
    const sa = pattern.rapport_s_a, sb_extent = pattern.max_y;
    const dx = ((seedI - ka) % rw + rw) % rw;
    const dy = ((seedJ - sa) % rh + rh) % rh;
    // Compute the set of all target cells and the bounding box for
    // snapshotting. Iterate the entire extent, not just the rapport span,
    // because the pattern is "rapportiert" (repeated) beyond it.
    const extentLoI = Math.max(pattern.min_x, 0);
    const extentHiI = Math.min(kb_extent, pattern.weave.width - 1);
    const extentLoJ = Math.max(pattern.min_y, 0);
    const extentHiJ = Math.min(sb_extent, pattern.weave.height - 1);
    const targets = [];
    let lo_i = Infinity, hi_i = -Infinity, lo_j = Infinity, hi_j = -Infinity;
    for (let i = extentLoI; i <= extentHiI; i++) {
        if (((i - ka) % rw + rw) % rw !== dx) continue;
        for (let j = extentLoJ; j <= extentHiJ; j++) {
            if (((j - sa) % rh + rh) % rh !== dy) continue;
            targets.push([i, j]);
            if (i < lo_i) lo_i = i;
            if (i > hi_i) hi_i = i;
            if (j < lo_j) lo_j = j;
            if (j > hi_j) hi_j = j;
        }
    }
    if (targets.length === 0) {
        _applyCellSet(pattern.weave, seedI, seedJ, newValue, recalcKind);
        return;
    }
    const grid = pattern.weave;
    const afterApply = _recalcFor(recalcKind);
    const mutate = () => {
        for (const [ii, jj] of targets) grid.set(ii, jj, newValue);
    };
    if (!commandBus) { mutate(); afterApply(); return; }
    commandBus.execute(makeGridRegionCommand({
        grid, i1: lo_i, j1: lo_j, i2: hi_i, j2: hi_j,
        mutate, afterApply, label: "rapport edit",
    }));
}

function _applyCellSet(grid, i, j, newValue, recalcKind) {
    if (!commandBus) {
        grid.set(i, j, newValue);
        if (recalcKind === "from_weave") pattern.recalc_from_weave(settings);
        else if (recalcKind === "weave_recalc") pattern.recalc_weave();
        setModified();
        return;
    }
    commandBus.execute(makeCellCommand({
        grid, i, j, newValue,
        afterApply: _recalcFor(recalcKind),
        label: "set cell",
    }));
}

// Treadling single-mode: clear row, then optionally set the clicked cell.
// Captured as one command spanning the whole row.
function _applyTreadlingSingle(i, j) {
    const grid = pattern.treadling;
    const wasSet = grid.get(i, j) > 0;
    if (!commandBus) {
        grid.clearRow(j);
        if (!wasSet) grid.set(i, j, 1);
        pattern.recalc_weave(); setModified();
        return;
    }
    const w = grid.width;
    const snap = snapshotGridRegion(grid, 0, j, w - 1, j);
    const after = _recalcFor("weave_recalc");
    commandBus.execute({
        label: "treadle row",
        apply() {
            grid.clearRow(j);
            if (!wasSet) grid.set(i, j, 1);
            after();
        },
        revert() { restoreGridRegion(grid, snap); after(); },
    });
}


// ---- Structural operations (insert/remove/move shaft/treadle/warp/weft) ----
//
// Grid dimensions (width/height/max_shafts/max_treadles) are fixed at pattern
// load time, so structural ops shift values in place: insertions push the
// last row/column off the end; deletions leave an empty row/column at the far
// end. Each op is wrapped in a full-pattern snapshot command for clean undo.

function _fullPatternSnapshot() {
    return {
        entering:   pattern.entering.data.slice(),
        weave:      pattern.weave.data.slice(),
        treadling:  pattern.treadling.data.slice(),
        tieup:      pattern.tieup.data.slice(),
        pegplan:    pattern.pegplan.data.slice(),
        color_warp: pattern.color_warp.data.slice(),
        color_weft: pattern.color_weft.data.slice(),
        reed:       pattern.reed.data.slice(),
        fixeinzug:  pattern.fixeinzug.slice(),
        fixsize:    pattern.fixsize,
        firstfree:  pattern.firstfree,
        min_x: pattern.min_x, max_x: pattern.max_x,
        min_y: pattern.min_y, max_y: pattern.max_y,
    };
}
function _restoreFullPatternSnapshot(s) {
    pattern.entering.data   = s.entering.slice();
    pattern.weave.data      = s.weave.slice();
    pattern.treadling.data  = s.treadling.slice();
    pattern.tieup.data      = s.tieup.slice();
    pattern.pegplan.data    = s.pegplan.slice();
    pattern.color_warp.data = s.color_warp.slice();
    pattern.color_weft.data = s.color_weft.slice();
    pattern.reed.data       = s.reed.slice();
    if (s.fixeinzug) pattern.fixeinzug = s.fixeinzug.slice();
    if (typeof s.fixsize === "number") pattern.fixsize = s.fixsize;
    if (typeof s.firstfree === "number") pattern.firstfree = s.firstfree;
    pattern.min_x = s.min_x; pattern.max_x = s.max_x;
    pattern.min_y = s.min_y; pattern.max_y = s.max_y;
}

// Wrap a mutation that changes pattern structure as one undoable command.
function _structuralCommand(label, mutate) {
    const before = _fullPatternSnapshot();
    mutate();
    pattern.recalc_weave();
    const after = _fullPatternSnapshot();
    _restoreFullPatternSnapshot(before);
    const finalize = () => { setModified(); view.draw(); };
    const cmd = {
        label,
        apply()  { _restoreFullPatternSnapshot(after);  finalize(); },
        revert() { _restoreFullPatternSnapshot(before); finalize(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else { cmd.apply(); }
}


// Shafts (rows of tieup; columns of pegplan; shaft index is 1-based in
// the Entering array).
function _insertShaftAt(at) {
    pattern.tieup.insertRow(at);
    pattern.pegplan.insertCol(at);
    // Entering: any shaft number >= at+1 shifts up; dropped if > max_shafts.
    const maxShaft = pattern.tieup.height;
    for (let i = 0; i < pattern.entering.width; i++) {
        const s = pattern.entering.get_shaft(i);
        if (s >= at + 1) {
            const ns = s + 1;
            pattern.entering.set_shaft(i, ns > maxShaft ? 0 : ns);
        }
    }
}
function _removeShaftAt(at) {
    pattern.tieup.removeRow(at);
    pattern.pegplan.removeCol(at);
    for (let i = 0; i < pattern.entering.width; i++) {
        const s = pattern.entering.get_shaft(i);
        if (s === at + 1) pattern.entering.set_shaft(i, 0);
        else if (s > at + 1) pattern.entering.set_shaft(i, s - 1);
    }
}
function _swapShafts(a, b) {
    if (a === b) return;
    pattern.tieup.swapRows(a, b);
    pattern.pegplan.swapCols(a, b);
    for (let i = 0; i < pattern.entering.width; i++) {
        const s = pattern.entering.get_shaft(i);
        if (s === a + 1) pattern.entering.set_shaft(i, b + 1);
        else if (s === b + 1) pattern.entering.set_shaft(i, a + 1);
    }
}

// Treadles (cols of tieup + treadling).
function _insertTreadleAt(at) {
    pattern.tieup.insertCol(at);
    pattern.treadling.insertCol(at);
}
function _removeTreadleAt(at) {
    pattern.tieup.removeCol(at);
    pattern.treadling.removeCol(at);
}
function _swapTreadles(a, b) {
    if (a === b) return;
    pattern.tieup.swapCols(a, b);
    pattern.treadling.swapCols(a, b);
}

// Warp threads (i dim of weave, entering, color_warp, reed).
function _insertWarpAt(at) {
    pattern.weave.insertCol(at);
    pattern.color_warp.insertCol(at);
    pattern.reed.insertCol(at);
    pattern.entering.insertAt(at);
}
function _removeWarpAt(at) {
    pattern.weave.removeCol(at);
    pattern.color_warp.removeCol(at);
    pattern.reed.removeCol(at);
    pattern.entering.removeAt(at);
}

// Weft threads (j dim of weave, treadling, pegplan, color_weft).
function _insertWeftAt(at) {
    pattern.weave.insertRow(at);
    pattern.treadling.insertRow(at);
    pattern.pegplan.insertRow(at);
    pattern.color_weft.insertRow(at);
}
function _removeWeftAt(at) {
    pattern.weave.removeRow(at);
    pattern.treadling.removeRow(at);
    pattern.pegplan.removeRow(at);
    pattern.color_weft.removeRow(at);
}


// Opens the Rapportieren (F8) dialog to choose horizontal/vertical repeat
// counts, "repeat all", and "repeat colors", then applies the replication
// wrapped in a single undoable command.
function showRapportDialog() {
    if (readonly) return;
    pattern.recalc_weave_extent();
    pattern.calcRapport();
    const kx = pattern.max_x - pattern.min_x + 1;
    const rx = pattern.rapport_k_b - pattern.rapport_k_a + 1;
    const ky = pattern.max_y - pattern.min_y + 1;
    const ry = pattern.rapport_s_b - pattern.rapport_s_a + 1;
    const defHorz = (kx > 0 && rx > 0) ? Math.max(1, Math.floor(kx / rx)) : 1;
    const defVert = (ky > 0 && ry > 0) ? Math.max(1, Math.floor(ky / ry)) : 1;

    const i18n = _getI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    const body = document.createElement("div");
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto auto;gap:0.5rem 1rem;align-items:center">
          <label for="tx-rap-horz">${L("rapportieren.horz", "Horizontal repeats")}</label>
          <input id="tx-rap-horz" type="number" min="1" step="1" value="${defHorz}" style="width:6rem">
          <label for="tx-rap-vert">${L("rapportieren.vert", "Vertical repeats")}</label>
          <input id="tx-rap-vert" type="number" min="1" step="1" value="${defVert}" style="width:6rem">
          <label><input id="tx-rap-all" type="checkbox"> ${L("rapportieren.all", "Repeat to pattern bounds")}</label><span></span>
          <label><input id="tx-rap-colors" type="checkbox"> ${L("rapportieren.colors", "Repeat colours too")}</label><span></span>
        </div>`;
    let modal;
    const apply = () => {
        const all = body.querySelector("#tx-rap-all").checked;
        const colors = body.querySelector("#tx-rap-colors").checked;
        let hx = parseInt(body.querySelector("#tx-rap-horz").value, 10);
        let vy = parseInt(body.querySelector("#tx-rap-vert").value, 10);
        if (!isFinite(hx) || hx < 1) hx = 1;
        if (!isFinite(vy) || vy < 1) vy = 1;
        if (all) { hx = -1; vy = -1; }
        _applyRapportExtend(hx, vy, colors);
        modal.close();
    };
    // Pre-check "repeat all" disables the numeric inputs for clarity.
    body.addEventListener("change", (e) => {
        if (e.target.id === "tx-rap-all") {
            const all = e.target.checked;
            body.querySelector("#tx-rap-horz").disabled = all;
            body.querySelector("#tx-rap-vert").disabled = all;
        }
    });
    modal = Modal.open({
        title: L("repeat.dialog-title", "Repeat"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok", "OK"), role: "primary", onClick: () => apply() },
        ],
    });
}

// Execute the rapport replication as a single undoable command.
function _applyRapportExtend(hx, vy, withColors) {
    const before = _fullPatternSnapshot();
    _rapportKette(hx === 0 ? 1 : hx, withColors);
    _rapportSchuss(vy === 0 ? 1 : vy, withColors);
    pattern.calcRapport();
    const after = _fullPatternSnapshot();
    _restoreFullPatternSnapshot(before);
    const finalize = () => { setModified(); view.draw(); };
    const cmd = {
        label: "rapportieren",
        apply()  { _restoreFullPatternSnapshot(after);  finalize(); },
        revert() { _restoreFullPatternSnapshot(before); finalize(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else cmd.apply();
}

function _applyRapportReduce() {
    _applyRapportExtend(1, 1, false);
}


// Overview (F4) — opens a fullscreen modal that renders ONLY the weave
// (no entering / tieup / treadling / colour strips) at the main editor's
// cell size. The absence of side panes lets the user see a larger portion
// of the pattern at the same zoom. No rapport markers — pure gewebe.
// Pressing F4 again while the overview is open closes it.
let _overviewModal = null;
function showOverviewWindow() {
    if (_overviewModal) {
        // Toggle: second F4 closes the existing overview.
        _overviewModal.close();
        _overviewModal = null;
        return;
    }
    if (!pattern || !view) return;
    const body = document.createElement("div");
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.height = "100%";
    body.style.width = "100%";
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.background = settings.darcula ? "#333" : "#fff";
    canvas.style.flex = "1 1 auto";
    canvas.style.minHeight = "0";
    body.appendChild(canvas);

    function render() {
        const w = pattern.weave.width;
        const h = pattern.weave.height;
        const cw = canvas.clientWidth || canvas.width;
        const ch = canvas.clientHeight || canvas.height;
        canvas.width = cw;
        canvas.height = ch;
        const ctx2 = canvas.getContext("2d");
        ctx2.fillStyle = settings.darcula ? "#333" : "#fff";
        ctx2.fillRect(0, 0, cw, ch);

        // Match main editor cell size exactly — no rescaling.
        const gw = Math.max(1, settings.dx);
        const gh = Math.max(1, settings.dy);
        const mx = Math.min(Math.floor(cw / gw), w);
        const my = Math.min(Math.floor(ch / gh), h);
        const rtl = !!settings.direction_righttoleft;
        // The main weave pane always renders bottom-up (toptobottom=false
        // in PatternView.layout). Mirror that convention.
        // Match the active display style: "color" or "simulation" → render
        // as farbeffekt (warp/weft colours fill the whole cell); anything
        // else → draft mode (range colour on bg, inset).
        const farbeffekt = settings.style === "color" || settings.style === "simulation";
        const emptyMode = settings.style === "empty" || settings.style === "invisible";
        if (emptyMode) return;
        const bx = Math.floor(gw * settings.bxf);
        const by = Math.floor(gh * settings.byf);

        // In farbeffekt/simulation, empty/unused cells would otherwise be
        // painted solid weft colour and fill the canvas. Restrict that
        // render to the active pattern extent so it only covers the
        // "actually used" region. Draft mode already skips empty cells.
        const iLo = farbeffekt ? Math.max(0, pattern.min_x) : 0;
        const iHi = farbeffekt ? Math.min(mx - 1, pattern.max_x) : mx - 1;
        const jLo = farbeffekt ? Math.max(0, pattern.min_y) : 0;
        const jHi = farbeffekt ? Math.min(my - 1, pattern.max_y) : my - 1;

        for (let j = jLo; j <= jHi; j++) {
            for (let i = iLo; i <= iHi; i++) {
                const v = pattern.weave.get(i, j);
                const woven = v > 0 && v !== 12;
                const x = rtl ? (cw - (i + 1) * gw) : (i * gw);
                const y = my * gh - (j + 1) * gh;
                if (farbeffekt) {
                    // Warp colour when the cell is woven ("up"), weft
                    // colour otherwise — port of DrawGewebeFarbeffekt.
                    const colorIdx = woven
                        ? pattern.color_warp.get(i, 0)
                        : pattern.color_weft.get(0, j);
                    const col = colors[colorIdx];
                    if (col) {
                        ctx2.fillStyle = col;
                        ctx2.fillRect(x, y, gw, gh);
                    }
                } else {
                    // Draft ("patrone"): range colour with inset.
                    if (v <= 0) continue;
                    ctx2.fillStyle = getRangeColor(settings, v);
                    ctx2.fillRect(x + bx, y + by, gw - 2 * bx, gh - 2 * by);
                }
            }
        }
    }

    const m = Modal.open({
        title: "Overview",
        className: "tx-modal-fill",
        body,
        buttons: [{ label: "Close", role: "cancel" }],
        onClose: () => {
            window.removeEventListener("resize", onResize);
            _overviewModal = null;
        },
    });
    _overviewModal = m;
    setTimeout(render, 0);
    const onResize = () => render();
    window.addEventListener("resize", onResize);
}


// ---- Phase 8a helpers: Threading / Treadling small ops --------------
//
// Direct ports of desktop bereiche.cpp / utilities.cpp / insertbindung.cpp
// helpers. All wrapped in full-snapshot commands for atomic undo.

function _isFreeSchaft(j) {
    // True iff no warp is threaded to shaft j+1 (1-based).
    for (let i = 0; i < pattern.entering.width; i++) {
        if (pattern.entering.get_shaft(i) === j + 1) return false;
    }
    return true;
}

function _isFreeTritt(i) {
    // True iff treadle column i has no positive cell.
    for (let j = 0; j < pattern.treadling.height; j++) {
        if (pattern.treadling.get(i, j) > 0) return false;
    }
    return true;
}

function _isEmptyTrittfolge(j) {
    // True iff weft row j has no treadle/pegplan column set.
    const grid = settings.display_pegplan ? pattern.pegplan : pattern.treadling;
    for (let i = 0; i < grid.width; i++) {
        if (grid.get(i, j) > 0) return false;
    }
    return true;
}

// Snapshot+command helper for full-pattern multi-grid mutations. The
// mutate callback is responsible for any recalc needed; the helper just
// snapshots before and after and pushes one apply/revert pair.
function _fullSnapCommand(label, mutate) {
    if (readonly) return;
    const before = _fullPatternSnapshot();
    mutate();
    pattern.calcRapport();
    const after = _fullPatternSnapshot();
    _restoreFullPatternSnapshot(before);
    const finalize = () => { setModified(); view.draw(); };
    const cmd = {
        label,
        apply()  { _restoreFullPatternSnapshot(after);  finalize(); },
        revert() { _restoreFullPatternSnapshot(before); finalize(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else cmd.apply();
}


// ---- Switch side (F11) — port of utilities.cpp::SwapSide ------------
function _swapSide() {
    _fullSnapCommand("switch side", () => {
        const cr = settings.current_range;
        if (settings.display_pegplan) {
            // Invert pegplan over its bounding rectangle of currently
            // used cells. The rectangle is computed ONCE up front so the
            // iteration isn't influenced by mutations (the desktop's
            // per-row IsEmptyTrittfolge check loses cells whose row goes
            // empty mid-loop and breaks F11→F11 round-trips).
            const s1 = _pegplanFirstUsedShaft();
            const s2 = _pegplanLastUsedShaft();
            const j1 = _pegplanFirstUsedWeft();
            const j2 = _pegplanLastUsedWeft();
            if (s2 >= s1 && j2 >= j1) {
                for (let j = j1; j <= j2; j++) {
                    for (let s = s1; s <= s2; s++) {
                        const v = pattern.pegplan.get(s, j);
                        pattern.pegplan.set(s, j, v === 0 ? cr : -v);
                    }
                }
            }
        } else {
            // Invert tieup over every (used treadle, used shaft) cell.
            for (let i = 0; i < pattern.tieup.width; i++) {
                if (_isFreeTritt(i)) continue;
                for (let j = 0; j < pattern.tieup.height; j++) {
                    if (_isFreeSchaft(j)) continue;
                    const v = pattern.tieup.get(i, j);
                    pattern.tieup.set(i, j, v === 0 ? cr : -v);
                }
            }
        }
        // Mirror the warp side: entering, color_warp, reed swap around
        // the kette centre.
        if (pattern.min_x <= pattern.max_x) {
            const mid = Math.floor((pattern.max_x - pattern.min_x + 1) / 2);
            for (let i = pattern.min_x; i < pattern.min_x + mid; i++) {
                const mirror = pattern.max_x - (i - pattern.min_x);
                const e = pattern.entering.get_shaft(i);
                pattern.entering.set_shaft(i, pattern.entering.get_shaft(mirror));
                pattern.entering.set_shaft(mirror, e);
                const cw = pattern.color_warp.get(i, 0);
                pattern.color_warp.set(i, 0, pattern.color_warp.get(mirror, 0));
                pattern.color_warp.set(mirror, 0, cw);
                const r = pattern.reed.get(i, 0);
                pattern.reed.set(i, 0, pattern.reed.get(mirror, 0));
                pattern.reed.set(mirror, 0, r);
            }
        }
        pattern.recalc_weave();
    });
}


// ---- Twill completion (Ctrl+K) — port of utilities.cpp::FillKoeper -
// Operates on the current selection in the weave pane: if the selection
// is a single-column or single-row strip with at least one set cell,
// extend it diagonally as a twill, advancing right (vertical seed) or
// upward (horizontal seed).
function _fillKoeper() {
    if (readonly) return;
    if (cursor.selected_part !== "weave") return;
    const i1 = Math.min(cursor.x1, cursor.x2);
    const i2 = Math.max(cursor.x1, cursor.x2);
    const j1 = Math.min(cursor.y1, cursor.y2);
    const j2 = Math.max(cursor.y1, cursor.y2);
    const cr = settings.current_range;
    _fullSnapCommand("twill completion", () => {
        if (i1 === i2) {
            // Vertical seed → extend right.
            const dy = j2 - j1;
            if (dy <= 0) return;
            const iStart = i1;
            let iEnd = iStart + dy;
            // Stop early if any column in [iStart+1..iEnd] already has a
            // set cell within [j1..j2].
            let i = iStart + 1;
            for (; i <= iEnd && i < pattern.weave.width; i++) {
                let blocked = false;
                for (let j = j1; j <= j2; j++) {
                    if (pattern.weave.get(i, j) > 0) { blocked = true; break; }
                }
                if (blocked) break;
            }
            iEnd = i - 1;
            for (let ii = iStart + 1; ii <= iEnd; ii++) {
                for (let j = j1; j <= j1 + dy; j++) {
                    let jj = j - j1 - (ii - iStart);
                    while (jj < 0) jj += dy + 1;
                    while (jj > dy) jj -= dy + 1;
                    if (pattern.weave.get(iStart, j1 + jj) > 0) {
                        pattern.weave.set(ii, j, cr);
                    }
                }
            }
            // Select the resulting twill block (matches desktop, which
            // updates selection.end.i to iEnd).
            cursor.x1 = iStart; cursor.y1 = j1;
            cursor.x2 = Math.min(iEnd, pattern.weave.width - 1);
            cursor.y2 = j2;
        } else if (j1 === j2) {
            // Horizontal seed → extend upward.
            const dx = i2 - i1;
            if (dx <= 0) return;
            const jStart = j1;
            let jEnd = jStart + dx;
            let j = jStart + 1;
            for (; j <= jEnd && j < pattern.weave.height; j++) {
                let blocked = false;
                for (let i = i1; i <= i2; i++) {
                    if (pattern.weave.get(i, j) > 0) { blocked = true; break; }
                }
                if (blocked) break;
            }
            jEnd = j - 1;
            for (let jj = jStart + 1; jj <= jEnd; jj++) {
                for (let i = i1; i <= i1 + dx; i++) {
                    let ii = i - i1 - (jj - jStart);
                    while (ii < 0) ii += dx + 1;
                    while (ii > dx) ii -= dx + 1;
                    if (pattern.weave.get(i1 + ii, jStart) > 0) {
                        pattern.weave.set(i, jj, cr);
                    }
                }
            }
            cursor.x1 = i1; cursor.y1 = jStart;
            cursor.x2 = i2;
            cursor.y2 = Math.min(jEnd, pattern.weave.height - 1);
        }
        pattern.recalc_from_weave(settings);
    });
}


// ---- Threading: Mirror all — port of bereiche.cpp::EzSpiegelnClick --
function _ezMirrorAll() {
    _fullSnapCommand("mirror threading", () => {
        if (pattern.min_x > pattern.max_x) return;
        const a = pattern.min_x, b = pattern.max_x;
        const mid = Math.floor((b - a) / 2);
        for (let i = a; i <= a + mid; i++) {
            const mirror = b - (i - a);
            if (i >= mirror) break;
            const e = pattern.entering.get_shaft(i);
            pattern.entering.set_shaft(i, pattern.entering.get_shaft(mirror));
            pattern.entering.set_shaft(mirror, e);
            for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                const g = pattern.weave.get(i, j);
                pattern.weave.set(i, j, pattern.weave.get(mirror, j));
                pattern.weave.set(mirror, j, g);
            }
        }
    });
}


// ---- Threading: Delete — clear einzug + weave warp columns ---------
function _ezClear() {
    _fullSnapCommand("clear threading", () => {
        for (let i = 0; i < pattern.entering.width; i++) {
            pattern.entering.set_shaft(i, 0);
        }
        pattern.weave.data.fill(0);
        pattern.recalc_weave_extent();
    });
}


// ---- Treadling: Mirror — port of bereiche.cpp::TfSpiegelnClick ------
function _tfMirrorAll() {
    _fullSnapCommand("mirror treadling", () => {
        if (pattern.min_y > pattern.max_y) return;
        const a = pattern.min_y, b = pattern.max_y;
        const mid = Math.floor((b - a) / 2);
        const grid = settings.display_pegplan ? pattern.pegplan : pattern.treadling;
        for (let j = a; j <= a + mid; j++) {
            const mirror = b - (j - a);
            if (j >= mirror) break;
            for (let i = 0; i < grid.width; i++) {
                const t = grid.get(i, j);
                grid.set(i, j, grid.get(i, mirror));
                grid.set(i, mirror, t);
            }
            for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                const g = pattern.weave.get(i, j);
                pattern.weave.set(i, j, pattern.weave.get(i, mirror));
                pattern.weave.set(i, mirror, g);
            }
        }
    });
}


// ---- Treadling: Delete — port of bereiche.cpp::ClearTrittfolgeClick -
function _tfClear() {
    _fullSnapCommand("clear treadling", () => {
        const grid = settings.display_pegplan ? pattern.pegplan : pattern.treadling;
        grid.data.fill(0);
        pattern.weave.data.fill(0);
        pattern.recalc_weave_extent();
    });
}


// ---- Threading: Copy from treadling --------------------------------
//      Port of bereiche.cpp::CopyEinzugTrittfolgeClick.
function _ezCopyFromTf() {
    _fullSnapCommand("copy threading from treadling", () => {
        for (let i = 0; i < pattern.entering.width; i++) {
            pattern.entering.set_shaft(i, 0);
        }
        const maxi = Math.min(pattern.treadling.height, pattern.entering.width);
        for (let i = 0; i < maxi; i++) {
            let schaft = 0;
            for (let ii = 0; ii < pattern.treadling.width; ii++) {
                if (pattern.treadling.get(ii, i) > 0) { schaft = ii + 1; break; }
            }
            pattern.entering.set_shaft(i, schaft);
        }
        pattern.recalc_weave();
    });
}


// ---- Treadling: Copy from threading --------------------------------
//      Port of bereiche.cpp::CopyTrittfolgeEinzugClick.
function _tfCopyFromEz() {
    _fullSnapCommand("copy treadling from threading", () => {
        pattern.treadling.data.fill(0);
        const maxj = Math.min(pattern.treadling.height, pattern.entering.width);
        for (let j = 0; j < maxj; j++) {
            const schaft = pattern.entering.get_shaft(j);
            if (schaft > 0 && schaft - 1 < pattern.treadling.width) {
                pattern.treadling.set(schaft - 1, j, 1);
            }
        }
        pattern.recalc_weave();
    });
}


// ---- Phase 8f: User-defined patterns ("Additional" menu) ------------
//
// Direct port of userdef.cpp. 10 slots persisted in localStorage as
// (description, sizex, sizey, data). Data is the desktop's k-alphabet
// (cell value s → char(s + 'k') so 'k' = empty, 'l' = range 1, …).

const USERDEF_KEY = "tx_dbweave_userdef_v1";
const USERDEF_K_CHAR = 107; // 'k'

function _userdefList() {
    try {
        const raw = localStorage.getItem(USERDEF_KEY);
        if (!raw) return new Array(10).fill(null);
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Array(10).fill(null);
        const out = [];
        for (let i = 0; i < 10; i++) {
            const s = parsed[i];
            out.push((s && s.data && s.sizex && s.sizey)
                ? { description: s.description || "", sizex: s.sizex|0, sizey: s.sizey|0, data: s.data }
                : null);
        }
        return out;
    } catch (e) { return new Array(10).fill(null); }
}
function _userdefSaveAll(slots) {
    try { localStorage.setItem(USERDEF_KEY, JSON.stringify(slots)); }
    catch (e) { console.error("userdef save failed", e); }
}
function _userdefSetSlot(idx, slot) {
    const slots = _userdefList();
    slots[idx] = slot;
    _userdefSaveAll(slots);
    _refreshUserdefMenuLabels();
}
function _userdefRemoveSlot(idx) { _userdefSetSlot(idx, null); }

// k-alphabet encode/decode of a weave rectangle.
function _userdefEncodeRect(i1, i2, j1, j2) {
    let out = "";
    for (let i = i1; i <= i2; i++) {
        for (let j = j1; j <= j2; j++) {
            const s = pattern.weave.get(i, j);
            const c = s > 0 ? (USERDEF_K_CHAR + s) : USERDEF_K_CHAR;
            out += String.fromCharCode(c);
        }
    }
    return out;
}

// Stamp slot[idx] at the cursor. Transparent skips empty cells.
function _insertUserdef(idx, transparent) {
    if (readonly) return;
    if (cursor.selected_part !== "weave") return;
    const slot = _userdefList()[idx];
    if (!slot || !slot.data) return;
    if (slot.data.length < slot.sizex * slot.sizey) return;
    _fullSnapCommand("insert userdef", () => {
        const x = cursor.x1, y = cursor.y1;
        let xx = x + slot.sizex; let yy = y + slot.sizey;
        if (xx > pattern.weave.width)  xx = pattern.weave.width;
        if (yy > pattern.weave.height) yy = pattern.weave.height;
        for (let i = x; i < xx; i++) {
            for (let j = y; j < yy; j++) {
                const idx2 = (i - x) * slot.sizey + (j - y);
                if (idx2 >= slot.data.length) continue;
                const code = slot.data.charCodeAt(idx2);
                const s = code - USERDEF_K_CHAR;
                if (s !== 0) {
                    pattern.weave.set(i, j, s);
                } else if (!transparent) {
                    pattern.weave.set(i, j, 0);
                }
            }
        }
        // Selection covers the inserted block.
        cursor.x1 = x; cursor.y1 = y;
        cursor.x2 = Math.max(x, xx - 1);
        cursor.y2 = Math.max(y, yy - 1);
        pattern.recalc_from_weave(settings);
    });
}

// Slot-picker dialog. opts: { title, mode = "select" | "remove", onSelect(idx) }
function _showUserdefSelectDialog(title, onSelect) {
    const slots = _userdefList();
    const i18n = _getI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    const body = document.createElement("div");
    body.style.display = "grid";
    body.style.gridTemplateColumns = "auto auto auto";
    body.style.gap = "0.4rem 1rem";
    body.style.alignItems = "center";
    let firstUsed = -1;
    for (let i = 0; i < 10; i++) {
        const slot = slots[i];
        const used = !!(slot && slot.data);
        if (used && firstUsed === -1) firstUsed = i;
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "tx-userdef-slot";
        radio.value = String(i);
        radio.id = "tx-userdef-r" + i;
        const label = document.createElement("label");
        label.htmlFor = radio.id;
        label.textContent = used
            ? (slot.description || (L("userdef.pattern", "Pattern") + " " + (i + 1)))
            : (L("userdef.empty", "Empty"));
        if (!used) label.style.color = "#999";
        const dim = document.createElement("span");
        dim.style.fontSize = "12px";
        dim.style.opacity = "0.7";
        dim.textContent = used ? `${slot.sizex}×${slot.sizey}` : "";
        body.appendChild(radio);
        body.appendChild(label);
        body.appendChild(dim);
    }
    if (firstUsed >= 0) {
        body.querySelector(`#tx-userdef-r${firstUsed}`).checked = true;
    } else {
        // No used slots — first slot defaults checked anyway so the
        // "Add pattern" use case still works.
        body.querySelector(`#tx-userdef-r0`).checked = true;
    }
    let modal;
    const apply = () => {
        const sel = body.querySelector("input[name='tx-userdef-slot']:checked");
        if (!sel) return;
        const idx = parseInt(sel.value, 10);
        modal.close();
        onSelect(idx);
    };
    modal = Modal.open({
        title,
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok", "OK"), role: "primary", onClick: () => apply() },
        ],
    });
}

// Description dialog. seed = initial value. Returns name via callback,
// or null on cancel / empty.
function _showUserdefNameDialog(seed, onAccept) {
    const i18n = _getI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    const body = document.createElement("div");
    body.innerHTML = `
        <div style="margin-bottom:0.4rem">${L("userdef.prompt-name", "Pattern name:")}</div>
        <input id="tx-ud-name" type="text" value="${(seed || "").replace(/"/g, "&quot;")}" style="width:100%;box-sizing:border-box">`;
    const input = body.querySelector("#tx-ud-name");
    let modal;
    const apply = () => {
        const v = (input.value || "").trim();
        if (!v) return;
        modal.close();
        onAccept(v);
    };
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); apply(); }
    });
    modal = Modal.open({
        title: L("userdef.name-title", "Pattern description"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok", "OK"), role: "primary", onClick: () => apply() },
        ],
    });
    setTimeout(() => { input.focus(); input.select(); }, 0);
}

// "Add current pattern" — use min_x..max_x × min_y..max_y rect.
function _userdefAddCurrent() {
    if (pattern.min_x > pattern.max_x || pattern.min_y > pattern.max_y) return;
    const w = pattern.max_x - pattern.min_x + 1;
    const h = pattern.max_y - pattern.min_y + 1;
    if (w > 50 || h > 50) {
        const i18n = _getI18n();
        const msg = (i18n.actions["userdef.too-large"] && i18n.actions["userdef.too-large"].label)
            || "Pattern too large to save (maximum 50 × 50).";
        Modal.open({
            title: "DB-WEAVE", body: msg,
            buttons: [{ label: "OK", role: "primary" }],
        });
        return;
    }
    const i18n = _getI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    _showUserdefSelectDialog(L("userdef.select-slot", "Select pattern slot"), (idx) => {
        const seed = (_userdefList()[idx] && _userdefList()[idx].description)
            || (L("userdef.pattern", "Pattern") + " " + (idx + 1));
        _showUserdefNameDialog(seed, (descr) => {
            _userdefSetSlot(idx, {
                description: descr,
                sizex: w, sizey: h,
                data: _userdefEncodeRect(pattern.min_x, pattern.max_x,
                                         pattern.min_y, pattern.max_y),
            });
        });
    });
}

// "Add selection" — current weave selection rect.
function _userdefAddSelection() {
    if (cursor.selected_part !== "weave") return;
    const i1 = Math.min(cursor.x1, cursor.x2);
    const i2 = Math.max(cursor.x1, cursor.x2);
    const j1 = Math.min(cursor.y1, cursor.y2);
    const j2 = Math.max(cursor.y1, cursor.y2);
    if (i1 === i2 && j1 === j2) return;
    const w = i2 - i1 + 1, h = j2 - j1 + 1;
    if (w > 50 || h > 50) {
        const i18n = _getI18n();
        const msg = (i18n.actions["userdef.too-large"] && i18n.actions["userdef.too-large"].label)
            || "Pattern too large to save (maximum 50 × 50).";
        Modal.open({
            title: "DB-WEAVE", body: msg,
            buttons: [{ label: "OK", role: "primary" }],
        });
        return;
    }
    const i18n = _getI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    _showUserdefSelectDialog(L("userdef.select-slot", "Select pattern slot"), (idx) => {
        const seed = (_userdefList()[idx] && _userdefList()[idx].description)
            || (L("userdef.pattern", "Pattern") + " " + (idx + 1));
        _showUserdefNameDialog(seed, (descr) => {
            _userdefSetSlot(idx, {
                description: descr,
                sizex: w, sizey: h,
                data: _userdefEncodeRect(i1, i2, j1, j2),
            });
        });
    });
}

function _userdefRemoveClick() {
    const i18n = _getI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    _showUserdefSelectDialog(L("userdef.select-remove", "Select pattern to delete"), (idx) => {
        _userdefRemoveSlot(idx);
    });
}

// Walk the menubar DOM and update userdef.N items: visibility +
// label text (slot description). Also toggles the Additional top-level
// visibility based on whether any slot is used.
function _refreshUserdefMenuLabels() {
    const slots = _userdefList();
    const menubar = document.getElementById("tx-menubar");
    if (!menubar) return;
    let anyUsed = false;
    for (let i = 0; i < 10; i++) {
        const item = menubar.querySelector(`.tx-menu-item[data-action="userdef.${i}"]`);
        if (!item) continue;
        const slot = slots[i];
        const used = !!(slot && slot.data);
        item.style.display = used ? "" : "none";
        if (used) {
            anyUsed = true;
            const lbl = item.querySelector(".tx-menu-label");
            if (lbl) lbl.textContent = slot.description || ("Pattern " + (i + 1));
        }
    }
    // Top-level Additional menu visibility — handled via visibleWhen in
    // the menu tree, but force a refresh now so it picks up changes
    // even if no other notify happened.
    if (typeof ActionRegistry !== "undefined") ActionRegistry.notify();
    return anyUsed;
}


// ---- Phase 8e: Block- / Bereich-muster substitution editor ----------
//
// Two related features sharing one editor dialog:
//   Blockmuster (block substitution) — replaces every tieup cell with
//     the corresponding numbered Muster as a (mx+1, my+1) tile, while
//     also expanding entering and treadling so the threading lines up.
//   Bereichmuster (range substitution) — fills the weave selection
//     (or full extent) cell-by-cell, replacing each cell value n with
//     bereichmuster[n] tiled.
//
// Direct port of blockmuster.cpp / blockmusterdialog.cpp / the
// BlockExpand* and BereicheFillPattern functions from bereiche.cpp.

// Apply: Blockmuster expansion --------------------------------------
function _blockExpandEinzug(count, einzugZ) {
    const ka = pattern.min_x, kb = pattern.max_x;
    if (ka > kb) return;
    const len = kb - ka + 1;
    const pData = new Array(len);
    for (let i = ka; i <= kb; i++) {
        pData[i - ka] = pattern.entering.get_shaft(i);
        pattern.entering.set_shaft(i, 0);
    }
    const maxWarp = pattern.entering.width;
    const maxShaft = pattern.tieup.height;
    for (let i = ka; i <= kb; i++) {
        const v = pData[i - ka];
        if (v <= 0) continue;
        if (einzugZ) {
            for (let k = 0; k < count; k++) {
                const idx = i * count + k;
                if (idx >= maxWarp) break;
                const newShaft = (v - 1) * count + k + 1;
                if (newShaft > maxShaft) continue;
                pattern.entering.set_shaft(idx, newShaft);
            }
        } else {
            for (let k = 0; k < count; k++) {
                const idx = (i + 1) * count - 1 - k;
                if (idx >= maxWarp || idx < 0) break;
                const newShaft = (v - 1) * count + k + 1;
                if (newShaft > maxShaft) continue;
                pattern.entering.set_shaft(idx, newShaft);
            }
        }
    }
}

function _blockExpandTrittfolge(count, trittfolgeZ) {
    const sa = pattern.min_y, sb = pattern.max_y;
    if (sa > sb) return;
    const w = pattern.treadling.width;
    const pData = new Array((sb - sa + 1) * w);
    for (let j = sa; j <= sb; j++) {
        for (let i = 0; i < w; i++) {
            pData[(j - sa) * w + i] = pattern.treadling.get(i, j);
            pattern.treadling.set(i, j, 0);
        }
    }
    const maxWeft = pattern.treadling.height;
    const maxTreadle = pattern.treadling.width;
    for (let j = sa; j <= sb; j++) {
        for (let i = 0; i < w; i++) {
            if (pData[(j - sa) * w + i] === 0) continue;
            if (trittfolgeZ) {
                for (let k = 0; k < count; k++) {
                    const newJ = j * count + k;
                    if (newJ >= maxWeft) break;
                    const newI = i * count + k;
                    if (newI >= maxTreadle) continue;
                    pattern.treadling.set(newI, newJ, 1);
                }
            } else {
                for (let k = 0; k < count; k++) {
                    const newJ = j * count + k;
                    if (newJ >= maxWeft) break;
                    const newI = (i + 1) * count - 1 - k;
                    if (newI >= maxTreadle || newI < 0) continue;
                    pattern.treadling.set(newI, newJ, 1);
                }
            }
        }
    }
}

function _blockExpandAufknuepfung(x, y, blockmuster) {
    const w = pattern.tieup.width, h = pattern.tieup.height;
    const pData = new Array(h * w);
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            pData[j * w + i] = pattern.tieup.get(i, j);
            pattern.tieup.set(i, j, 0);
        }
    }
    let i1 = w - 1, i2 = 0, j1 = h - 1, j2 = 0, nonempty = false;
    for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
            if (pData[j * w + i] !== 0) {
                if (i1 > i) i1 = i;
                if (i2 < i) i2 = i;
                if (j1 > j) j1 = j;
                if (j2 < j) j2 = j;
                nonempty = true;
            }
        }
    }
    if (!nonempty) return;
    for (let i = i1; i <= i2; i++) {
        for (let j = j1; j <= j2; j++) {
            const bindung = pData[j * w + i];
            if (bindung < 0 || bindung >= 10) continue;
            for (let ii = x * i; ii < x * (i + 1); ii++) {
                if (ii >= w) break;
                for (let jj = y * j; jj < y * (j + 1); jj++) {
                    if (jj >= h) break;
                    const v = blockmuster[bindung].get(ii - x * i, jj - y * j);
                    pattern.tieup.set(ii, jj, v);
                }
            }
        }
    }
}

// Apply: Bereichmuster fill -----------------------------------------
function _bereicheFillPattern(bereichmuster) {
    let i0, i1, j0, j1;
    const hasSel = (cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2);
    if (hasSel && cursor.selected_part === "weave") {
        i0 = Math.min(cursor.x1, cursor.x2);
        i1 = Math.max(cursor.x1, cursor.x2);
        j0 = Math.min(cursor.y1, cursor.y2);
        j1 = Math.max(cursor.y1, cursor.y2);
    } else {
        i0 = pattern.min_x; i1 = pattern.max_x;
        j0 = pattern.min_y; j1 = pattern.max_y;
    }
    if (i0 > i1 || j0 > j1) return;
    for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
            const bindung = pattern.weave.get(i, j);
            if (bindung < 0 || bindung >= 10) continue;
            const m = bereichmuster[bindung];
            const sx = m.sizeX(), sy = m.sizeY();
            if (sx === 0 || sy === 0) continue;
            pattern.weave.set(i, j, m.get(i % sx, j % sy));
        }
    }
}

// Open the muster editor dialog. `mode` is "block" or "bereich"; the
// dialog renders identically except that block mode shows the red
// "current size" indicator + threading/treadling direction toggles.
function showMusterDialog(mode) {
    if (readonly) return;
    const isBlock = (mode === "block");
    const slots = isBlock ? pattern.blockmuster : pattern.bereichmuster;
    const i18n = _getI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;

    // Local state.
    const state = {
        current: 0,
        cx: 0, cy: 0,
        mx: -1, my: -1,
        einzugZ: true,
        trittfolgeZ: true,
        // Local undo ring — array of {snapshots:[10 muster snapshots], current:int}
        undoStack: [],
        redoStack: [],
    };
    state.einzugZ      = (settings.muster_einzug_z      !== false);
    state.trittfolgeZ  = (settings.muster_trittfolge_z  !== false);

    function snapshotState() {
        return {
            slots: slots.map(m => m.snapshot()),
            current: state.current,
        };
    }
    function restoreState(snap) {
        for (let k = 0; k < 10; k++) slots[k].restore(snap.slots[k]);
        state.current = snap.current;
    }
    function pushUndo() {
        state.undoStack.push(snapshotState());
        if (state.undoStack.length > 100) state.undoStack.shift();
        state.redoStack.length = 0;
    }
    pushUndo(); // initial state

    function calcRange() {
        state.mx = -1; state.my = -1;
        for (let k = 0; k < 10; k++) {
            for (let i = 0; i < 12; i++) {
                for (let j = 0; j < 12; j++) {
                    if (slots[k].get(i, j) !== 0) {
                        if (state.mx < i) state.mx = i;
                        if (state.my < j) state.my = j;
                    }
                }
            }
        }
    }
    calcRange();

    // ---- DOM construction ----
    const body = document.createElement("div");
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.gap = "0.5rem";
    body.style.minWidth = "560px";

    // Header: description + used-patterns indicator.
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    const description = document.createElement("div");
    description.style.fontWeight = "bold";
    const usedWrap = document.createElement("div");
    usedWrap.style.display = "flex";
    usedWrap.style.alignItems = "center";
    usedWrap.style.gap = "0.5rem";
    const usedLabel = document.createElement("span");
    usedLabel.textContent = L("muster.used", "Used patterns:");
    const usedSlots = document.createElement("span");
    usedSlots.style.fontFamily = "monospace";
    usedWrap.appendChild(usedLabel);
    usedWrap.appendChild(usedSlots);
    header.appendChild(description);
    header.appendChild(usedWrap);
    body.appendChild(header);

    // Toolbar with action buttons.
    const toolbar = document.createElement("div");
    toolbar.style.display = "flex";
    toolbar.style.flexWrap = "wrap";
    toolbar.style.gap = "0.25rem";
    const mkBtn = (label, fn, opts) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.padding = "0.2rem 0.5rem";
        b.addEventListener("click", () => { fn(); canvas.focus(); });
        if (opts && opts.title) b.title = opts.title;
        toolbar.appendChild(b);
        return b;
    };
    const undoBtn = mkBtn(L("muster.undo", "Undo"), () => doUndo());
    const redoBtn = mkBtn(L("muster.redo", "Redo"), () => doRedo());
    const sep1 = document.createElement("span"); sep1.textContent = "│"; sep1.style.opacity = "0.4";
    toolbar.appendChild(sep1);
    mkBtn(L("muster.delete", "Delete"),     () => editDelete());
    mkBtn(L("muster.mirror-h", "Mirror H"), () => editMirrorH());
    mkBtn(L("muster.mirror-v", "Mirror V"), () => editMirrorV());
    mkBtn(L("muster.rotate", "Rotate"),     () => editRotate());
    mkBtn(L("muster.invert", "Invert"),     () => editInvert());
    mkBtn(L("muster.central", "Central sym."), () => editCentralsym());
    const sep2 = document.createElement("span"); sep2.textContent = "│"; sep2.style.opacity = "0.4";
    toolbar.appendChild(sep2);
    mkBtn("←", () => rollLeft(),  { title: L("muster.roll-left",  "Roll left") });
    mkBtn("→", () => rollRight(), { title: L("muster.roll-right", "Roll right") });
    mkBtn("↑", () => rollUp(),    { title: L("muster.roll-up",    "Roll up") });
    mkBtn("↓", () => rollDown(),  { title: L("muster.roll-down",  "Roll down") });
    const sep3 = document.createElement("span"); sep3.textContent = "│"; sep3.style.opacity = "0.4";
    toolbar.appendChild(sep3);

    // Preset dropdown: stamps a standard binding into the active slot.
    const presets = [
        { label: L("muster.preset-tabby",   "Tabby"),     fn: () => musterKoeper(1, 1) },
        { label: L("muster.preset-twill22", "Twill 2/2"), fn: () => musterKoeper(2, 2) },
        { label: L("muster.preset-twill33", "Twill 3/3"), fn: () => musterKoeper(3, 3) },
        { label: L("muster.preset-twill44", "Twill 4/4"), fn: () => musterKoeper(4, 4) },
        { sep: true },
        { label: L("muster.preset-twill21", "Twill 2/1"), fn: () => musterKoeper(2, 1) },
        { label: L("muster.preset-twill31", "Twill 3/1"), fn: () => musterKoeper(3, 1) },
        { label: L("muster.preset-twill32", "Twill 3/2"), fn: () => musterKoeper(3, 2) },
        { label: L("muster.preset-twill41", "Twill 4/1"), fn: () => musterKoeper(4, 1) },
        { label: L("muster.preset-twill42", "Twill 4/2"), fn: () => musterKoeper(4, 2) },
        { label: L("muster.preset-twill43", "Twill 4/3"), fn: () => musterKoeper(4, 3) },
        { label: L("muster.preset-twill51", "Twill 5/1"), fn: () => musterKoeper(5, 1) },
        { label: L("muster.preset-twill52", "Twill 5/2"), fn: () => musterKoeper(5, 2) },
        { label: L("muster.preset-twill53", "Twill 5/3"), fn: () => musterKoeper(5, 3) },
        { sep: true },
        { label: L("muster.preset-satin5",  "Satin 5×5"), fn: () => musterAtlas(5) },
        { label: L("muster.preset-satin7",  "Satin 7×7"), fn: () => musterAtlas(7) },
        { label: L("muster.preset-satin9",  "Satin 9×9"), fn: () => musterAtlas(9) },
        { sep: true },
        { label: L("muster.preset-panama21", "Panama 2/1"), fn: () => musterPanama(2, 1) },
        { label: L("muster.preset-panama22", "Panama 2/2"), fn: () => musterPanama(2, 2) },
    ];
    const presetSelect = document.createElement("select");
    presetSelect.style.padding = "0.2rem 0.3rem";
    const phPreset = document.createElement("option");
    phPreset.value = "";
    phPreset.textContent = L("muster.preset-placeholder", "Insert binding…");
    phPreset.disabled = true;
    phPreset.selected = true;
    presetSelect.appendChild(phPreset);
    presets.forEach((p, idx) => {
        if (p.sep) {
            const sep = document.createElement("option");
            sep.disabled = true;
            sep.textContent = "─────";
            presetSelect.appendChild(sep);
            return;
        }
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = p.label;
        presetSelect.appendChild(opt);
    });
    presetSelect.addEventListener("change", () => {
        const idx = parseInt(presetSelect.value, 10);
        if (!isNaN(idx) && presets[idx] && presets[idx].fn) {
            presets[idx].fn();
        }
        presetSelect.value = "";  // reset to placeholder
        canvas.focus();
    });
    toolbar.appendChild(presetSelect);

    // Copy-from dropdown: pulls another slot's pattern into the current.
    const copySelect = document.createElement("select");
    copySelect.style.padding = "0.2rem 0.3rem";
    const phCopy = document.createElement("option");
    phCopy.value = "";
    phCopy.textContent = L("muster.copy-from", "Copy from…");
    phCopy.disabled = true;
    phCopy.selected = true;
    copySelect.appendChild(phCopy);
    for (let k = 0; k < 10; k++) {
        const opt = document.createElement("option");
        opt.value = String(k);
        opt.textContent = (k === 0)
            ? L("muster.base-pattern", "Base pattern")
            : (L("muster.pattern", "Pattern") + " " + k);
        copySelect.appendChild(opt);
    }
    copySelect.addEventListener("change", () => {
        const k = parseInt(copySelect.value, 10);
        if (!isNaN(k)) grabFrom(k);
        copySelect.value = "";
        canvas.focus();
    });
    toolbar.appendChild(copySelect);

    body.appendChild(toolbar);

    // Binding selector (10 slot buttons).
    const bindRow = document.createElement("div");
    bindRow.style.display = "flex";
    bindRow.style.gap = "0.25rem";
    const bindBtns = [];
    for (let k = 0; k < 10; k++) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = (k === 0) ? L("muster.base", "B") : String(k);
        b.style.minWidth = "2rem";
        b.style.padding = "0.2rem 0.4rem";
        b.dataset.slot = String(k);
        b.addEventListener("click", () => { selectBindung(k); canvas.focus(); });
        bindBtns.push(b);
        bindRow.appendChild(b);
    }
    body.appendChild(bindRow);

    // Direction toggles (block mode only).
    let einzugZRadio = null, einzugSRadio = null;
    let trittfolgeZRadio = null, trittfolgeSRadio = null;
    if (isBlock) {
        const dirs = document.createElement("div");
        dirs.style.display = "flex";
        dirs.style.gap = "1.5rem";
        dirs.style.fontSize = "13px";
        dirs.innerHTML = `
            <fieldset style="border:1px solid #aaa;padding:0.2rem 0.6rem">
              <legend>${L("muster.einzug-direction", "Threading")}</legend>
              <label><input type="radio" name="tx-mb-ez" value="z" ${state.einzugZ ? "checked" : ""}> ${L("muster.straight-rising", "Straight rising")}</label>
              <label style="margin-left:0.8rem"><input type="radio" name="tx-mb-ez" value="s" ${!state.einzugZ ? "checked" : ""}> ${L("muster.straight-falling", "Straight falling")}</label>
            </fieldset>
            <fieldset style="border:1px solid #aaa;padding:0.2rem 0.6rem">
              <legend>${L("muster.tritt-direction", "Treadling")}</legend>
              <label><input type="radio" name="tx-mb-tf" value="z" ${state.trittfolgeZ ? "checked" : ""}> ${L("muster.straight-rising", "Straight rising")}</label>
              <label style="margin-left:0.8rem"><input type="radio" name="tx-mb-tf" value="s" ${!state.trittfolgeZ ? "checked" : ""}> ${L("muster.straight-falling", "Straight falling")}</label>
            </fieldset>`;
        body.appendChild(dirs);
        einzugZRadio = dirs.querySelector("input[name='tx-mb-ez'][value='z']");
        einzugSRadio = dirs.querySelector("input[name='tx-mb-ez'][value='s']");
        trittfolgeZRadio = dirs.querySelector("input[name='tx-mb-tf'][value='z']");
        trittfolgeSRadio = dirs.querySelector("input[name='tx-mb-tf'][value='s']");
        einzugZRadio.addEventListener("change", () => { if (einzugZRadio.checked) state.einzugZ = true; });
        einzugSRadio.addEventListener("change", () => { if (einzugSRadio.checked) state.einzugZ = false; });
        trittfolgeZRadio.addEventListener("change", () => { if (trittfolgeZRadio.checked) state.trittfolgeZ = true; });
        trittfolgeSRadio.addEventListener("change", () => { if (trittfolgeSRadio.checked) state.trittfolgeZ = false; });
    }

    // Canvas (12×12 editor).
    const CELL = 22;
    const canvasWrap = document.createElement("div");
    canvasWrap.style.background = "#bbb";
    canvasWrap.style.padding = "1px";
    canvasWrap.style.alignSelf = "center";
    const canvas = document.createElement("canvas");
    canvas.width = 12 * CELL + 1;
    canvas.height = 12 * CELL + 1;
    canvas.tabIndex = 0;
    canvas.style.outline = "none";
    canvas.style.background = "#c0c0c0";
    canvas.style.cursor = "default";
    canvasWrap.appendChild(canvas);
    body.appendChild(canvasWrap);

    function bindungColor(s) {
        if (s === 0) return "#808080";
        return getRangeColor(settings, s);
    }

    function paint() {
        const ctx2 = canvas.getContext("2d");
        ctx2.clearRect(0, 0, canvas.width, canvas.height);
        // grid
        ctx2.strokeStyle = "#696969";
        ctx2.lineWidth = 1;
        ctx2.beginPath();
        for (let i = 0; i <= 12; i++) {
            ctx2.moveTo(i * CELL + 0.5, 0);
            ctx2.lineTo(i * CELL + 0.5, 12 * CELL);
        }
        for (let j = 0; j <= 12; j++) {
            ctx2.moveTo(0, j * CELL + 0.5);
            ctx2.lineTo(12 * CELL, j * CELL + 0.5);
        }
        ctx2.stroke();
        // cells
        const m = slots[state.current];
        for (let i = 0; i < 12; i++) {
            for (let j = 0; j < 12; j++) {
                const c = m.get(i, j);
                if (c === 0) continue;
                ctx2.fillStyle = state.current === 0 ? "#808080" : bindungColor(c);
                ctx2.fillRect(i * CELL + 2, (12 - j - 1) * CELL + 2, CELL - 3, CELL - 3);
            }
        }
        // red "current size" markers (block mode only)
        if (isBlock && state.mx >= 0 && state.my >= 0) {
            ctx2.strokeStyle = "#d00";
            ctx2.lineWidth = 2;
            ctx2.beginPath();
            ctx2.moveTo(1, (12 - 1 - state.my) * CELL);
            ctx2.lineTo((state.mx + 1) * CELL, (12 - 1 - state.my) * CELL);
            ctx2.moveTo((state.mx + 1) * CELL, (12 - 1 - state.my) * CELL);
            ctx2.lineTo((state.mx + 1) * CELL, 12 * CELL);
            ctx2.stroke();
        }
        // focus cursor
        if (document.activeElement === canvas) {
            ctx2.strokeStyle = "#fff";
            ctx2.lineWidth = 1.5;
            ctx2.strokeRect(state.cx * CELL + 0.5, (12 - 1 - state.cy) * CELL + 0.5,
                            CELL, CELL);
        }
    }

    function refreshDescription() {
        if (state.current === 0) description.textContent = L("muster.base-pattern", "Base pattern");
        else description.textContent = (L("muster.pattern", "Pattern") + " " + state.current);
    }
    function refreshUsed() {
        const parts = [];
        for (let k = 0; k < 10; k++) {
            const used = !slots[k].isEmpty();
            const label = (k === 0) ? "B" : String(k);
            parts.push(`<span style="color:${used ? '#c00' : '#888'};margin-right:2px">${label}</span>`);
        }
        usedSlots.innerHTML = parts.join("");
    }
    function refreshBindButtons() {
        for (let k = 0; k < 10; k++) {
            bindBtns[k].style.fontWeight = (k === state.current) ? "bold" : "normal";
            bindBtns[k].style.background = (k === state.current) ? "#cce" : "";
        }
    }
    function refreshUndoButtons() {
        undoBtn.disabled = state.undoStack.length <= 1;
        redoBtn.disabled = state.redoStack.length === 0;
    }

    function doUndo() {
        if (state.undoStack.length <= 1) return;
        const cur = state.undoStack.pop();
        state.redoStack.push(cur);
        const prev = state.undoStack[state.undoStack.length - 1];
        restoreState(prev);
        calcRange(); refreshAll();
    }
    function doRedo() {
        if (state.redoStack.length === 0) return;
        const next = state.redoStack.pop();
        state.undoStack.push(next);
        restoreState(next);
        calcRange(); refreshAll();
    }
    function refreshAll() {
        refreshDescription(); refreshUsed(); refreshBindButtons();
        refreshUndoButtons(); paint();
    }
    function selectBindung(b) {
        state.current = b;
        refreshAll();
    }

    function toggle(s, current) {
        if (s === 0) return current !== 0 ? current : 1;
        return 0;
    }

    function editDelete() {
        if (state.mx === -1) return;
        slots[state.current].clear();
        calcRange(); pushUndo(); refreshAll();
    }
    function editMirrorH() {
        if (state.mx === -1) return;
        const m = slots[state.current];
        for (let i = 0; i <= Math.floor(state.mx / 2); i++) {
            for (let j = 0; j <= state.my; j++) {
                const t = m.get(i, j);
                m.set(i, j, m.get(state.mx - i, j));
                m.set(state.mx - i, j, t);
            }
        }
        pushUndo(); refreshAll();
    }
    function editMirrorV() {
        if (state.mx === -1) return;
        const m = slots[state.current];
        for (let i = 0; i <= state.mx; i++) {
            for (let j = 0; j <= Math.floor(state.my / 2); j++) {
                const t = m.get(i, j);
                m.set(i, j, m.get(i, state.my - j));
                m.set(i, state.my - j, t);
            }
        }
        pushUndo(); refreshAll();
    }
    function editRotate() {
        if (state.mx === -1 || state.mx !== state.my) return;
        const m = slots[state.current];
        const sz = state.mx + 1;
        const data = new Array(sz * sz);
        for (let i = 0; i <= state.mx; i++) {
            for (let j = 0; j <= state.my; j++) {
                data[j * sz + i] = m.get(i, j);
                m.set(i, j, 0);
            }
        }
        for (let i = 0; i <= state.mx; i++) {
            for (let j = 0; j <= state.my; j++) {
                m.set(j, state.my - i, data[j * sz + i]);
            }
        }
        pushUndo(); refreshAll();
    }
    function editInvert() {
        if (state.mx === -1) return;
        const m = slots[state.current];
        for (let i = 0; i <= state.mx; i++) {
            for (let j = 0; j <= state.my; j++) {
                m.set(i, j, toggle(m.get(i, j), state.current));
            }
        }
        pushUndo(); refreshAll();
    }
    function editCentralsym() {
        if (state.mx === -1 || state.mx !== state.my) return;
        // Reuse the existing pattern's central-symmetry algorithm by
        // wrapping the muster slot in a Grid-like temp.
        const sz = state.mx + 1;
        const tmp = new Grid(sz, sz);
        const m = slots[state.current];
        for (let i = 0; i < sz; i++)
            for (let j = 0; j < sz; j++) tmp.set(i, j, m.get(i, j));
        const result = tmp.centralSymmetry(0, 0, sz - 1, sz - 1);
        if (result === "applied") {
            for (let i = 0; i < sz; i++)
                for (let j = 0; j < sz; j++) m.set(i, j, tmp.get(i, j));
            pushUndo(); refreshAll();
        }
        // "noop" / "none" → nothing visible to do.
    }
    function rollUp() {
        if (state.mx === -1) return;
        const m = slots[state.current];
        const top = new Array(state.mx + 1);
        for (let i = 0; i <= state.mx; i++) top[i] = m.get(i, state.my);
        for (let j = state.my; j > 0; j--)
            for (let i = 0; i <= state.mx; i++) m.set(i, j, m.get(i, j - 1));
        for (let i = 0; i <= state.mx; i++) m.set(i, 0, top[i]);
        pushUndo(); refreshAll();
    }
    function rollDown() {
        if (state.mx === -1) return;
        const m = slots[state.current];
        const bot = new Array(state.mx + 1);
        for (let i = 0; i <= state.mx; i++) bot[i] = m.get(i, 0);
        for (let j = 0; j < state.my; j++)
            for (let i = 0; i <= state.mx; i++) m.set(i, j, m.get(i, j + 1));
        for (let i = 0; i <= state.mx; i++) m.set(i, state.my, bot[i]);
        pushUndo(); refreshAll();
    }
    function rollLeft() {
        if (state.mx === -1) return;
        const m = slots[state.current];
        const left = new Array(state.my + 1);
        for (let j = 0; j <= state.my; j++) left[j] = m.get(0, j);
        for (let i = 0; i < state.mx; i++)
            for (let j = 0; j <= state.my; j++) m.set(i, j, m.get(i + 1, j));
        for (let j = 0; j <= state.my; j++) m.set(state.mx, j, left[j]);
        pushUndo(); refreshAll();
    }
    function rollRight() {
        if (state.mx === -1) return;
        const m = slots[state.current];
        const right = new Array(state.my + 1);
        for (let j = 0; j <= state.my; j++) right[j] = m.get(state.mx, j);
        for (let i = state.mx; i > 0; i--)
            for (let j = 0; j <= state.my; j++) m.set(i, j, m.get(i - 1, j));
        for (let j = 0; j <= state.my; j++) m.set(0, j, right[j]);
        pushUndo(); refreshAll();
    }

    // ---- Preset bindings (Tabby / Twill / Satin / Panama) -----------
    function musterKoeper(h, s) {
        const m = slots[state.current];
        m.clear();
        const n = h + s;
        const v = state.current !== 0 ? state.current : 1;
        if (h <= s) {
            for (let i = 0; i < n; i++)
                for (let j = i; j < i + h; j++) m.set(i, j % n, v);
        } else {
            for (let i = 0; i < n; i++)
                for (let j = i + s; j < i + n; j++) m.set(i, j % n, v);
        }
        calcRange(); pushUndo(); refreshAll();
    }
    const _MUSTER_ATLAS = {
        5: [[0,0],[1,2],[2,4],[3,1],[4,3]],
        7: [[0,2],[1,6],[2,3],[3,0],[4,4],[5,1],[6,5]],
        9: [[0,0],[1,2],[2,4],[3,6],[4,8],[5,1],[6,3],[7,5],[8,7]],
    };
    function musterAtlas(n) {
        const m = slots[state.current];
        m.clear();
        const v = state.current !== 0 ? state.current : 1;
        const offsets = _MUSTER_ATLAS[n];
        if (!offsets) return;
        for (const [i, j] of offsets) m.set(i, j, v);
        calcRange(); pushUndo(); refreshAll();
    }
    function musterPanama(h, s) {
        const m = slots[state.current];
        m.clear();
        const v = state.current !== 0 ? state.current : 1;
        for (let i = 0; i < h; i++)
            for (let j = 0; j < h; j++) m.set(i, j, v);
        for (let i = h; i < h + s; i++)
            for (let j = h; j < h + s; j++) m.set(i, j, v);
        calcRange(); pushUndo(); refreshAll();
    }

    // ---- Copy from another binding slot -----------------------------
    // Double-toggle effectively recolours every set cell of the source
    // slot to the current slot's value (and clears the rest), within
    // the global bounding box (mx, my).
    function grabFrom(fromSlot) {
        if (fromSlot < 0 || fromSlot >= 10) return;
        if (fromSlot === state.current) return;
        if (state.mx === -1) return;
        for (let i = 0; i <= state.mx; i++) {
            for (let j = 0; j <= state.my; j++) {
                let c = slots[fromSlot].get(i, j);
                c = toggle(toggle(c, state.current), state.current);
                slots[state.current].set(i, j, c);
            }
        }
        pushUndo(); refreshAll();
    }

    // Mouse input.
    canvas.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const i = Math.floor(x / CELL);
        const j = 12 - 1 - Math.floor(y / CELL);
        if (i < 0 || j < 0 || i >= 12 || j >= 12) return;
        const m = slots[state.current];
        m.set(i, j, toggle(m.get(i, j), state.current));
        state.cx = i; state.cy = j;
        calcRange(); pushUndo(); refreshAll();
        canvas.focus();
    });

    // Keyboard input — arrows, Shift+arrow rolls, Space toggles, Enter
    // cycles binding, digit selects binding. Stops propagation so the
    // window-level shortcuts don't consume them.
    canvas.addEventListener("keydown", (e) => {
        const ctrl = e.ctrlKey, shift = e.shiftKey;
        const step = ctrl ? 4 : 1;
        let consumed = true;
        switch (e.key) {
            case "ArrowLeft":
                if (shift) rollLeft();
                else { state.cx = Math.max(0, state.cx - step); paint(); }
                break;
            case "ArrowRight":
                if (shift) rollRight();
                else { state.cx = Math.min(11, state.cx + step); paint(); }
                break;
            case "ArrowUp":
                if (shift) rollUp();
                else { state.cy = Math.min(11, state.cy + step); paint(); }
                break;
            case "ArrowDown":
                if (shift) rollDown();
                else { state.cy = Math.max(0, state.cy - step); paint(); }
                break;
            case " ": {
                const m = slots[state.current];
                m.set(state.cx, state.cy, toggle(m.get(state.cx, state.cy), state.current));
                if (state.cy < 11) state.cy++;
                calcRange(); pushUndo(); refreshAll();
                break;
            }
            case "Enter":
                selectBindung(shift ? (state.current + 9) % 10 : (state.current + 1) % 10);
                break;
            case "0": case "1": case "2": case "3": case "4":
            case "5": case "6": case "7": case "8": case "9":
                selectBindung(parseInt(e.key, 10));
                break;
            default:
                consumed = false;
        }
        if (consumed) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    });

    canvas.addEventListener("focus", () => paint());
    canvas.addEventListener("blur", () => paint());

    // Open modal.
    let modal;
    const apply = () => {
        modal.close();
        if (isBlock) {
            settings.muster_einzug_z = state.einzugZ;
            settings.muster_trittfolge_z = state.trittfolgeZ;
            _applyBlockmuster(state.einzugZ, state.trittfolgeZ, state.mx, state.my);
        } else {
            _applyBereichmuster();
        }
    };
    modal = Modal.open({
        title: isBlock
            ? L("muster.block-title",   "Substitute with block patterns")
            : L("muster.bereich-title", "Substitute ranges with patterns"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("muster.apply", "Apply"), role: "primary", onClick: () => apply() },
        ],
    });
    refreshAll();
    setTimeout(() => canvas.focus(), 0);
}

// Wraps the BlockExpand* trio in a single undoable command.
function _applyBlockmuster(einzugZ, trittfolgeZ, mx, my) {
    if (mx < 0 || my < 0) return;
    const x = mx + 1;
    const y = my + 1;
    _fullSnapCommand("blockmuster", () => {
        // Legacy temporarily disables Schlagpatrone for the substitution.
        const wasPegplan = !!settings.display_pegplan;
        if (wasPegplan) {
            settings.display_pegplan = false;
            pattern.recalc_weave();
        }
        _blockExpandEinzug(y, einzugZ);
        _blockExpandTrittfolge(x, trittfolgeZ);
        _blockExpandAufknuepfung(x, y, pattern.blockmuster);
        pattern.recalc_weave_extent();
        pattern.recalc_weave();
        if (wasPegplan) {
            settings.display_pegplan = true;
            pattern._recalc_pegplan_from_weave();
        }
    });
}

function _applyBereichmuster() {
    _fullSnapCommand("bereichmuster", () => {
        _bereicheFillPattern(pattern.bereichmuster);
        pattern.recalc_from_weave(settings);
    });
}


// ---- Phase 8g: Threading wizard (Einzugassistent) -------------------
//
// Port of einzugassistentdialog.cpp. Two modes:
//   Straight through (Geradedurch)  — fills entering with a straight
//                                      diagonal. Z = rising, S = falling.
//   Stepped (Abgesetzt)             — broken twill: runs of `gratlen`
//                                      warps stepping +1, then jump
//                                      shafts by `versatz`, repeat.

function _ezAssistentGerade(firstKF, firstSchaft, schaefte, steigend) {
    _fullSnapCommand("threading wizard (straight)", () => {
        const maxShaft = pattern.tieup.height;
        const maxWarp = pattern.entering.width;
        if (steigend) {
            for (let i = firstKF - 1; i < firstKF - 1 + schaefte; i++) {
                let s = firstSchaft + (i - (firstKF - 1));
                if (s > maxShaft) break;          // clamp instead of ExtendSchaefte
                if (i >= maxWarp) break;
                pattern.entering.set_shaft(i, s);
            }
        } else {
            for (let i = firstKF - 1; i < firstKF - 1 + schaefte; i++) {
                let s = firstSchaft + (firstKF - 1 + schaefte - 1)
                        - (i - (firstKF - 1));
                if (s > maxShaft) break;
                if (s <= 0) break;
                if (i >= maxWarp) break;
                pattern.entering.set_shaft(i, s);
            }
        }
        pattern.recalc_weave();
    });
}

function _ezAssistentAbgesetzt(firstKF, firstSchaft, schaefte, gratlen, versatz) {
    _fullSnapCommand("threading wizard (stepped)", () => {
        const maxShaft = pattern.tieup.height;
        const maxWarp = pattern.entering.width;
        let i = firstKF - 1;
        let j = firstSchaft - 1;
        outer: while (true) {
            for (let ii = 0; ii < gratlen; ii++) {
                const s = j + ii + 1;
                if (s - firstSchaft >= schaefte) break outer;
                if (s <= 0) break outer;
                if (s > maxShaft) break outer;
                if (i + ii >= maxWarp) break outer;
                pattern.entering.set_shaft(i + ii, s);
                if (s - firstSchaft + 1 === schaefte) break outer;
            }
            i += gratlen;
            j += versatz;
        }
        pattern.recalc_weave();
    });
}

function showThreadingWizardDialog() {
    if (readonly) return;
    const i18n = _getI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;

    const body = document.createElement("div");
    body.innerHTML = `
        <div style="margin-bottom:0.6rem">
          <label style="margin-right:1rem">
            <input type="radio" name="tx-ez-mode" value="gerade" checked>
            ${L("ez.assist.straight", "Straight through")}
          </label>
          <label>
            <input type="radio" name="tx-ez-mode" value="abgesetzt">
            ${L("ez.assist.stepped", "Stepped")}
          </label>
        </div>
        <div id="tx-ez-gerade" style="display:grid;grid-template-columns:auto auto;gap:0.4rem 1rem;align-items:center">
          <label>${L("ez.assist.first-warp", "First warp thread:")}</label>
          <input id="tx-ez-gd-firstkf" type="number" min="1" step="1" value="1" style="width:5rem">
          <label>${L("ez.assist.first-shaft", "First shaft:")}</label>
          <input id="tx-ez-gd-firstsch" type="number" min="1" step="1" value="1" style="width:5rem">
          <label>${L("ez.assist.shaft-count", "Number of shafts:")}</label>
          <input id="tx-ez-gd-schaefte" type="number" min="1" step="1" value="4" style="width:5rem">
          <label>${L("ez.assist.orientation", "Orientation:")}</label>
          <span>
            <label><input type="radio" name="tx-ez-gd-zs" value="z" checked> Z</label>
            <label style="margin-left:1rem"><input type="radio" name="tx-ez-gd-zs" value="s"> S</label>
          </span>
        </div>
        <div id="tx-ez-abgesetzt" style="display:none;grid-template-columns:auto auto;gap:0.4rem 1rem;align-items:center">
          <label>${L("ez.assist.first-warp", "First warp thread:")}</label>
          <input id="tx-ez-ab-firstkf" type="number" min="1" step="1" value="1" style="width:5rem">
          <label>${L("ez.assist.first-shaft", "First shaft:")}</label>
          <input id="tx-ez-ab-firstsch" type="number" min="1" step="1" value="1" style="width:5rem">
          <label>${L("ez.assist.shaft-count", "Number of shafts:")}</label>
          <input id="tx-ez-ab-schaefte" type="number" min="1" step="1" value="4" style="width:5rem">
          <label>${L("ez.assist.gratlen", "Run length (Gratlänge):")}</label>
          <input id="tx-ez-ab-gratlen" type="number" min="1" step="1" value="4" style="width:5rem">
          <label>${L("ez.assist.versatz", "Offset (Versatz):")}</label>
          <input id="tx-ez-ab-versatz" type="number" step="1" value="2" style="width:5rem">
        </div>
        <div id="tx-ez-error" style="margin-top:0.6rem;color:#c33;font-size:12px"></div>`;

    const switchMode = () => {
        const mode = body.querySelector("input[name='tx-ez-mode']:checked").value;
        body.querySelector("#tx-ez-gerade").style.display =
            (mode === "gerade") ? "grid" : "none";
        body.querySelector("#tx-ez-abgesetzt").style.display =
            (mode === "abgesetzt") ? "grid" : "none";
        body.querySelector("#tx-ez-error").textContent = "";
    };
    body.addEventListener("change", (e) => {
        if (e.target.name === "tx-ez-mode") switchMode();
    });

    let modal;
    const apply = () => {
        const errEl = body.querySelector("#tx-ez-error");
        errEl.textContent = "";
        const mode = body.querySelector("input[name='tx-ez-mode']:checked").value;
        if (mode === "gerade") {
            const firstKF   = parseInt(body.querySelector("#tx-ez-gd-firstkf").value, 10) || 1;
            const firstSch  = parseInt(body.querySelector("#tx-ez-gd-firstsch").value, 10) || 1;
            const schaefte  = parseInt(body.querySelector("#tx-ez-gd-schaefte").value, 10) || 1;
            const z = body.querySelector("input[name='tx-ez-gd-zs']:checked").value === "z";
            _ezAssistentGerade(firstKF, firstSch, schaefte, z);
        } else {
            const firstKF   = parseInt(body.querySelector("#tx-ez-ab-firstkf").value, 10) || 1;
            const firstSch  = parseInt(body.querySelector("#tx-ez-ab-firstsch").value, 10) || 1;
            const schaefte  = parseInt(body.querySelector("#tx-ez-ab-schaefte").value, 10) || 1;
            const glen      = parseInt(body.querySelector("#tx-ez-ab-gratlen").value, 10) || 1;
            const versatz   = parseInt(body.querySelector("#tx-ez-ab-versatz").value, 10) || 0;
            if (glen < 1 || glen > schaefte) {
                errEl.textContent = L("ez.assist.err-gratlen",
                    "Run length must be between 1 and the number of shafts.");
                return;
            }
            if (Math.abs(versatz) < 1 || Math.abs(versatz) > schaefte) {
                errEl.textContent = L("ez.assist.err-versatz",
                    "Offset must be between 1 and the number of shafts.");
                return;
            }
            _ezAssistentAbgesetzt(firstKF, firstSch, schaefte, glen, versatz);
        }
        modal.close();
    };

    modal = Modal.open({
        title: L("ez.assist.title", "Threading wizard"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok", "OK"), role: "primary", onClick: () => apply() },
        ],
    });
    setTimeout(() => body.querySelector("#tx-ez-gd-firstkf").focus(), 0);
}


// ---- Phase 8d: Lancée (warp / weft) ---------------------------------
//
// Direct port of utilities.cpp::KettLancierungClick /
// SchussLancierungClick + the 6-slot EnterVVDialog. Inserts blanks into
// the active range so that runs of "vv[0]" original threads are
// followed by "vv[1]" empty insertions, alternating cyclically.

// 6-slot ratio dialog. Subsequent slots enable as the previous one
// becomes non-zero. Calls onAccept(vv[]) where vv is a 6-element
// integer array.
function showLancierungDialog(onAccept) {
    const i18n = _getI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    const body = document.createElement("div");
    body.innerHTML = `
        <div style="margin-bottom:0.5rem">${L("lancee.prompt", "Enter the thread ratio:")}</div>
        <div id="tx-vv-row" style="display:flex;align-items:center;gap:0.3rem"></div>`;
    const row = body.querySelector("#tx-vv-row");
    const inputs = [];
    for (let i = 0; i < 6; i++) {
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0"; input.max = "999"; input.step = "1";
        input.style.width = "3rem";
        input.disabled = (i > 0);
        inputs.push(input);
        row.appendChild(input);
        if (i < 5) {
            const sep = document.createElement("span");
            sep.textContent = ":";
            row.appendChild(sep);
        }
        input.addEventListener("input", () => {
            const v = parseInt(input.value, 10) || 0;
            if (v === 0) {
                for (let k = i + 1; k < 6; k++) {
                    inputs[k].value = "";
                    inputs[k].disabled = true;
                }
            } else if (i + 1 < 6) {
                inputs[i + 1].disabled = false;
            }
        });
    }
    let modal;
    const apply = () => {
        const vv = inputs.map(el => parseInt(el.value, 10) || 0);
        modal.close();
        onAccept(vv);
    };
    modal = Modal.open({
        title: L("lancee.title", "Thread ratio"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok", "OK"), role: "primary", onClick: () => apply() },
        ],
    });
    setTimeout(() => inputs[0].focus(), 0);
}

// _kettLancierung — port of KettLancierungClick.
function _kettLancierung(vvIn) {
    const vv = vvIn.slice();
    let maxi = 0;
    for (let k = 0; k < 6; k++) if (vv[k] !== 0) maxi = k + 1;
    if (maxi > 1 && (maxi % 2) !== 0) {
        vv[0] += vv[maxi - 1];
        vv[maxi - 1] = 0;
        maxi--;
    }
    if (maxi <= 1) return;

    let a, b;
    const hasSel = (cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2);
    if (hasSel) {
        a = Math.min(cursor.x1, cursor.x2);
        b = Math.max(cursor.x1, cursor.x2);
    } else {
        a = pattern.min_x;
        b = pattern.max_x;
    }
    if (a > b) return;

    // Compute "needed" extra width (port of legacy do/while).
    let needed = b - a + 1;
    {
        let i = a, idx = 0;
        do {
            let v = vv[idx];
            while (i <= b && v-- > 0) i++;
            idx = (idx + 1) % maxi;
            if (i <= b + 1) {
                needed += vv[idx];
                idx = (idx + 1) % maxi;
            }
        } while (i <= b);
    }
    if (a + needed >= pattern.weave.width) {
        needed = pattern.weave.width - 1 - a;
    }
    if (needed <= 0) return;

    _fullSnapCommand("warp lancée", () => {
        // Fill buff[0..needed-1] with source warp index or -1 for blank.
        const buff = new Array(needed);
        let idx = 0, ii = 0;
        for (let i = a; i <= b; i++) {
            for (let j = 0; j < vv[idx]; j++) {
                buff[ii++] = i++;
                if (ii >= needed || i - 1 > b) break;
            }
            i--;
            if (ii >= needed) break;
            idx = (idx + 1) % maxi;
            for (let j = 0; j < vv[idx]; j++) {
                buff[ii++] = -1;
                if (ii >= needed) break;
            }
            idx = (idx + 1) % maxi;
            if (ii >= needed) break;
        }

        // Shift right side to make room.
        const maxii = Math.min(pattern.weave.width, pattern.max_x - b + 1);
        for (let i = b + maxii - 1; i > b; i--) {
            const dst = a + needed + i - b - 1;
            if (dst >= pattern.entering.width) continue;
            pattern.entering.set_shaft(dst, pattern.entering.get_shaft(i));
            for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                pattern.weave.set(dst, j, pattern.weave.get(i, j));
            }
        }
        // Auseinanderziehen — write expanded values from buff.
        for (let i = a + needed - 1; i >= a; i--) {
            const src = buff[i - a];
            if (src === undefined) continue;
            if (src === -1) {
                pattern.entering.set_shaft(i, 0);
                for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                    pattern.weave.set(i, j, 0);
                }
            } else {
                pattern.entering.set_shaft(i, pattern.entering.get_shaft(src));
                for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                    pattern.weave.set(i, j, pattern.weave.get(src, j));
                }
            }
        }
        pattern.recalc_weave_extent();
    });
}

// _schussLancierung — port of SchussLancierungClick.
function _schussLancierung(vvIn) {
    const vv = vvIn.slice();
    let maxi = 0;
    for (let k = 0; k < 6; k++) if (vv[k] !== 0) maxi = k + 1;
    if (maxi > 1 && (maxi % 2) !== 0) {
        vv[0] += vv[maxi - 1];
        vv[maxi - 1] = 0;
        maxi--;
    }
    if (maxi <= 1) return;

    let a, b;
    const hasSel = (cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2);
    if (hasSel) {
        a = Math.min(cursor.y1, cursor.y2);
        b = Math.max(cursor.y1, cursor.y2);
    } else {
        a = pattern.min_y;
        b = pattern.max_y;
    }
    if (a > b) return;

    let needed = b - a + 1;
    {
        let i = a, idx = 0;
        do {
            let v = vv[idx];
            while (i <= b && v-- > 0) i++;
            idx = (idx + 1) % maxi;
            if (i <= b + 1) {
                needed += vv[idx];
                idx = (idx + 1) % maxi;
            }
        } while (i <= b);
    }
    if (a + needed >= pattern.weave.height) {
        needed = pattern.weave.height - 1 - a;
    }
    if (needed <= 0) return;

    _fullSnapCommand("weft lancée", () => {
        const buff = new Array(needed);
        let idx = 0, ii = 0;
        for (let i = a; i <= b; i++) {
            for (let j = 0; j < vv[idx]; j++) {
                buff[ii++] = i++;
                if (ii >= needed || i - 1 > b) break;
            }
            i--;
            if (ii >= needed) break;
            idx = (idx + 1) % maxi;
            for (let j = 0; j < vv[idx]; j++) {
                buff[ii++] = -1;
                if (ii >= needed) break;
            }
            idx = (idx + 1) % maxi;
            if (ii >= needed) break;
        }

        const sideGrid = settings.display_pegplan ? pattern.pegplan : pattern.treadling;
        const maxjj = Math.min(pattern.weave.height, pattern.max_y - b + 1);
        // Shift right side rows down to make room.
        for (let j = b + maxjj - 1; j > b; j--) {
            const dst = a + needed + j - b - 1;
            if (dst >= pattern.weave.height) continue;
            for (let i = 0; i < sideGrid.width; i++) {
                sideGrid.set(i, dst, sideGrid.get(i, j));
            }
            for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                pattern.weave.set(i, dst, pattern.weave.get(i, j));
            }
        }
        // Apply buff to rows [a..a+needed-1].
        for (let j = a + needed - 1; j >= a; j--) {
            const src = buff[j - a];
            if (src === undefined) continue;
            if (src === -1) {
                for (let i = 0; i < sideGrid.width; i++) sideGrid.set(i, j, 0);
                for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                    pattern.weave.set(i, j, 0);
                }
            } else {
                for (let i = 0; i < sideGrid.width; i++) {
                    sideGrid.set(i, j, sideGrid.get(i, src));
                }
                for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                    pattern.weave.set(i, j, pattern.weave.get(i, src));
                }
            }
        }
        pattern.recalc_weave_extent();
    });
}


// ---- Phase 8c-1: Treadling rearrange (MinimalZ / MinimalS / Gesprungen)
//
// Port of trittfolge.cpp::RearrangeTritte and helpers (MoveTritt,
// AufknuepfungsspalteEqual, MergeTritte, EliminateEmptyTritt,
// SwitchTritte). Treadling styles only run in non-pegplan mode — in
// pegplan mode the desktop's RearrangeTritte returns early.

function _moveTritt(from, to) {
    for (let j = pattern.min_y; j <= pattern.max_y; j++) {
        pattern.treadling.set(to, j, pattern.treadling.get(from, j));
        pattern.treadling.set(from, j, 0);
    }
    for (let j = 0; j < pattern.tieup.height; j++) {
        pattern.tieup.set(to, j, pattern.tieup.get(from, j));
        pattern.tieup.set(from, j, 0);
    }
}

function _aufknuepfungsspalteEqual(i1, i2) {
    let nonempty = false;
    for (let j = 0; j < pattern.tieup.height; j++) {
        const s1 = pattern.tieup.get(i1, j);
        const s2 = pattern.tieup.get(i2, j);
        if (s1 > 0 || s2 > 0) nonempty = true;
        if (s1 <= 0 && s2 > 0) return false;
        if (s1 > 0 && s2 <= 0) return false;
        if (s1 > 0 && s2 > 0 && s1 !== s2) return false;
    }
    return nonempty;
}

function _mergeTritte() {
    if (settings.display_pegplan) return;
    let found;
    do {
        found = false;
        for (let i = 0; i < pattern.tieup.width && !found; i++) {
            for (let ii = 0; ii < i; ii++) {
                if (_aufknuepfungsspalteEqual(i, ii)) {
                    for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                        if (pattern.treadling.get(i, j) > 0) {
                            pattern.treadling.set(ii, j, pattern.treadling.get(i, j));
                            pattern.treadling.set(i, j, 0);
                        }
                    }
                    for (let j = 0; j < pattern.tieup.height; j++) {
                        pattern.tieup.set(i, j, 0);
                    }
                    found = true;
                    break;
                }
            }
        }
    } while (found);
}

function _eliminateEmptyTritt() {
    for (let i = 0; i < pattern.tieup.width; i++) {
        if (_isFreeTritt(i)) {
            let firstnon = -1;
            for (let k = i; k < pattern.tieup.width; k++) {
                if (!_isFreeTritt(k)) { firstnon = k; break; }
            }
            if (firstnon === -1 || firstnon < i) return;
            _moveTritt(firstnon, i);
        }
    }
}

function _switchTritte(a, b) {
    for (let j = pattern.min_y; j <= pattern.max_y; j++) {
        const t = pattern.treadling.get(a, j);
        pattern.treadling.set(a, j, pattern.treadling.get(b, j));
        pattern.treadling.set(b, j, t);
    }
    for (let j = 0; j < pattern.tieup.height; j++) {
        const t = pattern.tieup.get(a, j);
        pattern.tieup.set(a, j, pattern.tieup.get(b, j));
        pattern.tieup.set(b, j, t);
    }
}

function _rearrangeTritte(style) {
    if (settings.display_pegplan) return;
    if (pattern.min_y > pattern.max_y) return;
    let i1 = 0, i2 = 0;
    let found = false;
    outerA: for (let ii = 0; ii < pattern.tieup.width; ii++) {
        for (let j = pattern.min_y; j <= pattern.max_y; j++) {
            if (pattern.treadling.get(ii, j) > 0) { i1 = ii; found = true; break outerA; }
        }
    }
    if (!found) return;
    found = false;
    outerB: for (let ii = pattern.tieup.width - 1; ii > 0; ii--) {
        for (let j = pattern.min_y; j <= pattern.max_y; j++) {
            if (pattern.treadling.get(ii, j) > 0) { i2 = ii; found = true; break outerB; }
        }
    }
    if (!found) return;

    _mergeTritte();

    if (style === "minimal-z") {
        outerZ: for (let j = pattern.min_y; j <= pattern.max_y; j++) {
            for (let ii = i1; ii <= i2; ii++) {
                if (pattern.treadling.get(ii, j) > 0) {
                    if (ii > i1) _switchTritte(i1, ii);
                    i1++;
                    if (i1 >= i2) break outerZ;
                }
            }
        }
    } else if (style === "minimal-s") {
        outerS: for (let j = pattern.min_y; j <= pattern.max_y; j++) {
            for (let ii = i2; ii >= i1; ii--) {
                if (pattern.treadling.get(ii, j) > 0) {
                    if (ii < i2) _switchTritte(i2, ii);
                    i2--;
                    if (i2 <= i1) break outerS;
                }
            }
        }
    } else if (style === "gesprungen") {
        let b = 0;
        outerG: for (let j = pattern.min_y; j <= pattern.max_y; j++) {
            for (let ii = i1; ii <= i2; ii++) {
                if (pattern.treadling.get(ii, j) > 0) {
                    if ((b % 2) === 0) {
                        if (ii > i1 && ii <= i2) _switchTritte(i1, ii);
                        i1++;
                        if (i1 >= i2) break outerG;
                    } else {
                        if (ii < i2 && ii >= i1) _switchTritte(i2, ii);
                        i2--;
                        if (i2 <= i1) break outerG;
                    }
                    b = (b + 1) % 2;
                }
            }
        }
    }
    _eliminateEmptyTritt();
}

function _applyTfStyle(style) {
    settings.treadling_arrangement = style;
    _fullSnapCommand("treadling " + style, () => {
        _rearrangeTritte(style);
        // Recalc weave from the new entering+tieup+treadling.
        pattern.recalc_weave();
    });
}


// ---- Phase 8c-2: Threading rearrange (MinimalZ / MinimalS) ---------
//
// Direct port of einzug.cpp::NormalZ / NormalS and helpers (CalcRange,
// IsTotalEmptySchaft, EliminateEmptySchaft, SchaefteEqual, MergeSchaefte,
// SwitchSchaefte, MoveSchaft). GeradeZ/S, Chorig2/3, Fixiert deferred.

let _ezJ1 = 0, _ezJ2 = 0;  // shared state used by the algorithm.

function _ezCalcRange() {
    _ezJ1 = 0; _ezJ2 = 0;
    for (let i = 0; i < pattern.entering.width; i++) {
        const e = pattern.entering.get_shaft(i);
        if (e > 0) {
            if (e - 1 < _ezJ1) _ezJ1 = e - 1;
            if (e - 1 > _ezJ2) _ezJ2 = e - 1;
        }
    }
}

function _isEmptySchaftEz(j) { return _isFreeSchaft(j); }

function _isTotalEmptySchaft(j) {
    if (!settings.display_pegplan) {
        for (let i = 0; i < pattern.tieup.width; i++) {
            if (pattern.tieup.get(i, j) > 0) {
                for (let k = 0; k < pattern.treadling.height; k++) {
                    if (pattern.treadling.get(i, k) > 0) return false;
                }
            }
        }
        return true;
    } else {
        for (let i = 0; i < pattern.pegplan.height; i++) {
            if (pattern.pegplan.get(j, i) > 0) return false;
        }
        return true;
    }
}

function _getFirstNonemptySchaft(jStart) {
    for (let j = jStart + 1; j < pattern.tieup.height; j++) {
        if (!_isEmptySchaftEz(j)) return j;
    }
    return -1;
}

function _moveSchaftEz(from, to) {
    for (let i = 0; i < pattern.entering.width; i++) {
        if (pattern.entering.get_shaft(i) === from + 1) {
            pattern.entering.set_shaft(i, to + 1);
        }
    }
    if (!settings.display_pegplan) {
        for (let i = 0; i < pattern.tieup.width; i++) {
            pattern.tieup.set(i, to, pattern.tieup.get(i, from));
            pattern.tieup.set(i, from, 0);
        }
    } else {
        for (let j = 0; j < pattern.pegplan.height; j++) {
            pattern.pegplan.set(to, j, pattern.pegplan.get(from, j));
            pattern.pegplan.set(from, j, 0);
        }
    }
}

function _eliminateEmptySchaft() {
    for (let j = 0; j < pattern.tieup.height; j++) {
        if (_isTotalEmptySchaft(j)) {
            for (let i = 0; i < pattern.entering.width; i++) {
                if (pattern.entering.get_shaft(i) === j + 1) {
                    pattern.entering.set_shaft(i, 0);
                }
            }
            if (!settings.display_pegplan) {
                for (let i = 0; i < pattern.tieup.width; i++) {
                    if (pattern.tieup.get(i, j) > 0) pattern.tieup.set(i, j, 0);
                }
            }
            const firstnon = _getFirstNonemptySchaft(j);
            if (firstnon === -1 || firstnon < j) return;
            _moveSchaftEz(firstnon, j);
        } else if (_isEmptySchaftEz(j)) {
            const firstnon = _getFirstNonemptySchaft(j);
            if (firstnon === -1 || firstnon < j) {
                if (!settings.display_pegplan) {
                    for (let i = 0; i < pattern.tieup.width; i++) {
                        pattern.tieup.set(i, j, 0);
                    }
                } else {
                    for (let k = 0; k < pattern.pegplan.height; k++) {
                        if (j < pattern.pegplan.width) pattern.pegplan.set(j, k, 0);
                    }
                }
                return;
            }
            _moveSchaftEz(firstnon, j);
        }
    }
}

function _schaefteEqual(j1, j2) {
    if (!settings.display_pegplan) {
        for (let i = 0; i < pattern.tieup.width; i++) {
            const a1 = pattern.tieup.get(i, j1);
            const a2 = pattern.tieup.get(i, j2);
            if ((a1 > 0 && a2 <= 0) || (a1 <= 0 && a2 > 0)) return false;
            if (a1 > 0 && a2 > 0 && a1 !== a2) return false;
        }
        return true;
    } else {
        for (let j = 0; j < pattern.pegplan.height; j++) {
            const t1 = pattern.pegplan.get(j1, j);
            const t2 = pattern.pegplan.get(j2, j);
            if ((t1 > 0 && t2 <= 0) || (t1 <= 0 && t2 > 0)) return false;
            if (t1 > 0 && t2 > 0 && t1 !== t2) return false;
        }
        return true;
    }
}

function _mergeSchaefte() {
    for (let i = pattern.min_x; i <= pattern.max_x; i++) {
        for (let ii = pattern.min_x; ii < i; ii++) {
            const jj1 = pattern.entering.get_shaft(i);
            const jj2 = pattern.entering.get_shaft(ii);
            if (jj1 !== jj2 && jj1 !== 0 && jj2 !== 0) {
                if (_schaefteEqual(jj1 - 1, jj2 - 1)) {
                    let a = jj1 - 1, b = jj2 - 1;
                    if (a > b) { const t = a; a = b; b = t; }
                    for (let k = pattern.min_x; k <= pattern.max_x; k++) {
                        if (pattern.entering.get_shaft(k) - 1 === b) {
                            pattern.entering.set_shaft(k, a + 1);
                        }
                    }
                    if (!settings.display_pegplan) {
                        for (let k = 0; k < pattern.tieup.width; k++) {
                            pattern.tieup.set(k, b, 0);
                        }
                    } else {
                        for (let k = 0; k < pattern.pegplan.height; k++) {
                            if (b < pattern.pegplan.width) pattern.pegplan.set(b, k, 0);
                        }
                    }
                }
            }
        }
    }
}

function _switchSchaefte(a, b) {
    for (let i = pattern.min_x; i <= pattern.max_x; i++) {
        const e = pattern.entering.get_shaft(i);
        if (e === a + 1) pattern.entering.set_shaft(i, b + 1);
        else if (e === b + 1) pattern.entering.set_shaft(i, a + 1);
    }
    if (!settings.display_pegplan) {
        for (let i = 0; i < pattern.tieup.width; i++) {
            const t = pattern.tieup.get(i, a);
            pattern.tieup.set(i, a, pattern.tieup.get(i, b));
            pattern.tieup.set(i, b, t);
        }
    } else {
        for (let j = 0; j < pattern.pegplan.height; j++) {
            const t = pattern.pegplan.get(a, j);
            pattern.pegplan.set(a, j, pattern.pegplan.get(b, j));
            pattern.pegplan.set(b, j, t);
        }
    }
}

function _ezNormalZ() {
    _ezCalcRange();
    if (_ezJ1 >= _ezJ2) return;
    _mergeSchaefte();
    for (let i = pattern.min_x; i <= pattern.max_x; i++) {
        const jj = pattern.entering.get_shaft(i);
        if (jj === 0) continue;
        if (jj - 1 > _ezJ1) _switchSchaefte(_ezJ1, jj - 1);
        _ezJ1++;
        if (_ezJ1 >= _ezJ2) break;
    }
    _eliminateEmptySchaft();
    pattern.recalc_weave_extent();
}

function _ezNormalS() {
    _ezCalcRange();
    if (_ezJ1 >= _ezJ2) return;
    _mergeSchaefte();
    for (let i = pattern.min_x; i <= pattern.max_x; i++) {
        const jj = pattern.entering.get_shaft(i);
        if (jj === 0) continue;
        if (jj - 1 < _ezJ2) _switchSchaefte(_ezJ2, jj - 1);
        _ezJ2--;
        if (_ezJ2 <= _ezJ1) break;
    }
    _eliminateEmptySchaft();
    pattern.recalc_weave_extent();
}

// CalcRapportRange — port of einzug.cpp::CalcRapportRange. Different
// from Pattern.calcRapport: this one compares warp columns purely on
// gewebe content (not on the entering value).
let _ezRA = 0, _ezRB = -1;

function _ezGewebeColEqual(i1, i2) {
    for (let j = pattern.min_y; j <= pattern.max_y; j++) {
        if (pattern.weave.get(i1, j) !== pattern.weave.get(i2, j)) return false;
    }
    return true;
}

function _ezCalcRapportRange() {
    _ezRA = 0; _ezRB = -1;
    const i1 = pattern.min_x, i2 = pattern.max_x;
    if (i1 > i2) return;
    _ezRA = i1; _ezRB = i1;
    let safety = 0;
    outer: while (safety++ < pattern.weave.width) {
        let i;
        for (i = _ezRB + 1; i <= i2; i++) {
            if (_ezGewebeColEqual(_ezRA, i)) break;
        }
        _ezRB = i - 1;
        const len = _ezRB - _ezRA + 1;
        if (len <= 0) break;
        for (let k = _ezRB + 1; k <= i2; k++) {
            const expected = _ezRA + ((k - _ezRB - 1) % len);
            if (!_ezGewebeColEqual(expected, k)) {
                _ezRB++;
                continue outer;
            }
        }
        break;
    }
}

// SplitSchaft — duplicate a shaft into a new (empty) shaft slot for
// every-rapport-period occurrence beyond the first. Port of
// einzug.cpp::SplitSchaft. Uses the rapport range stored in
// _ezRA / _ezRB, computed by _ezCalcRapportRange.
function _splitSchaft(searchj, sourcej) {
    let lastnewj = 0;
    let counter = 0;
    for (let i = _ezRA; i <= _ezRB; i++) {
        if (pattern.entering.get_shaft(i) - 1 === sourcej) {
            if (counter > 0) {
                for (let j = searchj; j < pattern.tieup.height; j++) {
                    if (_isEmptySchaftEz(j)) {
                        lastnewj = j;
                        // Transfer every (i + k * rapportLen) warp using
                        // sourcej shaft to the new shaft slot j.
                        const rapLen = _ezRB - _ezRA + 1;
                        let x = i;
                        while (x < pattern.entering.width) {
                            if (pattern.entering.get_shaft(x) - 1 === sourcej) {
                                pattern.entering.set_shaft(x, j + 1);
                            }
                            x += rapLen;
                        }
                        // Copy tieup row (or pegplan column) from sourcej.
                        if (!settings.display_pegplan) {
                            for (let ii = 0; ii < pattern.tieup.width; ii++) {
                                pattern.tieup.set(ii, j, pattern.tieup.get(ii, sourcej));
                            }
                        } else {
                            for (let k = 0; k < pattern.pegplan.height; k++) {
                                if (j < pattern.pegplan.width) {
                                    pattern.pegplan.set(j, k, pattern.pegplan.get(sourcej, k));
                                }
                            }
                        }
                        break;
                    }
                }
            }
            counter++;
        }
    }
    return lastnewj;
}

function _ezGeradeZ() {
    _ezCalcRange();
    if (_ezJ1 >= _ezJ2) return;
    _ezCalcRapportRange();
    if (pattern.tieup.height < (_ezRB - _ezRA + 1)) return;
    const saveJ1 = _ezJ1;
    _mergeSchaefte();
    // Splitten
    for (let i = _ezRA; i <= _ezRB; i++) {
        const jj = pattern.entering.get_shaft(i);
        if (jj === 0) continue;
        if (jj - 1 <= _ezJ1) {
            const newj = _splitSchaft(_ezJ1, jj - 1);
            if (newj > _ezJ2) _ezJ2 = newj;
        }
        _ezJ1++;
        if (_ezJ1 >= _ezJ2) break;
    }
    // Sortieren
    _ezJ1 = saveJ1;
    for (let i = _ezRA; i <= _ezRB; i++) {
        const jj = pattern.entering.get_shaft(i);
        if (jj === 0) continue;
        if (jj - 1 > _ezJ1) {
            _switchSchaefte(_ezJ1, pattern.entering.get_shaft(i) - 1);
        }
        _ezJ1++;
        if (_ezJ1 >= _ezJ2) break;
    }
    _eliminateEmptySchaft();
    pattern.recalc_weave_extent();
}

function _ezGeradeS() {
    _ezCalcRange();
    if (_ezJ1 >= _ezJ2) return;
    _ezCalcRapportRange();
    if (pattern.tieup.height < (_ezRB - _ezRA + 1)) return;
    const saveJ1 = _ezJ1;
    _mergeSchaefte();
    for (let i = _ezRA; i <= _ezRB; i++) {
        const jj = pattern.entering.get_shaft(i);
        if (jj === 0) continue;
        if (jj - 1 <= _ezJ1) {
            const newj = _splitSchaft(_ezJ1, jj - 1);
            if (newj > _ezJ2) _ezJ2 = newj;
        }
        _ezJ1++;
        if (_ezJ1 >= _ezJ2) break;
    }
    _ezJ1 = saveJ1;
    for (let i = _ezRA; i <= _ezRB; i++) {
        const jj = pattern.entering.get_shaft(i);
        if (jj === 0) continue;
        if (jj - 1 < _ezJ2) {
            _switchSchaefte(_ezJ2, pattern.entering.get_shaft(i) - 1);
        }
        _ezJ2--;
        if (_ezJ2 <= _ezJ1) break;
    }
    _eliminateEmptySchaft();
    pattern.recalc_weave_extent();
}

function _ezChorig2() {
    if (pattern.max_x - pattern.min_x < 2) return;
    _ezCalcRange();
    _mergeSchaefte();
    _ezCalcRapportRange();
    // Schaefte splitten — wherever odd and even warps share a shaft
    for (let i = pattern.min_x + 1; i <= pattern.max_x; i += 2) {
        const s = pattern.entering.get_shaft(i);
        if (s === 0) continue;
        for (let ii = pattern.min_x; ii <= pattern.max_x; ii += 2) {
            const ss = pattern.entering.get_shaft(ii);
            if (ss === 0) continue;
            if (s === ss) _splitSchaft(0, s - 1);
        }
    }
    // Chore 1 sortieren (even warps)
    let endchor1 = 0;
    for (let i = pattern.min_x; i <= pattern.max_x; i += 2) {
        const s = pattern.entering.get_shaft(i);
        if (s === 0) continue;
        if (s > endchor1) {
            endchor1++;
            if (s !== endchor1) _switchSchaefte(s - 1, endchor1 - 1);
        }
    }
    // Chore 2 sortieren (odd warps)
    let max = endchor1;
    for (let i = pattern.min_x + 1; i <= pattern.max_x; i += 2) {
        const s = pattern.entering.get_shaft(i);
        if (s === 0) continue;
        if (s > max) {
            max++;
            if (s !== max) _switchSchaefte(s - 1, max - 1);
        }
    }
    pattern.recalc_weave_extent();
}

function _ezChorig3() {
    if (pattern.max_x - pattern.min_x < 3) return;
    _ezCalcRange();
    _mergeSchaefte();
    _ezCalcRapportRange();
    // Splitten — second-of-three vs first-of-three
    for (let i = pattern.min_x + 1; i <= pattern.max_x; i += 3) {
        const s = pattern.entering.get_shaft(i);
        if (s === 0) continue;
        for (let ii = pattern.min_x; ii <= pattern.max_x; ii += 3) {
            const ss = pattern.entering.get_shaft(ii);
            if (ss === 0) continue;
            if (s === ss) _splitSchaft(0, s - 1);
        }
    }
    // Splitten — third-of-three vs second-of-three and first-of-three
    for (let i = pattern.min_x + 2; i <= pattern.max_x; i += 3) {
        const s = pattern.entering.get_shaft(i);
        if (s === 0) continue;
        for (let ii = pattern.min_x + 1; ii <= pattern.max_x; ii += 3) {
            const ss = pattern.entering.get_shaft(ii);
            if (ss === 0) continue;
            if (s === ss) _splitSchaft(0, s - 1);
        }
        for (let ii = pattern.min_x; ii <= pattern.max_x; ii += 3) {
            const ss = pattern.entering.get_shaft(ii);
            if (ss === 0) continue;
            if (s === ss) _splitSchaft(0, s - 1);
        }
    }
    // Chore 1
    let endchor1 = 0;
    for (let i = pattern.min_x; i <= pattern.max_x; i += 3) {
        const s = pattern.entering.get_shaft(i);
        if (s === 0) continue;
        if (s > endchor1) {
            endchor1++;
            if (s !== endchor1) _switchSchaefte(s - 1, endchor1 - 1);
        }
    }
    // Chore 2
    let endchor2 = endchor1;
    for (let i = pattern.min_x + 1; i <= pattern.max_x; i += 3) {
        const s = pattern.entering.get_shaft(i);
        if (s === 0) continue;
        if (s > endchor2) {
            endchor2++;
            if (s !== endchor2) _switchSchaefte(s - 1, endchor2 - 1);
        }
    }
    // Chore 3
    let max = endchor2;
    for (let i = pattern.min_x + 2; i <= pattern.max_x; i += 3) {
        const s = pattern.entering.get_shaft(i);
        if (s === 0) continue;
        if (s > max) {
            max++;
            if (s !== max) _switchSchaefte(s - 1, max - 1);
        }
    }
    pattern.recalc_weave_extent();
}

function _applyEzStyle(style) {
    settings.threading_arrangement = style;
    _fullSnapCommand("threading " + style, () => {
        if (style === "fixiert") {
            // Fixiert is a recalc-replacement, not a post-recalc shuffle:
            // run the full from-weave path so _recalcEinzugFixiert
            // rebuilds the threading from the saved template.
            pattern.recalc_from_weave(settings);
        } else {
            _runEzArrangement(style);
            pattern.recalc_weave();
        }
    });
}

// ---- Phase 8 (final): EzFixiert (user-defined / fixed threading) ----
//
// Direct port of fixeinzugdialog.cpp + recalc.cpp::RecalcEinzugFixiert.
// When the user marks a threading template via "Threading ▸ User
// defined…", every weave-driven recalc rebuilds the threading from
// that template instead of from the standard recalc_entering algorithm.
//
// The template (fixeinzug[]) lists 1-based shaft numbers, one per
// non-empty warp, and is rapport-extended out to entering width.
// firstfree records the smallest shaft index strictly above the
// highest template-used shaft — values <= firstfree get reused for
// equal-warp matches, values > firstfree are split-off shafts.

function _kettfadenEmptyFix(i) {
    for (let j = pattern.min_y; j <= pattern.max_y; j++) {
        if (pattern.weave.get(i, j) > 0) return false;
    }
    return true;
}

function _kettfadenEqualFix(i1, i2) {
    for (let j = pattern.min_y; j <= pattern.max_y; j++) {
        if (pattern.weave.get(i1, j) !== pattern.weave.get(i2, j)) return false;
    }
    return true;
}

// Returns max_shaft (0-based highest used shaft index, like
// recalc_entering's return-1). Mutates pattern.entering.
function _recalcEinzugFixiert(p) {
    p.entering.clear();
    let firstfree = p.firstfree || 0;
    let k = 0;
    let maxShaft = 0;
    const totalShafts = p.tieup.height;
    for (let i = 0; i < p.entering.width; i++) {
        if (_kettfadenEmptyFix(i)) continue;
        let s = p.fixeinzug[k++] || 0;
        if (s <= 0) {
            // Template ran out: fall back to a free shaft.
            s = firstfree + 1;
            firstfree++;
        }
        // Shaft already free → use directly. Otherwise look back for
        // an earlier identical warp; reuse its shaft if equal, or use
        // an already-allocated split-off shaft for that warp; else
        // bump firstfree.
        if (_isShaftFreeIn(p, s - 1)) {
            p.entering.set_shaft(i, s);
        } else {
            let done = false;
            for (let m = 0; m < i; m++) {
                const sm = p.entering.get_shaft(m);
                if (sm === s) {
                    if (_kettfadenEqualFix(i, m)) {
                        p.entering.set_shaft(i, s);
                        done = true;
                        break;
                    }
                } else if (sm > 0 && sm > p.firstfree
                           && _kettfadenEqualFix(i, m)) {
                    p.entering.set_shaft(i, sm);
                    done = true;
                    break;
                }
            }
            if (!done) {
                let ns = firstfree + 1;
                if (ns > totalShafts) ns = totalShafts; // clamp (no ExtendSchaefte)
                p.entering.set_shaft(i, ns);
                firstfree++;
            }
        }
        const cur = p.entering.get_shaft(i);
        if (cur > maxShaft) maxShaft = cur;
    }
    return maxShaft;
}

// Local "is shaft j (0-based) currently unused in entering" — we can't
// reuse _isFreeSchaft because it inspects the live `pattern` global
// without an explicit argument.
function _isShaftFreeIn(p, j) {
    for (let i = 0; i < p.entering.width; i++) {
        if (p.entering.get_shaft(i) === j + 1) return false;
    }
    return true;
}

// Port of TDBWFRM::UpdateEinzugFixiert. Snapshots the current threading
// into fixeinzug[] (skipping empty warps), then rapports the template
// out to fill the array. firstfree = highest used shaft + 1.
function _updateEinzugFixiert(p) {
    const W = p.entering.width;
    p.fixeinzug = new Array(W).fill(0);
    let ii = 0;
    for (let i = 0; i < W; i++) {
        const s = p.entering.get_shaft(i);
        if (s !== 0) p.fixeinzug[ii++] = s;
    }
    let last = -1;
    for (let i = W - 1; i >= 0; i--) {
        if (p.fixeinzug[i] !== 0) { last = i; break; }
    }
    p.fixsize = last;
    if (last >= 0) {
        let kk = 0;
        for (let i = last + 1; i < W; i++) {
            p.fixeinzug[i] = p.fixeinzug[kk++];
            if (kk > last) kk = 0;
        }
    }
    let ff = 0;
    for (let j = p.tieup.height - 1; j >= 0; j--) {
        if (!_isShaftFreeIn(p, j)) { ff = j + 1; break; }
    }
    p.firstfree = ff;
}

// User-facing dialog: edit fixeinzug as a 12-px-cell grid with mouse +
// keyboard. Menu actions Grab / Delete / Revert / Close.
function showFixeinzugDialog() {
    if (readonly) return;
    const i18n = _getI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;

    // Lazy initial Grab if template empty (matches desktop EditFixeinzug).
    if (!pattern.fixeinzug[0]) _updateEinzugFixiert(pattern);

    const W = pattern.entering.width;
    const totalShafts = pattern.tieup.height;
    const scratchBefore = pattern.fixeinzug.slice();
    const sizeBefore = pattern.fixsize;
    const ffBefore = pattern.firstfree;

    // Editing buffer, isolated from the live pattern until the user
    // closes the dialog (Revert simply discards it).
    const scratch = pattern.fixeinzug.slice();
    let size = pattern.fixsize;

    const calcRange = () => {
        size = 0;
        for (let i = 0; i < W; i++) if (scratch[i] !== 0) size = i;
    };
    const calcFirstFree = () => {
        let ff = 0;
        for (let i = 0; i < W; i++) if (scratch[i] >= ff) ff = scratch[i];
        return ff;
    };

    const cellPx = 16;
    let cx = 0, cy = 0, scrollX = 0;

    const body = document.createElement("div");
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.gap = "0.4rem";
    body.style.minWidth = "640px";

    // Toolbar of menu actions (the desktop puts them under an "Einzug"
    // menu; on the web a flat button row is cleaner).
    const toolbar = document.createElement("div");
    toolbar.style.display = "flex";
    toolbar.style.gap = "0.3rem";
    const addBtn = (label, fn) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.padding = "0.2rem 0.6rem";
        b.addEventListener("click", () => { fn(); canvas.focus(); });
        toolbar.appendChild(b);
        return b;
    };
    body.appendChild(toolbar);

    const canvasWrap = document.createElement("div");
    canvasWrap.style.position = "relative";
    canvasWrap.style.background = "#c0c0c0";
    canvasWrap.style.border = "1px solid #888";
    canvasWrap.style.height = "240px";
    canvasWrap.style.overflow = "hidden";
    body.appendChild(canvasWrap);
    const canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    canvas.style.outline = "none";
    canvas.style.display = "block";
    canvasWrap.appendChild(canvas);

    const scroll = document.createElement("input");
    scroll.type = "range";
    scroll.min = "0";
    scroll.max = String(W);
    scroll.value = "0";
    scroll.step = "1";
    scroll.style.width = "100%";
    body.appendChild(scroll);

    const sizeAndDraw = () => {
        const rect = canvasWrap.getBoundingClientRect();
        canvas.width = Math.max(200, Math.floor(rect.width));
        canvas.height = canvasWrap.clientHeight;
        draw();
    };

    const visibleCols = () => Math.max(1, Math.floor(canvas.width / cellPx));
    const visibleShafts = () => {
        let m = Math.floor(canvas.height / cellPx);
        if (m > totalShafts) m = totalShafts;
        return m;
    };

    const draw = () => {
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#c0c0c0";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const maxx = visibleCols();
        const maxy = visibleShafts();
        const rtl = !!settings.direction_righttoleft;
        const ttb = !!settings.direction_toptobottom;
        ctx.strokeStyle = "#696969";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= maxx; i++) {
            const x = i * cellPx + 0.5;
            ctx.moveTo(x, 0); ctx.lineTo(x, maxy * cellPx);
        }
        for (let j = 0; j <= maxy; j++) {
            const y = j * cellPx + 0.5;
            ctx.moveTo(0, y); ctx.lineTo(maxx * cellPx, y);
        }
        ctx.stroke();
        ctx.fillStyle = "#000";
        for (let i = 0; i < maxx; i++) {
            const src = scrollX + i;
            if (src >= W) break;
            const s = scratch[src];
            if (s === 0) continue;
            if (s - 1 >= maxy) continue;
            const x = rtl ? (maxx - i - 1) * cellPx : i * cellPx;
            const y = ttb ? (s - 1) * cellPx : (maxy - s) * cellPx;
            ctx.fillRect(x + 1, y + 1, cellPx - 2, cellPx - 2);
        }
        // Cursor outline.
        if (document.activeElement === canvas && cx < maxx && cy < maxy) {
            const x = rtl ? (maxx - 1 - cx) * cellPx : cx * cellPx;
            const y = ttb ? cy * cellPx : (maxy - 1 - cy) * cellPx;
            ctx.strokeStyle = "#fff";
            ctx.strokeRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1);
        }
    };

    const toggleAt = (col, shaft) => {
        const src = scrollX + col;
        if (src < 0 || src >= W) return;
        const old = scratch[src];
        scratch[src] = (old === shaft + 1) ? 0 : (shaft + 1);
        calcRange();
        draw();
    };

    canvas.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const maxx = visibleCols();
        const maxy = visibleShafts();
        const rtl = !!settings.direction_righttoleft;
        const ttb = !!settings.direction_toptobottom;
        let i = Math.floor(px / cellPx);
        let j = maxy - 1 - Math.floor(py / cellPx);
        if (i < 0 || j < 0 || i >= maxx || j >= maxy) return;
        if (rtl) i = maxx - 1 - i;
        if (ttb) j = maxy - 1 - j;
        cx = i; cy = j;
        canvas.focus();
        toggleAt(i, j);
    });

    canvas.addEventListener("focus", () => draw());
    canvas.addEventListener("blur",  () => draw());

    canvas.addEventListener("keydown", (e) => {
        const maxx = visibleCols();
        const maxy = visibleShafts();
        const rtl = !!settings.direction_righttoleft;
        const ttb = !!settings.direction_toptobottom;
        const step = (e.ctrlKey || e.metaKey) ? 4 : 1;
        const moveLeft  = () => { cx = Math.max(0, cx - step); };
        const moveRight = () => { cx = Math.min(maxx - 1, cx + step); };
        const moveUp    = () => { cy = Math.min(maxy - 1, cy + step); };
        const moveDown  = () => { cy = Math.max(0, cy - step); };
        switch (e.key) {
        case "ArrowLeft":  rtl ? moveRight() : moveLeft();  break;
        case "ArrowRight": rtl ? moveLeft()  : moveRight(); break;
        case "ArrowUp":    ttb ? moveDown()  : moveUp();    break;
        case "ArrowDown":  ttb ? moveUp()    : moveDown();  break;
        case " ": case "Spacebar":
            toggleAt(cx, cy);
            break;
        default:
            // Block printable/character keys from bubbling up to the
            // global shortcut + keyDown listeners (which would otherwise
            // act on the underlying pattern editor while this dialog is
            // open). Leave Escape / Tab alone so the modal's own
            // backdrop handler can close / focus-trap correctly.
            if (e.key !== "Escape" && e.key !== "Tab") e.stopPropagation();
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        draw();
    });

    scroll.addEventListener("input", () => {
        scrollX = parseInt(scroll.value, 10) || 0;
        draw();
    });

    addBtn(L("fixez.grab", "Take from pattern"), () => {
        // Re-snapshot from live entering into the local scratch buffer.
        _updateEinzugFixiert(pattern);
        for (let i = 0; i < W; i++) scratch[i] = pattern.fixeinzug[i];
        calcRange();
        draw();
    });
    addBtn(L("fixez.delete", "Delete"), () => {
        for (let i = 0; i < W; i++) scratch[i] = 0;
        size = 0;
        draw();
    });

    let modal;
    const accept = () => {
        // Continuity check: 0..size-1 must all be non-zero.
        for (let i = 0; i < size; i++) {
            if (scratch[i] === 0) {
                alert(L("fixez.gap-error",
                    "Threading must be continuous (no gaps)."));
                return;
            }
        }
        // Wrap as one undoable command. _fullSnapCommand snapshots the
        // current pattern state ("before") at entry, runs mutate, then
        // snapshots again ("after") — so we have to restore the live
        // pattern to the pre-dialog fixeinzug values before calling it.
        pattern.fixeinzug = scratchBefore.slice();
        pattern.fixsize = sizeBefore;
        pattern.firstfree = ffBefore;
        const finalScratch = scratch.slice();
        const finalSize = size;
        _fullSnapCommand("user-defined threading", () => {
            pattern.fixeinzug = finalScratch.slice();
            pattern.fixsize = finalSize;
            pattern.firstfree = calcFirstFree();
            if (finalSize >= 0) {
                let kk = 0;
                for (let i = finalSize + 1; i < W; i++) {
                    pattern.fixeinzug[i] = pattern.fixeinzug[kk++];
                    if (kk > finalSize) kk = 0;
                }
            }
            settings.threading_arrangement = "fixiert";
            // Trigger the full recalc-from-weave path so
            // _recalcEinzugFixiert rebuilds entering from the freshly
            // committed template (matches desktop EditFixeinzug, which
            // calls RcRecalcAll::Recalc → RecalcEinzugFixiert).
            pattern.recalc_from_weave(settings);
        });
        modal.close();
    };
    const revert = () => {
        // Discard local edits — restore fixeinzug fields from the
        // snapshot taken when the dialog opened.
        pattern.fixeinzug = scratchBefore.slice();
        pattern.fixsize = sizeBefore;
        pattern.firstfree = ffBefore;
        modal.close();
    };

    modal = Modal.open({
        title: L("fixez.title", "User-defined threading"),
        body,
        buttons: [
            { label: L("fixez.revert", "Revert"), role: "cancel", onClick: revert },
            { label: L("fixez.close",  "Close"),  role: "primary", onClick: accept },
        ],
    });
    setTimeout(() => { sizeAndDraw(); canvas.focus(); }, 0);
    const onResize = () => { if (canvas.isConnected) sizeAndDraw(); };
    window.addEventListener("resize", onResize);
    const origClose = modal.close;
    modal.close = function () {
        window.removeEventListener("resize", onResize);
        return origClose.apply(modal, arguments);
    };
}


// ---- Phase 9: Color management ----------------------------------------
//
// Direct ports of selcolordialog.cpp (palette editor) +
// farbverlaufdialog.cpp (Farbverlauf / blend) + supporting RGB/HSV
// pickers. The web pickers use a native <input type="color"> for the
// RGB editor and three sliders for the HSV editor; both expose the
// same accept(rgb) / cancel contract so the rest of the code stays
// model-agnostic.

const _PAL_COLS = 19;
const _PAL_ROWS = 13;

function _paletteRefreshColors() {
    if (!pattern || !pattern.palette) return;
    for (let i = 0; i < pattern.palette.length; i++) {
        const [r, g, b] = pattern.palette[i];
        colors[i] = `rgb(${r}, ${g}, ${b})`;
    }
}

function _paletteSetEntry(idx, rgb) {
    if (idx < 0 || idx >= pattern.palette.length) return;
    pattern.palette[idx] = [rgb[0] | 0, rgb[1] | 0, rgb[2] | 0];
    colors[idx] = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function _paletteSnapshot() {
    return pattern.palette.map(rgb => rgb.slice());
}
function _paletteRestore(snap) {
    for (let i = 0; i < snap.length && i < pattern.palette.length; i++) {
        _paletteSetEntry(i, snap[i]);
    }
}

// Tiny RGB <-> HSV helpers. H ∈ [0,360), S,V ∈ [0,1].
function _rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const d = mx - mn;
    let h = 0;
    if (d > 0) {
        if (mx === r)      h = ((g - b) / d) % 6;
        else if (mx === g) h = (b - r) / d + 2;
        else               h = (r - g) / d + 4;
        h *= 60; if (h < 0) h += 360;
    }
    const s = mx === 0 ? 0 : d / mx;
    return [h, s, mx];
}
function _hsvToRgb(h, s, v) {
    const c = v * s;
    const hh = (h % 360 + 360) % 360 / 60;
    const x = c * (1 - Math.abs(hh % 2 - 1));
    let r1 = 0, g1 = 0, b1 = 0;
    if (hh < 1)      { r1 = c; g1 = x; }
    else if (hh < 2) { r1 = x; g1 = c; }
    else if (hh < 3) { g1 = c; b1 = x; }
    else if (hh < 4) { g1 = x; b1 = c; }
    else if (hh < 5) { r1 = x; b1 = c; }
    else             { r1 = c; b1 = x; }
    const m = v - c;
    return [Math.round((r1 + m) * 255),
            Math.round((g1 + m) * 255),
            Math.round((b1 + m) * 255)];
}
function _rgbToHex(r, g, b) {
    const h = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, "0");
    return "#" + h(r) + h(g) + h(b);
}
function _hexToRgb(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return [0, 0, 0];
    return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

// Native <input type="color"> picker, wrapped in a callback contract.
// Modern browsers (Safari/Chrome/Firefox) all expose this RGB picker.
function _pickColorRGB(initialRgb, onAccept) {
    const inp = document.createElement("input");
    inp.type = "color";
    inp.value = _rgbToHex(initialRgb[0], initialRgb[1], initialRgb[2]);
    inp.style.position = "fixed";
    inp.style.left = "-9999px";
    document.body.appendChild(inp);
    let resolved = false;
    const cleanup = () => { if (inp.parentNode) inp.parentNode.removeChild(inp); };
    inp.addEventListener("input", () => {
        if (resolved) return;
        resolved = true;
        const rgb = _hexToRgb(inp.value);
        cleanup();
        onAccept(rgb);
    });
    inp.addEventListener("change", () => {
        if (resolved) return;
        resolved = true;
        const rgb = _hexToRgb(inp.value);
        cleanup();
        onAccept(rgb);
    });
    // Fallback cleanup in case the user cancels (no input/change fires).
    setTimeout(() => {
        if (!resolved && !document.activeElement) {
            resolved = true; cleanup();
        }
    }, 60000);
    inp.click();
}

// HSV picker dialog: three sliders + numeric inputs + live swatch.
function _pickColorHSV(initialRgb, onAccept) {
    const i18n = _getI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    let [h, s, v] = _rgbToHsv(initialRgb[0], initialRgb[1], initialRgb[2]);

    // Wheel geometry: square canvas, outer ring = hue, inner disc =
    // S/V square inscribed in the inner ring. Matches the legacy
    // farbauswahl_form (hue wheel + S/V patch).
    const SIZE = 240;
    const RING_OUTER = SIZE / 2 - 4;
    const RING_INNER = RING_OUTER - 22;
    // Inner SV square inscribed in the inner ring.
    const SV_HALF = Math.floor(RING_INNER * Math.SQRT1_2) - 2;

    const body = document.createElement("div");
    body.style.display = "flex";
    body.style.gap = "1rem";
    body.style.minWidth = "560px";
    body.innerHTML = `
        <div>
            <canvas id="tx-hsv-wheel" width="${SIZE}" height="${SIZE}"
                    style="display:block;cursor:crosshair"></canvas>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;gap:0.4rem">
            <div style="display:grid;grid-template-columns:auto 1fr auto;gap:0.4rem 0.6rem;align-items:center">
                <label>${L("color.hue", "Hue:")}</label>
                <input id="tx-hsv-h" type="range" min="0" max="359" step="1">
                <input id="tx-hsv-h-num" type="number" min="0" max="359" step="1" style="width:5rem">
                <label>${L("color.sat", "Saturation:")}</label>
                <input id="tx-hsv-s" type="range" min="0" max="100" step="1">
                <input id="tx-hsv-s-num" type="number" min="0" max="100" step="1" style="width:5rem">
                <label>${L("color.val", "Value:")}</label>
                <input id="tx-hsv-v" type="range" min="0" max="100" step="1">
                <input id="tx-hsv-v-num" type="number" min="0" max="100" step="1" style="width:5rem">
            </div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:0.3rem 0.6rem;font-family:monospace">
                <span>R:</span><span id="tx-hsv-r"></span>
                <span>G:</span><span id="tx-hsv-g"></span>
                <span>B:</span><span id="tx-hsv-b"></span>
            </div>
            <div id="tx-hsv-swatch" style="margin-top:0.4rem;height:48px;border:1px solid #888"></div>
        </div>`;
    const $ = (sel) => body.querySelector(sel);
    const wheel = $("#tx-hsv-wheel");
    const ctx = wheel.getContext("2d");

    // Cache the hue ring as an offscreen image (it never changes).
    let ringCache = null;
    const buildRingCache = () => {
        const off = document.createElement("canvas");
        off.width = SIZE; off.height = SIZE;
        const c = off.getContext("2d");
        const cx = SIZE / 2, cy = SIZE / 2;
        const img = c.createImageData(SIZE, SIZE);
        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                const dx = x - cx, dy = y - cy;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < RING_INNER || d > RING_OUTER) continue;
                let ang = Math.atan2(-dy, dx) * 180 / Math.PI;
                if (ang < 0) ang += 360;
                const [r, g, b] = _hsvToRgb(ang, 1, 1);
                const i = (y * SIZE + x) * 4;
                img.data[i] = r;
                img.data[i + 1] = g;
                img.data[i + 2] = b;
                img.data[i + 3] = 255;
            }
        }
        c.putImageData(img, 0, 0);
        ringCache = off;
    };

    const drawSV = () => {
        // Inner square: x→saturation (0..1), y→value (0..1, top is 1).
        const cx = SIZE / 2, cy = SIZE / 2;
        const x0 = cx - SV_HALF, y0 = cy - SV_HALF;
        const w = SV_HALF * 2, hgt = SV_HALF * 2;
        // Base: hue at full saturation/value.
        const [hr, hg, hb] = _hsvToRgb(h, 1, 1);
        // Horizontal: white → hue.
        const grad1 = ctx.createLinearGradient(x0, 0, x0 + w, 0);
        grad1.addColorStop(0, "#fff");
        grad1.addColorStop(1, `rgb(${hr}, ${hg}, ${hb})`);
        ctx.fillStyle = grad1;
        ctx.fillRect(x0, y0, w, hgt);
        // Vertical: transparent → black.
        const grad2 = ctx.createLinearGradient(0, y0, 0, y0 + hgt);
        grad2.addColorStop(0, "rgba(0,0,0,0)");
        grad2.addColorStop(1, "#000");
        ctx.fillStyle = grad2;
        ctx.fillRect(x0, y0, w, hgt);
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, hgt - 1);

        // SV cursor.
        const sx = x0 + s * w;
        const sy = y0 + (1 - v) * hgt;
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#000";
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
    };

    const drawHueCursor = () => {
        const cx = SIZE / 2, cy = SIZE / 2;
        const r = (RING_INNER + RING_OUTER) / 2;
        const ang = h * Math.PI / 180;
        const x = cx + r * Math.cos(ang);
        const y = cy - r * Math.sin(ang);
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#000";
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#fff";
        ctx.stroke();
    };

    const drawWheel = () => {
        if (!ringCache) buildRingCache();
        ctx.clearRect(0, 0, SIZE, SIZE);
        ctx.drawImage(ringCache, 0, 0);
        drawSV();
        drawHueCursor();
    };

    const sync = () => {
        $("#tx-hsv-h").value = Math.round(h);
        $("#tx-hsv-h-num").value = Math.round(h);
        $("#tx-hsv-s").value = Math.round(s * 100);
        $("#tx-hsv-s-num").value = Math.round(s * 100);
        $("#tx-hsv-v").value = Math.round(v * 100);
        $("#tx-hsv-v-num").value = Math.round(v * 100);
        const [r, g, b] = _hsvToRgb(h, s, v);
        $("#tx-hsv-r").textContent = r;
        $("#tx-hsv-g").textContent = g;
        $("#tx-hsv-b").textContent = b;
        $("#tx-hsv-swatch").style.background = `rgb(${r}, ${g}, ${b})`;
        drawWheel();
    };

    body.addEventListener("input", (e) => {
        const id = e.target.id;
        if (id === "tx-hsv-h" || id === "tx-hsv-h-num") h = +e.target.value;
        else if (id === "tx-hsv-s" || id === "tx-hsv-s-num") s = (+e.target.value) / 100;
        else if (id === "tx-hsv-v" || id === "tx-hsv-v-num") v = (+e.target.value) / 100;
        sync();
    });

    // Wheel hit-testing: ring vs SV square. Drag tracks within the
    // initially-engaged region until pointerup.
    let drag = null;
    const hitTest = (px, py) => {
        const cx = SIZE / 2, cy = SIZE / 2;
        const dx = px - cx, dy = py - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= RING_INNER && d <= RING_OUTER) return "ring";
        if (Math.abs(dx) <= SV_HALF && Math.abs(dy) <= SV_HALF) return "sv";
        return null;
    };
    const updateFromPos = (px, py, mode) => {
        const cx = SIZE / 2, cy = SIZE / 2;
        if (mode === "ring") {
            const dx = px - cx, dy = py - cy;
            let ang = Math.atan2(-dy, dx) * 180 / Math.PI;
            if (ang < 0) ang += 360;
            h = ang;
        } else if (mode === "sv") {
            const x0 = cx - SV_HALF, y0 = cy - SV_HALF;
            const w = SV_HALF * 2;
            s = Math.max(0, Math.min(1, (px - x0) / w));
            v = Math.max(0, Math.min(1, 1 - (py - y0) / w));
        }
        sync();
    };
    const wheelPos = (e) => {
        const rect = wheel.getBoundingClientRect();
        const cx = ((e.touches ? e.touches[0].clientX : e.clientX) - rect.left)
                   * (SIZE / rect.width);
        const cy = ((e.touches ? e.touches[0].clientY : e.clientY) - rect.top)
                   * (SIZE / rect.height);
        return [cx, cy];
    };
    wheel.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const [px, py] = wheelPos(e);
        const mode = hitTest(px, py);
        if (!mode) return;
        drag = mode;
        updateFromPos(px, py, mode);
    });
    const onWinMove = (e) => {
        if (!drag) return;
        const [px, py] = wheelPos(e);
        updateFromPos(px, py, drag);
    };
    const onWinUp = () => { drag = null; };
    window.addEventListener("mousemove", onWinMove);
    window.addEventListener("mouseup", onWinUp);

    sync();

    let modal;
    modal = Modal.open({
        title: L("color.hsv-title", "HSV color picker"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok", "OK"), role: "primary", onClick: () => {
                const rgb = _hsvToRgb(h, s, v);
                modal.close();
                onAccept(rgb);
            }},
        ],
    });
    const origClose = modal.close;
    modal.close = function () {
        window.removeEventListener("mousemove", onWinMove);
        window.removeEventListener("mouseup", onWinUp);
        return origClose.apply(modal, arguments);
    };
}

// Palette editor. 19×13 grid, MAX_PAL_ENTRY-clamped. Cancel/Escape
// reverts the palette (matches desktop selcolordialog.cpp; legacy
// only "Revert changes" inside the dialog committed changes — but to
// match the explicit Cancel button on the web, Cancel reverts).
function showPaletteDialog(onPick) {
    if (readonly && !onPick) return;
    const i18n = _getI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    const n = pattern.palette.length;
    const before = _paletteSnapshot();
    let cur = Math.max(0, Math.min(n - 1, settings.current_color || 0));
    const cellPx = 18;

    const body = document.createElement("div");
    body.style.display = "flex";
    body.style.gap = "0.8rem";
    body.style.minWidth = "560px";

    const left = document.createElement("div");
    body.appendChild(left);

    // Toolbar (Edit RGB / HSV / Revert).
    const tools = document.createElement("div");
    tools.style.display = "flex";
    tools.style.gap = "0.3rem";
    tools.style.marginBottom = "0.4rem";
    const mkBtn = (lbl, fn) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = lbl;
        b.style.padding = "0.2rem 0.6rem";
        b.addEventListener("click", () => { fn(); canvas.focus(); });
        tools.appendChild(b);
        return b;
    };
    left.appendChild(tools);

    const canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    canvas.width  = _PAL_COLS * cellPx + 1;
    canvas.height = _PAL_ROWS * cellPx + 1;
    canvas.style.outline = "none";
    canvas.style.background = "#000";
    left.appendChild(canvas);

    const right = document.createElement("div");
    right.style.minWidth = "180px";
    right.innerHTML = `
        <div style="border:1px solid #888;padding:0.4rem;margin-bottom:0.4rem">
            <div style="font-weight:bold;margin-bottom:0.2rem">${L("color.index", "Index")}</div>
            <div id="tx-pal-idx" style="font-family:monospace"></div>
        </div>
        <div style="border:1px solid #888;padding:0.4rem;margin-bottom:0.4rem">
            <div style="font-weight:bold;margin-bottom:0.2rem">${L("color.rgb-title", "RGB")}</div>
            <div>R: <span id="tx-pal-r" style="font-family:monospace"></span></div>
            <div>G: <span id="tx-pal-g" style="font-family:monospace"></span></div>
            <div>B: <span id="tx-pal-b" style="font-family:monospace"></span></div>
        </div>
        <div style="border:1px solid #888;padding:0.4rem">
            <div style="font-weight:bold;margin-bottom:0.2rem">${L("color.hsv-title", "HSV")}</div>
            <div>H: <span id="tx-pal-h" style="font-family:monospace"></span></div>
            <div>S: <span id="tx-pal-s" style="font-family:monospace"></span></div>
            <div>V: <span id="tx-pal-v" style="font-family:monospace"></span></div>
        </div>`;
    body.appendChild(right);

    const $ = (sel) => right.querySelector(sel);
    const draw = () => {
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let j = 0; j < _PAL_ROWS; j++) {
            for (let i = 0; i < _PAL_COLS; i++) {
                const idx = i + j * _PAL_COLS;
                if (idx >= n) return drawCursor(ctx);
                const [r, g, b] = pattern.palette[idx];
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(i * cellPx + 1, j * cellPx + 1, cellPx - 1, cellPx - 1);
            }
        }
        drawCursor(ctx);
    };
    const drawCursor = (ctx) => {
        const cx = (cur % _PAL_COLS) * cellPx;
        const cy = Math.floor(cur / _PAL_COLS) * cellPx;
        ctx.strokeStyle = document.activeElement === canvas ? "#fff" : "#000";
        ctx.lineWidth = 2;
        ctx.strokeRect(cx + 1, cy + 1, cellPx - 1, cellPx - 1);
    };
    const refreshReadout = () => {
        const [r, g, b] = pattern.palette[cur];
        const [h, s, v] = _rgbToHsv(r, g, b);
        $("#tx-pal-idx").textContent = String(cur + 1);
        $("#tx-pal-r").textContent = r;
        $("#tx-pal-g").textContent = g;
        $("#tx-pal-b").textContent = b;
        $("#tx-pal-h").textContent = Math.round(h) + "°";
        $("#tx-pal-s").textContent = s.toFixed(3);
        $("#tx-pal-v").textContent = v.toFixed(3);
    };
    const refresh = () => { draw(); refreshReadout(); };

    const editRGB = () => {
        _pickColorRGB(pattern.palette[cur], (rgb) => {
            _paletteSetEntry(cur, rgb);
            refresh();
        });
    };
    const editHSV = () => {
        _pickColorHSV(pattern.palette[cur], (rgb) => {
            _paletteSetEntry(cur, rgb);
            refresh();
        });
    };
    mkBtn(L("color.edit-rgb", "Edit RGB…"), editRGB);
    mkBtn(L("color.edit-hsv", "Edit HSV…"), editHSV);
    mkBtn(L("color.revert", "Revert"), () => {
        _paletteRestore(before);
        refresh();
    });

    canvas.addEventListener("focus", draw);
    canvas.addEventListener("blur", draw);
    canvas.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const i = Math.floor((e.clientX - rect.left) / cellPx);
        const j = Math.floor((e.clientY - rect.top) / cellPx);
        const idx = i + j * _PAL_COLS;
        if (idx < 0 || idx >= n) return;
        cur = idx;
        canvas.focus();
        refresh();
    });
    canvas.addEventListener("dblclick", () => editHSV());
    canvas.addEventListener("keydown", (e) => {
        const step = (e.ctrlKey || e.metaKey) ? 5 : 1;
        let i = cur % _PAL_COLS;
        let j = Math.floor(cur / _PAL_COLS);
        switch (e.key) {
        case "ArrowLeft":  i -= step; if (i < 0) { i = _PAL_COLS - 1; j = Math.max(0, j - 1); } break;
        case "ArrowRight": i += step; if (i >= _PAL_COLS) { i = 0; j = Math.min(_PAL_ROWS - 1, j + 1); } break;
        case "ArrowUp":    j -= step; if (j < 0) j = 0; break;
        case "ArrowDown":  j += step; if (j >= _PAL_ROWS) j = _PAL_ROWS - 1; break;
        case "Enter":
        case "Return":     (e.ctrlKey ? editRGB : editHSV)(); e.preventDefault(); e.stopPropagation(); return;
        case "r": case "R": editRGB(); e.preventDefault(); e.stopPropagation(); return;
        case "h": case "H": editHSV(); e.preventDefault(); e.stopPropagation(); return;
        default:
            if (e.key !== "Escape" && e.key !== "Tab") e.stopPropagation();
            return;
        }
        const idx = i + j * _PAL_COLS;
        if (idx < n) cur = idx;
        e.preventDefault();
        e.stopPropagation();
        refresh();
    });

    let modal;
    const accept = () => {
        if (onPick) {
            // Picker mode: caller wants the chosen index, doesn't care
            // about palette edits being kept (but if they happened,
            // they're a side effect — desktop preserves them too).
            onPick(cur, pattern.palette[cur].slice());
        } else {
            // Editor mode: any changes in this session are committed
            // as one undoable command.
            const after = _paletteSnapshot();
            _paletteRestore(before); // restore to capture before-state
            const finalize = () => { _paletteRefreshColors(); _paletteToolboxRefresh(); setModified(); view.draw(); };
            const cmd = {
                label: "edit palette",
                apply()  { _paletteRestore(after);  finalize(); },
                revert() { _paletteRestore(before); finalize(); },
            };
            if (commandBus) commandBus.execute(cmd);
            else cmd.apply();
        }
        modal.close();
    };
    const cancel = () => {
        _paletteRestore(before);
        _paletteRefreshColors();
        view.draw();
        modal.close();
    };

    modal = Modal.open({
        title: L("color.palette-title", "Color definition"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel", onClick: cancel },
            { label: L("btn.ok", "OK"), role: "primary", onClick: accept },
        ],
    });
    setTimeout(() => { canvas.focus(); refresh(); }, 0);
}

// Color blending dialog (Farbverlauf). Direct port of
// farbverlaufdialog.cpp.
let _blendStartColor = [0, 0, 255];
let _blendEndColor   = [255, 255, 0];

function _weightT(x, m) {
    const d = 1.0;
    if (m < 0.125) m = 0.125;
    if (m > 1.0)   m = 1.0;
    if (m > 0.5 || m >= 0.25)
        return (2 * d - 4 * m) * x * x + (4 * m - d) * x;
    return (2 * d - 8 * m) * x * x * x + (8 * m - d) * x * x;
}

function _farbverlaufRGB(start, end, n, weight) {
    const m = weight; // already 0..1
    const out = [];
    for (let i = 0; i < n; i++) {
        const x = (i + 1) / (n + 1);
        const t = _weightT(x, m);
        out.push([
            Math.round(start[0] + (end[0] - start[0]) * t),
            Math.round(start[1] + (end[1] - start[1]) * t),
            Math.round(start[2] + (end[2] - start[2]) * t),
        ]);
    }
    return out;
}

function _farbverlaufHSV(start, end, n, weight) {
    const m = weight;
    const [h1, s1, v1] = _rgbToHsv(start[0], start[1], start[2]);
    const [h2, s2, v2] = _rgbToHsv(end[0],   end[1],   end[2]);
    const out = [];
    for (let i = 0; i < n; i++) {
        const x = (i + 1) / (n + 1);
        const t = _weightT(x, m);
        const h = h1 + (h2 - h1) * t;
        const s = Math.max(0, Math.min(1, s1 + (s2 - s1) * t));
        const v = Math.max(0, Math.min(1, v1 + (v2 - v1) * t));
        out.push(_hsvToRgb(h, s, v));
    }
    return out;
}

function showColorBlendDialog() {
    if (readonly) return;
    const i18n = _getI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;

    const before = _paletteSnapshot();
    let startC = _blendStartColor.slice();
    let endC   = _blendEndColor.slice();
    let steps = 20, position = 1, weight = 50, model = "rgb", noDividers = true;

    const body = document.createElement("div");
    body.style.minWidth = "520px";
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto auto auto auto;gap:0.4rem 0.8rem;align-items:center;margin-bottom:0.6rem">
            <label>${L("color.start", "Start color:")}</label>
            <button id="tx-bl-start" type="button" style="width:80px;height:24px;border:1px solid #888"></button>
            <label>${L("color.end", "End color:")}</label>
            <button id="tx-bl-end"   type="button" style="width:80px;height:24px;border:1px solid #888"></button>
        </div>
        <div style="margin-bottom:0.6rem">
            <label style="margin-right:1rem"><input type="radio" name="tx-bl-model" value="rgb" checked> RGB</label>
            <label><input type="radio" name="tx-bl-model" value="hsv"> HSV</label>
        </div>
        <div style="display:grid;grid-template-columns:auto auto;gap:0.4rem 1rem;align-items:center;margin-bottom:0.6rem">
            <label>${L("color.steps", "Steps:")}</label>
            <input id="tx-bl-steps" type="number" min="1" max="150" step="1" value="20" style="width:5rem">
            <label>${L("color.weight", "Weighting:")}</label>
            <input id="tx-bl-weight" type="range" min="1" max="100" step="1" value="50">
            <label>${L("color.position", "Palette index:")}</label>
            <input id="tx-bl-pos"   type="number" min="1" step="1" value="1" style="width:5rem">
        </div>
        <label style="display:block;margin-bottom:0.4rem">
            <input id="tx-bl-nodiv" type="checkbox" checked>
            ${L("color.no-dividers", "No dividers")}
        </label>
        <canvas id="tx-bl-strip" width="480" height="36" style="display:block;width:480px;border:1px solid #888"></canvas>`;
    const $ = (sel) => body.querySelector(sel);

    $("#tx-bl-pos").max = String(pattern.palette.length - 1);

    const setSwatch = (btn, rgb) => {
        btn.style.background = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    };
    setSwatch($("#tx-bl-start"), startC);
    setSwatch($("#tx-bl-end"),   endC);

    let blendTable = [];
    const recompute = () => {
        blendTable = (model === "rgb")
            ? _farbverlaufRGB(startC, endC, steps, weight / 101)
            : _farbverlaufHSV(startC, endC, steps, weight / 101);
        drawStrip();
    };
    const drawStrip = () => {
        const c = $("#tx-bl-strip");
        const ctx = c.getContext("2d");
        ctx.clearRect(0, 0, c.width, c.height);
        const total = blendTable.length + 2;
        const dx = c.width / total;
        const drawCell = (i, rgb) => {
            ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
            ctx.fillRect(i * dx, 0, dx, c.height);
            if (!noDividers) {
                ctx.strokeStyle = "#000";
                ctx.lineWidth = 1;
                ctx.strokeRect(i * dx + 0.5, 0.5, dx - 1, c.height - 1);
            }
        };
        drawCell(0, startC);
        for (let i = 0; i < blendTable.length; i++) drawCell(i + 1, blendTable[i]);
        drawCell(blendTable.length + 1, endC);
    };

    const onChangeColor = (which) => {
        const cur = (which === "start") ? startC : endC;
        // Mini popup: HSV / RGB / Palette / Copy other.
        const menu = document.createElement("div");
        menu.style.position = "fixed";
        menu.style.background = "#fff";
        menu.style.border = "1px solid #888";
        menu.style.boxShadow = "2px 2px 6px rgba(0,0,0,0.3)";
        menu.style.padding = "4px 0";
        menu.style.zIndex = "10000";
        const r = (which === "start" ? $("#tx-bl-start") : $("#tx-bl-end")).getBoundingClientRect();
        menu.style.left = r.left + "px";
        menu.style.top = (r.bottom + 2) + "px";
        const item = (lbl, fn) => {
            const it = document.createElement("div");
            it.textContent = lbl;
            it.style.padding = "0.3rem 0.8rem";
            it.style.cursor = "pointer";
            it.addEventListener("mouseenter", () => it.style.background = "#eef");
            it.addEventListener("mouseleave", () => it.style.background = "");
            it.addEventListener("click", () => { document.body.removeChild(menu); fn(); });
            menu.appendChild(it);
            return it;
        };
        item(L("color.pick-hsv", "Pick HSV…"), () => {
            _pickColorHSV(cur, (rgb) => {
                if (which === "start") startC = rgb; else endC = rgb;
                setSwatch(which === "start" ? $("#tx-bl-start") : $("#tx-bl-end"), rgb);
                recompute();
            });
        });
        item(L("color.pick-rgb", "Pick RGB…"), () => {
            _pickColorRGB(cur, (rgb) => {
                if (which === "start") startC = rgb; else endC = rgb;
                setSwatch(which === "start" ? $("#tx-bl-start") : $("#tx-bl-end"), rgb);
                recompute();
            });
        });
        item(L("color.pick-palette", "From palette…"), () => {
            showPaletteDialog((idx, rgb) => {
                if (which === "start") startC = rgb; else endC = rgb;
                setSwatch(which === "start" ? $("#tx-bl-start") : $("#tx-bl-end"), rgb);
                recompute();
            });
        });
        item(L("color.copy-other", "Copy other"), () => {
            const other = (which === "start") ? endC : startC;
            if (which === "start") startC = other.slice(); else endC = other.slice();
            setSwatch(which === "start" ? $("#tx-bl-start") : $("#tx-bl-end"),
                      (which === "start") ? startC : endC);
            recompute();
        });
        document.body.appendChild(menu);
        const dismiss = (ev) => {
            if (!menu.contains(ev.target)) {
                if (menu.parentNode) menu.parentNode.removeChild(menu);
                document.removeEventListener("mousedown", dismiss, true);
            }
        };
        setTimeout(() => document.addEventListener("mousedown", dismiss, true), 0);
    };

    $("#tx-bl-start").addEventListener("click", () => onChangeColor("start"));
    $("#tx-bl-end").addEventListener("click", () => onChangeColor("end"));
    body.addEventListener("input", (e) => {
        const id = e.target.id;
        if (id === "tx-bl-steps")  steps    = Math.max(1, Math.min(150, +e.target.value | 0));
        else if (id === "tx-bl-weight") weight = +e.target.value;
        else if (id === "tx-bl-pos")    position = +e.target.value | 0;
        else if (id === "tx-bl-nodiv")  noDividers = e.target.checked;
        else if (e.target.name === "tx-bl-model") model = e.target.value;
        recompute();
    });
    body.addEventListener("change", (e) => {
        if (e.target.id === "tx-bl-nodiv") {
            noDividers = e.target.checked;
            drawStrip();
        }
    });
    body.addEventListener("click", (e) => {
        if (e.target.name === "tx-bl-model") { model = e.target.value; recompute(); }
    });

    let modal;
    const accept = () => {
        const idx = position - 1;
        if (idx < 0 || idx >= pattern.palette.length) {
            alert(L("color.idx-oor", "Palette index out of range."));
            return;
        }
        // Commit start + steps + end as one undoable palette command.
        const after = _paletteSnapshot();
        // First, restore to before-state, then build "after" by writing
        // start, blendTable, end.
        _paletteRestore(before);
        const apply = () => {
            _paletteSetEntry(idx, startC);
            for (let i = 0; i < blendTable.length; i++) {
                const k = idx + 1 + i;
                if (k >= pattern.palette.length) break;
                _paletteSetEntry(k, blendTable[i]);
            }
            const endIdx = idx + blendTable.length + 1;
            if (endIdx < pattern.palette.length) _paletteSetEntry(endIdx, endC);
        };
        apply();
        const computedAfter = _paletteSnapshot();
        _paletteRestore(before);
        const finalize = () => { _paletteRefreshColors(); _paletteToolboxRefresh(); setModified(); view.draw(); };
        const cmd = {
            label: "color blending",
            apply()  { _paletteRestore(computedAfter); finalize(); },
            revert() { _paletteRestore(before);        finalize(); },
        };
        if (commandBus) commandBus.execute(cmd);
        else cmd.apply();
        _blendStartColor = startC.slice();
        _blendEndColor   = endC.slice();
        modal.close();
    };

    modal = Modal.open({
        title: L("color.blend-title", "Create color blending"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok", "OK"), role: "primary", onClick: accept },
        ],
    });
    setTimeout(() => { recompute(); }, 0);
}


// ---- Phase 9 (extras): bulk-color operations -------------------------
//
// Direct ports of setcolors.cpp click handlers. All routed through
// commandBus as full-pattern snapshot commands so they participate in
// undo/redo.

function _bulkColorCommand(label, mutate) {
    if (readonly) return;
    const before = _fullPatternSnapshot();
    mutate();
    const after = _fullPatternSnapshot();
    _restoreFullPatternSnapshot(before);
    const finalize = () => { setModified(); view.draw(); };
    const cmd = {
        label,
        apply()  { _restoreFullPatternSnapshot(after);  finalize(); },
        revert() { _restoreFullPatternSnapshot(before); finalize(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else cmd.apply();
}

// Open palette in picker mode and call onPick(idx). Convenience wrapper
// that hides the rgb argument from the call site.
function _pickPaletteIndex(onPick) {
    showPaletteDialog((idx) => onPick(idx));
}

// Palette toolbox — docked DOM panel next to the canvas. Port of the
// desktop's ViewFarbpalette toggle: shows the full palette as a grid of
// clickable swatches, lets the user set settings.current_color quickly
// without leaving the canvas. Toggling it reshuffles the canvas layout
// (the panel takes up a fixed slice of the container width).

// Compute the column-major layout: as many rows as fit in the panel's
// available vertical space, then enough columns to hold MAX_PAL_ENTRY.
// Mirrors desktop palettepanel.cpp::columnsFor.
function _paletteToolboxLayout() {
    const panel = document.getElementById("palette-panel");
    const grid  = document.getElementById("palette-panel-grid");
    if (!panel || !grid) return { rows: 1, cols: 1 };
    // Cell edge in CSS px (matches desktop CELL = 18).
    const cell = parseInt(getComputedStyle(panel).getPropertyValue("--tx-pal-cell")) || 18;
    // Inner usable height = panel height − vertical padding (top+bottom).
    const cs = getComputedStyle(panel);
    const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const avail = Math.max(cell, panel.clientHeight - padV);
    const n = pattern.palette.length;
    const rowsFit = Math.max(1, Math.floor(avail / cell));
    const cols = Math.max(1, Math.ceil(n / rowsFit));
    grid.style.gridTemplateRows = `repeat(${rowsFit}, ${cell}px)`;
    return { rows: rowsFit, cols, cell, n };
}

function _paletteToolboxRefresh() {
    const grid = document.getElementById("palette-panel-grid");
    if (!grid) return;
    const lay = _paletteToolboxLayout();
    const n = pattern.palette.length;
    if (grid.childElementCount !== n) {
        grid.innerHTML = "";
        for (let i = 0; i < n; i++) {
            const cell = document.createElement("div");
            cell.className = "palette-cell";
            cell.dataset.idx = String(i);
            cell.title = `${i + 1}`;
            cell.addEventListener("click", () => {
                settings.current_color = i;
                update_color_selector(settings);
                _paletteToolboxRefresh();
                ActionRegistry.notify();
            });
            cell.addEventListener("dblclick", () => {
                _pickColorHSV(pattern.palette[i], (rgb) => {
                    const before = _paletteSnapshot();
                    _paletteSetEntry(i, rgb);
                    const after = _paletteSnapshot();
                    _paletteRestore(before);
                    const finalize = () => { _paletteRefreshColors(); _paletteToolboxRefresh(); setModified(); view.draw(); };
                    const cmd = {
                        label: "edit palette entry",
                        apply()  { _paletteRestore(after);  finalize(); },
                        revert() { _paletteRestore(before); finalize(); },
                    };
                    if (commandBus) commandBus.execute(cmd);
                    else cmd.apply();
                });
            });
            grid.appendChild(cell);
        }
    }
    for (let i = 0; i < n; i++) {
        const el = grid.children[i];
        const [r, g, b] = pattern.palette[i];
        el.style.background = `rgb(${r}, ${g}, ${b})`;
        el.classList.toggle("selected", i === settings.current_color);
    }
    // Resize observer: re-layout if the available height changes (e.g.
    // the user resizes the window).
    if (!grid._resizeObs) {
        const obs = new ResizeObserver(() => _paletteToolboxLayout());
        obs.observe(document.getElementById("palette-panel"));
        grid._resizeObs = obs;
    }
}

function _paletteToolboxToggle() {
    const panel = document.getElementById("palette-panel");
    if (!panel) return;
    settings.display_palette = !settings.display_palette;
    _paletteToolboxApply();
    ActionRegistry.notify();
}

// Apply current display_palette setting: show/hide the panel and
// re-flow the canvas (canvas.width is recomputed from the container's
// new clientWidth, then view.layout() / view.draw() repaint).
function _paletteToolboxApply() {
    const panel = document.getElementById("palette-panel");
    const container = document.getElementById("container");
    if (!panel || !container) return;
    // Populate the grid BEFORE measuring the canvas. The first time the
    // panel becomes visible the grid would otherwise be empty (zero
    // width), the canvas would claim almost-full container width, and
    // a moment later the refresh would add 236 cells, push the panel
    // wider, and leave the canvas's bitmap drawn at a stale width.
    if (settings.display_palette) {
        panel.classList.remove("hidden");
        _paletteToolboxRefresh();
    } else {
        panel.classList.add("hidden");
    }
    // Force a synchronous reflow so canvas.clientWidth reflects both
    // the visibility change AND the populated grid's contribution to
    // the panel width.
    void container.offsetWidth;
    const canvas = document.getElementById("canvas");
    if (canvas) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
    }
    if (view) {
        view.layout();
        view.draw();
    }
}

// Fill all warp cells with the picked palette index. Port of
// SetKettfarbeClick.
function _colorsSetWarp() {
    _pickPaletteIndex((idx) => {
        _bulkColorCommand("set warp color", () => {
            for (let i = 0; i < pattern.color_warp.width; i++) {
                pattern.color_warp.set(i, 0, idx);
            }
            settings.current_color = idx;
        });
        update_color_selector(settings);
    });
}

// Fill all weft cells. Port of SetSchussfarbeClick.
function _colorsSetWeft() {
    _pickPaletteIndex((idx) => {
        _bulkColorCommand("set weft color", () => {
            for (let j = 0; j < pattern.color_weft.height; j++) {
                pattern.color_weft.set(0, j, idx);
            }
            settings.current_color = idx;
        });
        update_color_selector(settings);
    });
}

// Replace-color-at-cursor. Port of ReplaceColorClick — works only
// when the cursor is on the warp- or weft-color strip.
function _colorsReplace() {
    if (readonly) return;
    let oldIdx, isWarp;
    if (cursor.selected_part === "color_warp") {
        oldIdx = pattern.color_warp.get(cursor.x1, 0);
        isWarp = true;
    } else if (cursor.selected_part === "color_weft") {
        oldIdx = pattern.color_weft.get(0, cursor.y1);
        isWarp = false;
    } else {
        return;
    }
    _pickPaletteIndex((newIdx) => {
        if (newIdx === oldIdx) return;
        _bulkColorCommand("replace color", () => {
            if (isWarp) {
                for (let i = 0; i < pattern.color_warp.width; i++) {
                    if (pattern.color_warp.get(i, 0) === oldIdx) {
                        pattern.color_warp.set(i, 0, newIdx);
                    }
                }
            } else {
                for (let j = 0; j < pattern.color_weft.height; j++) {
                    if (pattern.color_weft.get(0, j) === oldIdx) {
                        pattern.color_weft.set(0, j, newIdx);
                    }
                }
            }
            settings.current_color = newIdx;
        });
        update_color_selector(settings);
    });
}

// Swap warp ↔ weft color arrays up to the shorter axis. Port of
// SwitchColorsClick.
function _colorsSwitch() {
    _bulkColorCommand("switch warp/weft colors", () => {
        const n = Math.min(pattern.color_warp.width, pattern.color_weft.height);
        for (let i = 0; i < n; i++) {
            const t = pattern.color_warp.get(i, 0);
            pattern.color_warp.set(i, 0, pattern.color_weft.get(0, i));
            pattern.color_weft.set(0, i, t);
        }
    });
}

// Copy warp colors → weft colors (KettfarbenWieSchussfarbenClick reads
// the desktop name backwards: it sets *kettfarben* from *schussfarben*).
// Web port follows the desktop literal: Warp ← Weft.
function _colorsWarpFromWeft() {
    _bulkColorCommand("warp colors from weft", () => {
        const n = Math.min(pattern.color_warp.width, pattern.color_weft.height);
        for (let i = 0; i < n; i++) {
            pattern.color_warp.set(i, 0, pattern.color_weft.get(0, i));
        }
    });
}

function _colorsWeftFromWarp() {
    _bulkColorCommand("weft colors from warp", () => {
        const n = Math.min(pattern.color_warp.width, pattern.color_weft.height);
        for (let i = 0; i < n; i++) {
            pattern.color_weft.set(0, i, pattern.color_warp.get(i, 0));
        }
    });
}


// ---- Phase 12: Options + Grundeinstellung (per-device localStorage) -
//
// Direct port of the desktop's Extras menu structure:
//   Extras
//     Grundeinstellung ▸ Amerikanisch / Skandinavisch / Deutsch-Schweiz.
//     Optionen        ▸ Für dieses Muster… / Global…
//
// Grundeinstellung items apply a base preset to BOTH the active
// pattern AND the localStorage prefs (so File > New picks them up).
// They aren't a radio group — the user is free to mix afterwards.
//
// Optionen "Für dieses Muster…" mutates only the live `settings`.
// Optionen "Global…" mutates the live `settings` AND saves the same
// values into localStorage, so subsequent new patterns get them.
//
// Settings that the desktop has but the web port hasn't implemented
// (alternate palette, alternate pegplan view, harness mode, multi
// treadle, harness/treadle counts) are still exposed in the dialog
// and persisted, but their value has no in-app effect yet — they
// graduate to actual behaviour as those features land.

const _PREFS_KEY = "tx_dbweave_prefs_v1";
const _PREFS_DEFAULTS = {
    // Symbols
    entering_style:    "vdash",
    treadling_style:   "dot",
    tieup_style:       "cross",
    pegplan_style:     "filled",
    aushebung_style:   "rising",
    anbindung_style:   "cross",
    abbindung_style:   "circle",
    // Ansicht
    direction_righttoleft: false,
    direction_toptobottom: false,
    entering_at_bottom:    false,
    color_effect_with_grid: false,
    alt_palette:    false,   // no-op: palette2 not yet ported
    alt_pegplan:    false,   // no-op
    // Einstellungen
    single_treadling: true,
    sinking_shed:     false, // no-op: rendering doesn't honour it yet
    // Grössen — desktop allows resizing; web pattern dimensions are
    // fixed at create time, so these are display-only / no-op.
    max_shafts:       16,
    max_treadles:     16,
    visible_shafts:   16,
    visible_treadles: 16,
    warp_threads:     400,
    weft_threads:     400,
    // Raster (== unit_width / unit_height in the existing setting)
    unit_width:  4,
    unit_height: 4,
    // Simulation
    warp_factor: 1.0,
    weft_factor: 1.0,
};

function _prefsLoad() {
    try {
        const raw = window.localStorage.getItem(_PREFS_KEY);
        if (!raw) return Object.assign({}, _PREFS_DEFAULTS);
        const obj = JSON.parse(raw);
        return Object.assign({}, _PREFS_DEFAULTS, obj);
    } catch (e) {
        return Object.assign({}, _PREFS_DEFAULTS);
    }
}

function _prefsSave(prefs) {
    try {
        window.localStorage.setItem(_PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
        // Quota / private mode — silently ignore. Prefs are best-effort.
    }
}

// Push the option values onto the active settings + view. Symbol
// styles, direction flags, single-treadle and the unit-grid sliders
// take effect immediately; the rest are stored on `settings` (or
// remembered in prefs) but currently no-ops.
function _optionsApplyToSettings(opts) {
    settings.entering_style  = opts.entering_style;
    settings.tieup_style     = opts.tieup_style;
    settings.treadling_style = opts.treadling_style;
    // Pegplan / Aushebung / Anbindung / Abbindung styles aren't yet
    // wired through to per-cell painters; remember them anyway.
    settings.pegplan_style   = opts.pegplan_style;
    settings.aushebung_style = opts.aushebung_style;
    settings.anbindung_style = opts.anbindung_style;
    settings.abbindung_style = opts.abbindung_style;
    settings.direction_righttoleft  = !!opts.direction_righttoleft;
    settings.direction_toptobottom  = !!opts.direction_toptobottom;
    settings.entering_at_bottom     = !!opts.entering_at_bottom;
    settings.color_effect_with_grid = !!opts.color_effect_with_grid;
    settings.alt_palette = !!opts.alt_palette;   // no-op
    settings.alt_pegplan = !!opts.alt_pegplan;   // no-op
    settings.single_treadling = !!opts.single_treadling;
    settings.sinking_shed = !!opts.sinking_shed; // no-op
    settings.unit_width  = opts.unit_width  | 0;
    settings.unit_height = opts.unit_height | 0;
    if (typeof view !== "undefined" && view) {
        view.layout();
        view.draw();
    }
    setModified();
}

// Grundeinstellung presets — direct ports of OptAmericanClick /
// OptSkandinavischClick / OptSwissClick from mainwindow.cpp:1759–1832.
// Each helper updates the live settings AND persists into the prefs
// (so File > New picks the same look). Not a radio group — the user
// can adjust individual fields afterwards.
const _BASE_STYLES = {
    swiss: {
        entering_style: "vdash", tieup_style: "cross", treadling_style: "dot",
        pegplan_style: "filled",
        direction_righttoleft: false, direction_toptobottom: false,
        entering_at_bottom: false, sinking_shed: false,
    },
    scandinavian: {
        entering_style: "filled", tieup_style: "filled", treadling_style: "filled",
        pegplan_style: "filled",
        direction_righttoleft: true, direction_toptobottom: true,
        entering_at_bottom: true,  sinking_shed: true,
    },
    american: {
        entering_style: "filled", tieup_style: "filled", treadling_style: "filled",
        pegplan_style: "filled",
        direction_righttoleft: true, direction_toptobottom: false,
        entering_at_bottom: false, sinking_shed: false,
    },
};

function _applyBaseStyle(name) {
    const base = _BASE_STYLES[name];
    if (!base) return;
    // Persist globally first.
    const prefs = _prefsLoad();
    Object.assign(prefs, base);
    _prefsSave(prefs);
    // Then apply to the live document (matches desktop, which does both).
    Object.keys(base).forEach(k => { settings[k] = base[k]; });
    if (typeof view !== "undefined" && view) {
        view.layout();
        view.draw();
    }
    setModified();
    ActionRegistry.notify();
}

// Style options for the Symbols tab. Web painter keys on the left,
// localised desktop-style label on the right (used as fallback).
// `withNumber` controls whether the "Number" entry is offered (matches
// loadCombo(..., true) on desktop — only Threading / Tie-up / Pegplan).
const _SYMBOL_OPTS = [
    ["filled",      "Filled"],
    ["vdash",       "Vertical"],
    ["cross",       "Cross"],
    ["dot",         "Point"],
    ["circle",      "Circle"],
    ["rising",      "Rising"],
    ["falling",     "Falling"],
    ["smallcross",  "Small cross"],
    ["smallcircle", "Small circle"],
    ["number",      "Number"],
];

// Tabbed Optionen dialog — full port of XOptionsDialog (xoptionsdialog.cpp).
// `global=true`: also save edits to localStorage. `global=false`: per-pattern.
function showOptionsDialog(global) {
    const i18n = _getI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    const prefs = _prefsLoad();

    // Seed from live settings; missing fields fall back to prefs.
    const cur = {
        entering_style:    settings.entering_style    ?? prefs.entering_style,
        treadling_style:   settings.treadling_style   ?? prefs.treadling_style,
        tieup_style:       settings.tieup_style       ?? prefs.tieup_style,
        pegplan_style:     settings.pegplan_style     ?? prefs.pegplan_style,
        aushebung_style:   settings.aushebung_style   ?? prefs.aushebung_style,
        anbindung_style:   settings.anbindung_style   ?? prefs.anbindung_style,
        abbindung_style:   settings.abbindung_style   ?? prefs.abbindung_style,
        direction_righttoleft: !!settings.direction_righttoleft,
        direction_toptobottom: !!settings.direction_toptobottom,
        entering_at_bottom:    !!settings.entering_at_bottom,
        color_effect_with_grid: !!settings.color_effect_with_grid,
        alt_palette: !!(settings.alt_palette ?? prefs.alt_palette),
        alt_pegplan: !!(settings.alt_pegplan ?? prefs.alt_pegplan),
        single_treadling: settings.single_treadling !== false,
        sinking_shed: !!(settings.sinking_shed ?? prefs.sinking_shed),
        max_shafts:       (pattern && pattern.tieup) ? pattern.tieup.height : prefs.max_shafts,
        max_treadles:     (pattern && pattern.tieup) ? pattern.tieup.width  : prefs.max_treadles,
        visible_shafts:   prefs.visible_shafts,
        visible_treadles: prefs.visible_treadles,
        warp_threads:     (pattern && pattern.weave) ? pattern.weave.width  : prefs.warp_threads,
        weft_threads:     (pattern && pattern.weave) ? pattern.weave.height : prefs.weft_threads,
        unit_width:  settings.unit_width  | 0 || prefs.unit_width,
        unit_height: settings.unit_height | 0 || prefs.unit_height,
        warp_factor: +settings.warp_factor || prefs.warp_factor,
        weft_factor: +settings.weft_factor || prefs.weft_factor,
    };

    const symbolOptionsHtml = (withNumber) =>
        _SYMBOL_OPTS
            .filter(([k]) => withNumber || k !== "number")
            .map(([v, lbl]) => `<option value="${v}">${L("color.style-" + v, lbl)}</option>`)
            .join("");

    const body = document.createElement("div");
    body.style.minWidth = "640px";
    body.innerHTML = `
        <div class="tx-tabs" style="border-bottom:1px solid #888;display:flex;gap:0.2rem">
            <button data-tab="sizes"    class="tx-tab" type="button">${L("opt.tab-sizes", "Sizes")}</button>
            <button data-tab="view"     class="tx-tab" type="button">${L("opt.tab-view", "View")}</button>
            <button data-tab="symbols"  class="tx-tab" type="button">${L("opt.tab-symbols", "Symbols")}</button>
            <button data-tab="settings" class="tx-tab" type="button">${L("opt.tab-settings", "Settings")}</button>
            <button data-tab="grid"     class="tx-tab" type="button">${L("opt.tab-grid", "Grid")}</button>
        </div>
        <div class="tx-tab-pane" data-pane="sizes" style="padding:0.6rem 0">
            <fieldset style="border:1px solid #888;padding:0.4rem 0.6rem">
                <legend>${L("opt.size", "Size")}</legend>
                <div style="display:grid;grid-template-columns:auto 6rem auto 6rem;gap:0.4rem 1rem;align-items:center">
                    <label>${L("opt.harnesses", "Harnesses:")}</label>
                    <input id="tx-opt-shafts"   type="number" min="1" max="100" step="1">
                    <label>${L("opt.treadles", "Treadles:")}</label>
                    <input id="tx-opt-treadles" type="number" min="1" max="100" step="1">
                    <label>${L("opt.warpthreads", "Warp threads:")}</label>
                    <input id="tx-opt-warps"    type="number" min="1" max="10000" step="1">
                    <label>${L("opt.weftthreads", "Weft threads:")}</label>
                    <input id="tx-opt-wefts"    type="number" min="1" max="10000" step="1">
                </div>
            </fieldset>
            <fieldset style="border:1px solid #888;padding:0.4rem 0.6rem;margin-top:0.6rem">
                <legend>${L("opt.visibility", "Visibility")}</legend>
                <div style="display:grid;grid-template-columns:auto 6rem auto 6rem;gap:0.4rem 1rem;align-items:center">
                    <label>${L("opt.visible-harnesses", "Visible harnesses:")}</label>
                    <input id="tx-opt-vshafts"   type="number" min="0" max="100" step="1">
                    <label>${L("opt.visible-treadles", "Visible treadles:")}</label>
                    <input id="tx-opt-vtreadles" type="number" min="0" max="100" step="1">
                </div>
            </fieldset>
            <div style="margin-top:0.4rem;font-size:0.85em;color:#888">
                ${L("opt.size-note",
                    "Pattern dimensions are fixed at create time in the web editor; the values are kept for forward compatibility.")}
            </div>
        </div>
        <div class="tx-tab-pane" data-pane="view" style="display:none;padding:0.6rem 0">
            <div style="display:flex;flex-direction:column;gap:0.3rem">
                <label><input id="tx-opt-eab" type="checkbox"> ${L("opt.threading-below", "Threading below pattern")}</label>
                <label><input id="tx-opt-rtl" type="checkbox"> ${L("opt.work-rtl", "Work direction in threading and pattern from right to left")}</label>
                <label><input id="tx-opt-ttb" type="checkbox"> ${L("opt.work-ttb", "Work direction in threading and tie-up from top to bottom")}</label>
                <label><input id="tx-opt-fewr" type="checkbox"> ${L("opt.fe-with-raster", "Color effect with grid")}</label>
                <label><input id="tx-opt-altpal" type="checkbox"> ${L("opt.alt-palette", "Use alternate color palette")}</label>
                <label><input id="tx-opt-altpeg" type="checkbox"> ${L("opt.alt-pegplan", "Use alternate pegplan view")}</label>
            </div>
        </div>
        <div class="tx-tab-pane" data-pane="symbols" style="display:none;padding:0.6rem 0">
            <div style="display:grid;grid-template-columns:auto 1fr;gap:0.4rem 1rem;align-items:center">
                <label>${L("opt.threading", "Threading:")}</label>
                <select id="tx-opt-sym-ez">${symbolOptionsHtml(true)}</select>
                <label>${L("opt.treadling", "Treadling:")}</label>
                <select id="tx-opt-sym-tf">${symbolOptionsHtml(false)}</select>
                <label>${L("opt.tieup", "Tie-up:")}</label>
                <select id="tx-opt-sym-au">${symbolOptionsHtml(true)}</select>
                <label>${L("opt.pegplan", "Pegplan:")}</label>
                <select id="tx-opt-sym-sp">${symbolOptionsHtml(true)}</select>
                <label>${L("opt.lift-out", "Lift out:")}</label>
                <select id="tx-opt-sym-au-lift">${symbolOptionsHtml(false)}</select>
                <label>${L("opt.binding", "Binding:")}</label>
                <select id="tx-opt-sym-anb">${symbolOptionsHtml(false)}</select>
                <label>${L("opt.unbinding", "Unbinding:")}</label>
                <select id="tx-opt-sym-abb">${symbolOptionsHtml(false)}</select>
            </div>
        </div>
        <div class="tx-tab-pane" data-pane="settings" style="display:none;padding:0.6rem 0">
            <fieldset style="border:1px solid #888;padding:0.4rem 0.6rem">
                <legend>${L("opt.treadle-mode", "Treadle mode")}</legend>
                <label><input type="radio" name="tx-opt-tt" value="single"> ${L("opt.single-tt", "Single treadle")}</label>
                <label style="margin-left:1rem"><input type="radio" name="tx-opt-tt" value="multi"> ${L("opt.multi-tt", "Multi treadle")}</label>
            </fieldset>
            <fieldset style="border:1px solid #888;padding:0.4rem 0.6rem;margin-top:0.6rem">
                <legend>${L("opt.harness-mode", "Harness mode")}</legend>
                <label><input type="radio" name="tx-opt-shed" value="rising"> ${L("opt.rising-shed", "Rising shed")}</label>
                <label style="margin-left:1rem"><input type="radio" name="tx-opt-shed" value="sinking"> ${L("opt.sinking-shed", "Sinking shed")}</label>
            </fieldset>
        </div>
        <div class="tx-tab-pane" data-pane="grid" style="display:none;padding:0.6rem 0">
            <fieldset style="border:1px solid #888;padding:0.4rem 0.6rem">
                <legend>${L("opt.gridsetting", "Gridsetting")}</legend>
                <div style="display:grid;grid-template-columns:auto 6rem;gap:0.4rem 1rem;align-items:center">
                    <label>${L("opt.gh", "Horizontal:")}</label>
                    <input id="tx-opt-uw" type="number" min="0" max="100" step="1">
                    <label>${L("opt.gv", "Vertical:")}</label>
                    <input id="tx-opt-uh" type="number" min="0" max="100" step="1">
                </div>
            </fieldset>
        </div>
        `;
    const $ = (sel) => body.querySelector(sel);
    const $$ = (sel) => body.querySelectorAll(sel);

    // Tab switching.
    const showTab = (name) => {
        $$(".tx-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
        $$(".tx-tab-pane").forEach(p => p.style.display = (p.dataset.pane === name) ? "" : "none");
    };
    $$(".tx-tab").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
    showTab("sizes");

    // Populate from cur.
    $("#tx-opt-shafts").value    = cur.max_shafts;
    $("#tx-opt-treadles").value  = cur.max_treadles;
    $("#tx-opt-warps").value     = cur.warp_threads;
    $("#tx-opt-wefts").value     = cur.weft_threads;
    $("#tx-opt-vshafts").value   = cur.visible_shafts;
    $("#tx-opt-vtreadles").value = cur.visible_treadles;
    $("#tx-opt-eab").checked     = cur.entering_at_bottom;
    $("#tx-opt-rtl").checked     = cur.direction_righttoleft;
    $("#tx-opt-ttb").checked     = cur.direction_toptobottom;
    $("#tx-opt-fewr").checked    = cur.color_effect_with_grid;
    $("#tx-opt-altpal").checked  = cur.alt_palette;
    $("#tx-opt-altpeg").checked  = cur.alt_pegplan;
    $("#tx-opt-sym-ez").value      = cur.entering_style;
    $("#tx-opt-sym-tf").value      = cur.treadling_style;
    $("#tx-opt-sym-au").value      = cur.tieup_style;
    $("#tx-opt-sym-sp").value      = cur.pegplan_style;
    $("#tx-opt-sym-au-lift").value = cur.aushebung_style;
    $("#tx-opt-sym-anb").value     = cur.anbindung_style;
    $("#tx-opt-sym-abb").value     = cur.abbindung_style;
    $$("input[name='tx-opt-tt']").forEach(r => r.checked = (r.value === (cur.single_treadling ? "single" : "multi")));
    $$("input[name='tx-opt-shed']").forEach(r => r.checked = (r.value === (cur.sinking_shed ? "sinking" : "rising")));
    $("#tx-opt-uw").value = cur.unit_width;
    $("#tx-opt-uh").value = cur.unit_height;

    const collect = () => ({
        // Sizes (dimensions): no-op in web — kept for forward-compat.
        max_shafts:       parseInt($("#tx-opt-shafts").value, 10)   || cur.max_shafts,
        max_treadles:     parseInt($("#tx-opt-treadles").value, 10) || cur.max_treadles,
        warp_threads:     parseInt($("#tx-opt-warps").value, 10)    || cur.warp_threads,
        weft_threads:     parseInt($("#tx-opt-wefts").value, 10)    || cur.weft_threads,
        visible_shafts:   parseInt($("#tx-opt-vshafts").value, 10)   || cur.visible_shafts,
        visible_treadles: parseInt($("#tx-opt-vtreadles").value, 10) || cur.visible_treadles,
        // View
        entering_at_bottom:     $("#tx-opt-eab").checked,
        direction_righttoleft:  $("#tx-opt-rtl").checked,
        direction_toptobottom:  $("#tx-opt-ttb").checked,
        color_effect_with_grid: $("#tx-opt-fewr").checked,
        alt_palette:            $("#tx-opt-altpal").checked,
        alt_pegplan:            $("#tx-opt-altpeg").checked,
        // Symbols
        entering_style:  $("#tx-opt-sym-ez").value,
        treadling_style: $("#tx-opt-sym-tf").value,
        tieup_style:     $("#tx-opt-sym-au").value,
        pegplan_style:   $("#tx-opt-sym-sp").value,
        aushebung_style: $("#tx-opt-sym-au-lift").value,
        anbindung_style: $("#tx-opt-sym-anb").value,
        abbindung_style: $("#tx-opt-sym-abb").value,
        // Settings
        single_treadling: body.querySelector("input[name='tx-opt-tt']:checked").value === "single",
        sinking_shed:     body.querySelector("input[name='tx-opt-shed']:checked").value === "sinking",
        // Grid
        unit_width:  parseInt($("#tx-opt-uw").value, 10) || 4,
        unit_height: parseInt($("#tx-opt-uh").value, 10) || 4,
    });

    let modal;
    const accept = () => {
        const opts = collect();
        _optionsApplyToSettings(opts);
        if (global) {
            const prefs = _prefsLoad();
            Object.assign(prefs, opts);
            _prefsSave(prefs);
        }
        modal.close();
    };

    modal = Modal.open({
        title: global
            ? L("opt.title-global",  "Options (global)")
            : L("opt.title-pattern", "Options (this pattern)"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok",     "OK"),     role: "primary", onClick: accept },
        ],
    });
}

// Schuss-/Kettverhältnis (weft/warp ratio). Direct port of
// VerhaeltnisDialog (verhaeltnisdialog.cpp). Two factors; the
// non-equal axis stretches via _applyAspectRatio.
function showWarpWeftRatioDialog() {
    const i18n = _getI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    const body = document.createElement("div");
    body.style.minWidth = "320px";
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 6rem;gap:0.4rem 1rem;align-items:center">
            <label>${L("ratio.warp-factor", "Warp factor:")}</label>
            <input id="tx-rat-wf" type="number" min="0.01" max="10" step="0.1">
            <label>${L("ratio.weft-factor", "Weft factor:")}</label>
            <input id="tx-rat-sf" type="number" min="0.01" max="10" step="0.1">
        </div>`;
    const $ = (sel) => body.querySelector(sel);
    $("#tx-rat-wf").value = settings.warp_factor || 1.0;
    $("#tx-rat-sf").value = settings.weft_factor || 1.0;
    setTimeout(() => { $("#tx-rat-wf").focus(); $("#tx-rat-wf").select(); }, 0);

    let modal;
    const accept = () => {
        let wf = parseFloat($("#tx-rat-wf").value);
        let sf = parseFloat($("#tx-rat-sf").value);
        if (!isFinite(wf) || wf <= 0) wf = 1.0;
        if (!isFinite(sf) || sf <= 0) sf = 1.0;
        if (wf !== settings.warp_factor || sf !== settings.weft_factor) {
            settings.warp_factor = wf;
            settings.weft_factor = sf;
            _applyAspectRatio(settings);
            if (view) { view.layout(); view.draw(); }
            setModified();
        }
        modal.close();
    };
    modal = Modal.open({
        title: L("ratio.title", "Weft/warp ratio"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok",     "OK"),     role: "primary", onClick: accept },
        ],
    });
}

function _runEzArrangement(style) {
    if (style === "minimal-z") _ezNormalZ();
    else if (style === "minimal-s") _ezNormalS();
    else if (style === "gerade-z") _ezGeradeZ();
    else if (style === "gerade-s") _ezGeradeS();
    else if (style === "chorig-2") _ezChorig2();
    else if (style === "chorig-3") _ezChorig3();
    // "fixiert": handled directly inside Pattern.recalc_from_weave via
    // _recalcEinzugFixiert; no post-recalc rearrangement required here.
}

function _runTfArrangement(style) {
    if (style === "minimal-z" || style === "minimal-s" || style === "gesprungen") {
        _rearrangeTritte(style);
    }
}

// Hook called from Pattern.recalc_from_weave. Re-applies the user's
// selected threading / treadling arrangement after every weave-driven
// recalc, so the rebuilt threading / treadling stays in the desired
// order (matching desktop RcRecalcAll::Recalc behaviour).
function _applyArrangementHook(s) {
    if (!s) return;
    if (s.threading_arrangement) _runEzArrangement(s.threading_arrangement);
    if (!s.display_pegplan && s.treadling_arrangement) {
        _runTfArrangement(s.treadling_arrangement);
    }
}


// ---- Phase 8b: pattern generators (Atlas / Köper) -------------------
//
// Direct ports of insertbindung.cpp::KoeperEinfuegen and AtlasEinfuegen.
// Both stamp a binding on the weave at the cursor position, then run
// recalc_from_weave so entering / treadling / tieup / pegplan catch up.
// Cursor must be on the weave pane.

// Atlas / Satin patterns. Hard-coded offsets per the desktop.
const _ATLAS_OFFSETS = {
    5:  [0, 2, 4, 1, 3],
    6:  [0, 2, 4, 1, 5, 3],
    7:  [2, 6, 3, 0, 4, 1, 5],
    8:  [2, 5, 0, 3, 6, 1, 4, 7],
    9:  [0, 2, 4, 6, 8, 1, 3, 5, 7],
    10: [0, 7, 4, 1, 8, 5, 2, 9, 6, 3],
};

function _insertAtlas(n) {
    if (readonly) return;
    if (cursor.selected_part !== "weave") return;
    const offsets = _ATLAS_OFFSETS[n];
    if (!offsets) return;
    const posi = cursor.x1, posj = cursor.y1;
    _fullSnapCommand("atlas " + n, () => {
        const cr = settings.current_range;
        for (let di = 0; di < n; di++) {
            const i = posi + di;
            const j = posj + offsets[di];
            if (i >= pattern.weave.width) continue;
            if (j >= pattern.weave.height) continue;
            pattern.weave.set(i, j, cr);
        }
        // Place a square selection over the inserted block.
        cursor.x1 = posi; cursor.y1 = posj;
        cursor.x2 = Math.min(posi + n - 1, pattern.weave.width - 1);
        cursor.y2 = Math.min(posj + n - 1, pattern.weave.height - 1);
        pattern.recalc_from_weave(settings);
    });
}

// Köper / Twill: h cells per row "warp up" (positive cells) over a
// period of n = h + s. Two cases mirror the desktop:
//   h <= s : balanced or weft-sided variant — for each row i, fill
//            columns [i .. i + h) modulo n.
//   h > s  : warp-sided variant — for each row i, fill columns
//            [i + s .. i + n) modulo n.
function _insertKoeper(h, s) {
    if (readonly) return;
    if (cursor.selected_part !== "weave") return;
    const n = h + s;
    if (n <= 0) return;
    const posi = cursor.x1, posj = cursor.y1;
    _fullSnapCommand("twill " + h + "/" + s, () => {
        const cr = settings.current_range;
        if (h <= s) {
            for (let i = 0; i < n; i++) {
                for (let j = i; j < i + h; j++) {
                    const ii = posi + i;
                    const jj = posj + (j % n);
                    if (ii < pattern.weave.width && jj < pattern.weave.height) {
                        pattern.weave.set(ii, jj, cr);
                    }
                }
            }
        } else {
            for (let i = 0; i < n; i++) {
                for (let j = i + s; j < i + n; j++) {
                    const ii = posi + i;
                    const jj = posj + (j % n);
                    if (ii < pattern.weave.width && jj < pattern.weave.height) {
                        pattern.weave.set(ii, jj, cr);
                    }
                }
            }
        }
        cursor.x1 = posi; cursor.y1 = posj;
        cursor.x2 = Math.min(posi + n - 1, pattern.weave.width - 1);
        cursor.y2 = Math.min(posj + n - 1, pattern.weave.height - 1);
        pattern.recalc_from_weave(settings);
    });
}


// ---- Pegplan transforms (Invert / Mirror / Delete) -----------------
//
// All three operate on the active pattern extent (min_x..max_x ×
// min_y..max_y) and touch the pegplan AND weave grids in lockstep,
// matching desktop SpInvertClick / SpSpiegelnClick (→ TfSpiegelnClick) /
// ClearSchlagpatroneClick (→ ClearTrittfolgeClick). Atomically undoable.

function _pegplanCommand(label, mutate) {
    if (readonly) return;
    const pegBefore   = pattern.pegplan.data.slice();
    const weaveBefore = pattern.weave.data.slice();
    const before = {
        peg: pegBefore, weave: weaveBefore,
        min_x: pattern.min_x, max_x: pattern.max_x,
        min_y: pattern.min_y, max_y: pattern.max_y,
    };
    mutate();
    pattern.recalc_weave_extent();
    pattern.calcRapport();
    const after = {
        peg: pattern.pegplan.data.slice(),
        weave: pattern.weave.data.slice(),
        min_x: pattern.min_x, max_x: pattern.max_x,
        min_y: pattern.min_y, max_y: pattern.max_y,
    };
    // Restore before state so commandBus.execute applies it forward.
    pattern.pegplan.data = pegBefore.slice();
    pattern.weave.data   = weaveBefore.slice();
    pattern.min_x = before.min_x; pattern.max_x = before.max_x;
    pattern.min_y = before.min_y; pattern.max_y = before.max_y;
    pattern.calcRapport();
    const finalize = () => { setModified(); view.draw(); };
    const restore = (s) => {
        pattern.pegplan.data = s.peg.slice();
        pattern.weave.data   = s.weave.slice();
        pattern.min_x = s.min_x; pattern.max_x = s.max_x;
        pattern.min_y = s.min_y; pattern.max_y = s.max_y;
        pattern.calcRapport();
    };
    const cmd = {
        label,
        apply()  { restore(after);  finalize(); },
        revert() { restore(before); finalize(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else cmd.apply();
}

// First / last used shaft column in pegplan (any positive value in any
// weft). Port of desktop GetFirstTritt / GetLastTritt — a column is
// "free" when no cell in it is positive.
function _pegplanFirstUsedShaft() {
    for (let s = 0; s < pattern.pegplan.width; s++) {
        for (let j = 0; j < pattern.pegplan.height; j++) {
            if (pattern.pegplan.get(s, j) > 0) return s;
        }
    }
    return pattern.pegplan.width - 1;
}
function _pegplanLastUsedShaft() {
    for (let s = pattern.pegplan.width - 1; s >= 0; s--) {
        for (let j = 0; j < pattern.pegplan.height; j++) {
            if (pattern.pegplan.get(s, j) > 0) return s;
        }
    }
    return 0;
}

// First / last used weft row in pegplan.
function _pegplanFirstUsedWeft() {
    for (let j = 0; j < pattern.pegplan.height; j++) {
        for (let s = 0; s < pattern.pegplan.width; s++) {
            if (pattern.pegplan.get(s, j) > 0) return j;
        }
    }
    return pattern.pegplan.height - 1;
}
function _pegplanLastUsedWeft() {
    for (let j = pattern.pegplan.height - 1; j >= 0; j--) {
        for (let s = 0; s < pattern.pegplan.width; s++) {
            if (pattern.pegplan.get(s, j) > 0) return j;
        }
    }
    return 0;
}

// Invert: toggle every cell inside the pegplan's bounding rectangle of
// used cells. Bounds are driven by the pegplan itself (independent of
// weave extent) so rows whose shafts don't happen to thread any warp
// still get inverted. No per-row skipping — the whole rectangle is
// flipped (empty cells become current_range, non-empty get negated).
// The weave is inverted in lockstep within [min_x..max_x] × [j1..j2].
function _pegplanInvert() {
    _pegplanCommand("pegplan invert", () => {
        const cr = settings.current_range;
        const s1 = _pegplanFirstUsedShaft();
        const s2 = _pegplanLastUsedShaft();
        const j1 = _pegplanFirstUsedWeft();
        const j2 = _pegplanLastUsedWeft();
        if (s2 < s1 || j2 < j1) return;
        for (let j = j1; j <= j2; j++) {
            for (let s = s1; s <= s2; s++) {
                const v = pattern.pegplan.get(s, j);
                pattern.pegplan.set(s, j, v === 0 ? cr : -v);
            }
            if (pattern.min_x <= pattern.max_x) {
                for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                    const v = pattern.weave.get(i, j);
                    pattern.weave.set(i, j, v === 0 ? cr : -v);
                }
            }
        }
    });
}

// Mirror: swap weft rows (j, max_y - (j - min_y)) for j in the first half
// of the used weft range. Applied to pegplan rows + weave rows.
function _pegplanMirror() {
    _pegplanCommand("pegplan mirror", () => {
        if (pattern.min_y >= pattern.max_y) return;
        const half = pattern.min_y + Math.floor((pattern.max_y - pattern.min_y) / 2);
        for (let j = pattern.min_y; j <= half; j++) {
            const j2 = pattern.max_y - (j - pattern.min_y);
            if (j >= j2) break;
            for (let s = 0; s < pattern.pegplan.width; s++) {
                const a = pattern.pegplan.get(s, j);
                pattern.pegplan.set(s, j, pattern.pegplan.get(s, j2));
                pattern.pegplan.set(s, j2, a);
            }
            if (pattern.min_x <= pattern.max_x) {
                for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                    const a = pattern.weave.get(i, j);
                    pattern.weave.set(i, j, pattern.weave.get(i, j2));
                    pattern.weave.set(i, j2, a);
                }
            }
        }
    });
}

// Delete: wipe the entire pegplan AND weave (matches desktop
// ClearTrittfolgeClick which zeroes both grids).
function _pegplanClear() {
    _pegplanCommand("pegplan clear", () => {
        pattern.pegplan.data.fill(0);
        pattern.weave.data.fill(0);
    });
}


// ---- Rapport extension (F8 Rapportieren) / reduction (F7) ----
//
// Port of desktop RapportKette / RapportSchuss / CopyKettfaden /
// CopySchussfaden / ClearKettfaden / ClearSchussfaden.

function _copyKettfaden(fromI, toI, withColors) {
    pattern.entering.set_shaft(toI, pattern.entering.get_shaft(fromI));
    if (withColors) {
        pattern.color_warp.set(toI, 0, pattern.color_warp.get(fromI, 0));
    }
    if (pattern.min_y <= pattern.max_y) {
        for (let j = pattern.min_y; j <= pattern.max_y; j++) {
            pattern.weave.set(toI, j, pattern.weave.get(fromI, j));
        }
    }
}

function _copySchussfaden(fromJ, toJ, withColors) {
    // Copy treadling OR pegplan, depending on mode.
    if (settings.display_pegplan) {
        for (let s = 0; s < pattern.pegplan.width; s++) {
            pattern.pegplan.set(s, toJ, pattern.pegplan.get(s, fromJ));
        }
    } else {
        for (let k = 0; k < pattern.treadling.width; k++) {
            pattern.treadling.set(k, toJ, pattern.treadling.get(k, fromJ));
        }
    }
    if (withColors) {
        pattern.color_weft.set(0, toJ, pattern.color_weft.get(0, fromJ));
    }
    if (pattern.min_x <= pattern.max_x) {
        for (let i = pattern.min_x; i <= pattern.max_x; i++) {
            pattern.weave.set(i, toJ, pattern.weave.get(i, fromJ));
        }
    }
}

function _clearKettfaden(i) {
    pattern.entering.set_shaft(i, 0);
    if (pattern.min_y <= pattern.max_y) {
        for (let j = pattern.min_y; j <= pattern.max_y; j++) {
            pattern.weave.set(i, j, 0);
        }
    }
}

function _clearSchussfaden(j) {
    if (settings.display_pegplan) {
        for (let s = 0; s < pattern.pegplan.width; s++) pattern.pegplan.set(s, j, 0);
    } else {
        for (let k = 0; k < pattern.treadling.width; k++) pattern.treadling.set(k, j, 0);
    }
    if (pattern.min_x <= pattern.max_x) {
        for (let i = pattern.min_x; i <= pattern.max_x; i++) {
            pattern.weave.set(i, j, 0);
        }
    }
}

// Replicate the warp (kette) rapport `rx` times within the active extent.
// `rx = -1` fills up to the pattern's max width. `rx = 1` reduces to a
// single rapport (clearing everything outside).
function _rapportKette(rx, withColors) {
    pattern.recalc_weave_extent();
    const i1 = pattern.min_x, i2 = pattern.max_x;
    if (i1 > i2) return;
    pattern.calcRapport();
    let ki1 = pattern.rapport_k_a;
    let ki2 = pattern.rapport_k_b;
    if (ki1 === 0 && ki2 === -1) { ki1 = i1; ki2 = i2; }
    // Clear outside the rapport.
    for (let i = i1; i < ki1; i++) _clearKettfaden(i);
    for (let i = ki2 + 1; i <= i2; i++) _clearKettfaden(i);
    // Replicate.
    const rapW = ki2 - ki1 + 1;
    let maxi = rx !== -1 ? ki1 + rapW * rx : pattern.weave.width;
    if (maxi > pattern.weave.width) maxi = pattern.weave.width;
    for (let i = ki2 + 1; i < maxi; i++) {
        _copyKettfaden(ki1 + (i - ki2 - 1) % rapW, i, withColors);
    }
    pattern.recalc_weave_extent();
}

function _rapportSchuss(ry, withColors) {
    pattern.recalc_weave_extent();
    const j1 = pattern.min_y, j2 = pattern.max_y;
    if (j1 > j2) return;
    pattern.calcRapport();
    let sj1 = pattern.rapport_s_a;
    let sj2 = pattern.rapport_s_b;
    if (sj1 === 0 && sj2 === -1) { sj1 = j1; sj2 = j2; }
    for (let j = j1; j < sj1; j++) _clearSchussfaden(j);
    for (let j = sj2 + 1; j <= j2; j++) _clearSchussfaden(j);
    const rapH = sj2 - sj1 + 1;
    let maxj = ry !== -1 ? sj1 + rapH * ry : pattern.weave.height;
    if (maxj > pattern.weave.height) maxj = pattern.weave.height;
    for (let j = sj2 + 1; j < maxj; j++) {
        _copySchussfaden(sj1 + (j - sj2 - 1) % rapH, j, withColors);
    }
    pattern.recalc_weave_extent();
}

// Helpers to read the cursor-based insertion indices.
function _cursorShaftIndex() { return Math.max(0, cursor.y1); }
function _cursorTreadleIndex() { return Math.max(0, cursor.x1); }
function _cursorWarpIndex() { return Math.max(0, cursor.x1); }
function _cursorWeftIndex() { return Math.max(0, cursor.y1); }

// Which panes let a given structural op make sense?
const _SHAFT_PARTS = { entering: 1, tieup: 1 };
const _TREADLE_PARTS = { treadling: 1, tieup: 1 };
const _WARP_PARTS = { weave: 1, entering: 1, color_warp: 1, reed: 1 };
const _WEFT_PARTS = { weave: 1, treadling: 1, color_weft: 1 };


// ---- Editor-wide action registration + menu setup ----

function _getI18n() {
    const el = document.getElementById("tx-i18n");
    if (!el) return { actions: {}, menus: {} };
    try { return JSON.parse(el.textContent); }
    catch (e) { console.error("tx-i18n parse failed", e); return { actions: {}, menus: {} }; }
}

function _setWeaveStyle(style) {
    settings.style = style;
    const ids = {
        "draft": "icon-weave-draft",
        "color": "icon-weave-color",
        "simulation": "icon-weave-simulation",
        "empty": "icon-weave-empty",
        "invisible": "icon-weave-empty",
    };
    for (const k of Object.keys(ids)) {
        const el = document.getElementById(ids[k]);
        if (el) el.className = (k === style) ? "icon selected" : "icon";
    }
    view.draw();
}

function setupEditorActions() {
    if (typeof ActionRegistry === "undefined") return;
    const i18n = _getI18n();
    const L = (id) => (i18n.actions[id] && i18n.actions[id].label) || id;

    const R = (id, shortcut, handler, extra) => {
        ActionRegistry.registerAction(Object.assign({
            id, label: L(id), shortcut, handler,
        }, extra || {}));
        if (shortcut) Shortcuts.bind(shortcut, id);
    };

    // File
    R("file.save", "Ctrl+S", () => {
        if (readonly) return;
        saveSettings(data, settings);
        savePatternData(data, pattern);
        savePattern();
    }, { enabledWhen: () => !readonly });
    R("file.revert", null, _revertChanges,
        { enabledWhen: () => !readonly && modified });
    R("file.close", null, _closePatternGuarded);

    // Edit
    R("edit.undo", "Ctrl+Z", () => { if (commandBus) commandBus.undo(); },
        { enabledWhen: () => commandBus && commandBus.canUndo() });
    R("edit.redo", "Ctrl+Y", () => { if (commandBus) commandBus.redo(); },
        { enabledWhen: () => commandBus && commandBus.canRedo() });
    R("edit.cut", "Ctrl+X", selectionCut,
        { enabledWhen: () => !readonly && typeof Selection !== "undefined" && !Selection.isEmpty() });
    R("edit.copy", "Ctrl+C", selectionCopy,
        { enabledWhen: () => typeof Selection !== "undefined" && !Selection.isEmpty() });
    R("edit.paste", "Ctrl+V", selectionPaste,
        { enabledWhen: () => !readonly && typeof Clipboard !== "undefined" && Clipboard.has() });
    R("edit.paste-transparent", "Ctrl+B", selectionPasteTransparent,
        { enabledWhen: () => !readonly && typeof Clipboard !== "undefined" && Clipboard.has() });
    R("edit.delete", "Delete", selectionClear,
        { enabledWhen: () => !readonly && typeof Selection !== "undefined" && !Selection.isEmpty() });
    const hasSel = () => typeof Selection !== "undefined" && !Selection.isEmpty();
    const hasSquareSel = () => {
        if (!hasSel()) return false;
        return Math.abs(cursor.x2 - cursor.x1) === Math.abs(cursor.y2 - cursor.y1);
    };
    R("edit.invert", "I", selectionInvert,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.mirror-h", "H", selectionMirrorH,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.mirror-v", "V", selectionMirrorV,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.rotate", "R", selectionRotate,
        { enabledWhen: () => !readonly && hasSquareSel() });

    // Roll / Slope / Central Symmetry — selection transforms from desktop.
    // Ctrl+6-9 and Ctrl+H/Ctrl+J are desktop bindings. Some of these conflict
    // with browser shortcuts (Ctrl+H=history, Ctrl+J=downloads); our dispatcher
    // preventDefaults them which works in most browsers.
    R("edit.roll-up",    "Ctrl+6", selectionRollUp,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.roll-down",  "Ctrl+7", selectionRollDown,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.roll-left",  "Ctrl+8", selectionRollLeft,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.roll-right", "Ctrl+9", selectionRollRight,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.slope-inc",  "Ctrl+H", selectionSlopeIncrease,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.slope-dec",  "Ctrl+J", selectionSlopeDecrease,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.central-symmetry", "Z", selectionCentralSymmetry,
        { enabledWhen: () => !readonly && hasSel() });

    // Tie-up: Swap Sides — horizontal mirror of the entire tie-up matrix.
    R("tieup.swap-sides", null, tieupSwapSides,
        { enabledWhen: () => !readonly });

    // Pegplan mode. F9 toggles between tieup+treadling and pegplan display.
    //
    // The toggle is *not* pushed onto the undo stack — F9 is cheap to
    // un-toggle with F9, and folding a view change into the undo history
    // made Ctrl+Z revert data edits together with the mode.
    //
    // On every toggle we regenerate the now-visible side-pane from the
    // weave + existing entering — matching the desktop's
    // RecalcSchlagpatrone (entering pegplan) and
    // RecalcTrittfolgeAufknuepfung (leaving pegplan). This keeps what the
    // user sees consistent with the cloth, at the price of losing a manually
    // hand-tuned treadling/tie-up on a round trip (mirrors desktop).
    R("pegplan.toggle", "F9", () => {
        const nextFlag = !settings.display_pegplan;
        settings.display_pegplan = nextFlag;
        // Rehome the cursor if it's on a pane that just disappeared.
        if (nextFlag) {
            if (cursor.selected_part === "treadling" || cursor.selected_part === "tieup") {
                select_part("pegplan", cursor.x1, cursor.y1);
            }
        } else {
            if (cursor.selected_part === "pegplan") {
                select_part("treadling", cursor.x1, cursor.y1);
            }
        }
        pattern.recalc_weave_extent();
        if (nextFlag) {
            pattern._recalc_pegplan_from_weave();
        } else {
            // Rebuild treadling + tieup from weave. We read max_shaft from
            // the existing entering (recalc_entering is not called, so the
            // user's shaft-assignment layout is preserved).
            let maxShaft = 0;
            for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                const s = pattern.entering.get_shaft(i);
                if (s > maxShaft) maxShaft = s;
            }
            const maxTreadle = pattern.recalc_treadling(settings);
            pattern.recalc_tieup(maxShaft, maxTreadle);
        }
        view.layout();
        view.draw();
        ActionRegistry.notify();
    }, { checkedWhen: () => settings && !!settings.display_pegplan });

    // Pegplan transforms — port of desktop SpInvertClick / SpSpiegelnClick
    // (→ TfSpiegelnClick) / ClearSchlagpatroneClick (→ ClearTrittfolgeClick).
    // Operate on the active extent and mutate both the pegplan grid AND
    // the weave in lockstep so the two stay consistent without having to
    // recalc from the pegplan (which would destroy special-range cells in
    // the weave that the pegplan doesn't carry).
    R("pegplan.invert", null, _pegplanInvert,
        { enabledWhen: () => !readonly && settings && settings.display_pegplan });
    R("pegplan.mirror", null, _pegplanMirror,
        { enabledWhen: () => !readonly && settings && settings.display_pegplan });
    R("pegplan.clear", null, _pegplanClear,
        { enabledWhen: () => !readonly && settings && settings.display_pegplan });

    // View — zoom mutates the equal-axis baseline (settings.base_dx);
    // the actual dx/dy then re-derive from base + warp/weft factors,
    // so the chosen aspect ratio is preserved across zoom levels.
    R("view.zoom-in", "Ctrl+I", () => {
        settings.base_dx = Math.min(30, (settings.base_dx | 0) + 1);
        _applyAspectRatio(settings);
        view.layout(); view.draw();
    });
    R("view.zoom-out", "Ctrl+U", () => {
        settings.base_dx = Math.max(8, (settings.base_dx | 0) - 1);
        _applyAspectRatio(settings);
        view.layout(); view.draw();
    });
    R("view.style-draft", "Alt+1", () => _setWeaveStyle("draft"),
        { checkedWhen: () => settings && settings.style === "draft" });
    R("view.style-color", "Alt+2", () => _setWeaveStyle("color"),
        { checkedWhen: () => settings && settings.style === "color" });
    R("view.style-simulation", "Alt+3", () => _setWeaveStyle("simulation"),
        { checkedWhen: () => settings && settings.style === "simulation" });
    R("view.style-empty", "Alt+4", () => _setWeaveStyle("empty"),
        { checkedWhen: () => settings && (settings.style === "empty" || settings.style === "invisible") });

    const toggleFlag = (flag, relayout) => () => {
        settings[flag] = !settings[flag];
        update_view_options(settings);
        if (relayout) view.layout();
        view.draw();
    };
    R("view.show-entering", null, toggleFlag("display_entering", true),
        { checkedWhen: () => settings && settings.display_entering });
    R("view.show-treadling", null, toggleFlag("display_treadling", true),
        { checkedWhen: () => settings && settings.display_treadling });
    R("view.show-reed", null, toggleFlag("display_reed", true),
        { checkedWhen: () => settings && settings.display_reed });
    R("view.show-colors", null, () => {
        const next = !(settings.display_colors_warp && settings.display_colors_weft);
        settings.display_colors_warp = next;
        settings.display_colors_weft = next;
        update_view_options(settings);
        view.layout(); view.draw();
    }, { checkedWhen: () => settings && settings.display_colors_warp && settings.display_colors_weft });
    R("view.show-hlines", null, toggleFlag("display_hlines", true),
        { checkedWhen: () => settings && settings.display_hlines });
    R("view.toggle-entering-bottom", null, toggleFlag("entering_at_bottom", true),
        { checkedWhen: () => settings && settings.entering_at_bottom });

    // Pattern-Only: peripheral panes keep their layout and gridlines but
    // their data contents are hidden. Matches the desktop DB-WEAVE behaviour.
    R("view.pattern-only", "Ctrl+/", () => {
        settings.pattern_only = !settings.pattern_only;
        view.draw();
    }, { checkedWhen: () => settings && !!settings.pattern_only });

    // Highlight dependents (F12) — shade weave cells sharing shaft +
    // treadle/pegplan row with the cursor cell.
    R("view.highlight", "F12", () => {
        settings.highlight = !settings.highlight;
        view.draw();
    }, { checkedWhen: () => settings && !!settings.highlight });

    // Rapport view (Ctrl+R) — outline the repeat-unit rectangle on weave.
    R("view.repeat", "Ctrl+R", () => {
        settings.display_repeat = !settings.display_repeat;
        view.draw();
    }, { checkedWhen: () => settings && !!settings.display_repeat });

    // Inverse rapport colours: swap the "red" side with the "natural" side.
    // Normal: rapport cells red, repeats rendered in the current style.
    // Inverse: rapport cells in current style, repeats rendered red.
    R("view.inverse-repeat", null, () => {
        settings.inverse_repeat = !settings.inverse_repeat;
        view.draw();
    }, { checkedWhen: () => settings && !!settings.inverse_repeat });

    // F8 — Rapportieren dialog.
    R("repeat.rapportieren", "F8", () => { showRapportDialog(); },
        { enabledWhen: () => !readonly });
    // F7 — reduce to a single rapport.
    R("repeat.reduce", "F7", () => { _applyRapportReduce(); },
        { enabledWhen: () => !readonly });

    // ---- Phase 8a small ops ----
    R("edit.fill-koeper", "Ctrl+K", _fillKoeper,
        { enabledWhen: () => !readonly && cursor.selected_part === "weave" && hasSel() });
    R("edit.switch-side", "F11", _swapSide,
        { enabledWhen: () => !readonly });
    R("edit.warp-lancee", null, () => {
        showLancierungDialog((vv) => _kettLancierung(vv));
    }, { enabledWhen: () => !readonly });
    R("edit.weft-lancee", null, () => {
        showLancierungDialog((vv) => _schussLancierung(vv));
    }, { enabledWhen: () => !readonly });
    R("ez.assistent", null, () => { showThreadingWizardDialog(); },
        { enabledWhen: () => !readonly });
    R("edit.blockmuster",   null, () => showMusterDialog("block"),
        { enabledWhen: () => !readonly });
    R("edit.bereichmuster", null, () => showMusterDialog("bereich"),
        { enabledWhen: () => !readonly });

    // Range selectors — Shift+1..9 set ranges 1-9; Shift+0 = Aushebung
    // (lift out, value 10), Ctrl+0 = Anbindung (binding, 11),
    // Ctrl+Shift+0 = Abbindung (unbinding, 12). Setting a range while
    // a selection is active applies it to the selection (port of
    // desktop "ApplyRangeToSelection").
    const setRange = (r) => () => {
        settings.current_range = r;
        update_range_selector(settings);
        const hadSel = (cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2);
        if (hadSel && cursor.selected_pattern) {
            const grid = cursor.selected_pattern;
            const i1 = Math.min(cursor.x1, cursor.x2);
            const i2 = Math.max(cursor.x1, cursor.x2);
            const j1 = Math.min(cursor.y1, cursor.y2);
            const j2 = Math.max(cursor.y1, cursor.y2);
            const part = cursor.selected_part;
            _runSelectionCommand("apply range " + r, grid, () => {
                for (let i = i1; i <= i2; i++) {
                    for (let j = j1; j <= j2; j++) {
                        if (grid.get(i, j) !== 0) grid.set(i, j, r);
                    }
                }
            });
        } else {
            view.draw();
            ActionRegistry.notify();
        }
    };
    for (let r = 1; r <= 9; r++) {
        R("range.range-" + r, "Shift+" + r, setRange(r),
            { checkedWhen: () => settings && settings.current_range === r });
    }
    R("range.aushebung", "Shift+0", setRange(10),
        { checkedWhen: () => settings && settings.current_range === 10 });
    R("range.anbindung", "Ctrl+0", setRange(11),
        { checkedWhen: () => settings && settings.current_range === 11 });
    R("range.abbindung", "Ctrl+Shift+0", setRange(12),
        { checkedWhen: () => settings && settings.current_range === 12 });

    // ---- 8f: User-defined patterns ----
    for (let k = 0; k < 10; k++) {
        const idx = k;
        R("userdef." + k, null, (e) => {
            // Ctrl held → transparent paste (matches desktop's modifier).
            const transp = !!(e && (e.ctrlKey || e.metaKey));
            _insertUserdef(idx, transp);
        }, {
            label: "Pattern " + (k + 1),  // overwritten by _refreshUserdefMenuLabels
            enabledWhen: () => !readonly && cursor.selected_part === "weave",
        });
    }
    R("userdef.add", null, _userdefAddCurrent,
        { enabledWhen: () => !readonly });
    R("userdef.add-sel", null, _userdefAddSelection,
        { enabledWhen: () => !readonly && cursor.selected_part === "weave"
            && (cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2) });
    R("userdef.remove", null, _userdefRemoveClick,
        { enabledWhen: () => true });
    R("ez.mirror",       null, _ezMirrorAll, { enabledWhen: () => !readonly });
    R("ez.clear",        null, _ezClear,     { enabledWhen: () => !readonly });
    R("ez.copy-from-tf", null, _ezCopyFromTf,
        { enabledWhen: () => !readonly && !settings.display_pegplan });
    R("tf.mirror",       null, _tfMirrorAll, { enabledWhen: () => !readonly });
    R("tf.clear",        null, _tfClear,     { enabledWhen: () => !readonly });
    R("tf.copy-from-ez", null, _tfCopyFromEz,
        { enabledWhen: () => !readonly && !settings.display_pegplan });

    // ---- 8c: rearrangement styles ----
    R("ez.minimal-z", null, () => _applyEzStyle("minimal-z"),
        { enabledWhen: () => !readonly,
          checkedWhen: () => settings && settings.threading_arrangement === "minimal-z" });
    R("ez.minimal-s", null, () => _applyEzStyle("minimal-s"),
        { enabledWhen: () => !readonly,
          checkedWhen: () => settings && settings.threading_arrangement === "minimal-s" });
    R("ez.gerade-z", null, () => _applyEzStyle("gerade-z"),
        { enabledWhen: () => !readonly,
          checkedWhen: () => settings && settings.threading_arrangement === "gerade-z" });
    R("ez.gerade-s", null, () => _applyEzStyle("gerade-s"),
        { enabledWhen: () => !readonly,
          checkedWhen: () => settings && settings.threading_arrangement === "gerade-s" });
    R("ez.chorig-2", null, () => _applyEzStyle("chorig-2"),
        { enabledWhen: () => !readonly,
          checkedWhen: () => settings && settings.threading_arrangement === "chorig-2" });
    R("ez.chorig-3", null, () => _applyEzStyle("chorig-3"),
        { enabledWhen: () => !readonly,
          checkedWhen: () => settings && settings.threading_arrangement === "chorig-3" });
    R("ez.fixiert", null, () => showFixeinzugDialog(),
        { enabledWhen: () => !readonly,
          checkedWhen: () => settings && settings.threading_arrangement === "fixiert" });

    // ---- Phase 9: color management ----
    R("colors.palette", null, () => showPaletteDialog(),
        { enabledWhen: () => !readonly });
    R("colors.blend", null, () => showColorBlendDialog(),
        { enabledWhen: () => !readonly });
    R("opt.pattern", null, () => showOptionsDialog(false), {});
    R("opt.global",  null, () => showOptionsDialog(true),  {});
    R("extras.ratio", null, () => showWarpWeftRatioDialog(), {});
    R("base.american",     null, () => _applyBaseStyle("american"),     {});
    R("base.scandinavian", null, () => _applyBaseStyle("scandinavian"), {});
    R("base.swiss",        null, () => _applyBaseStyle("swiss"),        {});
    R("colors.toolbox", "Ctrl+F", _paletteToolboxToggle,
        { checkedWhen: () => !!(settings && settings.display_palette) });
    R("colors.set-warp", null, _colorsSetWarp,
        { enabledWhen: () => !readonly });
    R("colors.set-weft", null, _colorsSetWeft,
        { enabledWhen: () => !readonly });
    R("colors.replace", null, _colorsReplace,
        { enabledWhen: () => !readonly
            && (cursor.selected_part === "color_warp"
             || cursor.selected_part === "color_weft") });
    R("colors.switch", null, _colorsSwitch,
        { enabledWhen: () => !readonly });
    R("colors.warp-from-weft", null, _colorsWarpFromWeft,
        { enabledWhen: () => !readonly });
    R("colors.weft-from-warp", null, _colorsWeftFromWarp,
        { enabledWhen: () => !readonly });
    R("tf.minimal-z", null, () => _applyTfStyle("minimal-z"),
        { enabledWhen: () => !readonly && !settings.display_pegplan,
          checkedWhen: () => settings && settings.treadling_arrangement === "minimal-z" });
    R("tf.minimal-s", null, () => _applyTfStyle("minimal-s"),
        { enabledWhen: () => !readonly && !settings.display_pegplan,
          checkedWhen: () => settings && settings.treadling_arrangement === "minimal-s" });
    R("tf.gesprungen", null, () => _applyTfStyle("gesprungen"),
        { enabledWhen: () => !readonly && !settings.display_pegplan,
          checkedWhen: () => settings && settings.treadling_arrangement === "gesprungen" });

    // ---- 8b: pattern generators ----
    const onWeave = () => !readonly && cursor.selected_part === "weave";
    [5, 6, 7, 8, 9, 10].forEach(n => {
        R("insert.atlas-" + n, null, () => _insertAtlas(n),
            { label: (i18n.menus.insertAtlasPrefix || "Satin") + " " + n,
              enabledWhen: onWeave });
    });
    const KOEPER_BAL = [[2,2], [3,3], [4,4], [5,5]];
    const KOEPER_WS  = [[2,1], [3,1], [4,1], [5,1], [3,2], [4,2], [5,2], [4,3], [5,3]];
    const koepLabel = (h, s) => (i18n.menus.insertTwillPrefix || "Twill") + " " + h + "/" + s;
    KOEPER_BAL.concat(KOEPER_WS).forEach(([h, s]) => {
        R("insert.twill-" + h + "-" + s, null, () => _insertKoeper(h, s),
            { label: koepLabel(h, s), enabledWhen: onWeave });
    });

    // Colour-effect with raster overlay — add the unit-grid overlay when
    // the weave is drawn in "color" style.
    R("view.color-raster", null, () => {
        settings.color_effect_with_grid = !settings.color_effect_with_grid;
        view.draw();
    }, { checkedWhen: () => settings && !!settings.color_effect_with_grid });

    // Overview window (F4) — miniature render of the full weave.
    R("view.overview", "F4", () => { showOverviewWindow(); });

    // Drawing tools — selected one is stored in settings.tool. "point" is
    // the default (single-cell click); others rasterize a shape on mouseup.
    const selectTool = (t) => () => {
        settings.tool = t;
        // Drop any in-flight drag when switching tools mid-gesture.
        toolDrag = null;
        ActionRegistry.notify();
    };
    R("tool.point",       null, selectTool("point"),
        { checkedWhen: () => !settings || !settings.tool || settings.tool === "point" });
    R("tool.line",        null, selectTool("line"),
        { checkedWhen: () => settings && settings.tool === "line" });
    R("tool.rect",        null, selectTool("rect"),
        { checkedWhen: () => settings && settings.tool === "rect" });
    R("tool.fillrect",    null, selectTool("fillrect"),
        { checkedWhen: () => settings && settings.tool === "fillrect" });
    R("tool.ellipse",     null, selectTool("ellipse"),
        { checkedWhen: () => settings && settings.tool === "ellipse" });
    R("tool.fillellipse", null, selectTool("fillellipse"),
        { checkedWhen: () => settings && settings.tool === "fillellipse" });

    // Structural operations — insert/delete/move shaft/treadle/warp/weft.
    // Each is wrapped in a full-pattern-snapshot command for clean undo.
    const inPart = (partsMap) => () =>
        !readonly && cursor && !!partsMap[cursor.selected_part];
    R("pattern.insert-shaft", "Shift+S", () => {
        _structuralCommand("insert shaft", () => _insertShaftAt(_cursorShaftIndex()));
    }, { enabledWhen: inPart(_SHAFT_PARTS) });
    R("pattern.insert-treadle", "Shift+T", () => {
        _structuralCommand("insert treadle", () => _insertTreadleAt(_cursorTreadleIndex()));
    }, { enabledWhen: inPart(_TREADLE_PARTS) });
    R("pattern.insert-warp", "Shift+K", () => {
        _structuralCommand("insert warp", () => _insertWarpAt(_cursorWarpIndex()));
    }, { enabledWhen: inPart(_WARP_PARTS) });
    R("pattern.insert-weft", "Shift+F", () => {
        _structuralCommand("insert weft", () => _insertWeftAt(_cursorWeftIndex()));
    }, { enabledWhen: inPart(_WEFT_PARTS) });

    R("pattern.delete-shaft", "Ctrl+Shift+S", () => {
        _structuralCommand("delete shaft", () => _removeShaftAt(_cursorShaftIndex()));
    }, { enabledWhen: inPart(_SHAFT_PARTS) });
    R("pattern.delete-treadle", "Ctrl+Shift+T", () => {
        _structuralCommand("delete treadle", () => _removeTreadleAt(_cursorTreadleIndex()));
    }, { enabledWhen: inPart(_TREADLE_PARTS) });
    R("pattern.delete-warp", "Ctrl+Shift+K", () => {
        _structuralCommand("delete warp", () => _removeWarpAt(_cursorWarpIndex()));
    }, { enabledWhen: inPart(_WARP_PARTS) });
    R("pattern.delete-weft", "Ctrl+Shift+F", () => {
        _structuralCommand("delete weft", () => _removeWeftAt(_cursorWeftIndex()));
    }, { enabledWhen: inPart(_WEFT_PARTS) });

    R("pattern.move-shaft-up", null, () => {
        const at = _cursorShaftIndex();
        if (at <= 0) return;
        _structuralCommand("move shaft up", () => _swapShafts(at, at - 1));
    }, { enabledWhen: () => !readonly && inPart(_SHAFT_PARTS)() && _cursorShaftIndex() > 0 });
    R("pattern.move-shaft-down", null, () => {
        const at = _cursorShaftIndex();
        if (at >= pattern.tieup.height - 1) return;
        _structuralCommand("move shaft down", () => _swapShafts(at, at + 1));
    }, { enabledWhen: () => !readonly && inPart(_SHAFT_PARTS)() && _cursorShaftIndex() < pattern.tieup.height - 1 });
    R("pattern.move-treadle-left", null, () => {
        const at = _cursorTreadleIndex();
        if (at <= 0) return;
        _structuralCommand("move treadle left", () => _swapTreadles(at, at - 1));
    }, { enabledWhen: () => !readonly && inPart(_TREADLE_PARTS)() && _cursorTreadleIndex() > 0 });
    R("pattern.move-treadle-right", null, () => {
        const at = _cursorTreadleIndex();
        if (at >= pattern.tieup.width - 1) return;
        _structuralCommand("move treadle right", () => _swapTreadles(at, at + 1));
    }, { enabledWhen: () => !readonly && inPart(_TREADLE_PARTS)() && _cursorTreadleIndex() < pattern.tieup.width - 1 });

    // Build menu tree and render
    const menuMount = document.getElementById("tx-menubar");
    if (menuMount) {
        const fileItems = [];
        if (!readonly) {
            fileItems.push({ action: "file.save" });
            fileItems.push({ action: "file.revert" });
            fileItems.push({ separator: true });
        }
        fileItems.push({ action: "file.close" });
        const tree = [
            { label: i18n.menus.file || "File", items: fileItems },
            { label: i18n.menus.edit || "Edit", items: [
                { action: "edit.undo" },
                { action: "edit.redo" },
                { separator: true },
                { action: "edit.cut" },
                { action: "edit.copy" },
                { action: "edit.paste" },
                { action: "edit.paste-transparent" },
                { separator: true },
                { action: "edit.delete" },
                { action: "edit.invert" },
                { action: "edit.mirror-h" },
                { action: "edit.mirror-v" },
                { action: "edit.rotate" },
                { action: "edit.central-symmetry" },
                { label: i18n.menus.roll || "Roll", items: [
                    { action: "edit.roll-up" },
                    { action: "edit.roll-down" },
                    { action: "edit.roll-left" },
                    { action: "edit.roll-right" },
                ]},
                { label: i18n.menus.slope || "Slope", items: [
                    { action: "edit.slope-inc" },
                    { action: "edit.slope-dec" },
                ]},
                { separator: true },
                { label: i18n.menus.move || "Move", items: [
                    { action: "pattern.move-shaft-up" },
                    { action: "pattern.move-shaft-down" },
                    { action: "pattern.move-treadle-left" },
                    { action: "pattern.move-treadle-right" },
                ]},
                { label: i18n.menus.insert || "Insert", items: [
                    { action: "pattern.insert-shaft" },
                    { action: "pattern.insert-treadle" },
                    { action: "pattern.insert-warp" },
                    { action: "pattern.insert-weft" },
                ]},
                { label: i18n.menus.delete || "Delete", items: [
                    { action: "pattern.delete-shaft" },
                    { action: "pattern.delete-treadle" },
                    { action: "pattern.delete-warp" },
                    { action: "pattern.delete-weft" },
                ]},
                { separator: true },
                { label: i18n.menus.lancee || "Lancee", items: [
                    { action: "edit.warp-lancee" },
                    { action: "edit.weft-lancee" },
                ]},
                { action: "edit.fill-koeper" },
                { action: "edit.switch-side" },
                { separator: true },
                { label: i18n.menus.tools || "Tools", items: [
                    { action: "tool.point" },
                    { action: "tool.line" },
                    { action: "tool.rect" },
                    { action: "tool.fillrect" },
                    { action: "tool.ellipse" },
                    { action: "tool.fillellipse" },
                ]},
            ]},
            { label: i18n.menus.view || "View", items: [
                { action: "view.show-entering" },
                { action: "view.show-treadling" },
                { action: "view.show-reed" },
                { action: "view.show-colors" },
                { action: "view.show-hlines" },
                { action: "colors.toolbox" },
                { action: "view.toggle-entering-bottom" },
                { action: "view.pattern-only" },
                { separator: true },
                { label: i18n.menus.viewStyle || "Style", items: [
                    { action: "view.style-draft" },
                    { action: "view.style-color" },
                    { action: "view.style-simulation" },
                    { action: "view.style-empty" },
                ]},
                { separator: true },
                { action: "view.highlight" },
                { action: "view.color-raster" },
                { separator: true },
                { action: "view.zoom-in" },
                { action: "view.zoom-out" },
                { separator: true },
                { action: "view.overview" },
            ]},
            { label: i18n.menus.threading || "Threading", items: [
                { action: "ez.assistent" },
                { separator: true },
                { action: "ez.mirror" },
                { action: "ez.clear" },
                { separator: true },
                { action: "ez.minimal-z" },
                { action: "ez.minimal-s" },
                { action: "ez.gerade-z" },
                { action: "ez.gerade-s" },
                { action: "ez.chorig-2" },
                { action: "ez.chorig-3" },
                { separator: true },
                { action: "ez.fixiert" },
                { separator: true },
                { action: "ez.copy-from-tf" },
            ]},
            { label: i18n.menus.treadling || "Treadling",
              visibleWhen: () => !(settings && settings.display_pegplan),
              items: [
                { action: "tf.mirror" },
                { action: "tf.clear" },
                { separator: true },
                { action: "tf.minimal-z" },
                { action: "tf.minimal-s" },
                { action: "tf.gesprungen" },
                { separator: true },
                { action: "tf.copy-from-ez" },
            ]},
            { label: i18n.menus.tieup || "Tie-up", items: [
                { action: "tieup.swap-sides" },
            ]},
            { label: i18n.menus.insertMenu || "Insert", items: [
                { label: i18n.menus.insertAtlas || "Satin", items:
                    [5, 6, 7, 8, 9, 10].map(n =>
                        ({ action: "insert.atlas-" + n }))
                },
                { label: i18n.menus.insertTwill || "Twill", items: [
                    { label: i18n.menus.insertBalanced || "Balanced", items:
                        KOEPER_BAL.map(([h, s]) =>
                            ({ action: "insert.twill-" + h + "-" + s }))
                    },
                    { label: i18n.menus.insertWarpSided || "Warp sided", items:
                        KOEPER_WS.map(([h, s]) =>
                            ({ action: "insert.twill-" + h + "-" + s }))
                    },
                ]},
                { separator: true },
                // User-defined slots inside an Additional/Weitere
                // submenu. The submenu itself hides when no slots are
                // populated (matches the desktop's top-level Weitere
                // visibility); Administration sits separately so the
                // user can always reach it to add the first pattern.
                { label: i18n.menus.additional || "Additional",
                  visibleWhen: () => _userdefList().some(s => s && s.data),
                  items: [
                    { action: "userdef.0" },
                    { action: "userdef.1" },
                    { action: "userdef.2" },
                    { action: "userdef.3" },
                    { action: "userdef.4" },
                    { action: "userdef.5" },
                    { action: "userdef.6" },
                    { action: "userdef.7" },
                    { action: "userdef.8" },
                    { action: "userdef.9" },
                ]},
                { label: i18n.menus.additionalAdmin || "Administration", items: [
                    { action: "userdef.add" },
                    { action: "userdef.add-sel" },
                    { action: "userdef.remove" },
                ]},
            ]},
            { label: i18n.menus.bereicheMenu || "Ranges", items: [
                { label: i18n.menus.currentRangeMenu || "Current range", items: [
                    { action: "range.range-1" },
                    { action: "range.range-2" },
                    { action: "range.range-3" },
                    { action: "range.range-4" },
                    { action: "range.range-5" },
                    { action: "range.range-6" },
                    { action: "range.range-7" },
                    { action: "range.range-8" },
                    { action: "range.range-9" },
                    { separator: true },
                    { action: "range.aushebung" },
                    { action: "range.anbindung" },
                    { action: "range.abbindung" },
                ]},
                { separator: true },
                { action: "edit.blockmuster" },
                { action: "edit.bereichmuster" },
            ]},
            { label: i18n.menus.pegplan || "Pegplan",
              visibleWhen: () => !!(settings && settings.display_pegplan),
              items: [
                { action: "pegplan.invert" },
                { action: "pegplan.mirror" },
                { action: "pegplan.clear" },
            ]},
            { label: i18n.menus.repeat || "Repeat", items: [
                { action: "view.repeat" },
                { action: "view.inverse-repeat" },
                { separator: true },
                { action: "repeat.rapportieren" },
                { action: "repeat.reduce" },
            ]},
            { label: i18n.menus.colors || "Colors", items: [
                { action: "colors.toolbox" },
                { separator: true },
                { action: "colors.palette" },
                { action: "colors.blend" },
                { separator: true },
                { action: "colors.set-warp" },
                { action: "colors.set-weft" },
                { action: "colors.replace" },
                { separator: true },
                { action: "colors.warp-from-weft" },
                { action: "colors.weft-from-warp" },
                { action: "colors.switch" },
            ]},
            { label: i18n.menus.extras || "Extras", items: [
                { action: "pegplan.toggle" },
                { separator: true },
                { action: "extras.ratio" },
                { separator: true },
                { label: i18n.menus.baseSettings || "Base settings", items: [
                    { action: "base.american" },
                    { action: "base.scandinavian" },
                    { action: "base.swiss" },
                ]},
                { label: i18n.menus.options || "Options", items: [
                    { action: "opt.pattern" },
                    { action: "opt.global" },
                ]},
            ]},
        ];
        Menu.render(menuMount, tree);
        // After the menubar is rendered, sync userdef labels + visibility
        // from localStorage state.
        _refreshUserdefMenuLabels();
    }

    Shortcuts.install();

    // Refresh menubar state whenever the command bus changes.
    if (commandBus) commandBus.subscribe(() => ActionRegistry.notify());
}


window.addEventListener("load", () => {
    readonly = document.getElementById("readonly").value === "True";
    getPattern().then(init).then(update_layout_selector).then(setupEditorActions);
    if (!readonly) {
        installBeforeUnloadGuard(() => {
            saveSettings(data, settings);
            savePatternData(data, pattern);
        });
    }
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
    document.getElementById("close").addEventListener("click", _closePatternGuarded);
    window.addEventListener("keydown", keyDown);

    document.getElementById("icon-weave-draft").addEventListener("click", () => {
        document.getElementById("icon-weave-draft").className = "icon selected";
        document.getElementById("icon-weave-color").className = "icon";
        document.getElementById("icon-weave-simulation").className = "icon";
        document.getElementById("icon-weave-empty").className = "icon";
        settings.style = "draft";
        view.draw();
    });
    document.getElementById("icon-weave-color").addEventListener("click", () => {
        document.getElementById("icon-weave-draft").className = "icon";
        document.getElementById("icon-weave-color").className = "icon selected";
        document.getElementById("icon-weave-simulation").className = "icon";
        document.getElementById("icon-weave-empty").className = "icon";
        settings.style = "color";
        view.draw();
    });
    document.getElementById("icon-weave-simulation").addEventListener("click", () => {
        document.getElementById("icon-weave-draft").className = "icon";
        document.getElementById("icon-weave-color").className = "icon";
        document.getElementById("icon-weave-simulation").className = "icon selected";
        document.getElementById("icon-weave-empty").className = "icon";
        settings.style = "simulation";
        view.draw();
    });
    document.getElementById("icon-weave-empty").addEventListener("click", () => {
        document.getElementById("icon-weave-draft").className = "icon";
        document.getElementById("icon-weave-color").className = "icon";
        document.getElementById("icon-weave-simulation").className = "icon";
        document.getElementById("icon-weave-empty").className = "icon selected";
        settings.style = "empty";
        view.draw();
    });

    if (document.getElementById("current-range")) {
        document.getElementById("current-range").addEventListener("click", () => {
            const popup = document.getElementById("ranges");
            if (popup.style.display === "") {
                popup.style.display = "flex";
            } else {
                popup.style.display = "";
            }
        });
        const range_handler = function(e) {
            const range = parseInt(e.target.id.substring(5));
            document.getElementById(`range${settings.current_range}`).className = "";
            settings.current_range = range;
            document.getElementById(`range${range}`).className = "current";
            document.getElementById("current-range").innerText = e.target.innerText;
            document.getElementById("ranges").style.display = "";
        };
        for (let i = 1; i <= 12; i++) {
            document.getElementById(`range${i}`).addEventListener("click", range_handler);
        }
    }

    document.getElementById("current-layout").addEventListener("click", () => {
        const popup = document.getElementById("layouts");
        if (popup.style.display === "") {
            popup.style.display = "flex";
        } else {
            popup.style.display = "";
        }
    });
    const layout_handler = function(e) {
        const layout = e.target.id.substring(7);
        const current_layout = get_current_layout(settings);
        document.getElementById(`layout-${current_layout}`).className = "";
        set_current_layout(layout);
        document.getElementById(`layout-${layout}`).className = "current";
        document.getElementById("current-layout").innerText = layout;
        document.getElementById("layouts").style.display = "";
    };
    document.getElementById("layout-DE").addEventListener("click", layout_handler);
    document.getElementById("layout-SK").addEventListener("click", layout_handler);
    document.getElementById("layout-US").addEventListener("click", layout_handler);
    document.getElementById("layout---").addEventListener("click", layout_handler);

    document.getElementById("view-options-menu").addEventListener("click", () => {
        const popup = document.getElementById("view-options");
        if (popup.style.display === "") {
            popup.style.display = "flex";
        } else {
            popup.style.display = "";
        }
    });
    document.getElementById("entering-visible").addEventListener("click", (e) => {
        if (e.target.className === "checked") {
            e.target.className = "";
        } else {
            e.target.className = "checked";
        }
        settings.display_entering = e.target.className == "checked";
        view.layout();
        view.draw();
    });
    document.getElementById("treadling-visible").addEventListener("click", (e) => {
        if (e.target.className === "checked") {
            e.target.className = "";
        } else {
            e.target.className = "checked";
        }
        settings.display_treadling = e.target.className == "checked";
        view.layout();
        view.draw();
    });
    document.getElementById("reed-visible").addEventListener("click", (e) => {
        if (e.target.className === "checked") {
            e.target.className = "";
        } else {
            e.target.className = "checked";
        }
        settings.display_reed = e.target.className == "checked";
        view.layout();
        view.draw();
    });
    document.getElementById("colors-visible").addEventListener("click", (e) => {
        if (e.target.className === "checked") {
            e.target.className = "";
        } else {
            e.target.className = "checked";
        }
        settings.display_colors_warp = e.target.className == "checked";
        settings.display_colors_weft = e.target.className == "checked";
        view.layout();
        view.draw();
    });
    document.getElementById("hlines-visible").addEventListener("click", (e) => {
        if (e.target.className === "checked") {
            e.target.className = "";
        } else {
            e.target.className = "checked";
        }
        settings.display_hlines = e.target.className == "checked";
        view.layout();
        view.draw();
    });

    document.getElementById("zoom-in").addEventListener("click", (e) => {
        settings.base_dx = Math.min(30, (settings.base_dx | 0) + 1);
        _applyAspectRatio(settings);
        view.layout();
        view.draw();
    });
    document.getElementById("zoom-out").addEventListener("click", (e) => {
        settings.base_dx = Math.max(8, (settings.base_dx | 0) - 1);
        _applyAspectRatio(settings);
        view.layout();
        view.draw();
    });
});

window.addEventListener("resize", resizeWindow);

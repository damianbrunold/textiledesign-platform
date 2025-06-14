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
        // TODO adapt colors for dark mode
        "rgb(0, 0, 0)",
        "rgb(255, 255, 255)",
        "rgb(50, 50, 255)",
        "rgb(128, 0, 0)",
        "rgb(0, 140, 255)",
        "#757575",
        "rgb(0, 194, 78)",
        "rgb(255, 123, 0)",
        "rgb(255, 210, 0)",
        "#007700",
        "rgb(128, 128, 128)", // aushebung
        "rgb(30, 120, 30)",   // anbindung
        "#ccaa22",   // abbindung
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
    } else if (cursor.selected_part === "color_weft") {
        select_part("tieup", cursor.x2, saved_y_tieup);
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
    cellPainterFilled(ctx, settings, view, i, j, value); // TODO
}


function cellPainterRising(ctx, settings, view, i, j, value) {
    cellPainterFilled(ctx, settings, view, i, j, value); // TODO
}


function cellPainterFalling(ctx, settings, view, i, j, value) {
    cellPainterFilled(ctx, settings, view, i, j, value); // TODO
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
    cellPainterFilled(ctx, settings, view, i, j, value); // TODO
}


function cellPainterSmallcircle(ctx, settings, view, i, j, value) {
    cellPainterFilled(ctx, settings, view, i, j, value); // TODO
}


function cellPainterSmallcross(ctx, settings, view, i, j, value) {
    cellPainterFilled(ctx, settings, view, i, j, value); // TODO
}


function cellPainterNumber(ctx, settings, view, i, j, value) {
    cellPainterFilled(ctx, settings, view, i, j, value); // TODO
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
        for (let i = this.offset_i; i < this.offset_i + this.width; i++) {
            for (let j = this.offset_j; j < this.offset_j + this.height; j++) {
                const value = this.data.get(i, j);
                if (value <= 9) {
                    painter(ctx, settings, this, i - this.offset_i, j - this.offset_j, value);
                } else if (value == 10) {
                    aushebungPainter(ctx, settings, this, i - this.offset_i, j - this.offset_j);
                } else if (value == 11) {
                    anbindungPainter(ctx, settings, this, i - this.offset_i, j - this.offset_j, false);
                } else if (value == 12) {
                    abbindungPainter(ctx, settings, this, i - this.offset_i, j - this.offset_j, false);
                }
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
        this.weave = new Grid(width, height);
    }

    recalc_weave() {
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

    recalc_from_weave(settings) {
        this.recalc_weave_extent();
        const max_shaft = this.recalc_entering();
        const max_treadle = this.recalc_treadling(settings);
        this.recalc_tieup(max_shaft, max_treadle);
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
        if (settings.single_treadling) {
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
        } else {
            // TODO how to handle this?
        }
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
        this.darcula = true;
        this.bxf = 0.15;
        this.byf = 0.15;
        this.bx = this.dx * this.bxf;
        this.by = this.dy * this.byf;
        this.style = "draft";
    }
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

        const width3 = this.settings.display_colors_weft ? 1 : 0;
        const width2 = this.settings.display_treadling ? this.visible_treadles : 0;
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
        this.tieup = this.make(
            s.display_entering && s.display_treadling,
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
        this.treadling = this.make(
            s.display_treadling,
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

        if (this.settings.display_treadling) {
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
        this.color_warp.registerScrollbars(this.scroll_1_hor, null);
        this.color_weft.registerScrollbars(null, this.scroll_1_ver);
        this.reed.registerScrollbars(this.scroll_1_hor, null);

        if (cursor.selected_part === "weave") {
            cursor.selected_view = this.weave;
        } else if (cursor.selected_part === "entering") {
            cursor.selected_view = this.entering;
        } else if (cursor.selected_part === "treadling") {
            cursor.selected_view = this.treadling;
        } else if (cursor.selected_part === "tieup") {
            cursor.selected_view = this.tieup;
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
        this.color_warp.draw(this.ctx, this.settings);
        this.entering.draw(this.ctx, this.settings);
        this.tieup.draw(this.ctx, this.settings);
        this.reed.draw(this.ctx, this.settings);
        this.treadling.draw(this.ctx, this.settings);
        this.weave.draw(this.ctx, this.settings);
        this.color_weft.draw(this.ctx, this.settings);

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

function mouseDown(event) {
    had_selection = cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2;
    mousedown = true;
    const x = event.offsetX;
    const y = event.offsetY;
    const i = Math.trunc(x / settings.dx);
    const j = Math.trunc(y / settings.dy);
    if (view.entering.contains(i, j)) {
        const ii = i_to_doc(i, view.entering, settings.direction_righttoleft);
        const jj = j_to_doc(j, view.entering, settings.direction_toptobottom);
        select_part("entering", ii, jj, ii, jj);
    } else if (view.treadling.contains(i, j)) {
        const ii = i_to_doc(i, view.treadling, false);
        const jj = j_to_doc(j, view.treadling, false);
        select_part("treadling", ii, jj, ii, jj);
    } else if (view.tieup.contains(i, j)) {
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
    if (view.entering.contains(i, j)) {
        const ii = i_to_doc(i, view.entering, settings.direction_righttoleft);
        const jj = j_to_doc(j, view.entering, settings.direction_toptobottom);
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
    } else if (view.tieup.contains(i, j)) {
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
    if (view.entering.contains(i, j)) {
        const ii = i_to_doc(i, view.entering, settings.direction_righttoleft);
        const jj = j_to_doc(j, view.entering, settings.direction_toptobottom);
        cursor.x2 = ii;
        cursor.y2 = jj;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            if (pattern.entering.get_shaft(ii) == jj + 1) {
                pattern.entering.set_shaft(ii, 0);
            } else {
                pattern.entering.set_shaft(ii, jj + 1);
            }                
            setModified();
            pattern.recalc_weave();
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
                if (pattern.treadling.get(ii, jj) > 0) {
                    pattern.treadling.clearRow(jj);
                    setModified();
                    pattern.recalc_weave();
                } else {
                    pattern.treadling.clearRow(jj);
                    pattern.treadling.set(ii, jj, 1);  // TODO if pegplan active, use current_range
                    setModified();
                    pattern.recalc_weave();
                }
            } else {
                pattern.treadling.toggle(ii, jj);
                setModified();
                pattern.recalc_weave();
            }
        }
        updateSelectionIcons();
        view.draw();
    } else if (view.tieup.contains(i, j)) {
        const ii = i_to_doc(i, view.tieup, false);
        const jj = j_to_doc(j, view.tieup, settings.direction_toptobottom);
        cursor.x2 = ii;
        cursor.y2 = jj;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            pattern.tieup.toggle(ii, jj, settings.current_range);
            setModified();
            pattern.recalc_weave();
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
            pattern.weave.toggle(ii, jj, settings.current_range);
            setModified();
            pattern.recalc_from_weave(settings);
        }
        updateSelectionIcons();
        view.draw();
    } else if (view.color_warp.contains(i, j)) {
        const ii = i_to_doc(i, view.color_warp, settings.direction_righttoleft);
        cursor.x2 = ii;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            if (event.ctrlKey) {
                settings.current_color = pattern.color_warp.get(ii, 0);
                update_color_selector(settings);
            } else {
                pattern.color_warp.set(ii, 0, settings.current_color);
                setModified();
            }
        }
        updateSelectionIcons();
        view.draw();
    } else if (view.color_weft.contains(i, j)) {
        const jj = j_to_doc(j, view.color_weft, false);
        cursor.y2 = jj;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            if (event.ctrlKey) {
                settings.current_color = pattern.color_weft.get(0, jj);
                update_color_selector(settings);
            } else {
                pattern.color_weft.set(0, jj, settings.current_color);
                setModified();
            }
        }
        updateSelectionIcons();
        view.draw();
    } else if (view.reed.contains(i, j)) {
        const ii = i_to_doc(i, view.reed, settings.direction_righttoleft);
        pattern.reed.toggle(ii, 0);
        setModified();
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

    // console.log(data);
    initSettings(data, settings);
    initPatternData(data, pattern);
    update_color_selector(settings);
    update_view_options(settings);

    const container = document.getElementById("container");
    canvas.style.backgroundColor = settings.darcula ? "#444" : "#fff";
    canvas.style.border = "none";
    canvas.width = container.clientWidth - 2;
    canvas.height = container.clientHeight - 2;

    const visible_shafts = data['visible_shafts'];
    const visible_treadles = data['visible_treadles'];

    view = new PatternView(
        pattern,
        settings,
        ctx,
        visible_shafts,
        visible_treadles
    );
    select_part("weave", 0, 0);  // TODO maybe save/restore last position
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


function initSettings(data, settings) {
    settings.style = val(data, "weave_style", "draft");
    settings.entering_style = val(data, "entering_style", "filled");
    settings.tieup_style = val(data, "tieup_style", "filled");
    settings.treadling_style = val(data, "treadling_style", "filled");
    settings.single_treadling = val(data, "single_treadling", true);
    settings.weave_locked = val(data, "weave_locked", false);
    settings.unit_width = val(data, "unit_width", 4);
    settings.unit_height = val(data, "unit_height", 4);
    settings.direction_righttoleft = val(data, "direction_righttoleft", false);
    settings.direction_toptobottom = val(data, "direction_toptobottom", false);
    settings.entering_at_bottom = val(data, "entering_at_bottom", false);
    settings.warp_factor = val(data, "warp_factor", 1.0);
    settings.weft_factor = val(data, "weft_factor", 1.0);
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
    settings.current_range = 1; // TODO maybe save/restore in data?
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
    // TODO maybe set current_range in data?
}


function initPatternData(data, pattern) {
    let idx = 0;
    for (const spec of data.palette) {
        colors[idx++] = (`rgb(${spec[0]}, ${spec[1]}, ${spec[2]})`);
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

    pattern.recalc_weave();
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
}


function keyDown(e) {
    if (e.key === "1" && e.altKey) {
        settings.style = "draft";
        document.getElementById("icon-weave-draft").className = "icon selected";
        document.getElementById("icon-weave-color").className = "icon";
        document.getElementById("icon-weave-simulation").className = "icon";
        document.getElementById("icon-weave-empty").className = "icon";
        view.draw();
        e.preventDefault();
    } else if (e.key === "2" && e.altKey) {
        settings.style = "color";
        document.getElementById("icon-weave-draft").className = "icon";
        document.getElementById("icon-weave-color").className = "icon selected";
        document.getElementById("icon-weave-simulation").className = "icon";
        document.getElementById("icon-weave-empty").className = "icon";
        view.draw();
        e.preventDefault();
    } else if (e.key === "3" && e.altKey) {
        settings.style = "simulation";
        document.getElementById("icon-weave-draft").className = "icon";
        document.getElementById("icon-weave-color").className = "icon";
        document.getElementById("icon-weave-simulation").className = "icon selected";
        document.getElementById("icon-weave-empty").className = "icon";
        view.draw();
        e.preventDefault();
    } else if (e.key === "4" && e.altKey) {
        settings.style = "invisible";
        document.getElementById("icon-weave-draft").className = "icon";
        document.getElementById("icon-weave-color").className = "icon";
        document.getElementById("icon-weave-simulation").className = "icon";
        document.getElementById("icon-weave-empty").className = "icon selected";
        view.draw();
        e.preventDefault();
    } else if (e.key === "a") { // TODO use better key shortcut
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
    } else if (e.key == " ") {
        if (cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2) {
            e.stopPropagation();
            e.preventDefault();
            cursor.selected_pattern.toggle(cursor.x1, cursor.y1);
            cursor.y1 += 1; // TODO handle configurable cursor movement
            cursor.y2 = cursor.y1;
            if (cursor.selected_part === "weave") {
                pattern.recalc_from_weave(settings);
            } else {
                pattern.recalc_weave();
            }
            setModified();
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
    } else if (cursor.x1 != cursor.x2 || cursor.y1 != cursor.y2) {
        if (e.key === "Delete") {
            selectionClear();
        } else if (e.key === "v") {
            selectionMirrorV();
        } else if (e.key === "h") {
            selectionMirrorH();
        } else if (e.key === "r") {
            selectionRotate();
        } else if (e.key === "i") {
            selectionInvert();
        }
    }
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

function selectionClear() {
    const i1 = Math.min(cursor.x1, cursor.x2);
    const i2 = Math.max(cursor.x1, cursor.x2);
    const j1 = Math.min(cursor.y1, cursor.y2);
    const j2 = Math.max(cursor.y1, cursor.y2);
    cursor.selected_pattern.clearRange(i1, j1, i2, j2);
    if (cursor.selected_part === "weave") {
        pattern.recalc_from_weave(settings);
    } else {
        pattern.recalc_weave();
    }
    setModified();
    view.draw();
}

function selectionInvert() {
    const i1 = Math.min(cursor.x1, cursor.x2);
    const i2 = Math.max(cursor.x1, cursor.x2);
    const j1 = Math.min(cursor.y1, cursor.y2);
    const j2 = Math.max(cursor.y1, cursor.y2);
    if (cursor.selected_part === "weave") {
        pattern.weave.invertRange(i1, j1, i2, j2);
        pattern.recalc_from_weave(settings);
        setModified();
        view.draw();
    } else if (cursor.selected_part === "tieup") {
        pattern.tieup.invertRange(i1, j1, i2, j2);
        pattern.recalc_weave();
        setModified();
        view.draw();
    }
}

function selectionRotate() {
    const i1 = Math.min(cursor.x1, cursor.x2);
    const i2 = Math.max(cursor.x1, cursor.x2);
    const j1 = Math.min(cursor.y1, cursor.y2);
    const j2 = Math.max(cursor.y1, cursor.y2);
    cursor.selected_pattern.rotateRight(i1, j1, i2, j2);
    if (cursor.selected_part === "weave") {
        pattern.recalc_from_weave(settings);
    } else {
        pattern.recalc_weave();
    }
    setModified();
    view.draw();
}

function selectionMirrorV() {
    const i1 = Math.min(cursor.x1, cursor.x2);
    const i2 = Math.max(cursor.x1, cursor.x2);
    const j1 = Math.min(cursor.y1, cursor.y2);
    const j2 = Math.max(cursor.y1, cursor.y2);
    cursor.selected_pattern.mirrorV(i1, j1, i2, j2);
    if (cursor.selected_part === "weave") {
        pattern.recalc_from_weave(settings);
    } else {
        pattern.recalc_weave();
    }
    setModified();
    view.draw();
}

function selectionMirrorH() {
    const i1 = Math.min(cursor.x1, cursor.x2);
    const i2 = Math.max(cursor.x1, cursor.x2);
    const j1 = Math.min(cursor.y1, cursor.y2);
    const j2 = Math.max(cursor.y1, cursor.y2);
    cursor.selected_pattern.mirrorH(i1, j1, i2, j2);
    if (cursor.selected_part === "weave") {
        pattern.recalc_from_weave(settings);
    } else {
        pattern.recalc_weave();
    }
    setModified();
    view.draw();
}

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
}


function update_view_options(settings) {
    document.getElementById("entering-visible").className = settings.display_entering ? "checked" : "";
    document.getElementById("treadling-visible").className = settings.display_treadling ? "checked" : "";
    document.getElementById("reed-visible").className = settings.display_reed ? "checked" : "";
    document.getElementById("colors-visible").className = settings.display_colors_warp || settings.display_colors_weft ? "checked" : "";
    document.getElementById("hlines-visible").className = settings.display_hlines ? "checked" : "";
}


window.addEventListener("load", () => {
    readonly = document.getElementById("readonly").value === "True";
    getPattern().then(init).then(update_layout_selector);
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
        settings.dx += 1;
        settings.dy += 1;
        if (settings.dx > 30) settings.dx = 30;
        if (settings.dy > 30) settings.dy = 30;
        view.layout();
        view.draw();
    });
    document.getElementById("zoom-out").addEventListener("click", (e) => {
        settings.dx -= 1;
        settings.dy -= 1;
        if (settings.dx < 8) settings.dx = 8;
        if (settings.dy < 8) settings.dy = 8;
        view.layout();
        view.draw();
    });
});

window.addEventListener("resize", resizeWindow);

async function checkAutosave() {
    if (modified) {
        saveSettings(data, settings);
        savePatternData(data, pattern);
        await savePattern();
    }
}

window.setInterval(checkAutosave, 30 * 1000);

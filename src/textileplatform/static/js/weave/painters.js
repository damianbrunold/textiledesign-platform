// Cell painters of the DB-WEAVE editor: how a cell of a pane is drawn
// in each style (filled, dot, cross, ..., number) and in the range
// colours (rangecolors), plus the pane pixel calculators and hit test
// the views build on. Pure drawing on a canvas context: everything
// comes in as parameters.

// The fixed colors for the various ranges
const rangecolors = {
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


// Pixel position calculators. Each pane stores its top-left corner in
// absolute canvas pixels (view.x, view.y). width/height stay in cells.
// calc_x(i) / calc_y(j) take a *local* cell index (0..width-1 from the
// pane's left/top edge, regardless of RTL/TTB) and return the pixel
// position of that gridline.
export function get_x_calculator(view, settings, righttoleft) {
    if (righttoleft) {
        return function(i) {
            return 0.5 + view.x + (view.width - i) * (view.dx || settings.dx);
        }
    } else {
        return function(i) {
            return 0.5 + view.x + i * (view.dx || settings.dx);
        }
    }
}


export function get_y_calculator(view, settings, toptobottom) {
    if (toptobottom) {
        return function(j) {
            return 0.5 + view.y + j * (view.dy || settings.dy);
        }
    } else {
        return function(j) {
            return 0.5 + view.y + (view.height - j) * (view.dy || settings.dy);
        }
    }
}

// Pixel-space hit testing for a pane. Returns local cell {i, j} the
// pixel maps to (0..width-1, 0..height-1 from the pane's top-left,
// pre-flip) or null when the pixel isn't inside the pane. Doc-coord
// conversion via i_to_doc / j_to_doc handles the RTL/TTB flip.
export function _paneHit(view, px, py, settings) {
    if (!view) return null;
    if (typeof view.x !== "number" || typeof view.y !== "number") return null;
    if (!(view.width > 0) || !(view.height > 0)) return null;
    const dx = view.dx || settings.dx;
    const dy = view.dy || settings.dy;
    const right  = view.x + view.width  * dx;
    const bottom = view.y + view.height * dy;
    if (px < view.x || px >= right)  return null;
    if (py < view.y || py >= bottom) return null;
    return {
        i: Math.floor((px - view.x) / dx),
        j: Math.floor((py - view.y) / dy),
    };
}


export function fillRect(ctx, x1, y1, x2, y2, b=0.0) {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x1 - x2);
    const h = Math.abs(y1 - y2);
    ctx.fillRect(x+b, y+b, w-2*b, h-2*b);
}


export function strokeRect(ctx, x1, y1, x2, y2, b=0.0) {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x1 - x2);
    const h = Math.abs(y1 - y2);
    ctx.strokeRect(x+b, y+b, w-2*b, h-2*b);
}


export function getRangeColor(settings, value) {
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


export function aushebungPainter(ctx, settings, view, i, j) {
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


export function anbindungPainter(ctx, settings, view, i, j, withBackground) {
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

export function abbindungPainter(ctx, settings, view, i, j, withBackground) {
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
        (view.dx - 2 * view.bx) / 3,
        (view.dy - 2 * view.by) / 3,
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

export function cellPainterFilled(ctx, settings, view, i, j, value) {
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
            (view.dx - 2 * view.bx) / 4,
            (view.dy - 2 * view.by) / 4,
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
            (view.dx - 2 * view.bx) / 2.5,
            (view.dy - 2 * view.by) / 2.5,
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
            (view.dx - 2 * view.bx) / 5,
            (view.dy - 2 * view.by) / 5,
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
            (view.dx - 2 * view.bx) / 5,
            (view.dy - 2 * view.by) / 5
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
            Math.min(view.dx, view.dy) - 2 * Math.max(view.bx, view.by) - 2
        );
        // Desktop parity (draw_cell.cpp NUMBER branch + draw.cpp call
        // sites): the rendered glyph is the index of the meaningful
        // axis (1-based), not the cell value. For einzug / aufknüpfung
        // that's the shaft (j-axis); for pegplan it's the shaft along
        // the i-axis. (Treadling never renders NUMBER on the desktop
        // — and the dialog excludes it from that select anyway — so
        // we don't need a treadling case.) Pick by painter_prop
        // because the painter is shared across panes.
        const axisI = view.painter_prop === "pegplan_style";
        const num = axisI
            ? (i + (view.offset_i || 0) + 1)
            : (j + (view.offset_j || 0) + 1);
        ctx.font = `${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = getRangeColor(settings, value);
        ctx.fillText(
            String(num),
            view.calc_x(i + 0.5),
            view.calc_y(j + 0.5)
        );
    }
}


export const cellPainters = {
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

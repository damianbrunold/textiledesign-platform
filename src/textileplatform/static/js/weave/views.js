// The DB-WEAVE editor's views: one GridView per pane (threading,
// tie-up, treadling / pegplan, weave, colour bars, reed), the
// scrollbars, the ViewSettings and PatternView, which lays the panes
// out on the canvas and draws them. Cell styles are in painters.js,
// guide lines in guides.js.

import { _drawHilfslinien } from "./guides.js";
import {
    abbindungPainter, anbindungPainter, aushebungPainter, cellPainters,
    fillRect, get_x_calculator, get_y_calculator, getRangeColor, strokeRect,
} from "./painters.js";
import { colors, cursor, pattern, settings } from "./state.js";

export class GridViewDummy {
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

    draw(ctx, settings) {
        this.drawGrid(ctx, settings);
        this.drawData(ctx, settings);
    }

    drawCursor(ctx, settings, cursor) {

        let i1 = Math.min(cursor.x1, cursor.x2);
        let i2 = Math.max(cursor.x1, cursor.x2);
        let j1 = Math.min(cursor.y1, cursor.y2);
        let j2 = Math.max(cursor.y1, cursor.y2);

        i1 = Math.min(Math.max(i1, this.offset_i), this.offset_i + this.width);
        i2 = Math.min(Math.max(i2, this.offset_i), this.offset_i + this.width - 1);

        j1 = Math.min(Math.max(j1, this.offset_j), this.offset_j + this.height);
        j2 = Math.min(Math.max(j2, this.offset_j), this.offset_j + this.height - 1);


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
        const styleKey = settings[this.painter_prop];
        let painter = cellPainters[styleKey];
        if (typeof painter !== "function") {
            // Defensive: a settings key got cleared / set to a value
            // that isn't in cellPainters. Fall back to "filled" so the
            // editor keeps rendering, and log once so we can chase the
            // offender.
            if (!GridView._warnedPainter) GridView._warnedPainter = {};
            if (!GridView._warnedPainter[this.painter_prop]) {
                GridView._warnedPainter[this.painter_prop] = true;
                console.warn("drawData: no painter for settings."
                    + this.painter_prop + " = "
                    + JSON.stringify(styleKey)
                    + " — falling back to 'filled'");
            }
            painter = cellPainters['filled'];
        }
        // Fixiert / user-defined threading: highlight warps whose
        // assigned shaft no longer matches the saved template. fixeinzug
        // is packed (empty warps skipped) and tiled across the array
        // by updateFixedEntering, so the template slot for warp w is
        // fixeinzug[count of non-empty warps strictly before w].
        // Direct port of TDBWFRM::DrawEinzug's red-cell logic.
        let mismatchSet = null;
        if (pattern
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

        let i1 = Math.min(cursor.x1, cursor.x2);
        let i2 = Math.max(cursor.x1, cursor.x2);
        let j1 = Math.min(cursor.y1, cursor.y2);
        let j2 = Math.max(cursor.y1, cursor.y2);

        i1 = Math.min(Math.max(i1, this.offset_i), this.offset_i + this.width);
        i2 = Math.min(Math.max(i2, this.offset_i), this.offset_i + this.width - 1);

        j1 = Math.min(Math.max(j1, this.offset_j), this.offset_j + this.height);
        j2 = Math.min(Math.max(j2, this.offset_j), this.offset_j + this.height - 1);


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
        // Sinking shed (Untenhebend): the binding marks indicate where
        // the warp goes UNDER the weft instead of over it, so the
        // colour effect is inverted.
        const sink = !!settings.sinking_shed;

        for (let i = this.offset_i; i < this.offset_i + width; i++) {
            if (i < pattern.min_x || pattern.max_x < i) continue;
            for (let j = this.offset_j; j < this.offset_j + height; j++) {
                if (j < pattern.min_y || pattern.max_y < j) continue;
                const value = this.data.get(i, j);
                const warpUp = (value > 0) !== sink;
                let color;
                if (warpUp) {
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

        // Sinking shed: marks mean warp-down, so warp/weft visibility
        // flips relative to the rising-shed default.
        const sink = !!settings.sinking_shed;

        for (let i = this.offset_i; i < this.offset_i + width; i++) {
            if (i < pattern.min_x || pattern.max_x < i) continue;
            for (let j = this.offset_j; j < this.offset_j + height; j++) {
                if (j < pattern.min_y || pattern.max_y < j) continue;

                const value = this.data.get(i, j);
                const warpUp = (value > 0) !== sink;

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
                if (warpUp) {
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

    draw(ctx, settings) {
        this.drawGrid(ctx, settings);
        this.drawDataColor(ctx, settings);
    }

    drawCursor(ctx, settings, cursor) {

        let i1 = Math.min(cursor.x1, cursor.x2);
        let i2 = Math.max(cursor.x1, cursor.x2);
        let j1 = Math.min(cursor.y1, cursor.y2);
        let j2 = Math.max(cursor.y1, cursor.y2);

        i1 = Math.min(Math.max(i1, this.offset_i), this.offset_i + this.width);
        i2 = Math.min(Math.max(i2, this.offset_i), this.offset_i + this.width);

        j1 = Math.min(Math.max(j1, this.offset_j), this.offset_j + this.height);
        j2 = Math.min(Math.max(j2, this.offset_j), this.offset_j + this.height);


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

    draw(ctx, settings) {
        this.drawGrid(ctx, settings);
        this.drawData(ctx, settings);
    }

    drawCursor(ctx, settings, cursor) {
        const width = Math.min(this.width, this.data.width);
        let i1 = Math.min(cursor.x1, cursor.x2);
        let i2 = Math.max(cursor.x1, cursor.x2);
        i1 = Math.min(Math.max(i1, this.offset_i), this.offset_i + width);
        i2 = Math.min(Math.max(i2, this.offset_i), this.offset_i + width);
        const x1 = this.calc_x(i1 - this.offset_i);
        const x2 = this.calc_x(i2 + 1 - this.offset_i);
        const y1 = this.calc_y(0);
        const y2 = this.calc_y(1);
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
        const width = Math.min(this.width, this.data.width);

        ctx.beginPath();
        for (let i = 0; i <= width; i++) {
            const x = this.calc_x(i);
            ctx.moveTo(x, this.calc_y(0));
            ctx.lineTo(x, this.calc_y(1));
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


export class ViewSettings {
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

// Keep settings.dx / settings.dy = base_dx (the equal-axis baseline).
// The actual per-axis cell sizes implied by warp_factor / weft_factor
// are applied PER PANE during PatternView.layout — this lets only the
// warp-axis panes (gewebe, einzug, color_warp, reed) widen when
// warp_factor > weft_factor, and only the weft-axis panes (gewebe,
// trittfolge, color_weft) stretch when weft_factor > warp_factor.
export function _applyAspectRatio(s) {
    if (!s) return;
    const base = Math.max(2, s.base_dx | 0 || s.dx | 0 || 12);
    s.dx = base;
    s.dy = base;
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
        return range[0] <= x && x <= range[1]
            && this.y + this.delta <= y
            && y <= this.y + this.height;
    }

    scrollTo(x) {
        const dx = this.dx || settings.dx;
        let f;
        if (this.righttoleft) {
            f = 1.0 - 1.0 * (x - this.x) / (this.width * dx);
        } else {
            f = 1.0 * (x - this.x) / (this.width * dx);
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
        const dx = this.dx || settings.dx;
        const w = this.width * dx - 1;
        const a = Math.min(w / this.pattern.width * this.views[0].offset_i, w);
        const b = Math.min(w / this.pattern.width * (this.views[0].offset_i + this.views[0].width), w);
        ctx.fillStyle = settings.darcula ? "#666" : "#999";
        fillRect(
            ctx,
            this.calc_x(a / dx),
            0.5 + this.y + this.delta,
            this.calc_x(b / dx),
            this.y + this.height - 0.5,
            1.0
        );
        ctx.strokeSyle = settings.darcula ? "#aaa" : "#000";
        ctx.lineWidth = 1;
        // Far edges use -0.5 (instead of +0.5) so a 1px stroke whose
        // bottom centre would otherwise sit at canvas.height stays
        // fully inside the canvas. Without this, a perfectly-fitting
        // layout (leftover = 0) clips the bottom line in half.
        strokeRect(
            ctx,
            this.calc_x(0),
            0.5 + this.y + this.delta,
            this.calc_x(this.width),
            this.y + this.height - 0.5
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
        return range[0] <= y && y <= range[1]
            && this.x + this.delta <= x
            && x <= this.x + this.width;
    }

    scrollTo(y) {
        const dy = this.dy || settings.dy;
        let f;
        if (this.toptobottom) {
            f = 1.0 * (y - this.y) / (this.height * dy);
        } else {
            f = 1.0 - 1.0 * (y - this.y) / (this.height * dy);
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
        const dy = this.dy || settings.dy;
        const h = this.height * dy - 1;
        const a = Math.min(h / this.pattern.height * this.views[0].offset_j, h);
        const b = Math.min(h / this.pattern.height * (this.views[0].offset_j + this.views[0].height), h);
        ctx.fillStyle = settings.darcula ? "#666" : "#999";
        fillRect(
            ctx,
            0.5 + this.x + this.delta,
            this.calc_y(a / dy),
            this.x + this.width - 0.5,
            this.calc_y(b / dy)
        );
        ctx.strokeSyle = settings.darcula ? "#aaa" : "#000";
        // Far edge uses -0.5 (see ScrollbarHorz.draw above) so the
        // right line stays fully inside the canvas when the layout
        // happens to put the bar flush against canvas.width.
        strokeRect(
            ctx,
            0.5 + this.x + this.delta,
            this.calc_y(0),
            this.x + this.width - 0.5,
            this.calc_y(this.height)
        );
    }
}


export class PatternView {
    constructor(data, settings, ctx, visible_shafts=16, visible_treadles=16) {
        this.settings = settings;
        this.data = data;
        this.ctx = ctx;
        this.visible_shafts = visible_shafts;
        this.visible_treadles = visible_treadles;
        // Called after every draw (the editor updates its status bar).
        this.afterDraw = null;
        this.layout();
    }

    withBorder(n) {
        return n == 0 ? n : n + 1;
    }

    layout() {
        const base_dx = this.settings.dx;
        const base_dy = this.settings.dy;
        // Per-axis cell sizes from warp_factor / weft_factor: only the
        // *larger-factor* axis stretches; everything else stays at base.
        const wf = +this.settings.warp_factor || 1.0;
        const sf = +this.settings.weft_factor || 1.0;
        const warp_dx = wf > sf ? base_dx * wf / sf : base_dx;
        const weft_dy = sf > wf ? base_dy * sf / wf : base_dy;
        const scroll = 15;

        const PANE_GAP = 6;
        const hlBar = this.settings.display_hlines ? 1 : 0;
        const pegplanMode = !!this.settings.display_pegplan;
        const width3 = this.settings.display_colors_weft ? 1 : 0;
        const sidePaneWidth = pegplanMode ? this.visible_shafts : this.visible_treadles;
        const width2 = (pegplanMode ? true : this.settings.display_treadling)
            ? sidePaneWidth : 0;
        const height4 = this.settings.display_colors_warp ? 1 : 0;
        const height3 = this.settings.display_entering ? this.visible_shafts : 0;
        const height2 = this.settings.display_reed ? 1 : 0;

        // Pixel-aware sizing: weave width × warp_dx + side-pane × base_dx
        // + colour_weft × base_dx + (bar × base_dx) + gaps + scroll
        // ≤ canvas.width. Same idea on the weft axis.
        const xVisibleBands = 1
            + (width2 > 0 ? 1 : 0)
            + (width3 > 0 ? 1 : 0)
            + (hlBar ? 1 : 0);
        const xGaps = Math.max(0, xVisibleBands - 1);
        const xUsedFixed = width2 * base_dx
                         + width3 * base_dx
                         + (hlBar ? base_dx : 0);
        const xAvailWarp = this.ctx.canvas.width - scroll - xUsedFixed
                         - xGaps * PANE_GAP;
        // Cap visible width at the actual pattern width: a small pattern
        // shouldn't stretch the weave pane across the full canvas, which
        // would push the side panes (treadling / tie-up) far to the right
        // and leave dead space between them.
        const dataWidth = (this.data.weave && this.data.weave.width) || 0;
        let width1 = Math.max(0, Math.floor(xAvailWarp / warp_dx));
        if (dataWidth > 0) width1 = Math.min(width1, dataWidth);

        const yVisibleBands = (hlBar ? 1 : 0)
            + (height4 > 0 ? 1 : 0)
            + (height3 > 0 ? 1 : 0)
            + (height2 > 0 ? 1 : 0)
            + 1;
        const yGaps = Math.max(0, yVisibleBands - 1);
        const yUsedFixed = (hlBar ? base_dy : 0)
                         + height4 * base_dy
                         + height3 * base_dy
                         + height2 * base_dy;
        const yAvailWeft = this.ctx.canvas.height - scroll - yUsedFixed
                         - yGaps * PANE_GAP;
        // Same cap on the weft axis: don't stretch the weave pane below
        // the actual pattern height — keeps the lower bands (e.g. weft
        // colour bar) near the top.
        const dataHeight = (this.data.weave && this.data.weave.height) || 0;
        let height1 = Math.max(0, Math.floor(yAvailWeft / weft_dy));
        if (dataHeight > 0) height1 = Math.min(height1, dataHeight);

        // Cell-coord bookkeeping kept for the bar definitions below.

        // Y/X origins of the actual pane content. When hlBar=1 we shift
        // everything by 1 cell to leave room for the bar at top/left.
        let y4; // warp color bar
        let y3; // entering
        let y2; // reed
        let y1; // weave

        if (this.settings.entering_at_bottom) {
            y1 = hlBar;
            y2 = y1 + this.withBorder(height1);
            y3 = y2 + this.withBorder(height2);
            y4 = y3 + this.withBorder(height3);
        } else {
            y4 = hlBar;
            y3 = y4 + this.withBorder(height4);
            y2 = y3 + this.withBorder(height3);
            y1 = y2 + this.withBorder(height2);
        }

        const x1 = 0;
        const x2 = x1 + this.withBorder(width1);
        const x3 = x2 + this.withBorder(width2);
        // Vertical bar sits immediately after color_weft (when visible)
        // or at x3 (= treadling's trailing border, giving a 1-cell gap)
        // when colour_weft is hidden. A small visual pixel gap on the
        // bar's left edge is added at draw-time. This keeps the
        // scrollbar inside the canvas.
        const xVBar = x3 + width3;

        // Hilfslinien bar geometry (cell-coord rectangles). hbar_warp /
        // hbar_treadle sit on the top reserved row; vbar_shaft /
        // vbar_weft on the right column with a 1-cell gap from the
        // colour panes. Built only when active.
        if (hlBar) {
            this.hbar_warp = { x: x1, y: 0, width: width1, height: 1 };
            this.hbar_treadle = (width2 > 0)
                ? { x: x2, y: 0, width: width2, height: 1 }
                : null;
            this.vbar_shaft = (height3 > 0)
                ? { x: xVBar, y: y3, width: 1, height: height3 }
                : null;
            this.vbar_weft = { x: xVBar, y: y1, width: 1, height: height1 };
        } else {
            this.hbar_warp = this.hbar_treadle = null;
            this.vbar_shaft = this.vbar_weft = null;
        }

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
            'pegplan_style',
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
        // Vertical hilfslinien bar pushes the scrollbar further right.
        if (hlBar) sbx = xVBar + 1;

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
        } else if (cursor.selected_part === "reed") {
            cursor.selected_view = this.reed;
        }

        // -----------------------------------------------------------
        // Convert each pane's cell-coord origin into an ABSOLUTE
        // CANVAS PIXEL position. The pixel walk uses PER-BAND cell
        // sizes (warp_dx / weft_dy / base) so warp_factor and
        // weft_factor only stretch the panes that span those axes —
        // gewebe + einzug + reed + colour_warp on the warp axis,
        // gewebe + treadling + colour_weft on the weft axis.
        let cx = 0;
        const pxX1 = cx; cx += width1 * warp_dx;
        if (width2 > 0) cx += PANE_GAP;
        const pxX2 = cx; cx += width2 * base_dx;
        if (width3 > 0) cx += PANE_GAP;
        const pxX3 = cx; cx += width3 * base_dx;
        let pxXVBar = cx;
        if (hlBar) {
            cx += PANE_GAP;
            pxXVBar = cx;
            cx += base_dx;
        }
        const pxSbx = cx;

        let cy = 0;
        let pxYBar = cy;
        if (hlBar) cy += base_dy + PANE_GAP;
        let pxY1, pxY2, pxY3, pxY4;
        if (this.settings.entering_at_bottom) {
            pxY1 = cy; cy += height1 * weft_dy;
            if (height2 > 0) cy += PANE_GAP;
            pxY2 = cy; cy += height2 * base_dy;
            if (height3 > 0) cy += PANE_GAP;
            pxY3 = cy; cy += height3 * base_dy;
            if (height4 > 0) cy += PANE_GAP;
            pxY4 = cy; cy += height4 * base_dy;
        } else {
            pxY4 = cy; cy += height4 * base_dy;
            if (height4 > 0 && (height3 > 0 || height2 > 0 || height1 > 0)) cy += PANE_GAP;
            pxY3 = cy; cy += height3 * base_dy;
            if (height3 > 0 && (height2 > 0 || height1 > 0)) cy += PANE_GAP;
            pxY2 = cy; cy += height2 * base_dy;
            if ((height4 > 0 || height3 > 0 || height2 > 0) && height1 > 0) cy += PANE_GAP;
            pxY1 = cy; cy += height1 * weft_dy;
        }
        const pxSby = cy;

        const bxf = this.settings.bxf;
        const byf = this.settings.byf;
        const setPane = (pane, px, py, paneDx, paneDy) => {
            if (!pane) return;
            pane.x = px;
            pane.y = py;
            pane.dx = paneDx;
            pane.dy = paneDy;
            pane.bx = paneDx * bxf;
            pane.by = paneDy * byf;
        };
        setPane(this.color_warp, pxX1, pxY4, warp_dx, base_dy);
        setPane(this.entering,   pxX1, pxY3, warp_dx, base_dy);
        setPane(this.tieup,      pxX2, pxY3, base_dx, base_dy);
        setPane(this.reed,       pxX1, pxY2, warp_dx, base_dy);
        setPane(this.weave,      pxX1, pxY1, warp_dx, weft_dy);
        setPane(this.pegplan,    pxX2, pxY1, base_dx, weft_dy);
        setPane(this.treadling,  pxX2, pxY1, base_dx, weft_dy);
        setPane(this.color_weft, pxX3, pxY1, base_dx, weft_dy);
        // Hilfslinien bars (width / height stay in cells; bar dx/dy
        // matches the axis they span so tick spacing is correct).
        if (this.hbar_warp)
            setPane(this.hbar_warp,    pxX1,    pxYBar, warp_dx, base_dy);
        if (this.hbar_treadle)
            setPane(this.hbar_treadle, pxX2,    pxYBar, base_dx, base_dy);
        if (this.vbar_shaft)
            setPane(this.vbar_shaft,   pxXVBar, pxY3,   base_dx, base_dy);
        if (this.vbar_weft)
            setPane(this.vbar_weft,    pxXVBar, pxY1,   base_dx, weft_dy);
        // Scrollbars: dx/dy = the axis they scroll. scroll_1_hor scrolls
        // the warp axis (under weave / colour_warp / etc), so dx=warp_dx.
        setPane(this.scroll_1_hor, pxX1,  pxSby, warp_dx, base_dy);
        setPane(this.scroll_2_hor, pxX2,  pxSby, base_dx, base_dy);
        setPane(this.scroll_1_ver, pxSbx, pxY1,  base_dx, weft_dy);
        setPane(this.scroll_2_ver, pxSbx, pxY3,  base_dx, base_dy);
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

        if (this.settings.display_hlines) {
            _drawHilfslinien(this);
        }
        if (cursor.selected_view) {
            cursor.selected_view.drawCursor(this.ctx, this.settings, cursor);
        }
        if (this.afterDraw) this.afterDraw();
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
        // Redraw the grid lines where we painted so cells get their usual
        // borders back (the full-cell clear above wiped out the lines
        // painted earlier by weave.drawGrid). Both tiers have to come
        // back: the gray minor lines around every cell AND the dark
        // major "Schienen" every unit_width / unit_height cells --
        // otherwise the unit raster disappears inside the rapport.
        // The major/minor test mirrors GridView.drawGrid: an edge is
        // major when its GLOBAL cell index is a multiple of the unit.
        if (paintSet.length) {
            const uw = s.unit_width > 0 ? s.unit_width : 0;
            const uh = s.unit_height > 0 ? s.unit_height : 0;
            const minor = [], major = [];
            for (const [li, lj, di, dj] of paintSet) {
                const x1 = weavePane.calc_x(li);
                const y1 = weavePane.calc_y(lj);
                const x2 = weavePane.calc_x(li + 1);
                const y2 = weavePane.calc_y(lj + 1);
                (uw && di % uw === 0 ? major : minor)
                    .push([x1, y1, x1, y2]);
                (uw && (di + 1) % uw === 0 ? major : minor)
                    .push([x2, y1, x2, y2]);
                (uh && dj % uh === 0 ? major : minor)
                    .push([x1, y1, x2, y1]);
                (uh && (dj + 1) % uh === 0 ? major : minor)
                    .push([x1, y2, x2, y2]);
            }
            ctx.lineWidth = 1;
            // Minor first, major on top so the Schienen win where a
            // major and a minor edge coincide.
            for (const [segs, color] of [
                [minor, s.darcula ? "#aaa" : "#777"],
                [major, s.darcula ? "#fff" : "#000"],
            ]) {
                if (!segs.length) continue;
                ctx.strokeStyle = color;
                ctx.beginPath();
                for (const [ax, ay, bx, by] of segs) {
                    ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
                }
                ctx.stroke();
            }
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

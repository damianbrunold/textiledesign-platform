// Guide lines (Hilfslinien) of the DB-WEAVE editor: port of the
// desktop's hilfslinien.cpp. Toggling, drawing and hit-testing the
// guide-line bars.

import { setModified } from "../ui/common.js";
import { _paneHit } from "./painters.js";
import { commandBus, pattern, readonly, settings, view } from "./state.js";

// ---- Hilfslinien (guide lines) — port of hilfslinien.cpp -----------
//
// Stored as pattern.hlines: array of { typ:"horz"|"vert", feld:0|1, pos:int }
// where feld = 0 means top/left half (entering, gewebe-warp axis),
// feld = 1 means bottom/right half (treadling, weft axis).
//
// Click-targets: four narrow bar regions (one cell row at the very top
// for vertical-line toggles, one cell column on the left for
// horizontal-line toggles). Built by PatternView.layout when
// settings.display_hlines is on.

const HLINE_COLOR = "#1d6fff";
const HLINE_BAR_COLOR_LIGHT = "#dcdcdc";
const HLINE_BAR_COLOR_DARK  = "#4a4a4a";

function _hlineFind(typ, feld, pos) {
    if (!pattern || !pattern.hlines) return -1;
    for (let i = 0; i < pattern.hlines.length; i++) {
        const h = pattern.hlines[i];
        if (h.typ === typ && h.feld === feld && h.pos === pos) return i;
    }
    return -1;
}

export function _hlineToggle(typ, feld, pos) {
    if (readonly) return;
    const idx = _hlineFind(typ, feld, pos);
    const wasPresent = idx >= 0;
    const entry = { typ, feld, pos };
    const finalize = () => { setModified(); if (view) view.draw(); };
    const cmd = {
        label: wasPresent ? "remove guide line" : "add guide line",
        apply() {
            const i = _hlineFind(typ, feld, pos);
            if (wasPresent) { if (i >= 0) pattern.hlines.splice(i, 1); }
            else            { if (i < 0) pattern.hlines.push(entry); }
            finalize();
        },
        revert() {
            const i = _hlineFind(typ, feld, pos);
            if (wasPresent) { if (i < 0) pattern.hlines.push(entry); }
            else            { if (i >= 0) pattern.hlines.splice(i, 1); }
            finalize();
        },
    };
    if (commandBus) commandBus.execute(cmd);
    else cmd.apply();
}

export function _drawHilfslinien(v) {
    const ctx = v.ctx;
    const s = v.settings;
    const barFill = s.darcula ? HLINE_BAR_COLOR_DARK : HLINE_BAR_COLOR_LIGHT;
    const tickColor = s.darcula ? "#888" : "#444";
    const outlineColor = s.darcula ? "#222" : "#999";
    // Ruler-style bar: solid fill + outline, plus half-depth tick marks
    // at every cell boundary along the bar's main axis. Each bar's own
    // dx/dy determine its tick spacing, so warp / weft ratio cells map
    // 1:1 to bar ticks.
    const drawHBar = (b) => {
        if (!b) return;
        const dx = b.dx, dy = b.dy;
        const x = b.x, y = b.y;
        const w = b.width * dx, h = b.height * dy;
        ctx.fillStyle = barFill;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        // One tick per cell at its left edge — no trailing tick at the
        // pane's right edge.
        for (let i = 0; i < b.width; i++) {
            const tx = x + i * dx + 0.5;
            ctx.moveTo(tx, y + h);          // bottom edge
            ctx.lineTo(tx, y + h / 2);      // half height up
        }
        ctx.stroke();
        ctx.strokeStyle = outlineColor;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    };
    const drawVBar = (b) => {
        if (!b) return;
        const dx = b.dx, dy = b.dy;
        const x = b.x, y = b.y;
        const w = b.width * dx, h = b.height * dy;
        ctx.fillStyle = barFill;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        // One tick per cell at its top edge — no trailing tick at the
        // pane's bottom edge.
        for (let j = 0; j < b.height; j++) {
            const ty = y + j * dy + 0.5;
            ctx.moveTo(x,         ty);      // left edge
            ctx.lineTo(x + w / 2, ty);      // half width right
        }
        ctx.stroke();
        ctx.strokeStyle = outlineColor;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    };
    drawHBar(v.hbar_warp);
    drawHBar(v.hbar_treadle);
    drawVBar(v.vbar_shaft);
    drawVBar(v.vbar_weft);

    // The actual guide lines — one per pattern.hlines entry, plus a
    // small filled marker inside the corresponding bar so the user can
    // see at a glance where guide lines are anchored.
    const lines = pattern.hlines || [];
    for (const h of lines) _drawOneHilfslinie(v, h);
}

function _drawOneHilfslinie(v, h) {
    const ctx = v.ctx;
    const s = v.settings;
    const pegplan = !!s.display_pegplan;
    const MARK = 5;

    const strokeLine = (segments) => {
        ctx.strokeStyle = HLINE_COLOR;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (const [x1, y1, x2, y2] of segments) {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        }
        ctx.stroke();
    };
    const horzMarker = (bar, y) => {
        if (!bar) return;
        ctx.fillStyle = HLINE_COLOR;
        ctx.fillRect(bar.x + 1, y - Math.floor(MARK / 2),
                     bar.width * bar.dx - 2, MARK);
    };
    const vertMarker = (bar, x) => {
        if (!bar) return;
        ctx.fillStyle = HLINE_COLOR;
        ctx.fillRect(x - Math.floor(MARK / 2), bar.y + 1,
                     MARK, bar.height * bar.dy - 2);
    };

    // Guide lines land ON grid lines (between cells), not in cell
    // centres — direct port of desktop _DrawHilfslinie which uses
    // pos*gh / pos*gw without a half-cell offset.
    if (h.typ === "horz" && h.feld === 0) {
        const ez = v.entering;
        if (!ez || ez.height <= 0) return;
        const local = h.pos - ez.offset_j;
        if (local < 0 || local > ez.height) return;
        const y = s.direction_toptobottom
            ? ez.y + local * ez.dy
            : ez.y + (ez.height - local) * ez.dy;
        const segs = [[ez.x, y, ez.x + ez.width * ez.dx, y]];
        if (v.tieup && (pegplan || s.display_treadling)) {
            segs.push([v.tieup.x, y, v.tieup.x + v.tieup.width * v.tieup.dx, y]);
        }
        strokeLine(segs);
        horzMarker(v.vbar_shaft, y);

    } else if (h.typ === "horz" && h.feld === 1) {
        const w = v.weave;
        if (!w || w.height <= 0) return;
        const local = h.pos - w.offset_j;
        if (local < 0 || local > w.height) return;
        const y = w.y + (w.height - local) * w.dy;
        const segs = [[w.x, y, w.x + w.width * w.dx, y]];
        const side = pegplan ? v.pegplan : v.treadling;
        if (side && (pegplan || s.display_treadling)) {
            segs.push([side.x, y, side.x + side.width * side.dx, y]);
        }
        strokeLine(segs);
        horzMarker(v.vbar_weft, y);

    } else if (h.typ === "vert" && h.feld === 0) {
        const w = v.weave;
        if (!w || w.width <= 0) return;
        const local = h.pos - w.offset_i;
        if (local < 0 || local > w.width) return;
        const x = s.direction_righttoleft
            ? w.x + (w.width - local) * w.dx
            : w.x + local * w.dx;
        const segs = [[x, w.y, x, w.y + w.height * w.dy]];
        if (v.entering && s.display_entering) {
            segs.push([x, v.entering.y, x, v.entering.y + v.entering.height * v.entering.dy]);
        }
        strokeLine(segs);
        vertMarker(v.hbar_warp, x);

    } else if (h.typ === "vert" && h.feld === 1) {
        const tf = pegplan ? v.pegplan : v.treadling;
        if (!tf || tf.width <= 0) return;
        const local = h.pos - tf.offset_i;
        if (local < 0 || local > tf.width) return;
        const x = tf.x + local * tf.dx;
        const segs = [[x, tf.y, x, tf.y + tf.height * tf.dy]];
        if (v.tieup && s.display_entering && !pegplan) {
            segs.push([x, v.tieup.y, x, v.tieup.y + v.tieup.height * v.tieup.dy]);
        }
        strokeLine(segs);
        vertMarker(v.hbar_treadle, x);
    }
}

// Hit-test a click in pixel coords against the hline bars. Returns
// {typ, feld, pos} for the toggled line, or null when not on a bar.
// Snaps the click to the NEAREST tick along the bar's main axis (so a
// click anywhere in the right half of a cell selects the next gridline,
// not the cell's own left edge — matches the visual tick spacing).
export function _hlineHitPx(px, py) {
    if (!view || !settings.display_hlines) return null;
    // Nearest-tick snap on a bar's primary axis. Ticks live on grid
    // lines, so there are count+1 of them (0..count inclusive,
    // representing both pane edges plus the count-1 internal lines).
    const snapH = (bar) =>
        Math.max(0, Math.min(bar.width,  Math.round((px - bar.x) / bar.dx)));
    const snapV = (bar) =>
        Math.max(0, Math.min(bar.height, Math.round((py - bar.y) / bar.dy)));
    if (_paneHit(view.hbar_warp, px, py, settings)) {
        const w = view.weave;
        let local = snapH(view.hbar_warp);
        if (settings.direction_righttoleft) local = w.width - local;
        const pos = local + (w ? w.offset_i : 0);
        return { typ: "vert", feld: 0, pos };
    }
    if (_paneHit(view.hbar_treadle, px, py, settings)) {
        const tf = settings.display_pegplan ? view.pegplan : view.treadling;
        const local = snapH(view.hbar_treadle);
        const pos = local + (tf ? tf.offset_i : 0);
        return { typ: "vert", feld: 1, pos };
    }
    if (_paneHit(view.vbar_shaft, px, py, settings)) {
        const ez = view.entering;
        let local = snapV(view.vbar_shaft);
        if (!settings.direction_toptobottom) local = ez.height - local;
        const pos = local + (ez ? ez.offset_j : 0);
        return { typ: "horz", feld: 0, pos };
    }
    if (_paneHit(view.vbar_weft, px, py, settings)) {
        const w = view.weave;
        const local = w.height - snapV(view.vbar_weft);
        const pos = local + (w ? w.offset_j : 0);
        return { typ: "horz", feld: 1, pos };
    }
    return null;
}

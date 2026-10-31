// Thumbnail and preview images of a DB-WEAVE pattern for the pattern
// lists: the threading / weave panes rendered into an offscreen canvas
// as PNG data URLs (captureThumbnails, called by ui/common.js on save).

import {
    abbindungPainter, anbindungPainter, aushebungPainter, cellPainterFilled,
} from "./painters.js";
import { pattern, settings } from "./state.js";

// --- Thumbnail / preview capture ---------------------------------------
//
// Renders the current weave pattern to a small offscreen canvas with two
// halves: the left half is the patrone (draft) view, the right half is
// the simulation view (warp/weft yarn colours). Two sizes are produced
// — a small thumbnail and a larger preview — both as PNG data URLs.
//
// Edge cases:
//   * Patterns much wider than tall (or vice versa) are letterboxed in
//     each half, preserving aspect ratio.
//   * Very small patterns get chunky cells; very large patterns get
//     sub-pixel cells (rendered with overlapping fillRect — visually OK
//     for a thumbnail).
//   * Robust against missing palette / colour arrays — falls back to
//     #888 for an unresolvable colour.

function _paletteRgb(data, idx) {
    const pal = data && data.palette;
    if (Array.isArray(pal) && idx >= 0 && idx < pal.length) {
        const c = pal[idx];
        if (Array.isArray(c) && c.length >= 3) {
            return `rgb(${c[0]|0}, ${c[1]|0}, ${c[2]|0})`;
        }
    }
    return "#888";
}

// Minimum thumbnail cell size in pixels. Must be odd (so symbol
// painters render symmetrically). When the pattern is too large to fit
// at this size, the renderer crops a leading slice rather than
// shrinking cells further.
const _THUMB_MIN_CELL_PX = 5;

function _renderTwoPaneToCanvas(data, pat, w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);

    const dataW = (data && data.width)  | 0;
    const dataH = (data && data.height) | 0;
    if (dataW <= 0 || dataH <= 0 || !pat || !pat.weave) {
        ctx.fillStyle = "#bbb";
        ctx.fillRect((w >> 1) - 1, 0, 1, h);
        return canvas;
    }

    // Crop to actual content extent so empty padding doesn't waste
    // thumbnail space. Fall back to full dimensions if the extent is
    // missing or degenerate.
    let i0 = 0, j0 = 0, pw = dataW, ph = dataH;
    if (Number.isInteger(pat.min_x) && Number.isInteger(pat.max_x)
        && pat.max_x >= pat.min_x) {
        i0 = Math.max(0, pat.min_x);
        pw = Math.min(dataW, pat.max_x - pat.min_x + 1);
    }
    if (Number.isInteger(pat.min_y) && Number.isInteger(pat.max_y)
        && pat.max_y >= pat.min_y) {
        j0 = Math.max(0, pat.min_y);
        ph = Math.min(dataH, pat.max_y - pat.min_y + 1);
    }

    const halfW = Math.floor(w / 2);
    const halfH = h;
    const minCell = _THUMB_MIN_CELL_PX;

    // Cell aspect ratio honours warp_factor / weft_factor (the editor's
    // configurable cell aspect): cellW : cellH = wf : sf. Defaults to
    // square cells when the factors aren't set or are equal.
    const baseSettings = (settings)
        ? settings : { darcula: false };
    const wf = Math.max(0.01, +baseSettings.warp_factor || 1.0);
    const sf = Math.max(0.01, +baseSettings.weft_factor || 1.0);

    // Pick the cell scale k such that cellW = wf*k, cellH = sf*k. We
    // want to fill the half — taking the LARGER of the two "fit" k
    // values guarantees that at least one axis is fully covered, with
    // slight (or significant, for large patterns) overflow on the
    // other axis that we crop with a clip rect. This avoids any
    // letterbox whitespace.
    const kFillW = halfW / (wf * pw);
    const kFillH = halfH / (sf * ph);
    let k = Math.max(kFillW, kFillH);
    let cellW = wf * k;
    let cellH = sf * k;

    // Floor: if at the fill scale cells are too small to be discernible
    // (very large pattern), bump k up so the smaller dimension reaches
    // MIN_CELL. The other dimension stays in proportion.
    if (Math.min(cellW, cellH) < minCell) {
        k = minCell / Math.min(wf, sf);
        cellW = wf * k;
        cellH = sf * k;
    }

    // Render exactly enough cells to cover the half (ceil → slight
    // overflow), capped at the pattern extent. The clip rect handles
    // the overflow.
    const visW = Math.min(pw, Math.max(1, Math.ceil(halfW / cellW)));
    const visH = Math.min(ph, Math.max(1, Math.ceil(halfH / cellH)));

    const thumbSettings = Object.assign({}, baseSettings, {
        bxf: 0.15,
        byf: 0.15,
        _fixForceRed: false,
    });

    // Orientation: respect the user's display settings so the thumbnail
    // matches what they see in the editor. RTL flips x (i=0 on the
    // right); TTB flips y (j=0 at the top).
    const rtl = !!baseSettings.direction_righttoleft;
    const ttb = !!baseSettings.direction_toptobottom;

    function makeView(x0, y0) {
        const bx = cellW * thumbSettings.bxf;
        const by = cellH * thumbSettings.byf;
        return {
            calc_x: (i) => rtl
                ? x0 + (visW - i) * cellW
                : x0 + i * cellW,
            calc_y: (j) => ttb
                ? y0 + j * cellH
                : y0 + (visH - j) * cellH,
            dx: cellW,
            dy: cellH,
            bx: bx,
            by: by,
            offset_i: 0,
            offset_j: 0,
            width: visW,
            height: visH,
        };
    }

    const colorsWarp = (data.colors_warp || []);
    const colorsWeft = (data.colors_weft || []);

    // ----- Left half: patrone (draft) view -----
    // No centering — render from the half's top-left corner so the
    // half is fully filled. Slight overflow on the right/bottom is
    // hidden by the clip rect.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, halfW, halfH);
    ctx.clip();

    const leftView = makeView(0, 0);
    for (let ii = 0; ii < visW; ii++) {
        for (let jj = 0; jj < visH; jj++) {
            const value = pat.weave.get(i0 + ii, j0 + jj);
            if (value <= 0) continue;
            if (value <= 9) {
                cellPainterFilled(ctx, thumbSettings, leftView, ii, jj, value);
            } else if (value === 10) {
                aushebungPainter(ctx, thumbSettings, leftView, ii, jj);
            } else if (value === 11) {
                anbindungPainter(ctx, thumbSettings, leftView, ii, jj, true);
            } else if (value === 12) {
                abbindungPainter(ctx, thumbSettings, leftView, ii, jj, true);
            }
        }
    }

    // Grid lines on top of the cells. +0.5 keeps 1px lines crisp.
    ctx.strokeStyle = thumbSettings.darcula ? "#aaa" : "#777";
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    for (let ii = 0; ii <= visW; ii++) {
        const x = Math.round(ii * cellW) + 0.5;
        ctx.moveTo(x, 0.5);
        ctx.lineTo(x, halfH - 0.5);
    }
    for (let jj = 0; jj <= visH; jj++) {
        const y = Math.round(jj * cellH) + 0.5;
        ctx.moveTo(0.5, y);
        ctx.lineTo(halfW - 0.5, y);
    }
    ctx.stroke();
    ctx.restore();

    // ----- Right half: simulation view -----
    ctx.save();
    ctx.beginPath();
    ctx.rect(halfW, 0, halfW, halfH);
    ctx.clip();

    for (let ii = 0; ii < visW; ii++) {
        for (let jj = 0; jj < visH; jj++) {
            const i = i0 + ii;
            const j = j0 + jj;
            const s = pat.weave.get(i, j);
            const xCell = rtl ? (visW - 1 - ii) : ii;
            const yCell = ttb ? jj : (visH - 1 - jj);
            const x = halfW + xCell * cellW;
            const y = yCell * cellH;
            const px = Math.floor(x);
            const py = Math.floor(y);
            const cw = Math.max(1, Math.ceil(x + cellW) - px);
            const ch = Math.max(1, Math.ceil(y + cellH) - py);
            const warp = _paletteRgb(data, colorsWarp[i] | 0);
            const weft = _paletteRgb(data, colorsWeft[j] | 0);
            if (s > 0) {
                // Warp on top: weft visible at top/bottom edges.
                ctx.fillStyle = weft;
                ctx.fillRect(px, py, cw, ch);
                const inset = Math.max(1, Math.round(ch * 0.2));
                ctx.fillStyle = warp;
                ctx.fillRect(px, py + inset, cw, ch - 2 * inset);
            } else {
                // Weft on top: warp visible at left/right edges.
                ctx.fillStyle = warp;
                ctx.fillRect(px, py, cw, ch);
                const inset = Math.max(1, Math.round(cw * 0.2));
                ctx.fillStyle = weft;
                ctx.fillRect(px + inset, py, cw - 2 * inset, ch);
            }
        }
    }
    ctx.restore();

    // 1-pixel separator between the two halves.
    ctx.fillStyle = "#bbb";
    ctx.fillRect(halfW, 0, 1, h);

    return canvas;
}


export function captureThumbnails(currentData) {
    if (!pattern) return null;
    // Empty patterns (no warp threads entered, no woven cells) get no
    // thumbnail. Returning explicit nulls instead of skipping capture
    // lets the server clear any prior thumbnail when a pattern is
    // erased back to empty.
    const hasContent =
        (pattern.weave && pattern.weave.data
            && pattern.weave.data.some(v => v > 0))
        || (pattern.entering && pattern.entering.data
            && pattern.entering.data.some(v => v > 0));
    if (!hasContent) {
        return { thumbnail: null, preview: null };
    }
    try {
        const tCanvas = _renderTwoPaneToCanvas(currentData, pattern, 192, 96);
        const pCanvas = _renderTwoPaneToCanvas(currentData, pattern, 512, 256);
        return {
            thumbnail: tCanvas.toDataURL("image/png"),
            preview:   pCanvas.toDataURL("image/png"),
        };
    } catch (e) {
        console.error("captureThumbnails error", e);
        return null;
    }
}

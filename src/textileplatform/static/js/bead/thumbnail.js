// Thumbnail and preview images of a JBead pattern for the pattern lists
// (captureThumbnails, called by ui/common.js on save).

import { beadlist } from "./state.js";
import { contrastingColor, DEFAULT_SYMBOLS } from "./symbols.js";

// ---- Thumbnail / preview capture --------------------------------
//
// Mirrors `captureThumbnails` in weave/editor.js (which ui/common.js
// invokes during save). The bead version paints two halves into an
// offscreen canvas:
//
//   left half:  the rectangular draft view, scaled to fill the half
//               completely (cells stretch slightly when the pattern's
//               aspect doesn't match the half — the call site is a
//               thumbnail, slight distortion is fine).
//   right half: the hexagonally-offset simulation view. The natural
//               width of the simulation is roughly half the draft's,
//               so the right half ends up letterboxed horizontally
//               (empty space on each side) — exactly what the user
//               requested.

function _thumbColor(palette, idx) {
    if (idx < 0 || !palette || idx >= palette.length) return null;
    const c = palette[idx];
    if (!Array.isArray(c) || c.length < 3) return null;
    return `rgb(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0})`;
}

function _renderBeadThumbnail(currentData, w, h) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);

    if (!currentData || !Array.isArray(currentData.model)
        || currentData.model.length === 0) {
        return canvas;
    }
    const rows = currentData.model;
    const ph = rows.length;
    const pw = (rows[0] || []).length;
    if (pw <= 0 || ph <= 0) return canvas;

    // Mirror the on-screen view-state so the thumbnail matches whatever
    // the user sees in the editor. Defaults match the controller's
    // pattern-creation defaults.
    const view = currentData.view || {};
    const tDrawColors = view["draw-colors"] != null
        ? !!view["draw-colors"] : true;
    const tDrawSymbols = !!view["draw-symbols"];
    const tSymbols = (typeof view["symbols"] === "string"
                     && view["symbols"].length > 0)
        ? view["symbols"] : DEFAULT_SYMBOLS;
    const symbolAt = (idx) => {
        if (idx < 0 || idx >= tSymbols.length) return "";
        const ch = tSymbols.charAt(idx);
        return ch === " " ? "" : ch;
    };

    // Used-height: prefer the live beadlist (already up to date during
    // save). Fall back to a manual scan for cold callers.
    let usedH = 0;
    if (beadlist
        && Number.isInteger(beadlist.usedHeight)
        && beadlist.usedHeight > 0) {
        usedH = beadlist.usedHeight;
    } else {
        for (let j = 0; j < ph; j++) {
            for (let i = 0; i < pw; i++) {
                if (rows[j][i] > 0) { usedH = j + 1; break; }
            }
        }
    }
    if (usedH < 1) usedH = 1;

    const palette = currentData.colors || [];
    const halfW = Math.floor(w / 2);

    // Square cells (1:1) for both halves — bead patterns are
    // displayed with square beads in the editor, and stretching to
    // non-square here would misrepresent the shape. Pick the largest
    // square cell that fits both axes (`min`); if that's so small
    // that the simulation beads wouldn't read as round, bump up to
    // a minimum and crop the topmost rows that no longer fit.
    // 6 px is roughly the smallest size at which the half-bead
    // ellipses on odd rows still look like beads instead of slivers.
    const MIN_CELL = 6;
    let cell = Math.min(halfW / pw, h / usedH);
    let visRows = usedH;
    if (cell < MIN_CELL) {
        cell = MIN_CELL;
        visRows = Math.max(1, Math.min(usedH, Math.floor(h / cell)));
    }
    const dCellW = cell;
    const dCellH = cell;
    // Letterbox offsets so the patterns sit centred in their half.
    const draftContentW = pw * dCellW;
    const draftContentH = visRows * dCellH;
    const draftX0 = Math.floor((halfW - draftContentW) / 2);
    const draftY1 = Math.floor((h + draftContentH) / 2);  // bottom edge

    // ----- Left half: draft -----
    // Anchor row 0 at the bottom of the content rectangle so the
    // start of beading is visible — same as the editor. If visRows
    // < usedH (very tall pattern, cells clamped to MIN_CELL), the
    // topmost rows are simply not drawn.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, halfW, h);
    ctx.clip();
    const symbolFontPx = Math.max(4, Math.round(Math.min(dCellW, dCellH) * 0.8));
    if (tDrawSymbols) {
        ctx.font = `${symbolFontPx}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
    }
    for (let j = 0; j < visRows; j++) {
        for (let i = 0; i < pw; i++) {
            const c = rows[j][i] | 0;
            const fill = tDrawColors ? _thumbColor(palette, c) : null;
            const px = Math.floor(draftX0 + i * dCellW);
            const py = Math.floor(draftY1 - (j + 1) * dCellH);
            const cw = Math.max(1, Math.ceil(draftX0 + (i + 1) * dCellW) - px);
            const ch = Math.max(1, Math.ceil(draftY1 - j * dCellH) - py);
            if (fill) {
                ctx.fillStyle = fill;
                ctx.fillRect(px, py, cw, ch);
            }
            if (tDrawSymbols && dCellW >= 4) {
                const sym = symbolAt(c);
                if (sym) {
                    ctx.fillStyle = fill
                        ? contrastingColor(fill)
                        : "#222";
                    ctx.fillText(sym, px + cw / 2, py + ch / 2);
                }
            }
        }
    }
    // Light grid on top, only when cells are big enough to be worth it.
    if (dCellW >= 4) {
        ctx.strokeStyle = "#aaa";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const top = draftY1 - draftContentH;
        for (let i = 0; i <= pw; i++) {
            const x = Math.round(draftX0 + i * dCellW) + 0.5;
            ctx.moveTo(x, top + 0.5);
            ctx.lineTo(x, draftY1 - 0.5);
        }
        for (let j = 0; j <= visRows; j++) {
            const y = Math.round(draftY1 - j * dCellH) + 0.5;
            ctx.moveTo(draftX0 + 0.5, y);
            ctx.lineTo(draftX0 + draftContentW - 0.5, y);
        }
        ctx.stroke();
    }
    ctx.restore();

    // ----- Right half: simulation -----
    // True simulation view (not corrected) — only the front half of
    // the bead rope is shown, like ViewSimulated.draw in views.js.
    // Beads are laid out in rows of alternating widths W and W+1,
    // and clipped to xi < simWidth on even rows / xi <= simWidth on
    // odd rows. Half-beads appear at the start and end of every odd
    // row so the rope reads as continuous. Beads on odd rows are
    // shifted left by half a cell.
    const W = pw;
    const W2 = pw + 1;
    const simWidth = Math.trunc((pw + 1) / 2);
    const total = visRows * pw;
    const idxToCorrected = (idx) => {
        let k = 0, m = W;
        while (idx >= m) { idx -= m; k++; m = (k % 2 === 0) ? W : W2; }
        return [idx, k];
    };

    // Sim pane: visible rope-front area, sim_width cells wide. Use a
    // soft grey background so the rope reads against it (mirrors the
    // editor's #aaa fill).
    const simPaneW = simWidth * dCellW;
    const simPaneX = Math.floor(halfW + (halfW - simPaneW) / 2);
    // Vertical extent: walk one bead to discover how many corrected
    // rows the visRows data rows produce, then size the bg from there.
    let simRowCount = 0;
    if (total > 0) {
        const [, lastY] = idxToCorrected(total - 1);
        simRowCount = lastY + 1;
    }
    const simPaneH = simRowCount * dCellH;
    const simPaneY = Math.floor(draftY1 - simPaneH);
    ctx.save();
    ctx.beginPath();
    ctx.rect(halfW, 0, w - halfW, h);
    ctx.clip();
    ctx.fillStyle = "#aaa";
    ctx.fillRect(simPaneX, simPaneY, simPaneW, simPaneH);

    for (let idx = 0; idx < total; idx++) {
        const [xi, yj] = idxToCorrected(idx);
        // Front-half visibility (mirrors ViewSimulated.draw).
        if (yj % 2 === 0 && xi >= simWidth) continue;
        if (yj % 2 === 1 && xi >  simWidth) continue;
        const dataI = idx % pw;
        const dataJ = Math.floor(idx / pw);
        const c = rows[dataJ][dataI] | 0;
        const fill = tDrawColors ? _thumbColor(palette, c) : "#fff";
        if (!fill) continue;

        // Compute the bead's centre and radii. Even rows: beads at
        // (xi + 0.5)·cellW, full size. Odd rows: half-bead at xi=0
        // and xi=simWidth, full beads at integer xi in between, all
        // shifted by -cellW/2 versus the even rows.
        let cx, rx;
        const ry = dCellH / 2;
        const isOdd = (yj % 2) === 1;
        if (!isOdd) {
            cx = simPaneX + (xi + 0.5) * dCellW;
            rx = dCellW / 2;
        } else if (xi === 0) {
            cx = simPaneX + dCellW / 4;
            rx = dCellW / 4;
        } else if (xi === simWidth) {
            cx = simPaneX + simPaneW - dCellW / 4;
            rx = dCellW / 4;
        } else {
            cx = simPaneX + xi * dCellW;
            rx = dCellW / 2;
        }
        const cy = draftY1 - (yj + 0.5) * dCellH;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        if (tDrawSymbols && dCellW >= 4) {
            const sym = symbolAt(c);
            if (sym) {
                ctx.fillStyle = tDrawColors
                    ? contrastingColor(fill)
                    : "#222";
                ctx.fillText(sym, cx, cy);
            }
        }
    }
    ctx.restore();

    // 1-px separator between the halves.
    ctx.fillStyle = "#bbb";
    ctx.fillRect(halfW, 0, 1, h);

    return canvas;
}


export function captureThumbnails(currentData) {
    // Empty patterns (no painted cells) get explicit nulls so the
    // server clears any prior thumbnail. Mirrors the dbweave editor.
    const model = currentData && currentData.model;
    let hasContent = false;
    if (Array.isArray(model)) {
        outer: for (const row of model) {
            if (!Array.isArray(row)) continue;
            for (const c of row) {
                if (c) { hasContent = true; break outer; }
            }
        }
    }
    if (!hasContent) {
        return { thumbnail: null, preview: null };
    }
    try {
        // Wider than the weave editor's 192×96 / 512×256 — bead
        // patterns need horizontal room because the rendered draft
        // and simulation sit side by side, and the simulation has
        // additional empty space on each side.
        const t = _renderBeadThumbnail(currentData, 256, 128);
        const p = _renderBeadThumbnail(currentData, 640, 320);
        return {
            thumbnail: t.toDataURL("image/png"),
            preview:   p.toDataURL("image/png"),
        };
    } catch (e) {
        console.error("captureThumbnails error", e);
        return null;
    }
}

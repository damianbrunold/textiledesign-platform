"use strict";

// Drawing-tool rasterizers + active drag state.
//
// Each rasterizer takes integer endpoint coordinates and returns an array of
// [i, j] cells. Cells are not de-duplicated — callers can Set-unique them if
// needed. These mirror the desktop TOOL_* modes:
//
//   point         — single cell (not handled here; used by the existing
//                   per-cell click path)
//   line          — Bresenham line between (i1,j1) and (i2,j2)
//   rect          — hollow rectangle (4 sides)
//   fillrect      — solid rectangle
//   ellipse       — midpoint-algorithm outline inside the bounding box
//   fillellipse   — solid ellipse inside the bounding box

const ToolRaster = (function () {
    function line(i1, j1, i2, j2) {
        const out = [];
        let x = i1, y = j1;
        const dx = Math.abs(i2 - i1), sx = i1 < i2 ? 1 : -1;
        const dy = -Math.abs(j2 - j1), sy = j1 < j2 ? 1 : -1;
        let err = dx + dy;
        // Safety cap to avoid runaway loops on malformed inputs.
        const cap = (dx - dy + 1) * 2 + 2;
        let guard = 0;
        while (true) {
            out.push([x, y]);
            if (x === i2 && y === j2) break;
            if (guard++ > cap) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x += sx; }
            if (e2 <= dx) { err += dx; y += sy; }
        }
        return out;
    }

    function rect(i1, j1, i2, j2) {
        const lo_i = Math.min(i1, i2), hi_i = Math.max(i1, i2);
        const lo_j = Math.min(j1, j2), hi_j = Math.max(j1, j2);
        const out = [];
        for (let i = lo_i; i <= hi_i; i++) {
            out.push([i, lo_j]);
            if (hi_j !== lo_j) out.push([i, hi_j]);
        }
        for (let j = lo_j + 1; j <= hi_j - 1; j++) {
            out.push([lo_i, j]);
            if (hi_i !== lo_i) out.push([hi_i, j]);
        }
        return out;
    }

    function fillrect(i1, j1, i2, j2) {
        const lo_i = Math.min(i1, i2), hi_i = Math.max(i1, i2);
        const lo_j = Math.min(j1, j2), hi_j = Math.max(j1, j2);
        const out = [];
        for (let j = lo_j; j <= hi_j; j++) {
            for (let i = lo_i; i <= hi_i; i++) out.push([i, j]);
        }
        return out;
    }

    // Midpoint-algorithm ellipse outline, bounding box (i1,j1)-(i2,j2).
    function ellipseOutline(i1, j1, i2, j2) {
        const lo_i = Math.min(i1, i2), hi_i = Math.max(i1, i2);
        const lo_j = Math.min(j1, j2), hi_j = Math.max(j1, j2);
        const w = hi_i - lo_i, h = hi_j - lo_j;
        if (w === 0 && h === 0) return [[lo_i, lo_j]];
        const cx = (lo_i + hi_i) / 2;
        const cy = (lo_j + hi_j) / 2;
        const a = w / 2;
        const b = h / 2;
        const pts = new Map();
        const add = (i, j) => {
            i = Math.round(i); j = Math.round(j);
            if (i < lo_i || i > hi_i || j < lo_j || j > hi_j) return;
            pts.set(i + "," + j, [i, j]);
        };
        // Parametric sweep — simpler and robust enough for small integer grids.
        const steps = Math.max(8, Math.ceil(2 * Math.PI * Math.max(a, b)));
        for (let k = 0; k < steps; k++) {
            const t = (2 * Math.PI * k) / steps;
            const ii = cx + a * Math.cos(t);
            const jj = cy + b * Math.sin(t);
            add(ii, jj);
        }
        return Array.from(pts.values());
    }

    function ellipseFill(i1, j1, i2, j2) {
        const lo_i = Math.min(i1, i2), hi_i = Math.max(i1, i2);
        const lo_j = Math.min(j1, j2), hi_j = Math.max(j1, j2);
        const w = hi_i - lo_i, h = hi_j - lo_j;
        if (w === 0 && h === 0) return [[lo_i, lo_j]];
        const cx = (lo_i + hi_i) / 2;
        const cy = (lo_j + hi_j) / 2;
        const a = w / 2 + 0.5;
        const b = h / 2 + 0.5;
        const out = [];
        for (let j = lo_j; j <= hi_j; j++) {
            for (let i = lo_i; i <= hi_i; i++) {
                const nx = (i + 0.5 - cx - 0.5) / a;
                const ny = (j + 0.5 - cy - 0.5) / b;
                if (nx * nx + ny * ny <= 1) out.push([i, j]);
            }
        }
        return out;
    }

    // Dispatch by tool id. Caller supplies which pane accepts the draw.
    function rasterize(tool, i1, j1, i2, j2) {
        switch (tool) {
            case "line":        return line(i1, j1, i2, j2);
            case "rect":        return rect(i1, j1, i2, j2);
            case "fillrect":    return fillrect(i1, j1, i2, j2);
            case "ellipse":     return ellipseOutline(i1, j1, i2, j2);
            case "fillellipse": return ellipseFill(i1, j1, i2, j2);
            default:            return [[i2, j2]];
        }
    }

    return { line, rect, fillrect, ellipseOutline, ellipseFill, rasterize };
})();


// Shared drag state for tool gestures (populated by dbweave.js mouse handlers).
let toolDrag = null;

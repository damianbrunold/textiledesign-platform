"use strict";

// Selection + Clipboard abstractions.
//
// The editor holds a rectangular selection on one of the grid panes (weave,
// tieup, treadling, entering, color_warp, color_weft, reed). The global
// `cursor` object maintained by dbweave.js holds (x1,y1)-(x2,y2) and the
// selected part. This module provides helpers to read/write that selection
// in a consistent way, and a Clipboard for cut/copy/paste/paste-transparent.
//
// Clipboard payload shape:
//   { kind: "weave" | "tieup" | "treadling" | "entering" | "color_warp" | "color_weft" | "reed",
//     w: number, h: number, cells: number[] }
//
// For entering, cells is a 1D warp-length array of shaft indices.
// For color_warp/color_weft, cells is a 1D color-index array.
// Otherwise it's a w*h flat array row-major.

const Selection = (function () {
    function current() {
        if (typeof cursor === "undefined" || cursor === null) return null;
        const i1 = Math.min(cursor.x1, cursor.x2);
        const i2 = Math.max(cursor.x1, cursor.x2);
        const j1 = Math.min(cursor.y1, cursor.y2);
        const j2 = Math.max(cursor.y1, cursor.y2);
        const w = i2 - i1 + 1;
        const h = j2 - j1 + 1;
        return { part: cursor.selected_part, i1, j1, i2, j2, w, h };
    }

    function isEmpty() {
        if (typeof cursor === "undefined" || cursor === null) return true;
        return cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
    }

    // Copy the current selection into a clipboard payload.
    function copyToClipboard() {
        if (isEmpty()) return null;
        const sel = current();
        const kind = sel.part;
        let cells;
        if (kind === "weave") {
            cells = _readRect(pattern.weave, sel);
        } else if (kind === "tieup") {
            cells = _readRect(pattern.tieup, sel);
        } else if (kind === "treadling") {
            cells = _readRect(pattern.treadling, sel);
        } else if (kind === "entering") {
            cells = [];
            for (let i = sel.i1; i <= sel.i2; i++) cells.push(pattern.entering.get_shaft(i));
        } else if (kind === "color_warp") {
            cells = [];
            for (let i = sel.i1; i <= sel.i2; i++) cells.push(pattern.color_warp.get(i, 0));
        } else if (kind === "color_weft") {
            cells = [];
            for (let j = sel.j1; j <= sel.j2; j++) cells.push(pattern.color_weft.get(0, j));
        } else if (kind === "reed") {
            cells = [];
            for (let i = sel.i1; i <= sel.i2; i++) cells.push(pattern.reed.get(i, 0));
        } else {
            return null;
        }
        const payload = { kind, w: sel.w, h: sel.h, cells };
        Clipboard.set(payload);
        return payload;
    }

    function _readRect(grid, sel) {
        const out = [];
        for (let j = sel.j1; j <= sel.j2; j++) {
            for (let i = sel.i1; i <= sel.i2; i++) {
                out.push(grid.get(i, j));
            }
        }
        return out;
    }
    function _writeRect(grid, sel, cells, transparent) {
        let k = 0;
        for (let j = sel.j1; j <= sel.j2; j++) {
            for (let i = sel.i1; i <= sel.i2; i++) {
                const v = cells[k++];
                if (transparent && (v === 0 || v === null || v === undefined)) continue;
                grid.set(i, j, v);
            }
        }
    }

    // Paste payload at current cursor (anchored at i1,j1). Transparent=true
    // skips zero/empty cells. Returns {ok: bool, sel} for command capture.
    function pasteFromClipboard(transparent) {
        const payload = Clipboard.get();
        if (!payload) return { ok: false };
        const sel = current();
        if (!sel) return { ok: false };
        // Grow selection to payload size
        const targetSel = {
            part: sel.part,
            i1: sel.i1, j1: sel.j1,
            i2: sel.i1 + payload.w - 1,
            j2: sel.j1 + payload.h - 1,
            w: payload.w, h: payload.h,
        };
        if (payload.kind !== sel.part) {
            return { ok: false, error: "incompatible clipboard" };
        }
        if (sel.part === "weave") {
            _writeRect(pattern.weave, targetSel, payload.cells, transparent);
        } else if (sel.part === "tieup") {
            _writeRect(pattern.tieup, targetSel, payload.cells, transparent);
        } else if (sel.part === "treadling") {
            _writeRect(pattern.treadling, targetSel, payload.cells, transparent);
        } else if (sel.part === "entering") {
            for (let k = 0; k < payload.w; k++) {
                const v = payload.cells[k];
                if (transparent && (v === 0 || v === null)) continue;
                pattern.entering.set_shaft(targetSel.i1 + k, v);
            }
        } else if (sel.part === "color_warp") {
            for (let k = 0; k < payload.w; k++) {
                const v = payload.cells[k];
                if (transparent && v === 0) continue;
                pattern.color_warp.set(targetSel.i1 + k, 0, v);
            }
        } else if (sel.part === "color_weft") {
            for (let k = 0; k < payload.h; k++) {
                const v = payload.cells[k];
                if (transparent && v === 0) continue;
                pattern.color_weft.set(0, targetSel.j1 + k, v);
            }
        } else if (sel.part === "reed") {
            for (let k = 0; k < payload.w; k++) {
                const v = payload.cells[k];
                if (transparent && v === 0) continue;
                pattern.reed.set(targetSel.i1 + k, 0, v);
            }
        } else {
            return { ok: false, error: "unsupported part" };
        }
        // Update cursor to the pasted region
        cursor.x1 = targetSel.i1; cursor.x2 = targetSel.i2;
        cursor.y1 = targetSel.j1; cursor.y2 = targetSel.j2;
        return { ok: true, sel: targetSel };
    }

    return { current, isEmpty, copyToClipboard, pasteFromClipboard };
})();


const Clipboard = (function () {
    let payload = null;

    function set(p) {
        payload = p ? JSON.parse(JSON.stringify(p)) : null;
        // Best-effort sync to system clipboard as JSON for cross-tab paste.
        try {
            if (navigator.clipboard && navigator.clipboard.writeText && payload) {
                navigator.clipboard.writeText("textileplatform:" + JSON.stringify(payload));
            }
        } catch (e) { /* ignore */ }
    }

    function get() {
        return payload ? JSON.parse(JSON.stringify(payload)) : null;
    }

    function has() { return payload !== null; }

    function clear() { payload = null; }

    return { set, get, has, clear };
})();

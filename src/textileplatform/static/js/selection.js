"use strict";

// Selection + Clipboard.
//
// Clipboard format mirrors the desktop's universal char-grid: a w × h
// matrix of small non-negative integers. Each pane has its own rule for
// serialising a selection into this grid on copy and consuming it on
// paste, so cross-pane pastes work the same way they do in the desktop
// (e.g. einzug → trittfolge re-interprets the binary shaft mask as 0/1
// cells; trittfolge → einzug picks the first 'on' row of each column as
// the shaft).
//
// Payload shape:
//   { kind: source-kind (informational), w, h,
//     cells: number[][] // h rows × w cols, cells[j][i] }

const Selection = (function () {
    function current() {
        if (typeof cursor === "undefined" || cursor === null) return null;
        const i1 = Math.min(cursor.x1, cursor.x2);
        const i2 = Math.max(cursor.x1, cursor.x2);
        const j1 = Math.min(cursor.y1, cursor.y2);
        const j2 = Math.max(cursor.y1, cursor.y2);
        return {
            part: cursor.selected_part,
            i1, j1, i2, j2,
            w: i2 - i1 + 1,
            h: j2 - j1 + 1,
        };
    }

    function isEmpty() {
        if (typeof cursor === "undefined" || cursor === null) return true;
        return cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
    }

    function _make2D(w, h) {
        const out = new Array(h);
        for (let j = 0; j < h; j++) out[j] = new Array(w).fill(0);
        return out;
    }

    function _gridFor(part) {
        if (part === "weave") return pattern.weave;
        if (part === "tieup") return pattern.tieup;
        if (part === "treadling") return pattern.treadling;
        return null;
    }

    // Serialise the current selection into a w × h matrix of integers.
    function copyToClipboard() {
        if (isEmpty()) return null;
        const sel = current();
        const part = sel.part;
        const cells = _make2D(sel.w, sel.h);

        const grid = _gridFor(part);
        if (grid) {
            for (let j = 0; j < sel.h; j++)
                for (let i = 0; i < sel.w; i++)
                    cells[j][i] = grid.get(sel.i1 + i, sel.j1 + j);
        } else if (part === "entering") {
            // Encode entering as a w × h binary mask: cells[j][i] = 1
            // when entering[i1+i] selects shaft (j1+j+1).
            for (let i = 0; i < sel.w; i++) {
                const sh = pattern.entering.get_shaft(sel.i1 + i);
                if (sh > 0) {
                    const j = sh - 1 - sel.j1;
                    if (j >= 0 && j < sel.h) cells[j][i] = 1;
                }
            }
        } else if (part === "color_warp") {
            for (let i = 0; i < sel.w; i++)
                cells[0][i] = pattern.color_warp.get(sel.i1 + i, 0);
        } else if (part === "color_weft") {
            for (let j = 0; j < sel.h; j++)
                cells[j][0] = pattern.color_weft.get(0, sel.j1 + j);
        } else if (part === "reed") {
            for (let i = 0; i < sel.w; i++)
                cells[0][i] = pattern.reed.get(sel.i1 + i, 0);
        } else {
            return null;
        }

        const payload = { kind: part, w: sel.w, h: sel.h, cells };
        Clipboard.set(payload);
        return payload;
    }

    // Paste the clipboard payload at the current cursor anchor (i1, j1).
    // Interpretation is driven by the *target* pane (sel.part), so a
    // payload copied from any source can be pasted into any compatible
    // pane — matching desktop PasteSelection's switch on kbd_field.
    function pasteFromClipboard(transparent) {
        const payload = Clipboard.get();
        if (!payload) return { ok: false };
        const sel = current();
        if (!sel) return { ok: false };

        const part = sel.part;
        const i1 = sel.i1, j1 = sel.j1;
        const w = payload.w, h = payload.h;
        const cells = payload.cells || [];
        const cellAt = (i, j) => (cells[j] && cells[j][i]) || 0;
        let i2 = i1 + w - 1, j2 = j1 + h - 1;

        const grid = _gridFor(part);
        if (grid) {
            const W = grid.width, H = grid.height;
            i2 = Math.min(i2, W - 1);
            j2 = Math.min(j2, H - 1);
            for (let j = 0; j < h && j1 + j < H; j++) {
                for (let i = 0; i < w && i1 + i < W; i++) {
                    const v = cellAt(i, j);
                    if (transparent && v === 0) continue;
                    grid.set(i1 + i, j1 + j, v);
                }
            }
        } else if (part === "entering") {
            const W = pattern.entering.width;
            const H = pattern.entering.height;
            i2 = Math.min(i2, W - 1);
            j2 = Math.min(j2, H - 1);
            // For each pasted column, pick the first 'on' row as the
            // target shaft. No 'on' row → clear the shaft (unless
            // transparent, in which case leave it alone).
            for (let i = 0; i < w && i1 + i < W; i++) {
                let shaft = 0;
                for (let j = 0; j < h; j++) {
                    if (cellAt(i, j) > 0) {
                        const target = j1 + j + 1;
                        if (target >= 1 && target <= H) { shaft = target; break; }
                    }
                }
                if (shaft > 0) pattern.entering.set_shaft(i1 + i, shaft);
                else if (!transparent) pattern.entering.set_shaft(i1 + i, 0);
            }
        } else if (part === "color_warp") {
            const W = pattern.color_warp.width;
            i2 = Math.min(i2, W - 1);
            j2 = j1;
            for (let i = 0; i < w && i1 + i < W; i++) {
                const v = cellAt(i, 0);
                if (transparent && v === 0) continue;
                pattern.color_warp.set(i1 + i, 0, v);
            }
        } else if (part === "color_weft") {
            const H = pattern.color_weft.height;
            i2 = i1;
            j2 = Math.min(j2, H - 1);
            for (let j = 0; j < h && j1 + j < H; j++) {
                const v = cellAt(0, j);
                if (transparent && v === 0) continue;
                pattern.color_weft.set(0, j1 + j, v);
            }
        } else if (part === "reed") {
            const W = pattern.reed.width;
            i2 = Math.min(i2, W - 1);
            j2 = j1;
            for (let i = 0; i < w && i1 + i < W; i++) {
                const v = cellAt(i, 0);
                if (transparent && v === 0) continue;
                pattern.reed.set(i1 + i, 0, v > 0 ? 1 : 0);
            }
        } else {
            return { ok: false, error: "unsupported part" };
        }

        // Update cursor to cover the pasted region in the target's frame.
        cursor.x1 = i1; cursor.x2 = i2;
        cursor.y1 = j1; cursor.y2 = j2;
        return { ok: true };
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

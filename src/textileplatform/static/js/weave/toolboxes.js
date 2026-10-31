// The side panels of the DB-WEAVE editor: drawing tools (Werkzeuge),
// ranges (Bereiche) with the range selector, and the colour actions
// behind the palette panel.

import { ActionRegistry } from "../ui/actions.js";
import { editorI18n } from "../ui/common.js";
import {
    abbindungPainter, anbindungPainter, aushebungPainter, getRangeColor,
} from "./painters.js";
import {
    _bulkColorCommand, _pickPaletteIndex, update_color_selector,
} from "./palette.js";
import { _runSelectionCommand } from "./selection-ops.js";
import {
    cursor, pattern, readonly, settings, setToolDrag, view,
} from "./state.js";

export function update_range_selector(settings) {
    const currentLabel = document.getElementById("current-range");
    if (!currentLabel) return;
    for (let k = 1; k <= 12; k++) {
        const el = document.getElementById(`range${k}`);
        if (el) el.className = (k === settings.current_range) ? "current" : "";
    }
    const active = document.getElementById(`range${settings.current_range}`);
    if (active) currentLabel.innerText = active.innerText;
}


// ---- Tools side panel (Werkzeuge) -----------------------------------
// Mirrors the desktop "Tools" dock: a vertical column of icon buttons,
// one per drawing tool, with the active tool highlighted. Visibility is
// persisted in settings.display_tools_panel.
const _TOOLS_LIST = [
    { id: "point",       icon: "tool_cursor.png" },
    { id: "line",        icon: "tool_line.png" },
    { id: "rect",        icon: "tool_rectangle.png" },
    { id: "fillrect",    icon: "tool_filledrectangle.png" },
    { id: "ellipse",     icon: "tool_ellipse.png" },
    { id: "fillellipse", icon: "tool_filledellipse.png" },
];
function _toolsToolboxIconBase() {
    // Same path used by the top toolbar. Snag it off any existing
    // button so we don't have to thread Flask url_for into the JS.
    const ref = document.querySelector('#tx-toolbar img');
    if (ref && ref.src) return ref.src.replace(/[^/]+$/, "");
    return "/static/img/icons16/";
}
export function _toolsToolboxRefresh() {
    const list = document.getElementById("tools-panel-list");
    if (!list) return;
    if (list.childElementCount !== _TOOLS_LIST.length) {
        list.innerHTML = "";
        const base = _toolsToolboxIconBase();
        const i18n = editorI18n();
        const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
        for (const t of _TOOLS_LIST) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "tx-tool-btn";
            btn.dataset.tool = t.id;
            btn.title = L("tool." + t.id, t.id);
            const img = document.createElement("img");
            img.src = base + t.icon;
            btn.appendChild(img);
            btn.addEventListener("click", () => {
                settings.tool = t.id;
                setToolDrag(null);
                _toolsToolboxRefresh();
                ActionRegistry.notify();
            });
            list.appendChild(btn);
        }
    }
    const active = settings.tool || "point";
    for (const btn of list.children) {
        btn.classList.toggle("active", btn.dataset.tool === active);
    }
}
export function _toolsToolboxToggle() {
    settings.display_tools_panel = !settings.display_tools_panel;
    _toolsToolboxApply();
    ActionRegistry.notify();
}
export function _toolsToolboxApply() {
    _sidePanelApply("tools-panel", settings.display_tools_panel,
                    _toolsToolboxRefresh);
}

// ---- Ranges side panel (Bereiche) -----------------------------------
// 9 colour-swatch buttons + separator + 3 special buttons (Aushebung /
// Anbindung / Abbindung). Direct port of the desktop range dock.
// Render the special-range glyph (Aushebung/Anbindung/Abbindung) onto
// a 14×14 button canvas using the same painters the cells use, so the
// toolbox icons match what's drawn in the pattern.
function _rangesToolboxPaintSpecial(canvas, r) {
    const px = canvas.width;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, px, px);
    const fakeView = {
        calc_x: (x) => x * px,
        calc_y: (y) => y * px,
        dx: px, dy: px,
        bx: px * settings.bxf, by: px * settings.byf,
    };
    if (r === 10)      aushebungPainter(ctx, settings, fakeView, 0, 0);
    else if (r === 11) anbindungPainter(ctx, settings, fakeView, 0, 0, true);
    else if (r === 12) abbindungPainter(ctx, settings, fakeView, 0, 0, true);
}
export function _rangesToolboxRefresh() {
    const list = document.getElementById("ranges-panel-list");
    if (!list) return;
    if (list.childElementCount === 0) {
        const i18n = editorI18n();
        const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
        const make = (r, title) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "tx-range-btn";
            btn.dataset.range = String(r);
            btn.title = title;
            if (r >= 1 && r <= 9) {
                btn.style.background = getRangeColor(settings, r);
            } else {
                const c = document.createElement("canvas");
                c.width = 14; c.height = 14;
                btn.appendChild(c);
            }
            btn.addEventListener("click", () => _rangesToolboxPick(r));
            return btn;
        };
        for (let r = 1; r <= 9; r++) {
            list.appendChild(make(r, L("statusbar.range", "Range") + " " + r));
        }
        const sep = document.createElement("div");
        sep.className = "tx-range-sep";
        list.appendChild(sep);
        list.appendChild(make(10, L("statusbar.aushebung", "Lift out")));
        list.appendChild(make(11, L("statusbar.anbindung", "Binding")));
        list.appendChild(make(12, L("statusbar.abbindung", "Unbinding")));
    }
    const cur = settings.current_range | 0;
    for (const child of list.children) {
        if (!child.dataset || !child.dataset.range) continue;
        const r = +child.dataset.range;
        child.classList.toggle("active", r === cur);
        // Refresh dark-mode swatches every time, since darcula may flip.
        if (r >= 1 && r <= 9) {
            child.style.background = getRangeColor(settings, r);
        } else {
            const c = child.querySelector("canvas");
            if (c) {
                child.style.background = settings.darcula ? "#222" : "#fff";
                _rangesToolboxPaintSpecial(c, r);
            }
        }
    }
}
function _rangesToolboxPick(r) {
    settings.current_range = r;
    update_range_selector(settings);
    const hadSel = (cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2);
    if (hadSel && cursor.selected_pattern && r >= 1 && r <= 9) {
        // Mirror the Shift+1..9 keyboard handler: stamp the selection.
        const grid = cursor.selected_pattern;
        const i1 = Math.min(cursor.x1, cursor.x2);
        const i2 = Math.max(cursor.x1, cursor.x2);
        const j1 = Math.min(cursor.y1, cursor.y2);
        const j2 = Math.max(cursor.y1, cursor.y2);
        _runSelectionCommand("apply range " + r, grid, () => {
            for (let i = i1; i <= i2; i++) {
                for (let j = j1; j <= j2; j++) {
                    if (grid.get(i, j) !== 0) grid.set(i, j, r);
                }
            }
        });
    }
    _rangesToolboxRefresh();
    ActionRegistry.notify();
    if (view) view.draw();
}
export function _rangesToolboxToggle() {
    settings.display_ranges_panel = !settings.display_ranges_panel;
    _rangesToolboxApply();
    ActionRegistry.notify();
}
export function _rangesToolboxApply() {
    _sidePanelApply("ranges-panel", settings.display_ranges_panel,
                    _rangesToolboxRefresh);
}

// Shared show/hide + canvas reflow for the side panels (palette uses
// its own copy because it has more bespoke layout logic).
export function _sidePanelApply(panelId, show, populate) {
    const panel = document.getElementById(panelId);
    const container = document.getElementById("container");
    if (!panel || !container) return;
    if (show) {
        panel.classList.remove("hidden");
        if (populate) populate();
    } else {
        panel.classList.add("hidden");
    }
    const reflow = () => {
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
    };
    reflow();
    // A second pass after the browser has settled all pending layouts
    // (e.g. after toolbox icon images load, or after the new flex slot
    // has fully propagated). Without this, the bitmap can stay sized
    // for the pre-toggle width and mouse-click hit-testing drifts.
    requestAnimationFrame(reflow);
}

// Fill all warp cells with the picked palette index. Port of
// SetKettfarbeClick.
export function _colorsSetWarp() {
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
export function _colorsSetWeft() {
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
export function _colorsReplace() {
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
export function _colorsSwitch() {
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
export function _colorsWarpFromWeft() {
    _bulkColorCommand("warp colors from weft", () => {
        const n = Math.min(pattern.color_warp.width, pattern.color_weft.height);
        for (let i = 0; i < n; i++) {
            pattern.color_warp.set(i, 0, pattern.color_weft.get(0, i));
        }
    });
}

export function _colorsWeftFromWarp() {
    _bulkColorCommand("weft colors from warp", () => {
        const n = Math.min(pattern.color_warp.width, pattern.color_weft.height);
        for (let i = 0; i < n; i++) {
            pattern.color_weft.set(0, i, pattern.color_warp.get(i, 0));
        }
    });
}

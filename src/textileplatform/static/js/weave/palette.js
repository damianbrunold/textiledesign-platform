// Colour management of the DB-WEAVE editor: the palette dialog and
// palette side panel, colour blending, and the bulk colour operations
// on the warp / weft colour bars.

import { ActionRegistry } from "../ui/actions.js";
import { ColorPicker } from "../ui/colorpicker.js";
import { editorI18n, setModified } from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import {
    _fullPatternSnapshot, _restoreFullPatternSnapshot,
} from "./history.js";
import {
    colors, commandBus, pattern, readonly, settings, view,
} from "./state.js";

export function update_color_selector(settings) {
    const elem = document.getElementById("current-color");
    if (elem) {
        elem.style.backgroundColor = colors[settings.current_color];
        elem.style.color = colors[settings.current_color];
    }
    if (settings && settings.display_palette) {
        _paletteToolboxRefresh();
    }
}


// ---- Phase 9: Color management ----------------------------------------
//
// Direct ports of selcolordialog.cpp (palette editor) +
// farbverlaufdialog.cpp (Farbverlauf / blend) + supporting RGB/HSV
// pickers. The web pickers use a native <input type="color"> for the
// RGB editor and three sliders for the HSV editor; both expose the
// same accept(rgb) / cancel contract so the rest of the code stays
// model-agnostic.

const _PAL_COLS = 19;
const _PAL_ROWS = 13;

function _paletteRefreshColors() {
    if (!pattern || !pattern.palette) return;
    for (let i = 0; i < pattern.palette.length; i++) {
        const [r, g, b] = pattern.palette[i];
        colors[i] = `rgb(${r}, ${g}, ${b})`;
    }
}

function _paletteSetEntry(idx, rgb) {
    if (idx < 0 || idx >= pattern.palette.length) return;
    pattern.palette[idx] = [rgb[0] | 0, rgb[1] | 0, rgb[2] | 0];
    colors[idx] = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function _paletteSnapshot() {
    return pattern.palette.map(rgb => rgb.slice());
}
function _paletteRestore(snap) {
    for (let i = 0; i < snap.length && i < pattern.palette.length; i++) {
        _paletteSetEntry(i, snap[i]);
    }
}

// Colour conversions and the RGB / HSV pickers are in ui/colorpicker.js,
// shared with the bead editor.
function _colorLabel(k, fb) {
    const a = editorI18n().actions[k];
    return (a && a.label) || fb;
}

function _pickColorRGB(initialRgb, onAccept) {
    ColorPicker.pickRGB(initialRgb, onAccept, _colorLabel);
}

function _pickColorHSV(initialRgb, onAccept) {
    ColorPicker.pickHSV(initialRgb, onAccept, _colorLabel);
}

// Palette editor. 19×13 grid, MAX_PAL_ENTRY-clamped. Cancel/Escape
// reverts the palette (matches desktop selcolordialog.cpp; legacy
// only "Revert changes" inside the dialog committed changes — but to
// match the explicit Cancel button on the web, Cancel reverts).
export function showPaletteDialog(onPick) {
    if (readonly && !onPick) return;
    const i18n = editorI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    const n = pattern.palette.length;
    const before = _paletteSnapshot();
    let cur = Math.max(0, Math.min(n - 1, settings.current_color || 0));
    const cellPx = 18;

    const body = document.createElement("div");
    body.style.display = "flex";
    body.style.gap = "0.8rem";
    body.style.minWidth = "560px";

    const left = document.createElement("div");
    body.appendChild(left);

    // Toolbar (Edit RGB / HSV / Revert).
    const tools = document.createElement("div");
    tools.style.display = "flex";
    tools.style.gap = "0.3rem";
    tools.style.marginBottom = "0.4rem";
    const mkBtn = (lbl, fn) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = lbl;
        b.style.padding = "0.2rem 0.6rem";
        b.addEventListener("click", () => { fn(); canvas.focus(); });
        tools.appendChild(b);
        return b;
    };
    left.appendChild(tools);

    const canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    canvas.width  = _PAL_COLS * cellPx + 1;
    canvas.height = _PAL_ROWS * cellPx + 1;
    canvas.style.outline = "none";
    canvas.style.background = "#000";
    left.appendChild(canvas);

    const right = document.createElement("div");
    right.style.minWidth = "180px";
    right.innerHTML = `
        <div style="border:1px solid #888;padding:0.4rem;margin-bottom:0.4rem">
            <div style="font-weight:bold;margin-bottom:0.2rem">${L("color.index", "Index")}</div>
            <div id="tx-pal-idx" style="font-family:monospace"></div>
        </div>
        <div style="border:1px solid #888;padding:0.4rem;margin-bottom:0.4rem">
            <div style="font-weight:bold;margin-bottom:0.2rem">${L("color.rgb-title", "RGB")}</div>
            <div>R: <span id="tx-pal-r" style="font-family:monospace"></span></div>
            <div>G: <span id="tx-pal-g" style="font-family:monospace"></span></div>
            <div>B: <span id="tx-pal-b" style="font-family:monospace"></span></div>
        </div>
        <div style="border:1px solid #888;padding:0.4rem">
            <div style="font-weight:bold;margin-bottom:0.2rem">${L("color.hsv-title", "HSV")}</div>
            <div>H: <span id="tx-pal-h" style="font-family:monospace"></span></div>
            <div>S: <span id="tx-pal-s" style="font-family:monospace"></span></div>
            <div>V: <span id="tx-pal-v" style="font-family:monospace"></span></div>
        </div>`;
    body.appendChild(right);

    const $ = (sel) => right.querySelector(sel);
    const draw = () => {
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let j = 0; j < _PAL_ROWS; j++) {
            for (let i = 0; i < _PAL_COLS; i++) {
                const idx = i + j * _PAL_COLS;
                if (idx >= n) return drawCursor(ctx);
                const [r, g, b] = pattern.palette[idx];
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(i * cellPx + 1, j * cellPx + 1, cellPx - 1, cellPx - 1);
            }
        }
        drawCursor(ctx);
    };
    const drawCursor = (ctx) => {
        const cx = (cur % _PAL_COLS) * cellPx;
        const cy = Math.floor(cur / _PAL_COLS) * cellPx;
        ctx.strokeStyle = document.activeElement === canvas ? "#fff" : "#000";
        ctx.lineWidth = 2;
        ctx.strokeRect(cx + 1, cy + 1, cellPx - 1, cellPx - 1);
    };
    const refreshReadout = () => {
        const [r, g, b] = pattern.palette[cur];
        const [h, s, v] = ColorPicker.rgbToHsv(r, g, b);
        $("#tx-pal-idx").textContent = String(cur + 1);
        $("#tx-pal-r").textContent = r;
        $("#tx-pal-g").textContent = g;
        $("#tx-pal-b").textContent = b;
        $("#tx-pal-h").textContent = Math.round(h) + "°";
        $("#tx-pal-s").textContent = s.toFixed(3);
        $("#tx-pal-v").textContent = v.toFixed(3);
    };
    const refresh = () => { draw(); refreshReadout(); };

    const editRGB = () => {
        _pickColorRGB(pattern.palette[cur], (rgb) => {
            _paletteSetEntry(cur, rgb);
            refresh();
        });
    };
    const editHSV = () => {
        _pickColorHSV(pattern.palette[cur], (rgb) => {
            _paletteSetEntry(cur, rgb);
            refresh();
        });
    };
    mkBtn(L("color.edit-rgb", "Edit RGB…"), editRGB);
    mkBtn(L("color.edit-hsv", "Edit HSV…"), editHSV);
    mkBtn(L("color.revert", "Revert"), () => {
        _paletteRestore(before);
        refresh();
    });

    canvas.addEventListener("focus", draw);
    canvas.addEventListener("blur", draw);
    canvas.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const i = Math.floor((e.clientX - rect.left) / cellPx);
        const j = Math.floor((e.clientY - rect.top) / cellPx);
        const idx = i + j * _PAL_COLS;
        if (idx < 0 || idx >= n) return;
        cur = idx;
        canvas.focus();
        refresh();
    });
    canvas.addEventListener("dblclick", () => editHSV());
    canvas.addEventListener("keydown", (e) => {
        const step = (e.ctrlKey || e.metaKey) ? 5 : 1;
        let i = cur % _PAL_COLS;
        let j = Math.floor(cur / _PAL_COLS);
        switch (e.key) {
        case "ArrowLeft":  i -= step; if (i < 0) { i = _PAL_COLS - 1; j = Math.max(0, j - 1); } break;
        case "ArrowRight": i += step; if (i >= _PAL_COLS) { i = 0; j = Math.min(_PAL_ROWS - 1, j + 1); } break;
        case "ArrowUp":    j -= step; if (j < 0) j = 0; break;
        case "ArrowDown":  j += step; if (j >= _PAL_ROWS) j = _PAL_ROWS - 1; break;
        case "Enter":
        case "Return":     (e.ctrlKey ? editRGB : editHSV)(); e.preventDefault(); e.stopPropagation(); return;
        case "r": case "R": editRGB(); e.preventDefault(); e.stopPropagation(); return;
        case "h": case "H": editHSV(); e.preventDefault(); e.stopPropagation(); return;
        default:
            if (e.key !== "Escape" && e.key !== "Tab") e.stopPropagation();
            return;
        }
        const idx = i + j * _PAL_COLS;
        if (idx < n) cur = idx;
        e.preventDefault();
        e.stopPropagation();
        refresh();
    });

    let modal;
    const accept = () => {
        if (onPick) {
            // Picker mode: caller wants the chosen index, doesn't care
            // about palette edits being kept (but if they happened,
            // they're a side effect — desktop preserves them too).
            onPick(cur, pattern.palette[cur].slice());
        } else {
            // Editor mode: any changes in this session are committed
            // as one undoable command.
            const after = _paletteSnapshot();
            _paletteRestore(before); // restore to capture before-state
            const finalize = () => { _paletteRefreshColors(); _paletteToolboxRefresh(); setModified(); view.draw(); };
            const cmd = {
                label: "edit palette",
                apply()  { _paletteRestore(after);  finalize(); },
                revert() { _paletteRestore(before); finalize(); },
            };
            if (commandBus) commandBus.execute(cmd);
            else cmd.apply();
        }
        modal.close();
    };
    const cancel = () => {
        _paletteRestore(before);
        _paletteRefreshColors();
        view.draw();
        modal.close();
    };

    modal = Modal.open({
        title: L("color.palette-title", "Color definition"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel", onClick: cancel },
            { label: L("btn.ok", "OK"), role: "primary", onClick: accept },
        ],
    });
    setTimeout(() => { canvas.focus(); refresh(); }, 0);
}

// Color blending dialog (Farbverlauf). Direct port of
// farbverlaufdialog.cpp.
let _blendStartColor = [0, 0, 255];
let _blendEndColor   = [255, 255, 0];

function _weightT(x, m) {
    const d = 1.0;
    if (m < 0.125) m = 0.125;
    if (m > 1.0)   m = 1.0;
    if (m > 0.5 || m >= 0.25)
        return (2 * d - 4 * m) * x * x + (4 * m - d) * x;
    return (2 * d - 8 * m) * x * x * x + (8 * m - d) * x * x;
}

function _farbverlaufRGB(start, end, n, weight) {
    const m = weight; // already 0..1
    const out = [];
    for (let i = 0; i < n; i++) {
        const x = (i + 1) / (n + 1);
        const t = _weightT(x, m);
        out.push([
            Math.round(start[0] + (end[0] - start[0]) * t),
            Math.round(start[1] + (end[1] - start[1]) * t),
            Math.round(start[2] + (end[2] - start[2]) * t),
        ]);
    }
    return out;
}

function _farbverlaufHSV(start, end, n, weight) {
    const m = weight;
    const [h1, s1, v1] = ColorPicker.rgbToHsv(start[0], start[1], start[2]);
    const [h2, s2, v2] = ColorPicker.rgbToHsv(end[0],   end[1],   end[2]);
    const out = [];
    for (let i = 0; i < n; i++) {
        const x = (i + 1) / (n + 1);
        const t = _weightT(x, m);
        const h = h1 + (h2 - h1) * t;
        const s = Math.max(0, Math.min(1, s1 + (s2 - s1) * t));
        const v = Math.max(0, Math.min(1, v1 + (v2 - v1) * t));
        out.push(ColorPicker.hsvToRgb(h, s, v));
    }
    return out;
}

export function showColorBlendDialog() {
    if (readonly) return;
    const i18n = editorI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;

    const before = _paletteSnapshot();
    let startC = _blendStartColor.slice();
    let endC   = _blendEndColor.slice();
    let steps = 20, position = 1, weight = 50, model = "rgb", noDividers = true;

    const body = document.createElement("div");
    body.style.minWidth = "520px";
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto auto auto auto;gap:0.4rem 0.8rem;align-items:center;margin-bottom:0.6rem">
            <label>${L("color.start", "Start color:")}</label>
            <button id="tx-bl-start" type="button" style="width:80px;height:24px;border:1px solid #888"></button>
            <label>${L("color.end", "End color:")}</label>
            <button id="tx-bl-end"   type="button" style="width:80px;height:24px;border:1px solid #888"></button>
        </div>
        <div style="margin-bottom:0.6rem">
            <label style="margin-right:1rem"><input type="radio" name="tx-bl-model" value="rgb" checked> RGB</label>
            <label><input type="radio" name="tx-bl-model" value="hsv"> HSV</label>
        </div>
        <div style="display:grid;grid-template-columns:auto auto;gap:0.4rem 1rem;align-items:center;margin-bottom:0.6rem">
            <label>${L("color.steps", "Steps:")}</label>
            <input id="tx-bl-steps" type="number" min="1" max="150" step="1" value="20" style="width:5rem">
            <label>${L("color.weight", "Weighting:")}</label>
            <input id="tx-bl-weight" type="range" min="1" max="100" step="1" value="50">
            <label>${L("color.position", "Palette index:")}</label>
            <input id="tx-bl-pos"   type="number" min="1" step="1" value="1" style="width:5rem">
        </div>
        <label style="display:block;margin-bottom:0.4rem">
            <input id="tx-bl-nodiv" type="checkbox" checked>
            ${L("color.no-dividers", "No dividers")}
        </label>
        <canvas id="tx-bl-strip" width="480" height="36" style="display:block;width:480px;border:1px solid #888"></canvas>`;
    const $ = (sel) => body.querySelector(sel);

    $("#tx-bl-pos").max = String(pattern.palette.length - 1);

    const setSwatch = (btn, rgb) => {
        btn.style.background = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
    };
    setSwatch($("#tx-bl-start"), startC);
    setSwatch($("#tx-bl-end"),   endC);

    let blendTable = [];
    const recompute = () => {
        blendTable = (model === "rgb")
            ? _farbverlaufRGB(startC, endC, steps, weight / 101)
            : _farbverlaufHSV(startC, endC, steps, weight / 101);
        drawStrip();
    };
    const drawStrip = () => {
        const c = $("#tx-bl-strip");
        const ctx = c.getContext("2d");
        ctx.clearRect(0, 0, c.width, c.height);
        const total = blendTable.length + 2;
        const dx = c.width / total;
        const drawCell = (i, rgb) => {
            ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
            ctx.fillRect(i * dx, 0, dx, c.height);
            if (!noDividers) {
                ctx.strokeStyle = "#000";
                ctx.lineWidth = 1;
                ctx.strokeRect(i * dx + 0.5, 0.5, dx - 1, c.height - 1);
            }
        };
        drawCell(0, startC);
        for (let i = 0; i < blendTable.length; i++) drawCell(i + 1, blendTable[i]);
        drawCell(blendTable.length + 1, endC);
    };

    const onChangeColor = (which) => {
        const cur = (which === "start") ? startC : endC;
        // Mini popup: HSV / RGB / Palette / Copy other.
        // Colours come from editor-menu(-dark).css, so the popup follows
        // the app's light / dark mode.
        const menu = document.createElement("div");
        menu.className = "tx-popup-menu";
        const r = (which === "start" ? $("#tx-bl-start") : $("#tx-bl-end")).getBoundingClientRect();
        menu.style.left = r.left + "px";
        menu.style.top = (r.bottom + 2) + "px";
        const item = (lbl, fn) => {
            const it = document.createElement("div");
            it.className = "tx-popup-item";
            it.textContent = lbl;
            it.addEventListener("click", () => { document.body.removeChild(menu); fn(); });
            menu.appendChild(it);
            return it;
        };
        item(L("color.pick-hsv", "Pick HSV…"), () => {
            _pickColorHSV(cur, (rgb) => {
                if (which === "start") startC = rgb; else endC = rgb;
                setSwatch(which === "start" ? $("#tx-bl-start") : $("#tx-bl-end"), rgb);
                recompute();
            });
        });
        item(L("color.pick-rgb", "Pick RGB…"), () => {
            _pickColorRGB(cur, (rgb) => {
                if (which === "start") startC = rgb; else endC = rgb;
                setSwatch(which === "start" ? $("#tx-bl-start") : $("#tx-bl-end"), rgb);
                recompute();
            });
        });
        item(L("color.pick-palette", "From palette…"), () => {
            showPaletteDialog((idx, rgb) => {
                if (which === "start") startC = rgb; else endC = rgb;
                setSwatch(which === "start" ? $("#tx-bl-start") : $("#tx-bl-end"), rgb);
                recompute();
            });
        });
        item(L("color.copy-other", "Copy other"), () => {
            const other = (which === "start") ? endC : startC;
            if (which === "start") startC = other.slice(); else endC = other.slice();
            setSwatch(which === "start" ? $("#tx-bl-start") : $("#tx-bl-end"),
                      (which === "start") ? startC : endC);
            recompute();
        });
        document.body.appendChild(menu);
        const dismiss = (ev) => {
            if (!menu.contains(ev.target)) {
                if (menu.parentNode) menu.parentNode.removeChild(menu);
                document.removeEventListener("mousedown", dismiss, true);
            }
        };
        setTimeout(() => document.addEventListener("mousedown", dismiss, true), 0);
    };

    $("#tx-bl-start").addEventListener("click", () => onChangeColor("start"));
    $("#tx-bl-end").addEventListener("click", () => onChangeColor("end"));
    body.addEventListener("input", (e) => {
        const id = e.target.id;
        if (id === "tx-bl-steps")  steps    = Math.max(1, Math.min(150, +e.target.value | 0));
        else if (id === "tx-bl-weight") weight = +e.target.value;
        else if (id === "tx-bl-pos")    position = +e.target.value | 0;
        else if (id === "tx-bl-nodiv")  noDividers = e.target.checked;
        else if (e.target.name === "tx-bl-model") model = e.target.value;
        recompute();
    });
    body.addEventListener("change", (e) => {
        if (e.target.id === "tx-bl-nodiv") {
            noDividers = e.target.checked;
            drawStrip();
        }
    });
    body.addEventListener("click", (e) => {
        if (e.target.name === "tx-bl-model") { model = e.target.value; recompute(); }
    });

    let modal;
    const accept = () => {
        const idx = position - 1;
        if (idx < 0 || idx >= pattern.palette.length) {
            alert(L("color.idx-oor", "Palette index out of range."));
            return;
        }
        // Commit start + steps + end as one undoable palette command.
        // First, restore to before-state, then build "after" by writing
        // start, blendTable, end.
        _paletteRestore(before);
        const apply = () => {
            _paletteSetEntry(idx, startC);
            for (let i = 0; i < blendTable.length; i++) {
                const k = idx + 1 + i;
                if (k >= pattern.palette.length) break;
                _paletteSetEntry(k, blendTable[i]);
            }
            const endIdx = idx + blendTable.length + 1;
            if (endIdx < pattern.palette.length) _paletteSetEntry(endIdx, endC);
        };
        apply();
        const computedAfter = _paletteSnapshot();
        _paletteRestore(before);
        const finalize = () => { _paletteRefreshColors(); _paletteToolboxRefresh(); setModified(); view.draw(); };
        const cmd = {
            label: "color blending",
            apply()  { _paletteRestore(computedAfter); finalize(); },
            revert() { _paletteRestore(before);        finalize(); },
        };
        if (commandBus) commandBus.execute(cmd);
        else cmd.apply();
        _blendStartColor = startC.slice();
        _blendEndColor   = endC.slice();
        modal.close();
    };

    modal = Modal.open({
        title: L("color.blend-title", "Create color blending"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok", "OK"), role: "primary", onClick: accept },
        ],
    });
    setTimeout(() => { recompute(); }, 0);
}


// ---- Phase 9 (extras): bulk-color operations -------------------------
//
// Direct ports of setcolors.cpp click handlers. All routed through
// commandBus as full-pattern snapshot commands so they participate in
// undo/redo.

export function _bulkColorCommand(label, mutate) {
    if (readonly) return;
    const before = _fullPatternSnapshot();
    mutate();
    const after = _fullPatternSnapshot();
    _restoreFullPatternSnapshot(before);
    const finalize = () => { setModified(); view.draw(); };
    const cmd = {
        label,
        apply()  { _restoreFullPatternSnapshot(after);  finalize(); },
        revert() { _restoreFullPatternSnapshot(before); finalize(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else cmd.apply();
}

// Open palette in picker mode and call onPick(idx). Convenience wrapper
// that hides the rgb argument from the call site.
export function _pickPaletteIndex(onPick) {
    showPaletteDialog((idx) => onPick(idx));
}

// Palette toolbox — docked DOM panel next to the canvas. Port of the
// desktop's ViewFarbpalette toggle: shows the full palette as a grid of
// clickable swatches, lets the user set settings.current_color quickly
// without leaving the canvas. Toggling it reshuffles the canvas layout
// (the panel takes up a fixed slice of the container width).

// Compute the column-major layout: as many rows as fit in the panel's
// available vertical space, then enough columns to hold MAX_PAL_ENTRY.
// Mirrors desktop palettepanel.cpp::columnsFor.
function _paletteToolboxLayout() {
    const panel = document.getElementById("palette-panel");
    const grid  = document.getElementById("palette-panel-grid");
    if (!panel || !grid) return { rows: 1, cols: 1 };
    // Cell edge in CSS px (matches desktop CELL = 18).
    const cell = parseInt(getComputedStyle(panel).getPropertyValue("--tx-pal-cell")) || 18;
    // Inner usable height = panel height − vertical padding (top+bottom).
    const cs = getComputedStyle(panel);
    const padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const avail = Math.max(cell, panel.clientHeight - padV);
    const n = pattern.palette.length;
    const rowsFit = Math.max(1, Math.floor(avail / cell));
    const cols = Math.max(1, Math.ceil(n / rowsFit));
    grid.style.gridTemplateRows = `repeat(${rowsFit}, ${cell}px)`;
    return { rows: rowsFit, cols, cell, n };
}

export function _paletteToolboxRefresh() {
    const grid = document.getElementById("palette-panel-grid");
    if (!grid) return;
    const n = pattern.palette.length;
    if (grid.childElementCount !== n) {
        grid.innerHTML = "";
        for (let i = 0; i < n; i++) {
            const cell = document.createElement("div");
            cell.className = "palette-cell";
            cell.dataset.idx = String(i);
            cell.title = `${i + 1}`;
            cell.addEventListener("click", () => {
                settings.current_color = i;
                update_color_selector(settings);
                _paletteToolboxRefresh();
                ActionRegistry.notify();
            });
            cell.addEventListener("dblclick", () => {
                _pickColorHSV(pattern.palette[i], (rgb) => {
                    const before = _paletteSnapshot();
                    _paletteSetEntry(i, rgb);
                    const after = _paletteSnapshot();
                    _paletteRestore(before);
                    const finalize = () => { _paletteRefreshColors(); _paletteToolboxRefresh(); setModified(); view.draw(); };
                    const cmd = {
                        label: "edit palette entry",
                        apply()  { _paletteRestore(after);  finalize(); },
                        revert() { _paletteRestore(before); finalize(); },
                    };
                    if (commandBus) commandBus.execute(cmd);
                    else cmd.apply();
                });
            });
            grid.appendChild(cell);
        }
    }
    for (let i = 0; i < n; i++) {
        const el = grid.children[i];
        const [r, g, b] = pattern.palette[i];
        el.style.background = `rgb(${r}, ${g}, ${b})`;
        el.classList.toggle("selected", i === settings.current_color);
    }
    // Resize observer: re-layout if the available height changes (e.g.
    // the user resizes the window).
    if (!grid._resizeObs) {
        const obs = new ResizeObserver(() => _paletteToolboxLayout());
        obs.observe(document.getElementById("palette-panel"));
        grid._resizeObs = obs;
    }
}

export function _paletteToolboxToggle() {
    const panel = document.getElementById("palette-panel");
    if (!panel) return;
    settings.display_palette = !settings.display_palette;
    _paletteToolboxApply();
    ActionRegistry.notify();
}

// Apply current display_palette setting: show/hide the panel and
// re-flow the canvas (canvas.width is recomputed from the container's
// new clientWidth, then view.layout() / view.draw() repaint).
export function _paletteToolboxApply() {
    const panel = document.getElementById("palette-panel");
    const container = document.getElementById("container");
    if (!panel || !container) return;
    // Populate the grid BEFORE measuring the canvas. The first time the
    // panel becomes visible the grid would otherwise be empty (zero
    // width), the canvas would claim almost-full container width, and
    // a moment later the refresh would add 236 cells, push the panel
    // wider, and leave the canvas's bitmap drawn at a stale width.
    if (settings.display_palette) {
        panel.classList.remove("hidden");
        _paletteToolboxRefresh();
    } else {
        panel.classList.add("hidden");
    }
    // Force a synchronous reflow so canvas.clientWidth reflects both
    // the visibility change AND the populated grid's contribution to
    // the panel width.
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
}

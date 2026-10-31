// Block and range pattern substitution (desktop Blockmuster /
// Bereichmuster): the editor dialog and the substitution itself.

import { editorI18n } from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import { _fullSnapCommand } from "./history.js";
import { Grid } from "./model.js";
import { getRangeColor } from "./painters.js";
import { cursor, pattern, readonly, settings } from "./state.js";

// ---- Phase 8e: Block- / Bereich-muster substitution editor ----------
//
// Two related features sharing one editor dialog:
//   Blockmuster (block substitution) — replaces every tieup cell with
//     the corresponding numbered Muster as a (mx+1, my+1) tile, while
//     also expanding entering and treadling so the threading lines up.
//   Bereichmuster (range substitution) — fills the weave selection
//     (or full extent) cell-by-cell, replacing each cell value n with
//     bereichmuster[n] tiled.
//
// Direct port of blockmuster.cpp / blockmusterdialog.cpp / the
// BlockExpand* and BereicheFillPattern functions from bereiche.cpp.

// Apply: Blockmuster expansion --------------------------------------
function _blockExpandEinzug(count, einzugZ) {
    const ka = pattern.min_x, kb = pattern.max_x;
    if (ka > kb) return;
    const len = kb - ka + 1;
    const pData = new Array(len);
    for (let i = ka; i <= kb; i++) {
        pData[i - ka] = pattern.entering.get_shaft(i);
        pattern.entering.set_shaft(i, 0);
    }
    const maxWarp = pattern.entering.width;
    const maxShaft = pattern.tieup.height;
    for (let i = ka; i <= kb; i++) {
        const v = pData[i - ka];
        if (v <= 0) continue;
        if (einzugZ) {
            for (let k = 0; k < count; k++) {
                const idx = i * count + k;
                if (idx >= maxWarp) break;
                const newShaft = (v - 1) * count + k + 1;
                if (newShaft > maxShaft) continue;
                pattern.entering.set_shaft(idx, newShaft);
            }
        } else {
            for (let k = 0; k < count; k++) {
                const idx = (i + 1) * count - 1 - k;
                if (idx >= maxWarp || idx < 0) break;
                const newShaft = (v - 1) * count + k + 1;
                if (newShaft > maxShaft) continue;
                pattern.entering.set_shaft(idx, newShaft);
            }
        }
    }
}

function _blockExpandTrittfolge(count, trittfolgeZ) {
    const sa = pattern.min_y, sb = pattern.max_y;
    if (sa > sb) return;
    const w = pattern.treadling.width;
    const pData = new Array((sb - sa + 1) * w);
    for (let j = sa; j <= sb; j++) {
        for (let i = 0; i < w; i++) {
            pData[(j - sa) * w + i] = pattern.treadling.get(i, j);
            pattern.treadling.set(i, j, 0);
        }
    }
    const maxWeft = pattern.treadling.height;
    const maxTreadle = pattern.treadling.width;
    for (let j = sa; j <= sb; j++) {
        for (let i = 0; i < w; i++) {
            if (pData[(j - sa) * w + i] === 0) continue;
            if (trittfolgeZ) {
                for (let k = 0; k < count; k++) {
                    const newJ = j * count + k;
                    if (newJ >= maxWeft) break;
                    const newI = i * count + k;
                    if (newI >= maxTreadle) continue;
                    pattern.treadling.set(newI, newJ, 1);
                }
            } else {
                for (let k = 0; k < count; k++) {
                    const newJ = j * count + k;
                    if (newJ >= maxWeft) break;
                    const newI = (i + 1) * count - 1 - k;
                    if (newI >= maxTreadle || newI < 0) continue;
                    pattern.treadling.set(newI, newJ, 1);
                }
            }
        }
    }
}

function _blockExpandAufknuepfung(x, y, blockmuster) {
    const w = pattern.tieup.width, h = pattern.tieup.height;
    const pData = new Array(h * w);
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            pData[j * w + i] = pattern.tieup.get(i, j);
            pattern.tieup.set(i, j, 0);
        }
    }
    let i1 = w - 1, i2 = 0, j1 = h - 1, j2 = 0, nonempty = false;
    for (let i = 0; i < w; i++) {
        for (let j = 0; j < h; j++) {
            if (pData[j * w + i] !== 0) {
                if (i1 > i) i1 = i;
                if (i2 < i) i2 = i;
                if (j1 > j) j1 = j;
                if (j2 < j) j2 = j;
                nonempty = true;
            }
        }
    }
    if (!nonempty) return;
    for (let i = i1; i <= i2; i++) {
        for (let j = j1; j <= j2; j++) {
            const bindung = pData[j * w + i];
            if (bindung < 0 || bindung >= 10) continue;
            for (let ii = x * i; ii < x * (i + 1); ii++) {
                if (ii >= w) break;
                for (let jj = y * j; jj < y * (j + 1); jj++) {
                    if (jj >= h) break;
                    const v = blockmuster[bindung].get(ii - x * i, jj - y * j);
                    pattern.tieup.set(ii, jj, v);
                }
            }
        }
    }
}

// Apply: Bereichmuster fill -----------------------------------------
function _bereicheFillPattern(bereichmuster) {
    let i0, i1, j0, j1;
    const hasSel = (cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2);
    if (hasSel && cursor.selected_part === "weave") {
        i0 = Math.min(cursor.x1, cursor.x2);
        i1 = Math.max(cursor.x1, cursor.x2);
        j0 = Math.min(cursor.y1, cursor.y2);
        j1 = Math.max(cursor.y1, cursor.y2);
    } else {
        i0 = pattern.min_x; i1 = pattern.max_x;
        j0 = pattern.min_y; j1 = pattern.max_y;
    }
    if (i0 > i1 || j0 > j1) return;
    for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
            const bindung = pattern.weave.get(i, j);
            if (bindung < 0 || bindung >= 10) continue;
            const m = bereichmuster[bindung];
            const sx = m.sizeX(), sy = m.sizeY();
            if (sx === 0 || sy === 0) continue;
            pattern.weave.set(i, j, m.get(i % sx, j % sy));
        }
    }
}

// Open the muster editor dialog. `mode` is "block" or "bereich"; the
// dialog renders identically except that block mode shows the red
// "current size" indicator + threading/treadling direction toggles.
export function showMusterDialog(mode) {
    if (readonly) return;
    const isBlock = (mode === "block");
    const slots = isBlock ? pattern.blockmuster : pattern.bereichmuster;
    const i18n = editorI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;

    // Local state.
    const state = {
        current: 0,
        cx: 0, cy: 0,
        mx: -1, my: -1,
        einzugZ: true,
        trittfolgeZ: true,
        // Local undo ring — array of {snapshots:[10 muster snapshots], current:int}
        undoStack: [],
        redoStack: [],
    };
    state.einzugZ      = (settings.muster_einzug_z      !== false);
    state.trittfolgeZ  = (settings.muster_trittfolge_z  !== false);

    function snapshotState() {
        return {
            slots: slots.map(m => m.snapshot()),
            current: state.current,
        };
    }
    function restoreState(snap) {
        for (let k = 0; k < 10; k++) slots[k].restore(snap.slots[k]);
        state.current = snap.current;
    }
    function pushUndo() {
        state.undoStack.push(snapshotState());
        if (state.undoStack.length > 100) state.undoStack.shift();
        state.redoStack.length = 0;
    }
    pushUndo(); // initial state

    function calcRange() {
        state.mx = -1; state.my = -1;
        for (let k = 0; k < 10; k++) {
            for (let i = 0; i < 12; i++) {
                for (let j = 0; j < 12; j++) {
                    if (slots[k].get(i, j) !== 0) {
                        if (state.mx < i) state.mx = i;
                        if (state.my < j) state.my = j;
                    }
                }
            }
        }
    }
    calcRange();

    // ---- DOM construction ----
    const body = document.createElement("div");
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.gap = "0.5rem";
    body.style.minWidth = "560px";

    // Header: description + used-patterns indicator.
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.justifyContent = "space-between";
    const description = document.createElement("div");
    description.style.fontWeight = "bold";
    const usedWrap = document.createElement("div");
    usedWrap.style.display = "flex";
    usedWrap.style.alignItems = "center";
    usedWrap.style.gap = "0.5rem";
    const usedLabel = document.createElement("span");
    usedLabel.textContent = L("muster.used", "Used patterns:");
    const usedSlots = document.createElement("span");
    usedSlots.style.fontFamily = "monospace";
    usedWrap.appendChild(usedLabel);
    usedWrap.appendChild(usedSlots);
    header.appendChild(description);
    header.appendChild(usedWrap);
    body.appendChild(header);

    // Toolbar with action buttons.
    const toolbar = document.createElement("div");
    toolbar.style.display = "flex";
    toolbar.style.flexWrap = "wrap";
    toolbar.style.gap = "0.25rem";
    const mkBtn = (label, fn, opts) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.padding = "0.2rem 0.5rem";
        b.addEventListener("click", () => { fn(); canvas.focus(); });
        if (opts && opts.title) b.title = opts.title;
        toolbar.appendChild(b);
        return b;
    };
    const undoBtn = mkBtn(L("muster.undo", "Undo"), () => doUndo());
    const redoBtn = mkBtn(L("muster.redo", "Redo"), () => doRedo());
    const sep1 = document.createElement("span"); sep1.textContent = "│"; sep1.style.opacity = "0.4";
    toolbar.appendChild(sep1);
    mkBtn(L("muster.delete", "Delete"),     () => editDelete());
    mkBtn(L("muster.mirror-h", "Mirror H"), () => editMirrorH());
    mkBtn(L("muster.mirror-v", "Mirror V"), () => editMirrorV());
    mkBtn(L("muster.rotate", "Rotate"),     () => editRotate());
    mkBtn(L("muster.invert", "Invert"),     () => editInvert());
    mkBtn(L("muster.central", "Central sym."), () => editCentralsym());
    const sep2 = document.createElement("span"); sep2.textContent = "│"; sep2.style.opacity = "0.4";
    toolbar.appendChild(sep2);
    mkBtn("←", () => rollLeft(),  { title: L("muster.roll-left",  "Roll left") });
    mkBtn("→", () => rollRight(), { title: L("muster.roll-right", "Roll right") });
    mkBtn("↑", () => rollUp(),    { title: L("muster.roll-up",    "Roll up") });
    mkBtn("↓", () => rollDown(),  { title: L("muster.roll-down",  "Roll down") });
    const sep3 = document.createElement("span"); sep3.textContent = "│"; sep3.style.opacity = "0.4";
    toolbar.appendChild(sep3);

    // Preset dropdown: stamps a standard binding into the active slot.
    const presets = [
        { label: L("muster.preset-tabby",   "Tabby"),     fn: () => musterKoeper(1, 1) },
        { label: L("muster.preset-twill22", "Twill 2/2"), fn: () => musterKoeper(2, 2) },
        { label: L("muster.preset-twill33", "Twill 3/3"), fn: () => musterKoeper(3, 3) },
        { label: L("muster.preset-twill44", "Twill 4/4"), fn: () => musterKoeper(4, 4) },
        { sep: true },
        { label: L("muster.preset-twill21", "Twill 2/1"), fn: () => musterKoeper(2, 1) },
        { label: L("muster.preset-twill31", "Twill 3/1"), fn: () => musterKoeper(3, 1) },
        { label: L("muster.preset-twill32", "Twill 3/2"), fn: () => musterKoeper(3, 2) },
        { label: L("muster.preset-twill41", "Twill 4/1"), fn: () => musterKoeper(4, 1) },
        { label: L("muster.preset-twill42", "Twill 4/2"), fn: () => musterKoeper(4, 2) },
        { label: L("muster.preset-twill43", "Twill 4/3"), fn: () => musterKoeper(4, 3) },
        { label: L("muster.preset-twill51", "Twill 5/1"), fn: () => musterKoeper(5, 1) },
        { label: L("muster.preset-twill52", "Twill 5/2"), fn: () => musterKoeper(5, 2) },
        { label: L("muster.preset-twill53", "Twill 5/3"), fn: () => musterKoeper(5, 3) },
        { sep: true },
        { label: L("muster.preset-satin5",  "Satin 5×5"), fn: () => musterAtlas(5) },
        { label: L("muster.preset-satin7",  "Satin 7×7"), fn: () => musterAtlas(7) },
        { label: L("muster.preset-satin9",  "Satin 9×9"), fn: () => musterAtlas(9) },
        { sep: true },
        { label: L("muster.preset-panama21", "Panama 2/1"), fn: () => musterPanama(2, 1) },
        { label: L("muster.preset-panama22", "Panama 2/2"), fn: () => musterPanama(2, 2) },
    ];
    const presetSelect = document.createElement("select");
    presetSelect.style.padding = "0.2rem 0.3rem";
    const phPreset = document.createElement("option");
    phPreset.value = "";
    phPreset.textContent = L("muster.preset-placeholder", "Insert binding…");
    phPreset.disabled = true;
    phPreset.selected = true;
    presetSelect.appendChild(phPreset);
    presets.forEach((p, idx) => {
        if (p.sep) {
            const sep = document.createElement("option");
            sep.disabled = true;
            sep.textContent = "─────";
            presetSelect.appendChild(sep);
            return;
        }
        const opt = document.createElement("option");
        opt.value = String(idx);
        opt.textContent = p.label;
        presetSelect.appendChild(opt);
    });
    presetSelect.addEventListener("change", () => {
        const idx = parseInt(presetSelect.value, 10);
        if (!isNaN(idx) && presets[idx] && presets[idx].fn) {
            presets[idx].fn();
        }
        presetSelect.value = "";  // reset to placeholder
        canvas.focus();
    });
    toolbar.appendChild(presetSelect);

    // Copy-from dropdown: pulls another slot's pattern into the current.
    const copySelect = document.createElement("select");
    copySelect.style.padding = "0.2rem 0.3rem";
    const phCopy = document.createElement("option");
    phCopy.value = "";
    phCopy.textContent = L("muster.copy-from", "Copy from…");
    phCopy.disabled = true;
    phCopy.selected = true;
    copySelect.appendChild(phCopy);
    for (let k = 0; k < 10; k++) {
        const opt = document.createElement("option");
        opt.value = String(k);
        opt.textContent = (k === 0)
            ? L("muster.base-pattern", "Base pattern")
            : (L("muster.pattern", "Pattern") + " " + k);
        copySelect.appendChild(opt);
    }
    copySelect.addEventListener("change", () => {
        const k = parseInt(copySelect.value, 10);
        if (!isNaN(k)) grabFrom(k);
        copySelect.value = "";
        canvas.focus();
    });
    toolbar.appendChild(copySelect);

    body.appendChild(toolbar);

    // Binding selector (10 slot buttons).
    const bindRow = document.createElement("div");
    bindRow.style.display = "flex";
    bindRow.style.gap = "0.25rem";
    const bindBtns = [];
    for (let k = 0; k < 10; k++) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = (k === 0) ? L("muster.base", "B") : String(k);
        b.style.minWidth = "2rem";
        b.style.padding = "0.2rem 0.4rem";
        b.dataset.slot = String(k);
        b.addEventListener("click", () => { selectBindung(k); canvas.focus(); });
        bindBtns.push(b);
        bindRow.appendChild(b);
    }
    body.appendChild(bindRow);

    // Direction toggles (block mode only).
    let einzugZRadio = null, einzugSRadio = null;
    let trittfolgeZRadio = null, trittfolgeSRadio = null;
    if (isBlock) {
        const dirs = document.createElement("div");
        dirs.style.display = "flex";
        dirs.style.gap = "1.5rem";
        dirs.style.fontSize = "13px";
        dirs.innerHTML = `
            <fieldset style="border:1px solid #aaa;padding:0.2rem 0.6rem">
              <legend>${L("muster.einzug-direction", "Threading")}</legend>
              <label><input type="radio" name="tx-mb-ez" value="z" ${state.einzugZ ? "checked" : ""}> ${L("muster.straight-rising", "Straight rising")}</label>
              <label style="margin-left:0.8rem"><input type="radio" name="tx-mb-ez" value="s" ${!state.einzugZ ? "checked" : ""}> ${L("muster.straight-falling", "Straight falling")}</label>
            </fieldset>
            <fieldset style="border:1px solid #aaa;padding:0.2rem 0.6rem">
              <legend>${L("muster.tritt-direction", "Treadling")}</legend>
              <label><input type="radio" name="tx-mb-tf" value="z" ${state.trittfolgeZ ? "checked" : ""}> ${L("muster.straight-rising", "Straight rising")}</label>
              <label style="margin-left:0.8rem"><input type="radio" name="tx-mb-tf" value="s" ${!state.trittfolgeZ ? "checked" : ""}> ${L("muster.straight-falling", "Straight falling")}</label>
            </fieldset>`;
        body.appendChild(dirs);
        einzugZRadio = dirs.querySelector("input[name='tx-mb-ez'][value='z']");
        einzugSRadio = dirs.querySelector("input[name='tx-mb-ez'][value='s']");
        trittfolgeZRadio = dirs.querySelector("input[name='tx-mb-tf'][value='z']");
        trittfolgeSRadio = dirs.querySelector("input[name='tx-mb-tf'][value='s']");
        einzugZRadio.addEventListener("change", () => { if (einzugZRadio.checked) state.einzugZ = true; });
        einzugSRadio.addEventListener("change", () => { if (einzugSRadio.checked) state.einzugZ = false; });
        trittfolgeZRadio.addEventListener("change", () => { if (trittfolgeZRadio.checked) state.trittfolgeZ = true; });
        trittfolgeSRadio.addEventListener("change", () => { if (trittfolgeSRadio.checked) state.trittfolgeZ = false; });
    }

    // Canvas (12×12 editor).
    const CELL = 22;
    const canvasWrap = document.createElement("div");
    canvasWrap.style.background = "#bbb";
    canvasWrap.style.padding = "1px";
    canvasWrap.style.alignSelf = "center";
    const canvas = document.createElement("canvas");
    canvas.width = 12 * CELL + 1;
    canvas.height = 12 * CELL + 1;
    canvas.tabIndex = 0;
    canvas.style.outline = "none";
    canvas.style.background = "#c0c0c0";
    canvas.style.cursor = "default";
    canvasWrap.appendChild(canvas);
    body.appendChild(canvasWrap);

    function bindungColor(s) {
        if (s === 0) return "#808080";
        return getRangeColor(settings, s);
    }

    function paint() {
        const ctx2 = canvas.getContext("2d");
        ctx2.clearRect(0, 0, canvas.width, canvas.height);
        // grid
        ctx2.strokeStyle = "#696969";
        ctx2.lineWidth = 1;
        ctx2.beginPath();
        for (let i = 0; i <= 12; i++) {
            ctx2.moveTo(i * CELL + 0.5, 0);
            ctx2.lineTo(i * CELL + 0.5, 12 * CELL);
        }
        for (let j = 0; j <= 12; j++) {
            ctx2.moveTo(0, j * CELL + 0.5);
            ctx2.lineTo(12 * CELL, j * CELL + 0.5);
        }
        ctx2.stroke();
        // cells
        const m = slots[state.current];
        for (let i = 0; i < 12; i++) {
            for (let j = 0; j < 12; j++) {
                const c = m.get(i, j);
                if (c === 0) continue;
                ctx2.fillStyle = state.current === 0 ? "#808080" : bindungColor(c);
                ctx2.fillRect(i * CELL + 2, (12 - j - 1) * CELL + 2, CELL - 3, CELL - 3);
            }
        }
        // red "current size" markers (block mode only)
        if (isBlock && state.mx >= 0 && state.my >= 0) {
            ctx2.strokeStyle = "#d00";
            ctx2.lineWidth = 2;
            ctx2.beginPath();
            ctx2.moveTo(1, (12 - 1 - state.my) * CELL);
            ctx2.lineTo((state.mx + 1) * CELL, (12 - 1 - state.my) * CELL);
            ctx2.moveTo((state.mx + 1) * CELL, (12 - 1 - state.my) * CELL);
            ctx2.lineTo((state.mx + 1) * CELL, 12 * CELL);
            ctx2.stroke();
        }
        // focus cursor
        if (document.activeElement === canvas) {
            ctx2.strokeStyle = "#fff";
            ctx2.lineWidth = 1.5;
            ctx2.strokeRect(state.cx * CELL + 0.5, (12 - 1 - state.cy) * CELL + 0.5,
                            CELL, CELL);
        }
    }

    function refreshDescription() {
        if (state.current === 0) description.textContent = L("muster.base-pattern", "Base pattern");
        else description.textContent = (L("muster.pattern", "Pattern") + " " + state.current);
    }
    function refreshUsed() {
        const parts = [];
        for (let k = 0; k < 10; k++) {
            const used = !slots[k].isEmpty();
            const label = (k === 0) ? "B" : String(k);
            parts.push(`<span style="color:${used ? '#c00' : '#888'};margin-right:2px">${label}</span>`);
        }
        usedSlots.innerHTML = parts.join("");
    }
    function refreshBindButtons() {
        for (let k = 0; k < 10; k++) {
            bindBtns[k].style.fontWeight = (k === state.current) ? "bold" : "normal";
            bindBtns[k].style.background = (k === state.current) ? "#cce" : "";
        }
    }
    function refreshUndoButtons() {
        undoBtn.disabled = state.undoStack.length <= 1;
        redoBtn.disabled = state.redoStack.length === 0;
    }

    function doUndo() {
        if (state.undoStack.length <= 1) return;
        const cur = state.undoStack.pop();
        state.redoStack.push(cur);
        const prev = state.undoStack[state.undoStack.length - 1];
        restoreState(prev);
        calcRange(); refreshAll();
    }
    function doRedo() {
        if (state.redoStack.length === 0) return;
        const next = state.redoStack.pop();
        state.undoStack.push(next);
        restoreState(next);
        calcRange(); refreshAll();
    }
    function refreshAll() {
        refreshDescription(); refreshUsed(); refreshBindButtons();
        refreshUndoButtons(); paint();
    }
    function selectBindung(b) {
        state.current = b;
        refreshAll();
    }

    function toggle(s, current) {
        if (s === 0) return current !== 0 ? current : 1;
        return 0;
    }

    function editDelete() {
        if (state.mx === -1) return;
        slots[state.current].clear();
        calcRange(); pushUndo(); refreshAll();
    }
    function editMirrorH() {
        if (state.mx === -1) return;
        const m = slots[state.current];
        for (let i = 0; i <= Math.floor(state.mx / 2); i++) {
            for (let j = 0; j <= state.my; j++) {
                const t = m.get(i, j);
                m.set(i, j, m.get(state.mx - i, j));
                m.set(state.mx - i, j, t);
            }
        }
        pushUndo(); refreshAll();
    }
    function editMirrorV() {
        if (state.mx === -1) return;
        const m = slots[state.current];
        for (let i = 0; i <= state.mx; i++) {
            for (let j = 0; j <= Math.floor(state.my / 2); j++) {
                const t = m.get(i, j);
                m.set(i, j, m.get(i, state.my - j));
                m.set(i, state.my - j, t);
            }
        }
        pushUndo(); refreshAll();
    }
    function editRotate() {
        if (state.mx === -1 || state.mx !== state.my) return;
        const m = slots[state.current];
        const sz = state.mx + 1;
        const data = new Array(sz * sz);
        for (let i = 0; i <= state.mx; i++) {
            for (let j = 0; j <= state.my; j++) {
                data[j * sz + i] = m.get(i, j);
                m.set(i, j, 0);
            }
        }
        for (let i = 0; i <= state.mx; i++) {
            for (let j = 0; j <= state.my; j++) {
                m.set(j, state.my - i, data[j * sz + i]);
            }
        }
        pushUndo(); refreshAll();
    }
    function editInvert() {
        if (state.mx === -1) return;
        const m = slots[state.current];
        for (let i = 0; i <= state.mx; i++) {
            for (let j = 0; j <= state.my; j++) {
                m.set(i, j, toggle(m.get(i, j), state.current));
            }
        }
        pushUndo(); refreshAll();
    }
    function editCentralsym() {
        if (state.mx === -1 || state.mx !== state.my) return;
        // Reuse the existing pattern's central-symmetry algorithm by
        // wrapping the muster slot in a Grid-like temp.
        const sz = state.mx + 1;
        const tmp = new Grid(sz, sz);
        const m = slots[state.current];
        for (let i = 0; i < sz; i++)
            for (let j = 0; j < sz; j++) tmp.set(i, j, m.get(i, j));
        const result = tmp.centralSymmetry(0, 0, sz - 1, sz - 1);
        if (result === "applied") {
            for (let i = 0; i < sz; i++)
                for (let j = 0; j < sz; j++) m.set(i, j, tmp.get(i, j));
            pushUndo(); refreshAll();
        }
        // "noop" / "none" → nothing visible to do.
    }
    function rollUp() {
        if (state.mx === -1) return;
        const m = slots[state.current];
        const top = new Array(state.mx + 1);
        for (let i = 0; i <= state.mx; i++) top[i] = m.get(i, state.my);
        for (let j = state.my; j > 0; j--)
            for (let i = 0; i <= state.mx; i++) m.set(i, j, m.get(i, j - 1));
        for (let i = 0; i <= state.mx; i++) m.set(i, 0, top[i]);
        pushUndo(); refreshAll();
    }
    function rollDown() {
        if (state.mx === -1) return;
        const m = slots[state.current];
        const bot = new Array(state.mx + 1);
        for (let i = 0; i <= state.mx; i++) bot[i] = m.get(i, 0);
        for (let j = 0; j < state.my; j++)
            for (let i = 0; i <= state.mx; i++) m.set(i, j, m.get(i, j + 1));
        for (let i = 0; i <= state.mx; i++) m.set(i, state.my, bot[i]);
        pushUndo(); refreshAll();
    }
    function rollLeft() {
        if (state.mx === -1) return;
        const m = slots[state.current];
        const left = new Array(state.my + 1);
        for (let j = 0; j <= state.my; j++) left[j] = m.get(0, j);
        for (let i = 0; i < state.mx; i++)
            for (let j = 0; j <= state.my; j++) m.set(i, j, m.get(i + 1, j));
        for (let j = 0; j <= state.my; j++) m.set(state.mx, j, left[j]);
        pushUndo(); refreshAll();
    }
    function rollRight() {
        if (state.mx === -1) return;
        const m = slots[state.current];
        const right = new Array(state.my + 1);
        for (let j = 0; j <= state.my; j++) right[j] = m.get(state.mx, j);
        for (let i = state.mx; i > 0; i--)
            for (let j = 0; j <= state.my; j++) m.set(i, j, m.get(i - 1, j));
        for (let j = 0; j <= state.my; j++) m.set(0, j, right[j]);
        pushUndo(); refreshAll();
    }

    // ---- Preset bindings (Tabby / Twill / Satin / Panama) -----------
    function musterKoeper(h, s) {
        const m = slots[state.current];
        m.clear();
        const n = h + s;
        const v = state.current !== 0 ? state.current : 1;
        if (h <= s) {
            for (let i = 0; i < n; i++)
                for (let j = i; j < i + h; j++) m.set(i, j % n, v);
        } else {
            for (let i = 0; i < n; i++)
                for (let j = i + s; j < i + n; j++) m.set(i, j % n, v);
        }
        calcRange(); pushUndo(); refreshAll();
    }
    const _MUSTER_ATLAS = {
        5: [[0,0],[1,2],[2,4],[3,1],[4,3]],
        7: [[0,2],[1,6],[2,3],[3,0],[4,4],[5,1],[6,5]],
        9: [[0,0],[1,2],[2,4],[3,6],[4,8],[5,1],[6,3],[7,5],[8,7]],
    };
    function musterAtlas(n) {
        const m = slots[state.current];
        m.clear();
        const v = state.current !== 0 ? state.current : 1;
        const offsets = _MUSTER_ATLAS[n];
        if (!offsets) return;
        for (const [i, j] of offsets) m.set(i, j, v);
        calcRange(); pushUndo(); refreshAll();
    }
    function musterPanama(h, s) {
        const m = slots[state.current];
        m.clear();
        const v = state.current !== 0 ? state.current : 1;
        for (let i = 0; i < h; i++)
            for (let j = 0; j < h; j++) m.set(i, j, v);
        for (let i = h; i < h + s; i++)
            for (let j = h; j < h + s; j++) m.set(i, j, v);
        calcRange(); pushUndo(); refreshAll();
    }

    // ---- Copy from another binding slot -----------------------------
    // Double-toggle effectively recolours every set cell of the source
    // slot to the current slot's value (and clears the rest), within
    // the global bounding box (mx, my).
    function grabFrom(fromSlot) {
        if (fromSlot < 0 || fromSlot >= 10) return;
        if (fromSlot === state.current) return;
        if (state.mx === -1) return;
        for (let i = 0; i <= state.mx; i++) {
            for (let j = 0; j <= state.my; j++) {
                let c = slots[fromSlot].get(i, j);
                c = toggle(toggle(c, state.current), state.current);
                slots[state.current].set(i, j, c);
            }
        }
        pushUndo(); refreshAll();
    }

    // Mouse input.
    canvas.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const i = Math.floor(x / CELL);
        const j = 12 - 1 - Math.floor(y / CELL);
        if (i < 0 || j < 0 || i >= 12 || j >= 12) return;
        const m = slots[state.current];
        m.set(i, j, toggle(m.get(i, j), state.current));
        state.cx = i; state.cy = j;
        calcRange(); pushUndo(); refreshAll();
        canvas.focus();
    });

    // Keyboard input — arrows, Shift+arrow rolls, Space toggles, Enter
    // cycles binding, digit selects binding. Stops propagation so the
    // window-level shortcuts don't consume them.
    canvas.addEventListener("keydown", (e) => {
        const ctrl = e.ctrlKey, shift = e.shiftKey;
        const step = ctrl ? 4 : 1;
        let consumed = true;
        switch (e.key) {
            case "ArrowLeft":
                if (shift) rollLeft();
                else { state.cx = Math.max(0, state.cx - step); paint(); }
                break;
            case "ArrowRight":
                if (shift) rollRight();
                else { state.cx = Math.min(11, state.cx + step); paint(); }
                break;
            case "ArrowUp":
                if (shift) rollUp();
                else { state.cy = Math.min(11, state.cy + step); paint(); }
                break;
            case "ArrowDown":
                if (shift) rollDown();
                else { state.cy = Math.max(0, state.cy - step); paint(); }
                break;
            case " ": {
                const m = slots[state.current];
                m.set(state.cx, state.cy, toggle(m.get(state.cx, state.cy), state.current));
                if (state.cy < 11) state.cy++;
                calcRange(); pushUndo(); refreshAll();
                break;
            }
            case "Enter":
                selectBindung(shift ? (state.current + 9) % 10 : (state.current + 1) % 10);
                break;
            case "0": case "1": case "2": case "3": case "4":
            case "5": case "6": case "7": case "8": case "9":
                selectBindung(parseInt(e.key, 10));
                break;
            default:
                consumed = false;
        }
        if (consumed) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    });

    canvas.addEventListener("focus", () => paint());
    canvas.addEventListener("blur", () => paint());

    // Open modal.
    let modal;
    const apply = () => {
        modal.close();
        if (isBlock) {
            settings.muster_einzug_z = state.einzugZ;
            settings.muster_trittfolge_z = state.trittfolgeZ;
            _applyBlockmuster(state.einzugZ, state.trittfolgeZ, state.mx, state.my);
        } else {
            _applyBereichmuster();
        }
    };
    // Dialog-level shortcuts. Installed in capture phase on the document
    // so they run before (and override) the global Shortcuts dispatcher —
    // otherwise top-level bindings like "H" would mirror the main pattern
    // while this dialog is open. Removed on modal close.
    const dialogKey = (e) => {
        if (!modal || modal._closed) return;
        if (!modal.root.contains(e.target)) return;
        // Don't hijack typing in real text inputs (none in this dialog, but
        // be defensive in case future widgets are added).
        const tag = e.target && e.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;

        // Layout-independent digit detection (matches shortcuts.js).
        let digit = null;
        if (e.code && /^Digit[0-9]$/.test(e.code)) digit = parseInt(e.code.slice(5), 10);
        else if (e.code && /^Numpad[0-9]$/.test(e.code)) digit = parseInt(e.code.slice(6), 10);

        const ctrl = e.ctrlKey || e.metaKey;
        const shift = e.shiftKey;
        const alt = e.altKey;
        let consumed = false;

        // Ctrl+Enter → Apply (close + commit).
        if (ctrl && !shift && !alt && e.key === "Enter") {
            consumed = true;
            apply();
        }
        // Ctrl+Z / Ctrl+Y → local undo/redo.
        else if (ctrl && !shift && !alt && (e.key === "z" || e.key === "Z")) {
            consumed = true; doUndo();
        }
        else if (ctrl && !shift && !alt && (e.key === "y" || e.key === "Y")) {
            consumed = true; doRedo();
        }
        // Ctrl+Shift+digit → copy from slot N into current.
        else if (ctrl && shift && !alt && digit !== null) {
            consumed = true; grabFrom(digit);
        }
        // Shift+digit → select pattern slot N.
        else if (!ctrl && shift && !alt && digit !== null) {
            consumed = true; selectBindung(digit);
        }
        // Ctrl+6/7/8/9 → roll up/down/left/right (matches top-level).
        else if (ctrl && !shift && !alt && digit !== null) {
            if (digit === 6) { consumed = true; rollUp(); }
            else if (digit === 7) { consumed = true; rollDown(); }
            else if (digit === 8) { consumed = true; rollLeft(); }
            else if (digit === 9) { consumed = true; rollRight(); }
        }
        // Unmodified letters mirror the top-level Bearbeiten menu.
        else if (!ctrl && !alt && !shift) {
            const k = (e.key || "").toUpperCase();
            switch (k) {
                case "H": consumed = true; editMirrorH(); break;
                case "V": consumed = true; editMirrorV(); break;
                case "R": consumed = true; editRotate(); break;
                case "I": consumed = true; editInvert(); break;
                case "Z": consumed = true; editCentralsym(); break;
                case "DELETE": consumed = true; editDelete(); break;
            }
        }

        if (consumed) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    };
    document.addEventListener("keydown", dialogKey, true);

    modal = Modal.open({
        title: isBlock
            ? L("muster.block-title",   "Substitute with block patterns")
            : L("muster.bereich-title", "Substitute ranges with patterns"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("muster.apply", "Apply"), role: "primary", onClick: () => apply() },
        ],
        onClose: () => {
            document.removeEventListener("keydown", dialogKey, true);
        },
    });
    refreshAll();
    setTimeout(() => canvas.focus(), 0);
}

// Wraps the BlockExpand* trio in a single undoable command.
function _applyBlockmuster(einzugZ, trittfolgeZ, mx, my) {
    if (mx < 0 || my < 0) return;
    const x = mx + 1;
    const y = my + 1;
    _fullSnapCommand("blockmuster", () => {
        // Legacy temporarily disables Schlagpatrone for the substitution.
        const wasPegplan = !!settings.display_pegplan;
        if (wasPegplan) {
            settings.display_pegplan = false;
            pattern.recalc_weave();
        }
        _blockExpandEinzug(y, einzugZ);
        _blockExpandTrittfolge(x, trittfolgeZ);
        _blockExpandAufknuepfung(x, y, pattern.blockmuster);
        pattern.recalc_weave_extent();
        pattern.recalc_weave();
        if (wasPegplan) {
            settings.display_pegplan = true;
            pattern._recalc_pegplan_from_weave();
        }
    });
}

function _applyBereichmuster() {
    _fullSnapCommand("bereichmuster", () => {
        _bereicheFillPattern(pattern.bereichmuster);
        pattern.recalc_from_weave(settings);
    });
}

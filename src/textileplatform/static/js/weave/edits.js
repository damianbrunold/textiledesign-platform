// The DB-WEAVE editor's editing operations, each one undoable: single
// cells / threads with the follow-up recalculation, inserting /
// removing / moving shafts, treadles, warps and wefts, the repeat
// dialog, switching sides, threading / treadling operations and
// arrangement styles, the atlas / twill generators, pegplan transforms
// and repeat extension / reduction.

import {
    makeCellCommand, makeEnteringCommand, makeGridRegionCommand,
    restoreGridRegion, snapshotGridRegion,
} from "../ui/commands.js";
import { editorI18n, setModified } from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import {
    ATLAS_OFFSETS, completeTwill, stampAtlas, stampTwill,
} from "./generators.js";
import {
    _fullPatternSnapshot, _fullSnapCommand, _restoreFullPatternSnapshot,
} from "./history.js";
import { _runEzArrangement, _runTfArrangement } from "./options.js";
import {
    commandBus, cursor, pattern, readonly, settings, view,
} from "./state.js";
import {
    clearPegplan, invertPegplan, mirrorPegplan, repeatWarp, repeatWeft,
    switchSide,
} from "./transforms.js";

// ---- Command-backed primitives for single-cell/thread edits ----
//
// Called from mouseUp and (later) keyboard-driven cell toggle. `recalc`:
//   "from_weave" -> recalc_from_weave(settings) after apply
//   "weave_recalc" -> recalc_weave() after apply
//   null -> no recalc
export function _recalcFor(kind) {
    return () => {
        if (kind === "from_weave") pattern.recalc_from_weave(settings);
        else if (kind === "weave_recalc") pattern.recalc_weave();
        setModified();
        view.draw();
    };
}

export function _applyEnteringChange(i, newShaft) {
    // Read-only views (someone else's pattern) must not change cells,
    // neither by mouse nor by keyboard. All cell edits go through
    // these _apply* helpers, so the guard lives here.
    if (readonly) return;
    if (!commandBus) {
        pattern.entering.set_shaft(i, newShaft);
        pattern.recalc_weave();
        setModified();
        return;
    }
    commandBus.execute(makeEnteringCommand({
        entering: pattern.entering, i, newShaft,
        afterApply: _recalcFor("weave_recalc"),
        label: "set shaft",
    }));
}

export function _applyGridToggle(grid, i, j, defaultValue, recalcKind) {
    if (readonly) return;
    const current = grid.get(i, j);
    // Toggling an "off" cell (zero or stored-as-negative) always uses
    // the *currently active* range, not the value the cell previously
    // held. Matches desktop SetGewebe / SetEintrag behaviour: switching
    // bereich and re-toggling stamps the new bereich.
    const newValue = current > 0 ? -current : defaultValue;
    // Weave edits inside an active rapport replicate the new value across
    // every rapport copy within the pattern extent — matches desktop
    // SetGewebe's rapport-propagation branch. Single undoable command.
    if (grid === pattern.weave
        && settings && settings.display_repeat
        && _isInRapport(i, j)
        && _rapportValid()) {
        _applyWeaveCellWithRapport(i, j, newValue, recalcKind);
        return;
    }
    _applyCellSet(grid, i, j, newValue, recalcKind);
}

function _rapportValid() {
    return pattern.rapport_k_b >= pattern.rapport_k_a
        && pattern.rapport_s_b >= pattern.rapport_s_a;
}

function _isInRapport(i, j) {
    return i >= pattern.rapport_k_a && i <= pattern.rapport_k_b
        && j >= pattern.rapport_s_a && j <= pattern.rapport_s_b;
}

// Collect all (i, j) inside the active extent that are rapport copies of
// the given seed cell, mutate them together, and wrap in one command.
function _applyWeaveCellWithRapport(seedI, seedJ, newValue, recalcKind) {
    const rw = pattern.rapport_k_b - pattern.rapport_k_a + 1;
    const rh = pattern.rapport_s_b - pattern.rapport_s_a + 1;
    const ka = pattern.rapport_k_a, kb_extent = pattern.max_x;
    const sa = pattern.rapport_s_a, sb_extent = pattern.max_y;
    const dx = ((seedI - ka) % rw + rw) % rw;
    const dy = ((seedJ - sa) % rh + rh) % rh;
    // Compute the set of all target cells and the bounding box for
    // snapshotting. Iterate the entire extent, not just the rapport span,
    // because the pattern is "rapportiert" (repeated) beyond it.
    const extentLoI = Math.max(pattern.min_x, 0);
    const extentHiI = Math.min(kb_extent, pattern.weave.width - 1);
    const extentLoJ = Math.max(pattern.min_y, 0);
    const extentHiJ = Math.min(sb_extent, pattern.weave.height - 1);
    const targets = [];
    let lo_i = Infinity, hi_i = -Infinity, lo_j = Infinity, hi_j = -Infinity;
    for (let i = extentLoI; i <= extentHiI; i++) {
        if (((i - ka) % rw + rw) % rw !== dx) continue;
        for (let j = extentLoJ; j <= extentHiJ; j++) {
            if (((j - sa) % rh + rh) % rh !== dy) continue;
            targets.push([i, j]);
            if (i < lo_i) lo_i = i;
            if (i > hi_i) hi_i = i;
            if (j < lo_j) lo_j = j;
            if (j > hi_j) hi_j = j;
        }
    }
    if (targets.length === 0) {
        _applyCellSet(pattern.weave, seedI, seedJ, newValue, recalcKind);
        return;
    }
    const grid = pattern.weave;
    const afterApply = _recalcFor(recalcKind);
    const mutate = () => {
        for (const [ii, jj] of targets) grid.set(ii, jj, newValue);
    };
    if (!commandBus) { mutate(); afterApply(); return; }
    commandBus.execute(makeGridRegionCommand({
        grid, i1: lo_i, j1: lo_j, i2: hi_i, j2: hi_j,
        mutate, afterApply, label: "rapport edit",
    }));
}

export function _applyCellSet(grid, i, j, newValue, recalcKind) {
    if (readonly) return;
    if (!commandBus) {
        grid.set(i, j, newValue);
        if (recalcKind === "from_weave") pattern.recalc_from_weave(settings);
        else if (recalcKind === "weave_recalc") pattern.recalc_weave();
        setModified();
        return;
    }
    commandBus.execute(makeCellCommand({
        grid, i, j, newValue,
        afterApply: _recalcFor(recalcKind),
        label: "set cell",
    }));
}

// Treadling single-mode: clear row, then optionally set the clicked cell.
// Captured as one command spanning the whole row.
export function _applyTreadlingSingle(i, j) {
    if (readonly) return;
    const grid = pattern.treadling;
    const wasSet = grid.get(i, j) > 0;
    if (!commandBus) {
        grid.clearRow(j);
        if (!wasSet) grid.set(i, j, 1);
        pattern.recalc_weave(); setModified();
        return;
    }
    const w = grid.width;
    const snap = snapshotGridRegion(grid, 0, j, w - 1, j);
    const after = _recalcFor("weave_recalc");
    commandBus.execute({
        label: "treadle row",
        apply() {
            grid.clearRow(j);
            if (!wasSet) grid.set(i, j, 1);
            after();
        },
        revert() { restoreGridRegion(grid, snap); after(); },
    });
}


// ---- Structural operations (insert/remove/move shaft/treadle/warp/weft) ----
//
// Grid dimensions (width/height/max_shafts/max_treadles) are fixed at pattern
// load time, so structural ops shift values in place: insertions push the
// last row/column off the end; deletions leave an empty row/column at the far
// end. Each op is wrapped in a full-pattern snapshot command for clean undo.


// Shafts (rows of tieup; columns of pegplan; shaft index is 1-based in
// the Entering array).
export function _insertShaftAt(at) {
    pattern.tieup.insertRow(at);
    pattern.pegplan.insertCol(at);
    // Entering: any shaft number >= at+1 shifts up; dropped if > max_shafts.
    const maxShaft = pattern.tieup.height;
    for (let i = 0; i < pattern.entering.width; i++) {
        const s = pattern.entering.get_shaft(i);
        if (s >= at + 1) {
            const ns = s + 1;
            pattern.entering.set_shaft(i, ns > maxShaft ? 0 : ns);
        }
    }
}
export function _removeShaftAt(at) {
    pattern.tieup.removeRow(at);
    pattern.pegplan.removeCol(at);
    for (let i = 0; i < pattern.entering.width; i++) {
        const s = pattern.entering.get_shaft(i);
        if (s === at + 1) pattern.entering.set_shaft(i, 0);
        else if (s > at + 1) pattern.entering.set_shaft(i, s - 1);
    }
}
export function _swapShafts(a, b) {
    if (a === b) return;
    pattern.tieup.swapRows(a, b);
    pattern.pegplan.swapCols(a, b);
    for (let i = 0; i < pattern.entering.width; i++) {
        const s = pattern.entering.get_shaft(i);
        if (s === a + 1) pattern.entering.set_shaft(i, b + 1);
        else if (s === b + 1) pattern.entering.set_shaft(i, a + 1);
    }
}

// Treadles (cols of tieup + treadling).
export function _insertTreadleAt(at) {
    pattern.tieup.insertCol(at);
    pattern.treadling.insertCol(at);
}
export function _removeTreadleAt(at) {
    pattern.tieup.removeCol(at);
    pattern.treadling.removeCol(at);
}
export function _swapTreadles(a, b) {
    if (a === b) return;
    pattern.tieup.swapCols(a, b);
    pattern.treadling.swapCols(a, b);
}

// Warp threads (i dim of weave, entering, color_warp, reed).
export function _insertWarpAt(at) {
    pattern.weave.insertCol(at);
    pattern.color_warp.insertCol(at);
    pattern.reed.insertCol(at);
    pattern.entering.insertAt(at);
}
export function _removeWarpAt(at) {
    pattern.weave.removeCol(at);
    pattern.color_warp.removeCol(at);
    pattern.reed.removeCol(at);
    pattern.entering.removeAt(at);
}

// Weft threads (j dim of weave, treadling, pegplan, color_weft).
export function _insertWeftAt(at) {
    pattern.weave.insertRow(at);
    pattern.treadling.insertRow(at);
    pattern.pegplan.insertRow(at);
    pattern.color_weft.insertRow(at);
}
export function _removeWeftAt(at) {
    pattern.weave.removeRow(at);
    pattern.treadling.removeRow(at);
    pattern.pegplan.removeRow(at);
    pattern.color_weft.removeRow(at);
}


// Opens the Rapportieren (F8) dialog to choose horizontal/vertical repeat
// counts, "repeat all", and "repeat colors", then applies the replication
// wrapped in a single undoable command.
export function showRapportDialog() {
    if (readonly) return;
    pattern.recalc_weave_extent();
    pattern.calcRapport();
    const kx = pattern.max_x - pattern.min_x + 1;
    const rx = pattern.rapport_k_b - pattern.rapport_k_a + 1;
    const ky = pattern.max_y - pattern.min_y + 1;
    const ry = pattern.rapport_s_b - pattern.rapport_s_a + 1;
    const defHorz = (kx > 0 && rx > 0) ? Math.max(1, Math.floor(kx / rx)) : 1;
    const defVert = (ky > 0 && ry > 0) ? Math.max(1, Math.floor(ky / ry)) : 1;

    const i18n = editorI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    const body = document.createElement("div");
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto auto;gap:0.5rem 1rem;align-items:center">
          <label for="tx-rap-horz">${L("rapportieren.horz", "Horizontal repeats")}</label>
          <input id="tx-rap-horz" type="number" min="1" step="1" value="${defHorz}" style="width:6rem">
          <label for="tx-rap-vert">${L("rapportieren.vert", "Vertical repeats")}</label>
          <input id="tx-rap-vert" type="number" min="1" step="1" value="${defVert}" style="width:6rem">
          <label><input id="tx-rap-all" type="checkbox"> ${L("rapportieren.all", "Repeat to pattern bounds")}</label><span></span>
          <label><input id="tx-rap-colors" type="checkbox"> ${L("rapportieren.colors", "Repeat colours too")}</label><span></span>
        </div>`;
    let modal;
    const apply = () => {
        const all = body.querySelector("#tx-rap-all").checked;
        const colors = body.querySelector("#tx-rap-colors").checked;
        let hx = parseInt(body.querySelector("#tx-rap-horz").value, 10);
        let vy = parseInt(body.querySelector("#tx-rap-vert").value, 10);
        if (!isFinite(hx) || hx < 1) hx = 1;
        if (!isFinite(vy) || vy < 1) vy = 1;
        if (all) { hx = -1; vy = -1; }
        _applyRapportExtend(hx, vy, colors);
        modal.close();
    };
    // Pre-check "repeat all" disables the numeric inputs for clarity.
    body.addEventListener("change", (e) => {
        if (e.target.id === "tx-rap-all") {
            const all = e.target.checked;
            body.querySelector("#tx-rap-horz").disabled = all;
            body.querySelector("#tx-rap-vert").disabled = all;
        }
    });
    modal = Modal.open({
        title: L("repeat.dialog-title", "Repeat"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok", "OK"), role: "primary", onClick: () => apply() },
        ],
    });
}

// Execute the rapport replication as a single undoable command.
function _applyRapportExtend(hx, vy, withColors) {
    const before = _fullPatternSnapshot();
    _rapportKette(hx === 0 ? 1 : hx, withColors);
    _rapportSchuss(vy === 0 ? 1 : vy, withColors);
    pattern.calcRapport();
    const after = _fullPatternSnapshot();
    _restoreFullPatternSnapshot(before);
    const finalize = () => { setModified(); view.draw(); };
    const cmd = {
        label: "rapportieren",
        apply()  { _restoreFullPatternSnapshot(after);  finalize(); },
        revert() { _restoreFullPatternSnapshot(before); finalize(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else cmd.apply();
}

export function _applyRapportReduce() {
    _applyRapportExtend(1, 1, false);
}


// Overview (F4) — opens a fullscreen modal that renders ONLY the weave
// (no entering / tieup / treadling / colour strips) at the main editor's
// cell size. The absence of side panes lets the user see a larger portion
// of the pattern at the same zoom. No rapport markers — pure gewebe.
// Pressing F4 again while the overview is open closes it.


// ---- Switch side (F11) — weave/transforms.js switchSide ------------
export function _swapSide() {
    _fullSnapCommand("switch side", () => {
        switchSide(pattern, settings.current_range,
                   { pegplan: !!settings.display_pegplan });
    });
}


// ---- Twill completion (Ctrl+K) — weave/generators.js completeTwill --
export function _fillKoeper() {
    if (readonly) return;
    if (cursor.selected_part !== "weave") return;
    const sel = {
        i1: Math.min(cursor.x1, cursor.x2), i2: Math.max(cursor.x1, cursor.x2),
        j1: Math.min(cursor.y1, cursor.y2), j2: Math.max(cursor.y1, cursor.y2),
    };
    _fullSnapCommand("twill completion", () => {
        const done = completeTwill(pattern.weave, sel, settings.current_range);
        // Nothing to complete (not a single column / row): leave the
        // threading etc. alone, too.
        if (!done) return;
        _selectBlock(done);
        pattern.recalc_from_weave(settings);
    });
}


// ---- Threading: Mirror all — port of bereiche.cpp::EzSpiegelnClick --
export function _ezMirrorAll() {
    _fullSnapCommand("mirror threading", () => {
        if (pattern.min_x > pattern.max_x) return;
        const a = pattern.min_x, b = pattern.max_x;
        const mid = Math.floor((b - a) / 2);
        for (let i = a; i <= a + mid; i++) {
            const mirror = b - (i - a);
            if (i >= mirror) break;
            const e = pattern.entering.get_shaft(i);
            pattern.entering.set_shaft(i, pattern.entering.get_shaft(mirror));
            pattern.entering.set_shaft(mirror, e);
            for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                const g = pattern.weave.get(i, j);
                pattern.weave.set(i, j, pattern.weave.get(mirror, j));
                pattern.weave.set(mirror, j, g);
            }
        }
    });
}


// ---- Threading: Delete — clear einzug + weave warp columns ---------
export function _ezClear() {
    _fullSnapCommand("clear threading", () => {
        for (let i = 0; i < pattern.entering.width; i++) {
            pattern.entering.set_shaft(i, 0);
        }
        pattern.weave.data.fill(0);
        pattern.recalc_weave_extent();
    });
}


// ---- Treadling: Mirror — port of bereiche.cpp::TfSpiegelnClick ------
export function _tfMirrorAll() {
    _fullSnapCommand("mirror treadling", () => {
        if (pattern.min_y > pattern.max_y) return;
        const a = pattern.min_y, b = pattern.max_y;
        const mid = Math.floor((b - a) / 2);
        const grid = settings.display_pegplan ? pattern.pegplan : pattern.treadling;
        for (let j = a; j <= a + mid; j++) {
            const mirror = b - (j - a);
            if (j >= mirror) break;
            for (let i = 0; i < grid.width; i++) {
                const t = grid.get(i, j);
                grid.set(i, j, grid.get(i, mirror));
                grid.set(i, mirror, t);
            }
            for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                const g = pattern.weave.get(i, j);
                pattern.weave.set(i, j, pattern.weave.get(i, mirror));
                pattern.weave.set(i, mirror, g);
            }
        }
    });
}


// ---- Treadling: Delete — port of bereiche.cpp::ClearTrittfolgeClick -
export function _tfClear() {
    _fullSnapCommand("clear treadling", () => {
        const grid = settings.display_pegplan ? pattern.pegplan : pattern.treadling;
        grid.data.fill(0);
        pattern.weave.data.fill(0);
        pattern.recalc_weave_extent();
    });
}


// ---- Threading: Copy from treadling --------------------------------
//      Port of bereiche.cpp::CopyEinzugTrittfolgeClick.
export function _ezCopyFromTf() {
    _fullSnapCommand("copy threading from treadling", () => {
        for (let i = 0; i < pattern.entering.width; i++) {
            pattern.entering.set_shaft(i, 0);
        }
        const maxi = Math.min(pattern.treadling.height, pattern.entering.width);
        for (let i = 0; i < maxi; i++) {
            let schaft = 0;
            for (let ii = 0; ii < pattern.treadling.width; ii++) {
                if (pattern.treadling.get(ii, i) > 0) { schaft = ii + 1; break; }
            }
            pattern.entering.set_shaft(i, schaft);
        }
        pattern.recalc_weave();
    });
}


// ---- Treadling: Copy from threading --------------------------------
//      Port of bereiche.cpp::CopyTrittfolgeEinzugClick.
export function _tfCopyFromEz() {
    _fullSnapCommand("copy treadling from threading", () => {
        pattern.treadling.data.fill(0);
        const maxj = Math.min(pattern.treadling.height, pattern.entering.width);
        for (let j = 0; j < maxj; j++) {
            const schaft = pattern.entering.get_shaft(j);
            if (schaft > 0 && schaft - 1 < pattern.treadling.width) {
                pattern.treadling.set(schaft - 1, j, 1);
            }
        }
        pattern.recalc_weave();
    });
}


// ---- Phase 8c-1: Treadling rearrange (MinimalZ / MinimalS / Gesprungen)
//
// Port of trittfolge.cpp::RearrangeTritte and helpers (MoveTritt,
// AufknuepfungsspalteEqual, MergeTritte, EliminateEmptyTritt,
// SwitchTritte). Treadling styles only run in non-pegplan mode — in
// pegplan mode the desktop's RearrangeTritte returns early.

// The treadling arrangement itself is in weave/arrange.js.

export function _applyTfStyle(style) {
    settings.treadling_arrangement = style;
    _fullSnapCommand("treadling " + style, () => {
        _runTfArrangement(style);
        // Recalc weave from the new entering+tieup+treadling.
        pattern.recalc_weave();
    });
}


// ---- Phase 8c-2: Threading rearrange (MinimalZ / MinimalS) ---------
//
// Direct port of einzug.cpp::NormalZ / NormalS and helpers (CalcRange,
// IsTotalEmptySchaft, EliminateEmptySchaft, SchaefteEqual, MergeSchaefte,
// SwitchSchaefte, MoveSchaft). GeradeZ/S, Chorig2/3, Fixiert deferred.

// The threading arrangement itself is in weave/arrange.js.

export function _applyEzStyle(style) {
    settings.threading_arrangement = style;
    _fullSnapCommand("threading " + style, () => {
        if (style === "fixiert") {
            // Fixiert is a recalc-replacement, not a post-recalc shuffle:
            // run the full from-weave path so recalcFixedEntering
            // rebuilds the threading from the saved template.
            pattern.recalc_from_weave(settings);
        } else {
            _runEzArrangement(style);
            pattern.recalc_weave();
        }
    });
}


// ---- Phase 8b: pattern generators (Atlas / Köper) -------------------
//
// Direct ports of insertbindung.cpp::KoeperEinfuegen and AtlasEinfuegen.
// Both stamp a binding on the weave at the cursor position, then run
// recalc_from_weave so entering / treadling / tieup / pegplan catch up.
// Cursor must be on the weave pane.

// The stamping itself is in weave/generators.js.

export function _insertAtlas(n) {
    if (readonly) return;
    if (cursor.selected_part !== "weave") return;
    if (!ATLAS_OFFSETS[n]) return;
    const posi = cursor.x1, posj = cursor.y1;
    _fullSnapCommand("atlas " + n, () => {
        const sel = stampAtlas(pattern.weave, n, posi, posj,
                               settings.current_range);
        // Place a square selection over the inserted block.
        _selectBlock(sel);
        pattern.recalc_from_weave(settings);
    });
}

export function _insertKoeper(h, s) {
    if (readonly) return;
    if (cursor.selected_part !== "weave") return;
    if (h + s <= 0) return;
    const posi = cursor.x1, posj = cursor.y1;
    _fullSnapCommand("twill " + h + "/" + s, () => {
        const sel = stampTwill(pattern.weave, h, s, posi, posj,
                               settings.current_range);
        _selectBlock(sel);
        pattern.recalc_from_weave(settings);
    });
}

function _selectBlock(sel) {
    if (!sel) return;
    cursor.x1 = sel.i1; cursor.y1 = sel.j1;
    cursor.x2 = sel.i2; cursor.y2 = sel.j2;
}


// ---- Pegplan transforms (Invert / Mirror / Delete) -----------------
//
// All three operate on the active pattern extent (min_x..max_x ×
// min_y..max_y) and touch the pegplan AND weave grids in lockstep,
// matching desktop SpInvertClick / SpSpiegelnClick (→ TfSpiegelnClick) /
// ClearSchlagpatroneClick (→ ClearTrittfolgeClick). Atomically undoable.

function _pegplanCommand(label, mutate) {
    if (readonly) return;
    const pegBefore   = pattern.pegplan.data.slice();
    const weaveBefore = pattern.weave.data.slice();
    const before = {
        peg: pegBefore, weave: weaveBefore,
        min_x: pattern.min_x, max_x: pattern.max_x,
        min_y: pattern.min_y, max_y: pattern.max_y,
    };
    mutate();
    pattern.recalc_weave_extent();
    pattern.calcRapport();
    const after = {
        peg: pattern.pegplan.data.slice(),
        weave: pattern.weave.data.slice(),
        min_x: pattern.min_x, max_x: pattern.max_x,
        min_y: pattern.min_y, max_y: pattern.max_y,
    };
    // Restore before state so commandBus.execute applies it forward.
    pattern.pegplan.data = pegBefore.slice();
    pattern.weave.data   = weaveBefore.slice();
    pattern.min_x = before.min_x; pattern.max_x = before.max_x;
    pattern.min_y = before.min_y; pattern.max_y = before.max_y;
    pattern.calcRapport();
    const finalize = () => { setModified(); view.draw(); };
    const restore = (s) => {
        pattern.pegplan.data = s.peg.slice();
        pattern.weave.data   = s.weave.slice();
        pattern.min_x = s.min_x; pattern.max_x = s.max_x;
        pattern.min_y = s.min_y; pattern.max_y = s.max_y;
        pattern.calcRapport();
    };
    const cmd = {
        label,
        apply()  { restore(after);  finalize(); },
        revert() { restore(before); finalize(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else cmd.apply();
}

// The pegplan transforms themselves are in weave/transforms.js.

export function _pegplanInvert() {
    _pegplanCommand("pegplan invert",
                    () => invertPegplan(pattern, settings.current_range));
}

export function _pegplanMirror() {
    _pegplanCommand("pegplan mirror", () => mirrorPegplan(pattern));
}

export function _pegplanClear() {
    _pegplanCommand("pegplan clear", () => clearPegplan(pattern));
}


// ---- Rapport extension (F8) / reduction (F7) — weave/transforms.js --

function _rapportKette(rx, withColors) {
    repeatWarp(pattern, rx, { withColors });
}

function _rapportSchuss(ry, withColors) {
    repeatWeft(pattern, ry,
               { withColors, pegplan: !!settings.display_pegplan });
}

// Helpers to read the cursor-based insertion indices.
export function _cursorShaftIndex() { return Math.max(0, cursor.y1); }
export function _cursorTreadleIndex() { return Math.max(0, cursor.x1); }
export function _cursorWarpIndex() { return Math.max(0, cursor.x1); }
export function _cursorWeftIndex() { return Math.max(0, cursor.y1); }

// Which panes let a given structural op make sense?
export const _SHAFT_PARTS = { entering: 1, tieup: 1 };
export const _TREADLE_PARTS = { treadling: 1, tieup: 1 };
export const _WARP_PARTS = { weave: 1, entering: 1, color_warp: 1, reed: 1 };
export const _WEFT_PARTS = { weave: 1, treadling: 1, color_weft: 1 };

// Undo commands over the whole DB-WEAVE pattern: snapshots of every
// grid (optionally with the dimensions), and command helpers that run a
// mutation, capture the state before and after, and push one
// apply / revert pair onto the editor's CommandBus.

import { data, setModified } from "../ui/common.js";
import { commandBus, pattern, readonly, view } from "./state.js";

export function _fullPatternSnapshot() {
    return {
        entering:   pattern.entering.data.slice(),
        weave:      pattern.weave.data.slice(),
        treadling:  pattern.treadling.data.slice(),
        tieup:      pattern.tieup.data.slice(),
        pegplan:    pattern.pegplan.data.slice(),
        color_warp: pattern.color_warp.data.slice(),
        color_weft: pattern.color_weft.data.slice(),
        reed:       pattern.reed.data.slice(),
        fixeinzug:  pattern.fixeinzug.slice(),
        fixsize:    pattern.fixsize,
        firstfree:  pattern.firstfree,
        min_x: pattern.min_x, max_x: pattern.max_x,
        min_y: pattern.min_y, max_y: pattern.max_y,
    };
}
export function _restoreFullPatternSnapshot(s) {
    pattern.entering.data   = s.entering.slice();
    pattern.weave.data      = s.weave.slice();
    pattern.treadling.data  = s.treadling.slice();
    pattern.tieup.data      = s.tieup.slice();
    pattern.pegplan.data    = s.pegplan.slice();
    pattern.color_warp.data = s.color_warp.slice();
    pattern.color_weft.data = s.color_weft.slice();
    pattern.reed.data       = s.reed.slice();
    if (s.fixeinzug) pattern.fixeinzug = s.fixeinzug.slice();
    if (typeof s.fixsize === "number") pattern.fixsize = s.fixsize;
    if (typeof s.firstfree === "number") pattern.firstfree = s.firstfree;
    pattern.min_x = s.min_x; pattern.max_x = s.max_x;
    pattern.min_y = s.min_y; pattern.max_y = s.max_y;
}

// Snapshot variant that also captures dimensions and the per-grid sizes,
// for resize commands. _restoreDimsSnapshot rebuilds each grid at the
// stored dims and refills its data, then mirrors the dims into `data` so
// savePatternData iterates over the right ranges.
function _patternDimsSnapshot() {
    return {
        width:        pattern.weave.width,
        height:       pattern.weave.height,
        max_shafts:   pattern.tieup.height,
        max_treadles: pattern.tieup.width,
        entering:     pattern.entering.data.slice(),
        weave:        pattern.weave.data.slice(),
        treadling:    pattern.treadling.data.slice(),
        tieup:        pattern.tieup.data.slice(),
        pegplan:      pattern.pegplan.data.slice(),
        color_warp:   pattern.color_warp.data.slice(),
        color_weft:   pattern.color_weft.data.slice(),
        empty_warp:   pattern.empty_warp.data.slice(),
        empty_weft:   pattern.empty_weft.data.slice(),
        reed:         pattern.reed.data.slice(),
        fixeinzug:    pattern.fixeinzug.slice(),
        fixsize:      pattern.fixsize,
        firstfree:    pattern.firstfree,
        min_x: pattern.min_x, max_x: pattern.max_x,
        min_y: pattern.min_y, max_y: pattern.max_y,
    };
}

function _restorePatternDims(s) {
    pattern.weave.width      = s.width;       pattern.weave.height      = s.height;       pattern.weave.data      = s.weave.slice();
    pattern.color_warp.width = s.width;       pattern.color_warp.height = 1;              pattern.color_warp.data = s.color_warp.slice();
    pattern.empty_warp.width = s.width;       pattern.empty_warp.height = 1;              pattern.empty_warp.data = s.empty_warp.slice();
    pattern.color_weft.width = 1;             pattern.color_weft.height = s.height;       pattern.color_weft.data = s.color_weft.slice();
    pattern.empty_weft.width = 1;             pattern.empty_weft.height = s.height;       pattern.empty_weft.data = s.empty_weft.slice();
    pattern.reed.width       = s.width;       pattern.reed.height       = 1;              pattern.reed.data       = s.reed.slice();
    pattern.entering.width   = s.width;       pattern.entering.height   = s.max_shafts;   pattern.entering.data   = s.entering.slice();
    pattern.tieup.width      = s.max_treadles; pattern.tieup.height     = s.max_shafts;   pattern.tieup.data      = s.tieup.slice();
    pattern.treadling.width  = s.max_treadles; pattern.treadling.height = s.height;       pattern.treadling.data  = s.treadling.slice();
    pattern.pegplan.width    = s.max_shafts;  pattern.pegplan.height    = s.height;       pattern.pegplan.data    = s.pegplan.slice();
    pattern.fixeinzug = s.fixeinzug.slice();
    pattern.fixsize   = s.fixsize;
    pattern.firstfree = s.firstfree;
    pattern.min_x = s.min_x; pattern.max_x = s.max_x;
    pattern.min_y = s.min_y; pattern.max_y = s.max_y;
    if (data) {
        data.width        = s.width;
        data.height       = s.height;
        data.max_shafts   = s.max_shafts;
        data.max_treadles = s.max_treadles;
        // Resize the flat arrays so savePatternData's index-based writes
        // never run off the end. Their contents are rebuilt from the
        // pattern grids on save, so zero-fill is fine here.
        data.data_entering  = new Array(s.width).fill(0);
        data.data_reed      = new Array(s.width).fill(0);
        data.colors_warp    = new Array(s.width).fill(0);
        data.colors_weft    = new Array(s.height).fill(0);
        data.data_treadling = new Array(s.max_treadles * s.height).fill(0);
        data.data_tieup     = new Array(s.max_treadles * s.max_shafts).fill(0);
        data.data_pegplan   = new Array(s.max_shafts * s.height).fill(0);
    }
}

// Resize the active pattern. Wrapped as one undoable command; layout is
// re-run on apply/revert so scrollbars + visible-extent caps update.
export function _resizePatternCommand(newW, newH, newMS, newMT) {
    if (readonly) return false;
    const cw  = pattern.weave.width;
    const ch  = pattern.weave.height;
    const cms = pattern.tieup.height;
    const cmt = pattern.tieup.width;
    if (newW === cw && newH === ch && newMS === cms && newMT === cmt) {
        return false;
    }
    const before = _patternDimsSnapshot();
    pattern.resize(newW, newH, newMS, newMT);
    pattern.recalc_weave();
    const after = _patternDimsSnapshot();
    _restorePatternDims(before);
    const finalize = () => {
        setModified();
        if (view) {
            view.layout();
            view.draw();
        }
    };
    const cmd = {
        label: "resize pattern",
        apply()  { _restorePatternDims(after);  finalize(); },
        revert() { _restorePatternDims(before); finalize(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else cmd.apply();
    return true;
}

// Wrap a mutation that changes pattern structure as one undoable command.
export function _structuralCommand(label, mutate) {
    const before = _fullPatternSnapshot();
    mutate();
    pattern.recalc_weave();
    const after = _fullPatternSnapshot();
    _restoreFullPatternSnapshot(before);
    const finalize = () => { setModified(); view.draw(); };
    const cmd = {
        label,
        apply()  { _restoreFullPatternSnapshot(after);  finalize(); },
        revert() { _restoreFullPatternSnapshot(before); finalize(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else { cmd.apply(); }
}


// Generic snapshot-command helper for non-grid mutations (settings,
// metadata). `capture` returns a plain-object snapshot of the touched
// fields; `restore` writes one back. `mutate` performs the change in
// place; `finalize` (optional) runs after every apply/revert (e.g. to
// relayout, redraw, refresh dialogs). Used by the properties dialog,
// the Optionen dialog, the Grundeinstellung presets and the
// Schuss-/Kettverhältnis dialog so all of those become undoable.
export function _snapshotCommand(label, capture, restore, mutate, finalize) {
    if (readonly) return;
    const before = capture();
    mutate();
    const after = capture();
    restore(before);
    const cmd = {
        label,
        apply()  { restore(after);  if (finalize) finalize(); setModified(); },
        revert() { restore(before); if (finalize) finalize(); setModified(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else cmd.apply();
}

// Snapshot+command helper for full-pattern multi-grid mutations. The
// mutate callback is responsible for any recalc needed; the helper just
// snapshots before and after and pushes one apply/revert pair.
export function _fullSnapCommand(label, mutate) {
    if (readonly) return;
    const before = _fullPatternSnapshot();
    mutate();
    pattern.calcRapport();
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

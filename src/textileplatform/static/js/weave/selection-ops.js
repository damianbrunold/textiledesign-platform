// Operations on the selection (ui/selection.js tracks it): clear,
// invert, rotate, mirror, roll, slope, central symmetry, swapping the
// tie-up sides, and cut / copy / paste.

import {
    makeGridRegionCommand, restoreEntering, restoreGridRegion,
    snapshotEntering, snapshotGridRegion,
} from "../ui/commands.js";
import { setModified } from "../ui/common.js";
import { Clipboard, Selection } from "../ui/selection.js";
import { save_part_position, updateSelectionIcons } from "./cursor.js";
import { _recalcFor } from "./edits.js";
import {
    commandBus, cursor, pattern, readonly, settings, view,
} from "./state.js";

export function _selBounds() {
    const i1 = Math.min(cursor.x1, cursor.x2);
    const i2 = Math.max(cursor.x1, cursor.x2);
    const j1 = Math.min(cursor.y1, cursor.y2);
    const j2 = Math.max(cursor.y1, cursor.y2);
    return { i1, i2, j1, j2 };
}

// _recalcAfterMutation: trigger the right recalc path based on which pane
// the mutation happened in, and redraw.
function _afterPatternMutation(part) {
    if (part === "weave") pattern.recalc_from_weave(settings);
    else pattern.recalc_weave();
    setModified();
    view.draw();
}

// Dispatch a snapshot-backed mutation as an undoable command.
export function _runSelectionCommand(label, grid, mutate) {
    const { i1, i2, j1, j2 } = _selBounds();
    const part = cursor.selected_part;
    if (!commandBus) { mutate(); _afterPatternMutation(part); return; }
    const cmd = makeGridRegionCommand({
        grid, i1, j1, i2, j2,
        mutate,
        afterApply: () => _afterPatternMutation(part),
        label,
    });
    commandBus.execute(cmd);
}

export function selectionClear() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("clear", grid, () => grid.clearRange(i1, j1, i2, j2));
}

export function selectionInvert() {
    const { i1, i2, j1, j2 } = _selBounds();
    if (cursor.selected_part === "weave") {
        _runSelectionCommand("invert", pattern.weave,
            () => pattern.weave.invertRange(i1, j1, i2, j2, settings.current_range));
    } else if (cursor.selected_part === "tieup") {
        _runSelectionCommand("invert", pattern.tieup,
            () => pattern.tieup.invertRange(i1, j1, i2, j2, settings.current_range));
    }
}

export function selectionRotate() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("rotate", grid, () => grid.rotateRight(i1, j1, i2, j2));
}

export function selectionMirrorV() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("mirror-v", grid, () => grid.mirrorV(i1, j1, i2, j2));
}

export function selectionMirrorH() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("mirror-h", grid, () => grid.mirrorH(i1, j1, i2, j2));
}

export function selectionRollUp() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("roll-up", grid, () => grid.rollUp(i1, j1, i2, j2));
}
export function selectionRollDown() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("roll-down", grid, () => grid.rollDown(i1, j1, i2, j2));
}
export function selectionRollLeft() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("roll-left", grid, () => grid.rollLeft(i1, j1, i2, j2));
}
export function selectionRollRight() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("roll-right", grid, () => grid.rollRight(i1, j1, i2, j2));
}

export function selectionSlopeIncrease() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("slope-inc", grid, () => grid.slopeIncrease(i1, j1, i2, j2));
}
export function selectionSlopeDecrease() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("slope-dec", grid, () => grid.slopeDecrease(i1, j1, i2, j2));
}

export function selectionCentralSymmetry() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    const part = cursor.selected_part;
    // The algorithm either does nothing (already symmetric OR no symmetric
    // shift exists) or applies a specific cyclic shift. Avoid pushing a
    // no-op command onto the undo stack by capturing the before/after
    // snapshots ourselves.
    const before = snapshotGridRegion(grid, i1, j1, i2, j2);
    const result = grid.centralSymmetry(i1, j1, i2, j2);
    if (result !== "applied") {
        // Either already symmetric or no shift exists — nothing changed.
        return;
    }
    const after = snapshotGridRegion(grid, i1, j1, i2, j2);
    restoreGridRegion(grid, before);
    const afterApply = () => _afterPatternMutation(part);
    const cmd = {
        label: "central-symmetry",
        apply()  { restoreGridRegion(grid, after);  afterApply(); },
        revert() { restoreGridRegion(grid, before); afterApply(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else cmd.apply();
}

// Tie-up specific: mirror the entire tie-up matrix horizontally. This is the
// desktop's "Swap Sides" operation — commonly used to flip from Z to S style.
export function tieupSwapSides() {
    if (readonly) return;
    const g = pattern.tieup;
    const w = g.width, h = g.height;
    const mutate = () => g.mirrorH(0, 0, w - 1, h - 1);
    const afterApply = _recalcFor("weave_recalc");
    if (!commandBus) { mutate(); afterApply(); return; }
    commandBus.execute(makeGridRegionCommand({
        grid: g, i1: 0, j1: 0, i2: w - 1, j2: h - 1,
        mutate, afterApply, label: "tieup swap sides",
    }));
}

// Cut / Copy / Paste — uses Selection + Clipboard modules from selection.js.
//
// After a copy, the cursor advances to just past the copied range — to the
// right for most fields, below for treadling/color_weft. This matches the
// desktop CopySelection(_movecursor=true) path: cursor moves while
// selection collapses (the web model unifies cursor + selection in the
// (x1,y1)-(x2,y2) pair, so we collapse to a single cell at the new spot).
function _moveCursorAfterCopy() {
    if (Selection.isEmpty(cursor)) return;
    const sel = Selection.current(cursor);
    if (!sel) return;
    const part = sel.part;
    const grid = cursor.selected_pattern;
    const w = grid && grid.width !== undefined ? grid.width : Infinity;
    const h = grid && grid.height !== undefined ? grid.height : Infinity;
    let x, y;
    if (part === "treadling" || part === "color_weft") {
        x = sel.i1;
        y = Math.min(sel.j2 + 1, h - 1);
    } else {
        x = Math.min(sel.i2 + 1, w - 1);
        y = sel.j1;
    }
    cursor.x1 = cursor.x2 = x;
    cursor.y1 = cursor.y2 = y;
    updateSelectionIcons();
    save_part_position();
    if (view.draw) view.draw();
}

export function selectionCopy() {
    if (Selection.isEmpty(cursor)) return;
    Selection.copyToClipboard(cursor, pattern);
    _moveCursorAfterCopy();
}

export function selectionCut() {
    if (Selection.isEmpty(cursor)) return;
    Selection.copyToClipboard(cursor, pattern);
    selectionClear();
}

function _paste(transparent) {
    if (!Clipboard.has()) return;
    const sel = Selection.current(cursor);
    if (!sel) return;
    // Build a command that captures the destination region's before-state.
    const payload = Clipboard.get();
    const grid = cursor.selected_pattern;
    const i1 = sel.i1, j1 = sel.j1;
    let i2 = i1 + payload.w - 1;
    let j2 = j1 + payload.h - 1;
    // Clamp to grid bounds where applicable.
    if (grid && grid.width !== undefined) i2 = Math.min(i2, grid.width - 1);
    if (grid && grid.height !== undefined) j2 = Math.min(j2, grid.height - 1);
    const part = cursor.selected_part;
    if (!commandBus) {
        Selection.pasteFromClipboard(cursor, pattern, transparent);
        _afterPatternMutation(part);
        return;
    }
    if (part === "entering") {
        const snap = snapshotEntering(pattern.entering, i1, i2);
        commandBus.execute({
            label: transparent ? "paste-transparent" : "paste",
            apply() { Selection.pasteFromClipboard(cursor, pattern, transparent); _afterPatternMutation(part); },
            revert() { restoreEntering(pattern.entering, snap); _afterPatternMutation(part); },
        });
    } else if (grid && grid.get && grid.set) {
        const snap = snapshotGridRegion(grid, i1, j1, i2, j2);
        commandBus.execute({
            label: transparent ? "paste-transparent" : "paste",
            apply() { Selection.pasteFromClipboard(cursor, pattern, transparent); _afterPatternMutation(part); },
            revert() { restoreGridRegion(grid, snap); _afterPatternMutation(part); },
        });
    }
}
export function selectionPaste() { _paste(false); }
export function selectionPasteTransparent() { _paste(true); }

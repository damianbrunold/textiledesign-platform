"use strict";

// CommandBus — undo/redo infrastructure for the weave editor.
//
// A Command is an object with:
//   { label, apply(), revert() }
// `apply` performs the mutation, `revert` undoes it. Commands are pushed onto
// the undo stack by CommandBus.execute(); a subsequent execute() clears redo.
//
// Most mutations will use the SnapshotCommand helper: it captures the before
// state of a grid region and applies a mutator callback, then on revert restores
// the captured snapshot. This keeps memory predictable (no full pattern clones)
// while keeping the call sites trivial.

class CommandBus {
    constructor(limit = 200) {
        this.undoStack = [];
        this.redoStack = [];
        this.limit = limit;
        this.listeners = [];
    }

    execute(cmd) {
        cmd.apply();
        this.undoStack.push(cmd);
        if (this.undoStack.length > this.limit) this.undoStack.shift();
        this.redoStack.length = 0;
        this._notify();
    }

    undo() {
        const cmd = this.undoStack.pop();
        if (!cmd) return false;
        cmd.revert();
        this.redoStack.push(cmd);
        this._notify();
        return true;
    }

    redo() {
        const cmd = this.redoStack.pop();
        if (!cmd) return false;
        cmd.apply();
        this.undoStack.push(cmd);
        this._notify();
        return true;
    }

    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }

    clear() {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
        this._notify();
    }

    subscribe(fn) {
        this.listeners.push(fn);
        return () => {
            const idx = this.listeners.indexOf(fn);
            if (idx >= 0) this.listeners.splice(idx, 1);
        };
    }

    _notify() {
        for (const fn of this.listeners) {
            try { fn(this); } catch (e) { console.error(e); }
        }
    }
}

// Snapshot a rectangular region of a Grid-like object (supports get(i,j) and
// set(i,j,value)). Returns an opaque snapshot; use restoreGridRegion to revert.
function snapshotGridRegion(grid, i1, j1, i2, j2) {
    const cells = [];
    for (let j = j1; j <= j2; j++) {
        for (let i = i1; i <= i2; i++) {
            cells.push(grid.get(i, j));
        }
    }
    return { i1, j1, i2, j2, cells };
}

function restoreGridRegion(grid, snapshot) {
    let k = 0;
    for (let j = snapshot.j1; j <= snapshot.j2; j++) {
        for (let i = snapshot.i1; i <= snapshot.i2; i++) {
            grid.set(i, j, snapshot.cells[k++]);
        }
    }
}

// Snapshot a 1D Entering-like object with get_shaft/set_shaft.
function snapshotEntering(entering, i1, i2) {
    const shafts = [];
    for (let i = i1; i <= i2; i++) shafts.push(entering.get_shaft(i));
    return { i1, i2, shafts };
}

function restoreEntering(entering, snapshot) {
    let k = 0;
    for (let i = snapshot.i1; i <= snapshot.i2; i++) {
        entering.set_shaft(i, snapshot.shafts[k++]);
    }
}

// Convenience command factory: captures a grid region snapshot, runs a mutator,
// and auto-generates revert. `onApply` is also called on redo.
function makeGridRegionCommand(opts) {
    const { grid, i1, j1, i2, j2, mutate, afterApply, label } = opts;
    let beforeSnap = null;
    let afterSnap = null;
    return {
        label: label || "edit",
        apply() {
            if (beforeSnap === null) {
                beforeSnap = snapshotGridRegion(grid, i1, j1, i2, j2);
                mutate();
                afterSnap = snapshotGridRegion(grid, i1, j1, i2, j2);
            } else {
                restoreGridRegion(grid, afterSnap);
            }
            if (afterApply) afterApply();
        },
        revert() {
            restoreGridRegion(grid, beforeSnap);
            if (afterApply) afterApply();
        },
    };
}

// Single-cell toggle helper: captures old value, applies new value, revert
// restores old. `afterApply` is invoked both on apply and revert (e.g., to
// trigger recalc + redraw).
function makeCellCommand(opts) {
    const { grid, i, j, newValue, afterApply, label } = opts;
    let oldValue = null;
    return {
        label: label || "set cell",
        apply() {
            oldValue = grid.get(i, j);
            grid.set(i, j, newValue);
            if (afterApply) afterApply();
        },
        revert() {
            grid.set(i, j, oldValue);
            if (afterApply) afterApply();
        },
    };
}

// Shaft assignment command for the Entering (1D threading) structure.
function makeEnteringCommand(opts) {
    const { entering, i, newShaft, afterApply, label } = opts;
    let oldShaft = null;
    return {
        label: label || "set shaft",
        apply() {
            oldShaft = entering.get_shaft(i);
            entering.set_shaft(i, newShaft);
            if (afterApply) afterApply();
        },
        revert() {
            entering.set_shaft(i, oldShaft);
            if (afterApply) afterApply();
        },
    };
}

// Module-global command bus; created by the editor at init time.
let commandBus = null;

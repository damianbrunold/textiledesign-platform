import { describe, expect, it, vi } from "vitest";
import {
    CommandBus, makeCellCommand, makeEnteringCommand, makeGridRegionCommand,
    restoreEntering, restoreGridRegion, snapshotEntering, snapshotGridRegion,
} from "../../src/textileplatform/static/js/ui/commands.js";


// A command that pushes/pops a marker on a log, so tests can see the
// order of apply / revert calls.
function cmd(log, name) {
    return {
        label: name,
        apply: () => log.push(`+${name}`),
        revert: () => log.push(`-${name}`),
    };
}

// A minimal Grid-like object (get/set over a w × h array).
function fakeGrid(w, h, fill = 0) {
    const data = new Array(w * h).fill(fill);
    return {
        width: w, height: h, data,
        get: (i, j) => data[i + j * w],
        set: (i, j, v) => { data[i + j * w] = v; },
    };
}

function fakeEntering(shafts) {
    const data = [...shafts];
    return {
        data,
        get_shaft: (i) => data[i],
        set_shaft: (i, s) => { data[i] = s; },
    };
}


describe("CommandBus", () => {
    it("starts empty and at the saved state", () => {
        const bus = new CommandBus();
        expect(bus.canUndo()).toBe(false);
        expect(bus.canRedo()).toBe(false);
        expect(bus.top()).toBe(null);
        expect(bus.isAtSavedState()).toBe(true);
    });

    it("applies on execute and reverts on undo, in stack order", () => {
        const bus = new CommandBus();
        const log = [];
        bus.execute(cmd(log, "a"));
        bus.execute(cmd(log, "b"));
        expect(bus.undo()).toBe(true);
        expect(bus.undo()).toBe(true);
        expect(bus.undo()).toBe(false);
        expect(log).toEqual(["+a", "+b", "-b", "-a"]);
    });

    it("re-applies on redo", () => {
        const bus = new CommandBus();
        const log = [];
        bus.execute(cmd(log, "a"));
        bus.undo();
        expect(bus.canRedo()).toBe(true);
        expect(bus.redo()).toBe(true);
        expect(bus.redo()).toBe(false);
        expect(log).toEqual(["+a", "-a", "+a"]);
        expect(bus.canUndo()).toBe(true);
    });

    it("drops the redo stack on a new command", () => {
        const bus = new CommandBus();
        const log = [];
        bus.execute(cmd(log, "a"));
        bus.undo();
        bus.execute(cmd(log, "b"));
        expect(bus.canRedo()).toBe(false);
    });

    it("keeps at most `limit` commands", () => {
        const bus = new CommandBus(3);
        const log = [];
        for (const n of ["a", "b", "c", "d"]) bus.execute(cmd(log, n));
        expect(bus.undoStack.map((c) => c.label)).toEqual(["b", "c", "d"]);
        while (bus.undo());
        expect(log.slice(4)).toEqual(["-d", "-c", "-b"]);
    });

    describe("saved-state tracking", () => {
        it("is unsaved after an edit and saved again after undoing it",
            () => {
                const bus = new CommandBus();
                bus.execute(cmd([], "a"));
                expect(bus.isAtSavedState()).toBe(false);
                bus.undo();
                expect(bus.isAtSavedState()).toBe(true);
            });

        it("follows markSaved through undo and redo", () => {
            const bus = new CommandBus();
            bus.execute(cmd([], "a"));
            bus.execute(cmd([], "b"));
            bus.markSaved();
            expect(bus.isAtSavedState()).toBe(true);
            bus.undo();
            expect(bus.isAtSavedState()).toBe(false);
            bus.redo();
            expect(bus.isAtSavedState()).toBe(true);
        });

        it("accepts an explicit stack position (save raced an edit)",
            () => {
                const bus = new CommandBus();
                const a = cmd([], "a");
                bus.execute(a);
                bus.execute(cmd([], "b"));
                bus.markSaved(a);
                expect(bus.isAtSavedState()).toBe(false);
                bus.undo();
                expect(bus.isAtSavedState()).toBe(true);
            });

        it("can never reach the saved state after markUnsaved", () => {
            const bus = new CommandBus();
            bus.markUnsaved();
            expect(bus.isAtSavedState()).toBe(false);
            bus.execute(cmd([], "a"));
            bus.undo();
            expect(bus.isAtSavedState()).toBe(false);
        });

        it("becomes unreachable when the pristine bottom is dropped", () => {
            const bus = new CommandBus(2);
            for (const n of ["a", "b", "c"]) bus.execute(cmd([], n));
            while (bus.undo());
            expect(bus.isAtSavedState()).toBe(false);
            expect(bus.savedMark).toBe(CommandBus.UNREACHABLE);
        });

        it("becomes unreachable when the saved command is dropped", () => {
            const bus = new CommandBus(2);
            bus.execute(cmd([], "a"));
            bus.markSaved();
            bus.execute(cmd([], "b"));
            bus.execute(cmd([], "c"));
            while (bus.undo());
            expect(bus.isAtSavedState()).toBe(false);
        });

        it("keeps a saved mark that is still on the stack", () => {
            const bus = new CommandBus(2);
            bus.execute(cmd([], "a"));
            bus.execute(cmd([], "b"));
            bus.markSaved();
            bus.execute(cmd([], "c"));
            bus.undo();
            expect(bus.isAtSavedState()).toBe(true);
        });

        it("resets history and the saved state on clear", () => {
            const bus = new CommandBus();
            bus.execute(cmd([], "a"));
            bus.undo();
            bus.markUnsaved();
            bus.clear();
            expect(bus.canUndo()).toBe(false);
            expect(bus.canRedo()).toBe(false);
            expect(bus.isAtSavedState()).toBe(true);
        });
    });

    describe("listeners", () => {
        it("are notified on every change and can unsubscribe", () => {
            const bus = new CommandBus();
            const fn = vi.fn();
            const unsubscribe = bus.subscribe(fn);
            bus.execute(cmd([], "a"));
            bus.undo();
            bus.redo();
            bus.clear();
            expect(fn).toHaveBeenCalledTimes(4);
            expect(fn).toHaveBeenLastCalledWith(bus);
            unsubscribe();
            unsubscribe();  // a second call is harmless
            bus.execute(cmd([], "b"));
            expect(fn).toHaveBeenCalledTimes(4);
        });

        it("are not notified by a no-op undo / redo", () => {
            const bus = new CommandBus();
            const fn = vi.fn();
            bus.subscribe(fn);
            bus.undo();
            bus.redo();
            expect(fn).not.toHaveBeenCalled();
        });

        it("are isolated from each other's exceptions", () => {
            const error = vi.spyOn(console, "error")
                .mockImplementation(() => {});
            const bus = new CommandBus();
            const second = vi.fn();
            bus.subscribe(() => { throw new Error("boom"); });
            bus.subscribe(second);
            bus.execute(cmd([], "a"));
            expect(second).toHaveBeenCalledOnce();
            expect(error).toHaveBeenCalledOnce();
            error.mockRestore();
        });
    });
});

describe("snapshots", () => {
    it("restore a grid region", () => {
        const grid = fakeGrid(4, 3);
        grid.data.forEach((_, k) => { grid.data[k] = k; });
        const before = [...grid.data];
        const snap = snapshotGridRegion(grid, 1, 0, 2, 1);
        expect(snap.cells).toEqual([1, 2, 5, 6]);
        grid.data.fill(9);
        restoreGridRegion(grid, snap);
        expect(grid.data).toEqual(
            [9, 1, 2, 9, 9, 5, 6, 9, 9, 9, 9, 9]);
        expect(before[1]).toBe(1);
    });

    it("restore an entering range", () => {
        const entering = fakeEntering([1, 2, 3, 4]);
        const snap = snapshotEntering(entering, 1, 2);
        entering.data.fill(0);
        restoreEntering(entering, snap);
        expect(entering.data).toEqual([0, 2, 3, 0]);
    });
});

describe("command factories", () => {
    it("makeGridRegionCommand mutates once and replays the result", () => {
        const bus = new CommandBus();
        const grid = fakeGrid(3, 3);
        let calls = 0;
        const afterApply = vi.fn();
        bus.execute(makeGridRegionCommand({
            grid, i1: 0, j1: 0, i2: 1, j2: 1,
            mutate: () => {
                calls++;
                grid.set(0, 0, calls);
                grid.set(1, 1, 7);
            },
            afterApply,
        }));
        expect(grid.data).toEqual([1, 0, 0, 0, 7, 0, 0, 0, 0]);
        bus.undo();
        expect(grid.data).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
        bus.redo();
        // Redo restores the captured after-state instead of mutating
        // again (the mutator may not be repeatable).
        expect(calls).toBe(1);
        expect(grid.data).toEqual([1, 0, 0, 0, 7, 0, 0, 0, 0]);
        expect(afterApply).toHaveBeenCalledTimes(3);
        expect(bus.top().label).toBe("edit");
    });

    it("makeCellCommand sets and restores one cell", () => {
        const bus = new CommandBus();
        const grid = fakeGrid(2, 2, 3);
        bus.execute(makeCellCommand({
            grid, i: 1, j: 0, newValue: 5, label: "toggle",
        }));
        expect(grid.get(1, 0)).toBe(5);
        expect(bus.top().label).toBe("toggle");
        bus.undo();
        expect(grid.get(1, 0)).toBe(3);
    });

    it("makeEnteringCommand sets and restores one shaft", () => {
        const bus = new CommandBus();
        const entering = fakeEntering([1, 2, 3]);
        const afterApply = vi.fn();
        bus.execute(makeEnteringCommand({
            entering, i: 2, newShaft: 8, afterApply,
        }));
        expect(entering.data).toEqual([1, 2, 8]);
        expect(bus.top().label).toBe("set shaft");
        bus.undo();
        expect(entering.data).toEqual([1, 2, 3]);
        expect(afterApply).toHaveBeenCalledTimes(2);
    });
});

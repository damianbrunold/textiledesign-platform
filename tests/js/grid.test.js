import { beforeAll, describe, expect, it } from "vitest";
import { loadEditor } from "./helpers/load.js";

// Grid and Entering from dbweave.js: the data structures behind every
// pane of the weave editor.

let run;

beforeAll(() => {
    ({ run } = loadEditor("dbweave"));
});

// Build a grid from rows of digits (row j = 0 first) and read it back.
function grid(lines) {
    const g = run(`new Grid(${lines[0].length}, ${lines.length})`);
    lines.forEach((line, j) => [...line].forEach((ch, i) => {
        g.set(i, j, Number(ch));
    }));
    return g;
}

function rows(g) {
    const out = [];
    for (let j = 0; j < g.height; j++) {
        let s = "";
        for (let i = 0; i < g.width; i++) s += g.get(i, j);
        out.push(s);
    }
    return out;
}

function entering(shafts, maxShafts = 4) {
    const e = run(`new Entering(${shafts.length}, ${maxShafts})`);
    shafts.forEach((s, i) => e.set_shaft(i, s));
    return e;
}

describe("Grid", () => {
    it("stores cells row-major and toggles to the given value", () => {
        const g = run("new Grid(3, 2)");
        g.set(2, 1, 4);
        expect(g.data[5]).toBe(4);
        g.toggle(0, 0);
        g.toggle(1, 0, 3);
        expect(rows(g)).toEqual(["130", "004"]);
        g.toggle(1, 0);  // set cells toggle to their negative ("off")
        expect(g.get(1, 0)).toBe(-3);
    });

    it("compares rows and columns, treating negatives as empty", () => {
        const g = grid(["10", "10", "00"]);
        g.set(1, 2, -2);
        expect(g.rowsEqual(0, 1)).toBe(true);
        expect(g.rowsEqual(1, 2)).toBe(false);
        expect(g.colsEqual(0, 1)).toBe(false);
        g.set(0, 0, 0); g.set(0, 1, 0);
        expect(g.colsEqual(0, 1)).toBe(true);
        expect(g.isRowEmpty(2)).toBe(true);
        expect(g.isColEmpty(1)).toBe(true);
        expect(g.isColEmpty(0)).toBe(true);
    });

    it("inserts and removes rows and columns at a fixed size", () => {
        const g = grid(["12", "34", "56"]);
        g.insertRow(1);
        expect(rows(g)).toEqual(["12", "00", "34"]);
        g.removeRow(0);
        expect(rows(g)).toEqual(["00", "34", "00"]);
        g.insertCol(0);
        expect(rows(g)).toEqual(["00", "03", "00"]);
        g.removeCol(0);
        expect(rows(g)).toEqual(["00", "30", "00"]);
    });

    it("resizes keeping the overlap", () => {
        const g = grid(["12", "34"]);
        g.resize(3, 1);
        expect(rows(g)).toEqual(["120"]);
    });

    it("copies and swaps rows and columns", () => {
        const g = grid(["12", "34"]);
        g.swapRows(0, 1);
        expect(rows(g)).toEqual(["34", "12"]);
        g.swapCols(0, 1);
        expect(rows(g)).toEqual(["43", "21"]);
        g.copyRow(0, 1);
        expect(rows(g)).toEqual(["43", "43"]);
        g.copyCol(1, 0);
        expect(rows(g)).toEqual(["33", "33"]);
    });

    it("rolls a region cyclically", () => {
        const g = grid(["123", "456", "789"]);
        g.rollUp(0, 0, 2, 2);
        expect(rows(g)).toEqual(["456", "789", "123"]);
        g.rollDown(0, 0, 2, 2);
        expect(rows(g)).toEqual(["123", "456", "789"]);
        g.rollLeft(0, 0, 2, 0);
        expect(rows(g)[0]).toBe("231");
        g.rollRight(0, 0, 2, 0);
        expect(rows(g)[0]).toBe("123");
    });

    it("slopes rows by their distance from the first", () => {
        const g = grid(["100", "100", "100"]);
        g.slopeIncrease(0, 0, 2, 2);
        expect(rows(g)).toEqual(["100", "010", "001"]);
        g.slopeDecrease(0, 0, 2, 2);
        expect(rows(g)).toEqual(["100", "100", "100"]);
    });

    it("rotates a square region both ways", () => {
        const g = grid(["12", "34"]);
        g.rotateRight(0, 0, 1, 1);
        const right = rows(g);
        g.rotateLeft(0, 0, 1, 1);
        expect(rows(g)).toEqual(["12", "34"]);
        expect(right).not.toEqual(["12", "34"]);
        g.rotateRight(0, 0, 1, 0);  // not square: ignored
        expect(rows(g)).toEqual(["12", "34"]);
    });

    it("finds a central-symmetric shift", () => {
        expect(grid(["10", "01"]).centralSymmetry(0, 0, 1, 1)).toBe("noop");
        const g = grid(["110", "000", "000"]);
        expect(g.centralSymmetry(0, 0, 2, 2)).toBe("applied");
        const r = rows(g);
        for (let j = 0; j < 3; j++) {
            for (let i = 0; i < 3; i++) {
                expect(r[j][i]).toBe(r[2 - j][2 - i]);
            }
        }
        expect(grid(["12", "00"]).centralSymmetry(0, 0, 1, 1)).toBe("none");
    });

    describe("mirror", () => {
        it("mirrorV flips the rows of a region", () => {
            const g = grid(["12", "34", "56"]);
            g.mirrorV(0, 0, 1, 2);
            expect(rows(g)).toEqual(["56", "34", "12"]);
        });

        it("mirrorH flips the columns of a region", () => {
            const g = grid(["123", "456"]);
            g.mirrorH(0, 0, 2, 1);
            expect(rows(g)).toEqual(["321", "654"]);
        });

        it("mirrorV flips a single column", () => {
            const g = grid(["1", "2", "3"]);
            g.mirrorV(0, 0, 0, 2);
            expect(rows(g)).toEqual(["3", "2", "1"]);
        });

        it("mirrorH flips a single row", () => {
            const g = grid(["123"]);
            g.mirrorH(0, 0, 2, 0);
            expect(rows(g)).toEqual(["321"]);
        });

        it("leaves cells outside the region alone", () => {
            const g = grid(["1234", "5678", "9000"]);
            g.mirrorH(1, 0, 2, 1);
            g.mirrorV(3, 0, 3, 1);
            expect(rows(g)).toEqual(["1328", "5764", "9000"]);
        });
    });
});

describe("Entering", () => {
    it("exposes shafts as a one-per-column grid", () => {
        const e = entering([2, 0, 1]);
        expect(e.get(0, 1)).toBe(1);
        expect(e.get(0, 0)).toBe(0);
        e.set(1, 3, 1);
        e.set(0, 0, 0);
        expect([...e.data]).toEqual([0, 4, 1]);
        e.toggle(2, 1);
        expect(e.get_shaft(2)).toBe(2);
        e.toggle(2, 1);  // toggling the set shaft keeps it
        expect(e.get_shaft(2)).toBe(2);
    });

    it("clears only shafts inside the range", () => {
        const e = entering([1, 2, 3, 4]);
        e.clearRange(0, 1, 3, 2);
        expect([...e.data]).toEqual([1, 0, 0, 4]);
    });

    it("inserts, removes and resizes", () => {
        const e = entering([1, 2, 3, 4]);
        e.insertAt(1);
        expect([...e.data]).toEqual([1, 0, 2, 3]);
        e.removeAt(0);
        expect([...e.data]).toEqual([0, 2, 3, 0]);
        e.resize(3, 2);  // shaft 3 no longer exists
        expect([...e.data]).toEqual([0, 2, 0]);
        expect(e.height).toBe(2);
    });

    // Desktop semantics (MirrorHorzSelection / MirrorVertSelection in
    // edit.cpp): horizontally the warps swap, vertically the shafts.
    it("mirrorH swaps warps", () => {
        const e = entering([1, 2, 3, 4, 0]);
        e.mirrorH(0, 0, 3, 0);  // a one-shaft-high selection
        expect([...e.data]).toEqual([4, 3, 2, 1, 0]);
    });

    it("mirrorV reverses the shafts inside the range", () => {
        const e = entering([1, 2, 3, 4]);
        e.mirrorV(0, 0, 0, 2);  // a one-warp-wide selection
        expect([...e.data]).toEqual([3, 2, 3, 4]);
        e.mirrorV(0, 0, 3, 2);
        expect([...e.data]).toEqual([1, 2, 1, 4]);
    });
});

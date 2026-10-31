import { describe, expect, it } from "vitest";
import { Pattern } from "../../src/textileplatform/static/js/bead/model.js";
import {
    arrangeCopies, arrangeUndoRows, resizedData, selectionSource,
    withRowDeleted, withRowInserted,
} from "../../src/textileplatform/static/js/bead/transforms.js";
import { randomSource } from "./helpers/random.js";

function make(rows) {
    const p = new Pattern(rows[0].length, rows.length);
    p.data = rows.join("").split("").map(Number);
    return p;
}

const rows = (p) => Array.from({ length: p.height },
    (_, j) => p.data.slice(j * p.width, (j + 1) * p.width).join(""));

function arrange(p, sel, dx, dy, copies) {
    arrangeCopies(p, sel, selectionSource(p, sel), dx, dy, copies);
}

describe("arrange", () => {
    it("copies the selection at linear offsets", () => {
        const p = make(["1200", "0000"]);
        arrange(p, { i1: 0, j1: 0, i2: 1, j2: 0 }, 2, 0, 1);
        expect(rows(p)).toEqual(["1212", "0000"]);
    });

    it("continues in the next row past the right edge", () => {
        const p = make(["1200", "0000"]);
        arrange(p, { i1: 0, j1: 0, i2: 1, j2: 0 }, 3, 0, 2);
        // copy 1 at linear 3..4, copy 2 at 6..7
        expect(rows(p)).toEqual(["1201", "2012"]);
    });

    it("skips beads beyond the pattern and does nothing for no offset",
        () => {
            const p = make(["0012"]);
            arrange(p, { i1: 2, j1: 0, i2: 3, j2: 0 }, 1, 0, 3);
            expect(rows(p)).toEqual(["0011"]);
            arrange(p, { i1: 0, j1: 0, i2: 0, j2: 0 }, 0, 0, 3);
            arrange(p, { i1: 0, j1: 0, i2: 0, j2: 0 }, 1, 0, 0);
            expect(rows(p)).toEqual(["0011"]);
        });

    it("copies the original beads even where copies overlap them", () => {
        const p = make(["12000"]);
        arrange(p, { i1: 0, j1: 0, i2: 1, j2: 0 }, 1, 0, 2);
        // copy 1 at 1..2 overwrites bead 1, copy 2 still copies "12"
        expect(rows(p)).toEqual(["11120"]);
    });

    it("only changes the rows the undo snapshot covers", () => {
        const rand = randomSource(43);
        for (let n = 0; n < 300; n++) {
            const w = 1 + rand(8), h = 1 + rand(10);
            const p = new Pattern(w, h);
            p.data = Array.from({ length: w * h }, () => rand(4));
            const i1 = rand(w), j1 = rand(h);
            const sel = { i1, j1, i2: Math.min(w - 1, i1 + rand(3)),
                          j2: Math.min(h - 1, j1 + rand(3)) };
            const dx = rand(9) - 4, dy = rand(7) - 3, copies = rand(5);
            const before = [...p.data];
            const r = arrangeUndoRows(p, sel, dx, dy, copies);
            arrange(p, sel, dx, dy, copies);
            for (let j = 0; j < h; j++) {
                if (r && j >= r.j1 && j <= r.j2) continue;
                expect(p.data.slice(j * w, (j + 1) * w), `#${n} row ${j}`)
                    .toEqual(before.slice(j * w, (j + 1) * w));
            }
        }
    });

    it("has no undo rows when there is nothing to do", () => {
        const p = make(["12"]);
        const sel = { i1: 0, j1: 0, i2: 0, j2: 0 };
        expect(arrangeUndoRows(p, sel, 0, 0, 2)).toBe(null);
        expect(arrangeUndoRows(p, sel, 1, 0, 0)).toBe(null);
    });
});

describe("resize and rows", () => {
    it("keeps the overlap when resizing", () => {
        expect(resizedData([1, 2, 3, 4, 5, 6], 3, 2, 2, 3))
            .toEqual([1, 2, 4, 5, 0, 0]);
    });

    it("growing and shrinking back gives the original", () => {
        const data = [1, 2, 3, 4, 5, 6];
        const big = resizedData(data, 3, 2, 5, 4);
        expect(resizedData(big, 5, 4, 3, 2)).toEqual(data);
    });

    it("inserts an empty row, clamped to the pattern", () => {
        const data = [1, 2, 3, 4];   // 2 x 2
        expect(withRowInserted(data, 2, 2, 1)).toEqual([1, 2, 0, 0, 3, 4]);
        expect(withRowInserted(data, 2, 2, -5)).toEqual([0, 0, 1, 2, 3, 4]);
        expect(withRowInserted(data, 2, 2, 9)).toEqual([1, 2, 3, 4, 0, 0]);
    });

    it("deletes a row, but never the last one", () => {
        const data = [1, 2, 3, 4, 5, 6];   // 2 x 3
        expect(withRowDeleted(data, 2, 3, 1)).toEqual([1, 2, 5, 6]);
        expect(withRowDeleted(data, 2, 3, 3)).toBe(null);
        expect(withRowDeleted(data, 2, 3, -1)).toBe(null);
        expect(withRowDeleted([7, 8], 2, 1, 0)).toBe(null);
    });

    it("deleting an inserted row gives the original", () => {
        const rand = randomSource(47);
        for (let n = 0; n < 100; n++) {
            const w = 1 + rand(5), h = 1 + rand(6), j = rand(h + 1);
            const data = Array.from({ length: w * h }, () => rand(5));
            const grown = withRowInserted(data, w, h, j);
            expect(withRowDeleted(grown, w, h + 1, j)).toEqual(data);
        }
    });
});

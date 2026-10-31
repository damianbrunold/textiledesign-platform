import { describe, expect, it } from "vitest";
import {
    BeadList, loadModel, Pattern, storeModel,
} from "../../src/textileplatform/static/js/bead/model.js";
import { randomSource } from "./helpers/random.js";

// Rows bottom-up, as stored in data.model.
function patternFrom(rows) {
    const p = new Pattern(rows[0].length, rows.length);
    loadModel({ model: rows }, p);
    return p;
}

function beadList(rows) {
    const list = new BeadList(patternFrom(rows));
    list.update();
    return list;
}

// Smallest p with seq[k] == seq[k - p] for all k >= p (as
// beadpattern.smallest_period on the server), or seq.length.
function smallestPeriod(seq) {
    for (let p = 1; p < seq.length; p++) {
        if (seq.every((v, k) => k < p || v === seq[k - p])) return p;
    }
    return seq.length;
}

describe("Pattern", () => {
    it("stores beads row by row", () => {
        const p = new Pattern(3, 2);
        p.set(2, 1, 5);
        expect(p.data[5]).toBe(5);
        expect(p.get(2, 1)).toBe(5);
    });

    it("knows its selection", () => {
        const p = new Pattern(4, 4);
        expect(p.inSelection(0, 0)).toBe(false);
        p.selection = { i1: 1, j1: 1, i2: 2, j2: 3 };
        expect(p.inSelection(2, 3)).toBe(true);
        expect(p.inSelection(3, 3)).toBe(false);
    });
});

describe("BeadList", () => {
    it("measures the used height", () => {
        expect(beadList([[0, 0], [0, 1], [0, 0]]).usedHeight).toBe(2);
        expect(beadList([[0, 0], [0, 0]]).usedHeight).toBe(0);
    });

    it("finds the repeat over the used rows", () => {
        // 1 2 1 2 1 2, then an empty row on top
        expect(beadList([[1, 2, 1], [2, 1, 2], [0, 0, 0]]).repeat).toBe(2);
        // no repeat: all used beads
        expect(beadList([[1, 2], [3, 0]]).repeat).toBe(4);
    });

    it("matches the smallest period on random patterns", () => {
        const rand = randomSource(17);
        for (let n = 0; n < 300; n++) {
            const w = 1 + rand(6), h = 1 + rand(8);
            const block = Array.from({ length: 1 + rand(5) }, () => rand(3));
            const rows = Array.from({ length: h }, (_, j) => Array.from(
                { length: w },
                (_, i) => (rand(6) ? block[(j * w + i) % block.length] : rand(3))));
            const list = beadList(rows);
            const used = rows.slice(0, list.usedHeight).flat();
            expect(list.repeat, `#${n}`).toBe(smallestPeriod(used));
        }
    });

    it("lists the repeat as colour runs, last bead first", () => {
        // repeat 1 1 2 3 3 3 (once): read backwards → 3×3, 2×1, 1×2
        const list = beadList([[1, 1, 2], [3, 3, 3]]);
        expect(list.repeat).toBe(6);
        expect(list.list).toEqual([[3, 3], [2, 1], [1, 2]]);
    });

    it("has an empty list for an empty pattern", () => {
        const list = beadList([[0, 0]]);
        expect(list.repeat).toBe(0);
        expect(list.list).toEqual([]);
    });
});

describe("loadModel / storeModel", () => {
    it("round-trips the rows and stores the repeat", () => {
        const rows = [[1, 0, 2], [0, 3, 0]];
        const p = patternFrom(rows);
        const data = { model: [] };
        storeModel(data, p, 4);
        expect(data.model).toEqual(rows);
        expect(data.repeat).toBe(4);
    });

    it("writes the pattern's current size", () => {
        const p = patternFrom([[1, 2], [3, 4]]);
        const data = { model: [[9, 9, 9]], repeat: 3 };
        storeModel(data, p, null);
        expect(data.model).toEqual([[1, 2], [3, 4]]);
        expect("repeat" in data).toBe(false);
    });

    it("drops a repeat that isn't a positive integer", () => {
        const data = {};
        storeModel(data, new Pattern(1, 1), 0);
        expect("repeat" in data).toBe(false);
        storeModel(data, new Pattern(1, 1), 2.5);
        expect("repeat" in data).toBe(false);
    });
});

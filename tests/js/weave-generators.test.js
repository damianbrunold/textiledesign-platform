import { describe, expect, it } from "vitest";
import {
    ATLAS_OFFSETS, completeTwill, stampAtlas, stampTwill,
} from "../../src/textileplatform/static/js/weave/generators.js";
import { Grid } from "../../src/textileplatform/static/js/weave/model.js";

function count(g, { i1 = 0, j1 = 0, i2 = g.width - 1, j2 = g.height - 1 },
               { col, row } = {}) {
    let n = 0;
    for (let j = j1; j <= j2; j++) {
        for (let i = i1; i <= i2; i++) {
            if (col !== undefined && i !== col) continue;
            if (row !== undefined && j !== row) continue;
            if (g.get(i, j) > 0) n++;
        }
    }
    return n;
}

function column(g, i, n, j0 = 0) {
    return Array.from({ length: n }, (_, j) => (g.get(i, j0 + j) > 0 ? 1 : 0));
}

const rotate = (a, k) => a.map((_, j) => a[(j - k + a.length) % a.length]);

describe("stampAtlas", () => {
    for (const n of Object.keys(ATLAS_OFFSETS).map(Number)) {
        it(`satin of ${n} has one cell per row and column`, () => {
            const g = new Grid(n + 3, n + 3);
            const sel = stampAtlas(g, n, 2, 1, 4);
            expect(sel).toEqual({ i1: 2, j1: 1, i2: n + 1, j2: n });
            for (let k = 0; k < n; k++) {
                expect(count(g, sel, { col: 2 + k })).toBe(1);
                expect(count(g, sel, { row: 1 + k })).toBe(1);
            }
            expect(count(g, {})).toBe(n);
            expect(g.get(2, 1 + ATLAS_OFFSETS[n][0])).toBe(4);
        });
    }

    it("clips at the grid edge and shrinks the selection", () => {
        const g = new Grid(4, 4);
        const sel = stampAtlas(g, 5, 1, 1, 1);
        expect(sel).toEqual({ i1: 1, j1: 1, i2: 3, j2: 3 });
        // offsets 0, 2, 4 for the three columns that fit; row 5 is out
        expect([g.get(1, 1), g.get(2, 3)]).toEqual([1, 1]);
        expect(count(g, {})).toBe(2);
    });

    it("knows only the desktop's sizes", () => {
        expect(stampAtlas(new Grid(9, 9), 4, 0, 0, 1)).toBe(null);
    });
});

describe("stampTwill", () => {
    for (const [h, s] of [[1, 1], [2, 2], [1, 3], [3, 1], [2, 3], [5, 2]]) {
        it(`${h}/${s} twill: ${h} up per column and row, shifted by one`,
            () => {
                const n = h + s;
                const g = new Grid(n + 2, n + 2);
                const sel = stampTwill(g, h, s, 1, 1, 2);
                expect(sel).toEqual({ i1: 1, j1: 1, i2: n, j2: n });
                const first = column(g, 1, n, 1);
                for (let k = 0; k < n; k++) {
                    expect(count(g, sel, { col: 1 + k })).toBe(h);
                    expect(count(g, sel, { row: 1 + k })).toBe(h);
                    expect(column(g, 1 + k, n, 1)).toEqual(rotate(first, k));
                }
            });
    }

    it("draws the 2/2 twill", () => {
        const g = new Grid(4, 4);
        stampTwill(g, 2, 2, 0, 0, 1);
        expect([0, 1, 2, 3].map((i) => column(g, i, 4).join(""))).toEqual(
            ["1100", "0110", "0011", "1001"]);
    });

    it("rejects an empty twill", () => {
        expect(stampTwill(new Grid(3, 3), 0, 0, 0, 0, 1)).toBe(null);
    });
});

describe("completeTwill", () => {
    it("extends a column seed into the full twill", () => {
        for (const [h, s] of [[2, 2], [1, 3], [3, 1], [2, 3]]) {
            const n = h + s;
            const full = new Grid(n + 2, n);
            stampTwill(full, h, s, 0, 0, 1);
            const g = new Grid(n + 2, n);
            for (let j = 0; j < n; j++) g.set(0, j, full.get(0, j));
            const sel = completeTwill(g, { i1: 0, j1: 0, i2: 0, j2: n - 1 }, 1);
            expect(sel).toEqual({ i1: 0, j1: 0, i2: n - 1, j2: n - 1 });
            expect([...g.data]).toEqual([...full.data]);
        }
    });

    it("extends a row seed upwards", () => {
        const g = new Grid(4, 6);
        g.set(1, 1, 2);
        g.set(2, 1, 2);   // row 1, columns 0..3: .11.
        const sel = completeTwill(g, { i1: 0, j1: 1, i2: 3, j2: 1 }, 2);
        expect(sel).toEqual({ i1: 0, j1: 1, i2: 3, j2: 4 });
        for (let k = 0; k < 4; k++) expect(count(g, sel, { row: 1 + k })).toBe(2);
        expect(g.get(2, 2)).toBe(2);   // shifted one to the right
    });

    it("stops at a column that already has set cells", () => {
        const g = new Grid(6, 4);
        g.set(0, 0, 1);
        g.set(3, 2, 1);   // blocks column 3
        const sel = completeTwill(g, { i1: 0, j1: 0, i2: 0, j2: 3 }, 1);
        expect(sel.i2).toBe(2);
        expect(column(g, 3, 4)).toEqual([0, 0, 1, 0]);
    });

    it("needs a single column or row of more than one cell", () => {
        const g = new Grid(4, 4);
        g.set(0, 0, 1);
        expect(completeTwill(g, { i1: 0, j1: 0, i2: 0, j2: 0 }, 1)).toBe(null);
        expect(completeTwill(g, { i1: 0, j1: 0, i2: 2, j2: 2 }, 1)).toBe(null);
        expect(count(g, {})).toBe(1);
    });
});

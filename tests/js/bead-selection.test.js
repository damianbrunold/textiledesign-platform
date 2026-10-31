import { describe, expect, it } from "vitest";
import { Pattern } from "../../src/textileplatform/static/js/bead/model.js";
import {
    affectedRect, captureGroup, restoreBaseline, stampGroup,
} from "../../src/textileplatform/static/js/bead/selection.js";
import { randomSource } from "./helpers/random.js";

// Pattern from rows of digits, row j = 0 first.
function make(rows, selection) {
    const p = new Pattern(rows[0].length, rows.length);
    p.data = rows.join("").split("").map(Number);
    p.selection = selection;
    return p;
}

const rows = (p) => Array.from({ length: p.height },
    (_, j) => p.data.slice(j * p.width, (j + 1) * p.width).join(""));

describe("captureGroup", () => {
    it("needs a selection", () => {
        expect(captureGroup(make(["12"], null))).toBe(null);
    });

    it("finds every occurrence of the selected shape", () => {
        const p = make(["1201", "0012", "1200"], { i1: 0, j1: 0, i2: 1, j2: 0 });
        const g = captureGroup(p);
        expect(g.values).toEqual([1, 2]);
        expect(g.offsets).toEqual([0, 1]);
        expect(g.matches).toEqual([0, 6, 8]);   // linear positions of "12"
    });

    it("matches across the seam of the tube", () => {
        // "21" at the end of row 0 continues at the start of row 1
        const p = make(["0002", "1000", "2100"], { i1: 0, j1: 2, i2: 1, j2: 2 });
        expect(captureGroup(p).matches).toEqual([3, 8]);
    });
});

describe("stampGroup", () => {
    it("moves every copy and the selection", () => {
        const p = make(["1000", "0010"], { i1: 0, j1: 0, i2: 0, j2: 0 });
        const g = captureGroup(p);
        stampGroup(p, g, 1, 0, 0);
        expect(rows(p)).toEqual(["0100", "0001"]);
        expect(p.selection).toEqual({ i1: 1, j1: 0, i2: 1, j2: 0 });
    });

    it("wraps into the next row and paints the lifted bead", () => {
        const p = make(["0001", "0000"], { i1: 3, j1: 0, i2: 3, j2: 0 });
        stampGroup(p, captureGroup(p), 2, 0, 5);
        // linear position 3 + 2 = 5 is (1, 1); the old place gets the
        // background colour
        expect(rows(p)).toEqual(["0005", "0100"]);
        // the selection rect moves by (dx, dy), past the right edge
        expect(p.selection).toEqual({ i1: 5, j1: 0, i2: 5, j2: 0 });
    });

    it("drops beads moved past either end", () => {
        const p = make(["1000", "0001"], { i1: 0, j1: 0, i2: 0, j2: 0 });
        stampGroup(p, captureGroup(p), -1, 0, 0);
        // the first bead falls off the start, the last one moves left
        expect(rows(p)).toEqual(["0000", "0010"]);
    });

    it("restamps from the baseline on every preview step", () => {
        const p = make(["1000"], { i1: 0, j1: 0, i2: 0, j2: 0 });
        const g = captureGroup(p);
        stampGroup(p, g, 1, 0, 0);
        stampGroup(p, g, 2, 0, 0);
        expect(rows(p)).toEqual(["0010"]);
        restoreBaseline(p, g);
        expect(rows(p)).toEqual(["1000"]);
    });
});

describe("on random patterns", () => {
    const rand = randomSource(31);

    function randomCase() {
        const w = 2 + rand(8), h = 2 + rand(10);
        const p = new Pattern(w, h);
        p.data = Array.from({ length: w * h }, () => rand(3));
        const i1 = rand(w), j1 = rand(h);
        p.selection = { i1, j1, i2: Math.min(w - 1, i1 + rand(3)),
                        j2: Math.min(h - 1, j1 + rand(3)) };
        return p;
    }

    it("a move by (0, 0) changes nothing", () => {
        for (let n = 0; n < 300; n++) {
            const p = randomCase();
            const before = [...p.data];
            stampGroup(p, captureGroup(p), 0, 0, 0);
            expect(p.data, `#${n}`).toEqual(before);
        }
    });

    it("a move only changes beads inside its affected rect", () => {
        for (let n = 0; n < 300; n++) {
            const p = randomCase();
            const before = [...p.data];
            const g = captureGroup(p);
            const dx = rand(7) - 3, dy = rand(7) - 3;
            const r = affectedRect(g, dx, dy);
            stampGroup(p, g, dx, dy, 0);
            for (let j = 0; j < p.height; j++) {
                for (let i = 0; i < p.width; i++) {
                    const inside = r && i >= r.i1 && i <= r.i2
                        && j >= r.j1 && j <= r.j2;
                    if (!inside) {
                        expect(p.get(i, j), `#${n} (${i},${j})`)
                            .toBe(before[i + j * p.width]);
                    }
                }
            }
        }
    });
});

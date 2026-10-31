import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
    correctedCell, correctedHit, draftCell, draftHit, foldIndex, rowStart,
    simulatedCell, simulatedHit, simulatedWidth,
} from "../../src/textileplatform/static/js/bead/geometry.js";
import { randomSource } from "./helpers/random.js";

const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];

describe("fold", () => {
    it("alternates rows of W and W + 1 beads", () => {
        // W = 3: row 0 = 0..2, row 1 = 3..6, row 2 = 7..9, row 3 = 10..13
        expect([0, 2, 3, 6, 7, 10].map((k) => foldIndex(k, 3))).toEqual([
            { i: 0, row: 0 }, { i: 2, row: 0 }, { i: 0, row: 1 },
            { i: 3, row: 1 }, { i: 0, row: 2 }, { i: 0, row: 3 },
        ]);
    });

    it("matches walking the rows one by one", () => {
        for (const W of [1, 2, 5, 8]) {
            let idx = 0;
            for (let row = 0; row < 12; row++) {
                const len = row % 2 === 0 ? W : W + 1;
                expect(rowStart(row, W)).toBe(idx);
                for (let i = 0; i < len; i++, idx++) {
                    expect(foldIndex(idx, W)).toEqual({ i, row });
                }
            }
        }
    });

    it("starts at 0 below the pattern", () => {
        expect(rowStart(-1, 4)).toBe(0);
    });
});

describe("cells and hits are inverse", () => {
    const rand = randomSource(59);

    function randomView(width) {
        return { x: rand(6), y: rand(4), width, height: 2 + rand(8),
                 offset: rand(6) };
    }

    const sizes = () => {
        const dx = 6 + rand(14);
        return [dx, rand(2) ? dx : 6 + rand(14)];   // square or not
    };

    it("draft", () => {
        for (let n = 0; n < 200; n++) {
            const W = 1 + rand(9), H = 1 + rand(12);
            const view = randomView(W);
            const [dx, dy] = sizes();
            for (let j = 0; j < H; j++) {
                for (let i = 0; i < W; i++) {
                    const r = draftCell(view, i, j, dx, dy);
                    if (!r) continue;
                    expect(draftHit(view, ...center(r), dx, dy), `#${n}`)
                        .toEqual([i, j]);
                }
            }
        }
    });

    it("corrected", () => {
        for (let n = 0; n < 200; n++) {
            const W = 1 + rand(9), H = 1 + rand(12);
            const view = randomView(W + 1);
            const [dx, dy] = sizes();
            for (let k = 0; k < W * H; k++) {
                const r = correctedCell(view, k, W, dx, dy);
                if (!r) continue;
                expect(correctedHit(view, ...center(r), W, dx, dy), `#${n}`)
                    .toEqual([k % W, Math.trunc(k / W)]);
            }
        }
    });

    it("simulated, with every shift", () => {
        for (let n = 0; n < 100; n++) {
            const W = 1 + rand(9), H = 1 + rand(12);
            const view = randomView(simulatedWidth(W));
            const [dx, dy] = sizes();
            for (let shift = 0; shift < W; shift++) {
                for (let k = 0; k < W * H; k++) {
                    const r = simulatedCell(view, k, W, shift, dx, dy);
                    if (!r) continue;
                    expect(simulatedHit(view, ...center(r), W, H, shift, dx, dy),
                           `#${n} shift ${shift}`)
                        .toEqual([k % W, Math.trunc(k / W)]);
                }
            }
        }
    });
});

describe("corrected view", () => {
    it("shifts odd rows by half a bead, whatever the scroll", () => {
        const W = 3;
        for (const offset of [0, 1, 2]) {
            const view = { x: 0, y: 0, width: 4, height: 10, offset };
            const even = correctedCell(view, rowStart(2, W), W, 10, 10);
            const odd = correctedCell(view, rowStart(3, W), W, 10, 10);
            expect(even.x - odd.x).toBe(5);
        }
    });
});

describe("simulated view", () => {
    const view = { x: 0, y: 0, width: 2, height: 10, offset: 0 };

    it("draws half beads at both edges of odd rows", () => {
        // W = 3: row 1 holds linear beads 3..6 at columns 0..3
        expect(simulatedCell(view, 3, 3, 0, 10, 10).w).toBe(5);    // column 0
        expect(simulatedCell(view, 4, 3, 0, 10, 10).w).toBe(10);   // column 1
        expect(simulatedCell(view, 5, 3, 0, 10, 10).w).toBe(5);    // column 2 = width
        expect(simulatedCell(view, 6, 3, 0, 10, 10)).toBe(null);   // back
    });

    it("rotates the tube by the shift", () => {
        // bead 0 moves one column to the right
        const a = simulatedCell(view, 0, 3, 0, 10, 10);
        const b = simulatedCell(view, 0, 3, 1, 10, 10);
        expect(b.x - a.x).toBe(10);
    });

    it("hits nothing outside the pattern or the window", () => {
        expect(simulatedHit(view, 5, -20, 3, 9, 0, 10, 10))
            .toEqual([undefined, undefined]);     // above the window
        expect(simulatedHit(view, 5, 5, 3, 1, 0, 10, 10))
            .toEqual([undefined, undefined]);     // top row, past the pattern
        expect(simulatedHit(view, 500, 95, 3, 2, 0, 10, 10))
            .toEqual([undefined, undefined]);     // right of the row
        expect(simulatedHit(view, 5, 95, 0, 2, 0, 10, 10))
            .toEqual([undefined, undefined]);     // empty pattern
    });
});

// tests/data/bead_geometry.json is generated from the server's export
// geometry (beadexport.py, see tests/test_bead_geometry.py): the editor
// must place beads exactly like the PDF / PNG / SVG exports.
describe("agrees with the server's exports", () => {
    const fixture = JSON.parse(fs.readFileSync(
        new URL("../data/bead_geometry.json", import.meta.url), "utf8"));
    const DX = 10, DY = 10, ROWS = 100;

    for (const [w, spec] of Object.entries(fixture.widths)) {
        const W = Number(w);

        it(`width ${W}: row starts and the corrected view`, () => {
            spec.first_index_of_row.forEach((start, row) => {
                expect(rowStart(row, W)).toBe(start);
            });
            const view = { x: 0, y: 0, width: W + 1, height: ROWS, offset: 0 };
            for (const [idx, left, row] of spec.corrected) {
                const r = correctedCell(view, idx, W, DX, DY);
                expect([(r.x - 0.5) / DX, ROWS - 1 - (r.y - 0.5) / DY])
                    .toEqual([left, row]);
            }
        });

        it(`width ${W}: the simulated view`, () => {
            const view = { x: 0, y: 0, width: simulatedWidth(W),
                           height: ROWS, offset: 0 };
            // grid origin: half a cell left of the view
            const origin = 0.5 - DX / 2;
            for (const [shift, expected] of Object.entries(spec.simulated)) {
                const drawn = [];
                const n = spec.corrected.length;
                for (let idx = 0; idx < n; idx++) {
                    const r = simulatedCell(view, idx, W, Number(shift), DX, DY);
                    if (r) {
                        drawn.push([idx, (r.x - origin) / DX, r.w / DX,
                                    ROWS - 1 - (r.y - 0.5) / DY]);
                    }
                }
                expect(drawn, `shift ${shift}`).toEqual(expected);
            }
        });
    }
});

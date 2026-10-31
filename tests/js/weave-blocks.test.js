import { describe, expect, it } from "vitest";
import {
    blockExpandThreading, blockExpandTieup, blockExpandTreadling, fillRanges,
    MUSTER_SATIN, musterRange, rangeFillRect, recolourMuster,
    stampMusterPanama, stampMusterSatin, stampMusterTwill, substituteBlocks,
    toggleMusterValue,
} from "../../src/textileplatform/static/js/weave/blocks-ops.js";
import { Muster, Pattern } from "../../src/textileplatform/static/js/weave/model.js";
import { randomSource } from "./helpers/random.js";

const rand = randomSource(77);

const newSlots = () => Array.from({ length: 10 }, () => new Muster());

// A muster from rows of characters, top row = highest j (as the dialog
// draws it); "." is empty, a digit is the cell value.
function muster(rows) {
    const m = new Muster();
    rows.forEach((row, r) => [...row].forEach((c, i) => {
        if (c !== ".") m.set(i, rows.length - 1 - r, Number(c));
    }));
    return m;
}

// The used cells of a muster as "i,j=v" strings.
function cells(m) {
    const out = [];
    for (let j = 0; j < 12; j++)
        for (let i = 0; i < 12; i++)
            if (m.get(i, j) !== 0) out.push(`${i},${j}=${m.get(i, j)}`);
    return out.sort();
}

// The weave rows from the top (highest weft first) as strings, one
// character per warp: "." unset, otherwise the value.
function weaveRows(p, w, h) {
    const rows = [];
    for (let j = h - 1; j >= 0; j--) {
        let s = "";
        for (let i = 0; i < w; i++) {
            const v = p.weave.get(i, j);
            s += v > 0 ? String(v) : ".";
        }
        rows.push(s);
    }
    return rows;
}

describe("muster slots", () => {
    it("musterRange is the highest used column and row over all slots", () => {
        const slots = newSlots();
        expect(musterRange(slots)).toEqual({ mx: -1, my: -1 });
        slots[3].set(2, 1, 3);
        slots[0].set(0, 4, 1);
        expect(musterRange(slots)).toEqual({ mx: 2, my: 4 });
    });

    it("toggling sets the slot number (1 for the base pattern) or clears", () => {
        expect(toggleMusterValue(0, 0)).toBe(1);
        expect(toggleMusterValue(0, 5)).toBe(5);
        expect(toggleMusterValue(5, 5)).toBe(0);
        expect(toggleMusterValue(1, 3)).toBe(0);
    });

    it("twill 2/2 in the base slot", () => {
        const m = new Muster();
        stampMusterTwill(m, 2, 2, 0);
        expect(m).toEqual(muster([
            "..11",
            ".11.",
            "11..",
            "1..1",
        ]));
    });

    it("twill 2/1 in slot 4", () => {
        const m = new Muster();
        m.set(11, 11, 9);    // cleared first
        stampMusterTwill(m, 2, 1, 4);
        expect(m).toEqual(muster([
            "44.",
            "4.4",
            ".44",
        ]));
    });

    it("every twill h/s has h raised cells in each column and row", () => {
        for (const [h, s] of [[1, 1], [2, 2], [3, 1], [1, 3], [4, 3], [5, 2]]) {
            const m = new Muster();
            stampMusterTwill(m, h, s, 2);
            const n = h + s;
            expect(m.sizeX()).toBe(n);
            expect(m.sizeY()).toBe(n);
            for (let k = 0; k < n; k++) {
                let col = 0, row = 0;
                for (let l = 0; l < n; l++) {
                    if (m.get(k, l)) col++;
                    if (m.get(l, k)) row++;
                }
                expect([col, row]).toEqual([h, h]);
            }
        }
    });

    it("satin n x n has one raised cell per row and column", () => {
        for (const n of Object.keys(MUSTER_SATIN).map(Number)) {
            const m = new Muster();
            expect(stampMusterSatin(m, n, 3)).toBe(true);
            expect(cells(m)).toHaveLength(n);
            for (let k = 0; k < n; k++) {
                let col = 0, row = 0;
                for (let l = 0; l < n; l++) {
                    if (m.get(k, l) === 3) col++;
                    if (m.get(l, k) === 3) row++;
                }
                expect([col, row]).toEqual([1, 1]);
            }
        }
        const m = new Muster();
        m.set(0, 0, 1);
        expect(stampMusterSatin(m, 6, 1)).toBe(false);
        expect(m.isEmpty()).toBe(true);
    });

    it("panama 2/1 is a 2 x 2 block and a 1 x 1 block diagonally", () => {
        const m = new Muster();
        stampMusterPanama(m, 2, 1, 0);
        expect(m).toEqual(muster([
            "..1",
            "11.",
            "11.",
        ]));
    });

    it("recolouring copies a slot in the current slot's value", () => {
        const from = muster([
            "3.",
            ".1",
        ]);
        const to = muster([
            "...5",
            "77..",
            "7...",
        ]);
        recolourMuster(from, to, 2, 1, 1);
        // Inside 0..1 x 0..1: from's cells, value 2; the rest untouched.
        expect(to).toEqual(muster([
            "...5",
            "2...",
            ".2..",
        ]));
    });
});

// Straight threading and treadling over n warps / wefts, a tie-up from
// rows (top row = highest shaft, one character per treadle).
function straightPattern(tieupRows, { size = 12 } = {}) {
    const p = new Pattern(size, size, size, size);
    const n = tieupRows.length, m = tieupRows[0].length;
    for (let i = 0; i < n; i++) p.entering.set_shaft(i, i + 1);
    for (let j = 0; j < m; j++) p.treadling.set(j, j, 1);
    tieupRows.forEach((row, r) => [...row].forEach((c, t) => {
        if (c !== ".") p.tieup.set(t, n - 1 - r, Number(c));
    }));
    p.recalc_weave();
    return p;
}

describe("block substitution", () => {
    it("replaces each tie-up point by its pattern and the rest by the base pattern", () => {
        // Diagonal 2 x 2 tie-up: the weave is a 2 x 2 diagonal too.
        const p = straightPattern([
            ".1",
            "1.",
        ]);
        const slots = newSlots();
        slots[0] = muster([       // base: anti-diagonal
            "1.",
            ".1",
        ]);
        slots[1] = muster([       // pattern 1: diagonal
            ".1",
            "1.",
        ]);
        expect(substituteBlocks(p, slots, {
            mx: 1, my: 1, einzugZ: true, trittfolgeZ: true,
        })).toBe(true);
        expect(p.entering.data.slice(0, 5)).toEqual([1, 2, 3, 4, 0]);
        // Tie-up cell (treadle t, shaft s) set -> slot 1 tile, unset ->
        // slot 0 tile, each at (2t, 2s).
        const tieup = [];
        for (let s = 3; s >= 0; s--) {
            let row = "";
            for (let t = 0; t < 4; t++) row += p.tieup.get(t, s) || ".";
            tieup.push(row);
        }
        expect(tieup).toEqual([
            "1..1",
            ".11.",
            ".11.",
            "1..1",
        ]);
        // Warp i is on shaft i + 1, weft j on treadle j.
        expect(weaveRows(p, 5, 5)).toEqual([
            ".....",
            "1..1.",
            ".11..",
            ".11..",
            "1..1.",
        ]);
    });

    it("tiles are the slots as tie-up blocks: x = mx + 1 treadles, y = my + 1 shafts", () => {
        // One tie-up point; 3 x 2 tile (3 treadles, 2 shafts).
        const p = straightPattern(["1"]);
        const slots = newSlots();
        slots[1] = muster([
            "1..",
            ".11",
        ]);
        substituteBlocks(p, slots, { mx: 2, my: 1, einzugZ: true, trittfolgeZ: true });
        // Warp 0 -> warps 0, 1 on shafts 1, 2; weft 0 -> wefts 0..2 on
        // treadles 0..2 (diagonal).
        expect(p.entering.data.slice(0, 3)).toEqual([1, 2, 0]);
        expect([0, 1, 2, 3].map((j) => [0, 1, 2, 3].filter(
            (t) => p.treadling.get(t, j)))).toEqual([[0], [1], [2], []]);
        expect(cells({ get: (i, j) => p.tieup.get(i, j) || 0 })).toEqual(
            ["0,1=1", "1,0=1", "2,0=1"]);
        // In the weave (warp = shaft, weft = treadle) the tile is
        // transposed.
        expect(weaveRows(p, 3, 4)).toEqual([
            "...",
            "1..",
            "1..",
            ".1.",
        ]);
    });

    it("falling directions reverse the expansion within each block", () => {
        const p = new Pattern(12, 12, 12, 12);
        p.entering.set_shaft(0, 1);
        p.entering.set_shaft(1, 2);
        p.treadling.set(1, 0, 1);
        p.tieup.set(1, 0, 1);
        p.tieup.set(1, 1, 1);
        p.recalc_weave();
        blockExpandThreading(p, 3, false);
        // Warp 0 (shaft 1) -> warps 2, 1, 0 on shafts 1, 2, 3; warp 1
        // (shaft 2) -> warps 5, 4, 3 on shafts 4, 5, 6.
        expect(p.entering.data.slice(0, 7)).toEqual([3, 2, 1, 6, 5, 4, 0]);
        blockExpandTreadling(p, 2, false);
        // Weft 0, treadle 1 -> wefts 0, 1 on treadles 3, 2.
        expect([0, 1, 2].map((j) => [0, 1, 2, 3, 4].filter(
            (t) => p.treadling.get(t, j)))).toEqual([[3], [2], []]);
    });

    it("threading expansion skips shafts beyond the tie-up", () => {
        const p = new Pattern(8, 4, 3, 3);
        p.entering.set_shaft(0, 2);
        p.treadling.set(0, 0, 1);
        p.tieup.set(0, 1, 1);
        p.recalc_weave();
        blockExpandThreading(p, 2, true);
        // Shafts 3 and 4; there are only 3.
        expect(p.entering.data.slice(0, 3)).toEqual([3, 0, 0]);
    });

    it("an empty tie-up stays empty", () => {
        const p = new Pattern(4, 4, 4, 4);
        const slots = newSlots();
        slots[0].set(0, 0, 1);
        blockExpandTieup(p, 2, 2, slots);
        expect(p.tieup.data.every((v) => v === 0)).toBe(true);
    });

    it("does nothing when all slots are empty", () => {
        const p = straightPattern(["1"]);
        const before = [...p.entering.data];
        expect(substituteBlocks(p, newSlots(), {
            mx: -1, my: -1, einzugZ: true, trittfolgeZ: true,
        })).toBe(false);
        expect(p.entering.data).toEqual(before);
    });

    it("on random tie-ups, every tie-up cell becomes its slot's tile", () => {
        for (let run = 0; run < 40; run++) {
            const n = 1 + rand(3), m = 1 + rand(3);
            const x = 1 + rand(3), y = 1 + rand(3);
            const rows = Array.from({ length: n }, () =>
                Array.from({ length: m }, () => (rand(3) ? String(rand(3)) : ".")).join(""));
            // At least one used cell, so the tie-up isn't empty.
            rows[0] = "1" + rows[0].slice(1);
            const p = straightPattern(rows);
            const orig = new Map();
            for (let t = 0; t < m; t++)
                for (let s = 0; s < n; s++) orig.set(`${t},${s}`, p.tieup.get(t, s));
            let t1 = m, t2 = -1, s1 = n, s2 = -1;
            for (const [k, v] of orig) {
                if (!v) continue;
                const [t, s] = k.split(",").map(Number);
                t1 = Math.min(t1, t); t2 = Math.max(t2, t);
                s1 = Math.min(s1, s); s2 = Math.max(s2, s);
            }
            const slots = newSlots();
            for (const slot of slots)
                for (let i = 0; i < x; i++)
                    for (let j = 0; j < y; j++) if (!rand(2)) slot.set(i, j, 1 + rand(9));
            const einzugZ = !rand(2), trittfolgeZ = !rand(2);
            substituteBlocks(p, slots, { mx: x - 1, my: y - 1, einzugZ, trittfolgeZ });

            for (let i = 0; i < 12; i++) {
                const I = Math.floor(i / y), k = i % y;
                const want = I < n ? I * y + (einzugZ ? k : y - 1 - k) + 1 : 0;
                expect(p.entering.get_shaft(i)).toBe(want);
            }
            for (let j = 0; j < 12; j++) {
                const J = Math.floor(j / x), k = j % x;
                for (let t = 0; t < 12; t++) {
                    const want = J < m && t === J * x + (trittfolgeZ ? k : x - 1 - k);
                    expect(p.treadling.get(t, j)).toBe(want ? 1 : 0);
                }
            }
            for (let t = 0; t < 12; t++) {
                for (let s = 0; s < 12; s++) {
                    const T = Math.floor(t / x), S = Math.floor(s / y);
                    const inBox = T >= t1 && T <= t2 && S >= s1 && S <= s2;
                    const want = inBox
                        ? slots[orig.get(`${T},${S}`)].get(t % x, s % y) : 0;
                    expect(p.tieup.get(t, s)).toBe(want);
                }
            }
        }
    });
});

describe("range substitution", () => {
    function weavePattern(rows) {
        const h = rows.length, w = rows[0].length;
        const p = new Pattern(w, h, 4, 4);
        rows.forEach((row, r) => [...row].forEach((c, i) => {
            if (c !== ".") p.weave.set(i, h - 1 - r, Number(c));
        }));
        p.recalc_weave_extent();
        return p;
    }

    it("replaces each range's cells by its pattern, tiled from the weave origin", () => {
        const p = weavePattern([
            "1111..",
            "1111..",
            "..2222",
            "..2222",
        ]);
        const slots = newSlots();
        slots[1] = muster([       // tabby, values 1
            ".1",
            "1.",
        ]);
        slots[2] = muster([       // 3 x 1 stripe: columns 0 and 2 in value 2
            "2.2",
        ]);
        fillRanges(p, slots, rangeFillRect(p, { x1: 0, y1: 0, x2: 0, y2: 0 }));
        expect(weaveRows(p, 6, 4)).toEqual([
            ".1.1..",
            "1.1...",
            "..22.2",
            "..22.2",
        ]);
        // Unset cells: the base slot is empty, so they stay unset.
        expect(p.weave.get(5, 3)).toBe(0);
    });

    it("a base pattern fills the unset cells too", () => {
        const p = weavePattern([
            "1..",
            "...",
        ]);
        const slots = newSlots();
        slots[0] = muster(["1"]);    // 1 x 1: everything set
        slots[1] = muster(["3"]);
        fillRanges(p, slots, rangeFillRect(p, { x1: 0, y1: 0, x2: 0, y2: 0 }));
        // The extent is the single used cell (0, 1), so only it changes.
        expect(weaveRows(p, 3, 2)).toEqual(["3..", "..."]);
        fillRanges(p, slots, { i0: 0, i1: 2, j0: 0, j1: 1 });
        // Range 3 has an empty slot: that cell stays.
        expect(weaveRows(p, 3, 2)).toEqual(["311", "111"]);
    });

    it("works on a weave selection, otherwise on the extent", () => {
        const p = weavePattern([
            "....",
            ".11.",
            ".11.",
        ]);
        expect(rangeFillRect(p, { x1: 3, y1: 0, x2: 2, y2: 2, selected_part: "weave" }))
            .toEqual({ i0: 2, i1: 3, j0: 0, j1: 2 });
        // A selection in another pane, or a single cell: the extent.
        expect(rangeFillRect(p, { x1: 3, y1: 0, x2: 2, y2: 2, selected_part: "entering" }))
            .toEqual({ i0: 1, i1: 2, j0: 0, j1: 1 });
        expect(rangeFillRect(p, { x1: 3, y1: 2, x2: 3, y2: 2, selected_part: "weave" }))
            .toEqual({ i0: 1, i1: 2, j0: 0, j1: 1 });
    });

    it("tiles a slot by its used size but reads it from (0, 0), like the desktop", () => {
        // Slot 1 uses only column 1: size 1 x 1, read at (0, 0), which is
        // empty, so range 1 is cleared (bereiche.cpp does the same).
        const p = weavePattern(["11"]);
        const slots = newSlots();
        slots[1].set(1, 0, 1);
        fillRanges(p, slots, { i0: 0, i1: 1, j0: 0, j1: 0 });
        expect(weaveRows(p, 2, 1)).toEqual([".."]);
    });
});

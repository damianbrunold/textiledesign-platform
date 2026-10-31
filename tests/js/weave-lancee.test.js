import { describe, expect, it } from "vitest";
import {
    applyWarpLancee, applyWeftLancee, lanceePlan, lanceeRange, lanceeRatio,
} from "../../src/textileplatform/static/js/weave/lancee-ops.js";
import { Pattern } from "../../src/textileplatform/static/js/weave/model.js";
import { randomSource } from "./helpers/random.js";

const rand = randomSource(4711);
const ratio = (...v) => [...v, 0, 0, 0, 0, 0, 0].slice(0, 6);
const noSelection = { x1: 0, y1: 0, x2: 0, y2: 0 };

// A pattern whose warp i (for the given entries) is threaded on
// shafts[i] and has a single weave cell at row rows[i] (null: empty).
function warpPattern(shafts, rows, { width = 12, height = 4 } = {}) {
    const p = new Pattern(width, height, 8, 8);
    shafts.forEach((s, i) => {
        p.entering.set_shaft(i, s);
        if (rows[i] !== null) p.weave.set(i, rows[i], 1);
    });
    p.recalc_weave_extent();
    return p;
}

// Warp i as "shaft:row" ("." for an empty warp).
function warps(p, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const s = p.entering.get_shaft(i);
        let row = null;
        for (let j = 0; j < p.weave.height; j++) if (p.weave.get(i, j) > 0) row = j;
        out.push(s === 0 && row === null ? "." : `${s}:${row}`);
    }
    return out;
}

function lancee(p, vv, cursor = noSelection) {
    const { a, b } = lanceeRange(p, cursor, "warp");
    const plan = lanceePlan(vv, a, b, p.weave.width);
    if (plan) applyWarpLancee(p, plan, a, b);
    return plan;
}

describe("lanceeRatio", () => {
    it("uses the entries up to the last non-zero one", () => {
        expect(lanceeRatio(ratio(2, 1))).toEqual({ vv: ratio(2, 1), maxi: 2 });
        expect(lanceeRatio(ratio(2, 1, 3, 2))).toEqual({ vv: ratio(2, 1, 3, 2), maxi: 4 });
    });

    it("folds an odd last entry into the first", () => {
        expect(lanceeRatio(ratio(3, 1, 2))).toEqual({ vv: ratio(5, 1), maxi: 2 });
    });

    it("needs at least a thread count and an insertion count", () => {
        expect(lanceeRatio(ratio())).toBeNull();
        expect(lanceeRatio(ratio(3))).toBeNull();
    });
});

describe("lanceePlan", () => {
    it("alternates runs of original threads and inserted ones", () => {
        expect(lanceePlan(ratio(2, 1), 0, 3, 20)).toEqual([0, 1, -1, 2, 3, -1]);
        expect(lanceePlan(ratio(1, 2), 0, 2, 20))
            .toEqual([0, -1, -1, 1, -1, -1, 2, -1, -1]);
        expect(lanceePlan(ratio(1, 1, 2, 2), 3, 6, 20))
            .toEqual([3, -1, 4, 5, -1, -1, 6, -1]);
    });

    it("is null for an empty range or no ratio", () => {
        expect(lanceePlan(ratio(2, 1), 4, 3, 20)).toBeNull();
        expect(lanceePlan(ratio(2), 0, 3, 20)).toBeNull();
    });

    it("is cut off before the last thread of the axis", () => {
        // 8 positions needed, the axis has 6: the plan stops at 4 (the
        // desktop's a + needed < MAXX1 check) and source 3 is lost.
        expect(lanceePlan(ratio(1, 1), 0, 3, 6)).toEqual([0, -1, 1, -1, 2]);
    });

    // Regression (the desktop's KettLancierungClick /
    // SchussLancierungClick still have it): after an incomplete last
    // run the plan copied thread b + 1 in place of the inserted one.
    it("inserts after an incomplete last run too", () => {
        expect(lanceePlan(ratio(3, 1), 0, 3, 20)).toEqual([0, 1, 2, -1, 3, -1]);
    });
});

describe("warp lancée", () => {
    it("spreads the pattern extent", () => {
        const p = warpPattern([1, 2, 3, 4], [0, 1, 2, 3]);
        lancee(p, ratio(2, 1));
        expect(warps(p, 7)).toEqual(["1:0", "2:1", ".", "3:2", "4:3", ".", "."]);
        expect([p.min_x, p.max_x]).toEqual([0, 4]);
    });

    it("spreads a selection and moves the warps right of it", () => {
        const p = warpPattern([1, 2, 3, 4, 5], [0, 1, 2, 3, 0]);
        lancee(p, ratio(1, 1), { x1: 2, y1: 0, x2: 1, y2: 3 });
        expect(warps(p, 8)).toEqual(
            ["1:0", "2:1", ".", "3:2", ".", "4:3", "5:0", "."]);
    });

    it("does not duplicate a warp after an incomplete last run", () => {
        // Selection 0..2 with ratio 2:1: the last run (warp 2) is
        // incomplete, warp 3 ends up both in the gap and after it.
        const p = warpPattern([1, 2, 3, 4], [0, 1, 2, 3]);
        lancee(p, ratio(2, 1), { x1: 0, y1: 0, x2: 2, y2: 3 });
        expect(warps(p, 7)).toEqual(["1:0", "2:1", ".", "3:2", ".", "4:3", "."]);
    });

    it("keeps the warps' order and values and inserts empty ones in the ratio", () => {
        for (let run = 0; run < 60; run++) {
            const n = 1 + rand(10);
            const p = new Pattern(60, 5, 8, 8);
            for (let i = 0; i < n; i++) {
                for (let j = 0; j < 5; j++) if (rand(2)) p.weave.set(i, j, 1 + rand(3));
                if (p.weave.isColEmpty(i)) p.weave.set(i, rand(5), 1);
                p.entering.set_shaft(i, 1 + rand(8));
            }
            p.recalc_weave_extent();
            const column = (q, i) => [q.entering.get_shaft(i),
                ...Array.from({ length: 5 }, (_, j) => q.weave.get(i, j))];
            const before = Array.from({ length: n }, (_, i) => column(p, i));

            const k = 2 * (1 + rand(3));
            const vv = ratio(...Array.from({ length: k }, () => 1 + rand(3)));
            lancee(p, vv);

            // Expected sequence: vv[0] warps, vv[1] empty, vv[2] warps, ...
            // with the gap after the last (possibly incomplete) run.
            const want = [];
            let src = 0, idx = 0;
            while (src < n) {
                for (let c = 0; c < vv[idx] && src < n; c++) want.push(before[src++]);
                idx = (idx + 1) % k;
                for (let c = 0; c < vv[idx]; c++) want.push(null);
                idx = (idx + 1) % k;
            }
            const empty = [0, 0, 0, 0, 0, 0];
            for (let i = 0; i < 60; i++) {
                expect(column(p, i)).toEqual(want[i] || empty);
            }
        }
    });
});

describe("weft lancée", () => {
    function weftPattern(treadles, { height = 10 } = {}) {
        const p = new Pattern(3, height, 4, 4);
        treadles.forEach((t, j) => {
            p.treadling.set(t, j, 1);
            p.pegplan.set(t, j, 1);
            p.weave.set(t, j, 1);
        });
        p.recalc_weave_extent();
        return p;
    }
    const rowsOf = (grid, n) => Array.from({ length: n }, (_, j) => {
        const used = [];
        for (let i = 0; i < grid.width; i++) if (grid.get(i, j) > 0) used.push(i);
        return used.join("") || ".";
    });

    it("spreads the wefts and their treadling", () => {
        const p = weftPattern([0, 1, 2]);
        const { a, b } = lanceeRange(p, noSelection, "weft");
        expect([a, b]).toEqual([0, 2]);
        applyWeftLancee(p, lanceePlan(ratio(1, 2), a, b, 10), a, b, p.treadling);
        expect(rowsOf(p.treadling, 9)).toEqual(["0", ".", ".", "1", ".", ".", "2", ".", "."]);
        expect(rowsOf(p.weave, 9)).toEqual(["0", ".", ".", "1", ".", ".", "2", ".", "."]);
        // The pegplan was not the side grid: unchanged.
        expect(rowsOf(p.pegplan, 4)).toEqual(["0", "1", "2", "."]);
    });

    it("moves the pegplan instead in pegplan mode", () => {
        const p = weftPattern([0, 1, 2, 0]);
        const cursor = { x1: 0, y1: 1, x2: 0, y2: 2 };
        const { a, b } = lanceeRange(p, cursor, "weft");
        expect([a, b]).toEqual([1, 2]);
        applyWeftLancee(p, lanceePlan(ratio(1, 1), a, b, 10), a, b, p.pegplan);
        expect(rowsOf(p.pegplan, 7)).toEqual(["0", "1", ".", "2", ".", "0", "."]);
        expect(rowsOf(p.weave, 7)).toEqual(["0", "1", ".", "2", ".", "0", "."]);
        expect(rowsOf(p.treadling, 5)).toEqual(["0", "1", "2", "0", "."]);
    });
});

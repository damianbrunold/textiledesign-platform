import { describe, expect, it } from "vitest";
import {
    arrangeThreading, arrangeTreadling, recalcFixedEntering,
    THREADING_STYLES, TREADLING_STYLES, updateFixedEntering,
} from "../../src/textileplatform/static/js/weave/arrange.js";
import { Pattern } from "../../src/textileplatform/static/js/weave/model.js";
import { randomSource } from "./helpers/random.js";

// A pattern from threading, tie-up rows (one string per shaft, one
// character per treadle) and treadling rows (one string per weft).
function make({ entering, tieup, treadling, shafts = 8, treadles = 8,
                pegplan = false }) {
    const w = entering.length, h = treadling.length;
    const p = new Pattern(w, h, shafts, treadles,
                          { isPegplan: () => pegplan });
    entering.forEach((s, i) => p.entering.set_shaft(i, s));
    tieup.forEach((row, shaft) => [...row].forEach((c, t) => {
        if (c !== ".") p.tieup.set(t, shaft, Number(c));
    }));
    treadling.forEach((row, j) => [...row].forEach((c, t) => {
        if (c !== ".") p.treadling.set(t, j, Number(c));
    }));
    p.recalc_weave();
    return p;
}

const shafts = (p) => [...p.entering.data];

function usedTreadles(p, j) {
    const out = [];
    for (let t = 0; t < p.treadling.width; t++) {
        if (p.treadling.get(t, j) > 0) out.push(t);
    }
    return out;
}

const rand = randomSource(99);

function randomPattern(pegplan) {
    const w = 2 + rand(12), h = 2 + rand(12), ms = 2 + rand(8),
        mt = 2 + rand(8);
    const p = new Pattern(w, h, ms, mt, { isPegplan: () => pegplan });
    for (let i = 0; i < w; i++) {
        p.entering.set_shaft(i, rand(4) ? 1 + rand(ms) : 0);
    }
    p.tieup.data = p.tieup.data.map(() => (rand(3) ? 0 : 1 + rand(2)));
    for (let j = 0; j < h; j++) p.treadling.set(rand(mt), j, rand(5) ? 1 : 0);
    p.pegplan.data = p.pegplan.data.map(() => (rand(3) ? 0 : 1));
    p.recalc_weave();
    return p;
}

describe("arrangements keep the weave", () => {
    for (const pegplan of [false, true]) {
        for (const style of THREADING_STYLES) {
            it(`threading ${style}${pegplan ? " (pegplan)" : ""}`, () => {
                for (let n = 0; n < 150; n++) {
                    const p = randomPattern(pegplan);
                    const weave = [...p.weave.data];
                    arrangeThreading(p, style, { pegplan });
                    p.recalc_weave();
                    expect([...p.weave.data]).toEqual(weave);
                }
            });
        }
    }
    for (const style of TREADLING_STYLES) {
        it(`treadling ${style}`, () => {
            for (let n = 0; n < 150; n++) {
                const p = randomPattern(false);
                const weave = [...p.weave.data];
                arrangeTreadling(p, style);
                p.recalc_weave();
                expect([...p.weave.data]).toEqual(weave);
            }
        });
    }
});

describe("threading", () => {
    // Warps 0..3 threaded 3, 1, 2, 3: three distinct shafts, all used.
    const tieup = ["1...", ".1..", "..1.", "...."];
    const treadling = ["1...", ".1..", "..1."];

    it("minimal-z numbers shafts in order of first use", () => {
        const p = make({ entering: [3, 1, 2, 3], tieup, treadling });
        arrangeThreading(p, "minimal-z");
        expect(shafts(p).slice(0, 4)).toEqual([1, 2, 3, 1]);
    });

    it("minimal-s numbers them downwards", () => {
        const p = make({ entering: [3, 1, 2, 3], tieup, treadling });
        arrangeThreading(p, "minimal-s");
        expect(shafts(p).slice(0, 4)).toEqual([3, 2, 1, 3]);
    });

    it("merges shafts with the same tie-up", () => {
        const p = make({ entering: [1, 2, 3, 4],
                         tieup: ["1.", "1.", ".1", ".1"],
                         treadling: ["1.", ".1"] });
        arrangeThreading(p, "minimal-z");
        expect(shafts(p).slice(0, 4)).toEqual([1, 1, 2, 2]);
    });

    it("chorig-2 puts even and odd warps on separate shafts", () => {
        // Straight draw on two shafts: both "chore" share them.
        const p = make({ entering: [1, 2, 1, 2, 1, 2],
                         tieup: ["1.", ".1"], treadling: ["1.", ".1"] });
        arrangeThreading(p, "chorig-2");
        const s = shafts(p).slice(0, 6);
        const even = new Set([s[0], s[2], s[4]]);
        const odd = new Set([s[1], s[3], s[5]]);
        expect([...even].some((x) => odd.has(x))).toBe(false);
    });

    it("ignores unknown styles and fixiert", () => {
        const p = make({ entering: [3, 1, 2, 3], tieup, treadling });
        arrangeThreading(p, "fixiert");
        arrangeThreading(p, "nonsense");
        expect(shafts(p).slice(0, 4)).toEqual([3, 1, 2, 3]);
    });
});

describe("treadling", () => {
    // Wefts tread treadles 2, 0, 1 (tie-ups differ).
    const base = { entering: [1, 2, 3], tieup: ["1..", ".1.", "..1"],
                   treadling: ["..1", "1..", ".1."] };

    it("minimal-z numbers treadles in order of first use", () => {
        const p = make(base);
        arrangeTreadling(p, "minimal-z");
        expect([0, 1, 2].map((j) => usedTreadles(p, j))).toEqual(
            [[0], [1], [2]]);
    });

    it("minimal-s numbers them from the right", () => {
        const p = make(base);
        arrangeTreadling(p, "minimal-s");
        expect([0, 1, 2].map((j) => usedTreadles(p, j))).toEqual(
            [[2], [1], [0]]);
    });

    it("merges treadles with the same tie-up and closes gaps", () => {
        const p = make({ entering: [1, 2],
                         tieup: ["1..1", ".1.."],
                         treadling: ["...1", "1...", ".1.."] });
        arrangeTreadling(p, "minimal-z");
        expect([0, 1, 2].map((j) => usedTreadles(p, j))).toEqual(
            [[0], [0], [1]]);
    });

    it("does nothing in pegplan mode", () => {
        const p = make(base);
        arrangeTreadling(p, "minimal-z", { pegplan: true });
        expect(usedTreadles(p, 0)).toEqual([2]);
    });
});

describe("fixed threading", () => {
    it("snapshots the threading as a repeated template", () => {
        const p = make({ entering: [2, 0, 1, 3, 0, 0], tieup: ["1", "1", "1"],
                         treadling: ["1"] });
        updateFixedEntering(p);
        // non-empty warps 2, 1, 3, then repeated
        expect(p.fixeinzug).toEqual([2, 1, 3, 2, 1, 3]);
        expect(p.fixsize).toBe(2);
        expect(p.firstfree).toBe(3);
    });

    it("rebuilds the threading from the template", () => {
        const p = make({ entering: [1, 2, 3, 4], tieup: ["1.", ".1", "1.", ".1"],
                         treadling: ["1.", ".1"] });
        p.fixeinzug = [4, 3, 2, 1];
        p.firstfree = 4;
        const max = recalcFixedEntering(p);
        expect(shafts(p).slice(0, 4)).toEqual([4, 3, 2, 1]);
        expect(max).toBe(4);
    });

    it("shares a template shaft between identical warps", () => {
        const p = make({ entering: [1, 2, 1, 2], tieup: ["1.", ".1"],
                         treadling: ["1.", ".1"] });
        p.fixeinzug = [2, 1, 2, 1];
        p.firstfree = 2;
        recalcFixedEntering(p);
        expect(shafts(p).slice(0, 4)).toEqual([2, 1, 2, 1]);
    });

    it("splits off a new shaft when the template's is taken by a " +
       "different warp", () => {
        const p = make({ entering: [1, 2, 1, 2], tieup: ["1.", ".1"],
                         treadling: ["1.", ".1"] });
        p.fixeinzug = [2, 1, 2, 2];   // warp 3 differs from warps 0 and 2
        p.firstfree = 2;
        const max = recalcFixedEntering(p);
        expect(shafts(p).slice(0, 4)).toEqual([2, 1, 2, 3]);
        expect(max).toBe(3);
    });

    it("keeps the weave through the editor's fixed recalculation", () => {
        const p = make({ entering: [1, 2, 1, 2], tieup: ["1.", ".1"],
                         treadling: ["1.", ".1"] });
        p.hooks.recalcFixedEntering = recalcFixedEntering;
        p.fixeinzug = [2, 1, 2, 2];
        p.firstfree = 2;
        const weave = [...p.weave.data];
        p.recalc_from_weave({ threading_arrangement: "fixiert" });
        expect(shafts(p).slice(0, 4)).toEqual([2, 1, 2, 3]);
        p.recalc_weave();
        expect([...p.weave.data]).toEqual(weave);
    });
});

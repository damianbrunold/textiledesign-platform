import { describe, expect, it } from "vitest";
import { Pattern } from "../../src/textileplatform/static/js/weave/model.js";
import {
    clearPegplan, invertPegplan, mirrorPegplan, pegplanBounds, repeatWarp,
    repeatWeft, switchSide,
} from "../../src/textileplatform/static/js/weave/transforms.js";
import { randomSource } from "./helpers/random.js";

const rand = randomSource(2024);

// A consistent random pattern: weave computed from the threading and
// tie-up + treadling (or the pegplan). `single`: one treadle per weft.
function randomPattern({ pegplan = false, single = false } = {}) {
    const w = 3 + rand(12), h = 3 + rand(12), ms = 2 + rand(6),
        mt = 2 + rand(6);
    const p = new Pattern(w, h, ms, mt, { isPegplan: () => pegplan });
    for (let i = 0; i < w; i++) p.entering.set_shaft(i, rand(5) ? 1 + rand(ms) : 0);
    p.tieup.data = p.tieup.data.map(() => (rand(2) ? 0 : 1));
    for (let j = 0; j < h; j++) {
        if (single) {
            if (rand(5)) p.treadling.set(rand(mt), j, 1);
        } else {
            for (let t = 0; t < mt; t++) if (!rand(3)) p.treadling.set(t, j, 1);
        }
    }
    p.pegplan.data = p.pegplan.data.map(() => (rand(2) ? 0 : 1));
    p.recalc_weave();
    return p;
}

const positive = (data) => [...data].map((v) => (v > 0 ? 1 : 0));

// What the weave should be, derived from the other grids.
function derivedWeave(p) {
    const q = new Pattern(p.weave.width, p.weave.height, p.tieup.height,
                          p.tieup.width, p.hooks);
    q.entering.data = [...p.entering.data];
    q.tieup.data = [...p.tieup.data];
    q.treadling.data = [...p.treadling.data];
    q.pegplan.data = [...p.pegplan.data];
    q.recalc_weave();
    return positive(q.weave.data);
}

// As the editor's _pegplanCommand runs them.
function pegplanCommand(p, mutate) {
    mutate();
    p.recalc_weave_extent();
    p.calcRapport();
}

describe("pegplanBounds", () => {
    it("is the rectangle of used cells", () => {
        const p = new Pattern(4, 6, 5, 4);
        p.pegplan.set(1, 2, 1);
        p.pegplan.set(3, 4, 1);
        p.pegplan.set(2, 3, -1);   // switched off: not used
        expect(pegplanBounds(p)).toEqual({ s1: 1, s2: 3, j1: 2, j2: 4 });
    });

    it("is empty for an empty pegplan", () => {
        const { s1, s2, j1, j2 } = pegplanBounds(new Pattern(3, 3, 3, 3));
        expect(s2 < s1 && j2 < j1).toBe(true);
    });
});

describe("pegplan transforms keep the weave consistent", () => {
    const cases = {
        invert: (p) => invertPegplan(p, 1),
        mirror: (p) => mirrorPegplan(p),
        clear: (p) => clearPegplan(p),
    };
    for (const [name, op] of Object.entries(cases)) {
        it(name, () => {
            for (let n = 0; n < 200; n++) {
                const p = randomPattern({ pegplan: true });
                pegplanCommand(p, () => op(p));
                expect(positive(p.weave.data), `#${n}`).toEqual(derivedWeave(p));
            }
        });
    }

    it("mirror swaps the used weft range", () => {
        const p = new Pattern(1, 4, 2, 2, { isPegplan: () => true });
        p.entering.set_shaft(0, 1);
        p.pegplan.set(0, 1, 1);
        p.pegplan.set(1, 3, 1);   // shaft 2 not threaded
        p.pegplan.set(0, 3, 1);
        p.recalc_weave();         // used wefts 1..3
        mirrorPegplan(p);
        expect([1, 2, 3].map((j) => p.pegplan.get(0, j))).toEqual([1, 0, 1]);
        expect(p.pegplan.get(1, 1)).toBe(1);
    });
});

describe("switchSide", () => {
    it("inverts and mirrors the weave (single treadling)", () => {
        for (let n = 0; n < 200; n++) {
            const p = randomPattern({ single: true });
            if (!p.hasExtent()) continue;
            const before = p.weave;
            const { min_x: a, max_x: b } = p;
            const used = (j) => p.treadling.data.some(
                (v, k) => v > 0 && Math.floor(k / p.treadling.width) === j);
            const old = (i, j) => (before.get(i, j) > 0 ? 1 : 0);
            const expected = [];
            for (let j = 0; j < p.weave.height; j++) {
                for (let i = a; i <= b; i++) {
                    const m = b - (i - a);
                    const threaded = p.entering.get_shaft(m) > 0;
                    expected.push(threaded && used(j) ? 1 - old(m, j) : 0);
                }
            }
            switchSide(p, 1);
            const got = [];
            for (let j = 0; j < p.weave.height; j++) {
                for (let i = a; i <= b; i++) got.push(p.weave.get(i, j) > 0 ? 1 : 0);
            }
            expect(got, `#${n}`).toEqual(expected);
        }
    });

    // In pegplan mode a first or last used weft with every threaded
    // shaft raised becomes empty and drops out of the next switch (it
    // can't be told from "no weft"); everything else round-trips.
    function edgeWeftFullyRaised(p) {
        const { j1, j2 } = pegplanBounds(p);
        if (j2 < j1) return false;
        const threaded = new Set(p.entering.data.filter((s) => s > 0));
        const full = (j) => [...threaded].every((s) => p.pegplan.get(s - 1, j) > 0);
        return full(j1) || full(j2);
    }

    function switchTwice(pegplan) {
        let checked = 0;
        for (let n = 0; n < 300; n++) {
            const p = randomPattern({ pegplan });
            if (pegplan && edgeWeftFullyRaised(p)) continue;
            checked++;
            const weave = positive(p.weave.data);
            const entering = [...p.entering.data];
            const colors = [...p.color_warp.data];
            switchSide(p, 1, { pegplan });
            switchSide(p, 1, { pegplan });
            expect(positive(p.weave.data), `#${n}`).toEqual(weave);
            expect([...p.entering.data]).toEqual(entering);
            expect([...p.color_warp.data]).toEqual(colors);
        }
        expect(checked).toBeGreaterThan(150);
    }

    it("switching twice gives back the fabric", () => switchTwice(false));

    it("switching twice gives back the fabric (pegplan)",
        () => switchTwice(true));

    it("inverts only threaded shafts in pegplan mode", () => {
        const p = new Pattern(2, 2, 3, 3, { isPegplan: () => true });
        p.entering.set_shaft(0, 1);
        p.entering.set_shaft(1, 2);   // shaft 3 not threaded
        p.pegplan.set(0, 0, 1);
        p.pegplan.set(2, 1, 1);
        p.recalc_weave();
        switchSide(p, 1, { pegplan: true });
        expect([0, 1].map((s) => p.pegplan.get(s, 0) > 0)).toEqual([false, true]);
        expect([0, 1].map((s) => p.pegplan.get(s, 1) > 0)).toEqual([true, true]);
        expect(p.pegplan.get(2, 1)).toBe(1);   // untouched
    });

    it("drops a fully raised edge weft on the second switch (pegplan)", () => {
        // Weft 1 has both threaded shafts raised: after the first switch
        // it is empty and no longer part of the used wefts.
        const p = new Pattern(2, 2, 2, 2, { isPegplan: () => true });
        [1, 2].forEach((s, i) => p.entering.set_shaft(i, s));
        p.pegplan.set(0, 0, 1);
        p.pegplan.set(0, 1, 1);
        p.pegplan.set(1, 1, 1);
        p.recalc_weave();
        switchSide(p, 1, { pegplan: true });
        switchSide(p, 1, { pegplan: true });
        expect([0, 1].map((s) => p.pegplan.get(s, 0) > 0)).toEqual([true, false]);
        expect([0, 1].map((s) => p.pegplan.get(s, 1) > 0)).toEqual([false, false]);
    });
});

describe("invertPegplan", () => {
    it("derives the weave from the pegplan, also for shafts it doesn't use",
        () => {
            // Warps on shafts 1, 2, 3; the pegplan only uses shafts 1-2.
            const p = new Pattern(3, 2, 3, 3, { isPegplan: () => true });
            [1, 2, 3].forEach((s, i) => p.entering.set_shaft(i, s));
            p.pegplan.set(0, 0, 1);
            p.pegplan.set(1, 1, 1);
            p.recalc_weave();
            invertPegplan(p, 1);
            // shaft 3 stays down: its warp doesn't flip
            expect([0, 1, 2].map((i) => p.weave.get(i, 0) > 0)).toEqual(
                [false, true, false]);
            expect([0, 1, 2].map((i) => p.weave.get(i, 1) > 0)).toEqual(
                [true, false, false]);
        });
});

describe("repeat extension", () => {
    function twillStrip(width, height) {
        // A 4-warp straight draw repeated twice, then empty space.
        const p = new Pattern(width, height, 4, 4);
        for (let i = 0; i < 8; i++) p.entering.set_shaft(i, (i % 4) + 1);
        ["11..", ".11.", "..11", "1..1"].forEach((row, s) => [...row].forEach(
            (c, t) => { if (c === "1") p.tieup.set(t, s, 1); }));
        for (let j = 0; j < 4; j++) p.treadling.set(j, j, 1);
        for (let i = 0; i < 8; i++) p.color_warp.set(i, 0, i);
        p.recalc_weave();
        return p;
    }

    it("fills the width with the warp repeat", () => {
        const p = twillStrip(14, 4);
        repeatWarp(p, -1);
        expect([...p.entering.data]).toEqual(
            [1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2]);
        expect(positive(p.weave.data)).toEqual(derivedWeave(p));
        expect([p.min_x, p.max_x]).toEqual([0, 13]);
        // colours stay where they were without withColors
        expect(p.color_warp.get(9, 0)).toBe(0);
    });

    it("repeats a given number of times, with colours", () => {
        const p = twillStrip(20, 4);
        repeatWarp(p, 3, { withColors: true });
        expect(p.max_x).toBe(11);
        expect(p.color_warp.get(9, 0)).toBe(1);
    });

    it("reduces to a single repeat", () => {
        const p = twillStrip(10, 4);
        repeatWarp(p, 1);
        expect([...p.entering.data]).toEqual([1, 2, 3, 4, 0, 0, 0, 0, 0, 0]);
        expect([p.min_x, p.max_x]).toEqual([0, 3]);
    });

    it("repeats wefts through the treadling or the pegplan", () => {
        for (const pegplan of [false, true]) {
            const p = twillStrip(8, 11);
            if (pegplan) {
                p.hooks.isPegplan = () => true;
                p._recalc_pegplan_from_weave();
            }
            repeatWeft(p, -1, { pegplan });
            expect(p.max_y).toBe(10);
            const grid = pegplan ? p.pegplan : p.treadling;
            for (let j = 4; j < 11; j++) {
                for (let k = 0; k < grid.width; k++) {
                    expect(grid.get(k, j)).toBe(grid.get(k, j % 4));
                }
            }
            expect(positive(p.weave.data)).toEqual(derivedWeave(p));
        }
    });

    it("keeps repeats consistent on random patterns", () => {
        for (let n = 0; n < 200; n++) {
            const pegplan = n % 2 === 1;
            const p = randomPattern({ pegplan });
            repeatWarp(p, -1);
            repeatWeft(p, -1, { pegplan });
            expect(positive(p.weave.data), `#${n}`).toEqual(derivedWeave(p));
        }
    });

    it("does nothing on an empty pattern", () => {
        const p = new Pattern(4, 4, 2, 2);
        repeatWarp(p, -1);
        repeatWeft(p, -1);
        expect(p.hasExtent()).toBe(false);
    });
});

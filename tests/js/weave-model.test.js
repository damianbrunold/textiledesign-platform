import { describe, expect, it, vi } from "vitest";
import {
    Grid, Muster, Pattern,
} from "../../src/textileplatform/static/js/weave/model.js";
import { randomSource } from "./helpers/random.js";

// Pattern and Muster from weave/model.js, used directly as an ES module.

function rows(g) {
    const out = [];
    for (let j = 0; j < g.height; j++) {
        let s = "";
        for (let i = 0; i < g.width; i++) {
            const v = g.get(i, j);
            s += v > 0 ? String(v) : ".";
        }
        out.push(s);
    }
    return out;
}

function fill(g, lines) {
    lines.forEach((line, j) => [...line].forEach((ch, i) => {
        g.set(i, j, ch === "." ? 0 : Number(ch));
    }));
}

// A 2/2 twill on 4 shafts / 4 treadles over 8 warps and 8 wefts:
// straight draw, straight treadling.
function twill(hooks) {
    const p = new Pattern(8, 8, 4, 4, hooks);
    for (let i = 0; i < 8; i++) p.entering.set_shaft(i, (i % 4) + 1);
    fill(p.tieup, ["11..", ".11.", "..11", "1..1"]);
    for (let j = 0; j < 8; j++) p.treadling.set(j % 4, j, 1);
    return p;
}

const TWILL = [
    "1..11..1", "11..11..", ".11..11.", "..11..11",
    "1..11..1", "11..11..", ".11..11.", "..11..11",
];

describe("Grid.invertRange", () => {
    it("sets empty cells to the given value and switches set cells off",
        () => {
            const g = new Grid(3, 1);
            g.set(1, 0, 4);
            g.invertRange(0, 0, 2, 0, 7);
            expect([...g.data]).toEqual([7, -4, 7]);
            g.invertRange(0, 0, 0, 0);  // default value 1
            expect(g.get(0, 0)).toBe(-7);
        });
});

describe("Muster", () => {
    it("is a bounded 12 x 12 grid", () => {
        const m = new Muster();
        expect(m.isEmpty()).toBe(true);
        m.set(2, 3, 5);
        m.set(12, 0, 9);  // outside: ignored
        expect(m.get(2, 3)).toBe(5);
        expect(m.get(-1, 0)).toBe(0);
        expect(m.isEmpty()).toBe(false);
    });

    it("measures the used extent", () => {
        const m = new Muster();
        expect([m.sizeX(), m.sizeY()]).toEqual([0, 0]);
        m.set(2, 1, 1);
        m.set(5, 7, 2);
        expect([m.sizeX(), m.sizeY()]).toEqual([4, 7]);
    });

    it("copies, snapshots and restores", () => {
        const a = new Muster();
        a.set(0, 0, 3);
        const b = new Muster();
        b.copyFrom(a);
        expect(b.get(0, 0)).toBe(3);
        const snap = b.snapshot();
        b.clear();
        expect(b.isEmpty()).toBe(true);
        b.restore(snap);
        expect(b.get(0, 0)).toBe(3);
    });
});

describe("Pattern", () => {
    it("builds its grids from the sizes", () => {
        const p = new Pattern(10, 6, 4, 5);
        expect([p.weave.width, p.weave.height]).toEqual([10, 6]);
        expect([p.tieup.width, p.tieup.height]).toEqual([5, 4]);
        expect([p.treadling.width, p.treadling.height]).toEqual([5, 6]);
        expect([p.pegplan.width, p.pegplan.height]).toEqual([4, 6]);
        expect(p.entering.width).toBe(10);
        expect(p.blockmuster).toHaveLength(10);
        expect(p.fixeinzug).toHaveLength(10);
    });

    it("resizes all grids, keeping fixed-threading entries that fit", () => {
        const p = new Pattern(4, 4, 4, 4);
        p.weave.set(1, 1, 1);
        p.fixeinzug = [1, 4, 2, 3];
        p.fixsize = 4;
        p.resize(3, 5, 3, 2);
        expect([p.weave.width, p.weave.height]).toEqual([3, 5]);
        expect(p.weave.get(1, 1)).toBe(1);
        expect(p.fixeinzug).toEqual([1, 0, 2]);  // shaft 4 is gone
        expect(p.fixsize).toBe(3);
        expect([p.tieup.width, p.tieup.height]).toEqual([2, 3]);
    });

    describe("weave from threading, tie-up and treadling", () => {
        it("computes a twill", () => {
            const p = twill();
            p.recalc_weave();
            expect(rows(p.weave)).toEqual(TWILL);
            expect([p.min_x, p.max_x, p.min_y, p.max_y])
                .toEqual([0, 7, 0, 7]);
            expect(p.hasExtent()).toBe(true);
        });

        it("finds the repeat", () => {
            const p = twill();
            p.recalc_weave();
            expect([p.rapport_k_a, p.rapport_k_b]).toEqual([0, 3]);
            expect([p.rapport_s_a, p.rapport_s_b]).toEqual([0, 3]);
        });

        it("has no extent without threading", () => {
            const p = new Pattern(4, 4, 4, 4);
            p.recalc_weave();
            expect(p.hasExtent()).toBe(false);
            expect(p.rapport_k_b).toBe(-1);
        });

        it("takes the range value from the tie-up", () => {
            const p = new Pattern(2, 1, 1, 1);
            p.entering.set_shaft(1, 1);
            p.tieup.set(0, 0, 3);
            p.treadling.set(0, 0, 1);
            p.recalc_weave();
            expect(rows(p.weave)).toEqual([".3"]);
            expect(p.min_x).toBe(1);  // extent starts at the first warp
        });

        it("uses the pegplan when the editor is in pegplan mode", () => {
            const p = twill({ isPegplan: () => true });
            fill(p.pegplan, ["1...", ".1..", "..1.", "...1",
                             "1...", ".1..", "..1.", "...1"]);
            p.recalc_weave();
            expect(rows(p.weave).slice(0, 2)).toEqual(
                ["1...1...", ".1...1.."]);
        });
    });

    describe("threading, tie-up and treadling from the weave", () => {
        it("reconstructs a straight draw for a twill", () => {
            const p = new Pattern(8, 8, 8, 8);
            fill(p.weave, TWILL);
            p.recalc_from_weave({});
            expect([...p.entering.data]).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
            p.recalc_weave();
            expect(rows(p.weave)).toEqual(TWILL);
        });

        it("round-trips any weave", () => {
            // Deterministic pseudo-random weaves, values 1..3, some cells
            // switched off (negative = empty).
            // At most 9 warps / wefts, so 12 shafts / treadles suffice.
            const rand = randomSource(7);
            let nonEmpty = 0;
            for (let k = 0; k < 200; k++) {
                const w = 1 + rand(9), h = 1 + rand(9);
                const p = new Pattern(w, h, 12, 12);
                const before = [];
                for (let j = 0; j < h; j++) {
                    for (let i = 0; i < w; i++) {
                        const v = rand(3) === 0 ? 0 : (rand(5) - 1);
                        p.weave.set(i, j, v);
                        before.push(Math.max(0, v));
                    }
                }
                p.recalc_from_weave({});
                p.recalc_weave();
                expect([...p.weave.data]).toEqual(before);
                if (before.some((v) => v > 0)) nonEmpty++;
            }
            // The generator really produces varied weaves.
            expect(nonEmpty).toBeGreaterThan(150);
        });

        it("rebuilds the pegplan instead in pegplan mode", () => {
            const p = new Pattern(4, 2, 4, 4, { isPegplan: () => true });
            fill(p.weave, ["1.1.", ".1.1"]);
            p.recalc_from_weave({ display_pegplan: true });
            expect(rows(p.pegplan)).toEqual(["1...", ".1.."]);
            expect(rows(p.treadling)).toEqual(["....", "...."]);
        });

        it("calls the editor's hooks", () => {
            const recalcFixedEntering = vi.fn(() => 2);
            const afterRecalcFromWeave = vi.fn();
            const p = new Pattern(2, 2, 4, 4,
                { recalcFixedEntering, afterRecalcFromWeave });
            fill(p.weave, ["1.", ".1"]);
            const settings = { threading_arrangement: "fixiert" };
            p.recalc_from_weave(settings);
            // no fixed template yet: the normal threading is computed
            expect(recalcFixedEntering).not.toHaveBeenCalled();
            p.fixeinzug = [1, 2];
            p.recalc_from_weave(settings);
            expect(recalcFixedEntering).toHaveBeenCalledWith(p);
            expect(afterRecalcFromWeave).toHaveBeenCalledWith(settings);
        });
    });
});

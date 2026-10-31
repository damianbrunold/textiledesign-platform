import { describe, expect, it } from "vitest";
import { Pattern } from "../../src/textileplatform/static/js/weave/model.js";
import {
    checkSteppedParams, threadStepped, threadStraight,
} from "../../src/textileplatform/static/js/weave/threading-wizard-ops.js";

const shafts = (p, n = p.entering.width) => p.entering.data.slice(0, n);

describe("straight threading", () => {
    it("rising (Z) from warp 1, shaft 1", () => {
        const p = new Pattern(8, 4, 8, 8);
        threadStraight(p, 1, 1, 4, true);
        expect(shafts(p)).toEqual([1, 2, 3, 4, 0, 0, 0, 0]);
    });

    it("rising from warp 3, shaft 2", () => {
        const p = new Pattern(8, 4, 8, 8);
        threadStraight(p, 3, 2, 3, true);
        expect(shafts(p)).toEqual([0, 0, 2, 3, 4, 0, 0, 0]);
    });

    it("falling (S) from warp 1", () => {
        const p = new Pattern(8, 4, 8, 8);
        threadStraight(p, 1, 2, 4, false);
        expect(shafts(p)).toEqual([5, 4, 3, 2, 0, 0, 0, 0]);
    });

    // Regression (the desktop's createGerade still has it): the first
    // warp number leaked into the falling shafts, so from warp 3 on
    // shafts 2..4 it threaded 6, 5, 4.
    it("falling from warp 3 uses the requested shafts", () => {
        const p = new Pattern(8, 4, 8, 8);
        threadStraight(p, 3, 2, 3, false);
        expect(shafts(p)).toEqual([0, 0, 4, 3, 2, 0, 0, 0]);
    });

    it("leaves the other warps alone", () => {
        const p = new Pattern(6, 4, 8, 8);
        p.entering.data = [7, 7, 7, 7, 7, 7];
        threadStraight(p, 2, 1, 2, true);
        expect(shafts(p)).toEqual([7, 1, 2, 7, 7, 7]);
    });

    it("stops at the last shaft of the tie-up and the last warp", () => {
        const p = new Pattern(8, 4, 3, 3);
        threadStraight(p, 1, 1, 5, true);
        expect(shafts(p)).toEqual([1, 2, 3, 0, 0, 0, 0, 0]);
        const q = new Pattern(3, 4, 8, 8);
        threadStraight(q, 2, 1, 4, true);
        expect(q.entering.data).toEqual([0, 1, 2]);
    });
});

describe("stepped threading", () => {
    it("runs of 2 on shafts 1..4, offset 1", () => {
        const p = new Pattern(10, 4, 8, 8);
        threadStepped(p, 1, 1, 4, 2, 1);
        expect(shafts(p)).toEqual([1, 2, 2, 3, 3, 4, 0, 0, 0, 0]);
    });

    it("runs of 3 on shafts 1..6, offset 2", () => {
        const p = new Pattern(10, 4, 8, 8);
        threadStepped(p, 1, 1, 6, 3, 2);
        expect(shafts(p)).toEqual([1, 2, 3, 3, 4, 5, 5, 6, 0, 0]);
    });

    it("a negative offset steps down until shaft 1", () => {
        const p = new Pattern(10, 4, 8, 8);
        threadStepped(p, 2, 3, 4, 2, -1);
        expect(shafts(p)).toEqual([0, 3, 4, 2, 3, 1, 2, 0, 0, 0]);
    });

    it("run length = number of shafts is a single straight run", () => {
        const p = new Pattern(10, 4, 8, 8);
        threadStepped(p, 1, 1, 4, 4, 2);
        expect(shafts(p)).toEqual([1, 2, 3, 4, 0, 0, 0, 0, 0, 0]);
    });

    it("stops at the last shaft of the tie-up and the last warp", () => {
        const p = new Pattern(10, 4, 3, 3);
        threadStepped(p, 1, 1, 6, 2, 1);
        expect(shafts(p)).toEqual([1, 2, 2, 3, 3, 0, 0, 0, 0, 0]);
        const q = new Pattern(4, 4, 8, 8);
        threadStepped(q, 1, 1, 8, 2, 1);
        expect(q.entering.data).toEqual([1, 2, 2, 3]);
    });

    it("checks run length and offset like the dialog", () => {
        expect(checkSteppedParams(4, 2, 1)).toBeNull();
        expect(checkSteppedParams(4, 4, -4)).toBeNull();
        expect(checkSteppedParams(4, 0, 1)).toBe("gratlen");
        expect(checkSteppedParams(4, 5, 1)).toBe("gratlen");
        expect(checkSteppedParams(4, 2, 0)).toBe("versatz");
        expect(checkSteppedParams(4, 2, -5)).toBe("versatz");
    });

    it("terminates for every valid parameter combination", () => {
        for (let n = 1; n <= 8; n++) {
            for (let g = 1; g <= n; g++) {
                for (let v = -n; v <= n; v++) {
                    if (checkSteppedParams(n, g, v)) continue;
                    const p = new Pattern(64, 4, 16, 16);
                    threadStepped(p, 1, 1, n, g, v);
                    // Every shaft used lies in 1..n, and rising runs
                    // start at shaft 1.
                    const used = p.entering.data.filter((s) => s > 0);
                    expect(used[0]).toBe(1);
                    expect(used.every((s) => s >= 1 && s <= n)).toBe(true);
                }
            }
        }
    });
});

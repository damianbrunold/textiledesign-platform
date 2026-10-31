import { describe, expect, it } from "vitest";
import {
    commitFixedThreading, fixedThreadingFirstFree, fixedThreadingScratch,
    fixedThreadingSize, isContinuousThreading, toggleFixedThreading,
} from "../../src/textileplatform/static/js/weave/fixed-threading-ops.js";
import { updateFixedEntering } from "../../src/textileplatform/static/js/weave/arrange.js";
import { Pattern } from "../../src/textileplatform/static/js/weave/model.js";

const padded = (values, w) => [...values, ...new Array(w - values.length).fill(0)];

describe("fixed threading template", () => {
    it("size is the index of the last threaded warp", () => {
        expect(fixedThreadingSize([0, 0, 0])).toBe(0);
        expect(fixedThreadingSize([1, 2, 0, 3, 0])).toBe(3);
    });

    it("firstfree is the highest shaft used", () => {
        expect(fixedThreadingFirstFree([0, 0])).toBe(0);
        expect(fixedThreadingFirstFree([1, 4, 2, 0])).toBe(4);
    });

    it("a click threads a warp on a shaft or unthreads it", () => {
        const scratch = [1, 2, 0, 0];
        expect(toggleFixedThreading(scratch, 2, 2)).toBe(2);
        expect(scratch).toEqual([1, 2, 3, 0]);
        expect(toggleFixedThreading(scratch, 0, 3)).toBe(2);   // move to shaft 4
        expect(scratch).toEqual([4, 2, 3, 0]);
        expect(toggleFixedThreading(scratch, 2, 2)).toBe(1);   // same shaft: off
        expect(scratch).toEqual([4, 2, 0, 0]);
    });

    it("must be continuous up to its last warp", () => {
        expect(isContinuousThreading([1, 2, 3, 0], 2)).toBe(true);
        expect(isContinuousThreading([1, 0, 3, 0], 2)).toBe(false);
        expect(isContinuousThreading([0, 0], 0)).toBe(true);
    });

    it("is stored repeated out to the threading width", () => {
        const p = new Pattern(8, 4, 8, 8);
        commitFixedThreading(p, padded([1, 3, 2], 8), 2);
        expect(p.fixeinzug).toEqual([1, 3, 2, 1, 3, 2, 1, 3]);
        expect(p.fixsize).toBe(2);
        expect(p.firstfree).toBe(3);
    });

    it("storing does not alias the editing buffer", () => {
        const p = new Pattern(4, 4, 8, 8);
        const scratch = padded([2, 1], 4);
        commitFixedThreading(p, scratch, 1);
        expect(scratch).toEqual([2, 1, 0, 0]);
        scratch[0] = 5;
        expect(p.fixeinzug).toEqual([2, 1, 2, 1]);
    });

    it("an unchanged dialog stores the same template again", () => {
        const p = new Pattern(10, 4, 8, 8);
        commitFixedThreading(p, padded([1, 2, 3, 4], 10), 3);
        const stored = [...p.fixeinzug];
        commitFixedThreading(p, fixedThreadingScratch(p), p.fixsize);
        expect(p.fixeinzug).toEqual(stored);
        expect(p.fixsize).toBe(3);
    });

    // Regression: the editing buffer once held the stored repeats too,
    // so the first click made the whole threading width the template
    // and an edit changed only one warp.
    it("editing the template changes every repeat", () => {
        const p = new Pattern(10, 4, 8, 8);
        commitFixedThreading(p, padded([1, 2, 3, 4], 10), 3);
        const scratch = fixedThreadingScratch(p);
        const size = toggleFixedThreading(scratch, 1, 2);   // warp 2 -> shaft 3
        commitFixedThreading(p, scratch, size);
        expect(p.fixsize).toBe(3);
        expect(p.fixeinzug).toEqual([1, 3, 3, 4, 1, 3, 3, 4, 1, 3]);
    });

    it("taking the threading from the pattern edits only the template", () => {
        const p = new Pattern(10, 4, 8, 8);
        [3, 0, 1, 2].forEach((s, i) => p.entering.set_shaft(i, s));
        updateFixedEntering(p);          // "Take from pattern"
        const scratch = fixedThreadingScratch(p);
        expect(scratch).toEqual(padded([3, 1, 2], 10));
        expect(fixedThreadingSize(scratch)).toBe(p.fixsize);
    });
});

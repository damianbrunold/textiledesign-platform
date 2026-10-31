import { describe, expect, it } from "vitest";
import { Grid } from "../../src/textileplatform/static/js/weave/model.js";
import {
    encodeUserdefRect, isUsableUserdef, parseUserdefSlots, stampUserdef,
} from "../../src/textileplatform/static/js/weave/userdef-ops.js";
import { randomSource } from "./helpers/random.js";

const rand = randomSource(99);

function grid(w, h, fill = 0) {
    const g = new Grid(w, h);
    g.data.fill(fill);
    return g;
}

describe("stored slots", () => {
    it("are ten nulls when nothing (or garbage) is stored", () => {
        const none = new Array(10).fill(null);
        expect(parseUserdefSlots(null)).toEqual(none);
        expect(parseUserdefSlots("")).toEqual(none);
        expect(parseUserdefSlots("{not json")).toEqual(none);
        expect(parseUserdefSlots('{"a": 1}')).toEqual(none);
    });

    it("keep usable slots and drop incomplete ones", () => {
        const slots = parseUserdefSlots(JSON.stringify([
            { description: "Twill", sizex: 2, sizey: 1, data: "lk" },
            null,
            { description: "no size", sizex: 0, sizey: 1, data: "l" },
            { sizex: "3", sizey: 1, data: "lll" },
            { description: "no data", sizex: 1, sizey: 1 },
        ]));
        expect(slots).toHaveLength(10);
        expect(slots[0]).toEqual({ description: "Twill", sizex: 2, sizey: 1, data: "lk" });
        expect(slots[1]).toBeNull();
        expect(slots[2]).toBeNull();
        expect(slots[3]).toEqual({ description: "", sizex: 3, sizey: 1, data: "lll" });
        expect(slots[4]).toBeNull();
        expect(slots.slice(5)).toEqual(new Array(5).fill(null));
    });

    it("are usable with data for every cell", () => {
        expect(isUsableUserdef(null)).toBe(false);
        expect(isUsableUserdef({ sizex: 1, sizey: 1, data: "" })).toBe(false);
        expect(isUsableUserdef({ sizex: 2, sizey: 2, data: "lkl" })).toBe(false);
        expect(isUsableUserdef({ sizex: 2, sizey: 2, data: "lklk" })).toBe(true);
    });
});

describe("encoding", () => {
    it("is the k-alphabet, column by column", () => {
        const g = grid(3, 2);
        g.set(0, 0, 1);
        g.set(1, 1, 2);
        g.set(2, 0, -1);   // switched off: stored as unset
        expect(encodeUserdefRect(g, 0, 2, 0, 1)).toBe("lkkmkk");
        expect(encodeUserdefRect(g, 1, 1, 0, 1)).toBe("km");
    });
});

describe("insertion", () => {
    const slot = { description: "", sizex: 2, sizey: 3, data: "lkmkkl" };

    it("stamps the slot with its lower left corner at the cursor", () => {
        const g = grid(5, 5);
        expect(stampUserdef(g, slot, 1, 1, false)).toEqual({ x1: 1, y1: 1, x2: 2, y2: 3 });
        // Column 1: 1, 0, 2 (bottom up); column 2: 0, 0, 1.
        expect([g.get(1, 1), g.get(1, 2), g.get(1, 3)]).toEqual([1, 0, 2]);
        expect([g.get(2, 1), g.get(2, 2), g.get(2, 3)]).toEqual([0, 0, 1]);
        expect(g.data.filter((v) => v !== 0)).toHaveLength(3);
    });

    it("clears under unset cells, unless transparent", () => {
        const opaque = grid(2, 3, 5);
        stampUserdef(opaque, slot, 0, 0, false);
        expect(opaque.data).toEqual([1, 0, 0, 0, 2, 1]);
        const transparent = grid(2, 3, 5);
        stampUserdef(transparent, slot, 0, 0, true);
        expect(transparent.data).toEqual([1, 5, 5, 5, 2, 1]);
    });

    it("is clipped to the weave", () => {
        const g = grid(3, 3);
        expect(stampUserdef(g, slot, 2, 1, false)).toEqual({ x1: 2, y1: 1, x2: 2, y2: 2 });
        expect([g.get(2, 1), g.get(2, 2)]).toEqual([1, 0]);
        expect(g.data.filter((v) => v !== 0)).toHaveLength(1);
    });

    it("gives back what was stored", () => {
        for (let run = 0; run < 30; run++) {
            const w = 1 + rand(6), h = 1 + rand(6);
            const src = grid(10, 10);
            for (let k = 0; k < src.data.length; k++) {
                src.data[k] = rand(3) ? 0 : (rand(4) ? 1 + rand(9) : -1);
            }
            const i1 = rand(10 - w + 1), j1 = rand(10 - h + 1);
            const stored = parseUserdefSlots(JSON.stringify([{
                description: "x", sizex: w, sizey: h,
                data: encodeUserdefRect(src, i1, i1 + w - 1, j1, j1 + h - 1),
            }]))[0];
            expect(isUsableUserdef(stored)).toBe(true);
            const dst = grid(12, 12, 7);
            const x = rand(12 - w + 1), y = rand(12 - h + 1);
            stampUserdef(dst, stored, x, y, false);
            for (let i = 0; i < w; i++) {
                for (let j = 0; j < h; j++) {
                    expect(dst.get(x + i, y + j)).toBe(Math.max(0, src.get(i1 + i, j1 + j)));
                }
            }
        }
    });
});

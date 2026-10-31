import { describe, expect, it } from "vitest";
import {
    loadPatternData, loadSettings, storePatternData, storeSettings, val,
} from "../../src/textileplatform/static/js/weave/io.js";
import { Pattern } from "../../src/textileplatform/static/js/weave/model.js";

// Stored pattern JSON as patterns.new_weave_pattern creates it.
function newData(width, height, maxShafts = 8, maxTreadles = 8) {
    return {
        name: "p", width, height,
        max_shafts: maxShafts, max_treadles: maxTreadles,
        data_entering: new Array(width).fill(0),
        data_tieup: new Array(maxShafts * maxTreadles).fill(0),
        data_treadling: new Array(maxTreadles * height).fill(0),
        data_reed: new Array(width).fill(0).map((_, i) => (i % 4 < 2 ? 0 : 1)),
        colors_warp: new Array(width).fill(55),
        colors_weft: new Array(height).fill(49),
        palette: [[255, 0, 0, 0], [0, 255, 0, 7], [0, 0, 255, 0]],
    };
}

function patternFor(data, hooks) {
    return new Pattern(data.width, data.height, data.max_shafts,
                       data.max_treadles, hooks);
}

function load(data, options, hooks) {
    const p = patternFor(data, hooks);
    loadPatternData(data, p, options);
    return p;
}

// 2/2 twill: straight draw over 4 shafts, straight treadling.
function twillData() {
    const d = newData(8, 8);
    for (let i = 0; i < 8; i++) d.data_entering[i] = (i % 4) + 1;
    const tie = ["11..", ".11.", "..11", "1..1"];
    tie.forEach((row, shaft) => [...row].forEach((c, treadle) => {
        if (c === "1") d.data_tieup[treadle + shaft * d.max_treadles] = 1;
    }));
    for (let j = 0; j < 8; j++) d.data_treadling[(j % 4) + j * d.max_treadles] = 1;
    return d;
}

describe("val", () => {
    it("falls back only for missing keys", () => {
        expect(val({ a: 0 }, "a", 5)).toBe(0);
        expect(val({ a: null }, "a", 5)).toBe(null);
        expect(val({}, "a", 5)).toBe(5);
    });
});

describe("loadPatternData", () => {
    it("loads the grids and computes the weave", () => {
        const p = load(twillData());
        expect(p.entering.get_shaft(5)).toBe(2);
        expect(p.weave.get(0, 0)).toBe(1);
        expect(p.weave.get(1, 0)).toBe(0);
        expect([p.min_x, p.max_x, p.min_y, p.max_y]).toEqual([0, 7, 0, 7]);
        expect([p.rapport_k_a, p.rapport_k_b]).toEqual([0, 3]);
    });

    it("takes colours, reed and palette", () => {
        const d = twillData();
        d.colors_warp[2] = 7;
        d.colors_weft[3] = 9;
        const p = load(d);
        expect(p.color_warp.get(2, 0)).toBe(7);
        expect(p.color_weft.get(0, 3)).toBe(9);
        expect(p.reed.get(2, 0)).toBe(1);
        expect(p.palette).toEqual([[255, 0, 0], [0, 255, 0], [0, 0, 255]]);
    });

    it("accepts patterns without the optional arrays", () => {
        const d = newData(4, 4);
        delete d.palette;
        const p = load(d);
        expect(p.palette).toEqual([]);
        expect(p.hlines).toEqual([]);
        expect(p.hasExtent()).toBe(false);
    });

    it("loads muster slots, fixed threading and guide lines", () => {
        const d = newData(4, 4);
        d.data_blockmuster = [[0, 3], "junk", [null, 1]];
        d.data_fixeinzug = [2, null, 1];
        d.fixsize = 3;
        d.hlines = [{ typ: "vert", feld: 1, pos: 2 }, null,
                    { typ: "x", feld: 0, pos: -1 }, { typ: "x", pos: 1 }];
        const p = load(d);
        expect(p.blockmuster[0].get(1, 0)).toBe(3);
        expect(p.blockmuster[2].get(1, 0)).toBe(1);
        expect(p.fixeinzug).toEqual([2, 0, 1, 0]);
        expect(p.fixsize).toBe(3);
        expect(p.hlines).toEqual([{ typ: "vert", feld: 1, pos: 2 },
                                  { typ: "horz", feld: 0, pos: 1 }]);
    });

    it("derives an empty pegplan from the treadling in pegplan mode", () => {
        // .dbw imports carry no pegplan.
        const p = load(twillData(), { pegplan: true },
                       { isPegplan: () => true });
        expect(p.pegplan.get(0, 0)).toBe(1);   // shaft 1 up in weft 0
        expect(p.pegplan.get(1, 0)).toBe(0);
        expect(p.weave.get(0, 0)).toBe(1);
        expect(p.weave.get(1, 0)).toBe(0);
    });

    it("keeps a stored pegplan in pegplan mode", () => {
        const d = twillData();
        d.data_pegplan = new Array(d.max_shafts * d.height).fill(0);
        d.data_pegplan[1] = 1;  // weft 0: shaft 2 only
        const p = load(d, { pegplan: true }, { isPegplan: () => true });
        expect(p.weave.get(1, 0)).toBe(1);
        expect(p.weave.get(0, 0)).toBe(0);
    });
});

describe("storePatternData", () => {
    it("writes the grids back in the stored layout", () => {
        const d = twillData();
        const p = load(d);
        p.entering.set_shaft(7, 8);
        p.tieup.set(5, 6, 2);
        p.pegplan.set(3, 2, 1);
        storePatternData(d, p);
        expect(d.data_entering[7]).toBe(8);
        expect(d.data_tieup[5 + 6 * d.max_treadles]).toBe(2);
        expect(d.data_pegplan[3 + 2 * d.max_shafts]).toBe(1);
        expect(d.data_blockmuster).toHaveLength(10);
        expect(d.data_fixeinzug).toHaveLength(8);
        expect([d.rapport_k_a, d.rapport_k_b]).toEqual([0, 3]);
    });

    it("keeps the palette's fourth channel", () => {
        const d = twillData();
        const p = load(d);
        p.palette[1] = [1, 2, 3];
        storePatternData(d, p);
        expect(d.palette[1]).toEqual([1, 2, 3, 7]);
        expect(d.palette[0]).toEqual([255, 0, 0, 0]);
    });
});

describe("save and reload", () => {
    function reload(data, options, hooks) {
        const p = load(data, options, hooks);
        const again = structuredClone(data);
        storePatternData(again, p);
        return again;
    }

    it("round-trips an edited pattern", () => {
        const d = twillData();
        d.colors_warp[1] = 3;
        storePatternData(d, load(d));   // normalise the optional keys
        expect(reload(d)).toEqual(d);
    });

    it("keeps a tie-up prepared before threading and treadling", () => {
        // Tie up first, thread and tread later: a common way to start.
        const d = newData(8, 8);
        d.data_tieup[2 + 3 * d.max_treadles] = 1;
        d.data_tieup[5 + 7 * d.max_treadles] = 1;
        storePatternData(d, load(d));
        expect(d.data_tieup[2 + 3 * d.max_treadles]).toBe(1);
        expect(reload(d)).toEqual(d);
    });

    it("keeps switched-off cells (negative values) as they are", () => {
        // Switching a cell off keeps its range as a negative value.
        const d = twillData();
        d.data_tieup[3 + 5 * d.max_treadles] = -2;
        d.data_treadling[6 + 7 * d.max_treadles] = -3;   // unused row
        d.data_pegplan = new Array(d.max_shafts * d.height).fill(0);
        d.data_pegplan[2 + 4 * d.max_shafts] = -1;
        storePatternData(d, load(d));
        expect(reload(d)).toEqual(d);
        const p = load(d);
        expect(p.tieup.get(3, 5)).toBe(-2);
        expect(p.treadling.get(6, 7)).toBe(-3);
        expect(p.pegplan.get(2, 4)).toBe(-1);
        // ...and they stay out of the weave and the extent
        expect(p.weave.data.every((v) => v >= 0)).toBe(true);
        expect(p.max_y).toBe(7);
    });

    it("keeps tie-up cells of unused shafts and treadles", () => {
        const d = twillData();
        d.data_tieup[6 + 6 * d.max_treadles] = 2;   // treadle 7, shaft 7
        storePatternData(d, load(d));
        expect(d.data_tieup[6 + 6 * d.max_treadles]).toBe(2);
    });
});

describe("settings", () => {
    it("uses defaults, then device preferences, then the pattern", () => {
        const s = {};
        loadSettings({}, s);
        expect(s.style).toBe("draft");
        expect(s.entering_style).toBe("filled");
        expect(s.single_treadling).toBe(true);
        expect(s.current_range).toBe(1);

        loadSettings({}, s, { prefs: { entering_style: "vdash",
                                       unit_width: 8 } });
        expect(s.entering_style).toBe("vdash");
        expect(s.unit_width).toBe(8);

        loadSettings({ entering_style: "cross", unit_width: 2 }, s,
                     { prefs: { entering_style: "vdash", unit_width: 8 } });
        expect(s.entering_style).toBe("cross");
        expect(s.unit_width).toBe(2);
    });

    it("coerces unknown styles and out-of-range ranges", () => {
        const s = {};
        loadSettings({ tieup_style: "", treadling_style: "zigzag",
                       current_range: 13 }, s,
                     { styles: new Set(["filled", "dot"]) });
        expect(s.tieup_style).toBe("filled");
        expect(s.treadling_style).toBe("filled");
        expect(s.current_range).toBe(1);
    });

    it("round-trips through the stored keys", () => {
        const s = {};
        loadSettings({}, s);
        Object.assign(s, { style: "color", current_range: 4,
                           display_pegplan: true, cursor_dir: 8 });
        const d = {};
        storeSettings(d, s);
        expect(d.weave_style).toBe("color");
        expect(Object.keys(d)).toHaveLength(40);
        const again = {};
        loadSettings(d, again);
        for (const key of ["style", "current_range", "display_pegplan",
                           "cursor_dir", "entering_style"]) {
            expect(again[key]).toEqual(s[key]);
        }
    });
});

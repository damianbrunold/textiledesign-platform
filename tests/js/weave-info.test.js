import { describe, expect, it } from "vitest";
import {
    floatStats, fmt3g, infoColors, infoFloats, infoGeneral, infoHeddles,
} from "../../src/textileplatform/static/js/weave/info-ops.js";
import { Pattern } from "../../src/textileplatform/static/js/weave/model.js";

const noProps = { author: "", organization: "", notes: "" };

function emptyPattern() {
    const p = new Pattern(4, 4, 4, 4);
    p.recalc_weave_extent();
    return p;
}

// A pattern with only a weave, from rows (top row = highest weft).
function weavePattern(rows) {
    const h = rows.length, w = rows[0].length;
    const p = new Pattern(w, h, 4, 4);
    rows.forEach((row, r) => [...row].forEach((c, i) => {
        if (c !== ".") p.weave.set(i, h - 1 - r, Number(c));
    }));
    p.recalc_weave_extent();
    return p;
}

// Tabby over 4 warps x 4 wefts on 2 shafts / 2 treadles, in a larger grid.
function tabby() {
    const p = new Pattern(6, 6, 4, 4);
    [1, 2, 1, 2].forEach((s, i) => p.entering.set_shaft(i, s));
    p.tieup.set(0, 0, 1);
    p.tieup.set(1, 1, 1);
    for (let j = 0; j < 4; j++) p.treadling.set(j % 2, j, 1);
    p.recalc_weave();
    return p;
}

describe("fmt3g", () => {
    it("formats like %1.3g", () => {
        expect(fmt3g(0)).toBe("0");
        expect(fmt3g(1)).toBe("1");
        expect(fmt3g(12.5)).toBe("12.5");
        expect(fmt3g(33.3333)).toBe("33.3");
        expect(fmt3g(66.6667)).toBe("66.7");
        expect(fmt3g(50)).toBe("50");
        expect(fmt3g(0.05)).toBe("0.05");
        expect(fmt3g(1.75)).toBe("1.75");
        expect(fmt3g(NaN)).toBe("0");
    });

    // Regression: the trailing-zero regex once stripped the zeros of
    // three-digit integers too (100 % showed as "1%", hue 120 as 12).
    it("keeps the zeros of three-digit integers", () => {
        expect(fmt3g(100)).toBe("100");
        expect(fmt3g(120)).toBe("120");
        expect(fmt3g(250)).toBe("250");
        expect(fmt3g(0.5)).toBe("0.5");
        expect(fmt3g(1000)).toBe("1e+3");
    });
});

describe("general", () => {
    it("size, repeat, shafts, treadles, balance and notes", () => {
        const p = tabby();
        expect(infoGeneral(p, { author: "Ann", organization: "", notes: "x\ny" })).toEqual([
            "Author: Ann",
            "Pattern size: 4 x 4",
            "Pattern repeat: 2 x 2",
            "Number of shafts: 2",
            "Number of treadles: 2",
            "The pattern is balanced",
            "",
            "Notes:",
            "x",
            "y",
        ]);
    });

    it("warp and weft sided patterns", () => {
        const warpSided = weavePattern([
            "111",
            "1.1",
        ]);
        expect(infoGeneral(warpSided, noProps)).toContain(
            "The pattern is warp sided (83.3% rising binding points)");
        const weftSided = weavePattern([
            "1..",
            "..1",
        ]);
        expect(infoGeneral(weftSided, { ...noProps, organization: "Guild" })).toEqual([
            "Organization: Guild",
            "Pattern size: 3 x 2",
            "Number of shafts: 0",
            "Number of treadles: 0",
            "The pattern is weft sided (66.7% sinking binding points)",
        ]);
    });

    it("counts within the extent only", () => {
        const p = weavePattern([
            "......",
            "..1...",
            "..1.1.",
            "......",
        ]);
        expect(infoGeneral(p, noProps)).toEqual([
            "Pattern size: 3 x 2",
            "Number of shafts: 0",
            "Number of treadles: 0",
            "The pattern is balanced",
        ]);
    });

    it("is empty for an empty pattern", () => {
        expect(infoGeneral(emptyPattern(), { ...noProps, author: "A" }))
            .toEqual([]);
    });

    it("translates through L", () => {
        const L = (k) => `<${k}>`;
        expect(infoGeneral(tabby(), noProps, L).slice(0, 2)).toEqual([
            "<info.size> 4 x 4",
            "<info.repeat> 2 x 2",
        ]);
    });
});

describe("colors", () => {
    // Stand-in for ColorPicker.rgbToHsv with easy numbers.
    const hsv = (r, g, b) => [r / 10, g / 255, b / 255];

    it("counts colours and threads per colour", () => {
        const p = weavePattern([
            "1...",
            "....",
            "....",
            "...1",
        ]);
        p.palette = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
        [0, 0, 1, 0].forEach((c, i) => p.color_warp.set(i, 0, c));
        [2, 2, 1, 2].forEach((c, j) => p.color_weft.set(0, j, c));
        expect(infoColors(p, hsv)).toEqual([
            "Number of colors:",
            "Total: 3",
            "In warp: 2",
            "In weft: 2",
            "",
            "Warp colors:",
            "  Color 1: HSV=(25.5,0,0), RGB=(255,0,0), 3 warp ends  (75%)",
            "  Color 2: HSV=(0,1,0), RGB=(0,255,0), 1 warp ends  (25%)",
            "",
            "Weft colors:",
            "  Color 1: HSV=(0,1,0), RGB=(0,255,0), 1 weft picks  (25%)",
            "  Color 2: HSV=(0,0,1), RGB=(0,0,255), 3 weft picks  (75%)",
            "",
        ]);
    });

    it("a single-colour warp is 100 %", () => {
        const p = weavePattern(["11"]);
        p.palette = [[0, 0, 0]];
        expect(infoColors(p, hsv)).toContain(
            "  Color 1: HSV=(0,0,0), RGB=(0,0,0), 2 warp ends  (100%)");
    });
});

describe("floats", () => {
    const p = weavePattern([
        "1.11..",
        "..1..1",
    ]);

    it("weft floats are runs of unset cells along a weft", () => {
        // Top weft: 1 | 2 (open at the edge); bottom: 2 | 2.
        expect(floatStats(p, true)).toEqual({
            table: [0, 1, 3, 0, 0, 0, 0], longest: 2, count: 4, mean: 1.75,
        });
    });

    it("warp floats are runs of set cells along a warp", () => {
        // Warps 0, 3 (lower end) and 5 (top end): 1; warp 2: 2.
        expect(floatStats(p, false)).toEqual({
            table: [0, 3, 1], longest: 2, count: 4, mean: 1.25,
        });
    });

    it("reports both directions", () => {
        expect(infoFloats(p)).toEqual([
            "Weft floats:",
            "Longest float: 2",
            "Average float: 1.75",
            "Distribution:",
            "  Float 1:  1 floats  (25%)",
            "  Float 2:  3 floats  (75%)",
            "",
            "Warp floats:",
            "Longest float: 2",
            "Average float: 1.25",
            "Distribution:",
            "  Float 1:  3 floats  (75%)",
            "  Float 2:  1 floats  (25%)",
            "",
        ]);
    });

    it("a fully set weave has one weft-long warp float per warp and no weft floats", () => {
        const full = weavePattern(["111", "111"]);
        expect(floatStats(full, true)).toEqual(
            { table: [0, 0, 0, 0], longest: 0, count: 0, mean: 0 });
        expect(floatStats(full, false)).toEqual(
            { table: [0, 0, 3], longest: 2, count: 3, mean: 2 });
    });

    it("float lengths add up to the cells of their kind", () => {
        const q = weavePattern([
            "1..1.11.",
            ".11..1..",
            "1....111",
            "..1.1..1",
        ]);
        const total = (s) => s.table.reduce((sum, n, k) => sum + n * k, 0);
        expect(total(floatStats(q, true))).toBe(32 - 14);   // unset cells
        expect(total(floatStats(q, false))).toBe(14);       // set cells
    });

    it("is empty for an empty pattern", () => {
        expect(floatStats(emptyPattern(), true)).toBeNull();
        expect(infoFloats(emptyPattern())).toEqual([]);
    });
});

describe("heddles", () => {
    it("counts heddles per used shaft, numbering only the used ones", () => {
        const p = new Pattern(8, 2, 4, 4);
        [1, 3, 1, 3, 0, 4, 0, 0].forEach((s, i) => p.entering.set_shaft(i, s));
        expect(infoHeddles(p)).toEqual([
            "Number of heddles: 5",
            "Distribution across the shafts:",
            "  Shaft 1:  2 heddles  (40%)",
            "  Shaft 2:  2 heddles  (40%)",
            "  Shaft 3:  1 heddles  (20%)",
            "",
        ]);
    });

    it("an empty threading has no heddles", () => {
        expect(infoHeddles(new Pattern(4, 2, 4, 4))).toEqual([
            "Number of heddles: 0",
            "Distribution across the shafts:",
            "",
        ]);
    });
});

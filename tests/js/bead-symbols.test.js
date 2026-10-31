import { describe, expect, it } from "vitest";
import {
    contrastingColor, DEFAULT_SYMBOLS, padSymbols, setSymbol, symbolFor,
} from "../../src/textileplatform/static/js/bead/symbols.js";

describe("symbolFor", () => {
    it("reads the glyph by palette index", () => {
        expect(symbolFor("·xyz", 2)).toBe("y");
    });

    it("draws nothing for spaces, gaps and negative indices", () => {
        expect(symbolFor("a b", 1)).toBe("");
        expect(symbolFor("ab", 5)).toBe("");
        expect(symbolFor("ab", -1)).toBe("");
    });

    it("uses the defaults when there are no symbols", () => {
        expect(symbolFor(null, 1)).toBe(DEFAULT_SYMBOLS[1]);
        expect(symbolFor("", 3)).toBe(DEFAULT_SYMBOLS[3]);
    });
});

describe("padSymbols", () => {
    it("fills missing slots from the defaults", () => {
        const s = padSymbols("XY");
        expect(s.slice(0, 2)).toBe("XY");
        expect(s.slice(2)).toBe(DEFAULT_SYMBOLS.slice(2));
    });

    it("keeps longer strings and copes with no symbols", () => {
        const long = "x".repeat(40);
        expect(padSymbols(long, 10)).toBe(long);
        expect(padSymbols(null)).toBe(DEFAULT_SYMBOLS);
    });

    it("pads to the palette size only as far as the defaults go", () => {
        // the defaults have no glyphs past their end
        expect(padSymbols("", 50)).toBe(DEFAULT_SYMBOLS);
    });
});

describe("setSymbol", () => {
    it("sets one slot to the first character typed", () => {
        expect(setSymbol("abc", 1, "XYZ")).toBe("aXc");
    });

    it("appends with spaces past the end", () => {
        expect(setSymbol("ab", 4, "z")).toBe("ab  z");
    });

    it("clears a slot (space) for empty input", () => {
        expect(setSymbol("abc", 0, "")).toBe(" bc");
    });

    it("takes any single BMP character", () => {
        expect(setSymbol("abc", 2, "★")).toBe("ab★");
        expect(setSymbol("abc", 2, "❤️")).toBe("ab❤");   // + variation selector
    });

    it("refuses characters that need two UTF-16 units", () => {
        // An emoji would shift every later colour's symbol, and half of
        // one is not valid text (it broke downloads on the server).
        expect(setSymbol("abc", 1, "🌸")).toBe("abc");
        expect(setSymbol("abc", 1, "\ud83d")).toBe("abc");   // lone half
        expect(setSymbol("abc", 1, "\udf38x")).toBe("abc");
    });
});

describe("contrastingColor", () => {
    it("picks black on light and white on dark beads", () => {
        expect(contrastingColor("rgb(255, 255, 200)")).toBe("#000");
        expect(contrastingColor("rgb(20, 20, 80)")).toBe("#fff");
    });

    it("weights green most (luminance)", () => {
        expect(contrastingColor("rgb(0, 200, 0)")).toBe("#000");
        expect(contrastingColor("rgb(0, 0, 255)")).toBe("#fff");
    });

    it("falls back to black for a missing palette slot", () => {
        expect(contrastingColor(undefined)).toBe("#000");
    });
});

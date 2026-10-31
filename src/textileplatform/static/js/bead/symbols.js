// Per-colour symbol glyphs of the bead editor, and the text colour for
// a bead.
//
// The symbols are one string indexed by palette position — the
// desktop's BeadSymbols.SAVED_SYMBOLS encoding ("·abcdefg…"), persisted
// in data.view.symbols. Like the desktop the string is indexed by
// UTF-16 unit, so a symbol must be a single character of the Basic
// Multilingual Plane: an emoji (two units) would shift every later
// colour's symbol, and half of one is not valid text.
//
//   symbolFor(symbols, colorIdx)        glyph to draw ("" for none)
//   padSymbols(symbols, colorCount)     at least one slot per colour
//   setSymbol(symbols, colorIdx, text)  symbols with one slot changed
//   contrastingColor("rgb(r, g, b)")    "#000" or "#fff"
//
// No DOM and no editor globals.

export const DEFAULT_SYMBOLS = "·abcdefghijklmnopqrstuvwxyz+-/\\*";

export function symbolFor(symbols, colorIdx) {
    if (colorIdx < 0) return "";
    const s = symbols || DEFAULT_SYMBOLS;
    if (colorIdx < s.length) {
        const ch = s.charAt(colorIdx);
        return ch === " " ? "" : ch;
    }
    return "";
}

// Fill missing slots from the defaults, up to the longer of the default
// string and the palette.
export function padSymbols(symbols, colorCount = 0) {
    const target = Math.max(DEFAULT_SYMBOLS.length, colorCount);
    let out = symbols || "";
    if (out.length < target) out += DEFAULT_SYMBOLS.slice(out.length, target);
    return out;
}

// The first character of `text` as colour `colorIdx`'s symbol (a space,
// i.e. no symbol, when `text` is empty). A character outside the Basic
// Multilingual Plane can't be stored and leaves the slot unchanged.
export function setSymbol(symbols, colorIdx, text) {
    const first = text ? String.fromCodePoint(text.codePointAt(0)) : " ";
    // Two units (outside the BMP) or a lone surrogate half.
    if (first.length !== 1 || /[\uD800-\uDFFF]/.test(first)) return symbols;
    if (colorIdx >= symbols.length) {
        return symbols + " ".repeat(colorIdx - symbols.length) + first;
    }
    return symbols.slice(0, colorIdx) + first + symbols.slice(colorIdx + 1);
}

// Black or white text for legibility on `color` ("rgb(r, g, b)").
// Callers occasionally pass undefined when a palette slot is missing
// (a bead value past the end of the palette): black then.
export function contrastingColor(color) {
    if (typeof color !== "string") return "#000";
    const parts = color.slice(4, color.length - 1).split(",");
    const r = parseInt(parts[0].trim(), 10);
    const g = parseInt(parts[1].trim(), 10);
    const b = parseInt(parts[2].trim(), 10);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 128 ? "#000" : "#fff";
}

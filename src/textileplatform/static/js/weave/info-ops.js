// The computations of the pattern info report (desktop
// EntwurfsinfoDialog), behind the dialog in info.js.
//
//   infoGeneral(pattern, props, L)    size, repeat, shafts, treadles, sidedness
//   infoColors(pattern, rgbToHsv, L)  colours in warp and weft
//   floatStats(pattern, weft)         float length distribution
//   infoFloats(pattern, L)            weft and warp floats
//   infoHeddles(pattern, L)           heddles per shaft
//   fmt3g(v)                          the desktop's "%1.3g"
//
// Each info* returns the report lines of its section. L(key, fallback)
// translates (default: the English fallback); props are the pattern's
// { author, organization, notes }. Everything counts within the pattern
// extent (min_x..max_x x min_y..max_y), except the heddles (whole
// threading). No DOM, no editor globals; port of
// entwurfsinfodialog.cpp.

const fallbackL = (k, fb) => fb;

export function fmt3g(v) {
    if (!isFinite(v)) return "0";
    // Match the desktop's "%1.3g" output: at most 3 significant digits,
    // trailing zeros of the fraction dropped (not those of an integer:
    // 100 stays "100").
    return Number(v).toPrecision(3)
        .replace(/\.(\d*?)0+(e|$)/, (m, digits, e) =>
            (digits ? "." + digits : "") + e);
}

function weaveAt(pattern, i, j) {
    if (i < 0 || j < 0) return 0;
    if (i >= pattern.weave.width || j >= pattern.weave.height) return 0;
    return pattern.weave.get(i, j);
}

// === Allgemein ===
export function infoGeneral(pattern, props, L = fallbackL) {
    const lines = [];
    const a = pattern.min_x, b = pattern.max_x;
    const sa = pattern.min_y, sb = pattern.max_y;

    if (b < a || sb < sa) return lines;

    if (props.author)       lines.push(L("info.author", "Author:") + " " + props.author);
    if (props.organization) lines.push(L("info.org",    "Organization:") + " " + props.organization);

    const w = b - a + 1, h = sb - sa + 1;
    lines.push(L("info.size", "Pattern size:") + " " + w + " x " + h);

    if (pattern.rapport_k_b >= pattern.rapport_k_a
        && pattern.rapport_s_b >= pattern.rapport_s_a) {
        const rw = pattern.rapport_k_b - pattern.rapport_k_a + 1;
        const rh = pattern.rapport_s_b - pattern.rapport_s_a + 1;
        lines.push(L("info.repeat", "Pattern repeat:") + " " + rw + " x " + rh);
    }

    let nshafts = 0;
    for (let s = 0; s < pattern.tieup.height; s++) {
        if (!pattern.entering.isRowEmpty(s)) nshafts++;
    }
    lines.push(L("info.shafts", "Number of shafts:") + " " + nshafts);

    let ntreadles = 0;
    for (let t = 0; t < pattern.treadling.width; t++) {
        if (!pattern.treadling.isColEmpty(t)) ntreadles++;
    }
    lines.push(L("info.treadles", "Number of treadles:") + " " + ntreadles);

    const total = w * h;
    let up = 0, down = 0;
    for (let i = a; i <= b; i++) {
        for (let j = sa; j <= sb; j++) {
            if (weaveAt(pattern, i, j) > 0) up++;
            else down++;
        }
    }
    if (up < down) {
        lines.push(L("info.weft-sided", "The pattern is weft sided") + " ("
            + fmt3g(100 * down / total) + "% "
            + L("info.sinking", "sinking binding points)"));
    } else if (up > down) {
        lines.push(L("info.warp-sided", "The pattern is warp sided") + " ("
            + fmt3g(100 * up / total) + "% "
            + L("info.rising", "rising binding points)"));
    } else {
        lines.push(L("info.balanced", "The pattern is balanced"));
    }

    if (props.notes) {
        lines.push("");
        lines.push(L("info.notes", "Notes:"));
        for (const ln of props.notes.split(/\r?\n/)) lines.push(ln);
    }
    return lines;
}

// === Farben ===
// rgbToHsv(r, g, b) -> [h 0..360, s 0..1, v 0..1] (ColorPicker's).
export function infoColors(pattern, rgbToHsv, L = fallbackL) {
    const lines = [];
    const a = pattern.min_x, b = pattern.max_x;
    const sa = pattern.min_y, sb = pattern.max_y;
    if (b < a || sb < sa) return lines;

    const palLen = pattern.palette ? pattern.palette.length : 0;
    const ktable = new Array(palLen + 1).fill(0);
    const stable = new Array(palLen + 1).fill(0);
    const seen = new Set(), seenK = new Set(), seenF = new Set();
    for (let i = a; i <= b; i++) {
        const c = pattern.color_warp.get(i, 0);
        seen.add(c); seenK.add(c);
        ktable[c] = (ktable[c] | 0) + 1;
    }
    for (let j = sa; j <= sb; j++) {
        const c = pattern.color_weft.get(0, j);
        seen.add(c); seenF.add(c);
        stable[c] = (stable[c] | 0) + 1;
    }
    lines.push(L("info.colors-count", "Number of colors:"));
    lines.push(L("info.total", "Total:") + " " + seen.size);
    lines.push(L("info.in-warp", "In warp:") + " " + seenK.size);
    lines.push(L("info.in-weft", "In weft:") + " " + seenF.size);
    lines.push("");

    const emit = (label, table, total, fadenLabel) => {
        lines.push(label);
        let n = 1;
        for (let i = 0; i < palLen; i++) {
            if (!table[i]) continue;
            const [r, g, b2] = pattern.palette[i] || [0, 0, 0];
            const [h, s, v] = rgbToHsv(r, g, b2);
            const pct = fmt3g(100 * table[i] / total);
            lines.push("  "
                + L("info.color", "Color") + " " + n + ": "
                + "HSV=(" + fmt3g(h) + "," + fmt3g(s) + "," + fmt3g(v) + "), "
                + "RGB=(" + r + "," + g + "," + b2 + "), "
                + table[i] + " " + fadenLabel + "  (" + pct + "%)");
            n++;
        }
        lines.push("");
    };
    emit(L("info.warp-colors", "Warp colors:"), ktable, b - a + 1,
        L("info.warp-ends", "warp ends"));
    emit(L("info.weft-colors", "Weft colors:"), stable, sb - sa + 1,
        L("info.weft-picks", "weft picks"));
    return lines;
}

// === Flottierungen ===
// Weft floats (weft = true): runs of unset cells (<= 0) along each
// weft; warp floats: runs of set cells (> 0) along each warp. A run at
// the edge of the extent counts too. table[k] = number of floats of
// length k (1 <= k < table.length). Null for an empty extent.
export function floatStats(pattern, weft) {
    const a = pattern.min_x, b = pattern.max_x;
    const sa = pattern.min_y, sb = pattern.max_y;
    if (b < a || sb < sa) return null;

    const maxflot = (weft ? (b - a + 2) : (sb - sa + 2));
    const table = new Array(maxflot).fill(0);
    let biggest = 0, count = 0;
    if (weft) {
        for (let j = sa; j <= sb; j++) {
            let inflot = weaveAt(pattern, a, j) <= 0;
            let start = inflot ? a : -1;
            for (let i = a; i <= b; i++) {
                if (inflot) {
                    if (weaveAt(pattern, i, j) > 0) {
                        const len = i - start;
                        table[len]++; count++;
                        if (len > biggest) biggest = len;
                        inflot = false; start = -1;
                    }
                } else if (weaveAt(pattern, i, j) <= 0) {
                    inflot = true; start = i;
                }
            }
            if (inflot) {
                const len = b + 1 - start;
                table[len]++; count++;
                if (len > biggest) biggest = len;
            }
        }
    } else {
        for (let i = a; i <= b; i++) {
            let inflot = weaveAt(pattern, i, sa) > 0;
            let start = inflot ? sa : -1;
            for (let j = sa; j <= sb; j++) {
                if (inflot) {
                    if (weaveAt(pattern, i, j) <= 0) {
                        const len = j - start;
                        table[len]++; count++;
                        if (len > biggest) biggest = len;
                        inflot = false; start = -1;
                    }
                } else if (weaveAt(pattern, i, j) > 0) {
                    inflot = true; start = j;
                }
            }
            if (inflot) {
                const len = sb + 1 - start;
                table[len]++; count++;
                if (len > biggest) biggest = len;
            }
        }
    }
    let mean = 0;
    if (count > 0) {
        for (let k = 1; k < maxflot; k++) {
            if (table[k]) mean += table[k] * k / count;
        }
    }
    return { table, longest: biggest, count, mean };
}

function floatLines(pattern, weft, L) {
    const lines = [];
    const stats = floatStats(pattern, weft);
    if (!stats) return lines;
    const { table, longest, count, mean } = stats;
    lines.push(weft ? L("info.weft-floats", "Weft floats:")
                    : L("info.warp-floats", "Warp floats:"));
    lines.push(L("info.longest-float", "Longest float:") + " " + longest);
    lines.push(L("info.average-float", "Average float:") + " " + fmt3g(mean));
    lines.push(L("info.distribution", "Distribution:"));
    for (let k = 1; k < table.length; k++) {
        if (!table[k]) continue;
        lines.push("  " + L("info.float", "Float") + " " + k + ":  "
            + table[k] + " " + L("info.floats", "floats")
            + "  (" + fmt3g(100 * table[k] / count) + "%)");
    }
    lines.push("");
    return lines;
}

export function infoFloats(pattern, L = fallbackL) {
    return floatLines(pattern, true, L).concat(floatLines(pattern, false, L));
}

// === Litzen ===
export function infoHeddles(pattern, L = fallbackL) {
    const lines = [];
    let total = 0;
    for (let i = 0; i < pattern.entering.width; i++) {
        if (pattern.entering.get_shaft(i) !== 0) total++;
    }
    lines.push(L("info.heddles-count", "Number of heddles:") + " " + total);
    lines.push(L("info.distribution-shafts", "Distribution across the shafts:"));
    let shaft = 0;
    for (let s = 0; s < pattern.tieup.height; s++) {
        if (pattern.entering.isRowEmpty(s)) continue;
        shaft++;
        let count = 0;
        for (let i = 0; i < pattern.entering.width; i++) {
            if (pattern.entering.get_shaft(i) === s + 1) count++;
        }
        const pct = total > 0 ? fmt3g(100 * count / total) : "0";
        lines.push("  " + L("info.shaft", "Shaft") + " " + shaft + ":  "
            + count + " " + L("info.heddles", "heddles") + "  (" + pct + "%)");
    }
    lines.push("");
    return lines;
}

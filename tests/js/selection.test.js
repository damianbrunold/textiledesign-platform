import { beforeEach, describe, expect, it, vi } from "vitest";
import { Pattern } from "../../src/textileplatform/static/js/weave/model.js";
import { Clipboard, Selection }
    from "../../src/textileplatform/static/js/ui/selection.js";

// Selection works on the editor's cursor (a plain object with the
// selected part and corners) and a real weave Pattern.

let pattern, cursor;

beforeEach(() => {
    pattern = new Pattern(8, 6, 4, 4);
    cursor = { selected_part: "weave", x1: 0, y1: 0, x2: 0, y2: 0 };
    Clipboard.clear();
});

function select(part, x1, y1, x2 = x1, y2 = y1) {
    Object.assign(cursor, { selected_part: part, x1, y1, x2, y2 });
}

// Grid contents as rows of strings, row j = 0 first.
function rows(grid) {
    const out = [];
    for (let j = 0; j < grid.height; j++) {
        let s = "";
        for (let i = 0; i < grid.width; i++) s += grid.get(i, j);
        out.push(s);
    }
    return out;
}

function fill(grid, lines) {
    lines.forEach((line, j) => [...line].forEach((ch, i) => {
        grid.set(i, j, Number(ch));
    }));
}

describe("current / isEmpty", () => {
    it("normalises a selection dragged up and left", () => {
        select("tieup", 3, 4, 1, 2);
        expect(Selection.current(cursor)).toEqual({
            part: "tieup", i1: 1, j1: 2, i2: 3, j2: 4, w: 3, h: 3,
        });
        expect(Selection.isEmpty(cursor)).toBe(false);
    });

    it("treats a single cell as empty", () => {
        select("weave", 2, 2);
        expect(Selection.isEmpty(cursor)).toBe(true);
        expect(Selection.copyToClipboard(cursor, pattern)).toBe(null);
    });

    it("is empty without a cursor", () => {
        expect(Selection.isEmpty(null)).toBe(true);
        expect(Selection.current(null)).toBe(null);
    });
});

describe("copy", () => {
    it("copies a weave region as a matrix", () => {
        fill(pattern.weave, ["00000", "01200", "00300"]);
        select("weave", 1, 1, 3, 2);
        const payload = Selection.copyToClipboard(cursor, pattern);
        expect(payload).toEqual({
            kind: "weave", w: 3, h: 2, cells: [[1, 2, 0], [0, 3, 0]],
        });
        expect(Clipboard.get()).toEqual(payload);
    });

    it("encodes the entering as a shaft mask", () => {
        [2, 1, 0, 4].forEach((s, i) => pattern.entering.set_shaft(i, s));
        // warps 0..3, shafts 1..3 (rows 0..2)
        select("entering", 0, 0, 3, 2);
        expect(Selection.copyToClipboard(cursor, pattern).cells).toEqual([
            [0, 1, 0, 0],
            [1, 0, 0, 0],
            [0, 0, 0, 0],  // shaft 4 lies outside the selection
        ]);
    });

    it("copies colour rows and the reed", () => {
        [3, 4, 5].forEach((c, i) => pattern.color_warp.set(i, 0, c));
        select("color_warp", 0, 0, 2, 0);
        expect(Selection.copyToClipboard(cursor, pattern).cells).toEqual([[3, 4, 5]]);

        [6, 7].forEach((c, j) => pattern.color_weft.set(0, j + 1, c));
        select("color_weft", 0, 1, 0, 2);
        expect(Selection.copyToClipboard(cursor, pattern).cells).toEqual([[6], [7]]);

        pattern.reed.set(1, 0, 1);
        select("reed", 0, 0, 2, 0);
        expect(Selection.copyToClipboard(cursor, pattern).cells).toEqual([[0, 1, 0]]);
    });

    it("refuses unknown panes", () => {
        select("pegplan", 0, 0, 1, 1);
        expect(Selection.copyToClipboard(cursor, pattern)).toBe(null);
    });

    it("mirrors the payload to the system clipboard", () => {
        const writeText = vi.fn(() => Promise.resolve());
        // The module runs in Node's realm, so stub Node's navigator.
        vi.stubGlobal("navigator", { clipboard: { writeText } });
        fill(pattern.weave, ["11"]);
        select("weave", 0, 0, 1, 0);
        Selection.copyToClipboard(cursor, pattern);
        expect(writeText).toHaveBeenCalledOnce();
        const text = writeText.mock.calls[0][0];
        expect(text.startsWith("textileplatform:")).toBe(true);
        expect(JSON.parse(text.slice("textileplatform:".length)).cells)
            .toEqual([[1, 1]]);
        vi.unstubAllGlobals();
    });
});

describe("Clipboard", () => {
    it("stores and returns copies", () => {
        const p = { kind: "weave", w: 1, h: 1, cells: [[1]] };
        Clipboard.set(p);
        p.cells[0][0] = 9;
        const got = Clipboard.get();
        expect(got.cells).toEqual([[1]]);
        got.cells[0][0] = 9;
        expect(Clipboard.get().cells).toEqual([[1]]);
        expect(Clipboard.has()).toBe(true);
        Clipboard.clear();
        expect(Clipboard.has()).toBe(false);
        expect(Clipboard.get()).toBe(null);
    });
});

describe("paste", () => {
    const put = (cells) => Clipboard.set({
        kind: "test", w: cells[0].length, h: cells.length, cells,
    });

    it("fails without a payload", () => {
        select("weave", 0, 0);
        expect(Selection.pasteFromClipboard(cursor, pattern)).toEqual({ ok: false });
    });

    it("writes the payload at the selection's corner", () => {
        put([[1, 2], [3, 0]]);
        fill(pattern.tieup, ["9999", "9999", "9999", "9999"]);
        select("tieup", 1, 1);
        expect(Selection.pasteFromClipboard(cursor, pattern, false)).toEqual({ ok: true });
        expect(rows(pattern.tieup)).toEqual(["9999", "9129", "9309", "9999"]);
        expect(Selection.current(cursor)).toMatchObject(
            { i1: 1, j1: 1, i2: 2, j2: 2 });
    });

    it("skips zero cells when transparent", () => {
        put([[1, 0], [0, 2]]);
        fill(pattern.tieup, ["5555", "5555", "5555", "5555"]);
        select("tieup", 0, 0);
        Selection.pasteFromClipboard(cursor, pattern, true);
        expect(rows(pattern.tieup)).toEqual(["1555", "5255", "5555", "5555"]);
    });

    it("clips at the grid edge and shrinks the selection to match", () => {
        put([[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
        select("tieup", 2, 2);
        Selection.pasteFromClipboard(cursor, pattern, false);
        expect(rows(pattern.tieup)).toEqual(["0000", "0000", "0011", "0011"]);
        expect(Selection.current(cursor)).toMatchObject(
            { i1: 2, j1: 2, i2: 3, j2: 3 });
    });

    it("reads each column's first set row as the entering shaft", () => {
        put([
            [0, 1, 0, 0],
            [1, 1, 0, 0],
            [0, 0, 0, 1],
        ]);
        [4, 4, 4, 4, 4].forEach((s, i) => pattern.entering.set_shaft(i, s));
        select("entering", 1, 0);
        Selection.pasteFromClipboard(cursor, pattern, false);
        // column without a set cell clears the shaft
        expect([...pattern.entering.data.slice(0, 5)])
            .toEqual([4, 2, 1, 0, 3]);
    });

    it("leaves shafts alone for empty columns when transparent", () => {
        put([[0, 1]]);
        pattern.entering.set_shaft(0, 3);
        select("entering", 0, 1);
        Selection.pasteFromClipboard(cursor, pattern, true);
        expect([...pattern.entering.data.slice(0, 2)]).toEqual([3, 2]);
    });

    it("pastes an entering mask into the treadling as cells", () => {
        [2, 1].forEach((s, i) => pattern.entering.set_shaft(i, s));
        select("entering", 0, 0, 1, 1);
        Selection.copyToClipboard(cursor, pattern);
        select("treadling", 0, 0);
        Selection.pasteFromClipboard(cursor, pattern, false);
        expect(rows(pattern.treadling).slice(0, 2)).toEqual(["0100", "1000"]);
    });

    it("pastes colours and binarises the reed", () => {
        put([[3, 0, 5]]);
        select("color_warp", 5, 0);
        Selection.pasteFromClipboard(cursor, pattern, false);
        // clipped to the 8 warps
        expect(rows(pattern.color_warp)).toEqual(["00000305"]);

        put([[7, 2]]);
        select("reed", 0, 0);
        Selection.pasteFromClipboard(cursor, pattern, false);
        expect(rows(pattern.reed)).toEqual(["11000000"]);

        put([[4], [0], [6]]);
        pattern.color_weft.set(0, 2, 9);
        select("color_weft", 0, 1);
        Selection.pasteFromClipboard(cursor, pattern, true);
        expect(rows(pattern.color_weft)).toEqual(
            ["0", "4", "9", "6", "0", "0"]);
    });

    it("rejects unknown panes", () => {
        put([[1]]);
        select("pegplan", 0, 0);
        expect(Selection.pasteFromClipboard(cursor, pattern)).toEqual(
            { ok: false, error: "unsupported part" });
    });
});

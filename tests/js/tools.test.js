import { beforeAll, describe, expect, it } from "vitest";
import { loadScripts } from "./helpers/load.js";

let T;

beforeAll(() => {
    T = loadScripts(["tools.js"]).run("ToolRaster");
});

const key = ([i, j]) => `${i},${j}`;
const keys = (cells) => new Set(cells.map(key));
const sorted = (cells) => [...keys(cells)].sort();

function bbox(cells) {
    const is = cells.map((c) => c[0]), js = cells.map((c) => c[1]);
    return [Math.min(...is), Math.min(...js), Math.max(...is), Math.max(...js)];
}

// Consecutive cells of a line touch (8-neighbourhood) and move one step.
function isConnectedPath(cells) {
    return cells.slice(1).every(([i, j], k) => {
        const [pi, pj] = cells[k];
        const di = Math.abs(i - pi), dj = Math.abs(j - pj);
        return di <= 1 && dj <= 1 && di + dj > 0;
    });
}

describe("line", () => {
    it.each([
        ["point", [3, 3, 3, 3], [[3, 3]]],
        ["horizontal", [0, 2, 3, 2], [[0, 2], [1, 2], [2, 2], [3, 2]]],
        ["vertical up", [1, 3, 1, 0], [[1, 3], [1, 2], [1, 1], [1, 0]]],
        ["diagonal", [0, 0, 2, 2], [[0, 0], [1, 1], [2, 2]]],
        ["anti-diagonal", [2, 0, 0, 2], [[2, 0], [1, 1], [0, 2]]],
    ])("draws a %s", (_, args, expected) => {
        expect(T.line(...args)).toEqual(expected);
    });

    it.each([
        [0, 0, 7, 3], [7, 3, 0, 0], [0, 0, 2, 9], [5, 1, -4, 6],
        [-3, -3, 10, 1],
    ])("runs from (%i,%i) to (%i,%i) without gaps", (i1, j1, i2, j2) => {
        const cells = T.line(i1, j1, i2, j2);
        expect(cells[0]).toEqual([i1, j1]);
        expect(cells.at(-1)).toEqual([i2, j2]);
        expect(isConnectedPath(cells)).toBe(true);
        // one cell per step along the major axis
        expect(cells.length)
            .toBe(Math.max(Math.abs(i2 - i1), Math.abs(j2 - j1)) + 1);
    });
});

describe("rect", () => {
    it("is the outline of the box, each cell once", () => {
        const cells = T.rect(1, 1, 4, 3);
        expect(cells).toHaveLength(2 * 4 + 2 * 3 - 4);
        expect(keys(cells).size).toBe(cells.length);
        expect(bbox(cells)).toEqual([1, 1, 4, 3]);
        expect(keys(cells).has("2,2")).toBe(false);
    });

    it("does not depend on the corner order", () => {
        expect(sorted(T.rect(4, 3, 1, 1))).toEqual(sorted(T.rect(1, 1, 4, 3)));
    });

    it.each([
        ["a point", [2, 2, 2, 2], 1],
        ["a row", [0, 5, 3, 5], 4],
        ["a column", [5, 0, 5, 3], 4],
        ["a 2×2 box", [0, 0, 1, 1], 4],
    ])("degenerates to %s without duplicates", (_, args, n) => {
        const cells = T.rect(...args);
        expect(cells).toHaveLength(n);
        expect(keys(cells).size).toBe(n);
    });
});

describe("fillrect", () => {
    it("covers the whole box row by row", () => {
        expect(T.fillrect(2, 1, 0, 0)).toEqual([
            [0, 0], [1, 0], [2, 0],
            [0, 1], [1, 1], [2, 1],
        ]);
    });
});

describe("ellipse", () => {
    it.each([
        [0, 0, 8, 4], [0, 0, 5, 5], [3, 2, 4, 9], [10, 10, 0, 0], [0, 0, 1, 0],
    ])("outline of (%i,%i)-(%i,%i) touches every side of the box",
        (i1, j1, i2, j2) => {
            const cells = T.ellipseOutline(i1, j1, i2, j2);
            expect(bbox(cells)).toEqual([
                Math.min(i1, i2), Math.min(j1, j2),
                Math.max(i1, i2), Math.max(j1, j2),
            ]);
            expect(keys(cells).size).toBe(cells.length);
        });

    it("outline is symmetric", () => {
        const cells = keys(T.ellipseOutline(0, 0, 10, 6));
        for (const c of cells) {
            const [i, j] = c.split(",").map(Number);
            expect(cells.has(`${10 - i},${j}`)).toBe(true);
            expect(cells.has(`${i},${6 - j}`)).toBe(true);
        }
    });

    it("fill stays in the box, is symmetric and contains the centre", () => {
        const cells = T.ellipseFill(0, 0, 8, 4);
        const set = keys(cells);
        expect(bbox(cells)).toEqual([0, 0, 8, 4]);
        expect(set.has("4,2")).toBe(true);
        expect(set.has("0,0")).toBe(false);
        for (const c of set) {
            const [i, j] = c.split(",").map(Number);
            expect(set.has(`${8 - i},${j}`)).toBe(true);
            expect(set.has(`${i},${4 - j}`)).toBe(true);
        }
    });

    it("fill of a point is the point", () => {
        expect(T.ellipseFill(3, 4, 3, 4)).toEqual([[3, 4]]);
        expect(T.ellipseOutline(3, 4, 3, 4)).toEqual([[3, 4]]);
    });
});

describe("rasterize", () => {
    it.each(["line", "rect", "fillrect", "ellipse", "fillellipse"])(
        "dispatches %s", (tool) => {
            const fn = {
                line: T.line, rect: T.rect, fillrect: T.fillrect,
                ellipse: T.ellipseOutline, fillellipse: T.ellipseFill,
            }[tool];
            expect(T.rasterize(tool, 0, 0, 5, 3)).toEqual(fn(0, 0, 5, 3));
        });

    it("falls back to the end point for other tools", () => {
        expect(T.rasterize("pencil", 0, 0, 5, 3)).toEqual([[5, 3]]);
    });
});

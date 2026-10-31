import { describe, expect, it } from "vitest";
import { Pattern } from "../../src/textileplatform/static/js/bead/model.js";
import {
    ViewCorrected, ViewDraft, ViewSimulated,
} from "../../src/textileplatform/static/js/bead/views.js";

// The bead editor's draft, corrected and simulated views: what they
// draw and what a click hits must agree. Each bead gets its own colour
// ("id<k>") so a recording canvas can tell which bead a shape is.

const DX = 10, DY = 10;

function recorder() {
    const shapes = [];
    let pending = null;
    const ctx = {
        fillStyle: "", strokeStyle: "", font: "", textAlign: "",
        textBaseline: "",
        fillRect(x, y, w, h) {
            shapes.push({ id: this.fillStyle, cx: x + w / 2, cy: y + h / 2 });
        },
        strokeRect() {}, fillText() {}, stroke() {}, beginPath() {},
        ellipse(cx, cy) { pending = { cx, cy }; },
        fill() {
            if (pending) shapes.push({ id: this.fillStyle, ...pending });
            pending = null;
        },
    };
    return { ctx, shapes };
}

// Fold of the bead rope into corrected rows (W beads on even rows,
// W + 1 on odd ones), closed form as in beadexport._correct_y_for_index.
function fold(idx, W) {
    const pair = Math.floor(idx / (2 * W + 1));
    const rest = idx % (2 * W + 1);
    return rest < W ? { i: rest, row: 2 * pair }
        : { i: rest - W, row: 2 * pair + 1 };
}

const VIEWS = { ViewCorrected, ViewDraft, ViewSimulated };

// Draw `kind` for a W x H pattern and return the beads drawn
// ({ k, cx, cy }) and the view.
function drawView(kind, { W, H, x, y = 0, viewW, viewH, offset,
                          shift = 0 }) {
    const pattern = new Pattern(W, H);
    pattern.data = Array.from({ length: W * H }, (_, k) => k);
    pattern.shift = shift;
    const env = {
        pattern,
        settings: { dx: DX, dy: DY, darcula: false },
        colors: Array.from({ length: W * H }, (_, k) => "id" + k),
        drawColors: true,
        drawSymbols: false,
    };
    const v = new VIEWS[kind](env, pattern, x, y, viewW, viewH);
    v.offset = offset;
    const { ctx, shapes } = recorder();
    v.draw(ctx, env.settings);
    const beads = shapes.filter((s) => s.id.startsWith("id"))
        .map((s) => ({ k: Number(s.id.slice(2)), cx: s.cx, cy: s.cy }));
    return { v, beads };
}

function* cases() {
    for (const W of [1, 2, 3, 4, 5, 8, 9]) {
        for (const offset of [0, 1, 2, 3, 4, 5]) {
            yield { W, H: 7, offset, viewH: 6 };
        }
    }
}

function hitsBack(v, beads, W) {
    const wrong = beads.filter(({ k, cx, cy }) => {
        const [i, j] = v.pixelToDataCoord(cx, cy);
        return i !== k % W || j !== Math.trunc(k / W);
    });
    return wrong.map((b) => b.k);
}

describe("draft view", () => {
    it("hit-tests every drawn bead back to itself", () => {
        for (const c of cases()) {
            for (const y of [0, 2]) {
                const { v, beads } = drawView("ViewDraft",
                    { ...c, x: 4, y, viewW: c.W });
                expect(hitsBack(v, beads, c.W), JSON.stringify({ ...c, y }))
                    .toEqual([]);
            }
        }
    });
});

describe("corrected view", () => {
    it("draws every bead of the visible rows", () => {
        for (const c of cases()) {
            const { beads } = drawView("ViewCorrected",
                { ...c, x: 4, viewW: c.W + 1 });
            const expected = [];
            for (let k = 0; k < c.W * c.H; k++) {
                const { row } = fold(k, c.W);
                if (row >= c.offset && row < c.offset + c.viewH) expected.push(k);
            }
            expect(beads.map((b) => b.k).sort((a, b) => a - b),
                   JSON.stringify(c)).toEqual(expected);
        }
    });

    it("hit-tests every drawn bead back to itself", () => {
        for (const c of cases()) {
            for (const y of [0, 2]) {
                const { v, beads } = drawView("ViewCorrected",
                    { ...c, x: 4, y, viewW: c.W + 1 });
                expect(hitsBack(v, beads, c.W), JSON.stringify({ ...c, y }))
                    .toEqual([]);
            }
        }
    });
});

describe("simulated view", () => {
    // Only the front of the tube is shown: half the circumference,
    // trunc(W / 2) columns (desktop SimulationPanel::visibleWidth).
    const front = (W) => Math.trunc(W / 2);

    it("draws every bead on the front of the visible rows", () => {
        for (const c of cases()) {
            for (let shift = 0; shift < c.W; shift++) {
                const vw = front(c.W);
                const { beads } = drawView("ViewSimulated",
                    { ...c, x: 4, viewW: vw, shift });
                const expected = [];
                for (let k = 0; k < c.W * c.H; k++) {
                    const { i, row } = fold(k + shift, c.W);
                    const visibleRow = row >= c.offset
                        && row < c.offset + c.viewH;
                    // odd rows show a half bead at column vw
                    const onFront = row % 2 === 0 ? i < vw : i <= vw;
                    if (visibleRow && onFront) expected.push(k);
                }
                expect(beads.map((b) => b.k).sort((a, b) => a - b),
                       JSON.stringify({ ...c, shift })).toEqual(expected);
            }
        }
    });

    it("hit-tests every drawn bead back to itself", () => {
        for (const c of cases()) {
            for (let shift = 0; shift < c.W; shift++) {
                for (const y of [0, 2]) {
                    const { v, beads } = drawView("ViewSimulated",
                        { ...c, x: 4, y, viewW: front(c.W), shift });
                    expect(hitsBack(v, beads, c.W),
                           JSON.stringify({ ...c, shift, y })).toEqual([]);
                }
            }
        }
    });
});

// The JBead editor: entry module of edit_jbead_pattern.html. It builds
// the editor on the window `load` event (init) and handles the mouse /
// pointer input (pencil, fill, pipette, selection drags, long press as
// Ctrl). Everything else is in the feature modules it imports; the
// shared state is in state.js, `data` (the stored pattern JSON) in
// ui/common.js.

import { ActionRegistry } from "../ui/actions.js";
import { ColorPicker } from "../ui/colorpicker.js";
import { CommandBus } from "../ui/commands.js";
import {
    data, modified, resizeWindow, setModified, startEditor, trackSavedState,
} from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import { setupEditorActions } from "./actions.js";
import {
    _maxScroll, _refreshScrollbar, _setScroll, _updateStatusbar,
} from "./chrome.js";
import { _finalizeSelectionGroupMove } from "./edits.js";
import { draftCell } from "./geometry.js";
import { _actionLabel } from "./labels.js";
import { BeadList, Pattern } from "./model.js";
import { _applyPalette, _rgbFromString } from "./palette.js";
import {
    applyViewSettings, initPattern, savePatternData, saveSettings,
} from "./persist.js";
import { _jbeadPrefsRead } from "./prefs.js";
import { captureGroup, stampGroup } from "./selection.js";
import {
    background_color, beadlist, colors, commandBus, current_tool, pattern,
    readonly, selected_color, setBeadlist, setCommandBus, setPattern,
    setReadonly, setSelectedColor, setSettings, settings, setView, view,
    viewEnv,
} from "./state.js";
import { captureThumbnails } from "./thumbnail.js";
import { PatternView, ViewSettings } from "./views.js";

// Pencil drag accumulator — populated during a single mousedown→mouseup
// stroke so we can commit one CommandBus entry per stroke instead of
// one per cell.
let _pencil_stroke = null;


// Mouse drag state for the rectangular select tool. While dragging,
// `_drag` holds the anchor (data coords); on every mousemove we update
// `pattern.selection`.
let _drag = null;


function init() {
    const darkmodeRaw = document.getElementById("darkmode").value;
    const darkmode = darkmodeRaw === "True"
        || (darkmodeRaw === "auto"
            && window.matchMedia
            && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setPattern(new Pattern(data.model[0].length, data.model.length));
    setSettings(new ViewSettings());
    settings.darcula = darkmode;
    setBeadlist(new BeadList(pattern));

    const canvas = document.getElementById("canvas");
    canvas.style.backgroundColor = settings.darcula ? "#444" : "#fff";
    canvas.style.border = "none";
    const ctx = canvas.getContext('2d');
    // Size the bitmap to the canvas's *own* CSS box (same approach
    // resizeWindow() in ui/common.js uses). Using container.client* as
    // a fallback is wrong — it includes the scrollbar (~18 px) and
    // any padding/borders, producing a bitmap that doesn't match the
    // CSS box. The browser then scales offsetX/offsetY by a factor
    // ≠ 1 when mapping CSS-pixel mouse events to bitmap coords,
    // visibly shifting clicks one cell up/right. Force layout via
    // getBoundingClientRect so the values are populated even on the
    // very first paint.
    const rect = canvas.getBoundingClientRect();
    ctx.canvas.width  = Math.max(1, Math.round(rect.width));
    ctx.canvas.height = Math.max(1, Math.round(rect.height));

    setView(new PatternView(viewEnv, pattern, beadlist, settings, ctx));

    initPattern(data, pattern);
    // Existing patterns ship a data.view; new patterns get filled in
    // from the user's prefs so the user's last toggled state carries
    // over. data.view always wins when set.
    const prefs = _jbeadPrefsRead();
    const v = Object.assign({}, prefs, data['view'] || {});
    applyViewSettings(v);
    view.layout();
    beadlist.update();

    setCommandBus(new CommandBus());
    trackSavedState(commandBus);
    commandBus.subscribe(() => {
        ActionRegistry.notify();
    });

    view.draw();

    // Pointer Events unify mouse, touch and pen. The wrappers below add
    // a long-press gesture (~500ms) that simulates Ctrl+click — this is
    // how a finger/stylus user reaches the pipette and other Ctrl-only
    // gestures.
    canvas.addEventListener('pointerdown', _pointerDown);
    canvas.addEventListener('pointermove', _pointerMove);
    window.addEventListener('pointerup', _pointerUp);
    window.addEventListener('pointercancel', _pointerUp);
    canvas.addEventListener('dblclick', _onDoubleClick);
    canvas.addEventListener('pointerleave', () => {
        const sb = document.getElementById("sb-cursor");
        if (sb) sb.textContent = "";
    });
    // Disable the browser's default touch gestures (pan/zoom) on the
    // canvas — the editor needs full control of pointer drags.
    canvas.style.touchAction = "none";
    // Prevent the browser's long-press context menu so our long-press
    // gesture (Ctrl synthesis) is unimpeded on touch.
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Mouse wheel = pattern scroll. One notch ≈ 3 rows.
    canvas.addEventListener('wheel', (e) => {
        const step = Math.sign(e.deltaY) * 3;
        if (step === 0) return;
        if (_setScroll(pattern.scroll + step)) e.preventDefault();
    }, { passive: false });

    const range = document.getElementById('scrollbar');
    if (range) {
        range.addEventListener('input', () => {
            _setScroll(parseInt(range.value, 10) || 0);
        });
    }
    _refreshScrollbar();
}


// ---- Mouse / pointer dispatch -----------------------------------

function _eventCoords(event) {
    // Convert event.offsetX/Y (CSS pixels) into canvas bitmap coords.
    // When the canvas's bitmap is sized to its CSS box exactly the
    // ratio is 1, but sub-pixel rounding (or a stale bitmap from a
    // resize that hasn't propagated) can leave the bitmap a hair
    // shorter or taller than the CSS box — and the browser then
    // scales mouse events by that ratio. Using the live rect each
    // time we read a click guarantees the click lands on the bitmap
    // pixel under the user's cursor, regardless of any drift.
    const c = event.currentTarget || event.target;
    if (!c || c.nodeName !== "CANVAS") {
        return [event.offsetX, event.offsetY];
    }
    const rect = c.getBoundingClientRect();
    const sx = rect.width  > 0 ? c.width  / rect.width  : 1;
    const sy = rect.height > 0 ? c.height / rect.height : 1;
    return [event.offsetX * sx, event.offsetY * sy];
}

function _hitGridView(x, y) {
    // Match the half-pixel offset the views use when drawing.
    const i = Math.floor((x - 0.5) / settings.dx);
    const refHeight = (view.draft || view.corrected || view.simulated
                       || view.ruler).height;
    const j = refHeight - 1 - Math.floor((y - 0.5) / settings.dy);
    if (j < 0) return null;
    if (view.draft && view.draft.contains(i, j)) {
        return { v: view.draft, coord: view.draft.pixelToDataCoord(x, y) };
    }
    if (view.corrected && view.corrected.contains(i, j)) {
        return {
            v: view.corrected,
            coord: view.corrected.pixelToDataCoord(x, y),
        };
    }
    if (view.simulated && view.simulated.contains(i, j)) {
        return {
            v: view.simulated,
            coord: view.simulated.pixelToDataCoord(x, y),
        };
    }
    return null;
}

function _paletteIndexAt(x, y) {
    if (!view || !view.colors || !view.colors.contains(x, y)) return -1;
    // ViewColors paints swatches at +0.5 too — same half-pixel
    // adjustment as the grid views.
    const ii = Math.floor((x - view.colors.x - 0.5) / 25);
    const jj = Math.floor((y - view.colors.y - 0.5) / 25);
    if (ii < 0 || jj < 0) return -1;
    const idx = ii * 16 + jj;
    if (idx < 0 || idx >= colors.length) return -1;
    return idx;
}

function _onDoubleClick(event) {
    if (readonly) return;
    const [ex, ey] = _eventCoords(event);
    const idx = _paletteIndexAt(ex, ey);
    if (idx < 0) return;
    event.preventDefault();
    setSelectedColor(idx);
    view.draw();
    // Open the picker on this single colour. Commit through the
    // bus so it's undoable.
    const before = colors.map(_rgbFromString);
    const initial = before[idx].slice();
    ColorPicker.pickHSV(initial, (rgb) => {
        const after = before.map(c => c.slice());
        after[idx] = [rgb[0] | 0, rgb[1] | 0, rgb[2] | 0];
        let firstApply = true;
        commandBus.execute({
            label: "palette.entry",
            apply: () => {
                _applyPalette(after);
                view.draw();
                if (!firstApply) setModified();
                firstApply = false;
            },
            revert: () => {
                _applyPalette(before);
                view.draw();
                setModified();
            },
        });
        // Live update for the first apply too.
        _applyPalette(after);
        view.draw();
        setModified();
    }, _actionLabel);
}

// ---- Long-press → Ctrl synthesis -------------------------------
//
// On touch/pen there are no modifier keys, so a pressed-and-held
// gesture (≥500ms with little movement) maps to "Ctrl+click". The
// down-event is buffered until we know whether it's a tap, a drag,
// or a long-press; this matters because _onMouseDown for some tools
// starts a stroke or selection, which would conflict with a later
// long-press → pipette decision.

const _LP_DELAY_MS = 500;
const _LP_MOVE_TOL = 8;
let _lpTimer = null;
let _lpDownEvent = null;
let _lpStartXY = null;
let _ctrlOverride = false;
let _activePointerId = null;

function _ctrlOrLp(event) {
    return event.ctrlKey || _ctrlOverride;
}

function _pointerDown(event) {
    if (_activePointerId !== null) return;
    _activePointerId = event.pointerId;
    _ctrlOverride = false;
    if (event.pointerType === 'mouse') {
        _onMouseDown(event);
        return;
    }
    // Buffer the down so the handler isn't called until we know what
    // kind of gesture this is.
    _lpDownEvent = event;
    _lpStartXY = { x: event.clientX, y: event.clientY };
    _lpTimer = setTimeout(() => {
        _lpTimer = null;
        if (!_lpDownEvent) return;
        _ctrlOverride = true;
        _onMouseDown(_lpDownEvent);
        _lpDownEvent = null;
    }, _LP_DELAY_MS);
}

function _pointerMove(event) {
    if (_activePointerId !== null && event.pointerId !== _activePointerId
        && _lpDownEvent) return;
    if (_lpTimer && _lpStartXY) {
        const dx = event.clientX - _lpStartXY.x;
        const dy = event.clientY - _lpStartXY.y;
        if ((dx * dx + dy * dy) > (_LP_MOVE_TOL * _LP_MOVE_TOL)) {
            // Movement: this is a drag, commit the buffered down now.
            clearTimeout(_lpTimer);
            _lpTimer = null;
            _onMouseDown(_lpDownEvent);
            _lpDownEvent = null;
        } else {
            return;
        }
    }
    _onMouseMove(event);
}

function _pointerUp(event) {
    // pointerup is registered on window so that drag-out-then-release
    // still finishes the drag — but that means it also fires for clicks
    // on menus, toolbars, and anything else outside the canvas. Only
    // act if pointerdown was first received on the canvas (which sets
    // _activePointerId), and only for that same pointer.
    if (_activePointerId === null) return;
    if (event.pointerId !== _activePointerId) return;
    if (_lpTimer) {
        // Quick tap before long-press fired: commit the down then up.
        clearTimeout(_lpTimer);
        _lpTimer = null;
        if (_lpDownEvent) {
            _onMouseDown(_lpDownEvent);
            _lpDownEvent = null;
        }
        _onMouseUp(event);
    } else {
        // Either a real drag (down already committed in _pointerMove)
        // or a long-press already fired in _pointerDown's timer. Both
        // need _onMouseUp to finish the stroke / commit selection.
        _onMouseUp(event);
    }
    _ctrlOverride = false;
    _activePointerId = null;
}


function _onMouseDown(event) {
    if (readonly) return;
    const [x, y] = _eventCoords(event);
    const palIdx = _paletteIndexAt(x, y);
    if (palIdx >= 0) {
        setSelectedColor(palIdx);
        view.draw();
        return;
    }
    const hit = _hitGridView(x, y);
    if (!hit) return;
    const [i, j] = hit.coord;
    if (i === undefined || j === undefined) return;

    if (_ctrlOrLp(event)) {
        // Ctrl-click is the universal pipette gesture, regardless of tool.
        setSelectedColor(pattern.get(i, j));
        view.draw();
        return;
    }

    switch (current_tool) {
    case "pipette":
        setSelectedColor(pattern.get(i, j));
        view.draw();
        return;
    case "fill":
        _bucketFill(i, j);
        return;
    case "select": {
        // Click *inside* an existing selection starts a "move group"
        // gesture: lift every tile in the pattern that has the same
        // content as the selection and drag them all together. Click
        // *outside* (or with no current selection) starts a fresh
        // rectangular selection — and a no-drag click on that fresh
        // selection still falls through to the pencil-style toggle.
        const sel = pattern.selection;
        const inside = sel
            && i >= sel.i1 && i <= sel.i2
            && j >= sel.j1 && j <= sel.j2;
        if (inside) {
            const group = captureGroup(pattern);
            if (group) {
                _drag = {
                    kind: "move",
                    i0: i, j0: j,
                    lastDx: 0, lastDy: 0,
                    group,
                    sel0: { ...sel },
                };
                return;
            }
        }
        _drag = { kind: "select", i0: i, j0: j, leftStart: false };
        pattern.selection = { i1: i, j1: j, i2: i, j2: j };
        view.draw();
        return;
    }
    case "pencil":
    default:
        // Pencil is line-mode (matches the desktop's "stift draws
        // a line"): mousedown records the start cell, mousemove
        // updates a translucent tracer, and the actual cells are
        // committed on mouseup. A single click without movement
        // toggles the start cell.
        _pencil_stroke = {
            mode: "click",
            startI: i, startJ: j,
            endI: i,   endJ: j,
            previewCells: [],
            changes: [],
            visited: new Set(),
        };
        return;
    }
}

function _onMouseMove(event) {
    if (!view) return;
    const [x, y] = _eventCoords(event);
    const hit = _hitGridView(x, y);
    const sb = document.getElementById("sb-cursor");
    if (sb) {
        if (hit) {
            const [ci, cj] = hit.coord;
            sb.textContent = (ci != null && cj != null)
                ? `(${ci + 1}, ${cj + 1})` : "";
        } else {
            sb.textContent = "";
        }
    }
    if (readonly || !hit) return;
    const [i, j] = hit.coord;
    if (i === undefined || j === undefined) return;
    if (_drag) {
        if (_drag.kind === "move") {
            const dx = i - _drag.i0;
            const dy = j - _drag.j0;
            if (dx !== _drag.lastDx || dy !== _drag.lastDy) {
                _drag.lastDx = dx;
                _drag.lastDy = dy;
                stampGroup(pattern, _drag.group, dx, dy, background_color);
                beadlist.update();
                view.draw();
                _updateStatusbar();
            }
            return;
        }
        // Drag rectangle for the select tool — recompute on every move.
        // Latch `leftStart` once the pointer ever leaves the origin
        // cell so a click-without-drag can be detected on mouseup
        // even if the pointer wanders out and back in.
        if (i !== _drag.i0 || j !== _drag.j0) _drag.leftStart = true;
        const i1 = Math.min(_drag.i0, i);
        const i2 = Math.max(_drag.i0, i);
        const j1 = Math.min(_drag.j0, j);
        const j2 = Math.max(_drag.j0, j);
        pattern.selection = { i1, j1, i2, j2 };
        view.draw();
        _updateStatusbar();
        return;
    }
    if (_pencil_stroke && current_tool === "pencil") {
        let endI = i, endJ = j;
        if (_ctrlOrLp(event)) {
            [endI, endJ] = _constrainTo8Dir(
                _pencil_stroke.startI, _pencil_stroke.startJ, endI, endJ);
        }
        if (endI !== _pencil_stroke.endI || endJ !== _pencil_stroke.endJ
            || (_pencil_stroke.mode === "click"
                && (endI !== _pencil_stroke.startI
                    || endJ !== _pencil_stroke.startJ))) {
            _pencil_stroke.endI = endI;
            _pencil_stroke.endJ = endJ;
            if (endI !== _pencil_stroke.startI
                || endJ !== _pencil_stroke.startJ) {
                _pencil_stroke.mode = "drag";
            }
            _pencil_stroke.previewCells = _bresenhamCells(
                _pencil_stroke.startI, _pencil_stroke.startJ,
                endI, endJ);
            view.draw();
            _drawPencilPreview();
        }
    }
}

function _onMouseUp(event) {
    if (_drag) {
        const drag = _drag;
        _drag = null;
        if (drag.kind === "move") {
            // Commit the dragged group through the command bus. The
            // live preview already mutated pattern.data; we roll back
            // to the baseline first so the snapshot captures the
            // original state, then commandBus.execute re-applies.
            _finalizeSelectionGroupMove(drag.group, drag.sel0,
                                        drag.lastDx, drag.lastDy);
            return;
        }
        if (!drag.leftStart && !readonly) {
            // Click-without-drag on the select tool: treat as a
            // pencil-toggle so quick clicks still feel productive.
            // Selection collapses (so it doesn't visually linger as a
            // 1-cell box around the toggled cell). Goes through the
            // pencil command-bus path so it's a single undoable step.
            pattern.selection = null;
            _pencil_stroke = {
                mode: "click",
                startI: drag.i0, startJ: drag.j0,
                endI:   drag.i0, endJ:   drag.j0,
                previewCells: [],
                changes: [],
                visited: new Set(),
            };
            _pencilSetCell(drag.i0, drag.j0, "toggle");
            beadlist.update();
            view.draw();
            setModified();
            _commitPencilStroke();
            ActionRegistry.notify();
            return;
        }
        view.draw();
        _updateStatusbar();
        // Selection just finalised — refresh toolbar/menu so the
        // selection-dependent actions (Anordnen / Mirror / …) flip
        // their enabled state.
        ActionRegistry.notify();
    }
    if (_pencil_stroke) {
        if (_pencil_stroke.mode === "click") {
            // No drag — apply the desktop's "click toggles"
            // behaviour: a cell already in the active colour clears,
            // anything else gets painted.
            _pencilSetCell(_pencil_stroke.startI,
                           _pencil_stroke.startJ, "toggle");
        } else {
            // Drag — commit the previewed line by painting every
            // cell along it with the active colour.
            for (const [pi, pj] of _pencil_stroke.previewCells) {
                _pencilSetCell(pi, pj, "paint");
            }
        }
        beadlist.update();
        view.draw();
        setModified();
        _commitPencilStroke();
    }
}


// ---- Pencil tool -------------------------------------------------

// Apply a change to a single cell within the in-progress stroke.
// `mode` is either "toggle" (single click — selected_color → bg, else
// → selected_color) or "paint" (drag — always set to selected_color).
function _pencilSetCell(i, j, mode) {
    if (!_pencil_stroke) return;
    if (i < 0 || j < 0 || i >= pattern.width || j >= pattern.height) return;
    const key = i + "," + j;
    if (_pencil_stroke.visited.has(key)) return;
    _pencil_stroke.visited.add(key);
    const oldVal = pattern.get(i, j);
    const newVal = (mode === "toggle" && oldVal === selected_color)
        ? background_color
        : selected_color;
    if (oldVal === newVal) return;
    _pencil_stroke.changes.push({ i, j, oldVal, newVal });
    pattern.set(i, j, newVal);
}

// Bresenham cell list between two grid points (inclusive).
function _bresenhamCells(x0, y0, x1, y1) {
    const cells = [];
    let x = x0, y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
        cells.push([x, y]);
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 <  dx) { err += dx; y += sy; }
    }
    return cells;
}

// Snap (i, j) so the line from (startI, startJ) becomes one of the
// 8 cardinal/diagonal directions. Used when Ctrl is held during a
// pencil drag.
function _constrainTo8Dir(startI, startJ, i, j) {
    const dx = i - startI, dy = j - startJ;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx === 0 && ady === 0) return [startI, startJ];
    const sx = dx === 0 ? 0 : (dx > 0 ? 1 : -1);
    const sy = dy === 0 ? 0 : (dy > 0 ? 1 : -1);
    if (adx > ady * 2) {
        return [startI + dx, startJ];      // horizontal
    }
    if (ady > adx * 2) {
        return [startI, startJ + dy];      // vertical
    }
    const len = Math.max(adx, ady);
    return [startI + sx * len, startJ + sy * len];  // diagonal
}

// Translucent tracer overlay drawn after view.draw() while the user
// is dragging the pencil — shows where the line will land without
// touching the underlying pattern data. Drawn only on the draft
// view (the tool that's most natural for line-drawing); other views
// will pick up the line once it's committed on mouseup.
function _drawPencilPreview() {
    if (!_pencil_stroke
        || _pencil_stroke.mode !== "drag"
        || !view || !view.draft
        || !_pencil_stroke.previewCells.length) return;
    const ctx = view.ctx;
    const dx = settings.dx, dy = settings.dy;
    const off = pattern.scroll | 0;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = colors[selected_color] || "#888";
    ctx.strokeStyle = "#ff5";
    ctx.lineWidth = 1;
    for (const [i, j] of _pencil_stroke.previewCells) {
        if (i < 0 || i >= view.draft.width) continue;
        const cell = draftCell({ ...view.draft, offset: off }, i, j, dx, dy);
        if (!cell) continue;
        const { x, y } = cell;
        ctx.fillRect(x, y, dx, dy);
        ctx.strokeRect(x, y, dx, dy);
    }
    ctx.restore();
}

function _commitPencilStroke() {
    if (!_pencil_stroke || _pencil_stroke.changes.length === 0) {
        _pencil_stroke = null;
        return;
    }
    const changes = _pencil_stroke.changes;
    _pencil_stroke = null;
    // Wrap the in-progress edits as one undo entry; apply() is a no-op
    // the first time (work already done) but applies on redo.
    let applied = true;
    commandBus.execute({
        label: "stroke",
        apply: () => {
            if (applied) { applied = false; return; }
            for (const c of changes) pattern.set(c.i, c.j, c.newVal);
            beadlist.update();
            view.draw();
        },
        revert: () => {
            for (let k = changes.length - 1; k >= 0; k--) {
                pattern.set(changes[k].i, changes[k].j, changes[k].oldVal);
            }
            beadlist.update();
            view.draw();
        },
    });
}


// ---- Fill tool ---------------------------------------------------

function _bucketFill(i, j) {
    const target = pattern.get(i, j);
    if (target === selected_color) return;
    const W = pattern.width, H = pattern.height;
    const queue = [[i, j]];
    const changes = [];
    const seen = new Uint8Array(W * H);
    seen[i + j * W] = 1;
    while (queue.length) {
        const [ci, cj] = queue.shift();
        if (pattern.get(ci, cj) !== target) continue;
        changes.push({ i: ci, j: cj, oldVal: target, newVal: selected_color });
        const tries = [[ci - 1, cj], [ci + 1, cj], [ci, cj - 1], [ci, cj + 1]];
        for (const [ni, nj] of tries) {
            if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
            const k = ni + nj * W;
            if (seen[k]) continue;
            seen[k] = 1;
            queue.push([ni, nj]);
        }
    }
    if (!changes.length) return;
    let firstApply = true;
    commandBus.execute({
        label: "fill",
        apply: () => {
            if (firstApply) {
                for (const c of changes) pattern.set(c.i, c.j, c.newVal);
                firstApply = false;
            } else {
                for (const c of changes) pattern.set(c.i, c.j, c.newVal);
            }
            beadlist.update();
            view.draw();
        },
        revert: () => {
            for (const c of changes) pattern.set(c.i, c.j, c.oldVal);
            beadlist.update();
            view.draw();
        },
    });
    setModified();
}


window.addEventListener("resize", () => {
    resizeWindow(view);
    if (pattern && pattern.scroll > _maxScroll()) {
        pattern.scroll = _maxScroll();
    }
    _refreshScrollbar();
});

window.addEventListener("load", () => {
    setReadonly(document.getElementById("readonly").value === "True");
    startEditor({
        readonly,
        preSave: () => {
            saveSettings(data, settings);
            savePatternData(data, pattern);
        },
        init: () => {
            init();
            setupEditorActions();
            _updateStatusbar();
        },
        captureThumbnails,
    });
});


// ---- Test handle -----------------------------------------------------
//
// Module bindings are not globals: the browser tests read and drive
// the editor through window.txEditor (page.evaluate("txEditor.pattern
// ...")). Getters, so they always see the current objects.
window.txEditor = {
    get pattern() { return pattern; },
    get view() { return view; },
    get settings() { return settings; },
    get beadlist() { return beadlist; },
    get commandBus() { return commandBus; },
    get data() { return data; },
    get modified() { return modified; },
    get readonly() { return readonly; },
    ActionRegistry, Modal, setModified,
};

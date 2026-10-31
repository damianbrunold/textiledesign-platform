// The DB-WEAVE editor: entry module of edit_dbweave_pattern.html. It
// builds the editor on the window `load` event (init) and handles the
// mouse / pointer input (cell clicks, drawing tool drags, resizing the
// panes, long press as Ctrl) and the keyboard. Everything else is in
// the feature modules it imports; the shared state is in state.js,
// `data` (the stored pattern JSON) in ui/common.js.

import { ActionRegistry } from "../ui/actions.js";
import { CommandBus, makeGridRegionCommand } from "../ui/commands.js";
import {
    data, editorDialogOpen, modified, setModified, startEditor,
    trackSavedState,
} from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import { ToolRaster } from "../ui/tools.js";
import {
    setupEditorActions, setupToolbarAndStatusbar, updateStatusBar,
} from "./actions.js";
import { recalcFixedEntering } from "./arrange.js";
import {
    _advanceCursorAfterToggle, _cursorRtl, _cursorTtb, cursorDown,
    cursorLeft, cursorRight, cursorUp, goto_next_part, goto_prev_part,
    select_part, updateSelectionIcons,
} from "./cursor.js";
import {
    _applyCellSet, _applyEnteringChange, _applyGridToggle,
    _applyTreadlingSingle, _recalcFor,
} from "./edits.js";
import { _hlineHitPx, _hlineToggle } from "./guides.js";
import { Pattern } from "./model.js";
import { _applyArrangementHook } from "./options.js";
import { _paneHit, fillRect, getRangeColor } from "./painters.js";
import { _paletteToolboxRefresh, update_color_selector } from "./palette.js";
import {
    initPatternData, initSettings, savePatternData, saveSettings,
} from "./persist.js";
import {
    selectionClear, selectionInvert, selectionMirrorH, selectionMirrorV,
    selectionRotate,
} from "./selection-ops.js";
import {
    commandBus, cursor, pattern, readonly, setCommandBus, setPattern,
    setReadonly, setSettings, settings, setToolDrag, setView, toolDrag,
    view,
} from "./state.js";
import { captureThumbnails } from "./thumbnail.js";
import {
    _rangesToolboxRefresh, _toolsToolboxRefresh, update_range_selector,
} from "./toolboxes.js";
import {
    _applyAspectRatio, GridViewDummy, PatternView, ViewSettings,
} from "./views.js";



let mousedown = false;
let had_selection = false;





// `i` / `j` are LOCAL cell indices within the pane (0..width-1 from
// the pane's top-left, pre-flip), exactly as returned by _paneHit.
function i_to_doc(i, view, righttoleft) {
    if (righttoleft) {
        return view.width - 1 - i + view.offset_i;
    } else {
        return i + view.offset_i;
    }
}

function j_to_doc(j, view, toptobottom) {
    if (toptobottom) {
        return j + view.offset_j;
    } else {
        return view.height - 1 - j + view.offset_j;
    }
}

// _paintablePaneAtPx — returns metadata for a paintable 2D pane under
// pixel (px, py), or null. Drawing tools (line/rect/ellipse) operate
// only on these panes: weave, tieup, treadling, pegplan. Returned
// object includes the canvas-cell-coord {i, j} of the hit so callers
// can compute doc indices via i_to_doc / j_to_doc.
function _paintablePaneAtPx(px, py) {
    let hit;
    if (!settings.weave_locked
        && (hit = _paneHit(view.weave, px, py, settings))) {
        return {
            part: "weave", pane: view.weave, grid: pattern.weave,
            rtl: settings.direction_righttoleft, ttb: false,
            recalc: "from_weave",
            i: hit.i, j: hit.j,
        };
    }
    if (!settings.display_pegplan
        && (hit = _paneHit(view.tieup, px, py, settings))) {
        return {
            part: "tieup", pane: view.tieup, grid: pattern.tieup,
            rtl: false, ttb: settings.direction_toptobottom,
            recalc: "weave_recalc",
            i: hit.i, j: hit.j,
        };
    }
    if ((hit = _paneHit(view.treadling, px, py, settings))) {
        return {
            part: "treadling", pane: view.treadling, grid: pattern.treadling,
            rtl: false, ttb: false,
            recalc: "weave_recalc",
            i: hit.i, j: hit.j,
        };
    }
    if ((hit = _paneHit(view.pegplan, px, py, settings))) {
        return {
            part: "pegplan", pane: view.pegplan, grid: pattern.pegplan,
            rtl: false, ttb: false,
            recalc: "weave_recalc",
            i: hit.i, j: hit.j,
        };
    }
    return null;
}

// Overlay the pending tool-shape preview on top of the current canvas.
// Called right after view.draw() while a tool drag is in progress.
function drawToolPreview() {
    if (!toolDrag || !toolDrag.active) return;
    const p = toolDrag.pane_info;
    const pane = p.pane;
    const cells = ToolRaster.rasterize(
        toolDrag.tool, toolDrag.i1, toolDrag.j1, toolDrag.i2, toolDrag.j2);
    const ctx = view.ctx;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = getRangeColor(settings, settings.current_range);
    for (const [ii, jj] of cells) {
        const li = ii - pane.offset_i;
        const lj = jj - pane.offset_j;
        if (li < 0 || li >= pane.width || lj < 0 || lj >= pane.height) continue;
        const x1 = pane.calc_x(li + settings.bxf);
        const y1 = pane.calc_y(lj + settings.byf);
        const x2 = pane.calc_x(li + 1 - settings.bxf);
        const y2 = pane.calc_y(lj + 1 - settings.byf);
        fillRect(ctx, x1, y1, x2, y2);
    }
    ctx.restore();
}

// Commit the in-flight tool drag as a single undoable command.
function _finishToolDrag() {
    if (readonly) { setToolDrag(null); return; }
    if (!toolDrag || !toolDrag.active) { setToolDrag(null); return; }
    const p = toolDrag.pane_info;
    const grid = p.grid;
    const cells = ToolRaster.rasterize(
        toolDrag.tool, toolDrag.i1, toolDrag.j1, toolDrag.i2, toolDrag.j2);
    // Clamp to grid bounds and compute bbox for snapshotting.
    let lo_i = Infinity, hi_i = -Infinity, lo_j = Infinity, hi_j = -Infinity;
    const valid = [];
    for (const [ii, jj] of cells) {
        if (ii < 0 || ii >= grid.width) continue;
        if (jj < 0 || jj >= grid.height) continue;
        valid.push([ii, jj]);
        if (ii < lo_i) lo_i = ii;
        if (ii > hi_i) hi_i = ii;
        if (jj < lo_j) lo_j = jj;
        if (jj > hi_j) hi_j = jj;
    }
    const toolLabel = toolDrag ? toolDrag.tool : "tool";
    setToolDrag(null);
    if (valid.length === 0) { view.draw(); return; }
    const range = settings.current_range;
    const recalcKind = p.recalc;
    const afterApply = _recalcFor(recalcKind);
    const mutate = () => {
        for (const [ii, jj] of valid) grid.set(ii, jj, range);
    };
    if (commandBus) {
        commandBus.execute(makeGridRegionCommand({
            grid, i1: lo_i, j1: lo_j, i2: hi_i, j2: hi_j,
            mutate, afterApply, label: p.part + ":" + toolLabel,
        }));
    } else {
        mutate();
        afterApply();
    }
}


// Layout-resize drag state. Active while the user is dragging the
// boundary line between einzug+blatteinzug ↔ gewebe (changes
// visible_shafts) or trittfolge/aufknüpfung ↔ gewebe (changes
// visible_treadles). The boundary lives in the inter-pane gap.
let _layoutDrag = null;

function _layoutDragHit(px, py) {
    if (!view) return null;
    const TOL = 5;
    // Horizontal boundary: top edge of the weave pane (just below the
    // einzug + blatteinzug stack). Drag up = fewer shafts; drag down =
    // more shafts.
    const w = view.weave;
    if (w && w.width > 0 && w.height > 0 &&
        view.entering && !(view.entering instanceof GridViewDummy)) {
        if (py >= w.y - TOL && py <= w.y + 2 &&
            px >= w.x && px <= w.x + w.width * w.dx) {
            return { type: "shafts" };
        }
    }
    // Vertical boundary: left edge of the side pane (trittfolge in
    // normal mode, pegplan/aufknüpfung in pegplan mode). Drag right =
    // fewer treadles; drag left = more.
    const sp = settings.display_pegplan ? view.pegplan : view.treadling;
    if (sp && sp.width > 0 && sp.height > 0 && !(sp instanceof GridViewDummy)) {
        if (px >= sp.x - TOL && px <= sp.x + 2 &&
            py >= sp.y && py <= sp.y + sp.height * sp.dy) {
            return { type: "treadles" };
        }
    }
    return null;
}

// ---- Long-press → Ctrl synthesis -------------------------------
//
// On touch/pen there are no modifier keys, so a pressed-and-held
// gesture (≥500ms with little movement) maps to "Ctrl+click". The
// down-event is buffered until we know whether it's a tap, a drag,
// or a long-press; this matters because mouseDown for some tools
// starts a stroke or selection, which would conflict with a later
// long-press → ctrl-cursor-only decision.

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
    if (event.pointerType === "mouse") {
        mouseDown(event);
        return;
    }
    _lpDownEvent = event;
    _lpStartXY = { x: event.clientX, y: event.clientY };
    _lpTimer = setTimeout(() => {
        _lpTimer = null;
        if (!_lpDownEvent) return;
        _ctrlOverride = true;
        mouseDown(_lpDownEvent);
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
            clearTimeout(_lpTimer);
            _lpTimer = null;
            mouseDown(_lpDownEvent);
            _lpDownEvent = null;
        } else {
            return;
        }
    }
    mouseMove(event);
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
        clearTimeout(_lpTimer);
        _lpTimer = null;
        if (_lpDownEvent) {
            mouseDown(_lpDownEvent);
            _lpDownEvent = null;
        }
        mouseUp(event);
    } else {
        mouseUp(event);
    }
    _ctrlOverride = false;
    _activePointerId = null;
}

function mouseDown(event) {
    had_selection = cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2;
    mousedown = true;
    const x = event.offsetX;
    const y = event.offsetY;

    // Layout-boundary drag — short-circuits everything else. The drag
    // continues in mouseMove and ends in mouseUp.
    if (!readonly) {
        const lh = _layoutDragHit(x, y);
        if (lh) {
            _layoutDrag = {
                type: lh.type,
                startX: x, startY: y,
                startShafts:   view.visible_shafts,
                startTreadles: view.visible_treadles,
            };
            return;
        }
    }

    // Drawing tool drag — short-circuits the usual selection logic on
    // paintable 2D panes.
    if (settings.tool && settings.tool !== "point") {
        const p = _paintablePaneAtPx(x, y);
        if (p) {
            const ii = i_to_doc(p.i, p.pane, p.rtl);
            const jj = j_to_doc(p.j, p.pane, p.ttb);
            setToolDrag({
                tool: settings.tool, pane_info: p,
                i1: ii, j1: jj, i2: ii, j2: jj, active: true,
            });
            select_part(p.part, ii, jj, ii, jj);
            view.draw();
            drawToolPreview();
            return;
        }
    }

    let hit;
    if ((hit = _paneHit(view.entering, x, y, settings))) {
        const ii = i_to_doc(hit.i, view.entering, settings.direction_righttoleft);
        const jj = j_to_doc(hit.j, view.entering, settings.direction_toptobottom);
        select_part("entering", ii, jj, ii, jj);
    } else if ((hit = _paneHit(view.pegplan, x, y, settings))) {
        const ii = i_to_doc(hit.i, view.pegplan, false);
        const jj = j_to_doc(hit.j, view.pegplan, false);
        select_part("pegplan", ii, jj, ii, jj);
    } else if ((hit = _paneHit(view.treadling, x, y, settings))) {
        const ii = i_to_doc(hit.i, view.treadling, false);
        const jj = j_to_doc(hit.j, view.treadling, false);
        select_part("treadling", ii, jj, ii, jj);
    } else if (!settings.display_pegplan
               && (hit = _paneHit(view.tieup, x, y, settings))) {
        const ii = i_to_doc(hit.i, view.tieup, false);
        const jj = j_to_doc(hit.j, view.tieup, settings.direction_toptobottom);
        select_part("tieup", ii, jj, ii, jj);
    } else if (!settings.weave_locked
               && (hit = _paneHit(view.weave, x, y, settings))) {
        const ii = i_to_doc(hit.i, view.weave, settings.direction_righttoleft);
        const jj = j_to_doc(hit.j, view.weave, false);
        select_part("weave", ii, jj, ii, jj);
    } else if ((hit = _paneHit(view.color_warp, x, y, settings))) {
        const ii = i_to_doc(hit.i, view.color_warp, settings.direction_righttoleft);
        select_part("color_warp", ii, 0, ii, 0);
    } else if ((hit = _paneHit(view.color_weft, x, y, settings))) {
        const jj = j_to_doc(hit.j, view.color_weft, false);
        select_part("color_weft", 0, jj, 0, jj);
    } else if ((hit = _paneHit(view.reed, x, y, settings))) {
        const ii = i_to_doc(hit.i, view.reed, settings.direction_righttoleft);
        select_part("reed", ii, 0, ii, 0);
    }
}

function mouseMove(event) {
    const x = event.offsetX;
    const y = event.offsetY;

    // Layout-resize drag in progress.
    if (_layoutDrag) {
        const base = settings.dx;
        if (_layoutDrag.type === "shafts") {
            const dy = y - _layoutDrag.startY;
            let v = _layoutDrag.startShafts + Math.round(dy / base);
            const max = (pattern && pattern.entering) ? pattern.entering.height : v;
            v = Math.max(1, Math.min(max, v));
            if (v !== view.visible_shafts) {
                view.visible_shafts = v;
                if (data) data.visible_shafts = v;
                view.layout();
                view.draw();
            }
        } else if (_layoutDrag.type === "treadles") {
            const dx = x - _layoutDrag.startX;
            let v = _layoutDrag.startTreadles - Math.round(dx / base);
            const sp = settings.display_pegplan ? pattern.pegplan : pattern.treadling;
            const max = sp ? sp.width : v;
            v = Math.max(1, Math.min(max, v));
            if (v !== view.visible_treadles) {
                view.visible_treadles = v;
                if (data) data.visible_treadles = v;
                view.layout();
                view.draw();
            }
        }
        return;
    }

    // Cursor hint when hovering over a draggable boundary (no drag in
    // progress, no button held).
    if (!mousedown) {
        const canvas = document.getElementById("canvas");
        if (canvas) {
            const lh = !readonly ? _layoutDragHit(x, y) : null;
            const want = lh
                ? (lh.type === "shafts" ? "ns-resize" : "ew-resize")
                : "";
            if (canvas.style.cursor !== want) canvas.style.cursor = want;
        }
        return;
    }

    // Update tool drag preview.
    if (toolDrag && toolDrag.active) {
        const p = toolDrag.pane_info;
        const phit = _paneHit(p.pane, x, y, settings);
        if (phit) {
            toolDrag.i2 = i_to_doc(phit.i, p.pane, p.rtl);
            toolDrag.j2 = j_to_doc(phit.j, p.pane, p.ttb);
        }
        view.draw();
        drawToolPreview();
        return;
    }

    let hit;
    if ((hit = _paneHit(view.entering, x, y, settings))) {
        cursor.x2 = i_to_doc(hit.i, view.entering, settings.direction_righttoleft);
        cursor.y2 = j_to_doc(hit.j, view.entering, settings.direction_toptobottom);
        updateSelectionIcons();
        view.draw();
    } else if ((hit = _paneHit(view.pegplan, x, y, settings))) {
        cursor.x2 = i_to_doc(hit.i, view.pegplan, false);
        cursor.y2 = j_to_doc(hit.j, view.pegplan, false);
        updateSelectionIcons();
        view.draw();
    } else if ((hit = _paneHit(view.treadling, x, y, settings))) {
        cursor.x2 = i_to_doc(hit.i, view.treadling, false);
        cursor.y2 = j_to_doc(hit.j, view.treadling, false);
        updateSelectionIcons();
        view.draw();
    } else if (!settings.display_pegplan
               && (hit = _paneHit(view.tieup, x, y, settings))) {
        cursor.x2 = i_to_doc(hit.i, view.tieup, false);
        cursor.y2 = j_to_doc(hit.j, view.tieup, settings.direction_toptobottom);
        updateSelectionIcons();
        view.draw();
    } else if (!settings.weave_locked
               && (hit = _paneHit(view.weave, x, y, settings))) {
        cursor.x2 = i_to_doc(hit.i, view.weave, settings.direction_righttoleft);
        cursor.y2 = j_to_doc(hit.j, view.weave, false);
        updateSelectionIcons();
        view.draw();
    } else if ((hit = _paneHit(view.color_warp, x, y, settings))) {
        cursor.x2 = i_to_doc(hit.i, view.color_warp, settings.direction_righttoleft);
        cursor.y2 = 0;
        updateSelectionIcons();
        view.draw();
    } else if ((hit = _paneHit(view.color_weft, x, y, settings))) {
        cursor.x2 = 0;
        cursor.y2 = j_to_doc(hit.j, view.color_weft, false);
        updateSelectionIcons();
        view.draw();
    }
}

function mouseUp(event) {
    mousedown = false;
    const x = event.offsetX;
    const y = event.offsetY;

    // End of layout-boundary drag. Push one undoable command capturing
    // the before/after viewport sizes — both axes, so a single command
    // covers the rare combined drag too.
    if (_layoutDrag) {
        const ld = _layoutDrag;
        _layoutDrag = null;
        const canvas = document.getElementById("canvas");
        if (canvas) canvas.style.cursor = "";
        const endShafts   = view.visible_shafts;
        const endTreadles = view.visible_treadles;
        const changed = (endShafts !== ld.startShafts) ||
                        (endTreadles !== ld.startTreadles);
        if (changed) {
            const setBoth = (s, t) => {
                view.visible_shafts = s;
                view.visible_treadles = t;
                if (data) {
                    data.visible_shafts = s;
                    data.visible_treadles = t;
                }
                view.layout(); view.draw();
            };
            const cmd = {
                label: "resize panes",
                apply()  { setBoth(endShafts,   endTreadles);   setModified(); },
                revert() { setBoth(ld.startShafts, ld.startTreadles); setModified(); },
            };
            if (commandBus) commandBus.execute(cmd);
            else setModified();
        }
        return;
    }

    // Hilfslinien bar click → toggle a guide line.
    if (!readonly && settings.display_hlines) {
        const bhit = _hlineHitPx(x, y);
        if (bhit) {
            _hlineToggle(bhit.typ, bhit.feld, bhit.pos);
            return;
        }
    }

    // Ctrl+click: just move the cursor — no toggle, no colour sniff,
    // no treadle change. mouseDown has already called select_part with
    // the clicked cell, so the cursor is in place; we just need to
    // redraw and skip the edit dispatch below. Shift+click on the
    // colour bars remains the colour sniffer.
    if (_ctrlOrLp(event)) {
        updateSelectionIcons();
        view.draw();
        return;
    }

    // Finish tool drag: commit shape as one undoable command.
    if (toolDrag && toolDrag.active) {
        const p = toolDrag.pane_info;
        const phit = _paneHit(p.pane, x, y, settings);
        if (phit) {
            toolDrag.i2 = i_to_doc(phit.i, p.pane, p.rtl);
            toolDrag.j2 = j_to_doc(phit.j, p.pane, p.ttb);
        }
        _finishToolDrag();
        return;
    }

    let hit;
    if ((hit = _paneHit(view.entering, x, y, settings))) {
        const ii = i_to_doc(hit.i, view.entering, settings.direction_righttoleft);
        const jj = j_to_doc(hit.j, view.entering, settings.direction_toptobottom);
        cursor.x2 = ii;
        cursor.y2 = jj;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            const current = pattern.entering.get_shaft(ii);
            const next = current == jj + 1 ? 0 : jj + 1;
            _applyEnteringChange(ii, next);
        }
        updateSelectionIcons();
        view.draw();
    } else if ((hit = _paneHit(view.pegplan, x, y, settings))) {
        const ii = i_to_doc(hit.i, view.pegplan, false);
        const jj = j_to_doc(hit.j, view.pegplan, false);
        cursor.x2 = ii;
        cursor.y2 = jj;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            _applyGridToggle(pattern.pegplan, ii, jj, settings.current_range, "weave_recalc");
        }
        updateSelectionIcons();
        view.draw();
    } else if ((hit = _paneHit(view.treadling, x, y, settings))) {
        const ii = i_to_doc(hit.i, view.treadling, false);
        const jj = j_to_doc(hit.j, view.treadling, false);
        cursor.x2 = ii;
        cursor.y2 = jj;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            if (settings.single_treadling) {
                _applyTreadlingSingle(ii, jj);
            } else {
                _applyGridToggle(pattern.treadling, ii, jj, 1, "weave_recalc");
            }
        }
        updateSelectionIcons();
        view.draw();
    } else if (!settings.display_pegplan
               && (hit = _paneHit(view.tieup, x, y, settings))) {
        const ii = i_to_doc(hit.i, view.tieup, false);
        const jj = j_to_doc(hit.j, view.tieup, settings.direction_toptobottom);
        cursor.x2 = ii;
        cursor.y2 = jj;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            _applyGridToggle(pattern.tieup, ii, jj, settings.current_range, "weave_recalc");
        }
        updateSelectionIcons();
        view.draw();
    } else if (!settings.weave_locked
               && (hit = _paneHit(view.weave, x, y, settings))) {
        const ii = i_to_doc(hit.i, view.weave, settings.direction_righttoleft);
        const jj = j_to_doc(hit.j, view.weave, false);
        cursor.x2 = ii;
        cursor.y2 = jj;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            _applyGridToggle(pattern.weave, ii, jj, settings.current_range, "from_weave");
        }
        updateSelectionIcons();
        view.draw();
    } else if ((hit = _paneHit(view.color_warp, x, y, settings))) {
        const ii = i_to_doc(hit.i, view.color_warp, settings.direction_righttoleft);
        cursor.x2 = ii;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            // Shift-click on a color bar acts as a sniffer: pick the
            // clicked cell's color into settings.current_color instead
            // of overwriting it with the current paint color. (Ctrl+
            // click is reserved for cursor-only positioning.)
            if (event.shiftKey) {
                settings.current_color = pattern.color_warp.get(ii, 0);
                update_color_selector(settings);
            } else {
                _applyCellSet(pattern.color_warp, ii, 0, settings.current_color, null);
            }
        }
        updateSelectionIcons();
        view.draw();
    } else if ((hit = _paneHit(view.color_weft, x, y, settings))) {
        const jj = j_to_doc(hit.j, view.color_weft, false);
        cursor.y2 = jj;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            if (event.shiftKey) {
                settings.current_color = pattern.color_weft.get(0, jj);
                update_color_selector(settings);
            } else {
                _applyCellSet(pattern.color_weft, 0, jj, settings.current_color, null);
            }
        }
        updateSelectionIcons();
        view.draw();
    } else if ((hit = _paneHit(view.reed, x, y, settings))) {
        const ii = i_to_doc(hit.i, view.reed, settings.direction_righttoleft);
        cursor.x2 = ii;
        cursor.y2 = 0;
        const no_selection = cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2;
        if (no_selection && !had_selection) {
            _applyGridToggle(pattern.reed, ii, 0, 1, null);
        }
        updateSelectionIcons();
        view.draw();
    } else {
        if (view.scroll_1_hor.contains(x, y)) {
            view.scroll_1_hor.scrollTo(x);
        } else if (view.scroll_2_hor.contains(x, y)) {
            view.scroll_2_hor.scrollTo(x);
        } else if (view.scroll_1_ver.contains(x, y)) {
            view.scroll_1_ver.scrollTo(y);
        } else if (view.scroll_2_ver.contains(x, y)) {
            view.scroll_2_ver.scrollTo(y);
        }
    }
}

function init() {
    const darkmodeRaw = document.getElementById("darkmode").value;
    const darkmode = darkmodeRaw === "True"
        || (darkmodeRaw === "auto"
            && window.matchMedia
            && window.matchMedia("(prefers-color-scheme: dark)").matches);
    let canvas = document.getElementById('canvas');
    let ctx = canvas.getContext('2d');

    const width = data['width'];
    const height = data['height'];
    const max_shafts = data['max_shafts'];
    const max_treadles = data['max_treadles'];

    setPattern(new Pattern(width, height, max_shafts, max_treadles, {
        isPegplan: () => !!(settings && settings.display_pegplan),
        recalcFixedEntering: recalcFixedEntering,
        afterRecalcFromWeave: _applyArrangementHook,
    }));
    setSettings(new ViewSettings());
    settings.darcula = darkmode;

    {
        setCommandBus(new CommandBus());
        trackSavedState(commandBus);
    }

    initSettings(data, settings);
    initPatternData(data, pattern);
    _applyAspectRatio(settings);
    update_color_selector(settings);

    const container = document.getElementById("container");
    canvas.style.backgroundColor = settings.darcula ? "#444" : "#fff";
    canvas.style.border = "none";

    // Show/hide the palette panel BEFORE measuring container width so
    // the canvas's flex slot is already sized correctly when we set
    // canvas.width — otherwise the canvas takes the full container
    // width, then the panel pushes it narrower and the bitmap renders
    // squashed until the next reflow.
    const palettePanel = document.getElementById("palette-panel");
    if (palettePanel) {
        palettePanel.classList.toggle("hidden", !settings.display_palette);
    }
    const toolsPanel = document.getElementById("tools-panel");
    if (toolsPanel) {
        toolsPanel.classList.toggle("hidden", !settings.display_tools_panel);
        if (settings.display_tools_panel) _toolsToolboxRefresh();
    }
    const rangesPanel = document.getElementById("ranges-panel");
    if (rangesPanel) {
        rangesPanel.classList.toggle("hidden", !settings.display_ranges_panel);
        if (settings.display_ranges_panel) _rangesToolboxRefresh();
    }
    // Force a synchronous layout pass so canvas.clientWidth reflects
    // the post-toggle flex distribution.
    void container.offsetWidth;

    canvas.width = canvas.clientWidth || (container.clientWidth - 2);
    canvas.height = canvas.clientHeight || (container.clientHeight - 2);

    const visible_shafts = data['visible_shafts'];
    const visible_treadles = data['visible_treadles'];

    setView(new PatternView(
        pattern,
        settings,
        ctx,
        visible_shafts,
        visible_treadles
    ));
    view.afterDraw = updateStatusBar;
    // Restore last cursor position if persisted, else default to (0,0) on weave.
    const savedPart = val(data, "cursor_part", "weave");
    const savedX = val(data, "cursor_x", 0);
    const savedY = val(data, "cursor_y", 0);
    const validParts = ["weave", "entering", "treadling", "tieup", "color_warp", "color_weft"];
    if (validParts.indexOf(savedPart) >= 0) {
        select_part(savedPart, savedX, savedY);
    } else {
        select_part("weave", 0, 0);
    }
    update_range_selector(settings);
    if (settings.display_palette) _paletteToolboxRefresh();
    view.draw();
    // Defensive second pass: after the browser has settled the initial
    // flex distribution (toolbox panels are now in their final widths),
    // re-sync canvas.width with canvas.clientWidth and re-layout. This
    // matches what _sidePanelApply does and prevents click hit-testing
    // from drifting on a fresh page-load with toolboxes visible.
    requestAnimationFrame(() => {
        const c = document.getElementById("canvas");
        if (!c || !view) return;
        if (c.width !== c.clientWidth || c.height !== c.clientHeight) {
            c.width = c.clientWidth;
            c.height = c.clientHeight;
            view.layout();
            view.draw();
        }
    });

    document.getElementById("icon-selection-mirrorv").addEventListener("click", selectionMirrorV);
    document.getElementById("icon-selection-mirrorh").addEventListener("click", selectionMirrorH);
    document.getElementById("icon-selection-clear").addEventListener("click", selectionClear);
    document.getElementById("icon-selection-rotate").addEventListener("click", selectionRotate);
    document.getElementById("icon-selection-invert").addEventListener("click", selectionInvert);

    // Pointer Events unify mouse, touch and pen. The wrappers below
    // add a long-press gesture (~500ms hold without movement) that
    // simulates Ctrl+click — this is how a finger or stylus user
    // reaches the cursor-only-positioning gesture.
    canvas.addEventListener("pointerdown", _pointerDown);
    canvas.addEventListener("pointermove", _pointerMove);
    window.addEventListener("pointerup", _pointerUp);
    window.addEventListener("pointercancel", _pointerUp);
    // Disable the browser's default touch gestures (pan/zoom) on the
    // canvas — the editor needs full control of pointer drags.
    canvas.style.touchAction = "none";
    // Prevent the browser's long-press context menu so our long-press
    // gesture (Ctrl synthesis) is unimpeded on touch.
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
}


function val(data, prop, defval) {
    const result = data[prop];
    if (result === undefined) return defval;
    return result;
}





function keyDown(e) {
    // Keys typed into an open dialog must not edit the pattern behind it.
    if (editorDialogOpen()) return;
    // Don't hijack keystrokes targeted at editable fields (modal inputs,
    // textareas). Lets Tab / Shift+Tab navigate, arrow keys adjust
    // numeric inputs, Space insert whitespace, etc.
    const t = e.target;
    if (t && (t.isContentEditable
              || t.tagName === "INPUT"
              || t.tagName === "TEXTAREA"
              || t.tagName === "SELECT")) {
        return;
    }
    // Alt+1..4 (weave style) and Ctrl+Z/Y/X/C/V/B/I/S/Del, H/V/R/I selection
    // transforms are handled by the Shortcuts dispatcher + action registry
    // (see setupEditorActions). Keep cursor navigation + Space/Enter cell
    // toggles here for now. Pane-visibility lives in the Ansicht menu.
    if ((e.key == " " || e.key === "Enter") && e.shiftKey
               && (cursor.selected_part === "color_warp"
                || cursor.selected_part === "color_weft")) {
        // Color sniffer via cursor: Shift+Space / Shift+Enter on a
        // color bar picks the cell at the cursor into current_color
        // instead of stamping the current_color into the cell.
        e.stopPropagation();
        e.preventDefault();
        const idx = (cursor.selected_part === "color_warp")
            ? pattern.color_warp.get(cursor.x1, 0)
            : pattern.color_weft.get(0, cursor.y1);
        settings.current_color = idx;
        update_color_selector(settings);
        view.draw();
    } else if (e.key == " ") {
        if (cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2) {
            e.stopPropagation();
            e.preventDefault();
            const i = cursor.x1, j = cursor.y1;
            const part = cursor.selected_part;
            const grid = cursor.selected_pattern;
            // Route through the command-bus helpers so keyboard edits are
            // undoable, mirroring the mouse-click path.
            if (part === "entering") {
                const current = pattern.entering.get_shaft(i);
                const next = current == j + 1 ? 0 : j + 1;
                _applyEnteringChange(i, next);
            } else if (part === "weave") {
                _applyGridToggle(grid, i, j, settings.current_range, "from_weave");
            } else if (part === "treadling") {
                if (settings.single_treadling && !e.ctrlKey) {
                    _applyTreadlingSingle(i, j);
                } else {
                    _applyGridToggle(grid, i, j, 1, "weave_recalc");
                }
            } else if (part === "tieup" && !settings.display_pegplan) {
                _applyGridToggle(grid, i, j, settings.current_range, "weave_recalc");
            } else if (part === "pegplan") {
                _applyGridToggle(grid, i, j, settings.current_range, "weave_recalc");
            } else if (part === "color_warp") {
                _applyCellSet(grid, i, 0, settings.current_color, null);
            } else if (part === "color_weft") {
                _applyCellSet(grid, 0, j, settings.current_color, null);
            } else if (part === "reed") {
                _applyGridToggle(grid, i, 0, 1, null);
            }
            _advanceCursorAfterToggle();
            view.draw();
        }
    } else if (/^[0-9]$/.test(e.key)
               && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey
               && cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2) {
        // Legacy digit shortcuts: 1..9 toggle the current cell with that
        // range color; 0 clears it. Applies to weave / tieup / pegplan
        // parts (everything that holds a range value).
        const part = cursor.selected_part;
        const grid = cursor.selected_pattern;
        const tieupOk = (part === "tieup" && !settings.display_pegplan);
        if (part === "weave" || tieupOk || part === "pegplan") {
            e.stopPropagation();
            e.preventDefault();
            const i = cursor.x1, j = cursor.y1;
            const r = parseInt(e.key, 10);
            const recalcKind = (part === "weave") ? "from_weave" : "weave_recalc";
            if (r === 0) {
                _applyCellSet(grid, i, j, 0, recalcKind);
            } else {
                _applyGridToggle(grid, i, j, r, recalcKind);
            }
            _advanceCursorAfterToggle();
            view.draw();
        }
    } else if (e.key == "Enter" || e.key == "Tab") {
        e.stopPropagation();
        e.preventDefault();
        if (e.shiftKey) {
            goto_prev_part();
        } else {
            goto_next_part();
        }
        view.draw();
    } else if (e.key == "ArrowUp") {
        e.stopPropagation();
        e.preventDefault();
        if (_cursorTtb()) {
            cursorDown(e);
        } else {
            cursorUp(e);
        }
    } else if (e.key == "ArrowDown") {
        e.stopPropagation();
        e.preventDefault();
        if (_cursorTtb()) {
            cursorUp(e);
        } else {
            cursorDown(e);
        }
    } else if (e.key == "ArrowRight") {
        e.stopPropagation();
        e.preventDefault();
        if (_cursorRtl()) {
            cursorLeft(e);
        } else {
            cursorRight(e);
        }
    } else if (e.key == "ArrowLeft") {
        e.stopPropagation();
        e.preventDefault();
        if (_cursorRtl()) {
            cursorRight(e);
        } else {
            cursorLeft(e);
        }
    }
    // Note: Delete / V / H / R / I on an active selection are dispatched
    // through Shortcuts + ActionRegistry (see setupEditorActions).
}

// Cursor-direction bitmask values (CD_*) — match the desktop
// CURSORDIRECTION enum so saved patterns round-trip 1:1.


// _selBounds: read current selection bounds from cursor; returns null if
// nothing selected.


window.addEventListener("load", () => {
    setReadonly(document.getElementById("readonly").value === "True");
    window.addEventListener("keydown", keyDown);
    startEditor({
        readonly,
        preSave: () => {
            saveSettings(data, settings);
            savePatternData(data, pattern);
        },
        init: () => {
            init();
            setupEditorActions();
            setupToolbarAndStatusbar();
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
    get cursor() { return cursor; },
    get commandBus() { return commandBus; },
    get data() { return data; },
    get modified() { return modified; },
    get readonly() { return readonly; },
    ActionRegistry, Modal, select_part, setModified,
};

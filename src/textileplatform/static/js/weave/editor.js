import { ActionRegistry } from "../ui/actions.js";
import {
    CommandBus, makeCellCommand, makeEnteringCommand, makeGridRegionCommand,
    restoreEntering, restoreGridRegion, snapshotEntering,
    snapshotGridRegion,
} from "../ui/commands.js";
import {
    _prompt, clearModified, closePatternGuarded, data, downloadRendered,
    editorDialogOpen, editorI18n, getPattern, modified, resizeWindow,
    savePattern, setModified, startEditor, trackSavedState,
} from "../ui/common.js";
import { LegalDialog } from "../ui/legal.js";
import { Menu } from "../ui/menu.js";
import { Modal } from "../ui/modal.js";
import { Clipboard, Selection } from "../ui/selection.js";
import { Shortcuts } from "../ui/shortcuts.js";
import { ToolRaster } from "../ui/tools.js";
import { recalcFixedEntering } from "./arrange.js";
import { showMusterDialog } from "./blocks.js";
import { showFixeinzugDialog } from "./fixed-threading.js";
import {
    ATLAS_OFFSETS, completeTwill, stampAtlas, stampTwill,
} from "./generators.js";
import { _hlineHitPx, _hlineToggle } from "./guides.js";
import {
    _fullPatternSnapshot, _fullSnapCommand, _restoreFullPatternSnapshot,
    _structuralCommand,
} from "./history.js";
import {
    _printDownload, showPageSetupDialog, showPatternInfoDialog,
    showPrintPartDialog, showPropertiesDialog,
} from "./info.js";
import {
    _kettLancierung, _schussLancierung, showLancierungDialog,
} from "./lancee.js";
import { Pattern } from "./model.js";
import {
    _applyArrangementHook, _applyBaseStyle, _runEzArrangement,
    _runTfArrangement, CD_DOWN, CD_LEFT, CD_RIGHT, CD_UP,
    showCursorMovementDialog, showOptionsDialog, showWarpWeftRatioDialog,
} from "./options.js";
import {
    _paneHit, abbindungPainter, anbindungPainter, aushebungPainter,
    fillRect, getRangeColor,
} from "./painters.js";
import {
    _bulkColorCommand, _paletteToolboxApply, _paletteToolboxRefresh,
    _paletteToolboxToggle, _pickPaletteIndex, showColorBlendDialog,
    showPaletteDialog, update_color_selector,
} from "./palette.js";
import {
    initPatternData, initSettings, savePatternData, saveSettings,
} from "./persist.js";
import {
    colors, commandBus, cursor, pattern, readonly, setCommandBus,
    setPattern, setReadonly, setSettings, settings, setView, view,
} from "./state.js";
import { showThreadingWizardDialog } from "./threading-wizard.js";
import { captureThumbnails } from "./thumbnail.js";
import {
    clearPegplan, invertPegplan, mirrorPegplan, repeatWarp, repeatWeft,
    switchSide,
} from "./transforms.js";
import {
    _insertUserdef, _refreshUserdefMenuLabels, _userdefAddCurrent,
    _userdefAddSelection, _userdefList, _userdefRemoveClick,
} from "./userdef.js";
import {
    _applyAspectRatio, GridViewDummy, PatternView, ViewSettings,
} from "./views.js";

// The editor's shared state (pattern, view, settings, cursor, colors,
// readonly, commandBus) lives in state.js; `data` (the stored pattern
// JSON) in ui/common.js.



let mousedown = false;
// Drag state of the drawing tools (ui/tools.js rasterizes).
let toolDrag = null;
let had_selection = false;
let saved_x_weave = 0;
let saved_y_weave = 0;
let saved_x_tieup = 0;
let saved_y_tieup = 0;



function goto_next_part() {
    if (cursor.selected_part === "weave") {
        select_part("entering", saved_x_weave, saved_y_tieup);
    } else if (cursor.selected_part === "entering") {
        select_part("treadling", saved_x_tieup, saved_y_weave);
    } else if (cursor.selected_part === "treadling") {
        select_part("tieup", saved_x_tieup, saved_y_tieup);
    } else if (cursor.selected_part === "tieup") {
        select_part("pegplan", saved_x_tieup, saved_y_weave);
    } else if (cursor.selected_part === "pegplan") {
        select_part("color_weft", 0, saved_y_weave);
    } else if (cursor.selected_part === "color_weft") {
        select_part("color_warp", saved_x_weave, 0);
    } else if (cursor.selected_part === "color_warp") {
        select_part("reed", saved_x_weave, 0);
    } else if (cursor.selected_part === "reed") {
        select_part("weave", saved_x_weave, saved_y_weave);
    }
    if (cursor.selected_view instanceof GridViewDummy) goto_next_part();
    if (cursor.selected_part === "weave" && settings.weave_locked) goto_next_part();
}

function goto_prev_part() {
    if (cursor.selected_part === "weave") {
        select_part("reed", saved_x_weave, 0);
    } else if (cursor.selected_part === "reed") {
        select_part("color_warp", saved_x_weave, 0);
    } else if (cursor.selected_part === "entering") {
        select_part("weave", saved_x_weave, saved_y_weave);
    } else if (cursor.selected_part === "treadling") {
        select_part("entering", saved_x_weave, saved_y_tieup);
    } else if (cursor.selected_part === "tieup") {
        select_part("treadling", saved_x_tieup, saved_y_weave);
    } else if (cursor.selected_part === "pegplan") {
        select_part("entering", saved_x_weave, saved_y_tieup);
    } else if (cursor.selected_part === "color_weft") {
        select_part("pegplan", saved_x_tieup, saved_y_weave);
    } else if (cursor.selected_part === "color_warp") {
        select_part("color_weft", 0, saved_y_weave);
    }
    if (cursor.selected_view instanceof GridViewDummy) goto_prev_part();
    if (cursor.selected_part === "weave" && settings.weave_locked) goto_prev_part();
}

function save_part_position() {
    if (cursor.selected_part === "weave") {
        saved_x_weave = cursor.x2;
        saved_y_weave = cursor.y2;
    } else if (cursor.selected_part === "entering") {
        saved_x_weave = cursor.x2;
        saved_y_tieup = cursor.y2;
    } else if (cursor.selected_part === "treadling") {
        saved_x_tieup = cursor.x2;
        saved_y_weave = cursor.y2;
    } else if (cursor.selected_part === "tieup") {
        saved_x_tieup = cursor.x2;
        saved_y_tieup = cursor.y2;
    } else if (cursor.selected_part === "color_weft") {
        saved_y_weave = cursor.y2;
    } else if (cursor.selected_part === "color_warp") {
        saved_x_weave = cursor.x2;
    } else if (cursor.selected_part === "reed") {
        saved_x_weave = cursor.x2;
    }
}

function select_part(part, x1, y1, x2, y2) {
    if (x1 !== undefined) cursor.x1 = x1;
    if (y1 !== undefined) cursor.y1 = y1;
    if (x2 !== undefined) cursor.x2 = x2; else cursor.x2 = x1;
    if (y2 !== undefined) cursor.y2 = y2; else cursor.y2 = y1;
    if (part === "entering") {
        saved_x_weave = cursor.x2;
        saved_y_tieup = cursor.y2;
        cursor.selected_part = "entering";
        cursor.selected_pattern = pattern.entering;
        cursor.selected_view = view.entering;
    } else if (part === "tieup") {
        saved_x_tieup = cursor.x2;
        saved_y_tieup = cursor.y2;
        cursor.selected_part = "tieup";
        cursor.selected_pattern = pattern.tieup;
        cursor.selected_view = view.tieup;
    } else if (part === "treadling") {
        saved_x_tieup = cursor.x2;
        saved_y_weave = cursor.y2;
        cursor.selected_part = "treadling";
        cursor.selected_pattern = pattern.treadling;
        cursor.selected_view = view.treadling;
    } else if (part === "weave") {
        saved_x_weave = cursor.x2;
        saved_y_weave = cursor.y2;
        cursor.selected_part = "weave";
        cursor.selected_pattern = pattern.weave;
        cursor.selected_view = view.weave;
    } else if (part === "color_warp") {
        saved_x_weave = cursor.x2;
        cursor.selected_part = "color_warp";
        cursor.selected_pattern = pattern.color_warp;
        cursor.selected_view = view.color_warp;
    } else if (part === "color_weft") {
        saved_y_weave = cursor.y2;
        cursor.selected_part = "color_weft";
        cursor.selected_pattern = pattern.color_weft;
        cursor.selected_view = view.color_weft;
    } else if (part === "pegplan") {
        saved_x_tieup = cursor.x2;
        saved_y_weave = cursor.y2;
        cursor.selected_part = "pegplan";
        cursor.selected_pattern = pattern.pegplan;
        cursor.selected_view = view.pegplan;
    } else if (part === "reed") {
        saved_x_weave = cursor.x2;
        cursor.selected_part = "reed";
        cursor.selected_pattern = pattern.reed;
        cursor.selected_view = view.reed;
    } else {
        console.error("cannot select part", part);
    }
    ActionRegistry.notify();
}


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
    if (readonly) { toolDrag = null; return; }
    if (!toolDrag || !toolDrag.active) { toolDrag = null; return; }
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
    toolDrag = null;
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
            toolDrag = {
                tool: settings.tool, pane_info: p,
                i1: ii, j1: jj, i2: ii, j2: jj, active: true,
            };
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
    update_view_options(settings);

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

function updateSelectionIcons() {
    const has_selection = cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2;
    const is_square = has_selection && Math.abs(cursor.x2 - cursor.x1) === Math.abs(cursor.y2 - cursor.y1);
    if (has_selection) {
        document.getElementById("icon-selection-mirrorv").classList.remove("hidden");
        document.getElementById("icon-selection-mirrorh").classList.remove("hidden");
        if (is_square) {
            document.getElementById("icon-selection-rotate").classList.remove("hidden");
        } else {
            document.getElementById("icon-selection-rotate").classList.add("hidden");
        }
        if (cursor.selected_part === "weave") {
            document.getElementById("icon-selection-invert").classList.remove("hidden");
        } else {
            document.getElementById("icon-selection-invert").classList.add("hidden");
        }
        document.getElementById("icon-selection-clear").classList.remove("hidden");
    } else {
        document.getElementById("icon-selection-mirrorv").classList.add("hidden");
        document.getElementById("icon-selection-mirrorh").classList.add("hidden");
        document.getElementById("icon-selection-rotate").classList.add("hidden");
        document.getElementById("icon-selection-invert").classList.add("hidden");
        document.getElementById("icon-selection-clear").classList.add("hidden");
    }
}

function val(data, prop, defval) {
    const result = data[prop];
    if (result === undefined) return defval;
    return result;
}

// Trigger a server-side export. POSTs a snapshot of the in-memory
// pattern (without persisting it) so the export reflects unsaved
// edits — display settings included — without auto-saving the
// modified state. The server renders the document and returns the
// file; we wrap it in a Blob and trigger a download via an anchor.
async function _exportDownload(fmt) {
    // Mutate `data` *in memory only* so it reflects the latest
    // settings + pattern grids; the request body uses this snapshot.
    saveSettings(data, settings);
    savePatternData(data, pattern);
    const ext = fmt === "jpeg" ? "jpg" : fmt;
    await downloadRendered(
        `export/${fmt}`, { contents: data },
        `${document.getElementById("pattern").value}.${ext}`,
        _prompt("exportFailed", "Export failed."));
}


async function _revertChanges() {
    if (readonly || !modified) return;
    const i18n = editorI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    if (!window.confirm(L("file.revert-confirm",
        "Discard all unsaved changes and reload the pattern from the server?"))) return;
    try {
        await getPattern();
    } catch (e) {
        console.error(e);
        alert(_prompt("loadFailed",
            "The pattern could not be loaded. Please reload the page."));
        return;
    }
    initSettings(data, settings);
    initPatternData(data, pattern);
    if (commandBus) commandBus.clear();
    pattern.recalc_weave();
    if (view) {
        view.layout();
        view.draw();
    }
    update_color_selector(settings);
    update_view_options(settings);
    update_range_selector(settings);
    _paletteToolboxApply();
    _toolsToolboxApply();
    _rangesToolboxApply();
    clearModified();
    ActionRegistry.notify();
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


// Snap the cursor into the active rapport when "in rapport" mode is on.
// Mirrors CrCursorHandlerImpl::CheckLocked: warp axis (k) clamps for
// entering / weave; weft axis (s) clamps for weave / treadling /
// pegplan. Wraps modulo the rapport length so arrow keys cycle inside
// the repeat. No-op unless a rapport has been detected.
function _applyCursorLock() {
    if (!settings.cursor_locked) return;
    const part = cursor.selected_part;
    const wrap = (v, a, b) => {
        const len = b - a + 1;
        if (len <= 0) return v;
        return a + ((v - a) % len + len) % len;
    };
    if (part === "weave" || part === "entering") {
        const x = wrap(cursor.x2, pattern.rapport_k_a, pattern.rapport_k_b);
        cursor.x2 = x; cursor.x1 = x;
    }
    if (part === "weave" || part === "treadling" || part === "pegplan") {
        const y = wrap(cursor.y2, pattern.rapport_s_a, pattern.rapport_s_b);
        cursor.y2 = y; cursor.y1 = y;
    }
}

// Live screen-axis flags for the cursor's current pane. Reading from
// settings + selected_part instead of cursor.selected_view.righttoleft /
// .toptobottom — view.layout() rebuilds pane objects on every settings
// change, and cursor.selected_view can lag behind (e.g. the reed pane
// isn't re-bound after layout). Deriving from the live setting keeps
// arrow keys correct even if the cached view is stale.
function _cursorRtl() {
    const part = cursor && cursor.selected_part;
    // Panes laid out on the warp axis honour direction_righttoleft.
    // Treadling / tie-up / pegplan / color_weft never flip horizontally.
    if (part === "entering" || part === "weave"
        || part === "reed" || part === "color_warp") {
        return !!settings.direction_righttoleft;
    }
    return false;
}
function _cursorTtb() {
    const part = cursor && cursor.selected_part;
    // Panes on the weft axis (entering shafts, tie-up shafts) honour
    // direction_toptobottom. Other panes paint top-to-bottom by their
    // own convention.
    if (part === "entering" || part === "tieup") {
        return !!settings.direction_toptobottom;
    }
    return false;
}

// Auto-advance the cursor after a Space toggle, in the direction(s)
// configured by Extras ▸ Cursor ▸ Movement. Multiple bits OR'd together
// produce diagonal moves. cursor_dir bits are interpreted in doc/work
// coordinates (CD_RIGHT = next warp thread, CD_UP = next weft row), so
// "advance" always moves to the next cell in reading order — when RTL
// is on this is visually leftward, matching the user's work direction.
function _advanceCursorAfterToggle() {
    const dir = settings.cursor_dir | 0;
    const ev = { shiftKey: false, ctrlKey: false };
    // Single-row bars (color_warp, reed) must only advance horizontally;
    // single-column bars (color_weft) only vertically. Strip the
    // perpendicular bits, and if the user's cursor_dir has no bit on
    // the bar's long axis fall back to a sensible default so Space
    // still advances at all.
    const pat = cursor.selected_pattern;
    const isHorzBar = pat && pat.height === 1 && pat.width > 1;
    const isVertBar = pat && pat.width === 1 && pat.height > 1;
    let h = dir & (CD_LEFT | CD_RIGHT);
    let v = dir & (CD_UP | CD_DOWN);
    if (isHorzBar) {
        v = 0;
        if (!h) h = CD_RIGHT;
    } else if (isVertBar) {
        h = 0;
        if (!v) v = CD_UP;
    }
    if (!h && !v) return;
    if (v & CD_UP)    cursorUp(ev);
    if (v & CD_DOWN)  cursorDown(ev);
    if (h & CD_LEFT)  cursorLeft(ev);
    if (h & CD_RIGHT) cursorRight(ev);
}

// When the cursor currently spans a multi-cell selection, an unmodified
// arrow collapses to a single cell adjacent to the corresponding edge,
// anchored at the base (min) of the perpendicular axis — independent of
// which corner originally anchored the selection. Returns true if the
// collapse fired.
function _collapseSelectionForArrow(dir) {
    if (cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2) return false;
    const i1 = Math.min(cursor.x1, cursor.x2);
    const i2 = Math.max(cursor.x1, cursor.x2);
    const j1 = Math.min(cursor.y1, cursor.y2);
    const j2 = Math.max(cursor.y1, cursor.y2);
    const w = cursor.selected_pattern.width;
    const h = cursor.selected_pattern.height;
    let x = i1, y = j1;
    if (dir === "right")     x = Math.min(i2 + 1, w - 1);
    else if (dir === "left") x = Math.max(i1 - 1, 0);
    else if (dir === "up")   y = Math.min(j2 + 1, h - 1);
    else if (dir === "down") y = Math.max(j1 - 1, 0);
    cursor.x1 = cursor.x2 = x;
    cursor.y1 = cursor.y2 = y;
    return true;
}

function cursorUp(e) {
    if (e.shiftKey) {
        if (e.ctrlKey) {
            if (cursor.y1 === cursor.y2) {
                cursor.y2 += settings.unit_height - 1;
            } else if (cursor.y2 + settings.unit_height - 1 === cursor.y1) {
                cursor.y2 += settings.unit_height - 1;
            } else {
                cursor.y2 += settings.unit_height;
            }
        } else {
            cursor.y2++;
        }
        if (cursor.y2 >= cursor.selected_pattern.height) {
            cursor.y2 = cursor.selected_pattern.height - 1;
        }
    } else if (!_collapseSelectionForArrow("up")) {
        cursor.x1 = cursor.x2;
        if (e.ctrlKey) {
            cursor.y2 += settings.unit_height;
        } else {
            cursor.y2++;
        }
        if (cursor.y2 >= cursor.selected_pattern.height) {
            cursor.y2 = cursor.selected_pattern.height - 1;
        }
        cursor.y1 = cursor.y2;
    }
    const max_y = cursor.selected_view.offset_j + cursor.selected_view.height;
    if (cursor.y2 >= max_y) {
        const scroll_delta = cursor.y2 - max_y + 1;
        cursor.selected_view.scroll("v", scroll_delta);
    }
    _applyCursorLock();
    updateSelectionIcons();
    save_part_position();
    view.draw();
}

function cursorDown(e) {
    if (e.shiftKey) {
        if (e.ctrlKey) {
            if (cursor.y1 === cursor.y2) {
                cursor.y2 -= settings.unit_height - 1;
            } else if (cursor.y1 + settings.unit_height - 1 === cursor.y2) {
                cursor.y2 -= settings.unit_height - 1;
            } else {
                cursor.y2 -= settings.unit_height;
            }
        } else {
            cursor.y2--;
        }
        if (cursor.y2 < 0) {
            cursor.y2 = 0;
        }
    } else if (!_collapseSelectionForArrow("down")) {
        cursor.x1 = cursor.x2;
        if (e.ctrlKey) {
            cursor.y2 -= settings.unit_height;
        } else {
            cursor.y2--;
        }
        if (cursor.y2 < 0) {
            cursor.y2 = 0;
        }
        cursor.y1 = cursor.y2;
    }
    const min_y = cursor.selected_view.offset_j;
    if (cursor.y2 < min_y) {
        const scroll_delta = cursor.y2 - min_y;
        cursor.selected_view.scroll("v", scroll_delta);
    }
    _applyCursorLock();
    updateSelectionIcons();
    save_part_position();
    view.draw();
}

function cursorRight(e) {
    if (e.shiftKey) {
        if (e.ctrlKey) {
            if (cursor.x1 === cursor.x2) {
                cursor.x2 += settings.unit_width - 1;
            } else if (cursor.x2 + settings.unit_width - 1 == cursor.x1) {
                cursor.x2 += settings.unit_width - 1;
            } else {
                cursor.x2 += settings.unit_width;
            }
        } else {
            cursor.x2++;
        }
        if (cursor.x2 >= cursor.selected_pattern.width) {
            cursor.x2 = cursor.selected_pattern.width - 1;
        }
    } else if (!_collapseSelectionForArrow("right")) {
        if (e.ctrlKey) {
            cursor.x2 += settings.unit_width;
        } else {
            cursor.x2++;
        }
        if (cursor.x2 >= cursor.selected_pattern.width) {
            cursor.x2 = cursor.selected_pattern.width - 1;
        }
        cursor.x1 = cursor.x2;
        cursor.y1 = cursor.y2;
    }
    const max_x = cursor.selected_view.offset_i + cursor.selected_view.width;
    if (cursor.x2 >= max_x) {
        const scroll_delta = cursor.x2 - max_x + 1;
        cursor.selected_view.scroll("h", scroll_delta);
    }
    _applyCursorLock();
    updateSelectionIcons();
    save_part_position();
    view.draw();
}

function cursorLeft(e) {
    if (e.shiftKey) {
        if (e.ctrlKey) {
            if (cursor.x1 + settings.unit_width - 1 === cursor.x2) {
                cursor.x2 -= settings.unit_width - 1;
            } else if (cursor.x1 == cursor.x2) {
                cursor.x2 -= settings.unit_width - 1;
            } else {
                cursor.x2 -= settings.unit_width;
            }
        } else {
            cursor.x2--;
        }
        if (cursor.x2 < 0) {
            cursor.x2 = 0;
        }
    } else if (!_collapseSelectionForArrow("left")) {
        if (e.ctrlKey) {
            cursor.x2 -= settings.unit_width;
        } else {
            cursor.x2--;
        }
        if (cursor.x2 < 0) {
            cursor.x2 = 0;
        }
        cursor.x1 = cursor.x2;
        cursor.y1 = cursor.y2;
    }
    const min_x = cursor.selected_view.offset_i;
    if (cursor.x2 < min_x) {
        const scroll_delta = cursor.x2 - min_x;
        cursor.selected_view.scroll("h", scroll_delta);
    }
    _applyCursorLock();
    updateSelectionIcons();
    save_part_position();
    view.draw();
}

// _selBounds: read current selection bounds from cursor; returns null if
// nothing selected.
function _selBounds() {
    const i1 = Math.min(cursor.x1, cursor.x2);
    const i2 = Math.max(cursor.x1, cursor.x2);
    const j1 = Math.min(cursor.y1, cursor.y2);
    const j2 = Math.max(cursor.y1, cursor.y2);
    return { i1, i2, j1, j2 };
}

// _recalcAfterMutation: trigger the right recalc path based on which pane
// the mutation happened in, and redraw.
function _afterPatternMutation(part) {
    if (part === "weave") pattern.recalc_from_weave(settings);
    else pattern.recalc_weave();
    setModified();
    view.draw();
}

// Dispatch a snapshot-backed mutation as an undoable command.
function _runSelectionCommand(label, grid, mutate) {
    const { i1, i2, j1, j2 } = _selBounds();
    const part = cursor.selected_part;
    if (!commandBus) { mutate(); _afterPatternMutation(part); return; }
    const cmd = makeGridRegionCommand({
        grid, i1, j1, i2, j2,
        mutate,
        afterApply: () => _afterPatternMutation(part),
        label,
    });
    commandBus.execute(cmd);
}

function selectionClear() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("clear", grid, () => grid.clearRange(i1, j1, i2, j2));
}

function selectionInvert() {
    const { i1, i2, j1, j2 } = _selBounds();
    if (cursor.selected_part === "weave") {
        _runSelectionCommand("invert", pattern.weave,
            () => pattern.weave.invertRange(i1, j1, i2, j2, settings.current_range));
    } else if (cursor.selected_part === "tieup") {
        _runSelectionCommand("invert", pattern.tieup,
            () => pattern.tieup.invertRange(i1, j1, i2, j2, settings.current_range));
    }
}

function selectionRotate() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("rotate", grid, () => grid.rotateRight(i1, j1, i2, j2));
}

function selectionMirrorV() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("mirror-v", grid, () => grid.mirrorV(i1, j1, i2, j2));
}

function selectionMirrorH() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("mirror-h", grid, () => grid.mirrorH(i1, j1, i2, j2));
}

function selectionRollUp() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("roll-up", grid, () => grid.rollUp(i1, j1, i2, j2));
}
function selectionRollDown() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("roll-down", grid, () => grid.rollDown(i1, j1, i2, j2));
}
function selectionRollLeft() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("roll-left", grid, () => grid.rollLeft(i1, j1, i2, j2));
}
function selectionRollRight() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("roll-right", grid, () => grid.rollRight(i1, j1, i2, j2));
}

function selectionSlopeIncrease() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("slope-inc", grid, () => grid.slopeIncrease(i1, j1, i2, j2));
}
function selectionSlopeDecrease() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    _runSelectionCommand("slope-dec", grid, () => grid.slopeDecrease(i1, j1, i2, j2));
}

function selectionCentralSymmetry() {
    const { i1, i2, j1, j2 } = _selBounds();
    const grid = cursor.selected_pattern;
    const part = cursor.selected_part;
    // The algorithm either does nothing (already symmetric OR no symmetric
    // shift exists) or applies a specific cyclic shift. Avoid pushing a
    // no-op command onto the undo stack by capturing the before/after
    // snapshots ourselves.
    const before = snapshotGridRegion(grid, i1, j1, i2, j2);
    const result = grid.centralSymmetry(i1, j1, i2, j2);
    if (result !== "applied") {
        // Either already symmetric or no shift exists — nothing changed.
        return;
    }
    const after = snapshotGridRegion(grid, i1, j1, i2, j2);
    restoreGridRegion(grid, before);
    const afterApply = () => _afterPatternMutation(part);
    const cmd = {
        label: "central-symmetry",
        apply()  { restoreGridRegion(grid, after);  afterApply(); },
        revert() { restoreGridRegion(grid, before); afterApply(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else cmd.apply();
}

// Tie-up specific: mirror the entire tie-up matrix horizontally. This is the
// desktop's "Swap Sides" operation — commonly used to flip from Z to S style.
function tieupSwapSides() {
    if (readonly) return;
    const g = pattern.tieup;
    const w = g.width, h = g.height;
    const mutate = () => g.mirrorH(0, 0, w - 1, h - 1);
    const afterApply = _recalcFor("weave_recalc");
    if (!commandBus) { mutate(); afterApply(); return; }
    commandBus.execute(makeGridRegionCommand({
        grid: g, i1: 0, j1: 0, i2: w - 1, j2: h - 1,
        mutate, afterApply, label: "tieup swap sides",
    }));
}

// Cut / Copy / Paste — uses Selection + Clipboard modules from selection.js.
//
// After a copy, the cursor advances to just past the copied range — to the
// right for most fields, below for treadling/color_weft. This matches the
// desktop CopySelection(_movecursor=true) path: cursor moves while
// selection collapses (the web model unifies cursor + selection in the
// (x1,y1)-(x2,y2) pair, so we collapse to a single cell at the new spot).
function _moveCursorAfterCopy() {
    if (Selection.isEmpty(cursor)) return;
    const sel = Selection.current(cursor);
    if (!sel) return;
    const part = sel.part;
    const grid = cursor.selected_pattern;
    const w = grid && grid.width !== undefined ? grid.width : Infinity;
    const h = grid && grid.height !== undefined ? grid.height : Infinity;
    let x, y;
    if (part === "treadling" || part === "color_weft") {
        x = sel.i1;
        y = Math.min(sel.j2 + 1, h - 1);
    } else {
        x = Math.min(sel.i2 + 1, w - 1);
        y = sel.j1;
    }
    cursor.x1 = cursor.x2 = x;
    cursor.y1 = cursor.y2 = y;
    updateSelectionIcons();
    save_part_position();
    if (view.draw) view.draw();
}

function selectionCopy() {
    if (Selection.isEmpty(cursor)) return;
    Selection.copyToClipboard(cursor, pattern);
    _moveCursorAfterCopy();
}

function selectionCut() {
    if (Selection.isEmpty(cursor)) return;
    Selection.copyToClipboard(cursor, pattern);
    selectionClear();
}

function _paste(transparent) {
    if (!Clipboard.has()) return;
    const sel = Selection.current(cursor);
    if (!sel) return;
    // Build a command that captures the destination region's before-state.
    const payload = Clipboard.get();
    const grid = cursor.selected_pattern;
    const i1 = sel.i1, j1 = sel.j1;
    let i2 = i1 + payload.w - 1;
    let j2 = j1 + payload.h - 1;
    // Clamp to grid bounds where applicable.
    if (grid && grid.width !== undefined) i2 = Math.min(i2, grid.width - 1);
    if (grid && grid.height !== undefined) j2 = Math.min(j2, grid.height - 1);
    const part = cursor.selected_part;
    if (!commandBus) {
        Selection.pasteFromClipboard(cursor, pattern, transparent);
        _afterPatternMutation(part);
        return;
    }
    if (part === "entering") {
        const snap = snapshotEntering(pattern.entering, i1, i2);
        commandBus.execute({
            label: transparent ? "paste-transparent" : "paste",
            apply() { Selection.pasteFromClipboard(cursor, pattern, transparent); _afterPatternMutation(part); },
            revert() { restoreEntering(pattern.entering, snap); _afterPatternMutation(part); },
        });
    } else if (grid && grid.get && grid.set) {
        const snap = snapshotGridRegion(grid, i1, j1, i2, j2);
        commandBus.execute({
            label: transparent ? "paste-transparent" : "paste",
            apply() { Selection.pasteFromClipboard(cursor, pattern, transparent); _afterPatternMutation(part); },
            revert() { restoreGridRegion(grid, snap); _afterPatternMutation(part); },
        });
    }
}
function selectionPaste() { _paste(false); }
function selectionPasteTransparent() { _paste(true); }


function update_range_selector(settings) {
    const currentLabel = document.getElementById("current-range");
    if (!currentLabel) return;
    for (let k = 1; k <= 12; k++) {
        const el = document.getElementById(`range${k}`);
        if (el) el.className = (k === settings.current_range) ? "current" : "";
    }
    const active = document.getElementById(`range${settings.current_range}`);
    if (active) currentLabel.innerText = active.innerText;
}


function update_view_options(settings) {
    // Old DOM elements were removed in favour of the action-bound
    // toolbar; the legacy handler is kept as a no-op so callers don't
    // have to grow guards.
}


// ---- Command-backed primitives for single-cell/thread edits ----
//
// Called from mouseUp and (later) keyboard-driven cell toggle. `recalc`:
//   "from_weave" -> recalc_from_weave(settings) after apply
//   "weave_recalc" -> recalc_weave() after apply
//   null -> no recalc
function _recalcFor(kind) {
    return () => {
        if (kind === "from_weave") pattern.recalc_from_weave(settings);
        else if (kind === "weave_recalc") pattern.recalc_weave();
        setModified();
        view.draw();
    };
}

function _applyEnteringChange(i, newShaft) {
    // Read-only views (someone else's pattern) must not change cells,
    // neither by mouse nor by keyboard. All cell edits go through
    // these _apply* helpers, so the guard lives here.
    if (readonly) return;
    if (!commandBus) {
        pattern.entering.set_shaft(i, newShaft);
        pattern.recalc_weave();
        setModified();
        return;
    }
    commandBus.execute(makeEnteringCommand({
        entering: pattern.entering, i, newShaft,
        afterApply: _recalcFor("weave_recalc"),
        label: "set shaft",
    }));
}

function _applyGridToggle(grid, i, j, defaultValue, recalcKind) {
    if (readonly) return;
    const current = grid.get(i, j);
    // Toggling an "off" cell (zero or stored-as-negative) always uses
    // the *currently active* range, not the value the cell previously
    // held. Matches desktop SetGewebe / SetEintrag behaviour: switching
    // bereich and re-toggling stamps the new bereich.
    const newValue = current > 0 ? -current : defaultValue;
    // Weave edits inside an active rapport replicate the new value across
    // every rapport copy within the pattern extent — matches desktop
    // SetGewebe's rapport-propagation branch. Single undoable command.
    if (grid === pattern.weave
        && settings && settings.display_repeat
        && _isInRapport(i, j)
        && _rapportValid()) {
        _applyWeaveCellWithRapport(i, j, newValue, recalcKind);
        return;
    }
    _applyCellSet(grid, i, j, newValue, recalcKind);
}

function _rapportValid() {
    return pattern.rapport_k_b >= pattern.rapport_k_a
        && pattern.rapport_s_b >= pattern.rapport_s_a;
}

function _isInRapport(i, j) {
    return i >= pattern.rapport_k_a && i <= pattern.rapport_k_b
        && j >= pattern.rapport_s_a && j <= pattern.rapport_s_b;
}

// Collect all (i, j) inside the active extent that are rapport copies of
// the given seed cell, mutate them together, and wrap in one command.
function _applyWeaveCellWithRapport(seedI, seedJ, newValue, recalcKind) {
    const rw = pattern.rapport_k_b - pattern.rapport_k_a + 1;
    const rh = pattern.rapport_s_b - pattern.rapport_s_a + 1;
    const ka = pattern.rapport_k_a, kb_extent = pattern.max_x;
    const sa = pattern.rapport_s_a, sb_extent = pattern.max_y;
    const dx = ((seedI - ka) % rw + rw) % rw;
    const dy = ((seedJ - sa) % rh + rh) % rh;
    // Compute the set of all target cells and the bounding box for
    // snapshotting. Iterate the entire extent, not just the rapport span,
    // because the pattern is "rapportiert" (repeated) beyond it.
    const extentLoI = Math.max(pattern.min_x, 0);
    const extentHiI = Math.min(kb_extent, pattern.weave.width - 1);
    const extentLoJ = Math.max(pattern.min_y, 0);
    const extentHiJ = Math.min(sb_extent, pattern.weave.height - 1);
    const targets = [];
    let lo_i = Infinity, hi_i = -Infinity, lo_j = Infinity, hi_j = -Infinity;
    for (let i = extentLoI; i <= extentHiI; i++) {
        if (((i - ka) % rw + rw) % rw !== dx) continue;
        for (let j = extentLoJ; j <= extentHiJ; j++) {
            if (((j - sa) % rh + rh) % rh !== dy) continue;
            targets.push([i, j]);
            if (i < lo_i) lo_i = i;
            if (i > hi_i) hi_i = i;
            if (j < lo_j) lo_j = j;
            if (j > hi_j) hi_j = j;
        }
    }
    if (targets.length === 0) {
        _applyCellSet(pattern.weave, seedI, seedJ, newValue, recalcKind);
        return;
    }
    const grid = pattern.weave;
    const afterApply = _recalcFor(recalcKind);
    const mutate = () => {
        for (const [ii, jj] of targets) grid.set(ii, jj, newValue);
    };
    if (!commandBus) { mutate(); afterApply(); return; }
    commandBus.execute(makeGridRegionCommand({
        grid, i1: lo_i, j1: lo_j, i2: hi_i, j2: hi_j,
        mutate, afterApply, label: "rapport edit",
    }));
}

function _applyCellSet(grid, i, j, newValue, recalcKind) {
    if (readonly) return;
    if (!commandBus) {
        grid.set(i, j, newValue);
        if (recalcKind === "from_weave") pattern.recalc_from_weave(settings);
        else if (recalcKind === "weave_recalc") pattern.recalc_weave();
        setModified();
        return;
    }
    commandBus.execute(makeCellCommand({
        grid, i, j, newValue,
        afterApply: _recalcFor(recalcKind),
        label: "set cell",
    }));
}

// Treadling single-mode: clear row, then optionally set the clicked cell.
// Captured as one command spanning the whole row.
function _applyTreadlingSingle(i, j) {
    if (readonly) return;
    const grid = pattern.treadling;
    const wasSet = grid.get(i, j) > 0;
    if (!commandBus) {
        grid.clearRow(j);
        if (!wasSet) grid.set(i, j, 1);
        pattern.recalc_weave(); setModified();
        return;
    }
    const w = grid.width;
    const snap = snapshotGridRegion(grid, 0, j, w - 1, j);
    const after = _recalcFor("weave_recalc");
    commandBus.execute({
        label: "treadle row",
        apply() {
            grid.clearRow(j);
            if (!wasSet) grid.set(i, j, 1);
            after();
        },
        revert() { restoreGridRegion(grid, snap); after(); },
    });
}


// ---- Structural operations (insert/remove/move shaft/treadle/warp/weft) ----
//
// Grid dimensions (width/height/max_shafts/max_treadles) are fixed at pattern
// load time, so structural ops shift values in place: insertions push the
// last row/column off the end; deletions leave an empty row/column at the far
// end. Each op is wrapped in a full-pattern snapshot command for clean undo.


// Shafts (rows of tieup; columns of pegplan; shaft index is 1-based in
// the Entering array).
function _insertShaftAt(at) {
    pattern.tieup.insertRow(at);
    pattern.pegplan.insertCol(at);
    // Entering: any shaft number >= at+1 shifts up; dropped if > max_shafts.
    const maxShaft = pattern.tieup.height;
    for (let i = 0; i < pattern.entering.width; i++) {
        const s = pattern.entering.get_shaft(i);
        if (s >= at + 1) {
            const ns = s + 1;
            pattern.entering.set_shaft(i, ns > maxShaft ? 0 : ns);
        }
    }
}
function _removeShaftAt(at) {
    pattern.tieup.removeRow(at);
    pattern.pegplan.removeCol(at);
    for (let i = 0; i < pattern.entering.width; i++) {
        const s = pattern.entering.get_shaft(i);
        if (s === at + 1) pattern.entering.set_shaft(i, 0);
        else if (s > at + 1) pattern.entering.set_shaft(i, s - 1);
    }
}
function _swapShafts(a, b) {
    if (a === b) return;
    pattern.tieup.swapRows(a, b);
    pattern.pegplan.swapCols(a, b);
    for (let i = 0; i < pattern.entering.width; i++) {
        const s = pattern.entering.get_shaft(i);
        if (s === a + 1) pattern.entering.set_shaft(i, b + 1);
        else if (s === b + 1) pattern.entering.set_shaft(i, a + 1);
    }
}

// Treadles (cols of tieup + treadling).
function _insertTreadleAt(at) {
    pattern.tieup.insertCol(at);
    pattern.treadling.insertCol(at);
}
function _removeTreadleAt(at) {
    pattern.tieup.removeCol(at);
    pattern.treadling.removeCol(at);
}
function _swapTreadles(a, b) {
    if (a === b) return;
    pattern.tieup.swapCols(a, b);
    pattern.treadling.swapCols(a, b);
}

// Warp threads (i dim of weave, entering, color_warp, reed).
function _insertWarpAt(at) {
    pattern.weave.insertCol(at);
    pattern.color_warp.insertCol(at);
    pattern.reed.insertCol(at);
    pattern.entering.insertAt(at);
}
function _removeWarpAt(at) {
    pattern.weave.removeCol(at);
    pattern.color_warp.removeCol(at);
    pattern.reed.removeCol(at);
    pattern.entering.removeAt(at);
}

// Weft threads (j dim of weave, treadling, pegplan, color_weft).
function _insertWeftAt(at) {
    pattern.weave.insertRow(at);
    pattern.treadling.insertRow(at);
    pattern.pegplan.insertRow(at);
    pattern.color_weft.insertRow(at);
}
function _removeWeftAt(at) {
    pattern.weave.removeRow(at);
    pattern.treadling.removeRow(at);
    pattern.pegplan.removeRow(at);
    pattern.color_weft.removeRow(at);
}


// Opens the Rapportieren (F8) dialog to choose horizontal/vertical repeat
// counts, "repeat all", and "repeat colors", then applies the replication
// wrapped in a single undoable command.
function showRapportDialog() {
    if (readonly) return;
    pattern.recalc_weave_extent();
    pattern.calcRapport();
    const kx = pattern.max_x - pattern.min_x + 1;
    const rx = pattern.rapport_k_b - pattern.rapport_k_a + 1;
    const ky = pattern.max_y - pattern.min_y + 1;
    const ry = pattern.rapport_s_b - pattern.rapport_s_a + 1;
    const defHorz = (kx > 0 && rx > 0) ? Math.max(1, Math.floor(kx / rx)) : 1;
    const defVert = (ky > 0 && ry > 0) ? Math.max(1, Math.floor(ky / ry)) : 1;

    const i18n = editorI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    const body = document.createElement("div");
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto auto;gap:0.5rem 1rem;align-items:center">
          <label for="tx-rap-horz">${L("rapportieren.horz", "Horizontal repeats")}</label>
          <input id="tx-rap-horz" type="number" min="1" step="1" value="${defHorz}" style="width:6rem">
          <label for="tx-rap-vert">${L("rapportieren.vert", "Vertical repeats")}</label>
          <input id="tx-rap-vert" type="number" min="1" step="1" value="${defVert}" style="width:6rem">
          <label><input id="tx-rap-all" type="checkbox"> ${L("rapportieren.all", "Repeat to pattern bounds")}</label><span></span>
          <label><input id="tx-rap-colors" type="checkbox"> ${L("rapportieren.colors", "Repeat colours too")}</label><span></span>
        </div>`;
    let modal;
    const apply = () => {
        const all = body.querySelector("#tx-rap-all").checked;
        const colors = body.querySelector("#tx-rap-colors").checked;
        let hx = parseInt(body.querySelector("#tx-rap-horz").value, 10);
        let vy = parseInt(body.querySelector("#tx-rap-vert").value, 10);
        if (!isFinite(hx) || hx < 1) hx = 1;
        if (!isFinite(vy) || vy < 1) vy = 1;
        if (all) { hx = -1; vy = -1; }
        _applyRapportExtend(hx, vy, colors);
        modal.close();
    };
    // Pre-check "repeat all" disables the numeric inputs for clarity.
    body.addEventListener("change", (e) => {
        if (e.target.id === "tx-rap-all") {
            const all = e.target.checked;
            body.querySelector("#tx-rap-horz").disabled = all;
            body.querySelector("#tx-rap-vert").disabled = all;
        }
    });
    modal = Modal.open({
        title: L("repeat.dialog-title", "Repeat"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok", "OK"), role: "primary", onClick: () => apply() },
        ],
    });
}

// Execute the rapport replication as a single undoable command.
function _applyRapportExtend(hx, vy, withColors) {
    const before = _fullPatternSnapshot();
    _rapportKette(hx === 0 ? 1 : hx, withColors);
    _rapportSchuss(vy === 0 ? 1 : vy, withColors);
    pattern.calcRapport();
    const after = _fullPatternSnapshot();
    _restoreFullPatternSnapshot(before);
    const finalize = () => { setModified(); view.draw(); };
    const cmd = {
        label: "rapportieren",
        apply()  { _restoreFullPatternSnapshot(after);  finalize(); },
        revert() { _restoreFullPatternSnapshot(before); finalize(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else cmd.apply();
}

function _applyRapportReduce() {
    _applyRapportExtend(1, 1, false);
}


// Overview (F4) — opens a fullscreen modal that renders ONLY the weave
// (no entering / tieup / treadling / colour strips) at the main editor's
// cell size. The absence of side panes lets the user see a larger portion
// of the pattern at the same zoom. No rapport markers — pure gewebe.
// Pressing F4 again while the overview is open closes it.
let _overviewModal = null;
function showOverviewWindow() {
    if (_overviewModal) {
        // Toggle: second F4 closes the existing overview.
        _overviewModal.close();
        _overviewModal = null;
        return;
    }
    if (!pattern || !view) return;
    const body = document.createElement("div");
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.height = "100%";
    body.style.width = "100%";
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.background = settings.darcula ? "#333" : "#fff";
    canvas.style.flex = "1 1 auto";
    canvas.style.minHeight = "0";
    body.appendChild(canvas);

    function render() {
        const w = pattern.weave.width;
        const h = pattern.weave.height;
        const cw = canvas.clientWidth || canvas.width;
        const ch = canvas.clientHeight || canvas.height;
        canvas.width = cw;
        canvas.height = ch;
        const ctx2 = canvas.getContext("2d");
        ctx2.fillStyle = settings.darcula ? "#333" : "#fff";
        ctx2.fillRect(0, 0, cw, ch);

        // Match main editor cell size exactly — no rescaling.
        const gw = Math.max(1, settings.dx);
        const gh = Math.max(1, settings.dy);
        const mx = Math.min(Math.floor(cw / gw), w);
        const my = Math.min(Math.floor(ch / gh), h);
        const rtl = !!settings.direction_righttoleft;
        // The main weave pane always renders bottom-up (toptobottom=false
        // in PatternView.layout). Mirror that convention.
        // Match the active display style: "color" or "simulation" → render
        // as farbeffekt (warp/weft colours fill the whole cell); anything
        // else → draft mode (range colour on bg, inset).
        const farbeffekt = settings.style === "color" || settings.style === "simulation";
        const emptyMode = settings.style === "empty" || settings.style === "invisible";
        if (emptyMode) return;
        const bx = Math.floor(gw * settings.bxf);
        const by = Math.floor(gh * settings.byf);

        // In farbeffekt/simulation, empty/unused cells would otherwise be
        // painted solid weft colour and fill the canvas. Restrict that
        // render to the active pattern extent so it only covers the
        // "actually used" region. Draft mode already skips empty cells.
        const iLo = farbeffekt ? Math.max(0, pattern.min_x) : 0;
        const iHi = farbeffekt ? Math.min(mx - 1, pattern.max_x) : mx - 1;
        const jLo = farbeffekt ? Math.max(0, pattern.min_y) : 0;
        const jHi = farbeffekt ? Math.min(my - 1, pattern.max_y) : my - 1;

        const sink = !!settings.sinking_shed;
        for (let j = jLo; j <= jHi; j++) {
            for (let i = iLo; i <= iHi; i++) {
                const v = pattern.weave.get(i, j);
                // "Woven" = warp on top. With sinking shed the mark
                // means the opposite, so the colour effect flips.
                let woven = v > 0 && v !== 12;
                if (sink && farbeffekt) woven = !woven;
                const x = rtl ? (cw - (i + 1) * gw) : (i * gw);
                const y = my * gh - (j + 1) * gh;
                if (farbeffekt) {
                    // Warp colour when the cell is woven ("up"), weft
                    // colour otherwise — port of DrawGewebeFarbeffekt.
                    const colorIdx = woven
                        ? pattern.color_warp.get(i, 0)
                        : pattern.color_weft.get(0, j);
                    const col = colors[colorIdx];
                    if (col) {
                        ctx2.fillStyle = col;
                        ctx2.fillRect(x, y, gw, gh);
                    }
                } else {
                    // Draft ("patrone"): range colour with inset.
                    if (v <= 0) continue;
                    ctx2.fillStyle = getRangeColor(settings, v);
                    ctx2.fillRect(x + bx, y + by, gw - 2 * bx, gh - 2 * by);
                }
            }
        }
    }

    const i18n = editorI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    const m = Modal.open({
        title: L("overview.title", "Overview"),
        className: "tx-modal-fill",
        body,
        buttons: [{ label: L("overview.close", "Close"), role: "cancel" }],
        onClose: () => {
            window.removeEventListener("resize", onResize);
            _overviewModal = null;
        },
    });
    _overviewModal = m;
    setTimeout(render, 0);
    const onResize = () => render();
    window.addEventListener("resize", onResize);
}



// ---- Switch side (F11) — weave/transforms.js switchSide ------------
function _swapSide() {
    _fullSnapCommand("switch side", () => {
        switchSide(pattern, settings.current_range,
                   { pegplan: !!settings.display_pegplan });
    });
}


// ---- Twill completion (Ctrl+K) — weave/generators.js completeTwill --
function _fillKoeper() {
    if (readonly) return;
    if (cursor.selected_part !== "weave") return;
    const sel = {
        i1: Math.min(cursor.x1, cursor.x2), i2: Math.max(cursor.x1, cursor.x2),
        j1: Math.min(cursor.y1, cursor.y2), j2: Math.max(cursor.y1, cursor.y2),
    };
    _fullSnapCommand("twill completion", () => {
        const done = completeTwill(pattern.weave, sel, settings.current_range);
        // Nothing to complete (not a single column / row): leave the
        // threading etc. alone, too.
        if (!done) return;
        _selectBlock(done);
        pattern.recalc_from_weave(settings);
    });
}


// ---- Threading: Mirror all — port of bereiche.cpp::EzSpiegelnClick --
function _ezMirrorAll() {
    _fullSnapCommand("mirror threading", () => {
        if (pattern.min_x > pattern.max_x) return;
        const a = pattern.min_x, b = pattern.max_x;
        const mid = Math.floor((b - a) / 2);
        for (let i = a; i <= a + mid; i++) {
            const mirror = b - (i - a);
            if (i >= mirror) break;
            const e = pattern.entering.get_shaft(i);
            pattern.entering.set_shaft(i, pattern.entering.get_shaft(mirror));
            pattern.entering.set_shaft(mirror, e);
            for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                const g = pattern.weave.get(i, j);
                pattern.weave.set(i, j, pattern.weave.get(mirror, j));
                pattern.weave.set(mirror, j, g);
            }
        }
    });
}


// ---- Threading: Delete — clear einzug + weave warp columns ---------
function _ezClear() {
    _fullSnapCommand("clear threading", () => {
        for (let i = 0; i < pattern.entering.width; i++) {
            pattern.entering.set_shaft(i, 0);
        }
        pattern.weave.data.fill(0);
        pattern.recalc_weave_extent();
    });
}


// ---- Treadling: Mirror — port of bereiche.cpp::TfSpiegelnClick ------
function _tfMirrorAll() {
    _fullSnapCommand("mirror treadling", () => {
        if (pattern.min_y > pattern.max_y) return;
        const a = pattern.min_y, b = pattern.max_y;
        const mid = Math.floor((b - a) / 2);
        const grid = settings.display_pegplan ? pattern.pegplan : pattern.treadling;
        for (let j = a; j <= a + mid; j++) {
            const mirror = b - (j - a);
            if (j >= mirror) break;
            for (let i = 0; i < grid.width; i++) {
                const t = grid.get(i, j);
                grid.set(i, j, grid.get(i, mirror));
                grid.set(i, mirror, t);
            }
            for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                const g = pattern.weave.get(i, j);
                pattern.weave.set(i, j, pattern.weave.get(i, mirror));
                pattern.weave.set(i, mirror, g);
            }
        }
    });
}


// ---- Treadling: Delete — port of bereiche.cpp::ClearTrittfolgeClick -
function _tfClear() {
    _fullSnapCommand("clear treadling", () => {
        const grid = settings.display_pegplan ? pattern.pegplan : pattern.treadling;
        grid.data.fill(0);
        pattern.weave.data.fill(0);
        pattern.recalc_weave_extent();
    });
}


// ---- Threading: Copy from treadling --------------------------------
//      Port of bereiche.cpp::CopyEinzugTrittfolgeClick.
function _ezCopyFromTf() {
    _fullSnapCommand("copy threading from treadling", () => {
        for (let i = 0; i < pattern.entering.width; i++) {
            pattern.entering.set_shaft(i, 0);
        }
        const maxi = Math.min(pattern.treadling.height, pattern.entering.width);
        for (let i = 0; i < maxi; i++) {
            let schaft = 0;
            for (let ii = 0; ii < pattern.treadling.width; ii++) {
                if (pattern.treadling.get(ii, i) > 0) { schaft = ii + 1; break; }
            }
            pattern.entering.set_shaft(i, schaft);
        }
        pattern.recalc_weave();
    });
}


// ---- Treadling: Copy from threading --------------------------------
//      Port of bereiche.cpp::CopyTrittfolgeEinzugClick.
function _tfCopyFromEz() {
    _fullSnapCommand("copy treadling from threading", () => {
        pattern.treadling.data.fill(0);
        const maxj = Math.min(pattern.treadling.height, pattern.entering.width);
        for (let j = 0; j < maxj; j++) {
            const schaft = pattern.entering.get_shaft(j);
            if (schaft > 0 && schaft - 1 < pattern.treadling.width) {
                pattern.treadling.set(schaft - 1, j, 1);
            }
        }
        pattern.recalc_weave();
    });
}


// ---- Phase 8c-1: Treadling rearrange (MinimalZ / MinimalS / Gesprungen)
//
// Port of trittfolge.cpp::RearrangeTritte and helpers (MoveTritt,
// AufknuepfungsspalteEqual, MergeTritte, EliminateEmptyTritt,
// SwitchTritte). Treadling styles only run in non-pegplan mode — in
// pegplan mode the desktop's RearrangeTritte returns early.

// The treadling arrangement itself is in weave/arrange.js.

function _applyTfStyle(style) {
    settings.treadling_arrangement = style;
    _fullSnapCommand("treadling " + style, () => {
        _runTfArrangement(style);
        // Recalc weave from the new entering+tieup+treadling.
        pattern.recalc_weave();
    });
}


// ---- Phase 8c-2: Threading rearrange (MinimalZ / MinimalS) ---------
//
// Direct port of einzug.cpp::NormalZ / NormalS and helpers (CalcRange,
// IsTotalEmptySchaft, EliminateEmptySchaft, SchaefteEqual, MergeSchaefte,
// SwitchSchaefte, MoveSchaft). GeradeZ/S, Chorig2/3, Fixiert deferred.

// The threading arrangement itself is in weave/arrange.js.

function _applyEzStyle(style) {
    settings.threading_arrangement = style;
    _fullSnapCommand("threading " + style, () => {
        if (style === "fixiert") {
            // Fixiert is a recalc-replacement, not a post-recalc shuffle:
            // run the full from-weave path so recalcFixedEntering
            // rebuilds the threading from the saved template.
            pattern.recalc_from_weave(settings);
        } else {
            _runEzArrangement(style);
            pattern.recalc_weave();
        }
    });
}


// ---- Tools side panel (Werkzeuge) -----------------------------------
// Mirrors the desktop "Tools" dock: a vertical column of icon buttons,
// one per drawing tool, with the active tool highlighted. Visibility is
// persisted in settings.display_tools_panel.
const _TOOLS_LIST = [
    { id: "point",       icon: "tool_cursor.png" },
    { id: "line",        icon: "tool_line.png" },
    { id: "rect",        icon: "tool_rectangle.png" },
    { id: "fillrect",    icon: "tool_filledrectangle.png" },
    { id: "ellipse",     icon: "tool_ellipse.png" },
    { id: "fillellipse", icon: "tool_filledellipse.png" },
];
function _toolsToolboxIconBase() {
    // Same path used by the top toolbar. Snag it off any existing
    // button so we don't have to thread Flask url_for into the JS.
    const ref = document.querySelector('#tx-toolbar img');
    if (ref && ref.src) return ref.src.replace(/[^/]+$/, "");
    return "/static/img/icons16/";
}
function _toolsToolboxRefresh() {
    const list = document.getElementById("tools-panel-list");
    if (!list) return;
    if (list.childElementCount !== _TOOLS_LIST.length) {
        list.innerHTML = "";
        const base = _toolsToolboxIconBase();
        const i18n = editorI18n();
        const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
        for (const t of _TOOLS_LIST) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "tx-tool-btn";
            btn.dataset.tool = t.id;
            btn.title = L("tool." + t.id, t.id);
            const img = document.createElement("img");
            img.src = base + t.icon;
            btn.appendChild(img);
            btn.addEventListener("click", () => {
                settings.tool = t.id;
                toolDrag = null;
                _toolsToolboxRefresh();
                ActionRegistry.notify();
            });
            list.appendChild(btn);
        }
    }
    const active = settings.tool || "point";
    for (const btn of list.children) {
        btn.classList.toggle("active", btn.dataset.tool === active);
    }
}
function _toolsToolboxToggle() {
    settings.display_tools_panel = !settings.display_tools_panel;
    _toolsToolboxApply();
    ActionRegistry.notify();
}
function _toolsToolboxApply() {
    _sidePanelApply("tools-panel", settings.display_tools_panel,
                    _toolsToolboxRefresh);
}

// ---- Ranges side panel (Bereiche) -----------------------------------
// 9 colour-swatch buttons + separator + 3 special buttons (Aushebung /
// Anbindung / Abbindung). Direct port of the desktop range dock.
// Render the special-range glyph (Aushebung/Anbindung/Abbindung) onto
// a 14×14 button canvas using the same painters the cells use, so the
// toolbox icons match what's drawn in the pattern.
function _rangesToolboxPaintSpecial(canvas, r) {
    const px = canvas.width;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, px, px);
    const fakeView = {
        calc_x: (x) => x * px,
        calc_y: (y) => y * px,
        dx: px, dy: px,
        bx: px * settings.bxf, by: px * settings.byf,
    };
    if (r === 10)      aushebungPainter(ctx, settings, fakeView, 0, 0);
    else if (r === 11) anbindungPainter(ctx, settings, fakeView, 0, 0, true);
    else if (r === 12) abbindungPainter(ctx, settings, fakeView, 0, 0, true);
}
function _rangesToolboxRefresh() {
    const list = document.getElementById("ranges-panel-list");
    if (!list) return;
    if (list.childElementCount === 0) {
        const i18n = editorI18n();
        const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
        const make = (r, title) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "tx-range-btn";
            btn.dataset.range = String(r);
            btn.title = title;
            if (r >= 1 && r <= 9) {
                btn.style.background = getRangeColor(settings, r);
            } else {
                const c = document.createElement("canvas");
                c.width = 14; c.height = 14;
                btn.appendChild(c);
            }
            btn.addEventListener("click", () => _rangesToolboxPick(r));
            return btn;
        };
        for (let r = 1; r <= 9; r++) {
            list.appendChild(make(r, L("statusbar.range", "Range") + " " + r));
        }
        const sep = document.createElement("div");
        sep.className = "tx-range-sep";
        list.appendChild(sep);
        list.appendChild(make(10, L("statusbar.aushebung", "Lift out")));
        list.appendChild(make(11, L("statusbar.anbindung", "Binding")));
        list.appendChild(make(12, L("statusbar.abbindung", "Unbinding")));
    }
    const cur = settings.current_range | 0;
    for (const child of list.children) {
        if (!child.dataset || !child.dataset.range) continue;
        const r = +child.dataset.range;
        child.classList.toggle("active", r === cur);
        // Refresh dark-mode swatches every time, since darcula may flip.
        if (r >= 1 && r <= 9) {
            child.style.background = getRangeColor(settings, r);
        } else {
            const c = child.querySelector("canvas");
            if (c) {
                child.style.background = settings.darcula ? "#222" : "#fff";
                _rangesToolboxPaintSpecial(c, r);
            }
        }
    }
}
function _rangesToolboxPick(r) {
    settings.current_range = r;
    update_range_selector(settings);
    const hadSel = (cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2);
    if (hadSel && cursor.selected_pattern && r >= 1 && r <= 9) {
        // Mirror the Shift+1..9 keyboard handler: stamp the selection.
        const grid = cursor.selected_pattern;
        const i1 = Math.min(cursor.x1, cursor.x2);
        const i2 = Math.max(cursor.x1, cursor.x2);
        const j1 = Math.min(cursor.y1, cursor.y2);
        const j2 = Math.max(cursor.y1, cursor.y2);
        _runSelectionCommand("apply range " + r, grid, () => {
            for (let i = i1; i <= i2; i++) {
                for (let j = j1; j <= j2; j++) {
                    if (grid.get(i, j) !== 0) grid.set(i, j, r);
                }
            }
        });
    }
    _rangesToolboxRefresh();
    ActionRegistry.notify();
    if (view) view.draw();
}
function _rangesToolboxToggle() {
    settings.display_ranges_panel = !settings.display_ranges_panel;
    _rangesToolboxApply();
    ActionRegistry.notify();
}
function _rangesToolboxApply() {
    _sidePanelApply("ranges-panel", settings.display_ranges_panel,
                    _rangesToolboxRefresh);
}

// Shared show/hide + canvas reflow for the side panels (palette uses
// its own copy because it has more bespoke layout logic).
function _sidePanelApply(panelId, show, populate) {
    const panel = document.getElementById(panelId);
    const container = document.getElementById("container");
    if (!panel || !container) return;
    if (show) {
        panel.classList.remove("hidden");
        if (populate) populate();
    } else {
        panel.classList.add("hidden");
    }
    const reflow = () => {
        void container.offsetWidth;
        const canvas = document.getElementById("canvas");
        if (canvas) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }
        if (view) {
            view.layout();
            view.draw();
        }
    };
    reflow();
    // A second pass after the browser has settled all pending layouts
    // (e.g. after toolbox icon images load, or after the new flex slot
    // has fully propagated). Without this, the bitmap can stay sized
    // for the pre-toggle width and mouse-click hit-testing drifts.
    requestAnimationFrame(reflow);
}

// Fill all warp cells with the picked palette index. Port of
// SetKettfarbeClick.
function _colorsSetWarp() {
    _pickPaletteIndex((idx) => {
        _bulkColorCommand("set warp color", () => {
            for (let i = 0; i < pattern.color_warp.width; i++) {
                pattern.color_warp.set(i, 0, idx);
            }
            settings.current_color = idx;
        });
        update_color_selector(settings);
    });
}

// Fill all weft cells. Port of SetSchussfarbeClick.
function _colorsSetWeft() {
    _pickPaletteIndex((idx) => {
        _bulkColorCommand("set weft color", () => {
            for (let j = 0; j < pattern.color_weft.height; j++) {
                pattern.color_weft.set(0, j, idx);
            }
            settings.current_color = idx;
        });
        update_color_selector(settings);
    });
}

// Replace-color-at-cursor. Port of ReplaceColorClick — works only
// when the cursor is on the warp- or weft-color strip.
function _colorsReplace() {
    if (readonly) return;
    let oldIdx, isWarp;
    if (cursor.selected_part === "color_warp") {
        oldIdx = pattern.color_warp.get(cursor.x1, 0);
        isWarp = true;
    } else if (cursor.selected_part === "color_weft") {
        oldIdx = pattern.color_weft.get(0, cursor.y1);
        isWarp = false;
    } else {
        return;
    }
    _pickPaletteIndex((newIdx) => {
        if (newIdx === oldIdx) return;
        _bulkColorCommand("replace color", () => {
            if (isWarp) {
                for (let i = 0; i < pattern.color_warp.width; i++) {
                    if (pattern.color_warp.get(i, 0) === oldIdx) {
                        pattern.color_warp.set(i, 0, newIdx);
                    }
                }
            } else {
                for (let j = 0; j < pattern.color_weft.height; j++) {
                    if (pattern.color_weft.get(0, j) === oldIdx) {
                        pattern.color_weft.set(0, j, newIdx);
                    }
                }
            }
            settings.current_color = newIdx;
        });
        update_color_selector(settings);
    });
}

// Swap warp ↔ weft color arrays up to the shorter axis. Port of
// SwitchColorsClick.
function _colorsSwitch() {
    _bulkColorCommand("switch warp/weft colors", () => {
        const n = Math.min(pattern.color_warp.width, pattern.color_weft.height);
        for (let i = 0; i < n; i++) {
            const t = pattern.color_warp.get(i, 0);
            pattern.color_warp.set(i, 0, pattern.color_weft.get(0, i));
            pattern.color_weft.set(0, i, t);
        }
    });
}

// Copy warp colors → weft colors (KettfarbenWieSchussfarbenClick reads
// the desktop name backwards: it sets *kettfarben* from *schussfarben*).
// Web port follows the desktop literal: Warp ← Weft.
function _colorsWarpFromWeft() {
    _bulkColorCommand("warp colors from weft", () => {
        const n = Math.min(pattern.color_warp.width, pattern.color_weft.height);
        for (let i = 0; i < n; i++) {
            pattern.color_warp.set(i, 0, pattern.color_weft.get(0, i));
        }
    });
}

function _colorsWeftFromWarp() {
    _bulkColorCommand("weft colors from warp", () => {
        const n = Math.min(pattern.color_warp.width, pattern.color_weft.height);
        for (let i = 0; i < n; i++) {
            pattern.color_weft.set(0, i, pattern.color_warp.get(i, 0));
        }
    });
}


// ---- Phase 8b: pattern generators (Atlas / Köper) -------------------
//
// Direct ports of insertbindung.cpp::KoeperEinfuegen and AtlasEinfuegen.
// Both stamp a binding on the weave at the cursor position, then run
// recalc_from_weave so entering / treadling / tieup / pegplan catch up.
// Cursor must be on the weave pane.

// The stamping itself is in weave/generators.js.

function _insertAtlas(n) {
    if (readonly) return;
    if (cursor.selected_part !== "weave") return;
    if (!ATLAS_OFFSETS[n]) return;
    const posi = cursor.x1, posj = cursor.y1;
    _fullSnapCommand("atlas " + n, () => {
        const sel = stampAtlas(pattern.weave, n, posi, posj,
                               settings.current_range);
        // Place a square selection over the inserted block.
        _selectBlock(sel);
        pattern.recalc_from_weave(settings);
    });
}

function _insertKoeper(h, s) {
    if (readonly) return;
    if (cursor.selected_part !== "weave") return;
    if (h + s <= 0) return;
    const posi = cursor.x1, posj = cursor.y1;
    _fullSnapCommand("twill " + h + "/" + s, () => {
        const sel = stampTwill(pattern.weave, h, s, posi, posj,
                               settings.current_range);
        _selectBlock(sel);
        pattern.recalc_from_weave(settings);
    });
}

function _selectBlock(sel) {
    if (!sel) return;
    cursor.x1 = sel.i1; cursor.y1 = sel.j1;
    cursor.x2 = sel.i2; cursor.y2 = sel.j2;
}


// ---- Pegplan transforms (Invert / Mirror / Delete) -----------------
//
// All three operate on the active pattern extent (min_x..max_x ×
// min_y..max_y) and touch the pegplan AND weave grids in lockstep,
// matching desktop SpInvertClick / SpSpiegelnClick (→ TfSpiegelnClick) /
// ClearSchlagpatroneClick (→ ClearTrittfolgeClick). Atomically undoable.

function _pegplanCommand(label, mutate) {
    if (readonly) return;
    const pegBefore   = pattern.pegplan.data.slice();
    const weaveBefore = pattern.weave.data.slice();
    const before = {
        peg: pegBefore, weave: weaveBefore,
        min_x: pattern.min_x, max_x: pattern.max_x,
        min_y: pattern.min_y, max_y: pattern.max_y,
    };
    mutate();
    pattern.recalc_weave_extent();
    pattern.calcRapport();
    const after = {
        peg: pattern.pegplan.data.slice(),
        weave: pattern.weave.data.slice(),
        min_x: pattern.min_x, max_x: pattern.max_x,
        min_y: pattern.min_y, max_y: pattern.max_y,
    };
    // Restore before state so commandBus.execute applies it forward.
    pattern.pegplan.data = pegBefore.slice();
    pattern.weave.data   = weaveBefore.slice();
    pattern.min_x = before.min_x; pattern.max_x = before.max_x;
    pattern.min_y = before.min_y; pattern.max_y = before.max_y;
    pattern.calcRapport();
    const finalize = () => { setModified(); view.draw(); };
    const restore = (s) => {
        pattern.pegplan.data = s.peg.slice();
        pattern.weave.data   = s.weave.slice();
        pattern.min_x = s.min_x; pattern.max_x = s.max_x;
        pattern.min_y = s.min_y; pattern.max_y = s.max_y;
        pattern.calcRapport();
    };
    const cmd = {
        label,
        apply()  { restore(after);  finalize(); },
        revert() { restore(before); finalize(); },
    };
    if (commandBus) commandBus.execute(cmd);
    else cmd.apply();
}

// The pegplan transforms themselves are in weave/transforms.js.

function _pegplanInvert() {
    _pegplanCommand("pegplan invert",
                    () => invertPegplan(pattern, settings.current_range));
}

function _pegplanMirror() {
    _pegplanCommand("pegplan mirror", () => mirrorPegplan(pattern));
}

function _pegplanClear() {
    _pegplanCommand("pegplan clear", () => clearPegplan(pattern));
}


// ---- Rapport extension (F8) / reduction (F7) — weave/transforms.js --

function _rapportKette(rx, withColors) {
    repeatWarp(pattern, rx, { withColors });
}

function _rapportSchuss(ry, withColors) {
    repeatWeft(pattern, ry,
               { withColors, pegplan: !!settings.display_pegplan });
}

// Helpers to read the cursor-based insertion indices.
function _cursorShaftIndex() { return Math.max(0, cursor.y1); }
function _cursorTreadleIndex() { return Math.max(0, cursor.x1); }
function _cursorWarpIndex() { return Math.max(0, cursor.x1); }
function _cursorWeftIndex() { return Math.max(0, cursor.y1); }

// Which panes let a given structural op make sense?
const _SHAFT_PARTS = { entering: 1, tieup: 1 };
const _TREADLE_PARTS = { treadling: 1, tieup: 1 };
const _WARP_PARTS = { weave: 1, entering: 1, color_warp: 1, reed: 1 };
const _WEFT_PARTS = { weave: 1, treadling: 1, color_weft: 1 };


// ---- Editor-wide action registration + menu setup ----

function _setWeaveStyle(style) {
    settings.style = style;
    const ids = {
        "draft": "icon-weave-draft",
        "color": "icon-weave-color",
        "simulation": "icon-weave-simulation",
        "empty": "icon-weave-empty",
        "invisible": "icon-weave-empty",
    };
    for (const k of Object.keys(ids)) {
        const el = document.getElementById(ids[k]);
        if (el) el.className = (k === style) ? "icon selected" : "icon";
    }
    view.draw();
}

function setupEditorActions() {
    const i18n = editorI18n();
    const L = (id) => (i18n.actions[id] && i18n.actions[id].label) || id;

    const R = (id, shortcut, handler, extra) => {
        ActionRegistry.registerAction(Object.assign({
            id, label: L(id), shortcut, handler,
        }, extra || {}));
        if (shortcut) Shortcuts.bind(shortcut, id);
    };

    // File
    R("file.save", "Ctrl+S", async () => {
        if (readonly) return;
        try {
            await savePattern();
        } catch (e) {
            console.error(e);
            alert(_prompt("saveFailed", "Save failed. Please try again."));
        }
    }, { enabledWhen: () => !readonly });
    R("file.revert", null, _revertChanges,
        { enabledWhen: () => !readonly && modified });
    R("file.export-png",  null, () => _exportDownload("png"));
    R("file.export-jpeg", null, () => _exportDownload("jpeg"));
    R("file.export-svg",  null, () => _exportDownload("svg"));
    R("file.export-pdf",  null, () => _exportDownload("pdf"));
    R("file.print",       "Ctrl+P", () => _printDownload());
    R("file.print-part",  "Ctrl+L", () => showPrintPartDialog());
    R("file.properties",  null, () => showPropertiesDialog(),
        { enabledWhen: () => !readonly });
    R("file.page-setup",  null, () => showPageSetupDialog(),
        { enabledWhen: () => !readonly });
    R("file.info",        null, () => showPatternInfoDialog());

    R("legal.terms",   null, () => LegalDialog.open("/terms",   L("legal.terms")   || "Terms",          L("btn.ok") || "OK"));
    R("legal.privacy", null, () => LegalDialog.open("/privacy", L("legal.privacy") || "Privacy Policy", L("btn.ok") || "OK"));
    R("legal.imprint", null, () => LegalDialog.open("/imprint", L("legal.imprint") || "Imprint",        L("btn.ok") || "OK"));
    R("file.close", null, closePatternGuarded);

    // Edit
    R("edit.undo", "Ctrl+Z", () => { if (commandBus) commandBus.undo(); },
        { enabledWhen: () => commandBus && commandBus.canUndo() });
    R("edit.redo", "Ctrl+Y", () => { if (commandBus) commandBus.redo(); },
        { enabledWhen: () => commandBus && commandBus.canRedo() });
    R("edit.cut", "Ctrl+X", selectionCut,
        { enabledWhen: () => !readonly && !Selection.isEmpty(cursor) });
    R("edit.copy", "Ctrl+C", selectionCopy,
        { enabledWhen: () => !Selection.isEmpty(cursor) });
    R("edit.paste", "Ctrl+V", selectionPaste,
        { enabledWhen: () => !readonly && Clipboard.has() });
    R("edit.paste-transparent", "Ctrl+B", selectionPasteTransparent,
        { enabledWhen: () => !readonly && Clipboard.has() });
    R("edit.delete", "Delete", selectionClear,
        { enabledWhen: () => !readonly && !Selection.isEmpty(cursor) });
    const hasSel = () => !Selection.isEmpty(cursor);
    const hasSquareSel = () => {
        if (!hasSel()) return false;
        return Math.abs(cursor.x2 - cursor.x1) === Math.abs(cursor.y2 - cursor.y1);
    };
    R("edit.invert", "I", selectionInvert,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.mirror-h", "H", selectionMirrorH,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.mirror-v", "V", selectionMirrorV,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.rotate", "R", selectionRotate,
        { enabledWhen: () => !readonly && hasSquareSel() });

    // Roll / Slope / Central Symmetry — selection transforms from desktop.
    // Ctrl+6-9 and Ctrl+H/Ctrl+J are desktop bindings. Some of these conflict
    // with browser shortcuts (Ctrl+H=history, Ctrl+J=downloads); our dispatcher
    // preventDefaults them which works in most browsers.
    R("edit.roll-up",    "Ctrl+6", selectionRollUp,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.roll-down",  "Ctrl+7", selectionRollDown,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.roll-left",  "Ctrl+8", selectionRollLeft,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.roll-right", "Ctrl+9", selectionRollRight,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.slope-inc",  "Ctrl+H", selectionSlopeIncrease,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.slope-dec",  "Ctrl+J", selectionSlopeDecrease,
        { enabledWhen: () => !readonly && hasSel() });
    R("edit.central-symmetry", "Z", selectionCentralSymmetry,
        { enabledWhen: () => !readonly && hasSel() });

    // Tie-up: Swap Sides — horizontal mirror of the entire tie-up matrix.
    R("tieup.swap-sides", null, tieupSwapSides,
        { enabledWhen: () => !readonly });

    // Pegplan mode. F9 toggles between tieup+treadling and pegplan display.
    //
    // The toggle is *not* pushed onto the undo stack — F9 is cheap to
    // un-toggle with F9, and folding a view change into the undo history
    // made Ctrl+Z revert data edits together with the mode.
    //
    // On every toggle we regenerate the now-visible side-pane from the
    // weave + existing entering — matching the desktop's
    // RecalcSchlagpatrone (entering pegplan) and
    // RecalcTrittfolgeAufknuepfung (leaving pegplan). This keeps what the
    // user sees consistent with the cloth, at the price of losing a manually
    // hand-tuned treadling/tie-up on a round trip (mirrors desktop).
    R("pegplan.toggle", "F9", () => {
        const nextFlag = !settings.display_pegplan;
        settings.display_pegplan = nextFlag;
        // Rehome the cursor if it's on a pane that just disappeared.
        if (nextFlag) {
            if (cursor.selected_part === "treadling" || cursor.selected_part === "tieup") {
                select_part("pegplan", cursor.x1, cursor.y1);
            }
        } else {
            if (cursor.selected_part === "pegplan") {
                select_part("treadling", cursor.x1, cursor.y1);
            }
        }
        pattern.recalc_weave_extent();
        if (nextFlag) {
            pattern._recalc_pegplan_from_weave();
        } else {
            // Rebuild treadling + tieup from weave. We read max_shaft from
            // the existing entering (recalc_entering is not called, so the
            // user's shaft-assignment layout is preserved).
            let maxShaft = 0;
            for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                const s = pattern.entering.get_shaft(i);
                if (s > maxShaft) maxShaft = s;
            }
            const maxTreadle = pattern.recalc_treadling(settings);
            pattern.recalc_tieup(maxShaft, maxTreadle);
        }
        view.layout();
        view.draw();
        ActionRegistry.notify();
    }, { checkedWhen: () => settings && !!settings.display_pegplan });

    // Pegplan transforms — port of desktop SpInvertClick / SpSpiegelnClick
    // (→ TfSpiegelnClick) / ClearSchlagpatroneClick (→ ClearTrittfolgeClick).
    // Operate on the active extent and mutate both the pegplan grid AND
    // the weave in lockstep so the two stay consistent without having to
    // recalc from the pegplan (which would destroy special-range cells in
    // the weave that the pegplan doesn't carry).
    R("pegplan.invert", null, _pegplanInvert,
        { enabledWhen: () => !readonly && settings && settings.display_pegplan });
    R("pegplan.mirror", null, _pegplanMirror,
        { enabledWhen: () => !readonly && settings && settings.display_pegplan });
    R("pegplan.clear", null, _pegplanClear,
        { enabledWhen: () => !readonly && settings && settings.display_pegplan });

    // View — zoom mutates the equal-axis baseline (settings.base_dx);
    // the actual dx/dy then re-derive from base + warp/weft factors,
    // so the chosen aspect ratio is preserved across zoom levels.
    R("view.zoom-in", "Ctrl+I", () => {
        settings.base_dx = Math.min(30, (settings.base_dx | 0) + 1);
        _applyAspectRatio(settings);
        view.layout(); view.draw();
    });
    R("view.zoom-out", "Ctrl+U", () => {
        settings.base_dx = Math.max(8, (settings.base_dx | 0) - 1);
        _applyAspectRatio(settings);
        view.layout(); view.draw();
    });
    R("view.style-draft", "Alt+1", () => _setWeaveStyle("draft"),
        { checkedWhen: () => settings && settings.style === "draft" });
    R("view.style-color", "Alt+2", () => _setWeaveStyle("color"),
        { checkedWhen: () => settings && settings.style === "color" });
    R("view.style-simulation", "Alt+3", () => _setWeaveStyle("simulation"),
        { checkedWhen: () => settings && settings.style === "simulation" });
    R("view.style-empty", "Alt+4", () => _setWeaveStyle("empty"),
        { checkedWhen: () => settings && (settings.style === "empty" || settings.style === "invisible") });

    const toggleFlag = (flag, relayout) => () => {
        settings[flag] = !settings[flag];
        update_view_options(settings);
        if (relayout) view.layout();
        view.draw();
    };
    R("view.show-entering", null, toggleFlag("display_entering", true),
        { checkedWhen: () => settings && settings.display_entering });
    R("view.show-treadling", null, toggleFlag("display_treadling", true),
        { checkedWhen: () => settings && settings.display_treadling });
    R("view.show-reed", null, toggleFlag("display_reed", true),
        { checkedWhen: () => settings && settings.display_reed });
    R("view.show-colors", null, () => {
        const next = !(settings.display_colors_warp && settings.display_colors_weft);
        settings.display_colors_warp = next;
        settings.display_colors_weft = next;
        update_view_options(settings);
        view.layout(); view.draw();
    }, { checkedWhen: () => settings && settings.display_colors_warp && settings.display_colors_weft });
    R("view.show-hlines", null, toggleFlag("display_hlines", true),
        { checkedWhen: () => settings && settings.display_hlines });
    // Pattern-Only: peripheral panes keep their layout and gridlines but
    // their data contents are hidden. Matches the desktop DB-WEAVE behaviour.
    R("view.pattern-only", "Ctrl+/", () => {
        settings.pattern_only = !settings.pattern_only;
        view.draw();
    }, { checkedWhen: () => settings && !!settings.pattern_only });

    // Highlight dependents (F12) — shade weave cells sharing shaft +
    // treadle/pegplan row with the cursor cell.
    R("view.highlight", "F12", () => {
        settings.highlight = !settings.highlight;
        view.draw();
    }, { checkedWhen: () => settings && !!settings.highlight });

    // Rapport view (Ctrl+R) — outline the repeat-unit rectangle on weave.
    R("view.repeat", "Ctrl+R", () => {
        settings.display_repeat = !settings.display_repeat;
        view.draw();
    }, { checkedWhen: () => settings && !!settings.display_repeat });

    // Inverse rapport colours: swap the "red" side with the "natural" side.
    // Normal: rapport cells red, repeats rendered in the current style.
    // Inverse: rapport cells in current style, repeats rendered red.
    R("view.inverse-repeat", null, () => {
        settings.inverse_repeat = !settings.inverse_repeat;
        view.draw();
    }, { checkedWhen: () => settings && !!settings.inverse_repeat });

    // F8 — Rapportieren dialog.
    R("repeat.rapportieren", "F8", () => { showRapportDialog(); },
        { enabledWhen: () => !readonly });
    // F7 — reduce to a single rapport.
    R("repeat.reduce", "F7", () => { _applyRapportReduce(); },
        { enabledWhen: () => !readonly });

    // ---- Phase 8a small ops ----
    R("edit.fill-koeper", "Ctrl+K", _fillKoeper,
        { enabledWhen: () => !readonly && cursor.selected_part === "weave" && hasSel() });
    R("edit.switch-side", "F11", _swapSide,
        { enabledWhen: () => !readonly });
    R("edit.warp-lancee", null, () => {
        showLancierungDialog((vv) => _kettLancierung(vv));
    }, { enabledWhen: () => !readonly });
    R("edit.weft-lancee", null, () => {
        showLancierungDialog((vv) => _schussLancierung(vv));
    }, { enabledWhen: () => !readonly });
    R("ez.assistent", null, () => { showThreadingWizardDialog(); },
        { enabledWhen: () => !readonly });
    R("edit.blockmuster",   null, () => showMusterDialog("block"),
        { enabledWhen: () => !readonly });
    R("edit.bereichmuster", null, () => showMusterDialog("bereich"),
        { enabledWhen: () => !readonly });

    // Range selectors — Shift+1..9 set ranges 1-9; Shift+0 = Aushebung
    // (lift out, value 10), Ctrl+0 = Anbindung (binding, 11),
    // Ctrl+Shift+0 = Abbindung (unbinding, 12). Setting a range while
    // a selection is active applies it to the selection (port of
    // desktop "ApplyRangeToSelection").
    const setRange = (r) => () => {
        settings.current_range = r;
        update_range_selector(settings);
        if (settings.display_ranges_panel) _rangesToolboxRefresh();
        const hadSel = (cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2);
        if (hadSel && cursor.selected_pattern) {
            const grid = cursor.selected_pattern;
            const i1 = Math.min(cursor.x1, cursor.x2);
            const i2 = Math.max(cursor.x1, cursor.x2);
            const j1 = Math.min(cursor.y1, cursor.y2);
            const j2 = Math.max(cursor.y1, cursor.y2);
            _runSelectionCommand("apply range " + r, grid, () => {
                for (let i = i1; i <= i2; i++) {
                    for (let j = j1; j <= j2; j++) {
                        if (grid.get(i, j) !== 0) grid.set(i, j, r);
                    }
                }
            });
        } else {
            view.draw();
            ActionRegistry.notify();
        }
    };
    for (let r = 1; r <= 9; r++) {
        R("range.range-" + r, "Shift+" + r, setRange(r),
            { checkedWhen: () => settings && settings.current_range === r });
    }
    R("range.aushebung", "Shift+0", setRange(10),
        { checkedWhen: () => settings && settings.current_range === 10 });
    R("range.anbindung", "Ctrl+0", setRange(11),
        { checkedWhen: () => settings && settings.current_range === 11 });
    R("range.abbindung", "Ctrl+Shift+0", setRange(12),
        { checkedWhen: () => settings && settings.current_range === 12 });

    // ---- 8f: User-defined patterns ----
    for (let k = 0; k < 10; k++) {
        const idx = k;
        R("userdef." + k, null, (e) => {
            // Ctrl held → transparent paste (matches desktop's modifier).
            const transp = !!(e && (e.ctrlKey || e.metaKey));
            _insertUserdef(idx, transp);
        }, {
            label: "Pattern " + (k + 1),  // overwritten by _refreshUserdefMenuLabels
            enabledWhen: () => !readonly && cursor.selected_part === "weave",
        });
    }
    R("userdef.add", null, _userdefAddCurrent,
        { enabledWhen: () => !readonly });
    R("userdef.add-sel", null, _userdefAddSelection,
        { enabledWhen: () => !readonly && cursor.selected_part === "weave"
            && (cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2) });
    R("userdef.remove", null, _userdefRemoveClick,
        { enabledWhen: () => true });
    R("ez.mirror",       null, _ezMirrorAll, { enabledWhen: () => !readonly });
    R("ez.clear",        null, _ezClear,     { enabledWhen: () => !readonly });
    R("ez.copy-from-tf", null, _ezCopyFromTf,
        { enabledWhen: () => !readonly && !settings.display_pegplan });
    R("tf.mirror",       null, _tfMirrorAll, { enabledWhen: () => !readonly });
    R("tf.clear",        null, _tfClear,     { enabledWhen: () => !readonly });
    R("tf.copy-from-ez", null, _tfCopyFromEz,
        { enabledWhen: () => !readonly && !settings.display_pegplan });

    // ---- 8c: rearrangement styles ----
    R("ez.minimal-z", null, () => _applyEzStyle("minimal-z"),
        { enabledWhen: () => !readonly,
          checkedWhen: () => settings && settings.threading_arrangement === "minimal-z" });
    R("ez.minimal-s", null, () => _applyEzStyle("minimal-s"),
        { enabledWhen: () => !readonly,
          checkedWhen: () => settings && settings.threading_arrangement === "minimal-s" });
    R("ez.gerade-z", null, () => _applyEzStyle("gerade-z"),
        { enabledWhen: () => !readonly,
          checkedWhen: () => settings && settings.threading_arrangement === "gerade-z" });
    R("ez.gerade-s", null, () => _applyEzStyle("gerade-s"),
        { enabledWhen: () => !readonly,
          checkedWhen: () => settings && settings.threading_arrangement === "gerade-s" });
    R("ez.chorig-2", null, () => _applyEzStyle("chorig-2"),
        { enabledWhen: () => !readonly,
          checkedWhen: () => settings && settings.threading_arrangement === "chorig-2" });
    R("ez.chorig-3", null, () => _applyEzStyle("chorig-3"),
        { enabledWhen: () => !readonly,
          checkedWhen: () => settings && settings.threading_arrangement === "chorig-3" });
    R("ez.fixiert", null, () => showFixeinzugDialog(),
        { enabledWhen: () => !readonly,
          checkedWhen: () => settings && settings.threading_arrangement === "fixiert" });

    // ---- Phase 9: color management ----
    R("colors.palette", null, () => showPaletteDialog(),
        { enabledWhen: () => !readonly });
    R("colors.blend", null, () => showColorBlendDialog(),
        { enabledWhen: () => !readonly });
    R("opt.pattern", null, () => showOptionsDialog(false), {});
    R("opt.global",  null, () => showOptionsDialog(true),  {});
    R("extras.ratio", null, () => showWarpWeftRatioDialog(), {});
    R("extras.weave-locked", null, () => {
        settings.weave_locked = !settings.weave_locked;
        // When the lock turns on while the cursor sits on the weave
        // pane, hop to the next traversable field — matches desktop
        // OptionsLockGewebe behaviour. The Tab cycle skips weave too
        // (see goto_next_part / goto_prev_part).
        if (settings.weave_locked && cursor.selected_part === "weave") {
            goto_next_part();
        }
        if (view) view.draw();
        ActionRegistry.notify();
    }, { checkedWhen: () => !!(settings && settings.weave_locked) });
    R("cursor.locked", "Ctrl+Q", () => {
        settings.cursor_locked = !settings.cursor_locked;
        if (settings.cursor_locked) _applyCursorLock();
        if (view) view.draw();
        ActionRegistry.notify();
    }, { checkedWhen: () => !!(settings && settings.cursor_locked) });
    R("cursor.movement", null, () => showCursorMovementDialog(), {});
    R("base.american",     null, () => _applyBaseStyle("american"),     {});
    R("base.scandinavian", null, () => _applyBaseStyle("scandinavian"), {});
    R("base.swiss",        null, () => _applyBaseStyle("swiss"),        {});
    R("colors.toolbox", "Ctrl+F", _paletteToolboxToggle,
        { checkedWhen: () => !!(settings && settings.display_palette) });
    R("tools.toolbox", null, _toolsToolboxToggle,
        { checkedWhen: () => !!(settings && settings.display_tools_panel) });
    R("ranges.toolbox", null, _rangesToolboxToggle,
        { checkedWhen: () => !!(settings && settings.display_ranges_panel) });
    R("colors.set-warp", null, _colorsSetWarp,
        { enabledWhen: () => !readonly });
    R("colors.set-weft", null, _colorsSetWeft,
        { enabledWhen: () => !readonly });
    R("colors.replace", null, _colorsReplace,
        { enabledWhen: () => !readonly
            && (cursor.selected_part === "color_warp"
             || cursor.selected_part === "color_weft") });
    R("colors.switch", null, _colorsSwitch,
        { enabledWhen: () => !readonly });
    R("colors.warp-from-weft", null, _colorsWarpFromWeft,
        { enabledWhen: () => !readonly });
    R("colors.weft-from-warp", null, _colorsWeftFromWarp,
        { enabledWhen: () => !readonly });
    R("tf.minimal-z", null, () => _applyTfStyle("minimal-z"),
        { enabledWhen: () => !readonly && !settings.display_pegplan,
          checkedWhen: () => settings && settings.treadling_arrangement === "minimal-z" });
    R("tf.minimal-s", null, () => _applyTfStyle("minimal-s"),
        { enabledWhen: () => !readonly && !settings.display_pegplan,
          checkedWhen: () => settings && settings.treadling_arrangement === "minimal-s" });
    R("tf.gesprungen", null, () => _applyTfStyle("gesprungen"),
        { enabledWhen: () => !readonly && !settings.display_pegplan,
          checkedWhen: () => settings && settings.treadling_arrangement === "gesprungen" });

    // ---- 8b: pattern generators ----
    const onWeave = () => !readonly && cursor.selected_part === "weave";
    [5, 6, 7, 8, 9, 10].forEach(n => {
        R("insert.atlas-" + n, null, () => _insertAtlas(n),
            { label: (i18n.menus.insertAtlasPrefix || "Satin") + " " + n,
              enabledWhen: onWeave });
    });
    const KOEPER_BAL = [[2,2], [3,3], [4,4], [5,5]];
    const KOEPER_WS  = [[2,1], [3,1], [4,1], [5,1], [3,2], [4,2], [5,2], [4,3], [5,3]];
    const koepLabel = (h, s) => (i18n.menus.insertTwillPrefix || "Twill") + " " + h + "/" + s;
    KOEPER_BAL.concat(KOEPER_WS).forEach(([h, s]) => {
        R("insert.twill-" + h + "-" + s, null, () => _insertKoeper(h, s),
            { label: koepLabel(h, s), enabledWhen: onWeave });
    });

    // Colour-effect with raster overlay — add the unit-grid overlay when
    // the weave is drawn in "color" style.
    R("view.color-raster", null, () => {
        settings.color_effect_with_grid = !settings.color_effect_with_grid;
        view.draw();
    }, { checkedWhen: () => settings && !!settings.color_effect_with_grid });

    // Overview window (F4) — miniature render of the full weave.
    R("view.overview", "F4", () => { showOverviewWindow(); });

    // Drawing tools — selected one is stored in settings.tool. "point" is
    // the default (single-cell click); others rasterize a shape on mouseup.
    const selectTool = (t) => () => {
        settings.tool = t;
        // Drop any in-flight drag when switching tools mid-gesture.
        toolDrag = null;
        if (settings.display_tools_panel) _toolsToolboxRefresh();
        ActionRegistry.notify();
    };
    R("tool.point",       null, selectTool("point"),
        { checkedWhen: () => !settings || !settings.tool || settings.tool === "point" });
    R("tool.line",        null, selectTool("line"),
        { checkedWhen: () => settings && settings.tool === "line" });
    R("tool.rect",        null, selectTool("rect"),
        { checkedWhen: () => settings && settings.tool === "rect" });
    R("tool.fillrect",    null, selectTool("fillrect"),
        { checkedWhen: () => settings && settings.tool === "fillrect" });
    R("tool.ellipse",     null, selectTool("ellipse"),
        { checkedWhen: () => settings && settings.tool === "ellipse" });
    R("tool.fillellipse", null, selectTool("fillellipse"),
        { checkedWhen: () => settings && settings.tool === "fillellipse" });

    // Structural operations — insert/delete/move shaft/treadle/warp/weft.
    // Each is wrapped in a full-pattern-snapshot command for clean undo.
    const inPart = (partsMap) => () =>
        !readonly && cursor && !!partsMap[cursor.selected_part];
    R("pattern.insert-shaft", "Shift+S", () => {
        _structuralCommand("insert shaft", () => _insertShaftAt(_cursorShaftIndex()));
    }, { enabledWhen: inPart(_SHAFT_PARTS) });
    R("pattern.insert-treadle", "Shift+T", () => {
        _structuralCommand("insert treadle", () => _insertTreadleAt(_cursorTreadleIndex()));
    }, { enabledWhen: inPart(_TREADLE_PARTS) });
    R("pattern.insert-warp", "Shift+K", () => {
        _structuralCommand("insert warp", () => _insertWarpAt(_cursorWarpIndex()));
    }, { enabledWhen: inPart(_WARP_PARTS) });
    R("pattern.insert-weft", "Shift+F", () => {
        _structuralCommand("insert weft", () => _insertWeftAt(_cursorWeftIndex()));
    }, { enabledWhen: inPart(_WEFT_PARTS) });

    R("pattern.delete-shaft", "Ctrl+Shift+S", () => {
        _structuralCommand("delete shaft", () => _removeShaftAt(_cursorShaftIndex()));
    }, { enabledWhen: inPart(_SHAFT_PARTS) });
    R("pattern.delete-treadle", "Ctrl+Shift+T", () => {
        _structuralCommand("delete treadle", () => _removeTreadleAt(_cursorTreadleIndex()));
    }, { enabledWhen: inPart(_TREADLE_PARTS) });
    R("pattern.delete-warp", "Ctrl+Shift+K", () => {
        _structuralCommand("delete warp", () => _removeWarpAt(_cursorWarpIndex()));
    }, { enabledWhen: inPart(_WARP_PARTS) });
    R("pattern.delete-weft", "Ctrl+Shift+F", () => {
        _structuralCommand("delete weft", () => _removeWeftAt(_cursorWeftIndex()));
    }, { enabledWhen: inPart(_WEFT_PARTS) });

    R("pattern.move-shaft-up", null, () => {
        const at = _cursorShaftIndex();
        if (at <= 0) return;
        _structuralCommand("move shaft up", () => _swapShafts(at, at - 1));
    }, { enabledWhen: () => !readonly && inPart(_SHAFT_PARTS)() && _cursorShaftIndex() > 0 });
    R("pattern.move-shaft-down", null, () => {
        const at = _cursorShaftIndex();
        if (at >= pattern.tieup.height - 1) return;
        _structuralCommand("move shaft down", () => _swapShafts(at, at + 1));
    }, { enabledWhen: () => !readonly && inPart(_SHAFT_PARTS)() && _cursorShaftIndex() < pattern.tieup.height - 1 });
    R("pattern.move-treadle-left", null, () => {
        const at = _cursorTreadleIndex();
        if (at <= 0) return;
        _structuralCommand("move treadle left", () => _swapTreadles(at, at - 1));
    }, { enabledWhen: () => !readonly && inPart(_TREADLE_PARTS)() && _cursorTreadleIndex() > 0 });
    R("pattern.move-treadle-right", null, () => {
        const at = _cursorTreadleIndex();
        if (at >= pattern.tieup.width - 1) return;
        _structuralCommand("move treadle right", () => _swapTreadles(at, at + 1));
    }, { enabledWhen: () => !readonly && inPart(_TREADLE_PARTS)() && _cursorTreadleIndex() < pattern.tieup.width - 1 });

    // Build menu tree and render
    const menuMount = document.getElementById("tx-menubar");
    if (menuMount) {
        const fileItems = [];
        if (!readonly) {
            fileItems.push({ action: "file.save" });
            fileItems.push({ action: "file.revert" });
            fileItems.push({ separator: true });
        }
        fileItems.push({ label: i18n.menus.export || "Export", items: [
            { action: "file.export-png" },
            { action: "file.export-jpeg" },
            { action: "file.export-svg" },
            { action: "file.export-pdf" },
        ]});
        fileItems.push({ separator: true });
        fileItems.push({ action: "file.print" });
        fileItems.push({ action: "file.print-part" });
        fileItems.push({ separator: true });
        if (!readonly) fileItems.push({ action: "file.properties" });
        if (!readonly) fileItems.push({ action: "file.page-setup" });
        fileItems.push({ action: "file.info" });
        fileItems.push({ separator: true });
        fileItems.push({ action: "file.close" });
        const tree = [
            { label: i18n.menus.file || "File", items: fileItems },
            { label: i18n.menus.edit || "Edit", items: [
                { action: "edit.undo" },
                { action: "edit.redo" },
                { separator: true },
                { action: "edit.cut" },
                { action: "edit.copy" },
                { action: "edit.paste" },
                { action: "edit.paste-transparent" },
                { separator: true },
                { action: "edit.delete" },
                { action: "edit.invert" },
                { action: "edit.mirror-h" },
                { action: "edit.mirror-v" },
                { action: "edit.rotate" },
                { action: "edit.central-symmetry" },
                { label: i18n.menus.roll || "Roll", items: [
                    { action: "edit.roll-up" },
                    { action: "edit.roll-down" },
                    { action: "edit.roll-left" },
                    { action: "edit.roll-right" },
                ]},
                { label: i18n.menus.slope || "Slope", items: [
                    { action: "edit.slope-inc" },
                    { action: "edit.slope-dec" },
                ]},
                { separator: true },
                { label: i18n.menus.move || "Move", items: [
                    { action: "pattern.move-shaft-up" },
                    { action: "pattern.move-shaft-down" },
                    { action: "pattern.move-treadle-left" },
                    { action: "pattern.move-treadle-right" },
                ]},
                { label: i18n.menus.insert || "Insert", items: [
                    { action: "pattern.insert-shaft" },
                    { action: "pattern.insert-treadle" },
                    { action: "pattern.insert-warp" },
                    { action: "pattern.insert-weft" },
                ]},
                { label: i18n.menus.delete || "Delete", items: [
                    { action: "pattern.delete-shaft" },
                    { action: "pattern.delete-treadle" },
                    { action: "pattern.delete-warp" },
                    { action: "pattern.delete-weft" },
                ]},
                { separator: true },
                { label: i18n.menus.lancee || "Lancee", items: [
                    { action: "edit.warp-lancee" },
                    { action: "edit.weft-lancee" },
                ]},
                { action: "edit.fill-koeper" },
                { action: "edit.switch-side" },
                { separator: true },
                { label: i18n.menus.tools || "Tools", items: [
                    { action: "tool.point" },
                    { action: "tool.line" },
                    { action: "tool.rect" },
                    { action: "tool.fillrect" },
                    { action: "tool.ellipse" },
                    { action: "tool.fillellipse" },
                ]},
            ]},
            { label: i18n.menus.view || "View", items: [
                { action: "view.show-entering" },
                { action: "view.show-treadling" },
                { action: "view.show-reed" },
                { action: "view.show-colors" },
                { action: "view.show-hlines" },
                { action: "view.pattern-only" },
                { separator: true },
                { label: i18n.menus.viewStyle || "Style", items: [
                    { action: "view.style-draft" },
                    { action: "view.style-color" },
                    { action: "view.style-simulation" },
                    { action: "view.style-empty" },
                ]},
                { separator: true },
                { action: "view.highlight" },
                { action: "view.color-raster" },
                { separator: true },
                { action: "view.zoom-in" },
                { action: "view.zoom-out" },
                { separator: true },
                { action: "view.overview" },
                { separator: true },
                { action: "colors.toolbox" },
                { action: "tools.toolbox" },
                { action: "ranges.toolbox" },
            ]},
            { label: i18n.menus.threading || "Threading", items: [
                { action: "ez.assistent" },
                { separator: true },
                { action: "ez.mirror" },
                { action: "ez.clear" },
                { separator: true },
                { action: "ez.minimal-z" },
                { action: "ez.minimal-s" },
                { action: "ez.gerade-z" },
                { action: "ez.gerade-s" },
                { action: "ez.chorig-2" },
                { action: "ez.chorig-3" },
                { separator: true },
                { action: "ez.fixiert" },
                { separator: true },
                { action: "ez.copy-from-tf" },
            ]},
            { label: i18n.menus.treadling || "Treadling",
              visibleWhen: () => !(settings && settings.display_pegplan),
              items: [
                { action: "tf.mirror" },
                { action: "tf.clear" },
                { separator: true },
                { action: "tf.minimal-z" },
                { action: "tf.minimal-s" },
                { action: "tf.gesprungen" },
                { separator: true },
                { action: "tf.copy-from-ez" },
            ]},
            { label: i18n.menus.tieup || "Tie-up", items: [
                { action: "tieup.swap-sides" },
            ]},
            { label: i18n.menus.insertMenu || "Insert", items: [
                { label: i18n.menus.insertAtlas || "Satin", items:
                    [5, 6, 7, 8, 9, 10].map(n =>
                        ({ action: "insert.atlas-" + n }))
                },
                { label: i18n.menus.insertTwill || "Twill", items: [
                    { label: i18n.menus.insertBalanced || "Balanced", items:
                        KOEPER_BAL.map(([h, s]) =>
                            ({ action: "insert.twill-" + h + "-" + s }))
                    },
                    { label: i18n.menus.insertWarpSided || "Warp sided", items:
                        KOEPER_WS.map(([h, s]) =>
                            ({ action: "insert.twill-" + h + "-" + s }))
                    },
                ]},
                { separator: true },
                // User-defined slots inside an Additional/Weitere
                // submenu. The submenu itself hides when no slots are
                // populated (matches the desktop's top-level Weitere
                // visibility); Administration sits separately so the
                // user can always reach it to add the first pattern.
                { label: i18n.menus.additional || "Additional",
                  visibleWhen: () => _userdefList().some(s => s && s.data),
                  items: [
                    { action: "userdef.0" },
                    { action: "userdef.1" },
                    { action: "userdef.2" },
                    { action: "userdef.3" },
                    { action: "userdef.4" },
                    { action: "userdef.5" },
                    { action: "userdef.6" },
                    { action: "userdef.7" },
                    { action: "userdef.8" },
                    { action: "userdef.9" },
                ]},
                { label: i18n.menus.additionalAdmin || "Administration", items: [
                    { action: "userdef.add" },
                    { action: "userdef.add-sel" },
                    { action: "userdef.remove" },
                ]},
            ]},
            { label: i18n.menus.bereicheMenu || "Ranges", items: [
                { label: i18n.menus.currentRangeMenu || "Current range", items: [
                    { action: "range.range-1" },
                    { action: "range.range-2" },
                    { action: "range.range-3" },
                    { action: "range.range-4" },
                    { action: "range.range-5" },
                    { action: "range.range-6" },
                    { action: "range.range-7" },
                    { action: "range.range-8" },
                    { action: "range.range-9" },
                    { separator: true },
                    { action: "range.aushebung" },
                    { action: "range.anbindung" },
                    { action: "range.abbindung" },
                ]},
                { separator: true },
                { action: "edit.blockmuster" },
                { action: "edit.bereichmuster" },
            ]},
            { label: i18n.menus.pegplan || "Pegplan",
              visibleWhen: () => !!(settings && settings.display_pegplan),
              items: [
                { action: "pegplan.invert" },
                { action: "pegplan.mirror" },
                { action: "pegplan.clear" },
            ]},
            { label: i18n.menus.repeat || "Repeat", items: [
                { action: "view.repeat" },
                { action: "view.inverse-repeat" },
                { separator: true },
                { action: "repeat.rapportieren" },
                { action: "repeat.reduce" },
            ]},
            { label: i18n.menus.colors || "Colors", items: [
                { action: "colors.toolbox" },
                { separator: true },
                { action: "colors.palette" },
                { action: "colors.blend" },
                { separator: true },
                { action: "colors.set-warp" },
                { action: "colors.set-weft" },
                { action: "colors.replace" },
                { separator: true },
                { action: "colors.warp-from-weft" },
                { action: "colors.weft-from-warp" },
                { action: "colors.switch" },
            ]},
            { label: i18n.menus.extras || "Extras", items: [
                { action: "pegplan.toggle" },
                { separator: true },
                { action: "extras.weave-locked" },
                { action: "extras.ratio" },
                { separator: true },
                { label: i18n.menus.cursor || "Cursor", items: [
                    { action: "cursor.locked" },
                    { action: "cursor.movement" },
                ]},
                { separator: true },
                { label: i18n.menus.baseSettings || "Base settings", items: [
                    { action: "base.american" },
                    { action: "base.scandinavian" },
                    { action: "base.swiss" },
                ]},
                { label: i18n.menus.options || "Options", items: [
                    { action: "opt.pattern" },
                    { action: "opt.global" },
                ]},
            ]},
            { label: i18n.menus.help || "?", align: "right", items: [
                { action: "legal.terms" },
                { action: "legal.privacy" },
                { action: "legal.imprint" },
            ]},
        ];
        Menu.render(menuMount, tree);
        // After the menubar is rendered, sync userdef labels + visibility
        // from localStorage state.
        _refreshUserdefMenuLabels();
    }

    Shortcuts.install({ blocked: editorDialogOpen });

    // Refresh menubar state whenever the command bus changes.
    if (commandBus) commandBus.subscribe(() => ActionRegistry.notify());
}


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

// Wire every <button data-action="..."> in the toolbar to the matching
// ActionRegistry entry. Registry's notify hook keeps the disabled and
// checked states in sync, so the buttons mirror the menu / shortcut
// behaviour automatically.
function setupToolbarAndStatusbar() {
    const buttons = document.querySelectorAll("#tx-toolbar .tx-tb-btn[data-action]");
    buttons.forEach(btn => {
        const id = btn.dataset.action;
        btn.addEventListener("click", (ev) => {
            const a = ActionRegistry.get(id);
            if (!a) return;
            if (a.enabledWhen && !a.enabledWhen()) return;
            ActionRegistry.invoke(id, ev);
            ActionRegistry.notify();
        });
    });
    const refresh = () => {
        buttons.forEach(btn => {
            const id = btn.dataset.action;
            btn.disabled = !ActionRegistry.isEnabled(id);
            btn.classList.toggle("checked", !!ActionRegistry.isChecked(id));
        });
        updateStatusBar();
    };
    ActionRegistry.subscribe(refresh);
    refresh();
    return Promise.resolve();
}

// Direct port of statusbar.cpp::UpdateStatusBar. Five fields:
//   sb-field   — current field name + cursor row/col
//   sb-select  — "Selection WxH" while a >1×1 selection is active
//   sb-range   — "Range N" / "Aushebung" / "Anbindung" / "Abbindung"
//   sb-rapport — "Size KxS  Rapport KxS"
//   sb-zoom    — "Zoom: <px>" (web equivalent of legacy lock indicator)
function updateStatusBar() {
    if (settings === null) return;
    const i18n = editorI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    const FIELD_NAME = {
        weave:       L("statusbar.field-pattern",   "Pattern"),
        entering:    L("statusbar.field-threading", "Threading"),
        tieup:       L("statusbar.field-tieup",     "Tie-up"),
        treadling:   L("statusbar.field-treadling", "Treadling"),
        pegplan:     L("statusbar.field-pegplan",   "Pegplan"),
        reed:        L("statusbar.field-reed",      "Reed threading"),
        color_warp:  L("statusbar.field-cw",        "Warp colors"),
        color_weft:  L("statusbar.field-cf",        "Weft colors"),
    };
    const part = (cursor && cursor.selected_part) || "weave";
    let field = FIELD_NAME[part] || "";
    let pos = "";
    if (cursor) {
        // Reed/color_warp are 1-D along x; color_weft along y; everything
        // else is 2-D. Show whichever axes apply, 1-based.
        const x = cursor.x1, y = cursor.y1;
        if (part === "color_weft" || part === "treadling" || part === "pegplan") {
            pos = "  " + L("statusbar.col", "Col") + " " + (x + 1)
                + "  " + L("statusbar.row", "Row") + " " + (y + 1);
        } else if (part === "reed" || part === "color_warp") {
            pos = "  " + L("statusbar.col", "Col") + " " + (x + 1);
        } else if (part === "entering" || part === "tieup" || part === "weave") {
            pos = "  " + L("statusbar.col", "Col") + " " + (x + 1)
                + "  " + L("statusbar.row", "Row") + " " + (y + 1);
        }
    }
    _setText("sb-field", field + pos);

    let selText = "";
    if (cursor && (cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2)) {
        const dx = Math.abs(cursor.x2 - cursor.x1) + 1;
        const dy = Math.abs(cursor.y2 - cursor.y1) + 1;
        selText = L("statusbar.selection", "Selection") + " " + dx + "×" + dy;
    }
    _setText("sb-select", selText);

    const r = settings.current_range | 0;
    let rangeText = "";
    if (r >= 1 && r <= 9) rangeText = L("statusbar.range", "Range") + " " + r;
    else if (r === 10)    rangeText = L("statusbar.aushebung", "Lift out");
    else if (r === 11)    rangeText = L("statusbar.anbindung", "Binding");
    else if (r === 12)    rangeText = L("statusbar.abbindung", "Unbinding");
    _setText("sb-range", rangeText);

    let rap = "";
    if (pattern) {
        const hasExt = pattern.hasExtent();
        const kw = hasExt ? (pattern.max_x - pattern.min_x + 1) : 0;
        const sw = hasExt ? (pattern.max_y - pattern.min_y + 1) : 0;
        if (kw > 0 || sw > 0) {
            rap = L("statusbar.size", "Size") + " " + kw + "×" + sw;
        }
        const rkw = (pattern.rapport_k_b - pattern.rapport_k_a + 1);
        const rsw = (pattern.rapport_s_b - pattern.rapport_s_a + 1);
        if (rkw > 0 && rsw > 0 && (rkw !== kw || rsw !== sw)) {
            if (rap) rap += "  ";
            rap += L("statusbar.rapport", "Rapport") + " " + rkw + "×" + rsw;
        }
    }
    _setText("sb-rapport", rap);

    // Pattern-locked indicator (port of statusbar.cpp:158). Empty when
    // unlocked so the slot only shows up when relevant.
    _setText("sb-lock", settings.weave_locked
        ? L("extras.weave-locked", "Pattern locked") : "");
}

function _setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text || "";
}

window.addEventListener("resize", () => resizeWindow(view));


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

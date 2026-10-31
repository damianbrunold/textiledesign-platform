// The DB-WEAVE editor's actions: everything the menus, toolbar and
// keyboard shortcuts can invoke is registered in ActionRegistry here
// (setupEditorActions), plus the file actions (export, revert), the
// toolbar wiring and the status bar.

import { ActionRegistry } from "../ui/actions.js";
import {
    _prompt, clearModified, closePatternGuarded, data, downloadRendered,
    editorDialogOpen, editorI18n, getPattern, modified, savePattern,
} from "../ui/common.js";
import { LegalDialog } from "../ui/legal.js";
import { Menu } from "../ui/menu.js";
import { Clipboard, Selection } from "../ui/selection.js";
import { Shortcuts } from "../ui/shortcuts.js";
import { showMusterDialog } from "./blocks.js";
import { _applyCursorLock, goto_next_part, select_part } from "./cursor.js";
import {
    _applyEzStyle, _applyRapportReduce, _applyTfStyle, _cursorShaftIndex,
    _cursorTreadleIndex, _cursorWarpIndex, _cursorWeftIndex, _ezClear,
    _ezCopyFromTf, _ezMirrorAll, _fillKoeper, _insertAtlas, _insertKoeper,
    _insertShaftAt, _insertTreadleAt, _insertWarpAt, _insertWeftAt,
    _pegplanClear, _pegplanInvert, _pegplanMirror, _removeShaftAt,
    _removeTreadleAt, _removeWarpAt, _removeWeftAt, _SHAFT_PARTS,
    _swapShafts, _swapSide, _swapTreadles, _tfClear, _tfCopyFromEz,
    _tfMirrorAll, _TREADLE_PARTS, _WARP_PARTS, _WEFT_PARTS,
    showRapportDialog,
} from "./edits.js";
import { showFixeinzugDialog } from "./fixed-threading.js";
import { _structuralCommand } from "./history.js";
import {
    _printDownload, showPageSetupDialog, showPatternInfoDialog,
    showPrintPartDialog, showPropertiesDialog,
} from "./info.js";
import {
    _kettLancierung, _schussLancierung, showLancierungDialog,
} from "./lancee.js";
import {
    _applyBaseStyle, showCursorMovementDialog, showOptionsDialog,
    showWarpWeftRatioDialog,
} from "./options.js";
import { showOverviewWindow } from "./overview.js";
import {
    _paletteToolboxApply, _paletteToolboxToggle, showColorBlendDialog,
    showPaletteDialog, update_color_selector,
} from "./palette.js";
import {
    initPatternData, initSettings, savePatternData, saveSettings,
} from "./persist.js";
import {
    _runSelectionCommand, selectionCentralSymmetry, selectionClear,
    selectionCopy, selectionCut, selectionInvert, selectionMirrorH,
    selectionMirrorV, selectionPaste, selectionPasteTransparent,
    selectionRollDown, selectionRollLeft, selectionRollRight,
    selectionRollUp, selectionRotate, selectionSlopeDecrease,
    selectionSlopeIncrease, tieupSwapSides,
} from "./selection-ops.js";
import {
    commandBus, cursor, pattern, readonly, settings, setToolDrag, view,
} from "./state.js";
import { showThreadingWizardDialog } from "./threading-wizard.js";
import {
    _colorsReplace, _colorsSetWarp, _colorsSetWeft, _colorsSwitch,
    _colorsWarpFromWeft, _colorsWeftFromWarp, _rangesToolboxApply,
    _rangesToolboxRefresh, _rangesToolboxToggle, _toolsToolboxApply,
    _toolsToolboxRefresh, _toolsToolboxToggle, update_range_selector,
} from "./toolboxes.js";
import {
    _insertUserdef, _refreshUserdefMenuLabels, _userdefAddCurrent,
    _userdefAddSelection, _userdefList, _userdefRemoveClick,
} from "./userdef.js";
import { _applyAspectRatio } from "./views.js";

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
    update_range_selector(settings);
    _paletteToolboxApply();
    _toolsToolboxApply();
    _rangesToolboxApply();
    clearModified();
    ActionRegistry.notify();
}


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

export function setupEditorActions() {
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
        setToolDrag(null);
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


// Wire every <button data-action="..."> in the toolbar to the matching
// ActionRegistry entry. Registry's notify hook keeps the disabled and
// checked states in sync, so the buttons mirror the menu / shortcut
// behaviour automatically.
export function setupToolbarAndStatusbar() {
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
export function updateStatusBar() {
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

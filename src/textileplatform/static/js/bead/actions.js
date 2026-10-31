// The JBead editor's actions: everything the menus, toolbar and
// keyboard shortcuts can invoke is registered in ActionRegistry here
// (setupEditorActions), plus revert, print, export and zoom.

import { ActionRegistry } from "../ui/actions.js";
import {
    _prompt, clearModified, closePatternGuarded, data, downloadRendered,
    editorDialogOpen, getPattern, modified, savePattern,
} from "../ui/common.js";
import { LegalDialog } from "../ui/legal.js";
import { Menu } from "../ui/menu.js";
import { Shortcuts } from "../ui/shortcuts.js";
import { _maxScroll, _refreshScrollbar, _updateStatusbar } from "./chrome.js";
import {
    _activeRow, _deleteRowAt, _insertRowAt, _moveSelectionGroup,
    _openArrangeDialog, _openSizeDialog, _selectionTransform, _shiftPattern,
} from "./edits.js";
import {
    _openPageSetupDialog, _openPropertiesDialog, _openTechInfoDialog,
} from "./info.js";
import { _actionLabel, _menuLabel } from "./labels.js";
import { BeadList, Pattern } from "./model.js";
import { _openPaletteDialog, _openSymbolsDialog } from "./palette.js";
import {
    applyViewSettings, initPattern, savePatternData, saveSettings,
} from "./persist.js";
import { _jbeadPrefsSave } from "./prefs.js";
import {
    beadlist, colors, commandBus, current_tool, draw_colors, draw_symbols,
    pattern, readonly, setBeadlist, setCurrentTool, setDrawColors,
    setDrawSymbols, setPattern, setSelectedColor, setShowCorrected,
    setShowDraft, setShowReport, setShowSimulation, settings,
    show_corrected, show_draft, show_report, show_simulation, view,
} from "./state.js";

// ---- Menubar / toolbar / shortcuts wiring ------------------------


// Discard in-memory edits and reload the pattern from the server.
// Mirrors weave's _revertChanges in weave/editor.js.
async function _revertChanges() {
    if (readonly || !modified) return;
    if (!window.confirm(_actionLabel("file.revert-confirm",
        "Discard all unsaved changes and reload the pattern from the server?"))) {
        return;
    }
    try {
        await getPattern();
    } catch (e) {
        console.error(e);
        alert(_prompt("loadFailed",
            "The pattern could not be loaded. Please reload the page."));
        return;
    }

    // Rebuild the in-memory model from the freshly-loaded `data`.
    setPattern(new Pattern(data.model[0].length, data.model.length));
    setBeadlist(new BeadList(pattern));
    // initPattern pushes onto the existing colors[] — reset first so
    // a revert doesn't leave duplicated palette entries behind.
    colors.length = 0;
    initPattern(data, pattern);

    // Re-apply the persisted view state (the fresh pattern starts
    // unshifted, unscrolled and without a selection).
    applyViewSettings(data['view'] || {});

    // Wire the new pattern through the existing view; layout()
    // re-creates the sub-views with the fresh pattern reference.
    view.pattern  = pattern;
    view.beadlist = beadlist;
    view.layout();
    beadlist.update();

    if (commandBus) commandBus.clear();
    clearModified();
    _refreshScrollbar();
    view.draw();
    _updateStatusbar();
    ActionRegistry.notify();
}

async function _printPattern() {
    if (!readonly) {
        saveSettings(data, settings);
        savePatternData(data, pattern);
    }
    await downloadRendered(
        "print", { contents: data, full_pattern: true },
        `${document.getElementById("pattern").value}.pdf`,
        _prompt("printFailed", "Print failed."));
}

async function _exportPattern(fmt) {
    if (!readonly) {
        saveSettings(data, settings);
        savePatternData(data, pattern);
    }
    const ext = fmt === "jpeg" ? "jpg" : fmt;
    await downloadRendered(
        `export/${fmt}`, { contents: data },
        `${document.getElementById("pattern").value}.${ext}`,
        _prompt("exportFailed", "Export failed."));
}

function _setZoom(dx) {
    dx = Math.max(4, Math.min(48, Math.round(dx)));
    settings.dx = dx;
    settings.dy = dx;
    if (view) {
        view.layout();
        // Visible-rows count may have changed — clamp scroll and
        // refresh the scrollbar's max.
        if (pattern.scroll > _maxScroll()) pattern.scroll = _maxScroll();
        _refreshScrollbar();
        view.draw();
    }
    _updateStatusbar();
    _jbeadPrefsSave({ zoom: dx });
}

export function setupEditorActions() {
    const reg = (id, opts) => {
        ActionRegistry.registerAction({
            id,
            label: _actionLabel(id, id),
            ...opts,
        });
    };

    reg("file.save", {
        shortcut: "Ctrl+S",
        enabledWhen: () => !readonly,
        handler: async () => {
            try {
                await savePattern();
            } catch (e) {
                console.error(e);
                alert(_prompt("saveFailed", "Save failed. Please try again."));
            }
        },
    });
    reg("file.revert", {
        enabledWhen: () => !readonly && modified,
        handler: () => _revertChanges(),
    });
    reg("file.print", {
        shortcut: "Ctrl+P",
        handler: () => _printPattern(),
    });
    reg("file.properties", {
        enabledWhen: () => !readonly,
        handler: () => _openPropertiesDialog(),
    });
    reg("file.page-setup", {
        enabledWhen: () => !readonly,
        handler: () => _openPageSetupDialog(),
    });
    reg("file.export-png",  { handler: () => _exportPattern("png")  });
    reg("file.export-jpeg", { handler: () => _exportPattern("jpeg") });
    reg("file.export-svg",  { handler: () => _exportPattern("svg")  });
    reg("file.export-pdf",  { handler: () => _exportPattern("pdf")  });
    reg("file.close", { handler: () => closePatternGuarded() });

    reg("view.zoom-in",     { shortcut: "Ctrl+I",
        handler: () => _setZoom(settings.dx + 2) });
    reg("view.zoom-out",    { shortcut: "Ctrl+U",
        handler: () => _setZoom(settings.dx - 2) });
    reg("view.zoom-normal", { handler: () => _setZoom(12) });

    // Toggle a boolean view-state variable as a single undoable
    // command. The `prefKey` (when given) is the data.view key the
    // toggle persists to and the user-prefs key it remembers across
    // patterns: redo / undo flip the value just like the original
    // click. The savedMark subscriber drives the modified flag.
    const toggleView = (label, getter, setter, prefKey) => () => {
        const before = getter();
        const after = !before;
        const refresh = (val) => {
            if (prefKey) _jbeadPrefsSave({ [prefKey]: val });
            if (view) { view.layout(); view.draw(); }
            ActionRegistry.notify();
        };
        commandBus.execute({
            label,
            apply: () => { setter(after); refresh(after); },
            revert: () => { setter(before); refresh(before); },
        });
    };
    reg("view.show-draft", {
        checkedWhen: () => show_draft,
        handler: toggleView("show-draft",
            () => show_draft, v => { setShowDraft(v); },
            "draft-visible"),
    });
    reg("view.show-corrected", {
        checkedWhen: () => show_corrected,
        handler: toggleView("show-corrected",
            () => show_corrected, v => { setShowCorrected(v); },
            "corrected-visible"),
    });
    reg("view.show-simulation", {
        checkedWhen: () => show_simulation,
        handler: toggleView("show-simulation",
            () => show_simulation, v => { setShowSimulation(v); },
            "simulation-visible"),
    });
    reg("view.show-report", {
        checkedWhen: () => show_report,
        handler: toggleView("show-report",
            () => show_report, v => { setShowReport(v); },
            "report-visible"),
    });
    // Colours and symbols can't both be off — turning the last one
    // off auto-turns the other on so beads stay distinguishable.
    // The auto-flip is part of the same undoable command.
    const toggleColorsOrSymbols = (label, primaryGetter, primarySetter,
                                   primaryKey, otherGetter, otherSetter,
                                   otherKey) => () => {
        const beforeP = primaryGetter();
        const beforeO = otherGetter();
        const afterP = !beforeP;
        const afterO = (!afterP && !beforeO) ? true : beforeO;
        const refresh = (p, o) => {
            const partial = { [primaryKey]: p };
            if (o !== beforeO || p !== afterP) partial[otherKey] = o;
            _jbeadPrefsSave(partial);
            if (view) { view.layout(); view.draw(); }
            ActionRegistry.notify();
        };
        commandBus.execute({
            label,
            apply: () => {
                primarySetter(afterP);
                otherSetter(afterO);
                refresh(afterP, afterO);
            },
            revert: () => {
                primarySetter(beforeP);
                otherSetter(beforeO);
                refresh(beforeP, beforeO);
            },
        });
    };
    reg("view.draw-colors", {
        checkedWhen: () => draw_colors,
        handler: toggleColorsOrSymbols("draw-colors",
            () => draw_colors, v => { setDrawColors(v); }, "draw-colors",
            () => draw_symbols, v => { setDrawSymbols(v); }, "draw-symbols"),
    });
    reg("view.draw-symbols", {
        checkedWhen: () => draw_symbols,
        handler: toggleColorsOrSymbols("draw-symbols",
            () => draw_symbols, v => { setDrawSymbols(v); }, "draw-symbols",
            () => draw_colors, v => { setDrawColors(v); }, "draw-colors"),
    });

    // ---- Tool selection ----
    const setTool = name => () => {
        setCurrentTool(name);
        if (name !== "select") {
            pattern.selection = null;
            view.draw();
        }
        ActionRegistry.notify();
        _updateStatusbar();
    };
    reg("tool.pencil",  {
        checkedWhen: () => current_tool === "pencil",
        handler: setTool("pencil"),
    });
    reg("tool.select",  {
        checkedWhen: () => current_tool === "select",
        handler: setTool("select"),
    });
    reg("tool.fill",    {
        checkedWhen: () => current_tool === "fill",
        handler: setTool("fill"),
    });
    reg("tool.pipette", {
        checkedWhen: () => current_tool === "pipette",
        handler: setTool("pipette"),
    });
    reg("info.tech",    { handler: () => _openTechInfoDialog() });

    const _okLabel = _actionLabel("btn.ok", "OK");
    reg("legal.terms",   { handler: () => LegalDialog.open("/terms",   _actionLabel("legal.terms",   "Terms"),          _okLabel) });
    reg("legal.privacy", { handler: () => LegalDialog.open("/privacy", _actionLabel("legal.privacy", "Privacy Policy"), _okLabel) });
    reg("legal.imprint", { handler: () => LegalDialog.open("/imprint", _actionLabel("legal.imprint", "Imprint"),        _okLabel) });

    // ---- Edit actions ----
    reg("edit.undo", {
        shortcut: "Ctrl+Z",
        enabledWhen: () => commandBus && commandBus.canUndo(),
        handler: () => { commandBus.undo(); },
    });
    reg("edit.redo", {
        shortcut: "Ctrl+Y",
        enabledWhen: () => commandBus && commandBus.canRedo(),
        handler: () => { commandBus.redo(); },
    });
    const hasSelection = () => pattern && pattern.selection != null;
    reg("edit.delete", {
        shortcut: "Delete",
        enabledWhen: hasSelection,
        handler: () => _selectionTransform("delete"),
    });
    reg("edit.mirror-h", {
        shortcut: "H",
        enabledWhen: hasSelection,
        handler: () => _selectionTransform("mirror-h"),
    });
    reg("edit.mirror-v", {
        shortcut: "V",
        enabledWhen: hasSelection,
        handler: () => _selectionTransform("mirror-v"),
    });
    reg("edit.rotate", {
        shortcut: "R",
        enabledWhen: () => {
            if (!hasSelection()) return false;
            const s = pattern.selection;
            return (s.i2 - s.i1) === (s.j2 - s.j1);
        },
        handler: () => _selectionTransform("rotate"),
    });
    reg("edit.shift-left", {
        shortcut: "ArrowLeft",
        handler: () => _shiftPattern(-1),
    });
    reg("edit.shift-right", {
        shortcut: "ArrowRight",
        handler: () => _shiftPattern(1),
    });
    // Selection group move — Shift+Arrow on the keyboard. The same
    // logic also runs from mouse drag (see _onMouseDown for select
    // tool) so tablet users can drag the selection without a keyboard.
    reg("selection.move-left", {
        shortcut: "Shift+ArrowLeft",
        enabledWhen: hasSelection,
        handler: () => _moveSelectionGroup(-1, 0),
    });
    reg("selection.move-right", {
        shortcut: "Shift+ArrowRight",
        enabledWhen: hasSelection,
        handler: () => _moveSelectionGroup(1, 0),
    });
    reg("selection.move-up", {
        shortcut: "Shift+ArrowUp",
        enabledWhen: hasSelection,
        handler: () => _moveSelectionGroup(0, 1),
    });
    reg("selection.move-down", {
        shortcut: "Shift+ArrowDown",
        enabledWhen: hasSelection,
        handler: () => _moveSelectionGroup(0, -1),
    });
    reg("edit.arrange", {
        enabledWhen: hasSelection,
        handler: () => _openArrangeDialog(),
    });
    reg("edit.insert-row", {
        handler: () => _insertRowAt(_activeRow()),
    });
    reg("edit.delete-row", {
        enabledWhen: () => pattern && pattern.height > 1,
        handler: () => _deleteRowAt(_activeRow()),
    });
    reg("pattern.width",  { handler: () => _openSizeDialog("width") });
    reg("pattern.height", { handler: () => _openSizeDialog("height") });
    reg("colors.palette", {
        handler: () => _openPaletteDialog(),
    });
    reg("colors.symbols", {
        handler: () => _openSymbolsDialog(),
    });

    // Bind shortcuts.
    for (const a of ActionRegistry.all()) Shortcuts.bindAction(a);
    Shortcuts.install({ blocked: editorDialogOpen });

    // Extra one-off shortcuts: 0-9 select colour, F5 redraw. The
    // generic Shortcuts dispatcher binds one combo per action so we
    // install a small auxiliary listener here for the digit keys.
    window.addEventListener("keydown", (e) => {
        if (editorDialogOpen()) return;
        const t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"
                  || t.isContentEditable)) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (e.key >= "0" && e.key <= "9") {
            const idx = parseInt(e.key, 10);
            if (idx < colors.length) {
                setSelectedColor(idx);
                view.draw();
                e.preventDefault();
            }
        } else if (e.key === "F5") {
            if (view) { view.layout(); view.draw(); }
            e.preventDefault();
        }
    });

    // Render menubar.
    const fileItems = [];
    if (!readonly) fileItems.push({ action: "file.save" });
    if (!readonly) fileItems.push({ action: "file.revert" });
    fileItems.push({ action: "file.print" });
    fileItems.push({ label: _menuLabel("export", "Export"), items: [
        { action: "file.export-png" },
        { action: "file.export-jpeg" },
        { action: "file.export-svg" },
        { action: "file.export-pdf" },
    ]});
    fileItems.push({ separator: true });
    if (!readonly) fileItems.push({ action: "file.properties" });
    if (!readonly) fileItems.push({ action: "file.page-setup" });
    fileItems.push({ action: "file.close" });

    const tree = [
        { label: _menuLabel("file", "File"),  items: fileItems },
        { label: _menuLabel("edit", "Edit"),  items: [
            { action: "edit.undo" },
            { action: "edit.redo" },
            { separator: true },
            { action: "edit.delete" },
            { action: "edit.mirror-h" },
            { action: "edit.mirror-v" },
            { action: "edit.rotate" },
            { action: "edit.arrange" },
            { separator: true },
            { action: "edit.insert-row" },
            { action: "edit.delete-row" },
            { separator: true },
            { action: "edit.shift-left" },
            { action: "edit.shift-right" },
        ], visibleWhen: () => !readonly },
        { label: _menuLabel("pattern", "Pattern"), items: [
            { action: "pattern.width" },
            { action: "pattern.height" },
        ], visibleWhen: () => !readonly },
        { label: _menuLabel("view", "View"),  items: [
            { action: "view.zoom-in" },
            { action: "view.zoom-out" },
            { action: "view.zoom-normal" },
            { separator: true },
            { action: "view.show-draft" },
            { action: "view.show-corrected" },
            { action: "view.show-simulation" },
            { action: "view.show-report" },
            { separator: true },
            { action: "view.draw-colors" },
            { action: "view.draw-symbols" },
        ]},
        { label: _menuLabel("tools", "Tools"), items: [
            { action: "tool.pencil"  },
            { action: "tool.select"  },
            { action: "tool.fill"    },
            { action: "tool.pipette" },
        ]},
        { label: _menuLabel("colors", "Colors"), items: [
            { action: "colors.palette" },
            { action: "colors.symbols" },
        ], visibleWhen: () => !readonly },
        { label: _menuLabel("info", "Info"),  items: [
            { action: "info.tech" },
        ]},
        { label: _menuLabel("help", "?"), align: "right", items: [
            { action: "legal.terms" },
            { action: "legal.privacy" },
            { action: "legal.imprint" },
        ]},
    ];
    Menu.render(document.getElementById("tx-menubar"), tree);

    // Wire any element with a data-action: toolbar buttons in the
    // top icon strip *and* the side tools panel.
    const TBSEL = "#tx-toolbar .tx-tb-btn, #tools-panel .tx-tool-btn";
    document.querySelectorAll(TBSEL).forEach(btn => {
        const id = btn.dataset.action;
        if (!id) return;
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            if (!ActionRegistry.isEnabled(id)) return;
            ActionRegistry.invoke(id, e);
        });
    });
    const refreshTb = () => {
        document.querySelectorAll(TBSEL).forEach(btn => {
            const id = btn.dataset.action;
            if (!id) return;
            btn.disabled = !ActionRegistry.isEnabled(id);
            // Toolbar uses .checked (highlight); side tools panel
            // uses .active (matches weave editor's CSS).
            const checked = ActionRegistry.isChecked(id);
            btn.classList.toggle("checked", checked);
            btn.classList.toggle("active", checked);
        });
    };
    ActionRegistry.subscribe(refreshTb);
    refreshTb();
}

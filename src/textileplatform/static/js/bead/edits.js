// The JBead editor's editing operations, each one undoable: selection
// transforms, resizing and inserting / deleting rows, the arrange
// dialog, moving a selection group and shifting the pattern.

import { ActionRegistry } from "../ui/actions.js";
import { restoreGridRegion, snapshotGridRegion } from "../ui/commands.js";
import { setModified } from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import { _refreshScrollbar, _updateStatusbar } from "./chrome.js";
import { _actionLabel } from "./labels.js";
import {
    affectedRect, captureGroup, restoreBaseline, stampGroup,
} from "./selection.js";
import {
    background_color, beadlist, commandBus, pattern, readonly, view,
} from "./state.js";
import {
    arrangeCopies, arrangeUndoRows, resizedData, selectionSource,
    withRowDeleted, withRowInserted,
} from "./transforms.js";

// ---- Selection transforms ----------------------------------------

function _selectionRegion() {
    const s = pattern.selection;
    if (!s) return null;
    return {
        i1: Math.max(0, s.i1),
        j1: Math.max(0, s.j1),
        i2: Math.min(pattern.width - 1, s.i2),
        j2: Math.min(pattern.height - 1, s.j2),
    };
}

export function _selectionTransform(kind) {
    const r = _selectionRegion();
    if (!r) return;
    const W = r.i2 - r.i1 + 1, H = r.j2 - r.j1 + 1;
    if (kind === "rotate" && W !== H) return;
    const before = snapshotGridRegion(pattern, r.i1, r.j1, r.i2, r.j2);
    const apply = () => {
        switch (kind) {
        case "delete":
            for (let j = r.j1; j <= r.j2; j++)
                for (let i = r.i1; i <= r.i2; i++)
                    pattern.set(i, j, background_color);
            break;
        case "mirror-h": {
            for (let j = r.j1; j <= r.j2; j++) {
                const row = [];
                for (let i = r.i1; i <= r.i2; i++) row.push(pattern.get(i, j));
                row.reverse();
                for (let i = 0; i < row.length; i++)
                    pattern.set(r.i1 + i, j, row[i]);
            }
            break;
        }
        case "mirror-v": {
            for (let j = 0; j < Math.floor(H / 2); j++) {
                for (let i = r.i1; i <= r.i2; i++) {
                    const a = pattern.get(i, r.j1 + j);
                    const b = pattern.get(i, r.j2 - j);
                    pattern.set(i, r.j1 + j, b);
                    pattern.set(i, r.j2 - j, a);
                }
            }
            break;
        }
        case "rotate": {
            // 90° clockwise (relative to canvas-up coords). Snapshot
            // the region first, then write back transposed.
            const src = [];
            for (let j = r.j1; j <= r.j2; j++) {
                const row = [];
                for (let i = r.i1; i <= r.i2; i++) row.push(pattern.get(i, j));
                src.push(row);
            }
            // src[y][x] → out[x][H-1-y]
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    pattern.set(r.i1 + (H - 1 - y), r.j1 + x, src[y][x]);
                }
            }
            break;
        }
        }
        beadlist.update();
        view.draw();
        setModified();
    };
    let applied = false;
    commandBus.execute({
        label: "selection." + kind,
        apply: () => {
            if (!applied) { apply(); applied = true; }
            else { apply(); }
        },
        revert: () => {
            restoreGridRegion(pattern, before);
            beadlist.update();
            view.draw();
        },
    });
}

// ---- Resize / row ops -------------------------------------------

function _replacePatternData(newWidth, newHeight, newData) {
    pattern.width = newWidth;
    pattern.height = newHeight;
    pattern.data = newData;
    pattern.selection = null;
    if (pattern.scroll > Math.max(0, newHeight - 1)) {
        pattern.scroll = Math.max(0, newHeight - 1);
    }
    if (newWidth > 0 && pattern.shift >= newWidth) {
        pattern.shift = ((pattern.shift % newWidth) + newWidth) % newWidth;
    }
    if (view) view.layout();
    if (beadlist) beadlist.update();
    _refreshScrollbar();
    if (view) view.draw();
    setModified();
}

function _doResize(newWidth, newHeight) {
    if (newWidth <= 0 || newHeight <= 0) return;
    if (newWidth === pattern.width && newHeight === pattern.height) return;
    const oldW = pattern.width, oldH = pattern.height;
    const oldData = pattern.data.slice();
    const newData = resizedData(oldData, oldW, oldH, newWidth, newHeight);
    commandBus.execute({
        label: "resize",
        apply: () => {
            _replacePatternData(newWidth, newHeight, newData.slice());
        },
        revert: () => {
            _replacePatternData(oldW, oldH, oldData.slice());
        },
    });
}

export function _insertRowAt(j) {
    const W = pattern.width, H = pattern.height;
    const oldData = pattern.data.slice();
    const newData = withRowInserted(oldData, W, H, j);
    commandBus.execute({
        label: "insert-row",
        apply: () => {
            _replacePatternData(W, H + 1, newData.slice());
        },
        revert: () => {
            _replacePatternData(W, H, oldData.slice());
        },
    });
}

export function _deleteRowAt(j) {
    const W = pattern.width, H = pattern.height;
    const oldData = pattern.data.slice();
    // null: not a row, or the last one (a pattern keeps one row).
    const newData = withRowDeleted(oldData, W, H, j);
    if (!newData) return;
    commandBus.execute({
        label: "delete-row",
        apply: () => {
            _replacePatternData(W, H - 1, newData.slice());
        },
        revert: () => {
            _replacePatternData(W, H, oldData.slice());
        },
    });
}

export function _activeRow() {
    // Top-of-selection if there is one; otherwise topmost used row.
    if (pattern.selection) return pattern.selection.j2;
    return Math.max(0, (beadlist.usedHeight | 0) - 1);
}

export function _openSizeDialog(axis) {
    const isWidth = axis === "width";
    const cur = isWidth ? pattern.width : pattern.height;
    const wrap = document.createElement("div");
    const lbl = document.createElement("label");
    lbl.textContent = isWidth
        ? _actionLabel("pattern.new-width",  "New width:")
        : _actionLabel("pattern.new-height", "New height:");
    lbl.style.marginRight = "8px";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "5000";
    input.value = String(cur);
    input.style.width = "5rem";
    wrap.appendChild(lbl);
    wrap.appendChild(input);

    Modal.open({
        title: isWidth
            ? _actionLabel("pattern.width-title",  "Pattern width")
            : _actionLabel("pattern.height-title", "Pattern height"),
        body: wrap,
        buttons: [
            { label: _actionLabel("btn.cancel", "Cancel"), role: "cancel" },
            {
                label: _actionLabel("btn.ok", "OK"), role: "primary",
                onClick: (m) => {
                    const v = parseInt(input.value, 10);
                    if (!Number.isFinite(v) || v < 1) return;
                    if (v < cur) {
                        if (!confirm(_actionLabel(
                            "pattern.confirm-shrink",
                            "Shrinking will discard data outside the new "
                            + "size. Continue?"))) return;
                    }
                    if (isWidth) _doResize(v, pattern.height);
                    else         _doResize(pattern.width, v);
                    m.close();
                },
            },
        ],
    });
}


// ---- Arrange (copy selection with offset, N times) ---------------

export function _openArrangeDialog() {
    if (!pattern.selection) return;
    const sel = pattern.selection;
    // Default offsets: the selection's size.
    const W = sel.i2 - sel.i1 + 1;
    const H = sel.j2 - sel.j1 + 1;

    // Snapshot the full pattern data at dialog open. Live preview
    // mutates pattern.data in place; on every input change (and on
    // Cancel) we restore this baseline before re-running the
    // arrangement, so previews don't pile up.
    const baseline = pattern.data.slice();
    // Capture the source cells once — they don't change while the
    // dialog is open and they reference pattern coords inside the
    // selection (which the preview won't overwrite for k=0).
    const src = selectionSource(pattern, sel);

    const restore = () => {
        for (let i = 0; i < baseline.length; i++) pattern.data[i] = baseline[i];
    };
    const renderPreview = (dx, dy, copies) => {
        restore();
        arrangeCopies(pattern, sel, src, dx, dy, copies);
        beadlist.update();
        view.draw();
    };

    const wrap = document.createElement("div");
    // Stepper rows instead of number inputs: tablets would otherwise
    // pop the virtual keyboard and obscure the live preview. Each row
    // exposes −/+ buttons plus arrow-key handling on the value field.
    const mk = (id, labelKey, label, def, min) => {
        const row = document.createElement("div");
        row.style.margin = "6px 0";
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "0.4rem";
        const lbl = document.createElement("label");
        lbl.textContent = _actionLabel(labelKey, label);
        lbl.style.flex = "1 1 auto";
        lbl.style.minWidth = "9rem";
        lbl.htmlFor = id;
        const dec = document.createElement("button");
        dec.type = "button";
        dec.textContent = "−";
        dec.setAttribute("aria-label", "−");
        const inp = document.createElement("input");
        inp.type = "text";
        inp.id = id;
        inp.value = String(def);
        inp.readOnly = true;
        inp.inputMode = "none";
        inp.setAttribute("inputmode", "none");
        inp.style.width = "4rem";
        inp.style.textAlign = "center";
        const inc = document.createElement("button");
        inc.type = "button";
        inc.textContent = "+";
        inc.setAttribute("aria-label", "+");
        for (const b of [dec, inc]) {
            b.style.minWidth = "2.4rem";
            b.style.minHeight = "2.4rem";
            b.style.fontSize = "1.1rem";
        }
        const lo = (typeof min === "number") ? min : null;
        const step = (delta) => {
            let v = parseInt(inp.value, 10);
            if (!Number.isFinite(v)) v = 0;
            v += delta;
            if (lo !== null && v < lo) v = lo;
            inp.value = String(v);
            inp.dispatchEvent(new Event("input", { bubbles: true }));
        };
        dec.addEventListener("click", () => step(-1));
        inc.addEventListener("click", () => step(+1));
        inp.addEventListener("keydown", (e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowRight") {
                e.preventDefault();
                step(+1);
            } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
                e.preventDefault();
                step(-1);
            }
        });
        row.appendChild(lbl);
        row.appendChild(dec);
        row.appendChild(inp);
        row.appendChild(inc);
        wrap.appendChild(row);
        return inp;
    };
    const inDx = mk("arr-dx", "arrange.dx", "Horizontal offset:", W);
    const inDy = mk("arr-dy", "arrange.dy", "Vertical offset:", H);
    const inN  = mk("arr-n",  "arrange.copies", "Number of copies:", 1, 1);

    const refresh = () => {
        const dx = parseInt(inDx.value, 10) || 0;
        const dy = parseInt(inDy.value, 10) || 0;
        const n  = Math.max(1, parseInt(inN.value, 10) || 1);
        renderPreview(dx, dy, n);
    };
    for (const inp of [inDx, inDy, inN]) {
        inp.addEventListener("input", refresh);
    }
    // Initial preview matches the dialog's defaults.
    refresh();

    let committing = false;
    Modal.open({
        title: _actionLabel("arrange.title", "Arrange selection"),
        body: wrap,
        buttons: [
            { label: _actionLabel("btn.cancel", "Cancel"), role: "cancel" },
            {
                label: _actionLabel("btn.ok", "OK"), role: "primary",
                onClick: (m) => {
                    committing = true;
                    const dx = parseInt(inDx.value, 10) || 0;
                    const dy = parseInt(inDy.value, 10) || 0;
                    const n  = Math.max(1, parseInt(inN.value, 10) || 1);
                    // Roll back the preview before the real apply so
                    // _arrangeSelection's snapshot captures the
                    // original baseline (otherwise undo would only
                    // revert to a previewed state).
                    restore();
                    beadlist.update();
                    view.draw();
                    _arrangeSelection(dx, dy, n);
                    m.close();
                },
            },
        ],
        onClose: () => {
            // ESC / cancel / backdrop click — discard the preview.
            if (!committing) {
                restore();
                beadlist.update();
                view.draw();
            }
        },
    });
}

// ---- Selection group move ---------------------------------------
//
// "Pick up" everything in the pattern that matches the current
// selection's content and drag it as a group. Anchored on three
// gestures: mouse drag of an existing selection, Shift+Arrow on a
// keyboard, and the toolbar arrow buttons (TODO).

// captureGroup / stampGroup / affectedRect are in bead/selection.js.

// Single-arrow / toolbar entry point: capture, commit, push one undo
// step. Called once per Shift+Arrow press / button click.
export function _moveSelectionGroup(dx, dy) {
    if (!pattern.selection || readonly) return;
    if (dx === 0 && dy === 0) return;
    const group = captureGroup(pattern);
    if (!group) return;
    _finalizeSelectionGroupMove(group, group.sel, dx, dy);
}

// Roll the live-preview mutation back to the baseline, snapshot the
// affected region, then commandBus.execute the actual move so undo
// reverts to the original state in one step.
export function _finalizeSelectionGroupMove(group, sel0, dx, dy) {
    if (dx === 0 && dy === 0) {
        // No-op drag — restore baseline and selection just in case
        // the live preview drifted, but don't push an undo entry.
        restoreBaseline(pattern, group);
        pattern.selection = { ...sel0 };
        beadlist.update();
        view.draw();
        _updateStatusbar();
        return;
    }
    const affected = affectedRect(group, dx, dy);
    // Roll back any preview mutations before snapshotting.
    restoreBaseline(pattern, group);
    pattern.selection = { ...sel0 };
    if (!affected) {
        beadlist.update();
        view.draw();
        return;
    }
    const before = snapshotGridRegion(pattern, affected.i1, affected.j1,
                                      affected.i2, affected.j2);
    let firstApply = true;
    commandBus.execute({
        label: "selection.move",
        apply: () => {
            stampGroup(pattern, group, dx, dy, background_color);
            beadlist.update();
            view.draw();
            if (!firstApply) setModified();
            firstApply = false;
            _updateStatusbar();
            ActionRegistry.notify();
        },
        revert: () => {
            restoreGridRegion(pattern, before);
            pattern.selection = { ...sel0 };
            beadlist.update();
            view.draw();
            _updateStatusbar();
            ActionRegistry.notify();
        },
    });
    setModified();
}


// The arrangement itself is in bead/transforms.js (arrangeCopies).
function _arrangeSelection(dx, dy, copies) {
    if (!pattern.selection) return;
    const sel = pattern.selection;
    const rows = arrangeUndoRows(pattern, sel, dx, dy, copies);
    if (!rows) return;
    // Capture source cells before any writes (in case copies overlap).
    const src = selectionSource(pattern, sel);
    const before = snapshotGridRegion(pattern, 0, rows.j1,
                                      pattern.width - 1, rows.j2);
    commandBus.execute({
        label: "arrange",
        apply: () => {
            arrangeCopies(pattern, sel, src, dx, dy, copies);
            beadlist.update();
            view.draw();
            setModified();
        },
        revert: () => {
            restoreGridRegion(pattern, before);
            beadlist.update();
            view.draw();
        },
    });
}

export function _shiftPattern(delta) {
    // View-only operation: rotates the simulated bead tube by `delta`
    // cells. The underlying data is not touched, so the bead-list,
    // repeat, draft and corrected views are unaffected — matching
    // desktop's Model.shift / SimulationPanel.getShift behaviour
    // (only ch.jbead.view.SimulationPanel reads the shift value).
    //
    // The shift is *not* part of the undo stack (a single keystroke
    // reverses it) and does not mark the pattern modified — but it is
    // persisted via savePatternData so save/load round-trips it.
    const W = pattern.width;
    const before = pattern.shift | 0;
    const after = (((before + delta) % W) + W) % W;
    if (after === before) return;
    pattern.shift = after;
    view.draw();
}

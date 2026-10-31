// The JBead editor's palette dialogs: the colour palette and the
// per-colour symbols.

import { ColorPicker } from "../ui/colorpicker.js";
import { data } from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import { _actionLabel } from "./labels.js";
import { _jbeadPrefsSave } from "./prefs.js";
import {
    colors, commandBus, pattern_symbols, selected_color, setPatternSymbols,
    setSelectedColor, view,
} from "./state.js";
import { DEFAULT_SYMBOLS, padSymbols, setSymbol } from "./symbols.js";

// ---- Colour palette editor --------------------------------------

export function _rgbFromString(rgbStr) {
    // colors[] entries are "rgb(R, G, B)" strings.
    const m = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(rgbStr || "");
    if (!m) return [0, 0, 0];
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

export function _applyPalette(palette) {
    // palette is an array of [r, g, b] triples.
    for (let i = 0; i < palette.length; i++) {
        const [r, g, b] = palette[i];
        colors[i] = `rgb(${r}, ${g}, ${b})`;
        if (data && data.colors && data.colors[i]) {
            data.colors[i] = [r | 0, g | 0, b | 0];
        }
    }
}

export function _openPaletteDialog() {
    // Live state we have to be able to roll back: colors[] (display
    // strings) and data.colors (canonical [r, g, b] triples). We
    // snapshot both up front, then use ColorPicker.showPaletteEditor
    // for the actual UI — same widget the weave editor uses
    // (showPaletteDialog in weave/editor.js: hue ring + S/V square +
    // numeric sliders + palette grid).
    const before = colors.map(_rgbFromString);

    ColorPicker.showPaletteEditor({
        palette: before,
        currentIndex: selected_color | 0,
        getLabel: _actionLabel,
        cols: 8,
        // Live preview while the dialog is open.
        onPreview: (draft) => {
            _applyPalette(draft);
            if (view) view.draw();
        },
        // Cancel rolls colour state back; the onPreview hook also
        // restores it when ColorPicker calls `onPreview(before)`.
        onCancel: () => { /* preview hook already reverted */ },
        // OK commits as one undoable palette command. The first
        // apply is a no-op (state is already live from the preview);
        // subsequent applies (redo) re-install the new palette. The
        // commandBus subscriber drives the modified flag via savedMark.
        onCommit: (after, currentIdx) => {
            setSelectedColor(currentIdx | 0);
            const beforeSnap = before.map(c => c.slice());
            const afterSnap  = after.map(c => c.slice());
            let firstApply = true;
            commandBus.execute({
                label: "palette",
                apply: () => {
                    if (firstApply) { firstApply = false; return; }
                    _applyPalette(afterSnap);
                    if (view) view.draw();
                },
                revert: () => {
                    _applyPalette(beforeSnap);
                    if (view) view.draw();
                },
            });
        },
    });
}


// ---- Symbol palette editor --------------------------------------
//
// Symbol helpers are in bead/symbols.js.
//
// Per-colour glyph string edited as one row per palette index. Same
// data model as desktop's BeadSymbols.SAVED_SYMBOLS — single string
// where character N is the glyph for palette colour N. Index 0 is
// the background and isn't drawn, so its slot is shown but optional.

function _applySymbols(s) {
    setPatternSymbols(padSymbols(s, (colors || []).length));
    if (data && data.view) data.view["symbols"] = pattern_symbols;
}

export function _openSymbolsDialog() {
    const before = padSymbols(pattern_symbols, (colors || []).length);
    let draft = before;

    const wrap = document.createElement("div");
    wrap.style.minWidth = "260px";

    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "auto auto auto";
    grid.style.gap = "4px 8px";
    grid.style.alignItems = "center";
    wrap.appendChild(grid);

    const inputs = [];
    const n = Math.max(DEFAULT_SYMBOLS.length, (colors || []).length);
    for (let i = 0; i < n; i++) {
        const idxLabel = document.createElement("span");
        idxLabel.textContent = String(i);
        idxLabel.style.fontFamily = "monospace";
        idxLabel.style.textAlign = "right";
        idxLabel.style.minWidth = "1.5rem";
        const sw = document.createElement("span");
        sw.style.display = "inline-block";
        sw.style.width = "20px";
        sw.style.height = "20px";
        sw.style.border = "1px solid #888";
        sw.style.background = colors[i] || "#ccc";
        const inp = document.createElement("input");
        inp.type = "text";
        inp.maxLength = 1;
        inp.value = draft.charAt(i) || "";
        inp.style.width = "2.5rem";
        inp.style.textAlign = "center";
        inp.style.fontFamily = "monospace";
        inp.addEventListener("input", () => {
            const ch = inp.value.length > 0 ? inp.value.charAt(0) : " ";
            inp.value = ch === " " ? "" : ch;
            draft = setSymbol(draft, i, ch);
            _applySymbols(draft);
            if (view) view.draw();
        });
        grid.appendChild(idxLabel);
        grid.appendChild(sw);
        grid.appendChild(inp);
        inputs.push(inp);
    }

    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = _actionLabel("symbols.reset", "Reset to default");
    reset.style.marginTop = "10px";
    reset.addEventListener("click", () => {
        draft = DEFAULT_SYMBOLS;
        for (let i = 0; i < inputs.length; i++) {
            const ch = draft.charAt(i) || "";
            inputs[i].value = ch === " " ? "" : ch;
        }
        _applySymbols(draft);
        if (view) view.draw();
    });
    wrap.appendChild(reset);

    let committing = false;
    Modal.open({
        title: _actionLabel("symbols.title", "Edit symbols"),
        body: wrap,
        buttons: [
            { label: _actionLabel("btn.cancel", "Cancel"), role: "cancel" },
            {
                label: _actionLabel("btn.ok", "OK"), role: "primary",
                onClick: (m) => {
                    committing = true;
                    const beforeSnap = before;
                    const afterSnap  = padSymbols(draft, (colors || []).length);
                    if (afterSnap === beforeSnap) {
                        m.close();
                        return;
                    }
                    // Reset to pre-dialog state, then push a single
                    // undoable command that flips between before /
                    // after. The commandBus subscriber drives the
                    // modified flag via savedMark so undo/redo back to
                    // the saved baseline correctly clears it.
                    _applySymbols(beforeSnap);
                    if (view) view.draw();
                    commandBus.execute({
                        label: "symbols",
                        apply: () => {
                            _applySymbols(afterSnap);
                            _jbeadPrefsSave({ symbols: afterSnap });
                            if (view) view.draw();
                        },
                        revert: () => {
                            _applySymbols(beforeSnap);
                            _jbeadPrefsSave({ symbols: beforeSnap });
                            if (view) view.draw();
                        },
                    });
                    m.close();
                },
            },
        ],
        onClose: () => {
            if (!committing) {
                _applySymbols(before);
                if (view) view.draw();
            }
        },
    });
}

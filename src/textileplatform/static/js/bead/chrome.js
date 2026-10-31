// The JBead editor's chrome around the canvas: the scrollbar (scroll
// range and position) and the status bar.

import { _actionLabel } from "./labels.js";
import { beadlist, current_tool, pattern, view } from "./state.js";

// ---- Scroll handling --------------------------------------------

export function _maxScroll() {
    if (!view) return 0;
    return Math.max(0, pattern.height - view.visibleRows());
}

export function _refreshScrollbar() {
    const range = document.getElementById('scrollbar');
    if (!range) return;
    const max = _maxScroll();
    range.max = String(max);
    range.value = String(pattern.scroll);
    if (max <= 0) range.setAttribute('data-disabled', '1');
    else range.removeAttribute('data-disabled');
}

export function _setScroll(value) {
    const max = _maxScroll();
    const clamped = Math.max(0, Math.min(max, value | 0));
    if (clamped === pattern.scroll) return false;
    pattern.scroll = clamped;
    const range = document.getElementById('scrollbar');
    if (range) range.value = String(clamped);
    if (view) view.draw();
    return true;
}


export function _updateStatusbar() {
    const sbTool = document.getElementById("sb-tool");
    if (sbTool) {
        const toolLabel = current_tool
            ? _actionLabel("tool." + current_tool, current_tool) : "";
        sbTool.textContent = current_tool
            ? `${_actionLabel("sb.tool", "Tool")}: ${toolLabel}` : "";
    }
    const sbRepeat = document.getElementById("sb-repeat");
    if (sbRepeat && beadlist) {
        const total = beadlist.list.reduce((acc, [, c]) => acc + c, 0);
        sbRepeat.textContent = beadlist.repeat
            ? `${_actionLabel("sb.repeat", "Repeat")}: ${beadlist.repeat} `
              + `(${total} ${_actionLabel("sb.beads", "beads")})`
            : "";
    }
    const sbSel = document.getElementById("sb-selection");
    if (sbSel) {
        const s = pattern && pattern.selection;
        sbSel.textContent = s
            ? `${_actionLabel("sb.selection", "Sel")}: `
              + `${s.i2 - s.i1 + 1} × ${s.j2 - s.j1 + 1}` : "";
    }
}

// Between the stored pattern JSON (`data`, ui/common.js) and the editor
// state: the palette and bead model (model.js loadModel / storeModel)
// and the view settings in data.view.

import { loadModel, storeModel } from "./model.js";
import {
    beadlist, colors, current_tool, draw_colors, draw_symbols, pattern,
    pattern_symbols, selected_color, setCurrentTool, setDrawColors,
    setDrawSymbols, setPatternSymbols, setSelectedColor, setShowCorrected,
    setShowDraft, setShowReport, setShowSimulation, settings,
    show_corrected, show_draft, show_report, show_simulation,
} from "./state.js";
import { DEFAULT_SYMBOLS } from "./symbols.js";

export function initPattern(data, pattern) {
    for (let i = 0; i < data.colors.length; i++) {
        const spec = data.colors[i];
        colors.push(`rgb(${spec[0]}, ${spec[1]}, ${spec[2]})`);
    }
    loadModel(data, pattern);
}

// Apply a stored data.view (the inverse of saveSettings). Keys that are
// missing leave the current value alone.
export function applyViewSettings(v) {
    if (v['selected-color'] != null) setSelectedColor(v['selected-color'] | 0);
    if (v['shift']  != null) pattern.shift  = v['shift']  | 0;
    if (v['scroll'] != null) pattern.scroll = v['scroll'] | 0;
    if (v['zoom']   != null) {
        const z = v['zoom'] | 0;
        if (z >= 4 && z <= 48) { settings.dx = z; settings.dy = z; }
    }
    if (v['draft-visible']      != null) setShowDraft(!!v['draft-visible']);
    if (v['corrected-visible']  != null) setShowCorrected(!!v['corrected-visible']);
    if (v['simulation-visible'] != null) setShowSimulation(!!v['simulation-visible']);
    if (v['report-visible']     != null) setShowReport(!!v['report-visible']);
    if (typeof v['selected-tool'] === "string"
        && ["pencil", "select", "fill", "pipette"]
            .indexOf(v['selected-tool']) >= 0) {
        setCurrentTool(v['selected-tool']);
    }
    if (typeof v['symbols'] === "string" && v['symbols'].length > 0) {
        setPatternSymbols(v['symbols']);
    }
    if (v['draw-colors']  != null) setDrawColors(!!v['draw-colors']);
    if (v['draw-symbols'] != null) setDrawSymbols(!!v['draw-symbols']);
}

export function saveSettings(data, settings) {
    if (!data.view) data.view = {};
    data.view["selected-color"] = selected_color;
    data.view["shift"] = pattern.shift | 0;
    data.view["scroll"] = pattern.scroll | 0;
    data.view["zoom"] = settings.dx | 0;
    data.view["draft-visible"] = !!show_draft;
    data.view["corrected-visible"] = !!show_corrected;
    data.view["simulation-visible"] = !!show_simulation;
    data.view["report-visible"] = !!show_report;
    data.view["selected-tool"] = current_tool;
    data.view["draw-colors"] = !!draw_colors;
    data.view["draw-symbols"] = !!draw_symbols;
    data.view["symbols"] = pattern_symbols || DEFAULT_SYMBOLS;
}

export function savePatternData(data, pattern) {
    // The repeat lives on the bead list, not on the pattern.
    storeModel(data, pattern, beadlist ? beadlist.repeat : null);
}

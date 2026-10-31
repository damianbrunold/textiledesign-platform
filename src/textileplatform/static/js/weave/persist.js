// Between the stored pattern JSON (`data`, ui/common.js) and the editor
// state: io.js does the conversion, these add what lives in the editor
// (per-device preferences, the cursor, the palette's CSS colours, the
// viewport sizes).

import {
    loadPatternData, loadSettings, storePatternData, storeSettings,
} from "./io.js";
import { _prefsLoad } from "./options.js";
import { cellPainters } from "./painters.js";
import { colors, cursor, settings, view } from "./state.js";

export function initSettings(data, settings) {
    loadSettings(data, settings, {
        // Per-device preferences fill what the pattern doesn't specify.
        prefs: _prefsLoad(),
        styles: new Set(Object.keys(cellPainters)),
    });
}


export function saveSettings(data, settings) {
    storeSettings(data, settings);
    // Cursor position persists across reloads so the user can pick up where
    // they left off. We only store a single cell, not the whole selection.
    if (cursor !== null) {
        data["cursor_part"] = cursor.selected_part;
        data["cursor_x"] = cursor.x1;
        data["cursor_y"] = cursor.y1;
    }
}


export function initPatternData(data, pattern) {
    loadPatternData(data, pattern,
                    { pegplan: !!(settings && settings.display_pegplan) });
    pattern.palette.forEach(([r, g, b], idx) => {
        colors[idx] = `rgb(${r}, ${g}, ${b})`;
    });
}


export function savePatternData(data, pattern) {
    // Persist the drag-resizable viewport sizes (einzug height,
    // trittfolge width). They live on the runtime view; mirror back
    // into data so a reload picks them up.
    if (view) {
        data.visible_shafts   = view.visible_shafts;
        data.visible_treadles = view.visible_treadles;
    }
    storePatternData(data, pattern);
}

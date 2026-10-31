// Conversion between the stored DB-WEAVE pattern JSON (`data`: what the
// API returns and saves, checked by validation.py) and the editor's
// Pattern and settings.
//
//   loadPatternData(data, pattern, { pegplan })  data -> Pattern
//   storePatternData(data, pattern)              Pattern -> data
//   loadSettings(data, settings, { prefs, styles })
//   storeSettings(data, settings)
//
// No DOM and no editor globals. Moved out of dbweave.js
// (initPatternData / savePatternData / initSettings / saveSettings,
// which now delegate here).

const MUSTER_SLOTS = 10;
const MUSTER_CELLS = 12 * 12;

// data[prop], or `defval` when the key is missing (a stored null stays
// null, as it always has).
export function val(data, prop, defval) {
    const result = data[prop];
    if (result === undefined) return defval;
    return result;
}

// ---------- pattern ---------------------------------------------------

// Fill a freshly constructed `pattern` (of data's sizes) from `data`
// and compute the weave. `pegplan`: the editor shows the pegplan
// instead of tie-up + treadling.
export function loadPatternData(data, pattern, { pegplan = false } = {}) {
    pattern.palette = [];
    for (const spec of data.palette || []) {
        pattern.palette.push([spec[0] | 0, spec[1] | 0, spec[2] | 0]);
    }

    for (let i = 0; i < data.width; i++) {
        pattern.color_warp.set(i, 0, data.colors_warp[i]);
        pattern.reed.set(i, 0, data.data_reed[i]);
    }

    for (let j = 0; j < data.height; j++) {
        pattern.color_weft.set(0, j, data.colors_weft[j]);
    }

    // Seed as "empty" (min > max) rather than 0 so a pattern whose first
    // used warp/weft sits in the middle of the grid reloads with the same
    // extent it had while being edited.
    let min_pattern_x = data.width;
    let max_pattern_x = 0;
    for (let i = 0; i < data.width; i++) {
        if (data.data_entering[i] > 0) {
            min_pattern_x = Math.min(min_pattern_x, i);
            max_pattern_x = Math.max(max_pattern_x, i);
        }
    }
    pattern.min_x = min_pattern_x;
    pattern.max_x = max_pattern_x;

    let min_pattern_y = data.height;
    let max_pattern_y = 0;
    for (let j = 0; j < data.height; j++) {
        for (let i = 0; i < data.max_treadles; i++) {
            const idx = i + j * data.max_treadles;
            if (data.data_treadling[idx] > 0) {
                min_pattern_y = Math.min(min_pattern_y, j);
                max_pattern_y = Math.max(max_pattern_y, j);
            }
        }
    }
    pattern.min_y = min_pattern_y;
    pattern.max_y = max_pattern_y;

    for (let i = min_pattern_x; i <= max_pattern_x; i++) {
        const shaft = data.data_entering[i];
        if (shaft > 0) pattern.entering.set_shaft(i, shaft);
    }

    for (let j = min_pattern_y; j <= max_pattern_y; j++) {
        for (let k = 0; k < data.max_treadles; k++) {
            const treadle = data.data_treadling[k + j * data.max_treadles];
            if (treadle > 0) pattern.treadling.set(k, j, treadle);
        }
    }

    // The whole tie-up: cells of shafts / treadles that nothing uses
    // yet are part of the pattern too (tying up first is common).
    for (let i = 0; i < data.max_treadles; i++) {
        for (let j = 0; j < data.max_shafts; j++) {
            const tieup = data.data_tieup[i + j * data.max_treadles];
            if (tieup > 0) pattern.tieup.set(i, j, tieup);
        }
    }

    // Pegplan: optional — older patterns won't have it. Shape is
    // max_shafts × height, flattened by shaft-major order (i + j*max_shafts).
    if (Array.isArray(data.data_pegplan)) {
        for (let j = 0; j < data.height; j++) {
            for (let s = 0; s < data.max_shafts; s++) {
                const v = data.data_pegplan[s + j * data.max_shafts];
                if (v > 0) pattern.pegplan.set(s, j, v);
            }
        }
    }

    // Block- / Bereich-muster slots (10 each, 12×12 cells flat). Older
    // patterns without these arrays start with empty muster slots.
    _loadMusterArray(data.data_blockmuster, pattern.blockmuster);
    _loadMusterArray(data.data_bereichmuster, pattern.bereichmuster);

    // Fixed-threading template (optional — older patterns lack it).
    if (Array.isArray(data.data_fixeinzug)) {
        for (let i = 0; i < pattern.fixeinzug.length
                        && i < data.data_fixeinzug.length; i++) {
            pattern.fixeinzug[i] = data.data_fixeinzug[i] || 0;
        }
    }
    pattern.fixsize = val(data, "fixsize", 0);
    pattern.firstfree = val(data, "firstfree", 0);

    // Hilfslinien — array of {typ, feld, pos}. Older patterns may lack it.
    pattern.hlines = [];
    if (Array.isArray(data.hlines)) {
        for (const h of data.hlines) {
            if (!h || typeof h !== "object") continue;
            const typ = (h.typ === "vert") ? "vert" : "horz";
            const feld = h.feld ? 1 : 0;
            const pos = h.pos | 0;
            if (pos >= 0) pattern.hlines.push({ typ, feld, pos });
        }
    }

    // Restore persisted rapport bounds (auto-detected on save). Older
    // patterns lack these keys — leave Pattern's default "no rapport"
    // (rapport_*_b < rapport_*_a) in place and let the user re-detect.
    if (Number.isInteger(data.rapport_k_a)
        && Number.isInteger(data.rapport_k_b)) {
        pattern.rapport_k_a = data.rapport_k_a;
        pattern.rapport_k_b = data.rapport_k_b;
    }
    if (Number.isInteger(data.rapport_s_a)
        && Number.isInteger(data.rapport_s_b)) {
        pattern.rapport_s_a = data.rapport_s_a;
        pattern.rapport_s_b = data.rapport_s_b;
    }

    // Pegplan + .dbw imports: the .dbw format stores no pegplan, only
    // treadling + tie-up. A pattern last viewed in pegplan mode would
    // get its weave from an empty pegplan, so derive the pegplan from
    // the treadling-based weave first.
    if (pegplan && !pattern.pegplan.data.some((v) => v > 0)) {
        pattern._recalc_weave_from_treadling();
        pattern._recalc_pegplan_from_weave();
    }
    pattern.recalc_weave();
}

function _loadMusterArray(arr, target) {
    if (!Array.isArray(arr)) return;
    for (let k = 0; k < MUSTER_SLOTS && k < arr.length; k++) {
        const slot = arr[k];
        if (!Array.isArray(slot)) continue;
        for (let i = 0; i < slot.length && i < MUSTER_CELLS; i++) {
            target[k].feld[i] = slot[i] || 0;
        }
    }
}

// Write `pattern` into `data` (in place; the sizes stay data's).
export function storePatternData(data, pattern) {
    for (let i = 0; i < data.width; i++) {
        data.data_reed[i] = pattern.reed.get(i, 0);
        data.colors_warp[i] = pattern.color_warp.get(i, 0);
        data.data_entering[i] = pattern.entering.get_shaft(i);
    }

    for (let j = 0; j < data.height; j++) {
        data.colors_weft[j] = pattern.color_weft.get(0, j);
    }

    for (let j = 0; j < data.height; j++) {
        for (let i = 0; i < data.max_treadles; i++) {
            const idx = i + j * data.max_treadles;
            data.data_treadling[idx] = pattern.treadling.get(i, j);
        }
    }

    for (let i = 0; i < data.max_treadles; i++) {
        for (let j = 0; j < data.max_shafts; j++) {
            const idx = i + j * data.max_treadles;
            data.data_tieup[idx] = pattern.tieup.get(i, j);
        }
    }

    // Pegplan (shafts × height, shaft-major flattening).
    const pegFlat = new Array(data.max_shafts * data.height);
    pegFlat.fill(0);
    for (let j = 0; j < data.height; j++) {
        for (let s = 0; s < data.max_shafts; s++) {
            pegFlat[s + j * data.max_shafts] = pattern.pegplan.get(s, j);
        }
    }
    data.data_pegplan = pegFlat;

    // Muster slots — 10 × 144 cells each, simple flat int arrays.
    data.data_blockmuster = pattern.blockmuster.map((m) => m.feld.slice());
    data.data_bereichmuster = pattern.bereichmuster.map((m) => m.feld.slice());

    // Fixed-threading template + helper indices.
    data.data_fixeinzug = pattern.fixeinzug.slice();
    data.fixsize = pattern.fixsize;
    data.firstfree = pattern.firstfree;

    // Hilfslinien — round-trip the user's guide-line list.
    data.hlines = (pattern.hlines || []).map((h) => ({
        typ: h.typ, feld: h.feld | 0, pos: h.pos | 0,
    }));

    // Persist auto-detected rapport bounds so the server can index
    // pattern_width/height + rapport_width/height for list views.
    data.rapport_k_a = pattern.rapport_k_a | 0;
    data.rapport_k_b = pattern.rapport_k_b | 0;
    data.rapport_s_a = pattern.rapport_s_a | 0;
    data.rapport_s_b = pattern.rapport_s_b | 0;

    // Palette — write back as [r,g,b,x] to match the storage format (the
    // 4th slot mirrors the legacy alpha/marker channel).
    if (pattern.palette && pattern.palette.length) {
        data.palette = pattern.palette.map(([r, g, b], i) => {
            const orig = (Array.isArray(data.palette) && data.palette[i])
                || [0, 0, 0, 0];
            return [r, g, b, orig[3] || 0];
        });
    }
}

// ---------- settings --------------------------------------------------

// Fill `settings` from `data`. `prefs` are the per-device preferences
// that supply defaults for whatever the pattern doesn't specify (saved
// patterns win); `styles` the known cell styles (unknown ones become
// "filled").
export function loadSettings(data, settings, { prefs = {}, styles } = {}) {
    const coerceStyle = (v) =>
        (typeof v === "string" && (!styles || styles.has(v))) ? v : "filled";
    settings.style = val(data, "weave_style", "draft");
    settings.entering_style = coerceStyle(
        val(data, "entering_style", prefs.entering_style || "filled"));
    settings.tieup_style = coerceStyle(
        val(data, "tieup_style", prefs.tieup_style || "filled"));
    settings.treadling_style = coerceStyle(
        val(data, "treadling_style", prefs.treadling_style || "filled"));
    settings.single_treadling = val(data, "single_treadling", true);
    settings.weave_locked = val(data, "weave_locked", false);
    settings.unit_width = val(data, "unit_width", prefs.unit_width || 4);
    settings.unit_height = val(data, "unit_height", prefs.unit_height || 4);
    settings.direction_righttoleft = val(
        data, "direction_righttoleft", !!prefs.direction_righttoleft);
    settings.direction_toptobottom = val(
        data, "direction_toptobottom", !!prefs.direction_toptobottom);
    settings.entering_at_bottom = val(
        data, "entering_at_bottom", !!prefs.entering_at_bottom);
    settings.warp_factor = val(data, "warp_factor", prefs.warp_factor || 1.0);
    settings.weft_factor = val(data, "weft_factor", prefs.weft_factor || 1.0);
    // Port of XOptionsDialog fields. alt_palette and alt_pegplan are
    // no-ops but kept so the Optionen dialog round-trips them.
    // sinking_shed inverts the colour effect / simulation render.
    settings.pegplan_style = coerceStyle(
        val(data, "pegplan_style", prefs.pegplan_style || "filled"));
    settings.aushebung_style = coerceStyle(
        val(data, "aushebung_style", prefs.aushebung_style || "rising"));
    settings.anbindung_style = coerceStyle(
        val(data, "anbindung_style", prefs.anbindung_style || "cross"));
    settings.abbindung_style = coerceStyle(
        val(data, "abbindung_style", prefs.abbindung_style || "circle"));
    settings.alt_palette = val(data, "alt_palette", !!prefs.alt_palette);
    settings.alt_pegplan = val(data, "alt_pegplan", !!prefs.alt_pegplan);
    settings.sinking_shed = val(data, "sinking_shed", !!prefs.sinking_shed);
    settings.current_color = val(data, "current_color", 0);
    settings.display_colors_warp = val(data, "display_colors_warp", true);
    settings.display_colors_weft = val(data, "display_colors_weft", true);
    settings.display_hlines = val(data, "display_hlines", true);
    settings.display_palette = val(data, "display_palette", false);
    settings.display_pegplan = val(data, "display_pegplan", false);
    settings.display_reed = val(data, "display_reed", true);
    settings.display_repeat = val(data, "display_repeat", false);
    settings.display_entering = val(data, "display_entering", true);
    settings.display_treadling = val(data, "display_treadling", true);
    const savedRange = val(data, "current_range", 1);
    settings.current_range =
        (savedRange >= 1 && savedRange <= 12) ? savedRange : 1;
    settings.inverse_repeat = val(data, "inverse_repeat", false);
    settings.color_effect_with_grid = val(
        data, "color_effect_with_grid", false);
    settings.highlight = false;
    settings.threading_arrangement = val(
        data, "threading_arrangement", "minimal-z");
    settings.treadling_arrangement = val(
        data, "treadling_arrangement", "minimal-z");
    // Cursor behaviour (Extras ▸ Cursor): lock to rapport, and the
    // CD_* bitmask of directions the cursor advances after a Space
    // toggle: 1=UP, 2=LEFT, 4=DOWN, 8=RIGHT (desktop CURSORDIRECTION).
    settings.cursor_locked = val(data, "cursor_locked", false);
    settings.cursor_dir = val(data, "cursor_dir", 1);
    // Side toolboxes (Werkzeuge / Bereiche), persisted per pattern.
    settings.display_tools_panel = val(data, "display_tools_panel", false);
    settings.display_ranges_panel = val(data, "display_ranges_panel", false);
}

const STORED_SETTINGS = [
    ["weave_style", "style"],
    "entering_style", "tieup_style", "treadling_style", "single_treadling",
    "weave_locked", "unit_width", "unit_height", "direction_righttoleft",
    "direction_toptobottom", "entering_at_bottom", "warp_factor",
    "weft_factor", "pegplan_style", "aushebung_style", "anbindung_style",
    "abbindung_style", "alt_palette", "alt_pegplan", "sinking_shed",
    "current_color", "display_colors_warp", "display_colors_weft",
    "display_hlines", "display_palette", "display_pegplan", "display_reed",
    "display_repeat", "display_entering", "display_treadling",
    "pattern_only", "current_range", "inverse_repeat",
    "threading_arrangement", "treadling_arrangement",
    "color_effect_with_grid", "cursor_locked", "cursor_dir",
    "display_tools_panel", "display_ranges_panel",
];

export function storeSettings(data, settings) {
    for (const entry of STORED_SETTINGS) {
        const [key, prop] = Array.isArray(entry) ? entry : [entry, entry];
        data[key] = settings[prop];
    }
}

// The DB-WEAVE editor's settings dialogs: Options, the basic settings
// presets (Grundeinstellung), warp / weft ratio and cursor movement,
// the threading / treadling arrangement styles, and the per-user
// preferences stored on the server.

import { ActionRegistry } from "../ui/actions.js";
import { editorI18n } from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import { arrangeThreading, arrangeTreadling } from "./arrange.js";
import { _resizePatternCommand, _snapshotCommand } from "./history.js";
import { pattern, readonly, settings, view } from "./state.js";
import { _applyAspectRatio } from "./views.js";

// Directions the cursor moves after a toggle (bit mask, settings
// cursor_dir; see showCursorMovementDialog).
export const CD_UP = 1, CD_LEFT = 2, CD_DOWN = 4, CD_RIGHT = 8;


// ---- Phase 12: Options + Grundeinstellung (per-device localStorage) -
//
// Direct port of the desktop's Extras menu structure:
//   Extras
//     Grundeinstellung ▸ Amerikanisch / Skandinavisch / Deutsch-Schweiz.
//     Optionen        ▸ Für dieses Muster… / Global…
//
// Grundeinstellung items apply a base preset to BOTH the active
// pattern AND the localStorage prefs (so File > New picks them up).
// They aren't a radio group — the user is free to mix afterwards.
//
// Optionen "Für dieses Muster…" mutates only the live `settings`.
// Optionen "Global…" mutates the live `settings` AND saves the same
// values into localStorage, so subsequent new patterns get them.
//
// Settings that the desktop has but the web port hasn't implemented
// (alternate palette, alternate pegplan view, harness mode, multi
// treadle, harness/treadle counts) are still exposed in the dialog
// and persisted, but their value has no in-app effect yet — they
// graduate to actual behaviour as those features land.

const _PREFS_DEFAULTS = {
    // Symbols
    entering_style:    "vdash",
    treadling_style:   "dot",
    tieup_style:       "cross",
    pegplan_style:     "filled",
    aushebung_style:   "rising",
    anbindung_style:   "cross",
    abbindung_style:   "circle",
    // Ansicht
    direction_righttoleft: false,
    direction_toptobottom: false,
    entering_at_bottom:    false,
    color_effect_with_grid: false,
    alt_palette:    false,   // no-op: palette2 not yet ported
    alt_pegplan:    false,   // no-op
    // Einstellungen
    single_treadling: true,
    sinking_shed:     false,
    // Grössen — used as defaults for new patterns and seed values for
    // the editor's Optionen dialog.
    max_shafts:       16,
    max_treadles:     16,
    visible_shafts:   16,
    visible_treadles: 16,
    warp_threads:     300,
    weft_threads:     300,
    // Raster (== unit_width / unit_height in the existing setting)
    unit_width:  4,
    unit_height: 4,
    // Simulation
    warp_factor: 1.0,
    weft_factor: 1.0,
};

// Per-user editor prefs are stored on the server (User.settings, JSON).
// The editor template embeds the current document under
// <script id="tx-user-settings">, and we cache the dbweave subtree here
// so dialogs can read/write synchronously. Saves PUT to the API in the
// background; failures are logged but don't block the UI.
let _prefsCache = null;

function _prefsRead() {
    if (_prefsCache) return _prefsCache;
    let dbw = {};
    try {
        const el = document.getElementById("tx-user-settings");
        if (el && el.textContent) {
            const all = JSON.parse(el.textContent);
            if (all && typeof all === "object" && all.dbweave
                && typeof all.dbweave === "object") {
                dbw = all.dbweave;
            }
        }
    } catch { /* fall through to defaults */ }
    _prefsCache = Object.assign({}, _PREFS_DEFAULTS, dbw);
    return _prefsCache;
}

export function _prefsLoad() {
    return Object.assign({}, _prefsRead());
}

function _prefsSave(prefs) {
    _prefsCache = Object.assign({}, _PREFS_DEFAULTS, prefs);
    if (readonly) return;
    try {
        fetch("/api/user/settings", {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dbweave: _prefsCache }),
        }).catch((e) => console.warn("settings save failed", e));
    } catch (e) {
        console.warn("settings save failed", e);
    }
}

// Push the option values onto the active settings + view. Symbol
// styles, direction flags, single-treadle and the unit-grid sliders
// take effect immediately; the rest are stored on `settings` (or
// remembered in prefs) but currently no-ops.
const _OPTIONS_KEYS = [
    "entering_style", "tieup_style", "treadling_style",
    "pegplan_style", "aushebung_style", "anbindung_style", "abbindung_style",
    "direction_righttoleft", "direction_toptobottom",
    "entering_at_bottom", "color_effect_with_grid",
    "alt_palette", "alt_pegplan", "single_treadling", "sinking_shed",
    "unit_width", "unit_height",
];
function _optionsApplyToSettings(opts) {
    _snapshotCommand("change options",
        () => {
            const s = {};
            for (const k of _OPTIONS_KEYS) s[k] = settings[k];
            return s;
        },
        (s) => {
            for (const k of _OPTIONS_KEYS) settings[k] = s[k];
        },
        () => {
            settings.entering_style  = opts.entering_style;
            settings.tieup_style     = opts.tieup_style;
            settings.treadling_style = opts.treadling_style;
            settings.pegplan_style   = opts.pegplan_style;
            settings.aushebung_style = opts.aushebung_style;
            settings.anbindung_style = opts.anbindung_style;
            settings.abbindung_style = opts.abbindung_style;
            settings.direction_righttoleft  = !!opts.direction_righttoleft;
            settings.direction_toptobottom  = !!opts.direction_toptobottom;
            settings.entering_at_bottom     = !!opts.entering_at_bottom;
            settings.color_effect_with_grid = !!opts.color_effect_with_grid;
            settings.alt_palette      = !!opts.alt_palette;
            settings.alt_pegplan      = !!opts.alt_pegplan;
            settings.single_treadling = !!opts.single_treadling;
            settings.sinking_shed     = !!opts.sinking_shed;
            settings.unit_width  = opts.unit_width  | 0;
            settings.unit_height = opts.unit_height | 0;
        },
        () => {
            if (view) {
                view.layout();
                view.draw();
            }
        },
    );
}

// Grundeinstellung presets — direct ports of OptAmericanClick /
// OptSkandinavischClick / OptSwissClick from mainwindow.cpp:1759–1832.
// Each helper updates the live settings AND persists into the prefs
// (so File > New picks the same look). Not a radio group — the user
// can adjust individual fields afterwards.
const _BASE_STYLES = {
    swiss: {
        entering_style: "vdash", tieup_style: "cross", treadling_style: "dot",
        pegplan_style: "filled",
        direction_righttoleft: false, direction_toptobottom: false,
        entering_at_bottom: false, sinking_shed: false,
    },
    scandinavian: {
        entering_style: "filled", tieup_style: "filled", treadling_style: "filled",
        pegplan_style: "filled",
        direction_righttoleft: true, direction_toptobottom: true,
        entering_at_bottom: true,  sinking_shed: true,
    },
    american: {
        entering_style: "filled", tieup_style: "filled", treadling_style: "filled",
        pegplan_style: "filled",
        direction_righttoleft: true, direction_toptobottom: false,
        entering_at_bottom: false, sinking_shed: false,
    },
};

export function _applyBaseStyle(name) {
    const base = _BASE_STYLES[name];
    if (!base) return;
    // Persist the preset to global prefs unconditionally — that's a
    // user-level choice independent of the current pattern, so undo
    // shouldn't roll it back.
    const prefs = _prefsLoad();
    Object.assign(prefs, base);
    _prefsSave(prefs);
    // The in-document effect IS undoable.
    const keys = Object.keys(base);
    _snapshotCommand("apply base style: " + name,
        () => {
            const s = {};
            for (const k of keys) s[k] = settings[k];
            return s;
        },
        (s) => {
            for (const k of keys) settings[k] = s[k];
        },
        () => {
            for (const k of keys) settings[k] = base[k];
        },
        () => {
            if (view) {
                view.layout();
                view.draw();
            }
            ActionRegistry.notify();
        },
    );
}

// Style options for the Symbols tab. Web painter keys on the left,
// localised desktop-style label on the right (used as fallback).
// `withNumber` controls whether the "Number" entry is offered (matches
// loadCombo(..., true) on desktop — only Threading / Tie-up / Pegplan).
const _SYMBOL_OPTS = [
    ["filled",      "Filled"],
    ["vdash",       "Vertical"],
    ["hdash",       "Horizontal"],
    ["plus",        "Plus"],
    ["cross",       "Cross"],
    ["dot",         "Point"],
    ["circle",      "Circle"],
    ["rising",      "Rising"],
    ["falling",     "Falling"],
    ["smallcross",  "Small cross"],
    ["smallcircle", "Small circle"],
    ["number",      "Number"],
];

// Tabbed Optionen dialog — full port of XOptionsDialog (xoptionsdialog.cpp).
// `global=true`: also save edits to localStorage. `global=false`: per-pattern.
export function showOptionsDialog(global) {
    const i18n = editorI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    const prefs = _prefsLoad();

    // Seed from live settings; missing fields fall back to prefs.
    const cur = {
        entering_style:    settings.entering_style    ?? prefs.entering_style,
        treadling_style:   settings.treadling_style   ?? prefs.treadling_style,
        tieup_style:       settings.tieup_style       ?? prefs.tieup_style,
        pegplan_style:     settings.pegplan_style     ?? prefs.pegplan_style,
        aushebung_style:   settings.aushebung_style   ?? prefs.aushebung_style,
        anbindung_style:   settings.anbindung_style   ?? prefs.anbindung_style,
        abbindung_style:   settings.abbindung_style   ?? prefs.abbindung_style,
        direction_righttoleft: !!settings.direction_righttoleft,
        direction_toptobottom: !!settings.direction_toptobottom,
        entering_at_bottom:    !!settings.entering_at_bottom,
        color_effect_with_grid: !!settings.color_effect_with_grid,
        alt_palette: !!(settings.alt_palette ?? prefs.alt_palette),
        alt_pegplan: !!(settings.alt_pegplan ?? prefs.alt_pegplan),
        single_treadling: settings.single_treadling !== false,
        sinking_shed: !!(settings.sinking_shed ?? prefs.sinking_shed),
        // For "Global…" the sizes are the defaults for *future* patterns,
        // so seed from prefs. For "For this pattern…" they reflect the
        // active pattern's actual dimensions.
        max_shafts:       global ? prefs.max_shafts
            : ((pattern && pattern.tieup)  ? pattern.tieup.height : prefs.max_shafts),
        max_treadles:     global ? prefs.max_treadles
            : ((pattern && pattern.tieup)  ? pattern.tieup.width  : prefs.max_treadles),
        visible_shafts:   prefs.visible_shafts,
        visible_treadles: prefs.visible_treadles,
        warp_threads:     global ? prefs.warp_threads
            : ((pattern && pattern.weave)  ? pattern.weave.width  : prefs.warp_threads),
        weft_threads:     global ? prefs.weft_threads
            : ((pattern && pattern.weave)  ? pattern.weave.height : prefs.weft_threads),
        unit_width:  settings.unit_width  | 0 || prefs.unit_width,
        unit_height: settings.unit_height | 0 || prefs.unit_height,
        warp_factor: +settings.warp_factor || prefs.warp_factor,
        weft_factor: +settings.weft_factor || prefs.weft_factor,
    };

    const symbolOptionsHtml = (withNumber) =>
        _SYMBOL_OPTS
            .filter(([k]) => withNumber || k !== "number")
            .map(([v, lbl]) => `<option value="${v}">${L("color.style-" + v, lbl)}</option>`)
            .join("");

    const body = document.createElement("div");
    body.style.minWidth = "640px";
    body.innerHTML = `
        <div class="tx-tabs" style="border-bottom:1px solid #888;display:flex;gap:0.2rem">
            <button data-tab="sizes"    class="tx-tab" type="button">${L("opt.tab-sizes", "Sizes")}</button>
            <button data-tab="view"     class="tx-tab" type="button">${L("opt.tab-view", "View")}</button>
            <button data-tab="symbols"  class="tx-tab" type="button">${L("opt.tab-symbols", "Symbols")}</button>
            <button data-tab="settings" class="tx-tab" type="button">${L("opt.tab-settings", "Settings")}</button>
            <button data-tab="grid"     class="tx-tab" type="button">${L("opt.tab-grid", "Grid")}</button>
        </div>
        <div class="tx-tab-pane" data-pane="sizes" style="padding:0.6rem 0">
            <fieldset style="border:1px solid #888;padding:0.4rem 0.6rem">
                <legend>${L("opt.size", "Size")}</legend>
                <div style="display:grid;grid-template-columns:auto 6rem auto 6rem;gap:0.4rem 1rem;align-items:center">
                    <label>${L("opt.harnesses", "Harnesses:")}</label>
                    <input id="tx-opt-shafts"   type="number" min="1" max="100" step="1">
                    <label>${L("opt.treadles", "Treadles:")}</label>
                    <input id="tx-opt-treadles" type="number" min="1" max="100" step="1">
                    <label>${L("opt.warpthreads", "Warp threads:")}</label>
                    <input id="tx-opt-warps"    type="number" min="1" max="10000" step="1">
                    <label>${L("opt.weftthreads", "Weft threads:")}</label>
                    <input id="tx-opt-wefts"    type="number" min="1" max="10000" step="1">
                </div>
            </fieldset>
            <fieldset style="border:1px solid #888;padding:0.4rem 0.6rem;margin-top:0.6rem">
                <legend>${L("opt.visibility", "Visibility")}</legend>
                <div style="display:grid;grid-template-columns:auto 6rem auto 6rem;gap:0.4rem 1rem;align-items:center">
                    <label>${L("opt.visible-harnesses", "Visible harnesses:")}</label>
                    <input id="tx-opt-vshafts"   type="number" min="0" max="100" step="1">
                    <label>${L("opt.visible-treadles", "Visible treadles:")}</label>
                    <input id="tx-opt-vtreadles" type="number" min="0" max="100" step="1">
                </div>
            </fieldset>
        </div>
        <div class="tx-tab-pane" data-pane="view" style="display:none;padding:0.6rem 0">
            <div style="display:flex;flex-direction:column;gap:0.3rem">
                <label><input id="tx-opt-eab" type="checkbox"> ${L("opt.threading-below", "Threading below pattern")}</label>
                <label><input id="tx-opt-rtl" type="checkbox"> ${L("opt.work-rtl", "Work direction in threading and pattern from right to left")}</label>
                <label><input id="tx-opt-ttb" type="checkbox"> ${L("opt.work-ttb", "Work direction in threading and tie-up from top to bottom")}</label>
                <label><input id="tx-opt-fewr" type="checkbox"> ${L("opt.fe-with-raster", "Color effect with grid")}</label>
                <!-- Not implemented yet (see _PREFS_DEFAULTS): hidden, but
                     kept so the values still round-trip through the dialog. -->
                <label style="display:none"><input id="tx-opt-altpal" type="checkbox"> ${L("opt.alt-palette", "Use alternate color palette")}</label>
                <label style="display:none"><input id="tx-opt-altpeg" type="checkbox"> ${L("opt.alt-pegplan", "Use alternate pegplan view")}</label>
            </div>
        </div>
        <div class="tx-tab-pane" data-pane="symbols" style="display:none;padding:0.6rem 0">
            <div style="display:grid;grid-template-columns:auto 1fr;gap:0.4rem 1rem;align-items:center">
                <label>${L("opt.threading", "Threading:")}</label>
                <select id="tx-opt-sym-ez">${symbolOptionsHtml(true)}</select>
                <label>${L("opt.treadling", "Treadling:")}</label>
                <select id="tx-opt-sym-tf">${symbolOptionsHtml(false)}</select>
                <label>${L("opt.tieup", "Tie-up:")}</label>
                <select id="tx-opt-sym-au">${symbolOptionsHtml(true)}</select>
                <label>${L("opt.pegplan", "Pegplan:")}</label>
                <select id="tx-opt-sym-sp">${symbolOptionsHtml(true)}</select>
                <label>${L("opt.lift-out", "Lift out:")}</label>
                <select id="tx-opt-sym-au-lift">${symbolOptionsHtml(false)}</select>
                <label>${L("opt.binding", "Binding:")}</label>
                <select id="tx-opt-sym-anb">${symbolOptionsHtml(false)}</select>
                <label>${L("opt.unbinding", "Unbinding:")}</label>
                <select id="tx-opt-sym-abb">${symbolOptionsHtml(false)}</select>
            </div>
        </div>
        <div class="tx-tab-pane" data-pane="settings" style="display:none;padding:0.6rem 0">
            <fieldset style="border:1px solid #888;padding:0.4rem 0.6rem">
                <legend>${L("opt.treadle-mode", "Treadle mode")}</legend>
                <label><input type="radio" name="tx-opt-tt" value="single"> ${L("opt.single-tt", "Single treadle")}</label>
                <label style="margin-left:1rem"><input type="radio" name="tx-opt-tt" value="multi"> ${L("opt.multi-tt", "Multi treadle")}</label>
            </fieldset>
            <fieldset style="border:1px solid #888;padding:0.4rem 0.6rem;margin-top:0.6rem">
                <legend>${L("opt.harness-mode", "Harness mode")}</legend>
                <label><input type="radio" name="tx-opt-shed" value="rising"> ${L("opt.rising-shed", "Rising shed")}</label>
                <label style="margin-left:1rem"><input type="radio" name="tx-opt-shed" value="sinking"> ${L("opt.sinking-shed", "Sinking shed")}</label>
            </fieldset>
        </div>
        <div class="tx-tab-pane" data-pane="grid" style="display:none;padding:0.6rem 0">
            <fieldset style="border:1px solid #888;padding:0.4rem 0.6rem">
                <legend>${L("opt.gridsetting", "Gridsetting")}</legend>
                <div style="display:grid;grid-template-columns:auto 6rem;gap:0.4rem 1rem;align-items:center">
                    <label>${L("opt.gh", "Horizontal:")}</label>
                    <input id="tx-opt-uw" type="number" min="0" max="100" step="1">
                    <label>${L("opt.gv", "Vertical:")}</label>
                    <input id="tx-opt-uh" type="number" min="0" max="100" step="1">
                </div>
            </fieldset>
        </div>
        `;
    const $ = (sel) => body.querySelector(sel);
    const $$ = (sel) => body.querySelectorAll(sel);

    // Tab switching.
    const showTab = (name) => {
        $$(".tx-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
        $$(".tx-tab-pane").forEach(p => p.style.display = (p.dataset.pane === name) ? "" : "none");
    };
    $$(".tx-tab").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
    showTab("sizes");

    // Populate from cur.
    $("#tx-opt-shafts").value    = cur.max_shafts;
    $("#tx-opt-treadles").value  = cur.max_treadles;
    $("#tx-opt-warps").value     = cur.warp_threads;
    $("#tx-opt-wefts").value     = cur.weft_threads;
    $("#tx-opt-vshafts").value   = cur.visible_shafts;
    $("#tx-opt-vtreadles").value = cur.visible_treadles;
    $("#tx-opt-eab").checked     = cur.entering_at_bottom;
    $("#tx-opt-rtl").checked     = cur.direction_righttoleft;
    $("#tx-opt-ttb").checked     = cur.direction_toptobottom;
    $("#tx-opt-fewr").checked    = cur.color_effect_with_grid;
    $("#tx-opt-altpal").checked  = cur.alt_palette;
    $("#tx-opt-altpeg").checked  = cur.alt_pegplan;
    // Normalise style keys to the closest entry in _SYMBOL_OPTS. Legacy
    // patterns may carry painter aliases (e.g. "dash" → "vdash") that
    // render correctly via cellPainters but aren't listed in the dialog,
    // which would otherwise leave the <select> displaying blank.
    const _SYMBOL_KEYS = new Set(_SYMBOL_OPTS.map(([k]) => k));
    const _normSym = (v, fallback) => {
        if (v === "dash") return "vdash";
        return _SYMBOL_KEYS.has(v) ? v : fallback;
    };
    $("#tx-opt-sym-ez").value      = _normSym(cur.entering_style,  "vdash");
    $("#tx-opt-sym-tf").value      = _normSym(cur.treadling_style, "dot");
    $("#tx-opt-sym-au").value      = _normSym(cur.tieup_style,     "cross");
    $("#tx-opt-sym-sp").value      = _normSym(cur.pegplan_style,   "filled");
    $("#tx-opt-sym-au-lift").value = _normSym(cur.aushebung_style, "rising");
    $("#tx-opt-sym-anb").value     = _normSym(cur.anbindung_style, "cross");
    $("#tx-opt-sym-abb").value     = _normSym(cur.abbindung_style, "circle");
    $$("input[name='tx-opt-tt']").forEach(r => r.checked = (r.value === (cur.single_treadling ? "single" : "multi")));
    $$("input[name='tx-opt-shed']").forEach(r => r.checked = (r.value === (cur.sinking_shed ? "sinking" : "rising")));
    $("#tx-opt-uw").value = cur.unit_width;
    $("#tx-opt-uh").value = cur.unit_height;

    const collect = () => ({
        // Sizes (dimensions): no-op in web — kept for forward-compat.
        max_shafts:       parseInt($("#tx-opt-shafts").value, 10)   || cur.max_shafts,
        max_treadles:     parseInt($("#tx-opt-treadles").value, 10) || cur.max_treadles,
        warp_threads:     parseInt($("#tx-opt-warps").value, 10)    || cur.warp_threads,
        weft_threads:     parseInt($("#tx-opt-wefts").value, 10)    || cur.weft_threads,
        visible_shafts:   parseInt($("#tx-opt-vshafts").value, 10)   || cur.visible_shafts,
        visible_treadles: parseInt($("#tx-opt-vtreadles").value, 10) || cur.visible_treadles,
        // View
        entering_at_bottom:     $("#tx-opt-eab").checked,
        direction_righttoleft:  $("#tx-opt-rtl").checked,
        direction_toptobottom:  $("#tx-opt-ttb").checked,
        color_effect_with_grid: $("#tx-opt-fewr").checked,
        alt_palette:            $("#tx-opt-altpal").checked,
        alt_pegplan:            $("#tx-opt-altpeg").checked,
        // Symbols. The selects only offer the styles in _SYMBOL_OPTS;
        // a pattern saved with another painter (dash/hdash/plus) leaves
        // the select with an empty value. Fall back to the current
        // setting in that case so a no-op submit doesn't clobber it.
        entering_style:  $("#tx-opt-sym-ez").value      || cur.entering_style,
        treadling_style: $("#tx-opt-sym-tf").value      || cur.treadling_style,
        tieup_style:     $("#tx-opt-sym-au").value      || cur.tieup_style,
        pegplan_style:   $("#tx-opt-sym-sp").value      || cur.pegplan_style,
        aushebung_style: $("#tx-opt-sym-au-lift").value || cur.aushebung_style,
        anbindung_style: $("#tx-opt-sym-anb").value     || cur.anbindung_style,
        abbindung_style: $("#tx-opt-sym-abb").value     || cur.abbindung_style,
        // Settings
        single_treadling: body.querySelector("input[name='tx-opt-tt']:checked").value === "single",
        sinking_shed:     body.querySelector("input[name='tx-opt-shed']:checked").value === "sinking",
        // Grid
        unit_width:  parseInt($("#tx-opt-uw").value, 10) || 4,
        unit_height: parseInt($("#tx-opt-uh").value, 10) || 4,
    });

    let modal;
    const accept = () => {
        const opts = collect();
        // Resize the pattern grids if any of warp/weft/shafts/treadles
        // changed. _resizePatternCommand is a no-op when dims are equal,
        // so it's safe to call unconditionally; it pushes its own undo
        // entry separate from the settings change below.
        const nw  = Math.max(1, opts.warp_threads     | 0);
        const nh  = Math.max(1, opts.weft_threads     | 0);
        const nms = Math.max(1, opts.max_shafts       | 0);
        const nmt = Math.max(1, opts.max_treadles     | 0);
        _resizePatternCommand(nw, nh, nms, nmt);
        _optionsApplyToSettings(opts);
        if (global) {
            const prefs = _prefsLoad();
            Object.assign(prefs, opts);
            _prefsSave(prefs);
        }
        modal.close();
    };

    modal = Modal.open({
        title: global
            ? L("opt.title-global",  "Options (global)")
            : L("opt.title-pattern", "Options (this pattern)"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok",     "OK"),     role: "primary", onClick: accept },
        ],
    });
}

// Schuss-/Kettverhältnis (weft/warp ratio). Direct port of
// VerhaeltnisDialog (verhaeltnisdialog.cpp). Two factors; the
// non-equal axis stretches via _applyAspectRatio.
export function showWarpWeftRatioDialog() {
    const i18n = editorI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    const body = document.createElement("div");
    body.style.minWidth = "320px";
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 6rem;gap:0.4rem 1rem;align-items:center">
            <label>${L("ratio.warp-factor", "Warp factor:")}</label>
            <input id="tx-rat-wf" type="number" min="0.01" max="10" step="0.1">
            <label>${L("ratio.weft-factor", "Weft factor:")}</label>
            <input id="tx-rat-sf" type="number" min="0.01" max="10" step="0.1">
        </div>`;
    const $ = (sel) => body.querySelector(sel);
    $("#tx-rat-wf").value = settings.warp_factor || 1.0;
    $("#tx-rat-sf").value = settings.weft_factor || 1.0;
    setTimeout(() => { $("#tx-rat-wf").focus(); $("#tx-rat-wf").select(); }, 0);

    let modal;
    const accept = () => {
        let wf = parseFloat($("#tx-rat-wf").value);
        let sf = parseFloat($("#tx-rat-sf").value);
        if (!isFinite(wf) || wf <= 0) wf = 1.0;
        if (!isFinite(sf) || sf <= 0) sf = 1.0;
        if (wf !== settings.warp_factor || sf !== settings.weft_factor) {
            _snapshotCommand("change warp/weft ratio",
                () => ({
                    wf: settings.warp_factor,
                    sf: settings.weft_factor,
                }),
                (s) => {
                    settings.warp_factor = s.wf;
                    settings.weft_factor = s.sf;
                    _applyAspectRatio(settings);
                },
                () => {
                    settings.warp_factor = wf;
                    settings.weft_factor = sf;
                    _applyAspectRatio(settings);
                },
                () => { if (view) { view.layout(); view.draw(); } },
            );
        }
        modal.close();
    };
    modal = Modal.open({
        title: L("ratio.title", "Weft/warp ratio"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok",     "OK"),     role: "primary", onClick: accept },
        ],
    });
}

// Cursor movement dialog — port of CursorDirDialog. Four toggle buttons
// arranged in a cross; OR'd into the CD_* bitmask. Supports diagonals
// by checking multiple bits at once.
export function showCursorMovementDialog() {
    const i18n = editorI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    const body = document.createElement("div");
    body.style.minWidth = "240px";
    const ARR = (s) => `<span style="font-size:1.4rem;line-height:1">${s}</span>`;
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,3rem);
                    grid-template-rows:repeat(3,3rem);gap:0.3rem;
                    justify-content:center">
            <div></div>
            <button type="button" id="tx-cd-up"    class="tx-cd-btn">${ARR("&#8593;")}</button>
            <div></div>
            <button type="button" id="tx-cd-left"  class="tx-cd-btn">${ARR("&#8592;")}</button>
            <div></div>
            <button type="button" id="tx-cd-right" class="tx-cd-btn">${ARR("&#8594;")}</button>
            <div></div>
            <button type="button" id="tx-cd-down"  class="tx-cd-btn">${ARR("&#8595;")}</button>
            <div></div>
        </div>`;
    const $ = (sel) => body.querySelector(sel);
    const btns = {
        [CD_UP]:    $("#tx-cd-up"),
        [CD_DOWN]:  $("#tx-cd-down"),
        [CD_LEFT]:  $("#tx-cd-left"),
        [CD_RIGHT]: $("#tx-cd-right"),
    };
    let dir = settings.cursor_dir | 0;
    // Look (incl. the "on" state) comes from editor-menu(-dark).css.
    const refresh = () => {
        for (const [bit, b] of Object.entries(btns)) {
            b.classList.toggle("on", (dir & (+bit)) !== 0);
        }
    };
    for (const [bit, b] of Object.entries(btns)) {
        b.addEventListener("click", (e) => {
            const mask = +bit;
            // Alt-click clears the opposite axis bit, matching desktop.
            if (e.altKey) {
                const opp = (mask === CD_UP)   ? CD_DOWN
                          : (mask === CD_DOWN) ? CD_UP
                          : (mask === CD_LEFT) ? CD_RIGHT
                          :                      CD_LEFT;
                dir &= ~opp;
            }
            dir ^= mask;
            refresh();
        });
    }
    refresh();

    let modal;
    const accept = () => {
        if (dir !== (settings.cursor_dir | 0)) {
            _snapshotCommand("change cursor movement",
                () => ({ d: settings.cursor_dir | 0 }),
                (s) => { settings.cursor_dir = s.d; },
                () => { settings.cursor_dir = dir; },
            );
        }
        modal.close();
    };
    modal = Modal.open({
        title: L("cursor.movement-title", "Cursor movement"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok",     "OK"),     role: "primary", onClick: accept },
        ],
    });
}

// The arrangement algorithms are in weave/arrange.js.
export function _runEzArrangement(style) {
    arrangeThreading(pattern, style, { pegplan: !!settings.display_pegplan });
}

export function _runTfArrangement(style) {
    arrangeTreadling(pattern, style, { pegplan: !!settings.display_pegplan });
}

export function _applyArrangementHook(s) {
    if (!s) return;
    if (s.threading_arrangement) _runEzArrangement(s.threading_arrangement);
    if (!s.display_pegplan && s.treadling_arrangement) {
        _runTfArrangement(s.treadling_arrangement);
    }
}

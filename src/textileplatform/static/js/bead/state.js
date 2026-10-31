// The JBead editor's shared state. Every editor module reads these as
// live bindings; they are assigned only through the setters (an
// imported binding can't be assigned).

// The Pattern (model.js) being edited.
export let pattern = null;

// The PatternView (views.js): layout and drawing of all views.
export let view = null;

// The ViewSettings (views.js): cell size and colour scheme.
export let settings = null;

// The BeadList (model.js): the current repeat as colour runs.
export let beadlist = null;

// The palette: colour index -> CSS colour string.
export const colors = [];

// The pattern was opened read-only.
export let readonly = false;

// The undo history (ui/commands.js CommandBus).
export let commandBus = null;

// The colour the drawing tools paint with, and the background colour.
export let selected_color = 1;
export const background_color = 0;

// View visibility flags, toggled from the View menu (desktop View ->
// Draft / Corrected / Simulation / Report).
export let show_draft = true;
export let show_corrected = true;
export let show_simulation = true;
export let show_report = true;
export let draw_colors = true;
export let draw_symbols = false;

// Per-colour symbol glyphs: one string indexed by palette position,
// the desktop's BeadSymbols.SAVED_SYMBOLS encoding, persisted in
// data.view.symbols. null: the defaults (DEFAULT_SYMBOLS in symbols.js).
export let pattern_symbols = null;

// Active drawing tool: "pencil" / "select" / "fill" / "pipette".
export let current_tool = "pencil";

export function setPattern(v) { pattern = v; }
export function setView(v) { view = v; }
export function setSettings(v) { settings = v; }
export function setBeadlist(v) { beadlist = v; }
export function setReadonly(v) { readonly = v; }
export function setCommandBus(v) { commandBus = v; }
export function setSelectedColor(v) { selected_color = v; }
export function setShowDraft(v) { show_draft = v; }
export function setShowCorrected(v) { show_corrected = v; }
export function setShowSimulation(v) { show_simulation = v; }
export function setShowReport(v) { show_report = v; }
export function setDrawColors(v) { draw_colors = v; }
export function setDrawSymbols(v) { draw_symbols = v; }
export function setPatternSymbols(v) { pattern_symbols = v; }
export function setCurrentTool(v) { current_tool = v; }

// What the views (views.js) read from the editor state.
export const viewEnv = {
    get pattern() { return pattern; },
    get settings() { return settings; },
    get colors() { return colors; },
    get drawColors() { return draw_colors; },
    get drawSymbols() { return draw_symbols; },
    get symbols() { return pattern_symbols; },
    get selectedColor() { return selected_color; },
    get beadlist() { return beadlist; },
    get showDraft() { return show_draft; },
    get showCorrected() { return show_corrected; },
    get showSimulation() { return show_simulation; },
    get showReport() { return show_report; },
};

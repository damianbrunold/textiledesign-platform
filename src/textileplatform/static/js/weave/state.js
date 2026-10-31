// The DB-WEAVE editor's shared state. Every editor module reads these
// as live bindings; only the editor's startup assigns them (through the
// setters: an imported binding can't be assigned).

// The Pattern (model.js) being edited.
export let pattern = null;

// The PatternView (views.js): layout and drawing of all panes.
export let view = null;

// The ViewSettings (views.js): display and editing settings.
export let settings = null;

// The palette: colour index -> CSS colour string.
export const colors = {};

// The cursor / selection: corners in document coordinates and the pane
// (entering, tieup, treadling, weave, color_warp, color_weft, ...).
export const cursor = {
    x1: 0,
    x2: 0,
    y1: 0,
    y2: 0,
    selected_part: "weave",
};

// The pattern was opened read-only.
export let readonly = false;

// The undo history (ui/commands.js CommandBus).
export let commandBus = null;

// Drag state of the drawing tools (ui/tools.js rasterizes); null when
// no tool drag is in progress.
export let toolDrag = null;

export function setPattern(p) { pattern = p; }
export function setView(v) { view = v; }
export function setSettings(s) { settings = s; }
export function setReadonly(r) { readonly = r; }
export function setCommandBus(b) { commandBus = b; }
export function setToolDrag(d) { toolDrag = d; }

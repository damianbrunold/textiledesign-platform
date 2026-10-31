// The DB-WEAVE editor's cursor: moving between panes (each pane keeps
// its last position), selecting a pane, the arrow-key movement with the
// cursor lock and the direction setting, and the selection icons of the
// toolbar.

import { ActionRegistry } from "../ui/actions.js";
import { CD_DOWN, CD_LEFT, CD_RIGHT, CD_UP } from "./options.js";
import { cursor, pattern, settings, view } from "./state.js";
import { GridViewDummy } from "./views.js";

let saved_x_weave = 0;
let saved_y_weave = 0;
let saved_x_tieup = 0;
let saved_y_tieup = 0;


export function goto_next_part() {
    if (cursor.selected_part === "weave") {
        select_part("entering", saved_x_weave, saved_y_tieup);
    } else if (cursor.selected_part === "entering") {
        select_part("treadling", saved_x_tieup, saved_y_weave);
    } else if (cursor.selected_part === "treadling") {
        select_part("tieup", saved_x_tieup, saved_y_tieup);
    } else if (cursor.selected_part === "tieup") {
        select_part("pegplan", saved_x_tieup, saved_y_weave);
    } else if (cursor.selected_part === "pegplan") {
        select_part("color_weft", 0, saved_y_weave);
    } else if (cursor.selected_part === "color_weft") {
        select_part("color_warp", saved_x_weave, 0);
    } else if (cursor.selected_part === "color_warp") {
        select_part("reed", saved_x_weave, 0);
    } else if (cursor.selected_part === "reed") {
        select_part("weave", saved_x_weave, saved_y_weave);
    }
    if (cursor.selected_view instanceof GridViewDummy) goto_next_part();
    if (cursor.selected_part === "weave" && settings.weave_locked) goto_next_part();
}

export function goto_prev_part() {
    if (cursor.selected_part === "weave") {
        select_part("reed", saved_x_weave, 0);
    } else if (cursor.selected_part === "reed") {
        select_part("color_warp", saved_x_weave, 0);
    } else if (cursor.selected_part === "entering") {
        select_part("weave", saved_x_weave, saved_y_weave);
    } else if (cursor.selected_part === "treadling") {
        select_part("entering", saved_x_weave, saved_y_tieup);
    } else if (cursor.selected_part === "tieup") {
        select_part("treadling", saved_x_tieup, saved_y_weave);
    } else if (cursor.selected_part === "pegplan") {
        select_part("entering", saved_x_weave, saved_y_tieup);
    } else if (cursor.selected_part === "color_weft") {
        select_part("pegplan", saved_x_tieup, saved_y_weave);
    } else if (cursor.selected_part === "color_warp") {
        select_part("color_weft", 0, saved_y_weave);
    }
    if (cursor.selected_view instanceof GridViewDummy) goto_prev_part();
    if (cursor.selected_part === "weave" && settings.weave_locked) goto_prev_part();
}

export function save_part_position() {
    if (cursor.selected_part === "weave") {
        saved_x_weave = cursor.x2;
        saved_y_weave = cursor.y2;
    } else if (cursor.selected_part === "entering") {
        saved_x_weave = cursor.x2;
        saved_y_tieup = cursor.y2;
    } else if (cursor.selected_part === "treadling") {
        saved_x_tieup = cursor.x2;
        saved_y_weave = cursor.y2;
    } else if (cursor.selected_part === "tieup") {
        saved_x_tieup = cursor.x2;
        saved_y_tieup = cursor.y2;
    } else if (cursor.selected_part === "color_weft") {
        saved_y_weave = cursor.y2;
    } else if (cursor.selected_part === "color_warp") {
        saved_x_weave = cursor.x2;
    } else if (cursor.selected_part === "reed") {
        saved_x_weave = cursor.x2;
    }
}

export function select_part(part, x1, y1, x2, y2) {
    if (x1 !== undefined) cursor.x1 = x1;
    if (y1 !== undefined) cursor.y1 = y1;
    if (x2 !== undefined) cursor.x2 = x2; else cursor.x2 = x1;
    if (y2 !== undefined) cursor.y2 = y2; else cursor.y2 = y1;
    if (part === "entering") {
        saved_x_weave = cursor.x2;
        saved_y_tieup = cursor.y2;
        cursor.selected_part = "entering";
        cursor.selected_pattern = pattern.entering;
        cursor.selected_view = view.entering;
    } else if (part === "tieup") {
        saved_x_tieup = cursor.x2;
        saved_y_tieup = cursor.y2;
        cursor.selected_part = "tieup";
        cursor.selected_pattern = pattern.tieup;
        cursor.selected_view = view.tieup;
    } else if (part === "treadling") {
        saved_x_tieup = cursor.x2;
        saved_y_weave = cursor.y2;
        cursor.selected_part = "treadling";
        cursor.selected_pattern = pattern.treadling;
        cursor.selected_view = view.treadling;
    } else if (part === "weave") {
        saved_x_weave = cursor.x2;
        saved_y_weave = cursor.y2;
        cursor.selected_part = "weave";
        cursor.selected_pattern = pattern.weave;
        cursor.selected_view = view.weave;
    } else if (part === "color_warp") {
        saved_x_weave = cursor.x2;
        cursor.selected_part = "color_warp";
        cursor.selected_pattern = pattern.color_warp;
        cursor.selected_view = view.color_warp;
    } else if (part === "color_weft") {
        saved_y_weave = cursor.y2;
        cursor.selected_part = "color_weft";
        cursor.selected_pattern = pattern.color_weft;
        cursor.selected_view = view.color_weft;
    } else if (part === "pegplan") {
        saved_x_tieup = cursor.x2;
        saved_y_weave = cursor.y2;
        cursor.selected_part = "pegplan";
        cursor.selected_pattern = pattern.pegplan;
        cursor.selected_view = view.pegplan;
    } else if (part === "reed") {
        saved_x_weave = cursor.x2;
        cursor.selected_part = "reed";
        cursor.selected_pattern = pattern.reed;
        cursor.selected_view = view.reed;
    } else {
        console.error("cannot select part", part);
    }
    ActionRegistry.notify();
}


export function updateSelectionIcons() {
    const has_selection = cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2;
    const is_square = has_selection && Math.abs(cursor.x2 - cursor.x1) === Math.abs(cursor.y2 - cursor.y1);
    if (has_selection) {
        document.getElementById("icon-selection-mirrorv").classList.remove("hidden");
        document.getElementById("icon-selection-mirrorh").classList.remove("hidden");
        if (is_square) {
            document.getElementById("icon-selection-rotate").classList.remove("hidden");
        } else {
            document.getElementById("icon-selection-rotate").classList.add("hidden");
        }
        if (cursor.selected_part === "weave") {
            document.getElementById("icon-selection-invert").classList.remove("hidden");
        } else {
            document.getElementById("icon-selection-invert").classList.add("hidden");
        }
        document.getElementById("icon-selection-clear").classList.remove("hidden");
    } else {
        document.getElementById("icon-selection-mirrorv").classList.add("hidden");
        document.getElementById("icon-selection-mirrorh").classList.add("hidden");
        document.getElementById("icon-selection-rotate").classList.add("hidden");
        document.getElementById("icon-selection-invert").classList.add("hidden");
        document.getElementById("icon-selection-clear").classList.add("hidden");
    }
}


// Snap the cursor into the active rapport when "in rapport" mode is on.
// Mirrors CrCursorHandlerImpl::CheckLocked: warp axis (k) clamps for
// entering / weave; weft axis (s) clamps for weave / treadling /
// pegplan. Wraps modulo the rapport length so arrow keys cycle inside
// the repeat. No-op unless a rapport has been detected.
export function _applyCursorLock() {
    if (!settings.cursor_locked) return;
    const part = cursor.selected_part;
    const wrap = (v, a, b) => {
        const len = b - a + 1;
        if (len <= 0) return v;
        return a + ((v - a) % len + len) % len;
    };
    if (part === "weave" || part === "entering") {
        const x = wrap(cursor.x2, pattern.rapport_k_a, pattern.rapport_k_b);
        cursor.x2 = x; cursor.x1 = x;
    }
    if (part === "weave" || part === "treadling" || part === "pegplan") {
        const y = wrap(cursor.y2, pattern.rapport_s_a, pattern.rapport_s_b);
        cursor.y2 = y; cursor.y1 = y;
    }
}

// Live screen-axis flags for the cursor's current pane. Reading from
// settings + selected_part instead of cursor.selected_view.righttoleft /
// .toptobottom — view.layout() rebuilds pane objects on every settings
// change, and cursor.selected_view can lag behind (e.g. the reed pane
// isn't re-bound after layout). Deriving from the live setting keeps
// arrow keys correct even if the cached view is stale.
export function _cursorRtl() {
    const part = cursor && cursor.selected_part;
    // Panes laid out on the warp axis honour direction_righttoleft.
    // Treadling / tie-up / pegplan / color_weft never flip horizontally.
    if (part === "entering" || part === "weave"
        || part === "reed" || part === "color_warp") {
        return !!settings.direction_righttoleft;
    }
    return false;
}
export function _cursorTtb() {
    const part = cursor && cursor.selected_part;
    // Panes on the weft axis (entering shafts, tie-up shafts) honour
    // direction_toptobottom. Other panes paint top-to-bottom by their
    // own convention.
    if (part === "entering" || part === "tieup") {
        return !!settings.direction_toptobottom;
    }
    return false;
}

// Auto-advance the cursor after a Space toggle, in the direction(s)
// configured by Extras ▸ Cursor ▸ Movement. Multiple bits OR'd together
// produce diagonal moves. cursor_dir bits are interpreted in doc/work
// coordinates (CD_RIGHT = next warp thread, CD_UP = next weft row), so
// "advance" always moves to the next cell in reading order — when RTL
// is on this is visually leftward, matching the user's work direction.
export function _advanceCursorAfterToggle() {
    const dir = settings.cursor_dir | 0;
    const ev = { shiftKey: false, ctrlKey: false };
    // Single-row bars (color_warp, reed) must only advance horizontally;
    // single-column bars (color_weft) only vertically. Strip the
    // perpendicular bits, and if the user's cursor_dir has no bit on
    // the bar's long axis fall back to a sensible default so Space
    // still advances at all.
    const pat = cursor.selected_pattern;
    const isHorzBar = pat && pat.height === 1 && pat.width > 1;
    const isVertBar = pat && pat.width === 1 && pat.height > 1;
    let h = dir & (CD_LEFT | CD_RIGHT);
    let v = dir & (CD_UP | CD_DOWN);
    if (isHorzBar) {
        v = 0;
        if (!h) h = CD_RIGHT;
    } else if (isVertBar) {
        h = 0;
        if (!v) v = CD_UP;
    }
    if (!h && !v) return;
    if (v & CD_UP)    cursorUp(ev);
    if (v & CD_DOWN)  cursorDown(ev);
    if (h & CD_LEFT)  cursorLeft(ev);
    if (h & CD_RIGHT) cursorRight(ev);
}

// When the cursor currently spans a multi-cell selection, an unmodified
// arrow collapses to a single cell adjacent to the corresponding edge,
// anchored at the base (min) of the perpendicular axis — independent of
// which corner originally anchored the selection. Returns true if the
// collapse fired.
function _collapseSelectionForArrow(dir) {
    if (cursor.x1 === cursor.x2 && cursor.y1 === cursor.y2) return false;
    const i1 = Math.min(cursor.x1, cursor.x2);
    const i2 = Math.max(cursor.x1, cursor.x2);
    const j1 = Math.min(cursor.y1, cursor.y2);
    const j2 = Math.max(cursor.y1, cursor.y2);
    const w = cursor.selected_pattern.width;
    const h = cursor.selected_pattern.height;
    let x = i1, y = j1;
    if (dir === "right")     x = Math.min(i2 + 1, w - 1);
    else if (dir === "left") x = Math.max(i1 - 1, 0);
    else if (dir === "up")   y = Math.min(j2 + 1, h - 1);
    else if (dir === "down") y = Math.max(j1 - 1, 0);
    cursor.x1 = cursor.x2 = x;
    cursor.y1 = cursor.y2 = y;
    return true;
}

export function cursorUp(e) {
    if (e.shiftKey) {
        if (e.ctrlKey) {
            if (cursor.y1 === cursor.y2) {
                cursor.y2 += settings.unit_height - 1;
            } else if (cursor.y2 + settings.unit_height - 1 === cursor.y1) {
                cursor.y2 += settings.unit_height - 1;
            } else {
                cursor.y2 += settings.unit_height;
            }
        } else {
            cursor.y2++;
        }
        if (cursor.y2 >= cursor.selected_pattern.height) {
            cursor.y2 = cursor.selected_pattern.height - 1;
        }
    } else if (!_collapseSelectionForArrow("up")) {
        cursor.x1 = cursor.x2;
        if (e.ctrlKey) {
            cursor.y2 += settings.unit_height;
        } else {
            cursor.y2++;
        }
        if (cursor.y2 >= cursor.selected_pattern.height) {
            cursor.y2 = cursor.selected_pattern.height - 1;
        }
        cursor.y1 = cursor.y2;
    }
    const max_y = cursor.selected_view.offset_j + cursor.selected_view.height;
    if (cursor.y2 >= max_y) {
        const scroll_delta = cursor.y2 - max_y + 1;
        cursor.selected_view.scroll("v", scroll_delta);
    }
    _applyCursorLock();
    updateSelectionIcons();
    save_part_position();
    view.draw();
}

export function cursorDown(e) {
    if (e.shiftKey) {
        if (e.ctrlKey) {
            if (cursor.y1 === cursor.y2) {
                cursor.y2 -= settings.unit_height - 1;
            } else if (cursor.y1 + settings.unit_height - 1 === cursor.y2) {
                cursor.y2 -= settings.unit_height - 1;
            } else {
                cursor.y2 -= settings.unit_height;
            }
        } else {
            cursor.y2--;
        }
        if (cursor.y2 < 0) {
            cursor.y2 = 0;
        }
    } else if (!_collapseSelectionForArrow("down")) {
        cursor.x1 = cursor.x2;
        if (e.ctrlKey) {
            cursor.y2 -= settings.unit_height;
        } else {
            cursor.y2--;
        }
        if (cursor.y2 < 0) {
            cursor.y2 = 0;
        }
        cursor.y1 = cursor.y2;
    }
    const min_y = cursor.selected_view.offset_j;
    if (cursor.y2 < min_y) {
        const scroll_delta = cursor.y2 - min_y;
        cursor.selected_view.scroll("v", scroll_delta);
    }
    _applyCursorLock();
    updateSelectionIcons();
    save_part_position();
    view.draw();
}

export function cursorRight(e) {
    if (e.shiftKey) {
        if (e.ctrlKey) {
            if (cursor.x1 === cursor.x2) {
                cursor.x2 += settings.unit_width - 1;
            } else if (cursor.x2 + settings.unit_width - 1 == cursor.x1) {
                cursor.x2 += settings.unit_width - 1;
            } else {
                cursor.x2 += settings.unit_width;
            }
        } else {
            cursor.x2++;
        }
        if (cursor.x2 >= cursor.selected_pattern.width) {
            cursor.x2 = cursor.selected_pattern.width - 1;
        }
    } else if (!_collapseSelectionForArrow("right")) {
        if (e.ctrlKey) {
            cursor.x2 += settings.unit_width;
        } else {
            cursor.x2++;
        }
        if (cursor.x2 >= cursor.selected_pattern.width) {
            cursor.x2 = cursor.selected_pattern.width - 1;
        }
        cursor.x1 = cursor.x2;
        cursor.y1 = cursor.y2;
    }
    const max_x = cursor.selected_view.offset_i + cursor.selected_view.width;
    if (cursor.x2 >= max_x) {
        const scroll_delta = cursor.x2 - max_x + 1;
        cursor.selected_view.scroll("h", scroll_delta);
    }
    _applyCursorLock();
    updateSelectionIcons();
    save_part_position();
    view.draw();
}

export function cursorLeft(e) {
    if (e.shiftKey) {
        if (e.ctrlKey) {
            if (cursor.x1 + settings.unit_width - 1 === cursor.x2) {
                cursor.x2 -= settings.unit_width - 1;
            } else if (cursor.x1 == cursor.x2) {
                cursor.x2 -= settings.unit_width - 1;
            } else {
                cursor.x2 -= settings.unit_width;
            }
        } else {
            cursor.x2--;
        }
        if (cursor.x2 < 0) {
            cursor.x2 = 0;
        }
    } else if (!_collapseSelectionForArrow("left")) {
        if (e.ctrlKey) {
            cursor.x2 -= settings.unit_width;
        } else {
            cursor.x2--;
        }
        if (cursor.x2 < 0) {
            cursor.x2 = 0;
        }
        cursor.x1 = cursor.x2;
        cursor.y1 = cursor.y2;
    }
    const min_x = cursor.selected_view.offset_i;
    if (cursor.x2 < min_x) {
        const scroll_delta = cursor.x2 - min_x;
        cursor.selected_view.scroll("h", scroll_delta);
    }
    _applyCursorLock();
    updateSelectionIcons();
    save_part_position();
    view.draw();
}

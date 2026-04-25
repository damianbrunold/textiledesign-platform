"use strict";

// Keyboard shortcut dispatcher. One global keydown listener looks up a
// normalized combo ("Ctrl+Shift+S", "F4", "Alt+1", "h") in the registered
// bindings and invokes the bound action.
//
// Normalization rules:
//   - Modifiers in canonical order: Ctrl, Alt, Shift, Meta.
//   - Alphabetic keys are uppercased ("h" -> "H", "Ctrl+Z" -> "Ctrl+Z").
//   - Named keys kept as-is ("F4", "ArrowUp", "Delete", "Enter", "Tab", " ")
//   - Space is represented as "Space".
//   - "/" stays "/", "+", "-" likewise.
//
// Inputs with tagName INPUT/TEXTAREA or contenteditable receive key events
// untouched (we return before dispatching) so typing in dialogs isn't hijacked.

const Shortcuts = (function () {
    const bindings = new Map(); // combo -> actionId

    function normalize(combo) {
        if (!combo) return "";
        const parts = combo.split("+").map(s => s.trim()).filter(Boolean);
        const mods = { Ctrl: false, Alt: false, Shift: false, Meta: false };
        let key = null;
        for (const p of parts) {
            const lc = p.toLowerCase();
            if (lc === "ctrl" || lc === "control") mods.Ctrl = true;
            else if (lc === "alt") mods.Alt = true;
            else if (lc === "shift") mods.Shift = true;
            else if (lc === "meta" || lc === "cmd" || lc === "command") mods.Meta = true;
            else key = p;
        }
        if (!key) return "";
        if (key.length === 1 && /[a-z]/i.test(key)) key = key.toUpperCase();
        else if (key === " ") key = "Space";
        const out = [];
        if (mods.Ctrl) out.push("Ctrl");
        if (mods.Alt) out.push("Alt");
        if (mods.Shift) out.push("Shift");
        if (mods.Meta) out.push("Meta");
        out.push(key);
        return out.join("+");
    }

    function eventToCombo(e) {
        let key = e.key;
        if (key === " ") key = "Space";
        if (key.length === 1 && /[a-z]/i.test(key)) key = key.toUpperCase();
        const out = [];
        if (e.ctrlKey) out.push("Ctrl");
        if (e.altKey) out.push("Alt");
        if (e.shiftKey) out.push("Shift");
        if (e.metaKey) out.push("Meta");
        out.push(key);
        return out.join("+");
    }

    function bind(combo, actionId) {
        const n = normalize(combo);
        if (!n) return;
        bindings.set(n, actionId);
    }

    function bindAction(action) {
        if (action && action.shortcut) bind(action.shortcut, action.id);
    }

    function unbind(combo) {
        const n = normalize(combo);
        bindings.delete(n);
    }

    function lookup(e) {
        return bindings.get(eventToCombo(e));
    }

    function _isEditable(el) {
        if (!el) return false;
        if (el.isContentEditable) return true;
        const tag = el.tagName;
        return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    }

    function install() {
        window.addEventListener("keydown", (e) => {
            if (_isEditable(e.target)) return;
            const id = lookup(e);
            if (!id) return;
            const a = ActionRegistry.get(id);
            if (!a || (a.enabledWhen && !a.enabledWhen())) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            a.handler(e);
            ActionRegistry.notify();
        });
    }

    return { bind, bindAction, unbind, lookup, install, normalize };
})();

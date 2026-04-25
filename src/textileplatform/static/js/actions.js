"use strict";

// Action registry — single source of truth for everything the user can invoke
// in the editor. Menus, the keyboard shortcut dispatcher, and toolbars all
// read from this registry.
//
// Actions are registered with registerAction({ id, label, shortcut, handler,
// enabledWhen, checkedWhen, group }). `id` is a dotted identifier such as
// "edit.undo" or "view.zoom-in". Labels should be translated via gettext at
// the call site that produces them for the menu (we can't call gettext from
// JS — labels are set by the template and passed in).

const ActionRegistry = (function () {
    const actions = new Map();
    const listeners = [];

    function registerAction(action) {
        if (!action || !action.id) throw new Error("action.id required");
        actions.set(action.id, action);
    }

    function unregister(id) { actions.delete(id); }

    function get(id) { return actions.get(id); }

    function all() { return Array.from(actions.values()); }

    function invoke(id, ev) {
        const a = actions.get(id);
        if (!a) { console.warn("unknown action:", id); return false; }
        if (a.enabledWhen && !a.enabledWhen()) return false;
        a.handler(ev);
        notify();
        return true;
    }

    function isEnabled(id) {
        const a = actions.get(id);
        if (!a) return false;
        return a.enabledWhen ? !!a.enabledWhen() : true;
    }

    function isChecked(id) {
        const a = actions.get(id);
        if (!a) return false;
        return a.checkedWhen ? !!a.checkedWhen() : false;
    }

    // Observer — fires after any invoke() or external notify(). Menus refresh
    // their enabled/checked state on this.
    function subscribe(fn) {
        listeners.push(fn);
        return () => {
            const i = listeners.indexOf(fn);
            if (i >= 0) listeners.splice(i, 1);
        };
    }
    function notify() {
        for (const fn of listeners) {
            try { fn(); } catch (e) { console.error(e); }
        }
    }

    return { registerAction, unregister, get, all, invoke, isEnabled, isChecked, subscribe, notify };
})();

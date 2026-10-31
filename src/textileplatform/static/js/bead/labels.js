// Translated labels of the JBead editor's actions and menus, from the
// editor template's #tx-i18n block (ui/common.js editorI18n). Action
// ids contain dots, so they are single keys under `actions`.

import { editorI18n } from "../ui/common.js";

export function _actionLabel(id, fallback) {
    const a = editorI18n().actions[id];
    if (a && a.label) return a.label;
    return fallback != null ? fallback : id;
}

export function _menuLabel(id, fallback) {
    const m = editorI18n().menus[id];
    return m != null ? m : (fallback != null ? fallback : id);
}

// Per-user preferences of the JBead editor (the `jbead` subtree of the
// user settings): read from the template's #tx-user-settings block,
// written back to the server, debounced.

import { readonly } from "./state.js";

// ---- Per-user preferences (jbead subtree) -----------------------
//
// Server-rendered <script id="tx-user-settings"> JSON is the source of
// truth at page load; toggling a remembered view option updates the
// cache and PUTs the change back so new patterns inherit it. Existing
// patterns still load their own data.view first — prefs only fill in
// keys that aren't already specified.

let _jbeadPrefsCache = null;

export function _jbeadPrefsRead() {
    if (_jbeadPrefsCache) return _jbeadPrefsCache;
    let jb = {};
    try {
        const el = document.getElementById("tx-user-settings");
        if (el && el.textContent) {
            const all = JSON.parse(el.textContent);
            if (all && typeof all === "object" && all.jbead
                && typeof all.jbead === "object") {
                jb = all.jbead;
            }
        }
    } catch { /* fall through */ }
    _jbeadPrefsCache = jb;
    return _jbeadPrefsCache;
}

let _jbeadPrefsTimer = null;

export function _jbeadPrefsSave(partial) {
    _jbeadPrefsCache = Object.assign({}, _jbeadPrefsRead(), partial);
    if (readonly) return;
    // Debounced: zooming step by step would otherwise send one request
    // per step.
    clearTimeout(_jbeadPrefsTimer);
    _jbeadPrefsTimer = setTimeout(() => {
        fetch("/api/user/settings", {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jbead: _jbeadPrefsCache }),
        }).catch((e) => console.warn("settings save failed", e));
    }, 500);
}

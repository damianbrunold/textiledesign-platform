"use strict";

let data = null;
let modified = false;


function setModified() {
    modified = true;
    const m = document.getElementById("modified");
    if (m !== null) {
        m.className = "changed";
    }
    _scheduleDraftSave();
}


async function clearModified() {
    modified = false;
    const m = document.getElementById("modified");
    if (m !== null) {
        m.className = "unchanged";
    }
}


function togglePublic() {
    const el = document.getElementById("public");
    let state;
    // Modern markup: a text element (button/span) carrying the
    // 🔒 / 🌐 emoji, matching the user-private listing page.
    // Legacy markup: an <img> with src ending in icon-public/private.svg.
    if (el.tagName === "IMG") {
        if (el.src.endsWith("icon-public.svg")) {
            el.src = el.src.replace("-public", "-private");
            state = false;
        } else {
            el.src = el.src.replace("-private", "-public");
            state = true;
        }
    } else {
        const isPublic = el.textContent.indexOf("🌐") >= 0;
        state = !isPublic;
        el.textContent = state ? "🌐" : "🔒";
    }
    el.title = state
        ? el.dataset.titlePublic  || "Public - visible to all users"
        : el.dataset.titlePrivate || "Private - not visible to others";
    const user = document.getElementById("user").value;
    const pattern = document.getElementById("pattern").value;
    const request = {
        action: "set-publication-state",
        publication_state: state
    };
    fetch(`/api/pattern/${user}/${pattern}`, {
        method: "PUT",
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'follow',
        body: JSON.stringify(request)
    });
}


async function getPattern() {
    const user = document.getElementById("user").value;
    const pattern = document.getElementById("pattern").value;
    let response = await fetch(`/api/pattern/${user}/${pattern}`);
    let json_data = await response.json();
    data = json_data["pattern"];
}


// Editor-specific code may register this to produce thumbnail/preview
// PNG data URLs from the current `data` and runtime state. Returning
// null/undefined for a key just omits it from the save payload.
window.captureThumbnails = window.captureThumbnails || null;

async function _runCaptureThumbnails() {
    if (typeof window.captureThumbnails === "function") {
        try { return (await window.captureThumbnails(data)) || {}; }
        catch (e) { console.error("captureThumbnails failed", e); }
    }
    return {};
}


async function savePattern() {
    const user = document.getElementById("user").value;
    const pattern = document.getElementById("pattern").value;
    const thumbs = await _runCaptureThumbnails();
    const request = {
        action: "save-pattern",
        contents: data,
        thumbnail: thumbs.thumbnail || null,
        preview: thumbs.preview || null,
    };
    // CSRFProtect on HTTPS rejects with 400 if the Referer header is
    // missing (WTF_CSRF_SSL_STRICT). Don't override the document's
    // referrer policy here — the page sets `Referrer-Policy: same-origin`
    // already, which sends Referer for this same-origin call.
    const resp = await fetch(`/api/pattern/${user}/${pattern}`, {
        method: "PUT",
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'follow',
        body: JSON.stringify(request)
    });
    if (!resp.ok) {
        // Leave `modified` set so the user is still warned on
        // navigation and the next Save attempt isn't a no-op.
        throw new Error("save-failed:" + resp.status);
    }
    _clearDraft();
    await clearModified();
}


// ---- Local draft persistence ---------------------------------------
// Per-pattern JSON snapshot of the in-memory state, written to
// localStorage on every edit (debounced) and cleared after a confirmed
// successful save. On editor open, the editor calls maybeRecoverDraft
// between getPattern and init: if a local draft differs from what the
// server returned (e.g. the previous session crashed, the tab was
// closed before save, or the save failed silently), the user is asked
// whether to restore the local copy.
//
// The editor must register a `preSave` callback via installDraftAutosave
// that flushes the editor's working state into the `data` global —
// `data` is otherwise stale until the user actually triggers a save.

let _draftPreSave = null;
let _draftTimer = null;
const _DRAFT_DEBOUNCE_MS = 1000;

function installDraftAutosave(preSave) {
    _draftPreSave = preSave;
}

function _draftKey() {
    const u = document.getElementById("user");
    const p = document.getElementById("pattern");
    if (!u || !p) return null;
    return `textile-draft:${u.value}/${p.value}`;
}

function _writeDraftNow() {
    try {
        const k = _draftKey();
        if (!k || data == null) return;
        if (typeof _draftPreSave === "function") {
            try { _draftPreSave(); } catch (e) { console.error(e); }
        }
        const payload = { savedAt: Date.now(), contents: data };
        localStorage.setItem(k, JSON.stringify(payload));
    } catch (e) {
        // Quota exceeded, private mode, serialisation error, etc.
        // The draft is best-effort — never disrupt the editor.
        console.warn("draft save failed", e);
    }
}

function _scheduleDraftSave() {
    if (_draftTimer) return;
    _draftTimer = setTimeout(() => {
        _draftTimer = null;
        _writeDraftNow();
    }, _DRAFT_DEBOUNCE_MS);
}

function _clearDraft() {
    try {
        const k = _draftKey();
        if (k) localStorage.removeItem(k);
    } catch (e) { /* ignore */ }
}

function _readDraft() {
    try {
        const k = _draftKey();
        if (!k) return null;
        const raw = localStorage.getItem(k);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== "object" || obj.contents == null) return null;
        return obj;
    } catch (e) { return null; }
}

// Returns true if the user chose to recover (in which case `data` has
// been replaced with the draft contents). The caller is responsible
// for re-running setModified() after init clears it.
async function maybeRecoverDraft(prompts) {
    if (typeof readonly !== "undefined" && readonly) return false;
    const draft = _readDraft();
    if (!draft) return false;
    let serverJson, draftJson;
    try {
        serverJson = JSON.stringify(data);
        draftJson  = JSON.stringify(draft.contents);
    } catch (e) { return false; }
    if (serverJson === draftJson) {
        // Server already has the same content — nothing to recover.
        _clearDraft();
        return false;
    }
    const choice = await _askRecoverDraft(prompts || {});
    if (choice === "recover") {
        data = draft.contents;
        return true;
    }
    if (choice === "discard") {
        _clearDraft();
    }
    return false;
}

function _askRecoverDraft(prompts) {
    const labels = {
        title:   prompts.title   || "Recover unsaved changes?",
        body:    prompts.body    || "Local edits to this pattern from your last session were not saved on the server. Recover them?",
        recover: prompts.recover || "Recover",
        discard: prompts.discard || "Discard local edits",
        cancel:  prompts.cancel  || "Decide later",
    };
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.className = "navguard-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.innerHTML =
            '<div class="navguard-modal" role="document">'
            + '<h2></h2><p></p>'
            + '<div class="navguard-actions">'
            + '<button type="button" class="btn navguard-cancel"></button>'
            + '<button type="button" class="btn navguard-discard"></button>'
            + '<button type="button" class="btn primary navguard-save"></button>'
            + '</div></div>';
        const modal = overlay.querySelector(".navguard-modal");
        overlay.querySelector("h2").textContent = labels.title;
        overlay.querySelector("p").textContent  = labels.body;
        overlay.querySelector(".navguard-cancel").textContent  = labels.cancel;
        overlay.querySelector(".navguard-discard").textContent = labels.discard;
        overlay.querySelector(".navguard-save").textContent    = labels.recover;
        function close(result) {
            document.removeEventListener("keydown", onKey);
            overlay.remove();
            resolve(result);
        }
        function onKey(e) { if (e.key === "Escape") close("cancel"); }
        modal.addEventListener("click", (e) => e.stopPropagation());
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) close("cancel");
        });
        document.addEventListener("keydown", onKey);
        overlay.querySelector(".navguard-cancel")
            .addEventListener("click", () => close("cancel"));
        overlay.querySelector(".navguard-discard")
            .addEventListener("click", () => close("discard"));
        overlay.querySelector(".navguard-save")
            .addEventListener("click", () => close("recover"));
        document.body.appendChild(overlay);
        overlay.querySelector(".navguard-save").focus();
    });
}


// Best-effort save during page-unload. Uses fetch with keepalive: true,
// which is specifically designed to keep requests alive across document
// unload. (navigator.sendBeacon can't be used here because it only sends
// POST, but our save endpoint is PUT.)
function sendBeaconSave() {
    const user = document.getElementById("user").value;
    const pattern = document.getElementById("pattern").value;
    const body = JSON.stringify({ action: "save-pattern", contents: data });
    const url = `/api/pattern/${user}/${pattern}`;
    try {
        fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
            credentials: "same-origin",
        });
        return true;
    } catch (e) { return false; }
}


// Wire up F5/close protection. `preSave` should serialize in-memory editor
// state into the `data` global (e.g. saveSettings + savePatternData). The
// handler:
//   1. If modified, flushes a beacon save (best-effort, no await).
//   2. Sets the standard beforeunload prompt so the browser warns the user.
function installBeforeUnloadGuard(preSave) {
    window.addEventListener("beforeunload", (e) => {
        if (!modified) return;
        try { if (preSave) preSave(); } catch (err) { console.error(err); }
        sendBeaconSave();
        // Standard mechanism to trigger the browser's "leave site?" prompt.
        // The actual message text is not customizable in modern browsers.
        e.preventDefault();
        e.returnValue = "";
        return "";
    });
}


// Intercept in-app navigation (clicks on links, non-GET form submits)
// while the editor has unsaved changes, and show a localized modal
// asking the user whether to save, discard, or cancel. The native
// `beforeunload` prompt still fires for cases this can't reach (tab
// close, browser refresh/back) — see installBeforeUnloadGuard above.
//
//   prompts = {
//       title, body, save, discard, cancel,
//       saveFailed   // optional, shown via alert() on save error
//   }
// Browsers may restore this page from the back/forward cache when the
// user navigates back to the editor. The DOM is then preserved exactly
// as it was at unload — including any unsaved edits the user may have
// chosen to discard — while our `modified` flag has been cleared. To
// avoid that inconsistency, reload from the server on bfcache restore
// so the editor always reflects authoritative state.
window.addEventListener("pageshow", (e) => {
    if (e.persisted) window.location.reload();
});


function installNavGuard(preSave, prompts) {
    prompts = prompts || {};
    const labels = {
        title:   prompts.title   || "Unsaved changes",
        body:    prompts.body    || "You have unsaved changes. Save them before leaving this page?",
        save:    prompts.save    || "Save and continue",
        discard: prompts.discard || "Discard and continue",
        cancel:  prompts.cancel  || "Cancel",
        saveFailed: prompts.saveFailed || "Save failed. Please try again.",
    };
    function isInternal(href) {
        if (!href) return false;
        if (href.startsWith("#")) return false;
        if (href.startsWith("javascript:")) return false;
        if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
        try {
            const u = new URL(href, window.location.href);
            if (u.origin !== window.location.origin) return false;
            // Same path + same search = same page (just a hash change etc).
            if (u.pathname === window.location.pathname
                && u.search === window.location.search) return false;
            return true;
        } catch (e) { return false; }
    }
    function buildModal() {
        const overlay = document.createElement("div");
        overlay.className = "navguard-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.innerHTML =
            '<div class="navguard-modal" role="document">'
            + '<h2></h2><p></p>'
            + '<div class="navguard-actions">'
            + '<button type="button" class="btn navguard-cancel"></button>'
            + '<button type="button" class="btn navguard-discard"></button>'
            + '<button type="button" class="btn primary navguard-save"></button>'
            + '</div></div>';
        overlay.querySelector("h2").textContent = labels.title;
        overlay.querySelector("p").textContent = labels.body;
        overlay.querySelector(".navguard-cancel").textContent = labels.cancel;
        overlay.querySelector(".navguard-discard").textContent = labels.discard;
        overlay.querySelector(".navguard-save").textContent = labels.save;
        return overlay;
    }
    function ask(navigate) {
        const overlay = buildModal();
        const modal = overlay.querySelector(".navguard-modal");
        function close() {
            document.removeEventListener("keydown", onKey);
            overlay.remove();
        }
        function onKey(e) { if (e.key === "Escape") close(); }
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) close();
        });
        modal.addEventListener("click", (e) => e.stopPropagation());
        document.addEventListener("keydown", onKey);
        overlay.querySelector(".navguard-cancel")
            .addEventListener("click", close);
        overlay.querySelector(".navguard-discard")
            .addEventListener("click", () => {
                clearModified();
                close();
                navigate();
            });
        overlay.querySelector(".navguard-save")
            .addEventListener("click", async () => {
                try {
                    if (preSave) preSave();
                    await savePattern();
                } catch (err) {
                    console.error(err);
                    alert(labels.saveFailed);
                    return;
                }
                close();
                navigate();
            });
        document.body.appendChild(overlay);
        overlay.querySelector(".navguard-save").focus();
    }
    document.addEventListener("click", (e) => {
        if (!modified) return;
        if (e.defaultPrevented) return;
        if (e.button !== 0) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = e.target.closest("a");
        if (!a) return;
        if (a.target && a.target !== "" && a.target !== "_self") return;
        if (a.hasAttribute("download")) return;
        if (a.dataset.navguardSkip === "1") return;
        const href = a.getAttribute("href");
        if (!isInternal(href)) return;
        e.preventDefault();
        ask(() => { window.location.href = a.href; });
    }, true);
    document.addEventListener("submit", (e) => {
        if (!modified) return;
        if (e.defaultPrevented) return;
        const form = e.target;
        if (!form || form.tagName !== "FORM") return;
        if (form.dataset.navguardSkip === "1") return;
        const method = (form.method || "GET").toUpperCase();
        const action = form.getAttribute("action");
        if (method === "GET" && !isInternal(action)) return;
        e.preventDefault();
        ask(() => { form.submit(); });
    }, true);
}


async function clonePattern() {
    const user = document.getElementById("user").value;
    const viewer = document.getElementById("viewer").value;
    const pattern = document.getElementById("pattern").value;
    const request = {
        action: "clone-pattern",
        contents: data
    };
    const resp = await fetch(`/api/pattern/${user}/${pattern}`, {
        method: "PUT",
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'follow',
        body: JSON.stringify(request)
    });
    if (!resp.ok) {
        throw new Error("clone-failed:" + resp.status);
    }
    await gotoUser(viewer);
}


async function gotoUser(user) {
    window.location.href = "/" + user
}


function closePattern() {
    const origin = document.getElementById("origin").value;
    if (origin.startsWith("user-tab-")) {
        const user = document.getElementById("user").value;
        const groupName = origin.substring(9);
        window.location.href = "/" + user + "?group="
            + encodeURIComponent(groupName);
    } else if (origin.startsWith("group-")) {
        window.location.href = "/groups/" + origin.substring(6);
    } else if (origin.startsWith("groups-edit-")) {
        window.location.href = "/groups/edit/" + origin.substring(12);
    } else {
        const user = document.getElementById("user").value;
        window.location.href = "/" + user;
    }
}


function resizeWindow() {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;
    // Use canvas.clientWidth/Height directly so we account for sibling
    // flex children (e.g. the palette panel inside #container) and any
    // CSS-added borders. Setting bitmap = client size keeps mouse-event
    // offsetX/Y in 1:1 correspondence with bitmap pixels — otherwise
    // the lower panes' clicks land one row off after a chrome reflow.
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    if (typeof view !== "undefined" && view) {
        view.layout();
        view.draw();
    }
}

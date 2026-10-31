"use strict";

// Shared editor plumbing for the DB-WEAVE and JBead editors: loading,
// saving, the modified flag, local drafts, navigation guards, and the
// startup sequence (startEditor).

let data = null;
let modified = false;
// Server modification time of the pattern version `data` was loaded
// from or last saved as (ISO string). Drafts record it so a draft based
// on an older version can be recognised.
let patternModified = null;

// Bumped by every setModified(); a save only clears the modified flag
// if no edit happened while it was in flight.
let _editSeq = 0;
// Flushes the editor's working state into `data` (registered by
// startEditor for editable patterns).
let _editorPreSave = null;
// The editor's CommandBus, for saved-state tracking (trackSavedState).
let _editorBus = null;


function setModified() {
    modified = true;
    _editSeq++;
    const m = document.getElementById("modified");
    if (m !== null) {
        m.className = "changed";
    }
    _scheduleDraftSave();
}


// The editor matches the server again (saved, reverted, discarded or
// undone back to the saved state), so any local draft is obsolete.
function clearModified() {
    modified = false;
    _cancelDraftSave();
    _clearDraft();
    const m = document.getElementById("modified");
    if (m !== null) {
        m.className = "unchanged";
    }
}


function _patternUrl() {
    const user = document.getElementById("user").value;
    const pattern = document.getElementById("pattern").value;
    return `/api/pattern/${user}/${pattern}`;
}


function _putPattern(request, extra) {
    // CSRFProtect on HTTPS rejects with 400 if the Referer header is
    // missing (WTF_CSRF_SSL_STRICT). Don't override the document's
    // referrer policy here — the page sets `Referrer-Policy: same-origin`
    // already, which sends Referer for this same-origin call.
    return fetch(_patternUrl(), Object.assign({
        method: "PUT",
        cache: "no-cache",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
    }, extra || {}));
}


// ---- i18n ----------------------------------------------------------

let _editorI18nCache = null;

// The #tx-i18n JSON block of the editor templates, parsed once.
function editorI18n() {
    if (_editorI18nCache === null) {
        _editorI18nCache = { actions: {}, menus: {}, prompts: {} };
        const el = document.getElementById("tx-i18n");
        if (el) {
            try {
                _editorI18nCache = Object.assign(
                    _editorI18nCache, JSON.parse(el.textContent));
            } catch (e) { console.error("tx-i18n parse failed", e); }
        }
    }
    return _editorI18nCache;
}

function _prompt(key, fallback) {
    const p = editorI18n().prompts || {};
    return p[key] || fallback;
}

function _actionText(id, fallback) {
    const a = (editorI18n().actions || {})[id];
    return (a && a.label) || fallback;
}


// ---- Load / save -----------------------------------------------------

async function getPattern() {
    const resp = await fetch(_patternUrl(), { cache: "no-cache" });
    if (!resp.ok) throw new Error("load-failed:" + resp.status);
    const json = await resp.json();
    data = json["pattern"];
    patternModified = json["modified"] || null;
}


// Editor-specific code may register this to produce thumbnail/preview
// PNG data URLs from the current `data` and runtime state. Keys that
// are present (even with a null value) are sent; a failed capture
// returns nothing, so the stored images are left untouched.
window.captureThumbnails = window.captureThumbnails || null;

async function _runCaptureThumbnails(contents) {
    if (typeof window.captureThumbnails === "function") {
        try { return (await window.captureThumbnails(contents)) || {}; }
        catch (e) { console.error("captureThumbnails failed", e); }
    }
    return {};
}


// Save the current editor state. Throws on failure (the editor stays
// modified). If the user kept editing while the request was in flight,
// the editor stays modified too — only the state at the start of the
// save reached the server.
async function savePattern() {
    if (_editorPreSave) _editorPreSave();
    const seq = _editSeq;
    const savedTop = _editorBus ? _editorBus.top() : null;
    const contents = structuredClone(data);
    const thumbs = await _runCaptureThumbnails(contents);
    const request = { action: "save-pattern", contents };
    if ("thumbnail" in thumbs) request.thumbnail = thumbs.thumbnail || null;
    if ("preview" in thumbs) request.preview = thumbs.preview || null;
    const resp = await _putPattern(request);
    if (!resp.ok) {
        throw new Error("save-failed:" + resp.status);
    }
    try {
        patternModified = (await resp.json()).modified || patternModified;
    } catch (e) { /* older server: no timestamp in the reply */ }
    if (_editorBus) _editorBus.markSaved(savedTop);
    if (seq === _editSeq) {
        clearModified();
    } else {
        // Keep the newer edits in the draft.
        _scheduleDraftSave();
    }
}


// Wire a CommandBus into the modified flag: undo/redo back to the saved
// state clears it, any other position sets it.
function trackSavedState(bus) {
    _editorBus = bus;
    bus.subscribe((b) => {
        if (b.isAtSavedState()) clearModified();
        else setModified();
    });
}


// ---- Local draft persistence ---------------------------------------
// Per-pattern JSON snapshot of the in-memory state, written to
// localStorage on every edit (debounced) and when the page is left
// with unsaved changes; removed whenever the editor matches the server
// again. On editor open, startEditor offers to restore a draft that
// differs from what the server returned.

let _draftTimer = null;
const _DRAFT_DEBOUNCE_MS = 1000;

function _draftKey() {
    const u = document.getElementById("user");
    const p = document.getElementById("pattern");
    if (!u || !p) return null;
    return `textile-draft:${u.value}/${p.value}`;
}

function _writeDraftNow() {
    try {
        const k = _draftKey();
        if (!k || data == null || !modified) return;
        if (_editorPreSave) {
            try { _editorPreSave(); } catch (e) { console.error(e); }
        }
        const payload = {
            savedAt: Date.now(),
            base: patternModified,
            contents: data,
        };
        localStorage.setItem(k, JSON.stringify(payload));
    } catch (e) {
        // Quota exceeded, private mode, serialisation error, etc.
        // The draft is best-effort — never disrupt the editor.
        console.warn("draft save failed", e);
    }
}

function _scheduleDraftSave() {
    if (_draftTimer || !_editorPreSave) return;
    _draftTimer = setTimeout(() => {
        _draftTimer = null;
        _writeDraftNow();
    }, _DRAFT_DEBOUNCE_MS);
}

function _cancelDraftSave() {
    if (_draftTimer) {
        clearTimeout(_draftTimer);
        _draftTimer = null;
    }
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
// been replaced with the draft contents).
async function maybeRecoverDraft(prompts) {
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
    // A draft based on an older server version (the pattern was saved
    // elsewhere since) would overwrite those newer changes.
    const stale = !!(draft.base && patternModified
                     && draft.base !== patternModified);
    const choice = await _threeButtonDialog({
        title:   prompts.title   || "Recover unsaved changes?",
        body:    stale
            ? (prompts.staleBody || "These local edits are based on an older version of the pattern, which has been saved again since. Recovering them replaces the newer version when you save.")
            : (prompts.body || "Local edits to this pattern from your last session were not saved on the server. Recover them?"),
        primary: prompts.recover || "Recover",
        middle:  prompts.discard || "Discard local edits",
        cancel:  prompts.cancel  || "Decide later",
    });
    if (choice === "primary") {
        data = draft.contents;
        return true;
    }
    if (choice === "middle") {
        _clearDraft();
    }
    return false;
}


// Modal with cancel / middle / primary buttons; resolves to "cancel",
// "middle" or "primary". `onPrimary` (optional, async) runs before the
// dialog closes; if it returns false the dialog stays open.
function _threeButtonDialog(labels, onPrimary) {
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
        overlay.querySelector(".navguard-discard").textContent = labels.middle;
        overlay.querySelector(".navguard-save").textContent    = labels.primary;
        function close(result) {
            document.removeEventListener("keydown", onKey, true);
            overlay.remove();
            resolve(result);
        }
        function onKey(e) {
            // The dialog owns the keyboard while it is open.
            e.stopPropagation();
            if (e.key === "Escape") close("cancel");
        }
        modal.addEventListener("click", (e) => e.stopPropagation());
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) close("cancel");
        });
        document.addEventListener("keydown", onKey, true);
        overlay.querySelector(".navguard-cancel")
            .addEventListener("click", () => close("cancel"));
        overlay.querySelector(".navguard-discard")
            .addEventListener("click", () => close("middle"));
        const primary = overlay.querySelector(".navguard-save");
        primary.addEventListener("click", async () => {
            if (onPrimary) {
                primary.disabled = true;
                const ok = await onPrimary();
                primary.disabled = false;
                if (ok === false) return;
            }
            close("primary");
        });
        document.body.appendChild(overlay);
        primary.focus();
    });
}


// True while any editor dialog is open; keyboard shortcuts must not
// reach the pattern behind it.
function editorDialogOpen() {
    if (typeof Modal !== "undefined" && Modal.topmost()) return true;
    return document.querySelector(".navguard-overlay") !== null;
}


// ---- Leaving the editor --------------------------------------------

// Tab close / reload / back with unsaved changes: keep them in the local
// draft (offered for recovery next time) and let the browser ask. The
// changes are not sent to the server — the user may be leaving
// precisely to throw them away.
function installBeforeUnloadGuard() {
    window.addEventListener("beforeunload", (e) => {
        if (!modified) return;
        _cancelDraftSave();
        _writeDraftNow();
        e.preventDefault();
        e.returnValue = "";
        return "";
    });
}


// Browsers may restore this page from the back/forward cache when the
// user navigates back to the editor. The DOM is then preserved exactly
// as it was at unload — including any unsaved edits the user may have
// chosen to discard — while our `modified` flag has been cleared. To
// avoid that inconsistency, reload from the server on bfcache restore
// so the editor always reflects authoritative state.
window.addEventListener("pageshow", (e) => {
    if (e.persisted) window.location.reload();
});


// Save / discard / cancel before leaving. Resolves to true if the
// caller may navigate away.
async function _confirmLeave(labels) {
    if (!modified) return true;
    const choice = await _threeButtonDialog(labels, async () => {
        try {
            await savePattern();
            return true;
        } catch (err) {
            console.error(err);
            alert(_prompt("saveFailed", "Save failed. Please try again."));
            return false;
        }
    });
    if (choice === "middle") {
        clearModified();
        return true;
    }
    return choice === "primary";
}


function _navLabels() {
    return {
        title:   _prompt("title", "Unsaved changes"),
        body:    _prompt("body", "You have unsaved changes. Save them before leaving this page?"),
        primary: _prompt("save", "Save and continue"),
        middle:  _prompt("discard", "Discard and continue"),
        cancel:  _prompt("cancel", "Cancel"),
    };
}


// Intercept in-app navigation (clicks on links, non-GET form submits)
// while the editor has unsaved changes and ask whether to save, discard,
// or cancel. installBeforeUnloadGuard covers what this can't reach
// (tab close, browser refresh/back).
function installNavGuard() {
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
    async function guard(navigate) {
        if (await _confirmLeave(_navLabels())) navigate();
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
        guard(() => { window.location.href = a.href; });
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
        guard(() => { form.submit(); });
    }, true);
}


// The editors' Close command: asks to save or discard unsaved changes
// (desktop confirm-on-close), then returns to where the editor was
// opened from.
async function closePatternGuarded() {
    const ok = (typeof readonly !== "undefined" && readonly) || await _confirmLeave({
        title:   _actionText("file.close-title", "Close pattern"),
        body:    _actionText("file.close-prompt",
                             "The pattern has unsaved changes. Save before closing?"),
        primary: _actionText("file.save", "Save"),
        middle:  _actionText("file.discard", "Don't save"),
        cancel:  _actionText("btn.cancel", "Cancel"),
    });
    if (ok) closePattern();
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


// ---- Toolbar actions -------------------------------------------------

async function togglePublic() {
    const el = document.getElementById("public");
    const state = el.textContent.indexOf("🌐") < 0;
    let ok = false;
    try {
        const resp = await _putPattern({
            action: "set-publication-state",
            publication_state: state,
        });
        ok = resp.ok;
    } catch (e) { console.error(e); }
    if (!ok) {
        alert(_prompt("saveFailed", "Save failed. Please try again."));
        return;
    }
    el.textContent = state ? "🌐" : "🔒";
    el.title = state
        ? el.dataset.titlePublic  || "Public - visible to all users"
        : el.dataset.titlePrivate || "Private - not visible to others";
}


async function clonePattern() {
    try {
        if (_editorPreSave) _editorPreSave();
        const resp = await _putPattern({
            action: "clone-pattern",
            contents: data,
        });
        if (!resp.ok) {
            // The server explains refusals it expects (e.g. no free
            // name for the copy).
            let message = null;
            try { message = (await resp.json()).message; } catch (e) { /* not JSON */ }
            const err = new Error("clone-failed:" + resp.status);
            err.userMessage = resp.status === 409 ? message : null;
            throw err;
        }
    } catch (e) {
        console.error(e);
        alert(e.userMessage
              || _prompt("cloneFailed", "The pattern could not be cloned."));
        return;
    }
    window.location.href = "/" + document.getElementById("viewer").value;
}


// POST `body` to /<user>/<pattern>/<route> (export/<fmt> or print) and
// save the returned file. On failure show `failMessage`, plus the
// server's short reason when it sent one as plain text (size limits).
async function downloadRendered(route, body, fallbackName, failMessage) {
    const user = document.getElementById("user").value;
    const pattern = document.getElementById("pattern").value;
    const url = `/${encodeURIComponent(user)}/${encodeURIComponent(pattern)}/${route}`;
    let blob, filename;
    try {
        const resp = await fetch(url, {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!resp.ok) {
            const type = resp.headers.get("Content-Type") || "";
            const reason = type.startsWith("text/plain")
                ? (await resp.text()).slice(0, 300) : "";
            alert(reason ? `${failMessage}\n\n${reason}` : failMessage);
            return;
        }
        const cd = resp.headers.get("Content-Disposition") || "";
        const m = /filename="?([^";]+)"?/i.exec(cd);
        filename = (m && m[1]) || fallbackName;
        blob = await resp.blob();
    } catch (e) {
        console.error(e);
        alert(failMessage);
        return;
    }
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking right away can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(objUrl), 10000);
}


// ---- Startup ---------------------------------------------------------

// Common editor startup. Expects the global `readonly` to be set.
//   preSave: flushes the editor's working state into `data`
//   init:    builds the editor from `data` (may be async); must call
//            trackSavedState(commandBus) for editable patterns
async function startEditor({ preSave, init }) {
    if (!readonly) {
        // Before any edit can fire, so draft writes capture fresh data.
        _editorPreSave = preSave;
        installBeforeUnloadGuard();
        installNavGuard();
        const pub = document.getElementById("public");
        if (pub) pub.addEventListener("click", togglePublic);
    }
    const clone = document.getElementById("clone");
    if (clone) clone.addEventListener("click", clonePattern);
    document.getElementById("close")
        .addEventListener("click", closePatternGuarded);

    try {
        await getPattern();
    } catch (e) {
        console.error(e);
        alert(_prompt("loadFailed",
            "The pattern could not be loaded. Please reload the page."));
        return;
    }
    const recovered = !readonly
        && await maybeRecoverDraft(_prompt("draft", {}));
    await init();
    if (recovered) {
        // The recovered state is not on the server: no undo position
        // matches it, and it counts as modified.
        if (_editorBus) _editorBus.markUnsaved();
        setModified();
    }

    // Save once after load: the upload flow uses this to store the
    // thumbnail and the auto-detected rapport without a manual save.
    const params = new URLSearchParams(window.location.search);
    if (!readonly && params.get("autosave") === "1") {
        params.delete("autosave");
        history.replaceState(null, "", window.location.pathname
            + (params.toString() ? "?" + params : ""));
        // Defer one tick so layout/draw have settled.
        setTimeout(() => {
            savePattern().catch((e) => console.error("autosave failed", e));
        }, 100);
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

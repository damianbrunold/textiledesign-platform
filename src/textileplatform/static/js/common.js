"use strict";

let data = null;
let modified = false;


function setModified() {
    modified = true;
    const m = document.getElementById("modified");
    if (m !== null) {
        m.className = "changed";
    }
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
        referrerPolicy: 'no-referrer',
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
    await fetch(`/api/pattern/${user}/${pattern}`, {
        method: "PUT",
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify(request)
    });
    await clearModified();
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
    let bypass = false;
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
                bypass = true;
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
                bypass = true;
                navigate();
            });
        document.body.appendChild(overlay);
        overlay.querySelector(".navguard-save").focus();
    }
    document.addEventListener("click", (e) => {
        if (!modified || bypass) return;
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
        if (!modified || bypass) return;
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
    await fetch(`/api/pattern/${user}/${pattern}`, {
        method: "PUT",
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify(request)
    });
    await gotoUser(viewer);
}


async function gotoUser(user) {
    window.location.href = "/" + user
}


function closePattern() {
    const origin = document.getElementById("origin").value;
    if (origin.startsWith("group-")) {
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

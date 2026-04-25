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
    const icon = document.getElementById("public");
    let state = undefined;
    if (icon.src.endsWith("icon-public.svg")) {
        icon.src = icon.src.replace("-public", "-private");
        icon.title = "Private - not visible to others"; // TODO translate!
        state = false;
    } else {
        icon.src = icon.src.replace("-private", "-public");
        icon.title = "Public - visible to all users"; // TODO translate!
        state = true;
    }
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


async function savePattern() {
    const user = document.getElementById("user").value;
    const pattern = document.getElementById("pattern").value;
    const request = {
        action: "save-pattern",
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

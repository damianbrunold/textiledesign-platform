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
    const container = document.getElementById("container");
    canvas.width = container.clientWidth - 2;
    canvas.height = container.clientHeight - 2;
    // relayout and redraw the specialized view instance
    view.layout();
    view.draw();
}

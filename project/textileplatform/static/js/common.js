"use strict";

let data = null;


function togglePublic() {
    const state = document.getElementById("public").checked;
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
}
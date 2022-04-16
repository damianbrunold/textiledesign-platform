window.addEventListener("load", () => {
    document.getElementById("public").addEventListener("click", togglePublic);
});

function togglePublic(e) {
    state = document.getElementById("public").checked;
    console.log(state);
    request = {
        user: document.getElementById("user").value,
        pattern: document.getElementById("pattern").value,
        publication_state: state
    };
    fetch("/api/pattern/publish", {
        method: "POST",
        mode: 'cors',
        cache: 'no-cache',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify(request)
    });
};


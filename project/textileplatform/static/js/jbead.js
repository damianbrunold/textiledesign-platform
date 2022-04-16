"use strict";

window.addEventListener("load", () => {
    getPattern();
    document.getElementById("public").addEventListener("click", togglePublic);
    document.getElementById("save").addEventListener("click", savePattern);
    document.getElementById("close").addEventListener("click", function() { window.history.back() });
});

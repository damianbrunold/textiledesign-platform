"use strict";

// Fetches one of the public legal pages (/terms, /privacy, /imprint),
// extracts the <article class="legal"> body, and shows it in a Modal.
// Used from the editors so opening the document does not navigate away
// and discard pending edits.

const LegalDialog = (function () {
    function _extractTitle(doc, fallback) {
        const h = doc.querySelector("section.content header h2, header h2, h2");
        return (h && h.textContent.trim()) || fallback;
    }

    function open(url, fallbackTitle, okLabel) {
        const placeholder = document.createElement("div");
        placeholder.className = "tx-menu-legal-body";
        placeholder.textContent = "…";

        const modal = Modal.open({
            title: fallbackTitle,
            body: placeholder,
            buttons: [{ label: okLabel || "OK", role: "primary" }],
        });

        fetch(url, { credentials: "same-origin" })
            .then(r => r.text())
            .then(html => {
                const doc = new DOMParser().parseFromString(html, "text/html");
                const article = doc.querySelector("article.legal");
                placeholder.innerHTML = "";
                if (article) {
                    placeholder.appendChild(article);
                } else {
                    placeholder.textContent = "(content unavailable)";
                }
                const title = _extractTitle(doc, fallbackTitle);
                const header = modal.root.querySelector(".tx-modal-header");
                if (header) header.textContent = title;
            })
            .catch(() => {
                placeholder.textContent = "(failed to load)";
            });

        return modal;
    }

    return { open };
})();

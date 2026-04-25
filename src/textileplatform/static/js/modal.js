"use strict";

// Minimal modal dialog primitive. Vanilla DOM, no dependencies.
//
// Usage:
//   const m = Modal.open({
//     title: "...",
//     body: domElementOrHtmlString,
//     buttons: [
//       { label: "Cancel", role: "cancel" },
//       { label: "OK", role: "primary", onClick: (modal) => { ...; modal.close(); } },
//     ],
//     onClose: () => { ... },
//   });
//   // later: m.close();
//
// Features:
//   - Focus trap (Tab/Shift+Tab cycle stays inside).
//   - ESC closes (invokes the cancel button if present, else just closes).
//   - Click on backdrop closes (same semantics).
//   - Stacking supported (multiple modals).

const Modal = (function () {
    let _stack = [];

    function _trapFocus(root, e) {
        if (e.key !== "Tab") return;
        const focusables = root.querySelectorAll(
            "a[href], button:not([disabled]), textarea:not([disabled]), " +
            "input:not([disabled]):not([type=hidden]), select:not([disabled]), " +
            "[tabindex]:not([tabindex='-1'])");
        if (focusables.length === 0) { e.preventDefault(); return; }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            last.focus(); e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
            first.focus(); e.preventDefault();
        }
    }

    function open(opts) {
        opts = opts || {};
        const backdrop = document.createElement("div");
        backdrop.className = "tx-modal-backdrop";

        const dialog = document.createElement("div");
        dialog.className = "tx-modal";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        if (opts.className) dialog.classList.add(opts.className);

        if (opts.title) {
            const header = document.createElement("div");
            header.className = "tx-modal-header";
            header.textContent = opts.title;
            dialog.appendChild(header);
        }

        const body = document.createElement("div");
        body.className = "tx-modal-body";
        if (opts.body instanceof Node) {
            body.appendChild(opts.body);
        } else if (typeof opts.body === "string") {
            body.innerHTML = opts.body;
        }
        dialog.appendChild(body);

        const footer = document.createElement("div");
        footer.className = "tx-modal-footer";
        const btnEls = [];
        (opts.buttons || []).forEach(b => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = b.label;
            if (b.role) btn.dataset.role = b.role;
            btn.className = "tx-modal-btn" + (b.role ? " tx-modal-btn-" + b.role : "");
            btn.addEventListener("click", (ev) => {
                if (b.onClick) b.onClick(api, ev);
                else api.close();
            });
            btnEls.push(btn);
            footer.appendChild(btn);
        });
        if (btnEls.length) dialog.appendChild(footer);

        backdrop.appendChild(dialog);

        const prevActive = document.activeElement;
        const onKey = (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                const cancelBtn = btnEls.find(b => b.dataset.role === "cancel");
                if (cancelBtn) cancelBtn.click();
                else api.close();
                return;
            }
            if (e.key === "Enter") {
                // Plain Enter triggers the primary button — like a form's
                // default submit. Skip when the focus is on something that
                // legitimately wants Enter (textarea, contenteditable, the
                // primary button itself, or a button about to fire), or
                // when modifier keys are held (Ctrl+Enter etc.).
                const t = e.target;
                const tag = t && t.tagName;
                if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
                if (tag === "TEXTAREA" || (t && t.isContentEditable)) return;
                if (tag === "BUTTON" || tag === "A") return;
                if (tag === "SELECT") return;
                const primary = btnEls.find(b => b.dataset.role === "primary");
                if (primary) {
                    e.preventDefault();
                    primary.click();
                }
                return;
            }
            _trapFocus(dialog, e);
        };
        backdrop.addEventListener("keydown", onKey);
        backdrop.addEventListener("mousedown", (e) => {
            if (e.target === backdrop) {
                const cancelBtn = btnEls.find(b => b.dataset.role === "cancel");
                if (cancelBtn) cancelBtn.click();
                else api.close();
            }
        });

        document.body.appendChild(backdrop);

        const api = {
            root: dialog,
            body,
            backdrop,
            close() {
                if (api._closed) return;
                api._closed = true;
                backdrop.removeEventListener("keydown", onKey);
                backdrop.remove();
                const idx = _stack.indexOf(api);
                if (idx >= 0) _stack.splice(idx, 1);
                if (prevActive && prevActive.focus) {
                    try { prevActive.focus(); } catch (e) { /* ignore */ }
                }
                if (opts.onClose) opts.onClose();
            },
        };
        _stack.push(api);

        // Focus the first focusable element (or the primary button).
        setTimeout(() => {
            const first = dialog.querySelector(
                "input:not([type=hidden]), textarea, select, " +
                "button.tx-modal-btn-primary, button, a[href], [tabindex]");
            if (first) first.focus();
        }, 0);

        return api;
    }

    function topmost() { return _stack.length ? _stack[_stack.length - 1] : null; }

    return { open, topmost };
})();

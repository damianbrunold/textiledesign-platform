"use strict";

// DOM menu bar — renders a declarative menu tree as classic desktop-style
// menubar + dropdowns, driven by the ActionRegistry.
//
// Menu tree shape:
//   [
//     { label: "File", items: [
//         { action: "file.new" },
//         { action: "file.open" },
//         { separator: true },
//         { label: "Export", items: [ ... ] },
//       ] },
//     ...
//   ]
//
// For each item, the action's registered `label`, `shortcut`, `enabledWhen`,
// and `checkedWhen` are read from ActionRegistry. A `label` override on the
// item can replace the default. Use `{ separator: true }` for a divider.

const Menu = (function () {
    let openSubmenu = null;
    let rootEl = null;
    let currentTree = [];

    function _formatShortcut(s) {
        if (!s) return "";
        // Normalize common key names for display
        return s.replace(/\bArrowUp\b/g, "↑")
                .replace(/\bArrowDown\b/g, "↓")
                .replace(/\bArrowLeft\b/g, "←")
                .replace(/\bArrowRight\b/g, "→")
                .replace(/\bSpace\b/g, "Space");
    }

    function _buildItem(item) {
        if (item.separator) {
            const sep = document.createElement("div");
            sep.className = "tx-menu-separator";
            return sep;
        }
        if (item.items) {
            // Nested submenu
            const wrap = document.createElement("div");
            wrap.className = "tx-menu-item tx-menu-has-sub";
            const lbl = document.createElement("span");
            lbl.className = "tx-menu-label";
            lbl.textContent = item.label || "";
            wrap.appendChild(lbl);
            const arrow = document.createElement("span");
            arrow.className = "tx-menu-arrow";
            arrow.textContent = "▸";
            wrap.appendChild(arrow);
            const sub = document.createElement("div");
            sub.className = "tx-menu-dropdown tx-menu-submenu";
            for (const child of item.items) sub.appendChild(_buildItem(child));
            wrap.appendChild(sub);
            const openSub = () => {
                // Close sibling open submenus
                const parent = wrap.parentElement;
                if (parent) {
                    parent.querySelectorAll(":scope > .tx-menu-has-sub.open").forEach(el => {
                        if (el !== wrap) el.classList.remove("open");
                    });
                }
                wrap.classList.add("open");
            };
            wrap.addEventListener("mouseenter", openSub);
            // Tap-to-open for touch: clicking on the parent row of a
            // submenu opens (or toggles) it instead of doing nothing.
            // Stop propagation so the document-level click handler
            // doesn't immediately close the whole menu.
            wrap.addEventListener("click", (e) => {
                // Only intercept clicks directly on this wrapper (label /
                // arrow), not bubbled clicks from leaf items inside the
                // submenu.
                if (e.target.closest(".tx-menu-item") !== wrap) return;
                e.stopPropagation();
                if (wrap.classList.contains("open")) {
                    wrap.classList.remove("open");
                } else {
                    openSub();
                }
            });
            if (typeof item.visibleWhen === "function") {
                wrap._visibleWhen = item.visibleWhen;
            }
            return wrap;
        }
        const action = item.action ? ActionRegistry.get(item.action) : null;
        const el = document.createElement("div");
        el.className = "tx-menu-item";
        if (action && action.id) el.dataset.action = action.id;
        const lbl = document.createElement("span");
        lbl.className = "tx-menu-label";
        lbl.textContent = item.label || (action && action.label) || "(no label)";
        el.appendChild(lbl);
        if (action && action.shortcut) {
            const sc = document.createElement("span");
            sc.className = "tx-menu-shortcut";
            sc.textContent = _formatShortcut(action.shortcut);
            el.appendChild(sc);
        }
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (action) {
                if (action.enabledWhen && !action.enabledWhen()) return;
                ActionRegistry.invoke(action.id, e);
            }
            closeAll();
        });
        return el;
    }

    function _refreshStates() {
        if (!rootEl) return;
        rootEl.querySelectorAll(".tx-menu-item[data-action]").forEach(el => {
            const id = el.dataset.action;
            const enabled = ActionRegistry.isEnabled(id);
            el.classList.toggle("tx-disabled", !enabled);
            const checked = ActionRegistry.isChecked(id);
            el.classList.toggle("tx-checked", !!checked);
        });
        // Evaluate visibleWhen on every top-level menu entry.
        rootEl.querySelectorAll(".tx-menu-top").forEach(el => {
            if (typeof el._visibleWhen === "function") {
                el.style.display = el._visibleWhen() ? "" : "none";
            }
        });
        // ...and on every nested submenu wrapper that opted in.
        rootEl.querySelectorAll(".tx-menu-has-sub").forEach(el => {
            if (typeof el._visibleWhen === "function") {
                el.style.display = el._visibleWhen() ? "" : "none";
            }
        });
    }

    function render(mountEl, tree) {
        rootEl = mountEl;
        currentTree = tree;
        mountEl.innerHTML = "";
        mountEl.classList.add("tx-menubar");
        tree.forEach(topItem => {
            const top = document.createElement("div");
            top.className = "tx-menu-top";
            const lbl = document.createElement("span");
            lbl.textContent = topItem.label;
            top.appendChild(lbl);

            const dd = document.createElement("div");
            dd.className = "tx-menu-dropdown";
            (topItem.items || []).forEach(it => dd.appendChild(_buildItem(it)));
            top.appendChild(dd);

            top.addEventListener("click", (e) => {
                e.stopPropagation();
                if (openSubmenu === top) {
                    closeAll();
                } else {
                    closeAll();
                    top.classList.add("open");
                    openSubmenu = top;
                    _refreshStates();
                }
            });
            top.addEventListener("mouseenter", () => {
                if (openSubmenu && openSubmenu !== top) {
                    openSubmenu.classList.remove("open");
                    top.classList.add("open");
                    openSubmenu = top;
                    _refreshStates();
                }
            });
            // Optional visibleWhen on a top-level menu: hides it (CSS
            // display:none) when the predicate returns false. Re-evaluated
            // by _refreshStates on every ActionRegistry notification.
            if (typeof topItem.visibleWhen === "function") {
                top._visibleWhen = topItem.visibleWhen;
            }
            mountEl.appendChild(top);
        });

        if (!Menu._documentHandlerInstalled) {
            Menu._documentHandlerInstalled = true;
            document.addEventListener("click", closeAll);
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && openSubmenu) closeAll();
            });
        }

        ActionRegistry.subscribe(_refreshStates);
        _refreshStates();
    }

    function closeAll() {
        if (rootEl) {
            rootEl.querySelectorAll(".tx-menu-top.open").forEach(el => el.classList.remove("open"));
            rootEl.querySelectorAll(".tx-menu-has-sub.open").forEach(el => el.classList.remove("open"));
        }
        openSubmenu = null;
    }

    return { render, closeAll, _refreshStates };
})();

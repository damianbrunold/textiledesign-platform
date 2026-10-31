// User-defined patterns (the "Additional" menu): stored snippets of a
// pattern that can be inserted at the cursor.

import { ActionRegistry } from "../ui/actions.js";
import { editorI18n } from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import { _fullSnapCommand } from "./history.js";
import { cursor, pattern, readonly, settings } from "./state.js";

// ---- Phase 8f: User-defined patterns ("Additional" menu) ------------
//
// Direct port of userdef.cpp. 10 slots persisted in localStorage as
// (description, sizex, sizey, data). Data is the desktop's k-alphabet
// (cell value s → char(s + 'k') so 'k' = empty, 'l' = range 1, …).

const USERDEF_KEY = "tx_dbweave_userdef_v1";
const USERDEF_K_CHAR = 107; // 'k'

export function _userdefList() {
    try {
        const raw = localStorage.getItem(USERDEF_KEY);
        if (!raw) return new Array(10).fill(null);
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return new Array(10).fill(null);
        const out = [];
        for (let i = 0; i < 10; i++) {
            const s = parsed[i];
            out.push((s && s.data && s.sizex && s.sizey)
                ? { description: s.description || "", sizex: s.sizex|0, sizey: s.sizey|0, data: s.data }
                : null);
        }
        return out;
    } catch { return new Array(10).fill(null); }
}
function _userdefSaveAll(slots) {
    try { localStorage.setItem(USERDEF_KEY, JSON.stringify(slots)); }
    catch (e) { console.error("userdef save failed", e); }
}
function _userdefSetSlot(idx, slot) {
    const slots = _userdefList();
    slots[idx] = slot;
    _userdefSaveAll(slots);
    _refreshUserdefMenuLabels();
}
function _userdefRemoveSlot(idx) { _userdefSetSlot(idx, null); }

// k-alphabet encode/decode of a weave rectangle.
function _userdefEncodeRect(i1, i2, j1, j2) {
    let out = "";
    for (let i = i1; i <= i2; i++) {
        for (let j = j1; j <= j2; j++) {
            const s = pattern.weave.get(i, j);
            const c = s > 0 ? (USERDEF_K_CHAR + s) : USERDEF_K_CHAR;
            out += String.fromCharCode(c);
        }
    }
    return out;
}

// Stamp slot[idx] at the cursor. Transparent skips empty cells.
export function _insertUserdef(idx, transparent) {
    if (readonly) return;
    if (cursor.selected_part !== "weave") return;
    const slot = _userdefList()[idx];
    if (!slot || !slot.data) return;
    if (slot.data.length < slot.sizex * slot.sizey) return;
    _fullSnapCommand("insert userdef", () => {
        const x = cursor.x1, y = cursor.y1;
        let xx = x + slot.sizex; let yy = y + slot.sizey;
        if (xx > pattern.weave.width)  xx = pattern.weave.width;
        if (yy > pattern.weave.height) yy = pattern.weave.height;
        for (let i = x; i < xx; i++) {
            for (let j = y; j < yy; j++) {
                const idx2 = (i - x) * slot.sizey + (j - y);
                if (idx2 >= slot.data.length) continue;
                const code = slot.data.charCodeAt(idx2);
                const s = code - USERDEF_K_CHAR;
                if (s !== 0) {
                    pattern.weave.set(i, j, s);
                } else if (!transparent) {
                    pattern.weave.set(i, j, 0);
                }
            }
        }
        // Selection covers the inserted block.
        cursor.x1 = x; cursor.y1 = y;
        cursor.x2 = Math.max(x, xx - 1);
        cursor.y2 = Math.max(y, yy - 1);
        pattern.recalc_from_weave(settings);
    });
}

// Slot-picker dialog. opts: { title, mode = "select" | "remove", onSelect(idx) }
function _showUserdefSelectDialog(title, onSelect) {
    const slots = _userdefList();
    const i18n = editorI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    const body = document.createElement("div");
    body.style.display = "grid";
    body.style.gridTemplateColumns = "auto auto auto";
    body.style.gap = "0.4rem 1rem";
    body.style.alignItems = "center";
    let firstUsed = -1;
    for (let i = 0; i < 10; i++) {
        const slot = slots[i];
        const used = !!(slot && slot.data);
        if (used && firstUsed === -1) firstUsed = i;
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "tx-userdef-slot";
        radio.value = String(i);
        radio.id = "tx-userdef-r" + i;
        const label = document.createElement("label");
        label.htmlFor = radio.id;
        label.textContent = used
            ? (slot.description || (L("userdef.pattern", "Pattern") + " " + (i + 1)))
            : (L("userdef.empty", "Empty"));
        if (!used) label.style.color = "#999";
        const dim = document.createElement("span");
        dim.style.fontSize = "12px";
        dim.style.opacity = "0.7";
        dim.textContent = used ? `${slot.sizex}×${slot.sizey}` : "";
        body.appendChild(radio);
        body.appendChild(label);
        body.appendChild(dim);
    }
    if (firstUsed >= 0) {
        body.querySelector(`#tx-userdef-r${firstUsed}`).checked = true;
    } else {
        // No used slots — first slot defaults checked anyway so the
        // "Add pattern" use case still works.
        body.querySelector(`#tx-userdef-r0`).checked = true;
    }
    let modal;
    const apply = () => {
        const sel = body.querySelector("input[name='tx-userdef-slot']:checked");
        if (!sel) return;
        const idx = parseInt(sel.value, 10);
        modal.close();
        onSelect(idx);
    };
    modal = Modal.open({
        title,
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok", "OK"), role: "primary", onClick: () => apply() },
        ],
    });
}

// Description dialog. seed = initial value. Returns name via callback,
// or null on cancel / empty.
function _showUserdefNameDialog(seed, onAccept) {
    const i18n = editorI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    const body = document.createElement("div");
    body.innerHTML = `
        <div style="margin-bottom:0.4rem">${L("userdef.prompt-name", "Pattern name:")}</div>
        <input id="tx-ud-name" type="text" value="${(seed || "").replace(/"/g, "&quot;")}" style="width:100%;box-sizing:border-box">`;
    const input = body.querySelector("#tx-ud-name");
    let modal;
    const apply = () => {
        const v = (input.value || "").trim();
        if (!v) return;
        modal.close();
        onAccept(v);
    };
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); apply(); }
    });
    modal = Modal.open({
        title: L("userdef.name-title", "Pattern description"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok", "OK"), role: "primary", onClick: () => apply() },
        ],
    });
    setTimeout(() => { input.focus(); input.select(); }, 0);
}

// "Add current pattern" — use min_x..max_x × min_y..max_y rect.
export function _userdefAddCurrent() {
    if (pattern.min_x > pattern.max_x || pattern.min_y > pattern.max_y) return;
    const w = pattern.max_x - pattern.min_x + 1;
    const h = pattern.max_y - pattern.min_y + 1;
    if (w > 50 || h > 50) {
        const i18n = editorI18n();
        const msg = (i18n.actions["userdef.too-large"] && i18n.actions["userdef.too-large"].label)
            || "Pattern too large to save (maximum 50 × 50).";
        Modal.open({
            title: "DB-WEAVE", body: msg,
            buttons: [{ label: "OK", role: "primary" }],
        });
        return;
    }
    const i18n = editorI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    _showUserdefSelectDialog(L("userdef.select-slot", "Select pattern slot"), (idx) => {
        const seed = (_userdefList()[idx] && _userdefList()[idx].description)
            || (L("userdef.pattern", "Pattern") + " " + (idx + 1));
        _showUserdefNameDialog(seed, (descr) => {
            _userdefSetSlot(idx, {
                description: descr,
                sizex: w, sizey: h,
                data: _userdefEncodeRect(pattern.min_x, pattern.max_x,
                                         pattern.min_y, pattern.max_y),
            });
        });
    });
}

// "Add selection" — current weave selection rect.
export function _userdefAddSelection() {
    if (cursor.selected_part !== "weave") return;
    const i1 = Math.min(cursor.x1, cursor.x2);
    const i2 = Math.max(cursor.x1, cursor.x2);
    const j1 = Math.min(cursor.y1, cursor.y2);
    const j2 = Math.max(cursor.y1, cursor.y2);
    if (i1 === i2 && j1 === j2) return;
    const w = i2 - i1 + 1, h = j2 - j1 + 1;
    if (w > 50 || h > 50) {
        const i18n = editorI18n();
        const msg = (i18n.actions["userdef.too-large"] && i18n.actions["userdef.too-large"].label)
            || "Pattern too large to save (maximum 50 × 50).";
        Modal.open({
            title: "DB-WEAVE", body: msg,
            buttons: [{ label: "OK", role: "primary" }],
        });
        return;
    }
    const i18n = editorI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    _showUserdefSelectDialog(L("userdef.select-slot", "Select pattern slot"), (idx) => {
        const seed = (_userdefList()[idx] && _userdefList()[idx].description)
            || (L("userdef.pattern", "Pattern") + " " + (idx + 1));
        _showUserdefNameDialog(seed, (descr) => {
            _userdefSetSlot(idx, {
                description: descr,
                sizex: w, sizey: h,
                data: _userdefEncodeRect(i1, i2, j1, j2),
            });
        });
    });
}

export function _userdefRemoveClick() {
    const i18n = editorI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    _showUserdefSelectDialog(L("userdef.select-remove", "Select pattern to delete"), (idx) => {
        _userdefRemoveSlot(idx);
    });
}

// Walk the menubar DOM and update userdef.N items: visibility +
// label text (slot description). Also toggles the Additional top-level
// visibility based on whether any slot is used.
export function _refreshUserdefMenuLabels() {
    const slots = _userdefList();
    const menubar = document.getElementById("tx-menubar");
    if (!menubar) return;
    let anyUsed = false;
    for (let i = 0; i < 10; i++) {
        const item = menubar.querySelector(`.tx-menu-item[data-action="userdef.${i}"]`);
        if (!item) continue;
        const slot = slots[i];
        const used = !!(slot && slot.data);
        item.style.display = used ? "" : "none";
        if (used) {
            anyUsed = true;
            const lbl = item.querySelector(".tx-menu-label");
            if (lbl) lbl.textContent = slot.description || ("Pattern " + (i + 1));
        }
    }
    // Top-level Additional menu visibility — handled via visibleWhen in
    // the menu tree, but force a refresh now so it picks up changes
    // even if no other notify happened.
    ActionRegistry.notify();
    return anyUsed;
}

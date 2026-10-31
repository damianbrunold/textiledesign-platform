// The JBead editor's document dialogs: pattern properties, page setup
// and the technical info.

import { data, setModified } from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import { _actionLabel } from "./labels.js";
import {
    beadlist, colors, commandBus, draw_symbols, pattern, pattern_symbols,
    readonly,
} from "./state.js";
import { symbolFor } from "./symbols.js";

// ---- Properties dialog ------------------------------------------

export function _openPropertiesDialog() {
    if (readonly) return;
    const cur = {
        author:       (data && data.author) || "",
        organization: (data && data.organization) || "",
        notes:        (data && data.notes) || "",
    };
    const body = document.createElement("div");
    body.style.minWidth = "420px";
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:0.4rem 1rem;align-items:start">
            <label>${_actionLabel("props.author", "Author:")}</label>
            <input id="tx-pp-author" type="text" style="width:100%">
            <label>${_actionLabel("props.organization", "Organization:")}</label>
            <input id="tx-pp-org" type="text" style="width:100%">
            <label>${_actionLabel("props.notes", "Notes:")}</label>
            <textarea id="tx-pp-notes" rows="6" style="width:100%;resize:vertical"></textarea>
        </div>`;
    const $ = (sel) => body.querySelector(sel);
    $("#tx-pp-author").value = cur.author;
    $("#tx-pp-org").value    = cur.organization;
    $("#tx-pp-notes").value  = cur.notes;
    setTimeout(() => {
        $("#tx-pp-author").focus();
        $("#tx-pp-author").select();
    }, 0);

    let modal;
    const accept = () => {
        const next = {
            author:       $("#tx-pp-author").value,
            organization: $("#tx-pp-org").value,
            notes:        $("#tx-pp-notes").value,
        };
        if (next.author === cur.author
            && next.organization === cur.organization
            && next.notes === cur.notes) {
            modal.close();
            return;
        }
        const before = { ...cur };
        const after  = { ...next };
        let firstApply = true;
        commandBus.execute({
            label: "properties",
            apply: () => {
                data.author       = after.author;
                data.organization = after.organization;
                data.notes        = after.notes;
                if (!firstApply) setModified();
                firstApply = false;
            },
            revert: () => {
                data.author       = before.author;
                data.organization = before.organization;
                data.notes        = before.notes;
                setModified();
            },
        });
        setModified();
        modal.close();
    };
    modal = Modal.open({
        title: _actionLabel("props.title", "Properties"),
        body,
        buttons: [
            { label: _actionLabel("btn.cancel", "Cancel"), role: "cancel" },
            { label: _actionLabel("btn.ok", "OK"), role: "primary",
              onClick: accept },
        ],
    });
}


// Page setup — header / footer template strings for printing. Tokens
// (&Pattern / &Author / &Organisation / &File / &Page and the German
// &Muster / &Autor / &Seite / &Datei) are expanded server-side. Mirrors
// dbweave's PageSetupDialog.
const _DEFAULT_HEADER_TEXT = "JBead - &Pattern (&Author)";
const _DEFAULT_FOOTER_TEXT = "";

export function _openPageSetupDialog() {
    if (readonly) return;
    const curHeader = (data && typeof data.header_text === "string")
        ? data.header_text : _DEFAULT_HEADER_TEXT;
    const curFooter = (data && typeof data.footer_text === "string")
        ? data.footer_text : _DEFAULT_FOOTER_TEXT;
    const tokenHelp = _actionLabel("page-setup.tokens",
        "Tokens: &Pattern, &Author, &Organisation, &File, &Page");
    const body = document.createElement("div");
    body.style.minWidth = "460px";
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:0.4rem 1rem;align-items:center">
            <label>${_actionLabel("page-setup.header", "Header:")}</label>
            <input id="tx-ps-header" type="text" style="width:100%">
            <label>${_actionLabel("page-setup.footer", "Footer:")}</label>
            <input id="tx-ps-footer" type="text" style="width:100%">
        </div>
        <p class="tx-hint" style="margin-top:0.6rem">${tokenHelp}</p>`;
    const $ = (sel) => body.querySelector(sel);
    $("#tx-ps-header").value = curHeader;
    $("#tx-ps-footer").value = curFooter;
    setTimeout(() => {
        $("#tx-ps-header").focus();
        $("#tx-ps-header").select();
    }, 0);

    let modal;
    const accept = () => {
        const newHeader = $("#tx-ps-header").value;
        const newFooter = $("#tx-ps-footer").value;
        if (newHeader === curHeader && newFooter === curFooter) {
            modal.close();
            return;
        }
        const before = { header_text: data.header_text, footer_text: data.footer_text };
        const after  = { header_text: newHeader,        footer_text: newFooter };
        let firstApply = true;
        commandBus.execute({
            label: "page-setup",
            apply: () => {
                data.header_text = after.header_text;
                data.footer_text = after.footer_text;
                if (!firstApply) setModified();
                firstApply = false;
            },
            revert: () => {
                data.header_text = before.header_text;
                data.footer_text = before.footer_text;
                setModified();
            },
        });
        setModified();
        modal.close();
    };
    modal = Modal.open({
        title: _actionLabel("page-setup.title", "Page setup"),
        body,
        buttons: [
            { label: _actionLabel("btn.cancel", "Cancel"), role: "cancel" },
            { label: _actionLabel("btn.ok", "OK"), role: "primary",
              onClick: accept },
        ],
    });
}


// ---- Technical info dialog --------------------------------------

export function _openTechInfoDialog() {
    const root = document.createElement("div");
    root.style.minWidth = "260px";

    const used = beadlist.usedHeight | 0;
    const total = used * pattern.width;
    const repeat = beadlist.repeat | 0;

    const items = [
        [_actionLabel("info.circumference", "Circumference:"), pattern.width],
        [_actionLabel("info.rows", "Rows:"), used],
        [_actionLabel("info.total-beads", "Total beads:"), total],
        [_actionLabel("info.repeat", "Repeat:"), repeat],
        [_actionLabel("info.bead-runs", "Colour runs:"), beadlist.list.length],
    ];

    const tbl = document.createElement("table");
    tbl.style.borderCollapse = "collapse";
    for (const [label, value] of items) {
        const tr = document.createElement("tr");
        const th = document.createElement("th");
        th.textContent = label;
        th.style.textAlign = "left";
        th.style.padding = "2px 12px 2px 0";
        const td = document.createElement("td");
        td.textContent = String(value);
        td.style.padding = "2px 0";
        td.style.fontFamily = "monospace";
        tr.appendChild(th);
        tr.appendChild(td);
        tbl.appendChild(tr);
    }
    root.appendChild(tbl);

    // Per-colour totals — include the background colour, those
    // beads have to be bought too.
    const counts = new Map();
    for (let j = 0; j < used; j++) {
        for (let i = 0; i < pattern.width; i++) {
            const c = pattern.get(i, j);
            counts.set(c, (counts.get(c) || 0) + 1);
        }
    }
    if (counts.size > 0) {
        const h = document.createElement("h4");
        h.textContent = _actionLabel("info.per-color",
                                     "Beads per colour:");
        h.style.margin = "12px 0 4px";
        root.appendChild(h);
        const grid = document.createElement("div");
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(60px, 1fr))";
        grid.style.gap = "4px";
        const sorted = Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
        for (const [c, n] of sorted) {
            const cell = document.createElement("div");
            cell.style.display = "flex";
            cell.style.alignItems = "center";
            cell.style.gap = "4px";
            const sw = document.createElement("span");
            sw.style.display = "inline-block";
            sw.style.width = "16px";
            sw.style.height = "16px";
            sw.style.border = "1px solid #888";
            sw.style.background = colors[c];
            cell.appendChild(sw);
            const label = document.createElement("span");
            const sym = draw_symbols ? symbolFor(pattern_symbols, c) : "";
            label.textContent = sym ? `${n}× ${sym}` : `${n}×`;
            label.style.fontFamily = "monospace";
            cell.appendChild(label);
            grid.appendChild(cell);
        }
        root.appendChild(grid);
    }

    Modal.open({
        title: _actionLabel("info.title", "Technical info"),
        body: root,
        buttons: [
            { label: _actionLabel("btn.ok", "OK"), role: "primary" },
        ],
    });
}

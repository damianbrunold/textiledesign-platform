// The DB-WEAVE editor's document dialogs: pattern properties, page
// setup, the pattern info report (desktop EntwurfsinfoDialog) and
// printing a part of the pattern.

import { ColorPicker } from "../ui/colorpicker.js";
import { _prompt, data, downloadRendered, editorI18n } from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import { _snapshotCommand } from "./history.js";
import { infoColors, infoFloats, infoGeneral, infoHeddles } from "./info-ops.js";
import { savePatternData, saveSettings } from "./persist.js";
import { pattern, readonly, settings } from "./state.js";

// ---- Phase 10: properties + pattern info -------------------------
//
// Properties dialog (port of propertiesdialog.cpp) edits author /
// organization / notes that round-trip through the pattern JSON.
//
// Pattern Information dialog (port of entwurfsinfodialog.cpp) builds
// a four-section computed report (General / Colors / Floats / Heddles)
// over the in-memory pattern, with a plain-text save-as-report button.

function _patternProperties() {
    return {
        author:       (data && data.author)       || "",
        organization: (data && data.organization) || "",
        notes:        (data && data.notes)        || "",
    };
}

export function showPropertiesDialog() {
    if (readonly) return;
    const i18n = editorI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    const cur = _patternProperties();
    const body = document.createElement("div");
    body.style.minWidth = "420px";
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:0.4rem 1rem;align-items:start">
            <label>${L("props.author", "Author:")}</label>
            <input id="tx-pp-author" type="text" style="width:100%">
            <label>${L("props.organization", "Organization:")}</label>
            <input id="tx-pp-org" type="text" style="width:100%">
            <label>${L("props.notes", "Notes:")}</label>
            <textarea id="tx-pp-notes" rows="6" style="width:100%;resize:vertical"></textarea>
        </div>`;
    const $ = (sel) => body.querySelector(sel);
    $("#tx-pp-author").value = cur.author;
    $("#tx-pp-org").value    = cur.organization;
    $("#tx-pp-notes").value  = cur.notes;
    setTimeout(() => { $("#tx-pp-author").focus(); $("#tx-pp-author").select(); }, 0);

    let modal;
    const accept = () => {
        const newProps = {
            author:       $("#tx-pp-author").value,
            organization: $("#tx-pp-org").value,
            notes:        $("#tx-pp-notes").value,
        };
        if (newProps.author !== cur.author
            || newProps.organization !== cur.organization
            || newProps.notes !== cur.notes) {
            _snapshotCommand("edit properties",
                () => ({
                    author:       data.author,
                    organization: data.organization,
                    notes:        data.notes,
                }),
                (s) => {
                    data.author       = s.author;
                    data.organization = s.organization;
                    data.notes        = s.notes;
                },
                () => {
                    data.author       = newProps.author;
                    data.organization = newProps.organization;
                    data.notes        = newProps.notes;
                },
            );
        }
        modal.close();
    };
    modal = Modal.open({
        title: L("props.title", "Properties"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok",     "OK"),     role: "primary", onClick: accept },
        ],
    });
}


// Page setup — port of dbweave's PageSetupDialog. Lets the user edit
// the header / footer template strings used when printing. Tokens
// (&Pattern / &Author / &Page / &Organisation / &File and the German
// equivalents &Muster / &Autor / &Seite / &Datei) are substituted
// server-side at print time. Defaults match dbweave's
// PAGE_HEADER_DEFAULT.
const _DEFAULT_HEADER_TEXT = "DB-WEAVE - &Pattern (&Author)";
const _DEFAULT_FOOTER_TEXT = "";

export function showPageSetupDialog() {
    if (readonly) return;
    const i18n = editorI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    const curHeader = (data && typeof data.header_text === "string")
        ? data.header_text : _DEFAULT_HEADER_TEXT;
    const curFooter = (data && typeof data.footer_text === "string")
        ? data.footer_text : _DEFAULT_FOOTER_TEXT;
    const tokenHelp = L("page-setup.tokens",
        "Tokens: &Pattern, &Author, &Organisation, &File, &Page");
    const body = document.createElement("div");
    body.style.minWidth = "460px";
    body.innerHTML = `
        <div style="display:grid;grid-template-columns:auto 1fr;gap:0.4rem 1rem;align-items:center">
            <label>${L("page-setup.header", "Header:")}</label>
            <input id="tx-ps-header" type="text" style="width:100%">
            <label>${L("page-setup.footer", "Footer:")}</label>
            <input id="tx-ps-footer" type="text" style="width:100%">
        </div>
        <p class="tx-hint" style="margin-top:0.6rem">${tokenHelp}</p>`;
    const $ = (sel) => body.querySelector(sel);
    $("#tx-ps-header").value = curHeader;
    $("#tx-ps-footer").value = curFooter;
    setTimeout(() => { $("#tx-ps-header").focus(); $("#tx-ps-header").select(); }, 0);

    let modal;
    const accept = () => {
        const newHeader = $("#tx-ps-header").value;
        const newFooter = $("#tx-ps-footer").value;
        if (newHeader !== curHeader || newFooter !== curFooter) {
            _snapshotCommand("edit page setup",
                () => ({
                    header_text: data.header_text,
                    footer_text: data.footer_text,
                }),
                (s) => {
                    data.header_text = s.header_text;
                    data.footer_text = s.footer_text;
                },
                () => {
                    data.header_text = newHeader;
                    data.footer_text = newFooter;
                },
            );
        }
        modal.close();
    };
    modal = Modal.open({
        title: L("page-setup.title", "Page setup"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok",     "OK"),     role: "primary", onClick: accept },
        ],
    });
}


// Pattern info — direct port of EntwurfsinfoDialog. Builds 4 sections
// of computed report text from the in-memory pattern (info-ops.js).

function _infoL() {
    const i18n = editorI18n();
    return (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
}

function _info_general() {
    return infoGeneral(pattern, _patternProperties(), _infoL());
}

function _info_colors() {
    return infoColors(pattern, ColorPicker.rgbToHsv, _infoL());
}

function _info_floats() {
    return infoFloats(pattern, _infoL());
}

function _info_heddles() {
    return infoHeddles(pattern, _infoL());
}

function _info_full_report() {
    const i18n = editorI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    const out = [];
    out.push("DB-WEAVE — " + L("info.title", "Pattern information"));
    const userEl = document.getElementById("user");
    const patEl  = document.getElementById("pattern");
    if (userEl && patEl) out.push(userEl.value + "/" + patEl.value);
    out.push("");
    const heading = (h) => { out.push("=== " + h + " ==="); };
    heading(L("info.tab-general",  "General"));   for (const l of _info_general()) out.push(l);
    heading(L("info.tab-colors",   "Colors"));    for (const l of _info_colors())  out.push(l);
    heading(L("info.tab-floats",   "Floats"));    for (const l of _info_floats())  out.push(l);
    heading(L("info.tab-heddles",  "Heddles"));   for (const l of _info_heddles()) out.push(l);
    return out.join("\n");
}

export function showPatternInfoDialog() {
    const i18n = editorI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;

    const TABS = [
        { id: "general",  label: L("info.tab-general",  "General"),  build: _info_general },
        { id: "colors",   label: L("info.tab-colors",   "Colors"),   build: _info_colors  },
        { id: "floats",   label: L("info.tab-floats",   "Floats"),   build: _info_floats  },
        { id: "heddles",  label: L("info.tab-heddles",  "Heddles"),  build: _info_heddles },
    ];
    // Build all sections lazily — Floats / Heddles are slow on large
    // patterns, so only run the cost when the user opens the tab.
    const cache = {};

    const body = document.createElement("div");
    body.style.minWidth = "640px";
    const tabRow = document.createElement("div");
    tabRow.className = "tx-tabs";
    tabRow.style.borderBottom = "1px solid #888";
    tabRow.style.display = "flex";
    tabRow.style.gap = "0.2rem";
    body.appendChild(tabRow);

    const out = document.createElement("pre");
    out.style.minHeight = "320px";
    out.style.maxHeight = "60vh";
    out.style.overflow = "auto";
    out.style.margin = "0.4rem 0";
    out.style.fontFamily = "monospace";
    out.style.fontSize = "0.85rem";
    out.style.background = "transparent";
    body.appendChild(out);

    const showTab = (id) => {
        const t = TABS.find(x => x.id === id);
        if (!t) return;
        if (!cache[id]) cache[id] = t.build();
        out.textContent = cache[id].join("\n");
        tabRow.querySelectorAll(".tx-tab").forEach(b =>
            b.classList.toggle("active", b.dataset.tab === id));
    };

    TABS.forEach(t => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "tx-tab";
        b.dataset.tab = t.id;
        b.textContent = t.label;
        b.addEventListener("click", () => showTab(t.id));
        tabRow.appendChild(b);
    });

    const onSave = () => {
        const text = _info_full_report();
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const userEl = document.getElementById("user");
        const patEl  = document.getElementById("pattern");
        const a = document.createElement("a");
        a.href = url;
        a.download = (userEl ? userEl.value : "pattern") + "-"
                   + (patEl ? patEl.value : "info") + "-info.txt";
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoking right away can cancel the download in some browsers.
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    };

    Modal.open({
        title: L("info.title", "Pattern information"),
        body,
        buttons: [
            { label: L("info.save", "Save…"),  onClick: onSave },
            { label: L("btn.ok",    "OK"),     role: "primary" },
        ],
    });
    showTab("general");
}


// Multi-page PDF print — full pattern (no ranges) or a sub-range.
// Mirrors desktop "Drucken" / "Teil drucken". The PDF is rendered
// server-side; in-memory state is POSTed so unsaved edits are
// reflected without auto-saving.
export async function _printDownload(opts) {
    saveSettings(data, settings);
    savePatternData(data, pattern);
    await downloadRendered(
        "print", Object.assign({ contents: data }, opts || {}),
        `${document.getElementById("pattern").value}.pdf`,
        _prompt("printFailed", "Print failed."));
}

// Print part — range dialog (warp + weft + harness + treadle) →
// multi-page PDF. Direct port of printrangedialog.cpp's four range
// groups. As in desktop, entering 0 in both From and To of a group
// suppresses that strip in the output.
export function showPrintPartDialog() {
    const i18n = editorI18n();
    const L = (k, fb) => (i18n.actions[k] && i18n.actions[k].label) || fb;
    const w = pattern.weave.width;
    const h = pattern.weave.height;
    // Default to the active pattern extent; an empty pattern (no extent)
    // falls back to the full grid.
    const hasExt = pattern.hasExtent();
    const wa = hasExt ? (pattern.min_x | 0) + 1 : 1;
    const wb = hasExt ? (pattern.max_x | 0) + 1 : w;
    const sa = hasExt ? (pattern.min_y | 0) + 1 : 1;
    const sb = hasExt ? (pattern.max_y | 0) + 1 : h;
    // Highest shaft / treadle actually used — defaults for the new
    // harness / treadle range groups, mirroring desktop's
    // CalcSchaefte / CalcTritte.
    const maxShafts   = pattern.max_shafts   || (data && data.max_shafts)   || 32;
    const maxTreadles = pattern.max_treadles || (data && data.max_treadles) || 32;
    let firstShaft = -1, lastShaft = -1;
    if (data && Array.isArray(data.data_entering)) {
        for (let i = 0; i < data.data_entering.length; i++) {
            const s = data.data_entering[i] | 0;
            if (s <= 0) continue;
            if (firstShaft < 0 || s - 1 < firstShaft) firstShaft = s - 1;
            if (s - 1 > lastShaft) lastShaft = s - 1;
        }
    }
    let firstTreadle = -1, lastTreadle = -1;
    if (data && Array.isArray(data.data_treadling) && maxTreadles > 0) {
        for (let j = 0; j < h; j++) {
            for (let i = 0; i < maxTreadles; i++) {
                const v = data.data_treadling[i + j * maxTreadles] | 0;
                if (v <= 0) continue;
                if (firstTreadle < 0 || i < firstTreadle) firstTreadle = i;
                if (i > lastTreadle) lastTreadle = i;
            }
        }
    }
    const ha = firstShaft   >= 0 ? firstShaft   + 1 : 1;
    const hb = lastShaft    >= 0 ? lastShaft    + 1 : Math.min(maxShafts, 1);
    const ta = firstTreadle >= 0 ? firstTreadle + 1 : 1;
    const tb = lastTreadle  >= 0 ? lastTreadle  + 1 : Math.min(maxTreadles, 1);
    const body = document.createElement("div");
    body.style.minWidth = "360px";
    const group = (legend, idA, idB, max) => `
        <fieldset style="border:1px solid #888;padding:0.4rem 0.6rem;margin-bottom:0.6rem">
            <legend>${legend}</legend>
            <div style="display:grid;grid-template-columns:auto 6rem;gap:0.4rem 1rem;align-items:center">
                <label>${L("print.from", "From")}</label>
                <input id="${idA}" type="number" min="0" max="${max}" step="1">
                <label>${L("print.to",   "To")}</label>
                <input id="${idB}" type="number" min="0" max="${max}" step="1">
            </div>
        </fieldset>`;
    body.innerHTML =
        group(L("print.warp-range",    "Warp range"),    "tx-pp-wa", "tx-pp-wb", w)
      + group(L("print.weft-range",    "Weft range"),    "tx-pp-sa", "tx-pp-sb", h)
      + group(L("print.harness-range", "Harness range"), "tx-pp-ha", "tx-pp-hb", maxShafts)
      + group(L("print.treadle-range", "Treadle range"), "tx-pp-ta", "tx-pp-tb", maxTreadles);
    const $ = (sel) => body.querySelector(sel);
    $("#tx-pp-wa").value = wa; $("#tx-pp-wb").value = wb;
    $("#tx-pp-sa").value = sa; $("#tx-pp-sb").value = sb;
    $("#tx-pp-ha").value = ha; $("#tx-pp-hb").value = hb;
    $("#tx-pp-ta").value = ta; $("#tx-pp-tb").value = tb;
    setTimeout(() => { $("#tx-pp-wa").focus(); $("#tx-pp-wa").select(); }, 0);

    // Read a range pair: 0/0 in both fields is the "skip section"
    // sentinel; otherwise non-positive entries fall back to the
    // axis-wide default (1..max) and the pair is normalised so
    // From ≤ To.
    const readRange = (idA, idB, max) => {
        const a = parseInt($(idA).value, 10);
        const b = parseInt($(idB).value, 10);
        if (a === 0 && b === 0) return { from: 0, to: 0 };
        let aa = (Number.isFinite(a) && a > 0) ? a : 1;
        let bb = (Number.isFinite(b) && b > 0) ? b : max;
        if (bb < aa) [aa, bb] = [bb, aa];
        return { from: aa, to: bb };
    };

    let modal;
    const accept = () => {
        const rW = readRange("#tx-pp-wa", "#tx-pp-wb", w);
        const rS = readRange("#tx-pp-sa", "#tx-pp-sb", h);
        const rH = readRange("#tx-pp-ha", "#tx-pp-hb", maxShafts);
        const rT = readRange("#tx-pp-ta", "#tx-pp-tb", maxTreadles);
        modal.close();
        _printDownload({
            warp_from:    rW.from, warp_to:    rW.to,
            weft_from:    rS.from, weft_to:    rS.to,
            harness_from: rH.from, harness_to: rH.to,
            treadle_from: rT.from, treadle_to: rT.to,
        });
    };
    modal = Modal.open({
        title: L("print.part-title", "Print part"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok",     "OK"),     role: "primary", onClick: accept },
        ],
    });
}

// Discard in-memory edits and reload the pattern from the server —
// port of desktop "Änderungen verwerfen" (filehandling.cpp). Asks the
// user to confirm because the operation is destructive.

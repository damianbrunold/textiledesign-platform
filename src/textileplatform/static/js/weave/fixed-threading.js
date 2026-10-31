// The fixed (user-defined) threading dialog (desktop EzFixiert).

import { editorI18n } from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import { updateFixedEntering } from "./arrange.js";
import {
    commitFixedThreading, fixedThreadingScratch, fixedThreadingSize,
    isContinuousThreading, toggleFixedThreading,
} from "./fixed-threading-ops.js";
import { _fullSnapCommand } from "./history.js";
import { pattern, readonly, settings } from "./state.js";

// ---- Phase 8 (final): EzFixiert (user-defined / fixed threading) ----
//
// Direct port of fixeinzugdialog.cpp + recalc.cpp::RecalcEinzugFixiert;
// editing and storing the template is in fixed-threading-ops.js.
// When the user marks a threading template via "Threading ▸ User
// defined…", every weave-driven recalc rebuilds the threading from
// that template instead of from the standard recalc_entering algorithm.
//
// The template (fixeinzug[]) lists 1-based shaft numbers, one per
// non-empty warp, and is rapport-extended out to entering width.
// firstfree records the smallest shaft index strictly above the
// highest template-used shaft — values <= firstfree get reused for
// equal-warp matches, values > firstfree are split-off shafts.

// recalcFixedEntering / updateFixedEntering are in weave/arrange.js.

// User-facing dialog: edit fixeinzug as a 12-px-cell grid with mouse +
// keyboard. Menu actions Grab / Delete / Revert / Close.
export function showFixeinzugDialog() {
    if (readonly) return;
    const i18n = editorI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;

    // Lazy initial Grab if template empty (matches desktop EditFixeinzug).
    if (!pattern.fixeinzug[0]) updateFixedEntering(pattern);

    const W = pattern.entering.width;
    const totalShafts = pattern.tieup.height;
    const scratchBefore = pattern.fixeinzug.slice();
    const sizeBefore = pattern.fixsize;
    const ffBefore = pattern.firstfree;

    // Editing buffer, isolated from the live pattern until the user
    // closes the dialog (Revert simply discards it).
    const scratch = fixedThreadingScratch(pattern);
    let size = pattern.fixsize;

    const calcRange = () => { size = fixedThreadingSize(scratch); };

    const cellPx = 16;
    let cx = 0, cy = 0, scrollX = 0;

    const body = document.createElement("div");
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.gap = "0.4rem";
    body.style.minWidth = "640px";

    // Toolbar of menu actions (the desktop puts them under an "Einzug"
    // menu; on the web a flat button row is cleaner).
    const toolbar = document.createElement("div");
    toolbar.style.display = "flex";
    toolbar.style.gap = "0.3rem";
    const addBtn = (label, fn) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.padding = "0.2rem 0.6rem";
        b.addEventListener("click", () => { fn(); canvas.focus(); });
        toolbar.appendChild(b);
        return b;
    };
    body.appendChild(toolbar);

    const canvasWrap = document.createElement("div");
    canvasWrap.style.position = "relative";
    canvasWrap.style.background = "#c0c0c0";
    canvasWrap.style.border = "1px solid #888";
    canvasWrap.style.height = "240px";
    canvasWrap.style.overflow = "hidden";
    body.appendChild(canvasWrap);
    const canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    canvas.style.outline = "none";
    canvas.style.display = "block";
    canvasWrap.appendChild(canvas);

    const scroll = document.createElement("input");
    scroll.type = "range";
    scroll.min = "0";
    scroll.max = String(W);
    scroll.value = "0";
    scroll.step = "1";
    scroll.style.width = "100%";
    body.appendChild(scroll);

    const sizeAndDraw = () => {
        const rect = canvasWrap.getBoundingClientRect();
        canvas.width = Math.max(200, Math.floor(rect.width));
        canvas.height = canvasWrap.clientHeight;
        draw();
    };

    const visibleCols = () => Math.max(1, Math.floor(canvas.width / cellPx));
    const visibleShafts = () => {
        let m = Math.floor(canvas.height / cellPx);
        if (m > totalShafts) m = totalShafts;
        return m;
    };

    const draw = () => {
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#c0c0c0";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const maxx = visibleCols();
        const maxy = visibleShafts();
        const rtl = !!settings.direction_righttoleft;
        const ttb = !!settings.direction_toptobottom;
        ctx.strokeStyle = "#696969";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= maxx; i++) {
            const x = i * cellPx + 0.5;
            ctx.moveTo(x, 0); ctx.lineTo(x, maxy * cellPx);
        }
        for (let j = 0; j <= maxy; j++) {
            const y = j * cellPx + 0.5;
            ctx.moveTo(0, y); ctx.lineTo(maxx * cellPx, y);
        }
        ctx.stroke();
        ctx.fillStyle = "#000";
        for (let i = 0; i < maxx; i++) {
            const src = scrollX + i;
            if (src >= W) break;
            const s = scratch[src];
            if (s === 0) continue;
            if (s - 1 >= maxy) continue;
            const x = rtl ? (maxx - i - 1) * cellPx : i * cellPx;
            const y = ttb ? (s - 1) * cellPx : (maxy - s) * cellPx;
            ctx.fillRect(x + 1, y + 1, cellPx - 2, cellPx - 2);
        }
        // Cursor outline.
        if (document.activeElement === canvas && cx < maxx && cy < maxy) {
            const x = rtl ? (maxx - 1 - cx) * cellPx : cx * cellPx;
            const y = ttb ? cy * cellPx : (maxy - 1 - cy) * cellPx;
            ctx.strokeStyle = "#fff";
            ctx.strokeRect(x + 0.5, y + 0.5, cellPx - 1, cellPx - 1);
        }
    };

    const toggleAt = (col, shaft) => {
        const src = scrollX + col;
        if (src < 0 || src >= W) return;
        size = toggleFixedThreading(scratch, src, shaft);
        draw();
    };

    canvas.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const maxx = visibleCols();
        const maxy = visibleShafts();
        const rtl = !!settings.direction_righttoleft;
        const ttb = !!settings.direction_toptobottom;
        let i = Math.floor(px / cellPx);
        let j = maxy - 1 - Math.floor(py / cellPx);
        if (i < 0 || j < 0 || i >= maxx || j >= maxy) return;
        if (rtl) i = maxx - 1 - i;
        if (ttb) j = maxy - 1 - j;
        cx = i; cy = j;
        canvas.focus();
        toggleAt(i, j);
    });

    canvas.addEventListener("focus", () => draw());
    canvas.addEventListener("blur",  () => draw());

    canvas.addEventListener("keydown", (e) => {
        const maxx = visibleCols();
        const maxy = visibleShafts();
        const rtl = !!settings.direction_righttoleft;
        const ttb = !!settings.direction_toptobottom;
        const step = (e.ctrlKey || e.metaKey) ? 4 : 1;
        const moveLeft  = () => { cx = Math.max(0, cx - step); };
        const moveRight = () => { cx = Math.min(maxx - 1, cx + step); };
        const moveUp    = () => { cy = Math.min(maxy - 1, cy + step); };
        const moveDown  = () => { cy = Math.max(0, cy - step); };
        switch (e.key) {
        case "ArrowLeft":  rtl ? moveRight() : moveLeft();  break;
        case "ArrowRight": rtl ? moveLeft()  : moveRight(); break;
        case "ArrowUp":    ttb ? moveDown()  : moveUp();    break;
        case "ArrowDown":  ttb ? moveUp()    : moveDown();  break;
        case " ": case "Spacebar":
            toggleAt(cx, cy);
            break;
        default:
            // Block printable/character keys from bubbling up to the
            // global shortcut + keyDown listeners (which would otherwise
            // act on the underlying pattern editor while this dialog is
            // open). Leave Escape / Tab alone so the modal's own
            // backdrop handler can close / focus-trap correctly.
            if (e.key !== "Escape" && e.key !== "Tab") e.stopPropagation();
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        draw();
    });

    scroll.addEventListener("input", () => {
        scrollX = parseInt(scroll.value, 10) || 0;
        draw();
    });

    addBtn(L("fixez.grab", "Take from pattern"), () => {
        // Re-snapshot from live entering into the local scratch buffer.
        updateFixedEntering(pattern);
        const fresh = fixedThreadingScratch(pattern);
        for (let i = 0; i < W; i++) scratch[i] = fresh[i];
        calcRange();
        draw();
    });
    addBtn(L("fixez.delete", "Delete"), () => {
        for (let i = 0; i < W; i++) scratch[i] = 0;
        size = 0;
        draw();
    });

    let modal;
    const accept = () => {
        // Continuity check: 0..size-1 must all be non-zero.
        if (!isContinuousThreading(scratch, size)) {
            alert(L("fixez.gap-error",
                "Threading must be continuous (no gaps)."));
            return;
        }
        // Wrap as one undoable command. _fullSnapCommand snapshots the
        // current pattern state ("before") at entry, runs mutate, then
        // snapshots again ("after") — so we have to restore the live
        // pattern to the pre-dialog fixeinzug values before calling it.
        pattern.fixeinzug = scratchBefore.slice();
        pattern.fixsize = sizeBefore;
        pattern.firstfree = ffBefore;
        const finalScratch = scratch.slice();
        const finalSize = size;
        _fullSnapCommand("user-defined threading", () => {
            commitFixedThreading(pattern, finalScratch, finalSize);
            settings.threading_arrangement = "fixiert";
            // Trigger the full recalc-from-weave path so
            // recalcFixedEntering rebuilds entering from the freshly
            // committed template (matches desktop EditFixeinzug, which
            // calls RcRecalcAll::Recalc → RecalcEinzugFixiert).
            pattern.recalc_from_weave(settings);
        });
        modal.close();
    };
    const revert = () => {
        // Discard local edits — restore fixeinzug fields from the
        // snapshot taken when the dialog opened.
        pattern.fixeinzug = scratchBefore.slice();
        pattern.fixsize = sizeBefore;
        pattern.firstfree = ffBefore;
        modal.close();
    };

    modal = Modal.open({
        title: L("fixez.title", "User-defined threading"),
        body,
        buttons: [
            { label: L("fixez.revert", "Revert"), role: "cancel", onClick: revert },
            { label: L("fixez.close",  "Close"),  role: "primary", onClick: accept },
        ],
    });
    setTimeout(() => { sizeAndDraw(); canvas.focus(); }, 0);
    const onResize = () => { if (canvas.isConnected) sizeAndDraw(); };
    window.addEventListener("resize", onResize);
    const origClose = modal.close;
    modal.close = function () {
        window.removeEventListener("resize", onResize);
        return origClose.apply(modal, arguments);
    };
}

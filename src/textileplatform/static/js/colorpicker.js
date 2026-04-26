"use strict";

// Shared colour-picker primitives. Used by the bead editor (jbead.js)
// and ports the same dialogs the weave editor (dbweave.js) ships:
//
//   - ColorPicker.pickRGB(initialRgb, onAccept)
//       Native <input type="color"> picker, wrapped in an accept(rgb)
//       callback contract.
//
//   - ColorPicker.pickHSV(initialRgb, onAccept, getLabel)
//       Modal HSV picker — hue ring + S/V square + numeric sliders +
//       live swatch.
//
//   - ColorPicker.showPaletteEditor({ palette, getLabel, onCommit,
//                                     onCancel, onPreview, currentIndex,
//                                     cols })
//       Modal palette editor — grid of swatches, click to select,
//       buttons to launch the RGB/HSV pickers, plus a Revert button to
//       undo edits made inside this dialog. `onCommit` receives the
//       final palette (after OK); `onCancel` is invoked from Cancel /
//       Escape; `onPreview` (optional) is called whenever a swatch is
//       edited so the host editor can live-preview the change.
//
// `getLabel(key, fallback)` is supplied by the caller to look up
// translated UI strings — keeps this module decoupled from any app-
// specific i18n machinery.

const ColorPicker = (function () {

    function rgbToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const d = mx - mn;
        let h = 0;
        if (d > 0) {
            if (mx === r)      h = ((g - b) / d) % 6;
            else if (mx === g) h = (b - r) / d + 2;
            else               h = (r - g) / d + 4;
            h *= 60; if (h < 0) h += 360;
        }
        const s = mx === 0 ? 0 : d / mx;
        return [h, s, mx];
    }

    function hsvToRgb(h, s, v) {
        const c = v * s;
        const hh = (h % 360 + 360) % 360 / 60;
        const x = c * (1 - Math.abs(hh % 2 - 1));
        let r1 = 0, g1 = 0, b1 = 0;
        if      (hh < 1) { r1 = c; g1 = x; }
        else if (hh < 2) { r1 = x; g1 = c; }
        else if (hh < 3) { g1 = c; b1 = x; }
        else if (hh < 4) { g1 = x; b1 = c; }
        else if (hh < 5) { r1 = x; b1 = c; }
        else             { r1 = c; b1 = x; }
        const m = v - c;
        return [Math.round((r1 + m) * 255),
                Math.round((g1 + m) * 255),
                Math.round((b1 + m) * 255)];
    }

    function rgbToHex(r, g, b) {
        const h = (n) => Math.max(0, Math.min(255, n | 0)).toString(16)
            .padStart(2, "0");
        return "#" + h(r) + h(g) + h(b);
    }

    function hexToRgb(hex) {
        const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
        if (!m) return [0, 0, 0];
        return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
    }

    // ---- Native RGB picker ---------------------------------------

    function pickRGB(initialRgb, onAccept) {
        const inp = document.createElement("input");
        inp.type = "color";
        inp.value = rgbToHex(initialRgb[0], initialRgb[1], initialRgb[2]);
        inp.style.position = "fixed";
        inp.style.left = "-9999px";
        document.body.appendChild(inp);
        let resolved = false;
        const cleanup = () => { if (inp.parentNode) inp.remove(); };
        const handle = () => {
            if (resolved) return;
            resolved = true;
            const rgb = hexToRgb(inp.value);
            cleanup();
            onAccept(rgb);
        };
        inp.addEventListener("input", handle);
        inp.addEventListener("change", handle);
        // Browser-cancel safety net.
        setTimeout(() => {
            if (!resolved && !document.activeElement) {
                resolved = true; cleanup();
            }
        }, 60000);
        inp.click();
    }

    // ---- HSV picker ---------------------------------------------

    function pickHSV(initialRgb, onAccept, getLabel) {
        const L = (k, fb) =>
            (typeof getLabel === "function") ? getLabel(k, fb) : fb;
        let [h, s, v] = rgbToHsv(initialRgb[0], initialRgb[1],
                                 initialRgb[2]);

        // Geometry: square canvas; outer ring = hue, inner SV square
        // inscribed in the inner ring.
        const SIZE = 240;
        const RING_OUTER = SIZE / 2 - 4;
        const RING_INNER = RING_OUTER - 22;
        const SV_HALF = Math.floor(RING_INNER * Math.SQRT1_2) - 2;

        const body = document.createElement("div");
        body.style.display = "flex";
        body.style.gap = "1rem";
        body.style.minWidth = "560px";
        body.innerHTML = `
            <div>
                <canvas id="tx-hsv-wheel" width="${SIZE}" height="${SIZE}"
                        style="display:block;cursor:crosshair"></canvas>
            </div>
            <div style="flex:1;display:flex;flex-direction:column;gap:0.4rem">
                <div style="display:grid;grid-template-columns:auto 1fr auto;gap:0.4rem 0.6rem;align-items:center">
                    <label>${L("color.hue", "Hue:")}</label>
                    <input id="tx-hsv-h" type="range" min="0" max="359" step="1">
                    <input id="tx-hsv-h-num" type="number" min="0" max="359" step="1" style="width:5rem">
                    <label>${L("color.sat", "Saturation:")}</label>
                    <input id="tx-hsv-s" type="range" min="0" max="100" step="1">
                    <input id="tx-hsv-s-num" type="number" min="0" max="100" step="1" style="width:5rem">
                    <label>${L("color.val", "Value:")}</label>
                    <input id="tx-hsv-v" type="range" min="0" max="100" step="1">
                    <input id="tx-hsv-v-num" type="number" min="0" max="100" step="1" style="width:5rem">
                </div>
                <div style="display:grid;grid-template-columns:auto 1fr;gap:0.3rem 0.6rem;font-family:monospace">
                    <span>R:</span><span id="tx-hsv-r"></span>
                    <span>G:</span><span id="tx-hsv-g"></span>
                    <span>B:</span><span id="tx-hsv-b"></span>
                </div>
                <div id="tx-hsv-swatch" style="margin-top:0.4rem;height:48px;border:1px solid #888"></div>
            </div>`;
        const $ = (sel) => body.querySelector(sel);
        const wheel = $("#tx-hsv-wheel");
        const ctx = wheel.getContext("2d");

        let ringCache = null;
        const buildRingCache = () => {
            const off = document.createElement("canvas");
            off.width = SIZE; off.height = SIZE;
            const c = off.getContext("2d");
            const cx = SIZE / 2, cy = SIZE / 2;
            const img = c.createImageData(SIZE, SIZE);
            for (let y = 0; y < SIZE; y++) {
                for (let x = 0; x < SIZE; x++) {
                    const dx = x - cx, dy = y - cy;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d < RING_INNER || d > RING_OUTER) continue;
                    let ang = Math.atan2(-dy, dx) * 180 / Math.PI;
                    if (ang < 0) ang += 360;
                    const [r, g, b] = hsvToRgb(ang, 1, 1);
                    const i = (y * SIZE + x) * 4;
                    img.data[i] = r;
                    img.data[i + 1] = g;
                    img.data[i + 2] = b;
                    img.data[i + 3] = 255;
                }
            }
            c.putImageData(img, 0, 0);
            ringCache = off;
        };

        const drawSV = () => {
            const cx = SIZE / 2, cy = SIZE / 2;
            const x0 = cx - SV_HALF, y0 = cy - SV_HALF;
            const w = SV_HALF * 2, hgt = SV_HALF * 2;
            const [hr, hg, hb] = hsvToRgb(h, 1, 1);
            const grad1 = ctx.createLinearGradient(x0, 0, x0 + w, 0);
            grad1.addColorStop(0, "#fff");
            grad1.addColorStop(1, `rgb(${hr}, ${hg}, ${hb})`);
            ctx.fillStyle = grad1;
            ctx.fillRect(x0, y0, w, hgt);
            const grad2 = ctx.createLinearGradient(0, y0, 0, y0 + hgt);
            grad2.addColorStop(0, "rgba(0,0,0,0)");
            grad2.addColorStop(1, "#000");
            ctx.fillStyle = grad2;
            ctx.fillRect(x0, y0, w, hgt);
            ctx.strokeStyle = "#444";
            ctx.lineWidth = 1;
            ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, hgt - 1);

            const sx = x0 + s * w;
            const sy = y0 + (1 - v) * hgt;
            ctx.beginPath();
            ctx.arc(sx, sy, 5, 0, Math.PI * 2);
            ctx.lineWidth = 2; ctx.strokeStyle = "#000"; ctx.stroke();
            ctx.beginPath();
            ctx.arc(sx, sy, 5, 0, Math.PI * 2);
            ctx.lineWidth = 1; ctx.strokeStyle = "#fff"; ctx.stroke();
        };

        const drawHueCursor = () => {
            const cx = SIZE / 2, cy = SIZE / 2;
            const r = (RING_INNER + RING_OUTER) / 2;
            const ang = h * Math.PI / 180;
            const x = cx + r * Math.cos(ang);
            const y = cy - r * Math.sin(ang);
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.lineWidth = 2; ctx.strokeStyle = "#000"; ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.lineWidth = 1; ctx.strokeStyle = "#fff"; ctx.stroke();
        };

        const drawWheel = () => {
            if (!ringCache) buildRingCache();
            ctx.clearRect(0, 0, SIZE, SIZE);
            ctx.drawImage(ringCache, 0, 0);
            drawSV();
            drawHueCursor();
        };

        const sync = () => {
            $("#tx-hsv-h").value = Math.round(h);
            $("#tx-hsv-h-num").value = Math.round(h);
            $("#tx-hsv-s").value = Math.round(s * 100);
            $("#tx-hsv-s-num").value = Math.round(s * 100);
            $("#tx-hsv-v").value = Math.round(v * 100);
            $("#tx-hsv-v-num").value = Math.round(v * 100);
            const [r, g, b] = hsvToRgb(h, s, v);
            $("#tx-hsv-r").textContent = r;
            $("#tx-hsv-g").textContent = g;
            $("#tx-hsv-b").textContent = b;
            $("#tx-hsv-swatch").style.background = `rgb(${r}, ${g}, ${b})`;
            drawWheel();
        };

        body.addEventListener("input", (e) => {
            const id = e.target.id;
            if      (id === "tx-hsv-h" || id === "tx-hsv-h-num") h = +e.target.value;
            else if (id === "tx-hsv-s" || id === "tx-hsv-s-num") s = (+e.target.value) / 100;
            else if (id === "tx-hsv-v" || id === "tx-hsv-v-num") v = (+e.target.value) / 100;
            sync();
        });

        let drag = null;
        const hitTest = (px, py) => {
            const cx = SIZE / 2, cy = SIZE / 2;
            const dx = px - cx, dy = py - cy;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d >= RING_INNER && d <= RING_OUTER) return "ring";
            if (Math.abs(dx) <= SV_HALF && Math.abs(dy) <= SV_HALF) return "sv";
            return null;
        };
        const updateFromPos = (px, py, mode) => {
            const cx = SIZE / 2, cy = SIZE / 2;
            if (mode === "ring") {
                const dx = px - cx, dy = py - cy;
                let ang = Math.atan2(-dy, dx) * 180 / Math.PI;
                if (ang < 0) ang += 360;
                h = ang;
            } else if (mode === "sv") {
                const x0 = cx - SV_HALF, y0 = cy - SV_HALF;
                const w = SV_HALF * 2;
                s = Math.max(0, Math.min(1, (px - x0) / w));
                v = Math.max(0, Math.min(1, 1 - (py - y0) / w));
            }
            sync();
        };
        const wheelPos = (e) => {
            const rect = wheel.getBoundingClientRect();
            const cx = ((e.touches ? e.touches[0].clientX : e.clientX) - rect.left)
                       * (SIZE / rect.width);
            const cy = ((e.touches ? e.touches[0].clientY : e.clientY) - rect.top)
                       * (SIZE / rect.height);
            return [cx, cy];
        };
        wheel.addEventListener("mousedown", (e) => {
            e.preventDefault();
            const [px, py] = wheelPos(e);
            const mode = hitTest(px, py);
            if (!mode) return;
            drag = mode;
            updateFromPos(px, py, mode);
        });
        const onWinMove = (e) => {
            if (!drag) return;
            const [px, py] = wheelPos(e);
            updateFromPos(px, py, drag);
        };
        const onWinUp = () => { drag = null; };
        window.addEventListener("mousemove", onWinMove);
        window.addEventListener("mouseup", onWinUp);

        sync();

        let modal;
        modal = Modal.open({
            title: L("color.hsv-title", "HSV color picker"),
            body,
            buttons: [
                { label: L("btn.cancel", "Cancel"), role: "cancel" },
                {
                    label: L("btn.ok", "OK"), role: "primary",
                    onClick: () => {
                        const rgb = hsvToRgb(h, s, v);
                        modal.close();
                        onAccept(rgb);
                    },
                },
            ],
        });
        const origClose = modal.close;
        modal.close = function () {
            window.removeEventListener("mousemove", onWinMove);
            window.removeEventListener("mouseup", onWinUp);
            return origClose.apply(modal, arguments);
        };
    }

    // ---- Palette editor -----------------------------------------

    function showPaletteEditor(opts) {
        opts = opts || {};
        const getLabel = opts.getLabel || ((k, fb) => fb);
        const L = getLabel;
        const cols = (opts.cols | 0) > 0 ? (opts.cols | 0) : 8;
        const cellPx = 22;

        // Working copy of the palette — mutated as the user edits, and
        // either returned via onCommit (OK) or thrown away (Cancel).
        const before = opts.palette.map(c => c.slice());
        const draft = opts.palette.map(c => c.slice());
        const n = draft.length;
        let cur = Math.max(0, Math.min(n - 1, opts.currentIndex | 0));

        const body = document.createElement("div");
        body.style.display = "flex";
        body.style.gap = "0.8rem";
        body.style.minWidth = "520px";

        const left = document.createElement("div");
        body.appendChild(left);

        const tools = document.createElement("div");
        tools.style.display = "flex";
        tools.style.gap = "0.3rem";
        tools.style.marginBottom = "0.4rem";
        const mkBtn = (lbl, fn) => {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = lbl;
            b.style.padding = "0.2rem 0.6rem";
            b.addEventListener("click", () => { fn(); canvas.focus(); });
            tools.appendChild(b);
            return b;
        };
        left.appendChild(tools);

        const canvas = document.createElement("canvas");
        const rows = Math.ceil(n / cols);
        canvas.tabIndex = 0;
        canvas.width  = cols * cellPx + 1;
        canvas.height = rows * cellPx + 1;
        canvas.style.outline = "none";
        canvas.style.background = "#000";
        left.appendChild(canvas);

        const right = document.createElement("div");
        right.style.minWidth = "180px";
        right.innerHTML = `
            <div style="border:1px solid #888;padding:0.4rem;margin-bottom:0.4rem">
                <div style="font-weight:bold;margin-bottom:0.2rem">${L("color.index", "Index")}</div>
                <div id="tx-pal-idx" style="font-family:monospace"></div>
            </div>
            <div style="border:1px solid #888;padding:0.4rem;margin-bottom:0.4rem">
                <div style="font-weight:bold;margin-bottom:0.2rem">${L("color.rgb-title", "RGB")}</div>
                <div>R: <span id="tx-pal-r" style="font-family:monospace"></span></div>
                <div>G: <span id="tx-pal-g" style="font-family:monospace"></span></div>
                <div>B: <span id="tx-pal-b" style="font-family:monospace"></span></div>
            </div>
            <div style="border:1px solid #888;padding:0.4rem">
                <div style="font-weight:bold;margin-bottom:0.2rem">${L("color.hsv-title", "HSV")}</div>
                <div>H: <span id="tx-pal-h" style="font-family:monospace"></span></div>
                <div>S: <span id="tx-pal-s" style="font-family:monospace"></span></div>
                <div>V: <span id="tx-pal-v" style="font-family:monospace"></span></div>
            </div>`;
        body.appendChild(right);

        const $ = (sel) => right.querySelector(sel);
        const drawCursor = (ctx) => {
            const cx = (cur % cols) * cellPx;
            const cy = Math.floor(cur / cols) * cellPx;
            ctx.strokeStyle = document.activeElement === canvas ? "#fff" : "#000";
            ctx.lineWidth = 2;
            ctx.strokeRect(cx + 1, cy + 1, cellPx - 1, cellPx - 1);
        };
        const draw = () => {
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < n; i++) {
                const ci = i % cols;
                const cj = Math.floor(i / cols);
                const [r, g, b] = draft[i];
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(ci * cellPx + 1, cj * cellPx + 1,
                             cellPx - 1, cellPx - 1);
            }
            drawCursor(ctx);
        };
        const refreshReadout = () => {
            const [r, g, b] = draft[cur];
            const [h, s, v] = rgbToHsv(r, g, b);
            $("#tx-pal-idx").textContent = String(cur);
            $("#tx-pal-r").textContent = r;
            $("#tx-pal-g").textContent = g;
            $("#tx-pal-b").textContent = b;
            $("#tx-pal-h").textContent = Math.round(h) + "°";
            $("#tx-pal-s").textContent = s.toFixed(3);
            $("#tx-pal-v").textContent = v.toFixed(3);
        };
        const refresh = () => {
            draw();
            refreshReadout();
            if (opts.onPreview) opts.onPreview(draft);
        };

        const editRGB = () => pickRGB(draft[cur], (rgb) => {
            draft[cur] = [rgb[0] | 0, rgb[1] | 0, rgb[2] | 0];
            refresh();
        });
        const editHSV = () => pickHSV(draft[cur], (rgb) => {
            draft[cur] = [rgb[0] | 0, rgb[1] | 0, rgb[2] | 0];
            refresh();
        }, getLabel);
        mkBtn(L("color.edit-rgb", "Edit RGB…"), editRGB);
        mkBtn(L("color.edit-hsv", "Edit HSV…"), editHSV);
        mkBtn(L("color.revert", "Revert"), () => {
            for (let i = 0; i < n; i++) draft[i] = before[i].slice();
            refresh();
        });

        canvas.addEventListener("focus", draw);
        canvas.addEventListener("blur", draw);
        canvas.addEventListener("mousedown", (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const i = Math.floor((e.clientX - rect.left) / cellPx);
            const j = Math.floor((e.clientY - rect.top) / cellPx);
            const idx = i + j * cols;
            if (idx < 0 || idx >= n) return;
            cur = idx;
            canvas.focus();
            refresh();
        });
        canvas.addEventListener("dblclick", () => editHSV());
        canvas.addEventListener("keydown", (e) => {
            const step = (e.ctrlKey || e.metaKey) ? 5 : 1;
            let i = cur % cols;
            let j = Math.floor(cur / cols);
            switch (e.key) {
            case "ArrowLeft":  i -= step; if (i < 0) { i = cols - 1; j = Math.max(0, j - 1); } break;
            case "ArrowRight": i += step; if (i >= cols) { i = 0; j = Math.min(rows - 1, j + 1); } break;
            case "ArrowUp":    j -= step; if (j < 0) j = 0; break;
            case "ArrowDown":  j += step; if (j >= rows) j = rows - 1; break;
            case "Enter":
            case "Return":     (e.ctrlKey ? editRGB : editHSV)();
                               e.preventDefault(); e.stopPropagation(); return;
            case "r": case "R": editRGB(); e.preventDefault(); e.stopPropagation(); return;
            case "h": case "H": editHSV(); e.preventDefault(); e.stopPropagation(); return;
            default:
                if (e.key !== "Escape" && e.key !== "Tab") e.stopPropagation();
                return;
            }
            const idx = i + j * cols;
            if (idx < n) cur = idx;
            e.preventDefault();
            e.stopPropagation();
            refresh();
        });

        const modal = Modal.open({
            title: L("color.palette-title", "Color definition"),
            body,
            buttons: [
                {
                    label: L("btn.cancel", "Cancel"), role: "cancel",
                    onClick: (m) => {
                        if (opts.onCancel) opts.onCancel(before);
                        // Roll back the on-screen preview if any.
                        if (opts.onPreview) opts.onPreview(before);
                        m.close();
                    },
                },
                {
                    label: L("btn.ok", "OK"), role: "primary",
                    onClick: (m) => {
                        if (opts.onCommit) opts.onCommit(draft, cur);
                        m.close();
                    },
                },
            ],
        });
        setTimeout(() => { canvas.focus(); refresh(); }, 0);
        return modal;
    }

    return {
        rgbToHsv, hsvToRgb, rgbToHex, hexToRgb,
        pickRGB, pickHSV, showPaletteEditor,
    };
})();

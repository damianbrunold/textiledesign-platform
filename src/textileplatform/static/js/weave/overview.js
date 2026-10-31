// The overview window: the whole pattern scaled to fit a dialog.

import { editorI18n } from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import { getRangeColor } from "./painters.js";
import { colors, pattern, settings, view } from "./state.js";

let _overviewModal = null;
export function showOverviewWindow() {
    if (_overviewModal) {
        // Toggle: second F4 closes the existing overview.
        _overviewModal.close();
        _overviewModal = null;
        return;
    }
    if (!pattern || !view) return;
    const body = document.createElement("div");
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.height = "100%";
    body.style.width = "100%";
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.background = settings.darcula ? "#333" : "#fff";
    canvas.style.flex = "1 1 auto";
    canvas.style.minHeight = "0";
    body.appendChild(canvas);

    function render() {
        const w = pattern.weave.width;
        const h = pattern.weave.height;
        const cw = canvas.clientWidth || canvas.width;
        const ch = canvas.clientHeight || canvas.height;
        canvas.width = cw;
        canvas.height = ch;
        const ctx2 = canvas.getContext("2d");
        ctx2.fillStyle = settings.darcula ? "#333" : "#fff";
        ctx2.fillRect(0, 0, cw, ch);

        // Match main editor cell size exactly — no rescaling.
        const gw = Math.max(1, settings.dx);
        const gh = Math.max(1, settings.dy);
        const mx = Math.min(Math.floor(cw / gw), w);
        const my = Math.min(Math.floor(ch / gh), h);
        const rtl = !!settings.direction_righttoleft;
        // The main weave pane always renders bottom-up (toptobottom=false
        // in PatternView.layout). Mirror that convention.
        // Match the active display style: "color" or "simulation" → render
        // as farbeffekt (warp/weft colours fill the whole cell); anything
        // else → draft mode (range colour on bg, inset).
        const farbeffekt = settings.style === "color" || settings.style === "simulation";
        const emptyMode = settings.style === "empty" || settings.style === "invisible";
        if (emptyMode) return;
        const bx = Math.floor(gw * settings.bxf);
        const by = Math.floor(gh * settings.byf);

        // In farbeffekt/simulation, empty/unused cells would otherwise be
        // painted solid weft colour and fill the canvas. Restrict that
        // render to the active pattern extent so it only covers the
        // "actually used" region. Draft mode already skips empty cells.
        const iLo = farbeffekt ? Math.max(0, pattern.min_x) : 0;
        const iHi = farbeffekt ? Math.min(mx - 1, pattern.max_x) : mx - 1;
        const jLo = farbeffekt ? Math.max(0, pattern.min_y) : 0;
        const jHi = farbeffekt ? Math.min(my - 1, pattern.max_y) : my - 1;

        const sink = !!settings.sinking_shed;
        for (let j = jLo; j <= jHi; j++) {
            for (let i = iLo; i <= iHi; i++) {
                const v = pattern.weave.get(i, j);
                // "Woven" = warp on top. With sinking shed the mark
                // means the opposite, so the colour effect flips.
                let woven = v > 0 && v !== 12;
                if (sink && farbeffekt) woven = !woven;
                const x = rtl ? (cw - (i + 1) * gw) : (i * gw);
                const y = my * gh - (j + 1) * gh;
                if (farbeffekt) {
                    // Warp colour when the cell is woven ("up"), weft
                    // colour otherwise — port of DrawGewebeFarbeffekt.
                    const colorIdx = woven
                        ? pattern.color_warp.get(i, 0)
                        : pattern.color_weft.get(0, j);
                    const col = colors[colorIdx];
                    if (col) {
                        ctx2.fillStyle = col;
                        ctx2.fillRect(x, y, gw, gh);
                    }
                } else {
                    // Draft ("patrone"): range colour with inset.
                    if (v <= 0) continue;
                    ctx2.fillStyle = getRangeColor(settings, v);
                    ctx2.fillRect(x + bx, y + by, gw - 2 * bx, gh - 2 * by);
                }
            }
        }
    }

    const i18n = editorI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    const m = Modal.open({
        title: L("overview.title", "Overview"),
        className: "tx-modal-fill",
        body,
        buttons: [{ label: L("overview.close", "Close"), role: "cancel" }],
        onClose: () => {
            window.removeEventListener("resize", onResize);
            _overviewModal = null;
        },
    });
    _overviewModal = m;
    setTimeout(render, 0);
    const onResize = () => render();
    window.addEventListener("resize", onResize);
}

// Lancée (Lancierung) for warp and weft: the dialog and the
// transformation (desktop lancierung.cpp).

import { editorI18n } from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import { _fullSnapCommand } from "./history.js";
import {
    applyWarpLancee, applyWeftLancee, lanceePlan, lanceeRange,
} from "./lancee-ops.js";
import { cursor, pattern, settings } from "./state.js";

// ---- Phase 8d: Lancée (warp / weft) ---------------------------------
//
// Direct port of utilities.cpp::KettLancierungClick /
// SchussLancierungClick + the 6-slot EnterVVDialog (the computation is
// in lancee-ops.js). Inserts blanks into
// the active range so that runs of "vv[0]" original threads are
// followed by "vv[1]" empty insertions, alternating cyclically.

// 6-slot ratio dialog. Subsequent slots enable as the previous one
// becomes non-zero. Calls onAccept(vv[]) where vv is a 6-element
// integer array.
export function showLancierungDialog(onAccept) {
    const i18n = editorI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;
    const body = document.createElement("div");
    body.innerHTML = `
        <div style="margin-bottom:0.5rem">${L("lancee.prompt", "Enter the thread ratio:")}</div>
        <div id="tx-vv-row" style="display:flex;align-items:center;gap:0.3rem"></div>`;
    const row = body.querySelector("#tx-vv-row");
    const inputs = [];
    for (let i = 0; i < 6; i++) {
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0"; input.max = "999"; input.step = "1";
        input.style.width = "3rem";
        input.disabled = (i > 0);
        inputs.push(input);
        row.appendChild(input);
        if (i < 5) {
            const sep = document.createElement("span");
            sep.textContent = ":";
            row.appendChild(sep);
        }
        input.addEventListener("input", () => {
            const v = parseInt(input.value, 10) || 0;
            if (v === 0) {
                for (let k = i + 1; k < 6; k++) {
                    inputs[k].value = "";
                    inputs[k].disabled = true;
                }
            } else if (i + 1 < 6) {
                inputs[i + 1].disabled = false;
            }
        });
    }
    let modal;
    const apply = () => {
        const vv = inputs.map(el => parseInt(el.value, 10) || 0);
        modal.close();
        onAccept(vv);
    };
    modal = Modal.open({
        title: L("lancee.title", "Thread ratio"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok", "OK"), role: "primary", onClick: () => apply() },
        ],
    });
    setTimeout(() => inputs[0].focus(), 0);
}

// _kettLancierung — port of KettLancierungClick.
export function _kettLancierung(vvIn) {
    const { a, b } = lanceeRange(pattern, cursor, "warp");
    const plan = lanceePlan(vvIn, a, b, pattern.weave.width);
    if (!plan) return;
    _fullSnapCommand("warp lancée", () => applyWarpLancee(pattern, plan, a, b));
}

// _schussLancierung — port of SchussLancierungClick.
export function _schussLancierung(vvIn) {
    const { a, b } = lanceeRange(pattern, cursor, "weft");
    const plan = lanceePlan(vvIn, a, b, pattern.weave.height);
    if (!plan) return;
    _fullSnapCommand("weft lancée", () => {
        const sideGrid = settings.display_pegplan ? pattern.pegplan : pattern.treadling;
        applyWeftLancee(pattern, plan, a, b, sideGrid);
    });
}

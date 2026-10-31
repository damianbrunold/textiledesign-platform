// Lancée (Lancierung) for warp and weft: the dialog and the
// transformation (desktop lancierung.cpp).

import { editorI18n } from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import { _fullSnapCommand } from "./history.js";
import { cursor, pattern, settings } from "./state.js";

// ---- Phase 8d: Lancée (warp / weft) ---------------------------------
//
// Direct port of utilities.cpp::KettLancierungClick /
// SchussLancierungClick + the 6-slot EnterVVDialog. Inserts blanks into
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
    const vv = vvIn.slice();
    let maxi = 0;
    for (let k = 0; k < 6; k++) if (vv[k] !== 0) maxi = k + 1;
    if (maxi > 1 && (maxi % 2) !== 0) {
        vv[0] += vv[maxi - 1];
        vv[maxi - 1] = 0;
        maxi--;
    }
    if (maxi <= 1) return;

    let a, b;
    const hasSel = (cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2);
    if (hasSel) {
        a = Math.min(cursor.x1, cursor.x2);
        b = Math.max(cursor.x1, cursor.x2);
    } else {
        a = pattern.min_x;
        b = pattern.max_x;
    }
    if (a > b) return;

    // Compute "needed" extra width (port of legacy do/while).
    let needed = b - a + 1;
    {
        let i = a, idx = 0;
        do {
            let v = vv[idx];
            while (i <= b && v-- > 0) i++;
            idx = (idx + 1) % maxi;
            if (i <= b + 1) {
                needed += vv[idx];
                idx = (idx + 1) % maxi;
            }
        } while (i <= b);
    }
    if (a + needed >= pattern.weave.width) {
        needed = pattern.weave.width - 1 - a;
    }
    if (needed <= 0) return;

    _fullSnapCommand("warp lancée", () => {
        // Fill buff[0..needed-1] with source warp index or -1 for blank.
        const buff = new Array(needed);
        let idx = 0, ii = 0;
        for (let i = a; i <= b; i++) {
            for (let j = 0; j < vv[idx]; j++) {
                buff[ii++] = i++;
                if (ii >= needed || i - 1 > b) break;
            }
            i--;
            if (ii >= needed) break;
            idx = (idx + 1) % maxi;
            for (let j = 0; j < vv[idx]; j++) {
                buff[ii++] = -1;
                if (ii >= needed) break;
            }
            idx = (idx + 1) % maxi;
            if (ii >= needed) break;
        }

        // Shift right side to make room.
        const maxii = Math.min(pattern.weave.width, pattern.max_x - b + 1);
        for (let i = b + maxii - 1; i > b; i--) {
            const dst = a + needed + i - b - 1;
            if (dst >= pattern.entering.width) continue;
            pattern.entering.set_shaft(dst, pattern.entering.get_shaft(i));
            for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                pattern.weave.set(dst, j, pattern.weave.get(i, j));
            }
        }
        // Auseinanderziehen — write expanded values from buff.
        for (let i = a + needed - 1; i >= a; i--) {
            const src = buff[i - a];
            if (src === undefined) continue;
            if (src === -1) {
                pattern.entering.set_shaft(i, 0);
                for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                    pattern.weave.set(i, j, 0);
                }
            } else {
                pattern.entering.set_shaft(i, pattern.entering.get_shaft(src));
                for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                    pattern.weave.set(i, j, pattern.weave.get(src, j));
                }
            }
        }
        pattern.recalc_weave_extent();
    });
}

// _schussLancierung — port of SchussLancierungClick.
export function _schussLancierung(vvIn) {
    const vv = vvIn.slice();
    let maxi = 0;
    for (let k = 0; k < 6; k++) if (vv[k] !== 0) maxi = k + 1;
    if (maxi > 1 && (maxi % 2) !== 0) {
        vv[0] += vv[maxi - 1];
        vv[maxi - 1] = 0;
        maxi--;
    }
    if (maxi <= 1) return;

    let a, b;
    const hasSel = (cursor.x1 !== cursor.x2 || cursor.y1 !== cursor.y2);
    if (hasSel) {
        a = Math.min(cursor.y1, cursor.y2);
        b = Math.max(cursor.y1, cursor.y2);
    } else {
        a = pattern.min_y;
        b = pattern.max_y;
    }
    if (a > b) return;

    let needed = b - a + 1;
    {
        let i = a, idx = 0;
        do {
            let v = vv[idx];
            while (i <= b && v-- > 0) i++;
            idx = (idx + 1) % maxi;
            if (i <= b + 1) {
                needed += vv[idx];
                idx = (idx + 1) % maxi;
            }
        } while (i <= b);
    }
    if (a + needed >= pattern.weave.height) {
        needed = pattern.weave.height - 1 - a;
    }
    if (needed <= 0) return;

    _fullSnapCommand("weft lancée", () => {
        const buff = new Array(needed);
        let idx = 0, ii = 0;
        for (let i = a; i <= b; i++) {
            for (let j = 0; j < vv[idx]; j++) {
                buff[ii++] = i++;
                if (ii >= needed || i - 1 > b) break;
            }
            i--;
            if (ii >= needed) break;
            idx = (idx + 1) % maxi;
            for (let j = 0; j < vv[idx]; j++) {
                buff[ii++] = -1;
                if (ii >= needed) break;
            }
            idx = (idx + 1) % maxi;
            if (ii >= needed) break;
        }

        const sideGrid = settings.display_pegplan ? pattern.pegplan : pattern.treadling;
        const maxjj = Math.min(pattern.weave.height, pattern.max_y - b + 1);
        // Shift right side rows down to make room.
        for (let j = b + maxjj - 1; j > b; j--) {
            const dst = a + needed + j - b - 1;
            if (dst >= pattern.weave.height) continue;
            for (let i = 0; i < sideGrid.width; i++) {
                sideGrid.set(i, dst, sideGrid.get(i, j));
            }
            for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                pattern.weave.set(i, dst, pattern.weave.get(i, j));
            }
        }
        // Apply buff to rows [a..a+needed-1].
        for (let j = a + needed - 1; j >= a; j--) {
            const src = buff[j - a];
            if (src === undefined) continue;
            if (src === -1) {
                for (let i = 0; i < sideGrid.width; i++) sideGrid.set(i, j, 0);
                for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                    pattern.weave.set(i, j, 0);
                }
            } else {
                for (let i = 0; i < sideGrid.width; i++) {
                    sideGrid.set(i, j, sideGrid.get(i, src));
                }
                for (let i = pattern.min_x; i <= pattern.max_x; i++) {
                    pattern.weave.set(i, j, pattern.weave.get(i, src));
                }
            }
        }
        pattern.recalc_weave_extent();
    });
}

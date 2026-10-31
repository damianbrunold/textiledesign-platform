// The threading wizard (desktop Einzugassistent).

import { editorI18n } from "../ui/common.js";
import { Modal } from "../ui/modal.js";
import { _fullSnapCommand } from "./history.js";
import { pattern, readonly } from "./state.js";
import {
    checkSteppedParams, threadStepped, threadStraight,
} from "./threading-wizard-ops.js";

// ---- Phase 8g: Threading wizard (Einzugassistent) -------------------
//
// Port of einzugassistentdialog.cpp. Two modes:
//   Straight through (Geradedurch)  — fills entering with a straight
//                                      diagonal. Z = rising, S = falling.
//   Stepped (Abgesetzt)             — broken twill: runs of `gratlen`
//                                      warps stepping +1, then jump
//                                      shafts by `versatz`, repeat.
// The threadings themselves are in threading-wizard-ops.js.

function _ezAssistentGerade(firstKF, firstSchaft, schaefte, steigend) {
    _fullSnapCommand("threading wizard (straight)", () => {
        threadStraight(pattern, firstKF, firstSchaft, schaefte, steigend);
        pattern.recalc_weave();
    });
}

function _ezAssistentAbgesetzt(firstKF, firstSchaft, schaefte, gratlen, versatz) {
    _fullSnapCommand("threading wizard (stepped)", () => {
        threadStepped(pattern, firstKF, firstSchaft, schaefte, gratlen, versatz);
        pattern.recalc_weave();
    });
}

export function showThreadingWizardDialog() {
    if (readonly) return;
    const i18n = editorI18n();
    const L = (k, fallback) => (i18n.actions[k] && i18n.actions[k].label) || fallback;

    const body = document.createElement("div");
    body.innerHTML = `
        <div style="margin-bottom:0.6rem">
          <label style="margin-right:1rem">
            <input type="radio" name="tx-ez-mode" value="gerade" checked>
            ${L("ez.assist.straight", "Straight through")}
          </label>
          <label>
            <input type="radio" name="tx-ez-mode" value="abgesetzt">
            ${L("ez.assist.stepped", "Stepped")}
          </label>
        </div>
        <div id="tx-ez-gerade" style="display:grid;grid-template-columns:auto auto;gap:0.4rem 1rem;align-items:center">
          <label>${L("ez.assist.first-warp", "First warp thread:")}</label>
          <input id="tx-ez-gd-firstkf" type="number" min="1" step="1" value="1" style="width:5rem">
          <label>${L("ez.assist.first-shaft", "First shaft:")}</label>
          <input id="tx-ez-gd-firstsch" type="number" min="1" step="1" value="1" style="width:5rem">
          <label>${L("ez.assist.shaft-count", "Number of shafts:")}</label>
          <input id="tx-ez-gd-schaefte" type="number" min="1" step="1" value="4" style="width:5rem">
          <label>${L("ez.assist.orientation", "Orientation:")}</label>
          <span>
            <label><input type="radio" name="tx-ez-gd-zs" value="z" checked> Z</label>
            <label style="margin-left:1rem"><input type="radio" name="tx-ez-gd-zs" value="s"> S</label>
          </span>
        </div>
        <div id="tx-ez-abgesetzt" style="display:none;grid-template-columns:auto auto;gap:0.4rem 1rem;align-items:center">
          <label>${L("ez.assist.first-warp", "First warp thread:")}</label>
          <input id="tx-ez-ab-firstkf" type="number" min="1" step="1" value="1" style="width:5rem">
          <label>${L("ez.assist.first-shaft", "First shaft:")}</label>
          <input id="tx-ez-ab-firstsch" type="number" min="1" step="1" value="1" style="width:5rem">
          <label>${L("ez.assist.shaft-count", "Number of shafts:")}</label>
          <input id="tx-ez-ab-schaefte" type="number" min="1" step="1" value="4" style="width:5rem">
          <label>${L("ez.assist.gratlen", "Run length (Gratlänge):")}</label>
          <input id="tx-ez-ab-gratlen" type="number" min="1" step="1" value="4" style="width:5rem">
          <label>${L("ez.assist.versatz", "Offset (Versatz):")}</label>
          <input id="tx-ez-ab-versatz" type="number" step="1" value="2" style="width:5rem">
        </div>
        <div id="tx-ez-error" style="margin-top:0.6rem;color:#c33;font-size:12px"></div>`;

    const switchMode = () => {
        const mode = body.querySelector("input[name='tx-ez-mode']:checked").value;
        body.querySelector("#tx-ez-gerade").style.display =
            (mode === "gerade") ? "grid" : "none";
        body.querySelector("#tx-ez-abgesetzt").style.display =
            (mode === "abgesetzt") ? "grid" : "none";
        body.querySelector("#tx-ez-error").textContent = "";
    };
    body.addEventListener("change", (e) => {
        if (e.target.name === "tx-ez-mode") switchMode();
    });

    let modal;
    const apply = () => {
        const errEl = body.querySelector("#tx-ez-error");
        errEl.textContent = "";
        const mode = body.querySelector("input[name='tx-ez-mode']:checked").value;
        if (mode === "gerade") {
            const firstKF   = parseInt(body.querySelector("#tx-ez-gd-firstkf").value, 10) || 1;
            const firstSch  = parseInt(body.querySelector("#tx-ez-gd-firstsch").value, 10) || 1;
            const schaefte  = parseInt(body.querySelector("#tx-ez-gd-schaefte").value, 10) || 1;
            const z = body.querySelector("input[name='tx-ez-gd-zs']:checked").value === "z";
            _ezAssistentGerade(firstKF, firstSch, schaefte, z);
        } else {
            const firstKF   = parseInt(body.querySelector("#tx-ez-ab-firstkf").value, 10) || 1;
            const firstSch  = parseInt(body.querySelector("#tx-ez-ab-firstsch").value, 10) || 1;
            const schaefte  = parseInt(body.querySelector("#tx-ez-ab-schaefte").value, 10) || 1;
            const glen      = parseInt(body.querySelector("#tx-ez-ab-gratlen").value, 10) || 1;
            const versatz   = parseInt(body.querySelector("#tx-ez-ab-versatz").value, 10) || 0;
            const invalid = checkSteppedParams(schaefte, glen, versatz);
            if (invalid === "gratlen") {
                errEl.textContent = L("ez.assist.err-gratlen",
                    "Run length must be between 1 and the number of shafts.");
                return;
            }
            if (invalid === "versatz") {
                errEl.textContent = L("ez.assist.err-versatz",
                    "Offset must be between 1 and the number of shafts.");
                return;
            }
            _ezAssistentAbgesetzt(firstKF, firstSch, schaefte, glen, versatz);
        }
        modal.close();
    };

    modal = Modal.open({
        title: L("ez.assist.title", "Threading wizard"),
        body,
        buttons: [
            { label: L("btn.cancel", "Cancel"), role: "cancel" },
            { label: L("btn.ok", "OK"), role: "primary", onClick: () => apply() },
        ],
    });
    setTimeout(() => body.querySelector("#tx-ez-gd-firstkf").focus(), 0);
}

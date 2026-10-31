// Transition bridge: the classic JBead editor script still uses these as
// globals. Module scripts run after the classic ones but before the
// window `load` event that starts the editor, so everything is in place
// by the time it is first used.
//
// Remove a name from here once no classic script refers to it.

import { BeadList, loadModel, Pattern, storeModel } from "./model.js";
import {
    affectedRect, captureGroup, restoreBaseline, stampGroup,
} from "./selection.js";
import {
    arrangeCopies, arrangeUndoRows, resizedData, selectionSource,
    withRowDeleted, withRowInserted,
} from "./transforms.js";

export function install(target) {
    Object.assign(target, {
        BeadList, loadModel, Pattern, storeModel,
        affectedRect, captureGroup, restoreBaseline, stampGroup,
        arrangeCopies, arrangeUndoRows, resizedData, selectionSource,
        withRowDeleted, withRowInserted,
    });
}

if (typeof window !== "undefined") install(window);

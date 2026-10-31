// Transition bridge: the classic DB-WEAVE editor scripts still use these
// as globals. Module scripts run after the classic ones but before the
// window `load` event that starts the editor, so everything is in place
// by the time it is first used.
//
// Remove a name from here once no classic script refers to it.

import {
    arrangeThreading, arrangeTreadling, recalcFixedEntering,
    updateFixedEntering,
} from "./arrange.js";
import {
    ATLAS_OFFSETS, completeTwill, stampAtlas, stampTwill,
} from "./generators.js";
import {
    loadPatternData, loadSettings, storePatternData, storeSettings,
} from "./io.js";
import { Entering, Grid, Muster, Pattern } from "./model.js";

export function install(target) {
    Object.assign(target, {
        Entering, Grid, Muster, Pattern,
        loadPatternData, loadSettings, storePatternData, storeSettings,
        arrangeThreading, arrangeTreadling, recalcFixedEntering,
        updateFixedEntering,
        ATLAS_OFFSETS, completeTwill, stampAtlas, stampTwill,
    });
}

if (typeof window !== "undefined") install(window);

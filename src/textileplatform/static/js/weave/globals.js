// Transition bridge: the classic DB-WEAVE editor scripts still use the
// model classes as globals. Module scripts run after the classic ones
// but before the window `load` event that starts the editor, so the
// classes are in place by the time they are first used.
//
// Remove a class from here once no classic script refers to it.

import { Entering, Grid, Muster, Pattern } from "./model.js";

export function install(target) {
    Object.assign(target, { Entering, Grid, Muster, Pattern });
}

if (typeof window !== "undefined") install(window);

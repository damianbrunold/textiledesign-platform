// Transition bridge: the classic editor scripts (dbweave.js, jbead.js,
// common.js) still use the shared UI pieces as globals. Module scripts
// run after the classic ones but before the window `load` event that
// starts the editors, so everything is in place by the time it is first
// used.
//
// Remove a name from here once no classic script refers to it.

import { ActionRegistry } from "./actions.js";
import { ColorPicker } from "./colorpicker.js";
import {
    CommandBus, makeCellCommand, makeEnteringCommand, makeGridRegionCommand,
    restoreEntering, restoreGridRegion, snapshotEntering, snapshotGridRegion,
} from "./commands.js";
import { LegalDialog } from "./legal.js";
import { Menu } from "./menu.js";
import { Modal } from "./modal.js";
import { Clipboard, Selection } from "./selection.js";
import { Shortcuts } from "./shortcuts.js";
import { ToolRaster } from "./tools.js";

export function install(target) {
    Object.assign(target, {
        ActionRegistry, ColorPicker,
        CommandBus, makeCellCommand, makeEnteringCommand, makeGridRegionCommand,
        restoreEntering, restoreGridRegion, snapshotEntering, snapshotGridRegion,
        LegalDialog, Menu, Modal, Clipboard, Selection, Shortcuts, ToolRaster,
    });
}

if (typeof window !== "undefined") install(window);

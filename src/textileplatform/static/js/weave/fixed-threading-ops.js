// Editing the fixed (user-defined) threading template, behind the
// dialog in fixed-threading.js.
//
//   fixedThreadingScratch(pattern)             -> editing buffer
//   fixedThreadingSize(scratch)                -> last used index
//   fixedThreadingFirstFree(scratch)           -> highest shaft
//   toggleFixedThreading(scratch, warp, shaft) -> new size
//   isContinuousThreading(scratch, size)
//   commitFixedThreading(pattern, scratch, size)
//
// The template (pattern.fixeinzug) holds one 1-based shaft per warp,
// used 0..fixsize and repeated out to the threading width; firstfree is
// the highest shaft the template uses. No DOM, no editor globals; port
// of fixeinzugdialog.cpp (the recalculation from the template is
// arrange.js recalcFixedEntering).

// The dialog's editing buffer when it opens (and after "Take from
// pattern"): a copy of the stored template.
export function fixedThreadingScratch(pattern) {
    return pattern.fixeinzug.slice();
}

// Index of the last used warp (0 when none is used).
export function fixedThreadingSize(scratch) {
    let size = 0;
    for (let i = 0; i < scratch.length; i++) if (scratch[i] !== 0) size = i;
    return size;
}

// Highest shaft used by the template (0 when empty).
export function fixedThreadingFirstFree(scratch) {
    let ff = 0;
    for (let i = 0; i < scratch.length; i++) if (scratch[i] >= ff) ff = scratch[i];
    return ff;
}

// Click on warp `warp`, shaft index `shaft` (0-based): thread the warp
// there, or unthread it when it already is. Returns the new size.
export function toggleFixedThreading(scratch, warp, shaft) {
    const old = scratch[warp];
    scratch[warp] = (old === shaft + 1) ? 0 : (shaft + 1);
    return fixedThreadingSize(scratch);
}

// A template must have no unthreaded warp before its last one.
export function isContinuousThreading(scratch, size) {
    for (let i = 0; i < size; i++) {
        if (scratch[i] === 0) return false;
    }
    return true;
}

// Store the edited template: entries 0..size, repeated out to the
// threading width.
export function commitFixedThreading(pattern, scratch, size) {
    const W = pattern.entering.width;
    pattern.fixeinzug = scratch.slice();
    pattern.fixsize = size;
    pattern.firstfree = fixedThreadingFirstFree(scratch);
    if (size >= 0) {
        let kk = 0;
        for (let i = size + 1; i < W; i++) {
            pattern.fixeinzug[i] = pattern.fixeinzug[kk++];
            if (kk > size) kk = 0;
        }
    }
}

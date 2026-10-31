// The threadings the threading wizard (desktop Einzugassistent)
// generates, behind the dialog in threading-wizard.js.
//
//   threadStraight(pattern, firstWarp, firstShaft, shafts, rising)
//   threadStepped(pattern, firstWarp, firstShaft, shafts, runLength, offset)
//   checkSteppedParams(shafts, runLength, offset)  -> null | "gratlen" | "versatz"
//
// Warp and shaft numbers are 1-based, as in the dialog. Only the
// threading changes (warps outside the generated run keep theirs); the
// caller recalculates the weave. Shafts beyond the tie-up end the run
// (the desktop adds shafts instead). No DOM, no editor globals; port of
// einzugassistentdialog.cpp createGerade / createAbgesetzt.

// Straight draw over `shafts` warps from firstWarp: shafts firstShaft ..
// firstShaft + shafts - 1, rising (Z) or falling (S).
export function threadStraight(pattern, firstKF, firstSchaft, schaefte, steigend) {
    const maxShaft = pattern.tieup.height;
    const maxWarp = pattern.entering.width;
    if (steigend) {
        for (let i = firstKF - 1; i < firstKF - 1 + schaefte; i++) {
            let s = firstSchaft + (i - (firstKF - 1));
            if (s > maxShaft) break;          // clamp instead of ExtendSchaefte
            if (i >= maxWarp) break;
            pattern.entering.set_shaft(i, s);
        }
    } else {
        for (let i = firstKF - 1; i < firstKF - 1 + schaefte; i++) {
            let s = firstSchaft + (firstKF - 1 + schaefte - 1)
                    - (i - (firstKF - 1));
            if (s > maxShaft) break;
            if (s <= 0) break;
            if (i >= maxWarp) break;
            pattern.entering.set_shaft(i, s);
        }
    }
}

// Stepped (broken) draw: runs of `gratlen` warps on consecutive rising
// shafts, each run starting `versatz` shafts after the previous run's
// start, until shaft firstShaft + shafts - 1 is reached (or a shaft
// would be < 1).
export function threadStepped(pattern, firstKF, firstSchaft, schaefte, gratlen, versatz) {
    const maxShaft = pattern.tieup.height;
    const maxWarp = pattern.entering.width;
    let i = firstKF - 1;
    let j = firstSchaft - 1;
    outer: while (true) {
        for (let ii = 0; ii < gratlen; ii++) {
            const s = j + ii + 1;
            if (s - firstSchaft >= schaefte) break outer;
            if (s <= 0) break outer;
            if (s > maxShaft) break outer;
            if (i + ii >= maxWarp) break outer;
            pattern.entering.set_shaft(i + ii, s);
            if (s - firstSchaft + 1 === schaefte) break outer;
        }
        i += gratlen;
        j += versatz;
    }
}

// The dialog's checks for the stepped draw: the failing field, or null.
export function checkSteppedParams(schaefte, gratlen, versatz) {
    if (gratlen < 1 || gratlen > schaefte) return "gratlen";
    if (Math.abs(versatz) < 1 || Math.abs(versatz) > schaefte) return "versatz";
    return null;
}

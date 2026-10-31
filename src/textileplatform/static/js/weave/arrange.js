// Threading and treadling arrangement ("Threading ▸ Arrange…" /
// "Treadling ▸ Arrange…" styles), applied after every weave-driven
// recalculation, and the fixed (user-defined) threading.
//
//   arrangeTreadling(pattern, style, { pegplan })
//       "minimal-z" | "minimal-s" | "gesprungen"
//   arrangeThreading(pattern, style, { pegplan })
//       "minimal-z" | "minimal-s" | "gerade-z" | "gerade-s" |
//       "chorig-2" | "chorig-3"
//   recalcFixedEntering(pattern), updateFixedEntering(pattern)
//
// Ports of the desktop's trittfolge.cpp::RearrangeTritte,
// einzug.cpp::NormalZ/S, GeradeZ/S, Chorig2/3 and
// recalc.cpp::RecalcEinzugFixiert, moved out of dbweave.js. The
// arrangement code keeps the desktop's structure: the functions of one
// run share a closure over `pattern` (and the run's range state).

// ---------- treadling --------------------------------------------------
//
// Port of trittfolge.cpp::RearrangeTritte and helpers (MoveTritt,
// AufknuepfungsspalteEqual, MergeTritte, EliminateEmptyTritt,
// SwitchTritte). Only in non-pegplan mode: the desktop's
// RearrangeTritte returns early in pegplan mode.

export const TREADLING_STYLES = ["minimal-z", "minimal-s", "gesprungen"];

export function arrangeTreadling(pattern, style, { pegplan = false } = {}) {
    if (!TREADLING_STYLES.includes(style)) return;

    function _isFreeTritt(i) {
        // True iff treadle column i has no positive cell.
        for (let j = 0; j < pattern.treadling.height; j++) {
            if (pattern.treadling.get(i, j) > 0) return false;
        }
        return true;
    }

    function _moveTritt(from, to) {
        for (let j = pattern.min_y; j <= pattern.max_y; j++) {
            pattern.treadling.set(to, j, pattern.treadling.get(from, j));
            pattern.treadling.set(from, j, 0);
        }
        for (let j = 0; j < pattern.tieup.height; j++) {
            pattern.tieup.set(to, j, pattern.tieup.get(from, j));
            pattern.tieup.set(from, j, 0);
        }
    }

    function _aufknuepfungsspalteEqual(i1, i2) {
        let nonempty = false;
        for (let j = 0; j < pattern.tieup.height; j++) {
            const s1 = pattern.tieup.get(i1, j);
            const s2 = pattern.tieup.get(i2, j);
            if (s1 > 0 || s2 > 0) nonempty = true;
            if (s1 <= 0 && s2 > 0) return false;
            if (s1 > 0 && s2 <= 0) return false;
            if (s1 > 0 && s2 > 0 && s1 !== s2) return false;
        }
        return nonempty;
    }

    function _mergeTritte() {
        if (pegplan) return;
        let found;
        do {
            found = false;
            for (let i = 0; i < pattern.tieup.width && !found; i++) {
                for (let ii = 0; ii < i; ii++) {
                    if (_aufknuepfungsspalteEqual(i, ii)) {
                        for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                            if (pattern.treadling.get(i, j) > 0) {
                                pattern.treadling.set(ii, j, pattern.treadling.get(i, j));
                                pattern.treadling.set(i, j, 0);
                            }
                        }
                        for (let j = 0; j < pattern.tieup.height; j++) {
                            pattern.tieup.set(i, j, 0);
                        }
                        found = true;
                        break;
                    }
                }
            }
        } while (found);
    }

    function _eliminateEmptyTritt() {
        for (let i = 0; i < pattern.tieup.width; i++) {
            if (_isFreeTritt(i)) {
                let firstnon = -1;
                for (let k = i; k < pattern.tieup.width; k++) {
                    if (!_isFreeTritt(k)) { firstnon = k; break; }
                }
                if (firstnon === -1 || firstnon < i) return;
                _moveTritt(firstnon, i);
            }
        }
    }

    function _switchTritte(a, b) {
        for (let j = pattern.min_y; j <= pattern.max_y; j++) {
            const t = pattern.treadling.get(a, j);
            pattern.treadling.set(a, j, pattern.treadling.get(b, j));
            pattern.treadling.set(b, j, t);
        }
        for (let j = 0; j < pattern.tieup.height; j++) {
            const t = pattern.tieup.get(a, j);
            pattern.tieup.set(a, j, pattern.tieup.get(b, j));
            pattern.tieup.set(b, j, t);
        }
    }

    function _rearrangeTritte(style) {
        if (pegplan) return;
        if (pattern.min_y > pattern.max_y) return;
        let i1 = 0, i2 = 0;
        let found = false;
        outerA: for (let ii = 0; ii < pattern.tieup.width; ii++) {
            for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                if (pattern.treadling.get(ii, j) > 0) { i1 = ii; found = true; break outerA; }
            }
        }
        if (!found) return;
        found = false;
        outerB: for (let ii = pattern.tieup.width - 1; ii > 0; ii--) {
            for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                if (pattern.treadling.get(ii, j) > 0) { i2 = ii; found = true; break outerB; }
            }
        }
        if (!found) return;

        _mergeTritte();

        if (style === "minimal-z") {
            outerZ: for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                for (let ii = i1; ii <= i2; ii++) {
                    if (pattern.treadling.get(ii, j) > 0) {
                        if (ii > i1) _switchTritte(i1, ii);
                        i1++;
                        if (i1 >= i2) break outerZ;
                    }
                }
            }
        } else if (style === "minimal-s") {
            outerS: for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                for (let ii = i2; ii >= i1; ii--) {
                    if (pattern.treadling.get(ii, j) > 0) {
                        if (ii < i2) _switchTritte(i2, ii);
                        i2--;
                        if (i2 <= i1) break outerS;
                    }
                }
            }
        } else if (style === "gesprungen") {
            let b = 0;
            outerG: for (let j = pattern.min_y; j <= pattern.max_y; j++) {
                for (let ii = i1; ii <= i2; ii++) {
                    if (pattern.treadling.get(ii, j) > 0) {
                        if ((b % 2) === 0) {
                            if (ii > i1 && ii <= i2) _switchTritte(i1, ii);
                            i1++;
                            if (i1 >= i2) break outerG;
                        } else {
                            if (ii < i2 && ii >= i1) _switchTritte(i2, ii);
                            i2--;
                            if (i2 <= i1) break outerG;
                        }
                        b = (b + 1) % 2;
                    }
                }
            }
        }
        _eliminateEmptyTritt();
    }

    _rearrangeTritte(style);
}

// ---------- threading --------------------------------------------------
//
// Port of einzug.cpp::NormalZ / NormalS / GeradeZ / GeradeS / Chorig2 /
// Chorig3 and helpers (CalcRange, IsTotalEmptySchaft,
// EliminateEmptySchaft, SchaefteEqual, MergeSchaefte, SwitchSchaefte,
// MoveSchaft, CalcRapportRange, SplitSchaft). "fixiert" is not an
// arrangement: Pattern.recalc_from_weave rebuilds the threading with
// recalcFixedEntering instead.

export const THREADING_STYLES = [
    "minimal-z", "minimal-s", "gerade-z", "gerade-s", "chorig-2", "chorig-3",
];

export function arrangeThreading(pattern, style, { pegplan = false } = {}) {
    function _isFreeSchaft(j) {
        // True iff no warp is threaded to shaft j+1 (1-based).
        for (let i = 0; i < pattern.entering.width; i++) {
            if (pattern.entering.get_shaft(i) === j + 1) return false;
        }
        return true;
    }

    let _ezJ1 = 0, _ezJ2 = 0;  // shared state used by the algorithm.

    function _ezCalcRange() {
        _ezJ1 = 0; _ezJ2 = 0;
        for (let i = 0; i < pattern.entering.width; i++) {
            const e = pattern.entering.get_shaft(i);
            if (e > 0) {
                if (e - 1 < _ezJ1) _ezJ1 = e - 1;
                if (e - 1 > _ezJ2) _ezJ2 = e - 1;
            }
        }
    }

    function _isEmptySchaftEz(j) { return _isFreeSchaft(j); }

    function _isTotalEmptySchaft(j) {
        if (!pegplan) {
            for (let i = 0; i < pattern.tieup.width; i++) {
                if (pattern.tieup.get(i, j) > 0) {
                    for (let k = 0; k < pattern.treadling.height; k++) {
                        if (pattern.treadling.get(i, k) > 0) return false;
                    }
                }
            }
            return true;
        } else {
            for (let i = 0; i < pattern.pegplan.height; i++) {
                if (pattern.pegplan.get(j, i) > 0) return false;
            }
            return true;
        }
    }

    function _getFirstNonemptySchaft(jStart) {
        for (let j = jStart + 1; j < pattern.tieup.height; j++) {
            if (!_isEmptySchaftEz(j)) return j;
        }
        return -1;
    }

    function _moveSchaftEz(from, to) {
        for (let i = 0; i < pattern.entering.width; i++) {
            if (pattern.entering.get_shaft(i) === from + 1) {
                pattern.entering.set_shaft(i, to + 1);
            }
        }
        if (!pegplan) {
            for (let i = 0; i < pattern.tieup.width; i++) {
                pattern.tieup.set(i, to, pattern.tieup.get(i, from));
                pattern.tieup.set(i, from, 0);
            }
        } else {
            for (let j = 0; j < pattern.pegplan.height; j++) {
                pattern.pegplan.set(to, j, pattern.pegplan.get(from, j));
                pattern.pegplan.set(from, j, 0);
            }
        }
    }

    function _eliminateEmptySchaft() {
        for (let j = 0; j < pattern.tieup.height; j++) {
            if (_isTotalEmptySchaft(j)) {
                for (let i = 0; i < pattern.entering.width; i++) {
                    if (pattern.entering.get_shaft(i) === j + 1) {
                        pattern.entering.set_shaft(i, 0);
                    }
                }
                if (!pegplan) {
                    for (let i = 0; i < pattern.tieup.width; i++) {
                        if (pattern.tieup.get(i, j) > 0) pattern.tieup.set(i, j, 0);
                    }
                }
                const firstnon = _getFirstNonemptySchaft(j);
                if (firstnon === -1 || firstnon < j) return;
                _moveSchaftEz(firstnon, j);
            } else if (_isEmptySchaftEz(j)) {
                const firstnon = _getFirstNonemptySchaft(j);
                if (firstnon === -1 || firstnon < j) {
                    if (!pegplan) {
                        for (let i = 0; i < pattern.tieup.width; i++) {
                            pattern.tieup.set(i, j, 0);
                        }
                    } else {
                        for (let k = 0; k < pattern.pegplan.height; k++) {
                            if (j < pattern.pegplan.width) pattern.pegplan.set(j, k, 0);
                        }
                    }
                    return;
                }
                _moveSchaftEz(firstnon, j);
            }
        }
    }

    function _schaefteEqual(j1, j2) {
        if (!pegplan) {
            for (let i = 0; i < pattern.tieup.width; i++) {
                const a1 = pattern.tieup.get(i, j1);
                const a2 = pattern.tieup.get(i, j2);
                if ((a1 > 0 && a2 <= 0) || (a1 <= 0 && a2 > 0)) return false;
                if (a1 > 0 && a2 > 0 && a1 !== a2) return false;
            }
            return true;
        } else {
            for (let j = 0; j < pattern.pegplan.height; j++) {
                const t1 = pattern.pegplan.get(j1, j);
                const t2 = pattern.pegplan.get(j2, j);
                if ((t1 > 0 && t2 <= 0) || (t1 <= 0 && t2 > 0)) return false;
                if (t1 > 0 && t2 > 0 && t1 !== t2) return false;
            }
            return true;
        }
    }

    function _mergeSchaefte() {
        for (let i = pattern.min_x; i <= pattern.max_x; i++) {
            for (let ii = pattern.min_x; ii < i; ii++) {
                const jj1 = pattern.entering.get_shaft(i);
                const jj2 = pattern.entering.get_shaft(ii);
                if (jj1 !== jj2 && jj1 !== 0 && jj2 !== 0) {
                    if (_schaefteEqual(jj1 - 1, jj2 - 1)) {
                        let a = jj1 - 1, b = jj2 - 1;
                        if (a > b) { const t = a; a = b; b = t; }
                        for (let k = pattern.min_x; k <= pattern.max_x; k++) {
                            if (pattern.entering.get_shaft(k) - 1 === b) {
                                pattern.entering.set_shaft(k, a + 1);
                            }
                        }
                        if (!pegplan) {
                            for (let k = 0; k < pattern.tieup.width; k++) {
                                pattern.tieup.set(k, b, 0);
                            }
                        } else {
                            for (let k = 0; k < pattern.pegplan.height; k++) {
                                if (b < pattern.pegplan.width) pattern.pegplan.set(b, k, 0);
                            }
                        }
                    }
                }
            }
        }
    }

    function _switchSchaefte(a, b) {
        for (let i = pattern.min_x; i <= pattern.max_x; i++) {
            const e = pattern.entering.get_shaft(i);
            if (e === a + 1) pattern.entering.set_shaft(i, b + 1);
            else if (e === b + 1) pattern.entering.set_shaft(i, a + 1);
        }
        if (!pegplan) {
            for (let i = 0; i < pattern.tieup.width; i++) {
                const t = pattern.tieup.get(i, a);
                pattern.tieup.set(i, a, pattern.tieup.get(i, b));
                pattern.tieup.set(i, b, t);
            }
        } else {
            for (let j = 0; j < pattern.pegplan.height; j++) {
                const t = pattern.pegplan.get(a, j);
                pattern.pegplan.set(a, j, pattern.pegplan.get(b, j));
                pattern.pegplan.set(b, j, t);
            }
        }
    }

    function _ezNormalZ() {
        _ezCalcRange();
        if (_ezJ1 >= _ezJ2) return;
        _mergeSchaefte();
        for (let i = pattern.min_x; i <= pattern.max_x; i++) {
            const jj = pattern.entering.get_shaft(i);
            if (jj === 0) continue;
            if (jj - 1 > _ezJ1) _switchSchaefte(_ezJ1, jj - 1);
            _ezJ1++;
            if (_ezJ1 >= _ezJ2) break;
        }
        _eliminateEmptySchaft();
        pattern.recalc_weave_extent();
    }

    function _ezNormalS() {
        _ezCalcRange();
        if (_ezJ1 >= _ezJ2) return;
        _mergeSchaefte();
        for (let i = pattern.min_x; i <= pattern.max_x; i++) {
            const jj = pattern.entering.get_shaft(i);
            if (jj === 0) continue;
            if (jj - 1 < _ezJ2) _switchSchaefte(_ezJ2, jj - 1);
            _ezJ2--;
            if (_ezJ2 <= _ezJ1) break;
        }
        _eliminateEmptySchaft();
        pattern.recalc_weave_extent();
    }

    // CalcRapportRange — port of einzug.cpp::CalcRapportRange. Different
    // from Pattern.calcRapport: this one compares warp columns purely on
    // gewebe content (not on the entering value).
    let _ezRA = 0, _ezRB = -1;

    function _ezGewebeColEqual(i1, i2) {
        for (let j = pattern.min_y; j <= pattern.max_y; j++) {
            if (pattern.weave.get(i1, j) !== pattern.weave.get(i2, j)) return false;
        }
        return true;
    }

    function _ezCalcRapportRange() {
        _ezRA = 0; _ezRB = -1;
        const i1 = pattern.min_x, i2 = pattern.max_x;
        if (i1 > i2) return;
        _ezRA = i1; _ezRB = i1;
        let safety = 0;
        outer: while (safety++ < pattern.weave.width) {
            let i;
            for (i = _ezRB + 1; i <= i2; i++) {
                if (_ezGewebeColEqual(_ezRA, i)) break;
            }
            _ezRB = i - 1;
            const len = _ezRB - _ezRA + 1;
            if (len <= 0) break;
            for (let k = _ezRB + 1; k <= i2; k++) {
                const expected = _ezRA + ((k - _ezRB - 1) % len);
                if (!_ezGewebeColEqual(expected, k)) {
                    _ezRB++;
                    continue outer;
                }
            }
            break;
        }
    }

    // SplitSchaft — duplicate a shaft into a new (empty) shaft slot for
    // every-rapport-period occurrence beyond the first. Port of
    // einzug.cpp::SplitSchaft. Uses the rapport range stored in
    // _ezRA / _ezRB, computed by _ezCalcRapportRange.
    function _splitSchaft(searchj, sourcej) {
        let lastnewj = 0;
        let counter = 0;
        for (let i = _ezRA; i <= _ezRB; i++) {
            if (pattern.entering.get_shaft(i) - 1 === sourcej) {
                if (counter > 0) {
                    for (let j = searchj; j < pattern.tieup.height; j++) {
                        if (_isEmptySchaftEz(j)) {
                            lastnewj = j;
                            // Transfer every (i + k * rapportLen) warp using
                            // sourcej shaft to the new shaft slot j.
                            const rapLen = _ezRB - _ezRA + 1;
                            let x = i;
                            while (x < pattern.entering.width) {
                                if (pattern.entering.get_shaft(x) - 1 === sourcej) {
                                    pattern.entering.set_shaft(x, j + 1);
                                }
                                x += rapLen;
                            }
                            // Copy tieup row (or pegplan column) from sourcej.
                            if (!pegplan) {
                                for (let ii = 0; ii < pattern.tieup.width; ii++) {
                                    pattern.tieup.set(ii, j, pattern.tieup.get(ii, sourcej));
                                }
                            } else {
                                for (let k = 0; k < pattern.pegplan.height; k++) {
                                    if (j < pattern.pegplan.width) {
                                        pattern.pegplan.set(j, k, pattern.pegplan.get(sourcej, k));
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
                counter++;
            }
        }
        return lastnewj;
    }

    function _ezGeradeZ() {
        _ezCalcRange();
        if (_ezJ1 >= _ezJ2) return;
        _ezCalcRapportRange();
        if (pattern.tieup.height < (_ezRB - _ezRA + 1)) return;
        const saveJ1 = _ezJ1;
        _mergeSchaefte();
        // Splitten
        for (let i = _ezRA; i <= _ezRB; i++) {
            const jj = pattern.entering.get_shaft(i);
            if (jj === 0) continue;
            if (jj - 1 <= _ezJ1) {
                const newj = _splitSchaft(_ezJ1, jj - 1);
                if (newj > _ezJ2) _ezJ2 = newj;
            }
            _ezJ1++;
            if (_ezJ1 >= _ezJ2) break;
        }
        // Sortieren
        _ezJ1 = saveJ1;
        for (let i = _ezRA; i <= _ezRB; i++) {
            const jj = pattern.entering.get_shaft(i);
            if (jj === 0) continue;
            if (jj - 1 > _ezJ1) {
                _switchSchaefte(_ezJ1, pattern.entering.get_shaft(i) - 1);
            }
            _ezJ1++;
            if (_ezJ1 >= _ezJ2) break;
        }
        _eliminateEmptySchaft();
        pattern.recalc_weave_extent();
    }

    function _ezGeradeS() {
        _ezCalcRange();
        if (_ezJ1 >= _ezJ2) return;
        _ezCalcRapportRange();
        if (pattern.tieup.height < (_ezRB - _ezRA + 1)) return;
        const saveJ1 = _ezJ1;
        _mergeSchaefte();
        for (let i = _ezRA; i <= _ezRB; i++) {
            const jj = pattern.entering.get_shaft(i);
            if (jj === 0) continue;
            if (jj - 1 <= _ezJ1) {
                const newj = _splitSchaft(_ezJ1, jj - 1);
                if (newj > _ezJ2) _ezJ2 = newj;
            }
            _ezJ1++;
            if (_ezJ1 >= _ezJ2) break;
        }
        _ezJ1 = saveJ1;
        for (let i = _ezRA; i <= _ezRB; i++) {
            const jj = pattern.entering.get_shaft(i);
            if (jj === 0) continue;
            if (jj - 1 < _ezJ2) {
                _switchSchaefte(_ezJ2, pattern.entering.get_shaft(i) - 1);
            }
            _ezJ2--;
            if (_ezJ2 <= _ezJ1) break;
        }
        _eliminateEmptySchaft();
        pattern.recalc_weave_extent();
    }

    function _ezChorig2() {
        if (pattern.max_x - pattern.min_x < 2) return;
        _ezCalcRange();
        _mergeSchaefte();
        _ezCalcRapportRange();
        // Schaefte splitten — wherever odd and even warps share a shaft
        for (let i = pattern.min_x + 1; i <= pattern.max_x; i += 2) {
            const s = pattern.entering.get_shaft(i);
            if (s === 0) continue;
            for (let ii = pattern.min_x; ii <= pattern.max_x; ii += 2) {
                const ss = pattern.entering.get_shaft(ii);
                if (ss === 0) continue;
                if (s === ss) _splitSchaft(0, s - 1);
            }
        }
        // Chore 1 sortieren (even warps)
        let endchor1 = 0;
        for (let i = pattern.min_x; i <= pattern.max_x; i += 2) {
            const s = pattern.entering.get_shaft(i);
            if (s === 0) continue;
            if (s > endchor1) {
                endchor1++;
                if (s !== endchor1) _switchSchaefte(s - 1, endchor1 - 1);
            }
        }
        // Chore 2 sortieren (odd warps)
        let max = endchor1;
        for (let i = pattern.min_x + 1; i <= pattern.max_x; i += 2) {
            const s = pattern.entering.get_shaft(i);
            if (s === 0) continue;
            if (s > max) {
                max++;
                if (s !== max) _switchSchaefte(s - 1, max - 1);
            }
        }
        pattern.recalc_weave_extent();
    }

    function _ezChorig3() {
        if (pattern.max_x - pattern.min_x < 3) return;
        _ezCalcRange();
        _mergeSchaefte();
        _ezCalcRapportRange();
        // Splitten — second-of-three vs first-of-three
        for (let i = pattern.min_x + 1; i <= pattern.max_x; i += 3) {
            const s = pattern.entering.get_shaft(i);
            if (s === 0) continue;
            for (let ii = pattern.min_x; ii <= pattern.max_x; ii += 3) {
                const ss = pattern.entering.get_shaft(ii);
                if (ss === 0) continue;
                if (s === ss) _splitSchaft(0, s - 1);
            }
        }
        // Splitten — third-of-three vs second-of-three and first-of-three
        for (let i = pattern.min_x + 2; i <= pattern.max_x; i += 3) {
            const s = pattern.entering.get_shaft(i);
            if (s === 0) continue;
            for (let ii = pattern.min_x + 1; ii <= pattern.max_x; ii += 3) {
                const ss = pattern.entering.get_shaft(ii);
                if (ss === 0) continue;
                if (s === ss) _splitSchaft(0, s - 1);
            }
            for (let ii = pattern.min_x; ii <= pattern.max_x; ii += 3) {
                const ss = pattern.entering.get_shaft(ii);
                if (ss === 0) continue;
                if (s === ss) _splitSchaft(0, s - 1);
            }
        }
        // Chore 1
        let endchor1 = 0;
        for (let i = pattern.min_x; i <= pattern.max_x; i += 3) {
            const s = pattern.entering.get_shaft(i);
            if (s === 0) continue;
            if (s > endchor1) {
                endchor1++;
                if (s !== endchor1) _switchSchaefte(s - 1, endchor1 - 1);
            }
        }
        // Chore 2
        let endchor2 = endchor1;
        for (let i = pattern.min_x + 1; i <= pattern.max_x; i += 3) {
            const s = pattern.entering.get_shaft(i);
            if (s === 0) continue;
            if (s > endchor2) {
                endchor2++;
                if (s !== endchor2) _switchSchaefte(s - 1, endchor2 - 1);
            }
        }
        // Chore 3
        let max = endchor2;
        for (let i = pattern.min_x + 2; i <= pattern.max_x; i += 3) {
            const s = pattern.entering.get_shaft(i);
            if (s === 0) continue;
            if (s > max) {
                max++;
                if (s !== max) _switchSchaefte(s - 1, max - 1);
            }
        }
        pattern.recalc_weave_extent();
    }

    if (style === "minimal-z") _ezNormalZ();
    else if (style === "minimal-s") _ezNormalS();
    else if (style === "gerade-z") _ezGeradeZ();
    else if (style === "gerade-s") _ezGeradeS();
    else if (style === "chorig-2") _ezChorig2();
    else if (style === "chorig-3") _ezChorig3();
}

// ---------- fixed threading -------------------------------------------
//
// Port of recalc.cpp::RecalcEinzugFixiert and
// TDBWFRM::UpdateEinzugFixiert. The template (pattern.fixeinzug) lists
// 1-based shaft numbers, one per non-empty warp, rapport-extended to
// the entering width. firstfree is the smallest shaft index strictly
// above the highest template-used shaft: values <= firstfree are
// reused for equal-warp matches, values > firstfree are split-off
// shafts.

function _kettfadenEmptyFix(p, i) {
    for (let j = p.min_y; j <= p.max_y; j++) {
        if (p.weave.get(i, j) > 0) return false;
    }
    return true;
}

function _kettfadenEqualFix(p, i1, i2) {
    for (let j = p.min_y; j <= p.max_y; j++) {
        if (p.weave.get(i1, j) !== p.weave.get(i2, j)) return false;
    }
    return true;
}

// Rebuild p.entering from the fixed template. Returns the highest
// used shaft (1-based, like Pattern.recalc_entering).
export function recalcFixedEntering(p) {
    p.entering.clear();
    let firstfree = p.firstfree || 0;
    let k = 0;
    let maxShaft = 0;
    const totalShafts = p.tieup.height;
    for (let i = 0; i < p.entering.width; i++) {
        if (_kettfadenEmptyFix(p, i)) continue;
        let s = p.fixeinzug[k++] || 0;
        if (s <= 0) {
            // Template ran out: fall back to a free shaft.
            s = firstfree + 1;
            firstfree++;
        }
        // Shaft already free → use directly. Otherwise look back for
        // an earlier identical warp; reuse its shaft if equal, or use
        // an already-allocated split-off shaft for that warp; else
        // bump firstfree.
        if (_isShaftFreeIn(p, s - 1)) {
            p.entering.set_shaft(i, s);
        } else {
            let done = false;
            for (let m = 0; m < i; m++) {
                const sm = p.entering.get_shaft(m);
                if (sm === s) {
                    if (_kettfadenEqualFix(p, i, m)) {
                        p.entering.set_shaft(i, s);
                        done = true;
                        break;
                    }
                } else if (sm > 0 && sm > p.firstfree
                           && _kettfadenEqualFix(p, i, m)) {
                    p.entering.set_shaft(i, sm);
                    done = true;
                    break;
                }
            }
            if (!done) {
                let ns = firstfree + 1;
                if (ns > totalShafts) ns = totalShafts; // clamp (no ExtendSchaefte)
                p.entering.set_shaft(i, ns);
                firstfree++;
            }
        }
        const cur = p.entering.get_shaft(i);
        if (cur > maxShaft) maxShaft = cur;
    }
    return maxShaft;
}

// Is shaft j (0-based) unused in p.entering?
function _isShaftFreeIn(p, j) {
    for (let i = 0; i < p.entering.width; i++) {
        if (p.entering.get_shaft(i) === j + 1) return false;
    }
    return true;
}

// Port of TDBWFRM::UpdateEinzugFixiert. Snapshots the current threading
// into fixeinzug[] (skipping empty warps), then rapports the template
// out to fill the array. firstfree = highest used shaft + 1.
export function updateFixedEntering(p) {
    const W = p.entering.width;
    p.fixeinzug = new Array(W).fill(0);
    let ii = 0;
    for (let i = 0; i < W; i++) {
        const s = p.entering.get_shaft(i);
        if (s !== 0) p.fixeinzug[ii++] = s;
    }
    let last = -1;
    for (let i = W - 1; i >= 0; i--) {
        if (p.fixeinzug[i] !== 0) { last = i; break; }
    }
    p.fixsize = last;
    if (last >= 0) {
        let kk = 0;
        for (let i = last + 1; i < W; i++) {
            p.fixeinzug[i] = p.fixeinzug[kk++];
            if (kk > last) kk = 0;
        }
    }
    let ff = 0;
    for (let j = p.tieup.height - 1; j >= 0; j--) {
        if (!_isShaftFreeIn(p, j)) { ff = j + 1; break; }
    }
    p.firstfree = ff;
}

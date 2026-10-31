"""The bead editor and the server's exports must place beads alike.

tests/data/bead_geometry.json holds, for a range of widths and shifts,
where beadexport.py puts every bead in the corrected and the simulated
view (in cell units relative to the view's grid; no scrolling, as in
the exports). This test checks that the file matches beadexport.py;
tests/js/bead-geometry.test.js checks the editor (bead/geometry.js)
against the same file.

After an intentional change to the export geometry:

    UPDATE_GOLDEN=1 pytest tests/test_bead_geometry.py
"""
import json
import os
from pathlib import Path

from textileplatform.beadexport import (
    _correct_y_for_index, _first_index_of_row,
)

FIXTURE = Path(__file__).parent / "data" / "bead_geometry.json"
WIDTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9]
BEADS = 60


def _corrected(width):
    """(index, column offset, row) per bead, as CorrectedPart paints."""
    out = []
    for idx in range(BEADS):
        xi, yj = _correct_y_for_index(width, idx)
        out.append([idx, xi - (0.5 if yj % 2 else 0), yj])
    return out


def _simulated(width, shift):
    """(index, left, width, row) per visible bead, as SimulationPart
    paints: cells relative to x_grid, only the front of the tube."""
    vw = width // 2
    out = []
    for idx in range(BEADS):
        xi, yj = _correct_y_for_index(width, idx + shift)
        if yj % 2 == 0:
            if xi >= vw:
                continue
            out.append([idx, xi, 1, yj])
        else:
            if xi > vw:
                continue
            if xi == 0:
                out.append([idx, 0, 0.5, yj])
            elif xi == vw:
                out.append([idx, xi - 0.5, 0.5, yj])
            else:
                out.append([idx, xi - 0.5, 1, yj])
    return out


def _generate():
    return {
        "widths": {
            str(w): {
                "first_index_of_row": [
                    _first_index_of_row(w, r) for r in range(12)],
                "corrected": _corrected(w),
                "simulated": {str(s): _simulated(w, s) for s in range(w)},
            }
            for w in WIDTHS
        },
    }


def test_fixture_matches_the_export_geometry():
    actual = _generate()
    if os.environ.get("UPDATE_GOLDEN") == "1":
        FIXTURE.write_text(json.dumps(actual, separators=(",", ":")) + "\n",
                           encoding="utf-8")
    assert FIXTURE.exists(), "run with UPDATE_GOLDEN=1"
    assert json.loads(FIXTURE.read_text(encoding="utf-8")) == actual


def test_fold_is_its_own_inverse():
    for w in WIDTHS:
        for row in range(12):
            start = _first_index_of_row(w, row)
            assert _correct_y_for_index(w, start) == (0, row)

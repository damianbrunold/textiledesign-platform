"""Structural validation of pattern JSON before it is stored or rendered.

Pattern contents arrive from the editor (save-pattern), from uploads and
from clone requests. Everything downstream — metadata extraction, the
exporters, the legacy .dbw/.jbb writers — loops over the declared sizes,
so they must be bounded and the arrays must have the expected shape.
This is deliberately not a full schema check: optional keys stay
optional, and grid cells may be null (older editor versions wrote
nulls; edit_pattern still normalises them).
"""
import math

WEAVE = "DB-WEAVE Pattern"
BEAD = "JBead Pattern"

# Limits are at least what the editors let a user set (dbweave options
# dialog: 10000 threads, 100 shafts; jbead size dialog: 5000 × 5000,
# though the 8 MB request limit caps a saved bead model near 4M cells).
WEAVE_MAX_SIZE = 10000       # warp threads / weft picks
WEAVE_MAX_SHAFTS = 256       # shafts / treadles
# warp_factor / weft_factor are thread densities (prod has e.g. 162/96);
# only their ratio affects rendering, and export caps that ratio.
WEAVE_MAX_FACTOR = 10000.0
# Grid arrays are written in place by the editor and may be longer than
# the declared size (e.g. desktop imports), so only an absolute cap.
WEAVE_MAX_ARRAY = WEAVE_MAX_SIZE * WEAVE_MAX_SHAFTS

BEAD_MAX_WIDTH = 5000
BEAD_MAX_HEIGHT = 20000
BEAD_MAX_CELLS = 4_000_000

_WEAVE_ARRAYS = (
    "data_entering", "data_reed", "colors_warp", "colors_weft",
    "data_tieup", "data_treadling", "data_pegplan", "data_fixeinzug",
)


class PatternError(ValueError):
    """The pattern contents are malformed or exceed the size limits."""


def _is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _bounded_int(contents, key, upper):
    value = contents.get(key)
    if not _is_int(value) or not 1 <= value <= upper:
        raise PatternError(f"'{key}' must be an integer in 1..{upper}")
    return value


def _check_cells(key, values, max_len):
    if not isinstance(values, list):
        raise PatternError(f"'{key}' must be a list")
    if len(values) > max_len:
        raise PatternError(f"'{key}' has more than {max_len} entries")
    for v in values:
        if v is not None and not isinstance(v, int):
            raise PatternError(f"'{key}' must contain integers")


def _validate_weave(contents):
    _bounded_int(contents, "width", WEAVE_MAX_SIZE)
    _bounded_int(contents, "height", WEAVE_MAX_SIZE)
    _bounded_int(contents, "max_shafts", WEAVE_MAX_SHAFTS)
    _bounded_int(contents, "max_treadles", WEAVE_MAX_SHAFTS)
    for key in _WEAVE_ARRAYS:
        if key in contents:
            _check_cells(key, contents[key], WEAVE_MAX_ARRAY)
    for key in ("warp_factor", "weft_factor"):
        value = contents.get(key)
        if value is None:
            continue
        if (
            not isinstance(value, (int, float)) or isinstance(value, bool)
            or not math.isfinite(value)
            or not 0 < value <= WEAVE_MAX_FACTOR
        ):
            raise PatternError(
                f"'{key}' must be a number in (0, {WEAVE_MAX_FACTOR}]"
            )
    palette = contents.get("palette")
    if palette is not None and not isinstance(palette, list):
        raise PatternError("'palette' must be a list")


def _validate_bead(contents):
    model = contents.get("model")
    if not isinstance(model, list) or not model:
        raise PatternError("'model' must be a non-empty list of rows")
    if len(model) > BEAD_MAX_HEIGHT:
        raise PatternError(f"'model' has more than {BEAD_MAX_HEIGHT} rows")
    first = model[0]
    if not isinstance(first, list) or not 1 <= len(first) <= BEAD_MAX_WIDTH:
        raise PatternError(f"model rows must hold 1..{BEAD_MAX_WIDTH} beads")
    width = len(first)
    if width * len(model) > BEAD_MAX_CELLS:
        raise PatternError(f"'model' has more than {BEAD_MAX_CELLS} beads")
    for row in model:
        if not isinstance(row, list) or len(row) != width:
            raise PatternError("model rows must all have the same width")
        for v in row:
            if not _is_int(v):
                raise PatternError("model cells must be integers")
    colors = contents.get("colors")
    if colors is not None and not isinstance(colors, list):
        raise PatternError("'colors' must be a list")
    view = contents.get("view")
    if view is not None and not isinstance(view, dict):
        raise PatternError("'view' must be an object")


def validate_pattern(contents, pattern_type):
    """Raise PatternError unless ``contents`` is a well-formed pattern
    of ``pattern_type`` within the size limits."""
    if not isinstance(contents, dict):
        raise PatternError("pattern contents must be an object")
    if pattern_type == WEAVE:
        _validate_weave(contents)
    elif pattern_type == BEAD:
        _validate_bead(contents)
    else:
        raise PatternError(f"unknown pattern type {pattern_type!r}")

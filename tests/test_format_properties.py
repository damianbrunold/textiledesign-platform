"""Property-based tests (hypothesis) for the pattern formats.

* Round trips: a pattern exported to .dbw / .jbb and imported again is
  the same pattern, up to the normalisations the desktop formats imply
  (spelled out in the `expected_*` helpers below).
* Robustness: the parsers reject any input with PatternError (never
  another exception), validate_pattern only raises PatternError, and
  every pattern that passes validation can be exported.

Failing examples are replayed from the local .hypothesis/ database
first, so a failure found once keeps failing until it is fixed.
"""

import os

import pytest
from hypothesis import HealthCheck, example, given, settings
from hypothesis import strategies as st

from textileplatform import beadexport, export
from textileplatform.beadpattern import (
    DESKTOP_ZOOM_TABLE, parse_jbb_data, render_jbb_data, smallest_period,
)
from textileplatform.validation import PatternError, validate_pattern
from textileplatform.weavepattern import parse_dbw_data, render_dbw_data

WEAVE = "DB-WEAVE Pattern"
BEAD = "JBead Pattern"

STYLES = ["filled", "vdash", "cross", "dot", "circle", "rising", "falling",
          "smallcross", "smallcircle", "number", "hdash", "plus"]

# PROPERTY_SCALE=10 pytest tests/test_format_properties.py searches ten
# times as many examples (worth doing after changing a format).
SCALE = int(os.environ.get("PROPERTY_SCALE", "1"))


def examples(n):
    return settings(max_examples=n * SCALE, deadline=None,
                    suppress_health_check=[HealthCheck.too_slow])


slow = examples(40)
fast = examples(100)
renders = examples(15)

# Text a user can type into a single-line field or the notes: no control
# characters and no Unicode line / paragraph separators.
typed_text = st.text(
    st.characters(blacklist_categories=("Cc", "Cs", "Zl", "Zp")),
    max_size=40)


def ints(lo, hi, n):
    return st.lists(st.integers(lo, hi), min_size=n, max_size=n)


# ---------- .dbw -------------------------------------------------------


def muster_slots():
    """The 10 block / range substitution slots (12 x 12 cells each):
    up to two drawn, the rest empty."""
    return st.lists(ints(-1, 9, 144), max_size=2).map(
        lambda slots: slots + [[0] * 144] * (10 - len(slots)))


@st.composite
def weave_patterns(draw):
    """Every field the .dbw mapping carries, within the ranges its
    encodings hold (entering: 16-bit, grids: signed bytes, colours:
    unsigned bytes)."""
    w = draw(st.integers(1, 40))
    h = draw(st.integers(1, 40))
    ms = draw(st.integers(1, 24))
    mt = draw(st.integers(1, 24))
    notes = draw(st.lists(typed_text.filter(lambda s: "\\" not in s),
                          max_size=4).map("\n".join))
    return {
        "name": "p",
        "author": draw(typed_text),
        "organization": draw(typed_text),
        "notes": notes,
        "width": w, "height": h, "max_shafts": ms, "max_treadles": mt,
        "data_entering": draw(ints(0, ms, w)),
        "data_tieup": draw(ints(-128, 127, ms * mt)),
        "data_treadling": draw(ints(-128, 127, mt * h)),
        "data_reed": draw(ints(0, 1, w)),
        "colors_warp": draw(ints(0, 255, w)),
        "colors_weft": draw(ints(0, 255, h)),
        "data_fixeinzug": draw(ints(0, ms, w)),
        "fixsize": draw(st.integers(0, w)),
        "firstfree": draw(st.integers(0, w)),
        "data_blockmuster": draw(muster_slots()),
        "data_bereichmuster": draw(muster_slots()),
        "palette": draw(st.lists(ints(0, 255, 4), min_size=1,
                                 max_size=20)),
        "hlines": draw(st.lists(st.fixed_dictionaries({
            "typ": st.sampled_from(["horz", "vert"]),
            "feld": st.integers(0, 1),
            "pos": st.integers(0, 2**32 - 1),
        }), max_size=4)),
        "visible_shafts": draw(st.integers(1, ms)),
        "visible_treadles": draw(st.integers(1, mt)),
        "warp_lifting": draw(st.booleans()),
        "zoom": draw(st.integers(0, 20)),
        "current_color": draw(st.integers(0, 255)),
        "color_effect_with_grid": draw(st.booleans()),
        "single_treadling": draw(st.booleans()),
        "weave_locked": draw(st.booleans()),
        "unit_width": draw(st.integers(1, 20)),
        "unit_height": draw(st.integers(1, 20)),
        # written with 8 decimals
        "warp_factor": draw(st.integers(1, 10**6)) / 100,
        "weft_factor": draw(st.integers(1, 10**6)) / 100,
        "direction_righttoleft": draw(st.booleans()),
        "direction_toptobottom": draw(st.booleans()),
        "entering_at_bottom": draw(st.booleans()),
        "display_reed": draw(st.booleans()),
        "display_colors_warp": draw(st.booleans()),
        "display_colors_weft": draw(st.booleans()),
        "display_hlines": draw(st.booleans()),
        "display_repeat": draw(st.booleans()),
        "display_palette": draw(st.booleans()),
        "display_pegplan": draw(st.booleans()),
        "display_entering": draw(st.booleans()),
        "display_treadling": draw(st.booleans()),
        "weave_style": draw(st.sampled_from(
            ["draft", "color", "simulation", "invisible"])),
        "entering_style": draw(st.sampled_from(STYLES)),
        "treadling_style": draw(st.sampled_from(STYLES)),
        "tieup_style": draw(st.sampled_from(STYLES)),
    }


def expected_line(s):
    """A single-line .dbw value reads back without line breaks, without
    trailing backslashes (they would continue the line) and without
    trailing whitespace (lines are stripped)."""
    for br in ("\r\n", "\r", "\n"):
        s = s.replace(br, " ")
    return _strip_end(s)


def _strip_end(s):
    """No trailing whitespace or backslash, however they alternate."""
    s = s.rstrip()
    while s.endswith("\\"):
        s = s.rstrip("\\").rstrip()
    return s


def expected_notes(notes):
    """Desktop RemoveNL / InsertNL: line breaks are stored as `\\`, so
    trailing empty lines and trailing whitespace go."""
    s = notes.replace("\r\n", "\n").replace("\r", "\n")
    return _strip_end(s.replace("\n", "\\")).replace("\\", "\n")


def expected_weave(p):
    return {**p,
            "author": expected_line(p["author"]),
            "organization": expected_line(p["organization"]),
            "notes": expected_notes(p["notes"])}


def reimport_dbw(p):
    out = parse_dbw_data(render_dbw_data(p), "p")
    out.pop("_dbw_raw")
    return out


@given(weave_patterns())
@slow
def test_dbw_round_trip(p):
    assert reimport_dbw(p) == expected_weave(p)


@given(weave_patterns())
@slow
def test_dbw_export_is_stable(p):
    """Exporting a re-imported file gives the same file."""
    text = render_dbw_data(p)
    assert render_dbw_data(parse_dbw_data(text, "p")) == text


@given(weave_patterns(), st.data())
@slow
def test_dbw_arrays_are_fitted_to_the_declared_size(p, data):
    """Too short grids are padded with 0, too long ones cut."""
    entering = data.draw(st.lists(st.integers(0, p["max_shafts"]),
                                  max_size=2 * p["width"]))
    p["data_entering"] = entering
    w = p["width"]
    assert reimport_dbw(p)["data_entering"] == (entering + [0] * w)[:w]


@given(weave_patterns(), st.text(max_size=30), st.text(max_size=60))
@slow
@example(None, "Anna\u2028Müller", "")
@example(None, "x", "a\x85b")
def test_dbw_any_text_reimports(p, author, notes):
    """Whatever ends up in the text fields, the export reads back."""
    if p is None:
        p = _minimal_weave()
    p = {**p, "author": author, "notes": notes}
    out = reimport_dbw(p)
    assert out["width"] == p["width"]


def _minimal_weave():
    return {"name": "p", "width": 2, "height": 2, "max_shafts": 2,
            "max_treadles": 2}


# ---------- .jbb -------------------------------------------------------


@st.composite
def bead_patterns(draw):
    w = draw(st.integers(1, 15))
    rows = draw(st.lists(ints(-5, 40, w), min_size=1, max_size=30))
    view = draw(st.fixed_dictionaries({}, optional={
        "draft-visible": st.booleans(),
        "corrected-visible": st.booleans(),
        "simulation-visible": st.booleans(),
        "report-visible": st.booleans(),
        "selected-tool": st.sampled_from(
            ["pencil", "select", "fill", "pipette", "true", "12"]),
        "selected-color": st.integers(0, 40),
        "zoom": st.sampled_from(DESKTOP_ZOOM_TABLE),
        "scroll": st.integers(0, 100),
        "shift": st.integers(0, w),
        "draw-colors": st.booleans(),
        "draw-symbols": st.booleans(),
        "symbols": st.text(st.characters(blacklist_categories=("Cs",)),
                           min_size=1, max_size=32),
    }))
    return {
        "name": "p",
        # Strings are quoted and escaped: anything goes, line breaks too.
        "author": draw(st.text(st.characters(blacklist_categories=("Cs",)),
                               max_size=30)),
        "organization": draw(st.text(
            st.characters(blacklist_categories=("Cs",)), max_size=30)),
        "notes": draw(st.text(st.characters(blacklist_categories=("Cs",)),
                              max_size=80)),
        "colors": draw(st.lists(st.one_of(ints(0, 255, 3), ints(0, 255, 4)),
                                max_size=20)),
        "view": view,
        "model": rows,
    }


@given(bead_patterns())
@fast
def test_jbb_round_trip(p):
    assert parse_jbb_data(render_jbb_data(p), "p") == p


@given(bead_patterns(), st.integers(1, 60))
@fast
def test_jbb_zoom_snaps_to_the_nearest_desktop_step(p, zoom):
    p["view"] = {"zoom": zoom}
    got = parse_jbb_data(render_jbb_data(p), "p")["view"]["zoom"]
    assert got in DESKTOP_ZOOM_TABLE
    assert all(abs(got - zoom) <= abs(z - zoom) for z in DESKTOP_ZOOM_TABLE)


@given(bead_patterns(), st.data())
@fast
def test_jbb_ragged_rows_take_the_first_rows_width(p, data):
    rows = p["model"]
    w = len(rows[0])
    # At least one bead per row: an empty `(row)` is an empty node, not
    # a row, and is skipped (as by the desktop reader's leaf lookup).
    ragged = [r[:data.draw(st.integers(1, w))] + [7] * data.draw(
        st.integers(0, 3)) for r in rows[1:]]
    p["model"] = [rows[0], *ragged]
    got = parse_jbb_data(render_jbb_data(p), "p")["model"]
    assert all(len(r) == w for r in got)
    assert got[1:] == [(r + [0] * w)[:w] for r in ragged]


def test_jbb_empty_row_is_skipped():
    text = "(jbb (model (row 1 2) (row) (row 3 4)))"
    assert parse_jbb_data(text, "p")["model"] == [[1, 2], [3, 4]]


# ---------- robustness -------------------------------------------------


def _parses_or_rejects(parse, text):
    try:
        result = parse(text, "x")
    except PatternError:
        return None
    assert isinstance(result, dict)
    return result


dbw_like = st.lists(st.one_of(
    st.sampled_from(["\\data{", "\\size{", "\\fields{", "\\einzug{",
                     "\\view{", "\\general{", "}", "", ";comment",
                     "maxx1==3", "maxy2==4", "maxx2==2", "maxy1==2",
                     "data==0a0b", "data==zz", "size==2", "zoom==x",
                     "@dbw3:file", "count==2", "list==00", "x\\"]),
    st.text(max_size=20)), max_size=30).map("\n".join)


@given(st.one_of(st.text(max_size=200), dbw_like))
@fast
@example("\\data{\n\\fields{\n\\einzug{\ndata==zz\n}\n}\n}")
@example("\\data{\n\\size{\nmaxx1==1e9\n}\n}")
def test_dbw_parser_only_raises_pattern_error(text):
    _parses_or_rejects(parse_dbw_data, text)


jbb_like = st.lists(st.one_of(
    st.sampled_from(["(", ")", "(jbb", "(model", "(row", "(colors", "(rgb",
                     "(view", "(zoom", "true", "false", "1", "-3", '"s"',
                     '"\\"', "#c\n", " "]),
    st.text(max_size=10)), max_size=40).map(" ".join)


@given(st.one_of(st.text(max_size=200), jbb_like))
@fast
@example("(jbb " + "(a " * 5000 + ")" * 5001)
@example("(jbb (model (row 1 2) (row)))")
@example("(jbb (model))")
def test_jbb_parser_only_raises_pattern_error(text):
    result = _parses_or_rejects(parse_jbb_data, text)
    if result is not None and result["model"]:
        # an accepted file is a valid pattern (or rejected as one)
        try:
            validate_pattern(result, BEAD)
        except PatternError:
            pass


json_values = st.recursive(
    st.none() | st.booleans() | st.integers(-10**6, 10**6)
    | st.floats(allow_nan=True) | st.text(max_size=5),
    lambda inner: st.lists(inner, max_size=5)
    | st.dictionaries(st.text(max_size=5), inner, max_size=5),
    max_leaves=30)


@st.composite
def loose_weaves(draw):
    """Weave-shaped JSON with arbitrary values in the validated keys."""
    keys = ["width", "height", "max_shafts", "max_treadles",
            "data_entering", "data_tieup", "data_treadling", "data_reed",
            "colors_warp", "colors_weft", "palette", "warp_factor"]
    out = {}
    for k in keys:
        if draw(st.booleans()):
            out[k] = draw(st.one_of(st.integers(-3, 50), json_values,
                                    st.lists(st.none() | st.integers(),
                                             max_size=40)))
    return out


@given(st.one_of(json_values, loose_weaves()),
       st.sampled_from([WEAVE, BEAD, "other"]))
@fast
def test_validate_only_raises_pattern_error(contents, kind):
    try:
        validate_pattern(contents, kind)
    except PatternError:
        pass


@st.composite
def odd_but_valid_weaves(draw):
    """A pattern with whatever validation still lets through in the
    keys it checks: grids of any length with nulls and out-of-range
    numbers, palettes of junk, unusual factors."""
    p = draw(weave_patterns())
    cells = st.lists(st.none() | st.integers(-10**6, 10**6),
                     max_size=3 * p["width"])
    for key in ("data_entering", "data_tieup", "data_treadling",
                "data_reed", "colors_warp", "colors_weft"):
        if draw(st.booleans()):
            p[key] = draw(cells)
    if draw(st.booleans()):
        p["palette"] = draw(st.lists(json_values, max_size=5))
    for key in ("warp_factor", "weft_factor"):
        if draw(st.booleans()):
            p[key] = draw(st.floats(min_value=1e-6, max_value=10000.0))
    validate_pattern(p, WEAVE)
    return p


@given(odd_but_valid_weaves())
@slow
def test_validated_weaves_can_be_exported(p):
    # The legacy .dbw download and the image exports of the stored
    # pattern run on exactly what validation let through.
    assert reimport_dbw(p)["width"] == p["width"]


@given(odd_but_valid_weaves())
@renders
def test_validated_weaves_render(p):
    assert export.export_png(p)[:8] == b"\x89PNG\r\n\x1a\n"
    assert export.export_svg(p).lstrip().startswith(b"<")
    assert export.export_pdf(p).startswith(b"%PDF")
    assert export.print_pdf(p).startswith(b"%PDF")


@st.composite
def odd_but_valid_beads(draw):
    """Bead patterns with what validation lets through: any integers
    as beads, junk colour entries, any view values."""
    p = draw(bead_patterns())
    w = len(p["model"][0])
    p["model"] = draw(st.lists(ints(-10**6, 10**6, w), min_size=1,
                               max_size=20))
    if draw(st.booleans()):
        p["colors"] = draw(st.lists(json_values, max_size=5))
    if draw(st.booleans()):
        p["view"] = draw(st.dictionaries(
            st.sampled_from(["zoom", "shift", "scroll", "symbols",
                             "draw-symbols", "draw-colors"]),
            json_values, max_size=4))
    validate_pattern(p, BEAD)
    return p


@given(odd_but_valid_beads())
@renders
def test_validated_beads_render(p):
    assert beadexport.export_png(p)[:8] == b"\x89PNG\r\n\x1a\n"
    assert beadexport.export_svg(p).lstrip().startswith(b"<")
    assert beadexport.export_pdf(p).startswith(b"%PDF")
    assert render_jbb_data(p).startswith("(jbb")


@given(weave_patterns())
@renders
def test_weave_image_exports_render(p):
    assert export.export_png(p)[:8] == b"\x89PNG\r\n\x1a\n"
    assert export.export_svg(p).lstrip().startswith(b"<")


@given(bead_patterns())
@renders
def test_bead_image_exports_render(p):
    assert beadexport.export_png(p)[:8] == b"\x89PNG\r\n\x1a\n"
    assert beadexport.export_svg(p).lstrip().startswith(b"<")


# ---------- bead repeat -----------------------------------------------


@given(st.lists(st.integers(0, 2), max_size=40))
@fast
def test_smallest_period_matches_brute_force(seq):
    n = len(seq)
    expected = next((p for p in range(1, n + 1)
                     if all(seq[k] == seq[k - p] for k in range(p, n))), 0)
    assert smallest_period(seq) == expected


@given(st.lists(st.integers(0, 3), min_size=1, max_size=8),
       st.integers(1, 6))
@fast
def test_smallest_period_of_a_repeated_block_divides_it(block, times):
    p = smallest_period(block * times)
    assert p <= len(block)
    assert len(block) % p == 0 or times == 1


@pytest.mark.parametrize("seq,period", [
    ([], 0), ([1], 1), ([1, 1, 1], 1), ([1, 2, 1, 2, 1], 2),
    ([1, 2, 3], 3),
])
def test_smallest_period_examples(seq, period):
    assert smallest_period(seq) == period


# ---------- regressions found by the properties ------------------------


def test_dbw_line_separators_inside_values_read_back():
    p = {**_minimal_weave(), "author": "Anna\u2028Müller",
         "notes": "one\x85two"}
    out = reimport_dbw(p)
    assert out["author"] == "Anna\u2028Müller"
    assert out["notes"] == "one\x85two"


def test_dbw_non_hex_data_is_a_pattern_error():
    with pytest.raises(PatternError):
        parse_dbw_data("\\data{\n\\fields{\n\\einzug{\ndata==zz\n}\n}\n}")


def test_dbw_size_value_instead_of_section_is_tolerated():
    p = parse_dbw_data("\\data{\nsize==5\n}", "x")
    assert p["width"] == 50  # the default


@pytest.mark.parametrize("value,written", [
    (" ", ""), ("a\\ ", "a"), ("a \\ \\", "a"), ("x\\y", "x\\y"),
])
def test_dbw_writes_text_fields_as_they_read_back(value, written):
    text = render_dbw_data({**_minimal_weave(), "organization": value})
    assert f"organization=={written}\r\n" in text


def test_jbb_deep_nesting_is_a_pattern_error():
    with pytest.raises(PatternError):
        parse_jbb_data("(jbb " + "(a " * 5000 + ")" * 5001, "x")


def test_jbb_junk_colours_and_view_values_are_skipped():
    p = {"model": [[1]], "colors": [[1, 2, 3], {"r": 1}, [None, 1, 2],
                                    [4, 5]],
         "view": {"zoom": {}, "symbols": "ab", "shift": [1, None]}}
    text = render_jbb_data(p)
    assert "(rgb 1 2 3)" in text
    assert text.count("(rgb") == 1
    assert '(symbols "ab")' in text
    assert "(shift" not in text


def test_weave_export_ignores_null_cells_and_shafts_out_of_range():
    p = {**_minimal_weave(), "data_entering": [None, 10**6],
         "colors_warp": [None, 1], "data_treadling": [None, 1, 0, 0],
         "palette": [[None, 0, 0], [float("inf"), 1, 2]]}
    png = export.export_png(p)
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    # A threading entry of 10**6 used to size a 10**6-shaft image.
    assert len(png) < 100_000


def test_raster_text_with_control_characters():
    p = {"model": [[1, 0]], "organization": "a\x85b", "author": "x\x00"}
    assert beadexport.export_png(p)[:4] == b"\x89PNG"
    assert beadexport.export_png({**p, "colors": [[1, float("inf"), 0]],
                                  "view": {"shift": float("inf")}})

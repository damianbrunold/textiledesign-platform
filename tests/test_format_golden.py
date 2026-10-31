"""Golden-file tests against real desktop files.

tests/data/formats/ holds the sample patterns of the desktop apps
(dbweave/samples, jbead/samples). For each one:

* desktop -> platform -> desktop must not lose anything: the re-exported
  .dbw has the same structure as the original, the re-exported .jbb is
  the original text;
* the imported pattern, its list metadata and its exports must match the
  snapshot in tests/data/formats/golden/ (a JSON digest per sample, plus
  reference PNGs for a representative subset).

After an intentional change to import or export, regenerate the
snapshots and review the diff:

    UPDATE_GOLDEN=1 pytest tests/test_format_golden.py
"""
import hashlib
import io
import json
import os
import re
from pathlib import Path

import pytest
from PIL import Image, ImageChops

from textileplatform import beadexport, export
from textileplatform.controller import _decode_upload
from textileplatform.beadpattern import parse_jbb_data, render_jbb_data
from textileplatform.patterns import extract_pattern_metadata
from textileplatform.validation import validate_pattern
from textileplatform.weavepattern import (
    _parse_dbw_into_struct, parse_dbw_data, render_dbw_data,
)

DATA = Path(__file__).parent / "data" / "formats"
GOLDEN = DATA / "golden"
UPDATE = os.environ.get("UPDATE_GOLDEN") == "1"

WEAVE = "DB-WEAVE Pattern"
BEAD = "JBead Pattern"
CRLF = chr(13) + chr(10)

SAMPLES = sorted(p.name for p in DATA.iterdir()
                 if p.suffix in (".dbw", ".jbb"))

# Reference images for a spread of features: twill / satin structure,
# double cloth, colour effects, tromp as writ, a platform-written file,
# and two bead patterns.
PNG_REFERENCES = {
    "satin.dbw", "double weave.dbw", "Pepita.dbw", "tromp as writ.dbw",
    "textile-export.dbw", "hearts.jbb", "green_yellow_diagonal.jbb",
}


def _load(name):
    text = _decode_upload((DATA / name).read_bytes())
    if name.endswith(".dbw"):
        return text, parse_dbw_data(text, "sample"), WEAVE
    return text, parse_jbb_data(text, "sample"), BEAD


def _golden_path(name, ext):
    return GOLDEN / (re.sub(r"[^A-Za-z0-9_.-]", "_", name) + ext)


def _digest(value):
    """Short, stable digest of a (nested) JSON value."""
    blob = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode()).hexdigest()[:16]


def _summary(contents):
    """Scalars as they are; lists by length and digest (the grids are
    too large to keep readable)."""
    out = {}
    for key, value in sorted(contents.items()):
        if key == "_dbw_raw":
            continue
        if isinstance(value, list):
            out[key] = {"len": len(value), "digest": _digest(value)}
        else:
            out[key] = value
    return out


def _svg_shape(svg):
    """Element counts of the SVG export: catches lost or extra cells
    without storing megabytes of markup."""
    counts = {}
    for tag in re.findall(rb"<([a-zA-Z]+)[\s>/]", svg):
        counts[tag.decode()] = counts.get(tag.decode(), 0) + 1
    return counts


def _snapshot(name):
    _, contents, kind = _load(name)
    module = export if kind == WEAVE else beadexport
    png = Image.open(io.BytesIO(module.export_png(contents)))
    return {
        "pattern": _summary(contents),
        "metadata": extract_pattern_metadata(contents, kind),
        "png_size": list(png.size),
        "svg_elements": _svg_shape(module.export_svg(contents)),
    }


def _compare_json(path, actual):
    if UPDATE:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(actual, indent=1, sort_keys=True,
                                   ensure_ascii=False) + "\n",
                        encoding="utf-8")
        return
    assert path.exists(), f"no snapshot {path.name}; run with UPDATE_GOLDEN=1"
    expected = json.loads(path.read_text(encoding="utf-8"))
    assert actual == expected


@pytest.mark.parametrize("name", SAMPLES)
def test_sample_is_a_valid_pattern(name):
    _, contents, kind = _load(name)
    validate_pattern(contents, kind)


@pytest.mark.parametrize("name", [n for n in SAMPLES if n.endswith(".dbw")])
def test_dbw_round_trip_is_lossless(name):
    text, contents, _ = _load(name)
    out = render_dbw_data(contents)
    assert _parse_dbw_into_struct(out) == _parse_dbw_into_struct(text)
    again = parse_dbw_data(out, "sample")
    assert {k: v for k, v in again.items() if k != "_dbw_raw"} == \
        {k: v for k, v in contents.items() if k != "_dbw_raw"}
    # Exporting the re-import gives the same file.
    assert render_dbw_data(again) == out


@pytest.mark.parametrize("name", [n for n in SAMPLES if n.endswith(".jbb")])
def test_jbb_round_trip_reproduces_the_file(name):
    text, contents, _ = _load(name)
    text = text.replace(CRLF, "\n")  # line endings are not content
    out = render_jbb_data(contents)
    # The samples predate the organization field, which we always write.
    if "(organization " not in text:
        out = out.replace('    (organization "")\n', "", 1)
    assert out == text
    assert parse_jbb_data(render_jbb_data(contents), "sample") == contents


@pytest.mark.parametrize("name", SAMPLES)
def test_matches_snapshot(name):
    _compare_json(_golden_path(name, ".json"), _snapshot(name))


def _image_difference(a, b):
    """Fraction of pixels that differ visibly (any channel by > 32)."""
    if a.size != b.size:
        return 1.0
    diff = ImageChops.difference(a.convert("RGB"), b.convert("RGB"))
    mask = diff.convert("L").point(lambda v: 255 if v > 32 else 0)
    return sum(mask.histogram()[255:]) / (a.size[0] * a.size[1])


@pytest.mark.parametrize("name", sorted(PNG_REFERENCES))
def test_png_export_matches_reference(name, tmp_path):
    _, contents, kind = _load(name)
    module = export if kind == WEAVE else beadexport
    actual_bytes = module.export_png(contents)
    path = _golden_path(name, ".png")
    if UPDATE:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(actual_bytes)
        return
    assert path.exists(), f"no reference {path.name}; run with UPDATE_GOLDEN=1"
    actual = Image.open(io.BytesIO(actual_bytes))
    expected = Image.open(path)
    # Font rasterisation may differ slightly between platforms; the
    # pattern itself must not.
    difference = _image_difference(actual, expected)
    if difference > 0.002:
        actual.save(tmp_path / "actual.png")
        if actual.size == expected.size:
            ImageChops.difference(actual.convert("RGB"),
                                  expected.convert("RGB")).save(
                tmp_path / "diff.png")
        pytest.fail(f"{name}: {difference:.2%} of the pixels differ from "
                    f"the reference; see {tmp_path}")


def test_every_reference_has_a_sample():
    """Stale golden files are deleted along with their sample."""
    expected = {_golden_path(n, ".json").name for n in SAMPLES} | \
        {_golden_path(n, ".png").name for n in PNG_REFERENCES}
    present = {p.name for p in GOLDEN.iterdir()} if GOLDEN.exists() else set()
    assert present <= expected, sorted(present - expected)

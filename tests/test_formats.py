""".jbb / .dbw import and export, upload decoding, SVG text escaping.

The expected behaviour follows the desktop apps: JBead's ObjectModel
(jbead/src/io/objectmodel.cpp) and DB-WEAVE's FfReader / FileProperties
(dbweave/src/io/fileformat.cpp, ui/properties.cpp)."""
import io
import json
import xml.etree.ElementTree as ET

import pytest

from textileplatform import beadexport
from textileplatform.beadpattern import parse_jbb_data, render_jbb_data
from textileplatform.db import db
from textileplatform.models import Pattern
from textileplatform.validation import PatternError
from textileplatform.weavepattern import parse_dbw_data, render_dbw_data

from test_limits import _bead, _login_as, _weave
from test_patterns import _make_user, _reset_access_date


# As written by the desktop JBead (ObjectModel::formatNode).
DESKTOP_JBB = """(jbb
    (version 1)
    (author "Anna \\"Nina\\" Müller")
    (organization "Perlen & Co")
    (notes "line one
line two with a \\\\ backslash")
    (colors
        (rgb 255 255 255 255)
        (rgb 128 0 0 255)
        (rgb 0 0 128 255))
    (view
        (draft-visible true)
        (corrected-visible false)
        (simulation-visible true)
        (report-visible true)
        (selected-tool "pencil")
        (selected-color 1)
        (zoom 5)
        (scroll 0)
        (shift 2)
        (draw-colors true)
        (draw-symbols false)
        (symbols "·ab c"))
    (model
        (row 0 1 2)
        (row 2 1 0)))
"""


class TestJbb:
    def test_parses_desktop_file(self):
        p = parse_jbb_data(DESKTOP_JBB, "rope")
        assert p["name"] == "rope"
        assert p["author"] == 'Anna "Nina" Müller'
        assert p["organization"] == "Perlen & Co"
        assert p["notes"] == "line one\nline two with a \\ backslash"
        assert p["colors"][1] == [128, 0, 0, 255]
        assert p["view"]["corrected-visible"] is False
        assert p["view"]["symbols"] == "·ab c"
        assert p["view"]["selected-tool"] == "pencil"
        assert p["model"] == [[0, 1, 2], [2, 1, 0]]

    def test_renders_desktop_layout(self):
        assert render_jbb_data(parse_jbb_data(DESKTOP_JBB)) == DESKTOP_JBB

    def test_zoom_index_maps_to_cell_size(self):
        # Desktop zoom table {6, 8, 10, 12, 14, 16, 18, 20}.
        assert parse_jbb_data(DESKTOP_JBB)["view"]["zoom"] == 16
        bead = _bead()
        bead["view"] = {"zoom": 13}
        assert "(zoom 3)" in render_jbb_data(bead)   # nearest: 12 px
        bead["view"] = {"zoom": 400}
        assert "(zoom 7)" in render_jbb_data(bead)   # largest step
        out_of_range = DESKTOP_JBB.replace("(zoom 5)", "(zoom 12)")
        assert parse_jbb_data(out_of_range)["view"]["zoom"] == 12

    @pytest.mark.parametrize("text", [
        'quote " inside', "back\\slash\\", "multi\nline\r\ntext",
        "  spaced  ", "(parens)", "#hash ;semi", "日本語",
    ])
    def test_string_round_trip(self, text):
        bead = _bead()
        bead.update(author=text, organization=text, notes=text)
        bead["view"] = {"symbols": text}
        back = parse_jbb_data(render_jbb_data(bead))
        assert back["author"] == text
        assert back["organization"] == text
        assert back["notes"] == text
        assert back["view"]["symbols"] == text
        assert back["model"] == bead["model"]

    def test_single_bead_rows_stay_lists(self):
        text = "(jbb (model (row 5) (row 6)))"
        assert parse_jbb_data(text)["model"] == [[5], [6]]

    def test_ragged_rows_follow_first_row(self):
        text = "(jbb (model (row 1 2 3) (row 4) (row 5 6 7 8)))"
        assert parse_jbb_data(text)["model"] == [
            [1, 2, 3], [4, 0, 0], [5, 6, 7],
        ]

    def test_comments_and_missing_sections(self):
        text = (
            "# a comment\n(jbb\n  (version 1) # trailing\n"
            "  (model (row 1 2)))"
        )
        p = parse_jbb_data(text, "x")
        assert p["author"] == ""
        assert p["colors"] == []
        assert p["view"] == {}
        assert p["model"] == [[1, 2]]

    def test_minimal_platform_pattern_renders(self):
        # JSON-uploaded bead patterns may lack everything but the model.
        text = render_jbb_data({"model": [[1, 0]]})
        assert parse_jbb_data(text)["model"] == [[1, 0]]

    @pytest.mark.parametrize("text", [
        "", "(jbb", "(jbb (author \"unterminated))", "(other (x 1))",
        "(jbb (model (row 1 (2))))", "jbb",
    ])
    def test_syntax_errors_raise_pattern_error(self, text):
        with pytest.raises(PatternError):
            parse_jbb_data(text)


# ---------- .dbw -----------------------------------------------------


def _dbw_round_trip(pattern):
    return parse_dbw_data(render_dbw_data(pattern), "x")


class TestDbw:
    def test_notes_line_breaks_use_desktop_convention(self):
        weave = _weave()
        weave["notes"] = "first\nsecond\r\nthird\n"
        text = render_dbw_data(weave)
        assert "remarks==first\\second\\third\r\n" in text
        assert _dbw_round_trip(weave)["notes"] == "first\nsecond\nthird"

    def test_single_line_fields_cannot_break_the_file(self):
        weave = _weave()
        weave["author"] = "Anna\nMüller\\"
        weave["organization"] = "Org }\n\\data{"
        back = _dbw_round_trip(weave)
        assert back["author"] == "Anna Müller"
        assert back["organization"] == "Org } \\data{"
        assert back["data_entering"] == weave["data_entering"]

    def test_out_of_range_values_do_not_shift_neighbours(self):
        weave = _weave()
        weave["colors_warp"] = [300, -5, 7] + [55] * 37
        weave["data_entering"] = [70000] + weave["data_entering"][1:]
        weave["palette"][0] = [999, -1, 12]
        back = _dbw_round_trip(weave)
        assert back["colors_warp"] == [255, 0, 7] + [55] * 37
        assert len(back["colors_weft"]) == 30
        assert back["data_entering"][1:] == weave["data_entering"][1:]
        assert back["palette"][0][:3] == [255, 0, 12]

    def test_malformed_structure_raises_pattern_error(self):
        with pytest.raises(PatternError):
            parse_dbw_data("@dbw3:file\r\n}\r\n")
        with pytest.raises(PatternError):
            parse_dbw_data("@dbw3:file\r\ngarbage line\r\n")

    def test_scalar_where_section_expected_still_renders(self):
        weave = _weave()
        weave["_dbw_raw"] = {"data": "1", "view": {"general": "x"}}
        assert _dbw_round_trip(weave)["data_entering"] == (
            weave["data_entering"]
        )

    def test_unsafe_raw_keys_are_skipped(self):
        weave = _weave()
        weave["_dbw_raw"] = {"bad\r\nkey": "1", "ok": {"a b": "2", "c": "3"}}
        text = render_dbw_data(weave)
        assert "bad" not in text
        assert "a b" not in text
        assert "c==3" in text

    def test_non_dict_raw_falls_back_to_skeleton(self):
        weave = _weave()
        weave["_dbw_raw"] = ["not", "a", "dict"]
        assert _dbw_round_trip(weave)["width"] == 40


# ---------- SVG ------------------------------------------------------


class TestSvgEscaping:
    def test_bead_svg_with_markup_in_text_is_valid_xml(self, app):
        bead = _bead()
        bead["author"] = '<script>alert(1)</script> & "co"\x01'
        bead["view"] = {"draw-symbols": True, "symbols": "<&>"}
        with app.test_request_context():
            svg = beadexport.export_svg(bead)
        root = ET.fromstring(svg)
        assert "script" not in {el.tag.split("}")[-1] for el in root.iter()}
        assert b"&lt;script&gt;" in svg


# ---------- upload decoding and legacy download ----------------------


class TestUploadDecoding:
    def _upload(self, client, payload, filename):
        return client.post("/patterns/upload", data={
            "name": "", "file": [(io.BytesIO(payload), filename)],
        }, content_type="multipart/form-data")

    def test_utf8_jbb_with_umlauts(self, csrf_disabled_client):
        _login_as(csrf_disabled_client, _make_user())
        self._upload(csrf_disabled_client, DESKTOP_JBB.encode("utf-8"),
                     "rope.jbb")
        p = json.loads(Pattern.query.one().contents)
        assert p["author"] == 'Anna "Nina" Müller'

    def test_utf8_with_bom(self, csrf_disabled_client):
        _login_as(csrf_disabled_client, _make_user())
        self._upload(csrf_disabled_client,
                     b"\xef\xbb\xbf" + DESKTOP_JBB.encode("utf-8"),
                     "rope.jbb")
        assert Pattern.query.count() == 1

    def test_windows_1252_dbw(self, csrf_disabled_client):
        _login_as(csrf_disabled_client, _make_user())
        text = render_dbw_data(dict(_weave(), author="Jürg €"))
        self._upload(csrf_disabled_client, text.encode("cp1252"), "t.dbw")
        p = json.loads(Pattern.query.one().contents)
        assert p["author"] == "Jürg €"

    def test_legacy_download_round_trip(self, csrf_disabled_client):
        user = _make_user()
        _login_as(csrf_disabled_client, user)
        self._upload(csrf_disabled_client, DESKTOP_JBB.encode("utf-8"),
                     "rope.jbb")
        name = Pattern.query.one().name
        _reset_access_date(user)
        r = csrf_disabled_client.get(f"/alice/{name}/download/legacy")
        assert r.status_code == 200
        again = parse_jbb_data(r.data.decode("utf-8"))
        assert again["notes"] == "line one\nline two with a \\ backslash"

    def test_legacy_download_of_invalid_pattern_is_400(
        self, csrf_disabled_client
    ):
        user = _make_user()
        db.session.add(Pattern(
            name="broken", label="Broken", owner=user, public=False,
            pattern_type="JBead Pattern", contents=json.dumps({"x": 1}),
        ))
        db.session.commit()
        _login_as(csrf_disabled_client, user)
        r = csrf_disabled_client.get("/alice/broken/download/legacy")
        assert r.status_code == 400

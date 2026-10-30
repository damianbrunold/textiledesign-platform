"""Resource limits, input validation and the fixes that came with them:
linear bead repeat, clamped print ranges, size-checked .dbw import,
owner-scoped primary group lookup."""
import io
import json
import random
import re
import time

import pytest

from textileplatform import beadexport
from textileplatform import export
from textileplatform.beadpattern import smallest_period
from textileplatform.db import db
from textileplatform.exportcommon import TooLargeError
from textileplatform.models import Pattern, User
from textileplatform.patterns import get_patterns_for_user
from textileplatform.validation import PatternError, validate_pattern
from textileplatform.weavepattern import (
    _dehex_byte, _dehex_colors, _dehex_short, _dehex_ubyte,
    _enhex_byte, _enhex_colors, _enhex_short, _enhex_ubyte,
    _format_value, parse_dbw_data,
)

from test_patterns import _login, _make_user, _reset_access_date


def _weave(width=40, height=30):
    return {
        "name": "Twill", "notes": "",
        "width": width, "height": height,
        "max_shafts": 8, "max_treadles": 8,
        "data_entering": [i % 4 + 1 for i in range(width)],
        "data_tieup": [1 if (i + j) % 4 < 2 else 0
                       for j in range(8) for i in range(8)],
        "data_treadling": [1 if i == j % 4 else 0
                           for j in range(height) for i in range(8)],
        "data_reed": [0] * width,
        "colors_warp": [55] * width,
        "colors_weft": [49] * height,
        "palette": [[i, i, i] for i in range(256)],
    }


def _bead(width=10, height=20):
    return {
        "name": "Rope", "notes": "",
        "model": [[(i + j) % 3 for i in range(width)] for j in range(height)],
        "colors": [[255, 255, 255], [255, 0, 0], [0, 0, 255]],
        "view": {},
    }


def _page_count(pdf):
    return len(re.findall(rb"/Type /Page\b", pdf))


# ---------- bead repeat ----------------------------------------------


def _brute_force_period(seq):
    for p in range(1, len(seq)):
        if all(seq[k] == seq[k - p] for k in range(p, len(seq))):
            return p
    return len(seq)


class TestSmallestPeriod:
    def test_matches_brute_force(self):
        rng = random.Random(1)
        for _ in range(500):
            seq = [rng.randint(0, 2) for _ in range(rng.randint(1, 30))]
            assert smallest_period(seq) == _brute_force_period(seq)

    def test_empty(self):
        assert smallest_period([]) == 0

    def test_large_non_repeating_model_is_fast(self):
        # Used to be quadratic: ~1.5 h for the largest UI pattern.
        seq = [1] * 500_000 + [2]
        t0 = time.time()
        assert smallest_period(seq) == len(seq)
        assert time.time() - t0 < 5


# ---------- bead export geometry -------------------------------------


def _correct_by_loop(width, idx):
    """The original O(idx / width) implementation."""
    k, m = 0, width
    while idx >= m:
        idx -= m
        k += 1
        m = width if k % 2 == 0 else width + 1
    return idx, k


class TestBeadGeometry:
    @pytest.mark.parametrize("width", [1, 2, 7, 12, 100])
    def test_closed_form_matches_loop(self, width):
        for idx in range(0, 5 * (2 * width + 1) + 3):
            assert (
                beadexport._correct_y_for_index(width, idx)
                == _correct_by_loop(width, idx)
            )

    @pytest.mark.parametrize("offset", [0, 3])
    def test_column_indices_cover_exactly_the_rows(self, offset):
        width, n = 7, 200
        for start, end in [(0, 5), (5, 10), (20, 23), (40, 60)]:
            expected = [
                idx for idx in range(n)
                if start <= _correct_by_loop(width, idx + offset)[1] < end
            ]
            got = list(beadexport._column_indices(
                width, n, start, end, offset,
            ))
            assert got == expected

    def test_print_refuses_too_many_beads(self):
        data = {"model": [[1] * 1000 for _ in range(1001)], "view": {}}
        with pytest.raises(TooLargeError):
            beadexport.print_pdf(data)


# ---------- weave export limits --------------------------------------


class TestWeaveExportLimits:
    def test_print_range_is_clamped_to_pattern(self):
        data = _weave()
        t0 = time.time()
        huge = export.print_pdf(data, warp_to=10**6, weft_to=10**6,
                                harness_to=10**6, treadle_to=10**6)
        assert time.time() - t0 < 10
        full = export.print_pdf(data, warp_to=40, weft_to=30)
        assert _page_count(huge) == _page_count(full)

    def test_print_range_variants(self):
        data = _weave()
        for kwargs in [
            {"warp_from": 30, "warp_to": 5},       # reversed
            {"warp_from": 0, "weft_from": -5},     # below range
            {"harness_from": 0, "harness_to": 0},  # skip section
            {"treadle_from": 3},
        ]:
            assert _page_count(export.print_pdf(data, **kwargs)) >= 1

    def test_clamp_range(self):
        assert export._clamp_range(None, None, 2, 5, 10) == (2, 5)
        assert export._clamp_range(1, 10**6, 0, 0, 10) == (0, 10)
        assert export._clamp_range(8, 3, 0, 0, 10) == (2, 6)
        assert export._clamp_range(-4, 2, 0, 0, 10) == (0, 2)
        assert export._clamp_range(1, 5, 0, 0, 0) == (0, 0)

    def test_raster_over_budget_is_refused(self, monkeypatch):
        monkeypatch.setattr(export, "MAX_EXPORT_CELLS", 100)
        with pytest.raises(TooLargeError):
            export.export_png(_weave())

    def test_raster_shrinks_to_pixel_limit(self, monkeypatch):
        monkeypatch.setattr(export, "MAX_RASTER_PIXELS", 200_000)
        layout = export._raster_layout(_weave())
        assert layout.width * layout.height <= 200_000
        assert export.export_png(_weave())[:8] == b"\x89PNG\r\n\x1a\n"

    def test_extreme_factor_ratio_is_capped(self):
        data = _weave()
        data["warp_factor"] = 1e6
        layout = export._pattern_layout(data)
        assert layout.gw <= 16 * export.MAX_FACTOR_RATIO


# ---------- validation -----------------------------------------------


class TestValidation:
    def test_valid_patterns_pass(self):
        validate_pattern(_weave(), "DB-WEAVE Pattern")
        validate_pattern(_bead(), "JBead Pattern")

    def test_nulls_in_weave_grids_are_allowed(self):
        data = _weave()
        data["data_entering"][3] = None
        validate_pattern(data, "DB-WEAVE Pattern")

    @pytest.mark.parametrize("change", [
        lambda d: d.update(width=10**9),
        lambda d: d.update(height=0),
        lambda d: d.update(max_shafts="8"),
        lambda d: d.update(width=True),
        lambda d: d.update(data_entering="1234"),
        lambda d: d.update(data_tieup=[1, "x"]),
        lambda d: d.update(warp_factor=float("inf")),
        lambda d: d.update(weft_factor=-1),
        lambda d: d.update(palette={}),
    ])
    def test_invalid_weave_is_rejected(self, change):
        data = _weave()
        change(data)
        with pytest.raises(PatternError):
            validate_pattern(data, "DB-WEAVE Pattern")

    @pytest.mark.parametrize("change", [
        lambda d: d.update(model=[]),
        lambda d: d.update(model=[[1, 2], [1]]),
        lambda d: d.update(model=[[1, None]]),
        lambda d: d.update(model=[[0] * 3] * 20001),
        lambda d: d.update(view=[]),
    ])
    def test_invalid_bead_is_rejected(self, change):
        data = _bead()
        change(data)
        with pytest.raises(PatternError):
            validate_pattern(data, "JBead Pattern")

    def test_non_dict_and_unknown_type(self):
        with pytest.raises(PatternError):
            validate_pattern([], "JBead Pattern")
        with pytest.raises(PatternError):
            validate_pattern(_bead(), "Other")


# ---------- .dbw import ----------------------------------------------


def _dbw(size, fields=""):
    return (
        "@dbw3:file\r\n\\data{\r\n\\size{\r\n" + size + "\r\n}\r\n"
        + fields + "}\r\n"
    )


class TestDbwImport:
    def test_oversized_dimensions_are_refused_before_allocating(self):
        with pytest.raises(PatternError):
            parse_dbw_data(_dbw("maxx1==100000000\r\nmaxy2==50"))

    def test_hex_codecs_round_trip(self):
        values = [0, 1, 127, -128, -1, 64]
        assert _dehex_byte(_enhex_byte(values)) == values
        assert _dehex_ubyte(_enhex_ubyte([0, 128, 255])) == [0, 128, 255]
        shorts = [0, 1, 300, 32767, -32768, -2]
        assert _dehex_short(_enhex_short(shorts)) == shorts
        colors = [[1, 2, 3, 0], [255, 128, 0, 0]]
        assert _dehex_colors(_enhex_colors(colors)) == colors

    def test_trailing_odd_nibble_is_kept(self):
        assert _dehex_ubyte("0a1") == [10, 1]

    def test_large_field_decodes_quickly(self):
        hexdata = "\\\r\n".join(["0100"] * 2500)
        t0 = time.time()
        result = parse_dbw_data(_dbw(
            "maxx1==2500",
            "\\fields{\r\n\\einzug{\r\ndata==" + hexdata + "\r\n}\r\n}\r\n",
        ))
        assert result["data_entering"] == [1] * 2500
        assert time.time() - t0 < 5

    def test_long_values_wrap_at_70_chars(self):
        wrapped = _format_value("ab" * 71)
        lines = wrapped.split("\\\r\n")
        assert [len(line) for line in lines] == [70, 70, 2]
        assert _format_value("ab" * 35) == "ab" * 35


# ---------- HTTP: primary group, upload, save, export ----------------


def _login_as(client, user):
    _reset_access_date(user)
    _login(client, email=user.email)
    _reset_access_date(user)


class TestPrimaryGroupScoping:
    def test_foreign_group_with_my_name_does_not_block_me(
        self, csrf_disabled_client
    ):
        alice = _make_user()
        bob = _make_user(name="bob", email="bob@example.com")
        c = csrf_disabled_client
        _login_as(c, bob)
        r = c.post("/groups/add", data={"kind": "personal", "name": "alice"})
        assert r.status_code == 302
        c.post("/auth/logout")
        _login_as(c, alice)
        r = c.post("/patterns/create", data={
            "pattern_type": "JBead Pattern", "name": "Mine",
            "width": "10", "height": "10",
        })
        assert r.status_code == 302
        assert Pattern.query.filter_by(owner_id=alice.id).count() == 1


class TestUploadValidation:
    def _upload(self, client, payload, filename):
        return client.post("/patterns/upload", data={
            "name": "",
            "file": [(io.BytesIO(payload), filename)],
        }, content_type="multipart/form-data")

    def test_json_without_notes_is_accepted(self, csrf_disabled_client):
        user = _make_user()
        _login_as(csrf_disabled_client, user)
        bead = _bead()
        del bead["notes"]
        self._upload(csrf_disabled_client, json.dumps(bead).encode(),
                     "rope.json")
        assert Pattern.query.count() == 1

    def test_oversized_json_is_rejected(self, csrf_disabled_client):
        user = _make_user()
        _login_as(csrf_disabled_client, user)
        weave = _weave()
        weave["width"] = 10**9
        self._upload(csrf_disabled_client, json.dumps(weave).encode(),
                     "huge.json")
        assert Pattern.query.count() == 0


class TestSaveValidation:
    def test_invalid_contents_are_rejected(self, csrf_disabled_client):
        user = _make_user()
        p = Pattern(name="rope", label="Rope", owner=user,
                    pattern_type="JBead Pattern", public=False,
                    contents=json.dumps(_bead()))
        db.session.add(p)
        db.session.commit()
        _login_as(csrf_disabled_client, user)
        r = csrf_disabled_client.put("/api/pattern/alice/rope", json={
            "action": "save-pattern", "contents": {"model": "nope"},
        })
        assert r.status_code == 400
        assert json.loads(Pattern.query.one().contents) == _bead()

    def test_api_reports_modification_time(self, csrf_disabled_client):
        # Editors tag local drafts with the version they are based on.
        user = _make_user()
        db.session.add(Pattern(
            name="rope", label="Rope", owner=user,
            pattern_type="JBead Pattern", public=False,
            contents=json.dumps(_bead()),
        ))
        db.session.commit()
        _login_as(csrf_disabled_client, user)
        loaded = csrf_disabled_client.get("/api/pattern/alice/rope")
        assert "modified" in loaded.get_json()
        _reset_access_date(user)
        saved = csrf_disabled_client.put("/api/pattern/alice/rope", json={
            "action": "save-pattern", "contents": _bead(),
        }).get_json()
        assert saved["modified"]
        _reset_access_date(user)
        again = csrf_disabled_client.get("/api/pattern/alice/rope")
        assert again.get_json()["modified"] == saved["modified"]

    def test_valid_contents_are_saved(self, csrf_disabled_client):
        user = _make_user()
        db.session.add(Pattern(
            name="rope", label="Rope", owner=user,
            pattern_type="JBead Pattern", public=False,
            contents=json.dumps(_bead()),
        ))
        db.session.commit()
        _login_as(csrf_disabled_client, user)
        bigger = _bead(width=12)
        r = csrf_disabled_client.put("/api/pattern/alice/rope", json={
            "action": "save-pattern", "contents": bigger,
        })
        assert r.status_code == 200
        assert json.loads(Pattern.query.one().contents) == bigger


class TestExportEndpoints:
    def _public_weave(self, data=None):
        user = _make_user()
        db.session.add(Pattern(
            name="twill", label="Twill", owner=user,
            pattern_type="DB-WEAVE Pattern", public=True,
            contents=json.dumps(data or _weave()),
        ))
        db.session.commit()

    def test_anonymous_print_with_huge_range_is_clamped(self, client):
        self._public_weave()
        t0 = time.time()
        r = client.get(
            "/alice/twill/print?warp_to=1000000&weft_to=1000000"
        )
        assert r.status_code == 200
        assert r.data[:4] == b"%PDF"
        assert time.time() - t0 < 10

    def test_export_of_invalid_stored_pattern_is_400(self, client):
        data = _weave()
        data["width"] = 10**9
        self._public_weave(data)
        r = client.get("/alice/twill/export/png")
        assert r.status_code == 400
        assert r.mimetype == "text/plain"

    def test_over_budget_export_is_400(self, client, monkeypatch):
        monkeypatch.setattr(export, "MAX_EXPORT_CELLS", 100)
        self._public_weave()
        r = client.get("/alice/twill/export/svg")
        assert r.status_code == 400
        assert b"too large" in r.data

    def test_print_post_with_bad_range_is_400(self, csrf_disabled_client):
        self._public_weave()
        _login_as(csrf_disabled_client, User.query.one())
        r = csrf_disabled_client.post("/alice/twill/print", json={
            "contents": _weave(), "warp_to": "lots",
        })
        assert r.status_code == 400

    @pytest.mark.parametrize("fmt", ["png", "jpg", "svg", "pdf"])
    def test_weave_export_formats(self, client, fmt):
        self._public_weave()
        r = client.get(f"/alice/twill/export/{fmt}")
        assert r.status_code == 200
        assert len(r.data) > 100


class TestGetPatternsForUser:
    def test_only_public(self, app):
        user = _make_user()
        db.session.add_all([
            Pattern(name="pub", label="Pub", owner=user, public=True,
                    pattern_type="JBead Pattern", contents="{}"),
            Pattern(name="priv", label="Priv", owner=user, public=False,
                    pattern_type="JBead Pattern", contents="{}"),
        ])
        db.session.commit()
        public = get_patterns_for_user(user, only_public=True)
        assert [p.name for p in public] == ["pub"]
        assert len(get_patterns_for_user(user)) == 2

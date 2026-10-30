from textileplatform.beadpattern import smallest_period
from textileplatform.db import db
from textileplatform.models import Assignment
from textileplatform.models import Group
from textileplatform.models import Pattern
from textileplatform.name import from_label
from textileplatform.palette import default_bead_palette
from textileplatform.palette import default_weave_palette

import datetime
import json
import logging

from flask import abort
from sqlalchemy.exc import IntegrityError


def _truncate(value, n):
    if value is None:
        return None
    return str(value)[:n] or None


def _bead_repeat(model):
    """Shortest repeat (in beads) of a JBead model, or None if empty.

    Mirrors BeadList.updateRepeat in jbead.js: beads are read row by
    row from the bottom, up to the highest used row, and the repeat is
    the shortest period that matches the whole used area.
    """
    if not isinstance(model, list) or not model:
        return None
    if not all(isinstance(row, list) for row in model):
        return None
    used_h = 0
    for j, row in enumerate(model):
        if any(c for c in row):
            used_h = j + 1
    if used_h == 0:
        return None
    return smallest_period([c for row in model[:used_h] for c in row])


def extract_pattern_metadata(pattern_dict, pattern_type):
    """Pull list-view fields out of the pattern JSON.

    Returns a dict with keys matching new Pattern columns. Missing keys
    in the JSON yield None — list views render '—' or skip them.
    """
    md = {
        "author": _truncate(pattern_dict.get("author"), 120),
        "organization": _truncate(pattern_dict.get("organization"), 120),
        "notes": pattern_dict.get("notes") or None,
        "pattern_width": None,
        "pattern_height": None,
        "rapport_width": None,
        "rapport_height": None,
    }
    try:
        if pattern_type == "DB-WEAVE Pattern":
            # "Used" extents: largest warp index with a non-zero entering
            # entry, largest weft index with a non-zero treadling entry.
            # These match the editor's runtime min/max_x/min/max_y, which
            # is what users care about ("how big is the pattern actually").
            used_w = 0
            entering = pattern_dict.get("data_entering") or []
            for i, v in enumerate(entering):
                if v and v > 0:
                    used_w = i + 1
            used_h = 0
            treadling = pattern_dict.get("data_treadling") or []
            max_treadles = pattern_dict.get("max_treadles") or 0
            if isinstance(treadling, list) and max_treadles:
                rows = len(treadling) // max_treadles
                for j in range(rows):
                    base = j * max_treadles
                    if any(
                        v and v > 0
                        for v in treadling[base:base + max_treadles]
                    ):
                        used_h = j + 1
            # Empty patterns (no entering / no treadling) report no size
            # rather than the full canvas dimensions — those would be
            # misleading ("how big is the pattern actually" → nothing).
            md["pattern_width"] = used_w if used_w > 0 else None
            md["pattern_height"] = used_h if used_h > 0 else None
            # Empty patterns get no rapport either: the editor's
            # calcRapport collapses min_x=max_x=0 / min_y=max_y=0 into a
            # 1×1 rapport, which would render as "r:1×1" in the listing
            # and confuse the user.
            if used_w > 0 and used_h > 0:
                ka = pattern_dict.get("rapport_k_a")
                kb = pattern_dict.get("rapport_k_b")
                sa = pattern_dict.get("rapport_s_a")
                sb = pattern_dict.get("rapport_s_b")
                if (
                    isinstance(ka, int) and isinstance(kb, int)
                    and kb >= ka and ka >= 0
                ):
                    md["rapport_width"] = kb - ka + 1
                if (
                    isinstance(sa, int) and isinstance(sb, int)
                    and sb >= sa and sa >= 0
                ):
                    md["rapport_height"] = sb - sa + 1
        elif pattern_type == "JBead Pattern":
            model = pattern_dict.get("model")
            if isinstance(model, list) and model:
                # Used height: highest row index containing a non-zero
                # cell (matches the editor's runtime usedHeight). For
                # empty patterns (every row blank) report no size — the
                # full canvas height would be misleading.
                used_h = 0
                for j, row in enumerate(model):
                    if isinstance(row, list) and any(c for c in row):
                        used_h = j + 1
                if used_h > 0:
                    first = model[0]
                    if isinstance(first, list):
                        md["pattern_width"] = len(first)
                    md["pattern_height"] = used_h
            repeat = pattern_dict.get("repeat")
            if not (isinstance(repeat, int) and repeat > 0):
                # Uploaded, cloned or older patterns carry no repeat;
                # derive it from the model like the editor does.
                repeat = _bead_repeat(model)
            if isinstance(repeat, int) and repeat > 0:
                md["rapport_height"] = repeat
    except Exception:
        logging.exception("extract_pattern_metadata failed")
    return md


def apply_pattern_metadata(pattern, pattern_dict):
    md = extract_pattern_metadata(pattern_dict, pattern.pattern_type)
    for key, value in md.items():
        setattr(pattern, key, value)


def primary_group(user):
    """The user's primary personal group: owned by the user and named
    like them. Other users may own personal groups with the same name,
    so the lookup has to be scoped to the owner."""
    group = Group.query.filter(
        Group.owner_id == user.id, Group.name == user.name,
    ).one_or_none()
    if not group:
        logging.error(f"User {user.name} does not have primary group")
        abort(500)
    return group


_MAX_NAME_SUFFIX = 10


def _insert_pattern(user, label, make):
    """Store a new pattern of ``user`` in their primary group, named after
    ``label``; while that name is taken, try "label - 1" … "label - 10".
    ``make(name, label)`` builds the Pattern. Commits; returns the name."""
    group = primary_group(user)
    for suffix in range(_MAX_NAME_SUFFIX + 1):
        candidate = f"{label} - {suffix}" if suffix else label
        name = from_label(candidate)
        pattern = make(name, candidate)
        db.session.add(pattern)
        db.session.add(Assignment(pattern=pattern, group=group))
        try:
            db.session.commit()
            return name
        except IntegrityError:
            db.session.rollback()
    raise ValueError(f"no free pattern name for {label!r}")


def add_pattern(contents, user, pattern_type):
    """Store pattern JSON ``contents`` (with a "name") as a new private
    pattern of ``user``. Returns the pattern name."""
    now = datetime.datetime.now(datetime.timezone.utc)

    def make(name, label):
        p = Pattern(
            name=name,
            label=label,
            description=contents.get("notes", ""),
            pattern_type=pattern_type,
            contents=json.dumps(contents),
            created=now,
            modified=now,
            public=False,
            owner=user,
        )
        apply_pattern_metadata(p, contents)
        return p

    return _insert_pattern(user, contents["name"], make)


def clone_pattern(user, pattern, contents):
    """Copy ``pattern`` (with the given JSON ``contents`` string) into
    ``user``'s patterns. Returns the new pattern name."""
    now = datetime.datetime.now(datetime.timezone.utc)
    try:
        parsed = json.loads(contents)
    except (TypeError, ValueError):
        parsed = None

    def make(name, label):
        p = Pattern(
            name=name,
            label=label,
            description=pattern.description,
            pattern_type=pattern.pattern_type,
            contents=contents,
            preview_image=pattern.preview_image,
            thumbnail_image=pattern.thumbnail_image,
            created=now,
            modified=now,
            public=False,
            owner=user,
        )
        if isinstance(parsed, dict):
            apply_pattern_metadata(p, parsed)
        return p

    return _insert_pattern(user, pattern.label, make)


def new_weave_pattern(name, author, width, height, prefs=None):
    """Contents of a new, empty DB-WEAVE pattern. ``prefs`` are the
    user's saved dbweave settings (Extras ▸ Grundeinstellung / Optionen ▸
    Global…), so the American / Scandinavian / Swiss preset chosen in the
    editor carries over; without them the Swiss preset applies."""
    prefs = prefs if isinstance(prefs, dict) else {}
    max_shafts = max_treadles = 32
    return {
        "name": name,
        "author": author,
        "organization": "",
        "notes": "",
        "width": width,
        "height": height,
        "max_shafts": max_shafts,
        "max_treadles": max_treadles,
        "data_entering": [0] * width,
        "data_tieup": [0] * (max_shafts * max_treadles),
        "data_treadling": [0] * (max_treadles * height),
        "data_reed": ([0, 0, 1, 1] * ((width + 3) // 4))[:width],
        "colors_warp": [55] * width,
        "colors_weft": [49] * height,
        "palette": [list(c) for c in default_weave_palette],
        "visible_shafts": 12,
        "visible_treadles": 12,
        "warp_lifting": True,
        "zoom": 3,
        "display_repeat": False,
        "display_reed": True,
        "display_colors_warp": True,
        "display_colors_weft": True,
        "display_entering": True,
        "display_threading": True,
        "direction_righttoleft": bool(
            prefs.get("direction_righttoleft", False)),
        "direction_toptobottom": bool(
            prefs.get("direction_toptobottom", False)),
        "entering_at_bottom": bool(prefs.get("entering_at_bottom", False)),
        "entering_style": prefs.get("entering_style", "vdash"),
        "treadling_style": prefs.get("treadling_style", "dot"),
        "tieup_style": prefs.get("tieup_style", "cross"),
        "pegplan_style": prefs.get("pegplan_style", "filled"),
        "sinking_shed": bool(prefs.get("sinking_shed", False)),
        "single_treadling": bool(prefs.get("single_treadling", True)),
        "weave_style": "draft",
    }


# Default per-colour symbol glyphs (the desktop's
# BeadSymbols.DEFAULT_SYMBOLS). Slot 0 is the background and never drawn.
DEFAULT_BEAD_SYMBOLS = "·abcdefghijklmnopqrstuvwxyz+-/\\*"


def new_bead_pattern(name, author, width, height, prefs=None):
    """Contents of a new, empty JBead pattern. ``prefs`` are the user's
    last view-state choices in the bead editor."""
    prefs = prefs if isinstance(prefs, dict) else {}

    def pref_bool(key, default):
        v = prefs.get(key)
        return bool(v) if v is not None else default

    # Zoom is the cell size in pixels; the editor accepts 4..48.
    zoom = prefs.get("zoom")
    if not (isinstance(zoom, (int, float)) and 4 <= int(zoom) <= 48):
        zoom = 12
    symbols = prefs.get("symbols")
    if not (isinstance(symbols, str) and symbols):
        symbols = DEFAULT_BEAD_SYMBOLS
    return {
        "name": name,
        "author": author,
        "organization": "",
        "notes": "",
        # One list per row — `[[0] * width] * height` would share rows.
        "model": [[0] * width for _ in range(height)],
        "colors": [list(c) for c in default_bead_palette],
        "view": {
            "draft-visible": pref_bool("draft-visible", True),
            "corrected-visible": pref_bool("corrected-visible", True),
            "simulation-visible": pref_bool("simulation-visible", True),
            "report-visible": pref_bool("report-visible", True),
            "draw-colors": pref_bool("draw-colors", True),
            "draw-symbols": pref_bool("draw-symbols", False),
            "zoom": int(zoom),
            "shift": 0,
            "scroll": 0,
            # New patterns open with the pencil so a click paints.
            "selected-tool": "pencil",
            "selected-color": 1,
            "symbols": symbols,
        },
    }


def get_patterns_for_user(user, only_public=False):
    if only_public:
        return (
            Pattern.query
            .filter(Pattern.owner_id == user.id)
            .filter(Pattern.public.is_(True))
            .order_by(Pattern.label)
            .all()
        )
    else:
        return (
            Pattern.query
            .filter(Pattern.owner_id == user.id)
            .order_by(Pattern.label)
            .all()
        )


def format_pattern_source(obj, step=2, max_width=100):
    """Pretty-print a pattern JSON tree.

    A subtree is rendered compactly on a single line if it fits within
    ``max_width`` columns at the current indent; otherwise it is
    expanded. Long flat lists (rows of numbers in weave/bead data) are
    wrapped onto multiple lines instead of one element per line.
    """
    return _fmt(obj, 0, step, max_width, column=0)


def _fmt(obj, indent, step, max_width, column):
    compact = json.dumps(obj, ensure_ascii=False, separators=(", ", ": "))
    if column + len(compact) <= max_width:
        return compact
    pad = " " * indent
    inner_pad = " " * (indent + step)
    if isinstance(obj, dict):
        if not obj:
            return "{}"
        items = []
        for k, v in obj.items():
            prefix = (
                f"{inner_pad}{json.dumps(k, ensure_ascii=False)}: "
            )
            items.append(
                prefix
                + _fmt(v, indent + step, step, max_width, column=len(prefix))
            )
        return "{\n" + ",\n".join(items) + "\n" + pad + "}"
    if isinstance(obj, list):
        if not obj:
            return "[]"
        if all(not isinstance(x, (dict, list)) for x in obj):
            return _fmt_flat_list(obj, indent + step, max_width) + (
                "\n" + pad + "]"
            )
        items = []
        for x in obj:
            items.append(
                inner_pad
                + _fmt(
                    x, indent + step, step, max_width,
                    column=len(inner_pad),
                )
            )
        return "[\n" + ",\n".join(items) + "\n" + pad + "]"
    return json.dumps(obj, ensure_ascii=False)


def _fmt_flat_list(lst, indent, max_width):
    pad = " " * indent
    parts = [json.dumps(x, ensure_ascii=False) for x in lst]
    lines = []
    line = pad
    for i, p in enumerate(parts):
        sep = "," if i < len(parts) - 1 else ""
        candidate = line + p + sep
        if len(candidate) > max_width and line != pad:
            lines.append(line.rstrip())
            line = pad + p + sep + " "
        else:
            line += p + sep + " "
    line = line.rstrip()
    if line:
        lines.append(line)
    return "[\n" + "\n".join(lines)

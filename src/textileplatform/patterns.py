from textileplatform.db import db
from textileplatform.models import Assignment
from textileplatform.models import Group
from textileplatform.models import Pattern
from textileplatform.name import from_label

import datetime
import json
import logging

from flask import abort
from sqlalchemy.exc import IntegrityError


def _truncate(value, n):
    if value is None:
        return None
    return str(value)[:n] or None


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
            md["pattern_width"] = used_w if used_w > 0 else (
                int(pattern_dict.get("width") or 0) or None
            )
            md["pattern_height"] = used_h if used_h > 0 else (
                int(pattern_dict.get("height") or 0) or None
            )
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
                first = model[0]
                if isinstance(first, list):
                    md["pattern_width"] = len(first)
                # Used height: highest row index containing a non-zero
                # cell (matches the editor's runtime usedHeight).
                used_h = 0
                for j, row in enumerate(model):
                    if isinstance(row, list) and any(c for c in row):
                        used_h = j + 1
                md["pattern_height"] = used_h or len(model)
            repeat = pattern_dict.get("repeat")
            if isinstance(repeat, int) and repeat > 0:
                md["rapport_height"] = repeat
    except Exception:
        logging.exception("extract_pattern_metadata failed")
    return md


def apply_pattern_metadata(pattern, pattern_dict):
    md = extract_pattern_metadata(pattern_dict, pattern.pattern_type)
    for key, value in md.items():
        setattr(pattern, key, value)


def add_weave_pattern(pattern, user):
    group = Group.query.filter(Group.name == user.name).one_or_none()
    if not group:
        logging.error(f"User {user.name} does not have primary group")
        abort(500)
    suffix = None
    now = datetime.datetime.now(datetime.timezone.utc)
    while True:
        if suffix and suffix > 10:
            break
        if suffix:
            label = pattern["name"] + " - " + str(suffix)
        else:
            label = pattern["name"]
        name = from_label(label)
        try:
            p = Pattern(
                name=name,
                label=label,
                description=pattern["notes"],
                pattern_type="DB-WEAVE Pattern",
                contents=json.dumps(pattern),
                created=now,
                modified=now,
                public=False,
                owner=user,
            )
            apply_pattern_metadata(p, pattern)
            assignment = Assignment(
                pattern=p,
                group=group,
            )
            db.session.add(p)
            db.session.add(assignment)
            db.session.commit()
            return name
        except IntegrityError:
            db.session.rollback()
            if suffix:
                suffix += 1
            else:
                suffix = 1


def add_bead_pattern(pattern, user):
    group = Group.query.filter(Group.name == user.name).one_or_none()
    if not group:
        logging.error(f"User {user.name} does not have primary group")
        abort(500)
    suffix = None
    now = datetime.datetime.now(datetime.timezone.utc)
    while True:
        if suffix and suffix > 10:
            break
        if suffix:
            label = pattern["name"] + " - " + str(suffix)
        else:
            label = pattern["name"]
        name = from_label(label)
        try:
            p = Pattern(
                name=name,
                label=label,
                description=pattern["notes"],
                pattern_type="JBead Pattern",
                contents=json.dumps(pattern),
                created=now,
                modified=now,
                public=False,
                owner=user,
            )
            apply_pattern_metadata(p, pattern)
            assignment = Assignment(
                pattern=p,
                group=group,
            )
            db.session.add(p)
            db.session.add(assignment)
            db.session.commit()
            return name
        except IntegrityError:
            db.session.rollback()
            if suffix:
                suffix += 1
            else:
                suffix = 1


def get_patterns_for_user(user, only_public=False):
    if only_public:
        return (
            Pattern.query
            .filter(Pattern.owner_id == user.id)
            .filter(Pattern.public is True)
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


def clone_pattern(user, pattern, contents):
    group = Group.query.filter(Group.name == user.name).one_or_none()
    if not group:
        logging.error(f"User {user.name} does not have primary group")
        abort(500)
    suffix = None
    while True:
        if suffix and suffix > 10:
            break
        try:
            now = datetime.datetime.now(datetime.timezone.utc)
            if suffix:
                label = pattern.label + " - " + str(suffix)
            else:
                label = pattern.label
            name = from_label(label)
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
            try:
                apply_pattern_metadata(p, json.loads(contents))
            except Exception:
                logging.exception("metadata extract on clone failed")
            assignment = Assignment(
                pattern=p,
                group=group,
            )
            db.session.add(p)
            db.session.add(assignment)
            db.session.commit()
            break
        except IntegrityError:
            db.session.rollback()
            if not suffix:
                suffix = 1
            else:
                suffix += 1

from textileplatform.beadpattern import parse_jbb_data, render_jbb_data
from textileplatform.db import db
from textileplatform.app import app
from textileplatform.models import User
from textileplatform.models import Pattern
from textileplatform.models import Group
from textileplatform.models import Membership
from textileplatform.models import Assignment
from textileplatform.messaging import (
    ensure_group_conversation,
    get_or_create_direct_conversation,
    get_or_create_group_participant,
    can_access_conversation,
    post_message,
    unread_count,
    conversations_for_user,
)
from textileplatform.models import Conversation
from textileplatform.models import ConversationParticipant
from textileplatform.models import Message
from textileplatform.patterns import add_weave_pattern
from textileplatform.patterns import add_bead_pattern
from textileplatform.patterns import apply_pattern_metadata
from textileplatform.patterns import get_patterns_for_user
from textileplatform.patterns import clone_pattern
from textileplatform.patterns import format_pattern_source
from textileplatform.name import from_label
from textileplatform.name import is_valid
from textileplatform.mail import send_verification_mail
from textileplatform.mail import send_admin_notification_mail
from textileplatform.mail import send_recover_mail
from textileplatform.mail import send_support_dm_mail
from textileplatform.support import SUPPORT_USERNAME
from textileplatform.support import is_support
from textileplatform.palette import default_weave_palette
from textileplatform.palette import default_bead_palette
from textileplatform.weavepattern import parse_dbw_data, render_dbw_data
from textileplatform import export as exporter
from textileplatform import beadexport as bead_exporter

from importlib.metadata import version
import datetime
import io
import json
import logging
import zipfile
import os
import functools
import secrets

from flask import abort
from flask import flash
from flask import g
from flask import redirect
from flask import render_template
from flask import request
from flask import send_file
from flask import url_for
from flask import jsonify
from werkzeug.exceptions import HTTPException
import babel
from flask_babel import gettext
from flask_babel import get_locale
from flask_babel import get_timezone
from flask import session
import pytz
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash
from werkzeug.security import check_password_hash


@app.before_request
def load_logged_in_user():
    user_name = session.get("user_name")
    if user_name is None:
        g.user = None
    else:
        try:
            g.user = User.query.filter(User.name == user_name).first()
            if g.user:
                impersonating = bool(session.get("impersonator"))
                # if the user got disabled, we force logout
                if g.user.disabled and not impersonating:
                    session.clear()
                    return redirect(url_for("login"))
                now = datetime.datetime.now(datetime.timezone.utc)

                # we force logout after a month of inactivity (skip while
                # impersonating — superuser may be testing dormant users)
                if (
                    not impersonating
                    and g.user.access_date
                    and (now - g.user.access_date).days > 30
                ):
                    session.clear()
                    return redirect(url_for("login"))

                # we update access date every 10 minutes in the database
                # this gives us reasonably accurrate usage info without
                # writing to the database with each click. Don't update
                # access_date while impersonating, so we don't disturb
                # the real user's last-seen timestamp.
                if (
                    not impersonating
                    and g.user.access_date
                    and (now - g.user.access_date).total_seconds() > 600
                ):
                    g.user.access_date = now
                    db.session.commit()
        except Exception:
            g.user = None


def login_required(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            return redirect(url_for("login"))
        return view(**kwargs)
    return wrapped_view


def support_required(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None or g.user.name != SUPPORT_USERNAME:
            return redirect(url_for("index"))
        return view(**kwargs)
    return wrapped_view


def is_real_support():
    """True if the logged-in session was opened as superuser (whether or
    not we are currently impersonating)."""
    return (
        session.get("impersonator") == SUPPORT_USERNAME
        or session.get("user_name") == SUPPORT_USERNAME
    )


def respond(status, message, status_code=500):
    return jsonify({"status": status, "message": message}), status_code


@app.route("/")
def index():
    if g.user:
        return redirect(url_for("user", user_name=g.user.name))
    elif str(get_locale() or "en") == "de":
        return redirect(url_for("group", group_name="beispiele"))
    else:
        return redirect(url_for("group", group_name="examples"))


@app.route("/groups/<string:group_name>")
def group(group_name):
    try:
        group = Group.query.filter(Group.name == group_name).one_or_none()
        if not group:
            return redirect(url_for("index"))
        is_member = bool(g.user and g.user.is_in_group(group.id))
        raw = []
        for a in group.assignments:
            p = a.pattern
            if not is_member and not p.public:
                continue
            raw.append(p)
        raw.sort(key=lambda p: (p.label.lower(), p.name, p.owner.name, p.id))
        # Flatten into the same shape as the user_private/_public templates
        # so we can reuse the thumbnail-card markup.
        patterns = [{
            "name": p.name,
            "label": p.label,
            "owner_name": p.owner.name,
            "owner_label": p.owner.label,
            "pattern_type": p.pattern_type,
            "public": bool(p.public),
            "modified": p.modified.isoformat() if p.modified else None,
            "created": p.created.isoformat() if p.created else None,
            "author": p.author or "",
            "organization": p.organization or "",
            "notes": p.notes or "",
            "pattern_width": p.pattern_width,
            "pattern_height": p.pattern_height,
            "rapport_width": p.rapport_width,
            "rapport_height": p.rapport_height,
        } for p in raw]
        patterns_weave = [p for p in patterns if p["pattern_type"] == "DB-WEAVE Pattern"]
        patterns_bead = [p for p in patterns if p["pattern_type"] == "JBead Pattern"]
        patterns_other = [p for p in patterns
                          if p["pattern_type"] not in ("DB-WEAVE Pattern", "JBead Pattern")]
        return render_template(
            "group.html",
            group=group,
            patterns_weave=patterns_weave,
            patterns_bead=patterns_bead,
            patterns_other=patterns_other,
        )
    except HTTPException:
        raise
    except Exception:
        logging.exception("system error")
        abort(500)


@app.route("/<string:user_name>")
def user(user_name):
    user = User.query.filter(User.name == user_name.lower()).first()
    if not user:
        return redirect(url_for("index"))
    if is_support(user) and (not g.user or g.user.name != user.name):
        abort(404)
    if is_support(user) and g.user and g.user.name == user.name:
        return redirect(url_for("support_console"))
    if g.user and g.user.name == user.name:
        # Private view: groups list + per-group pattern lists with the
        # full metadata the new UI needs (dimensions, rapport, author,
        # organisation, notes). The template renders the shell, JS
        # handles view-mode / sort / filter / actions.
        is_owner = (g.user.name == user.name)
        groups = []
        patterns_by_group = {}
        seen = set()
        for m in user.memberships:
            if m.state != "accepted":
                continue
            if m.group.id in seen:
                continue
            seen.add(m.group.id)
            role = m.role
            can_write = role in ("owner", "writer")
            patterns = []
            for a in m.group.assignments:
                p = a.pattern
                # Owner of pattern can fully manage it; others can only
                # view (or clone elsewhere). For pattern owned by THIS
                # user (the profile owner), treat as writable.
                pattern_is_mine = (p.owner_id == user.id)
                patterns.append({
                    "name": p.name,
                    "label": p.label,
                    "owner_name": p.owner.name,
                    "owner_label": p.owner.label,
                    "pattern_type": p.pattern_type,
                    "public": bool(p.public),
                    "modified": p.modified.isoformat() if p.modified else None,
                    "created": p.created.isoformat() if p.created else None,
                    "author": p.author or "",
                    "organization": p.organization or "",
                    "notes": p.notes or "",
                    "pattern_width": p.pattern_width,
                    "pattern_height": p.pattern_height,
                    "rapport_width": p.rapport_width,
                    "rapport_height": p.rapport_height,
                    "is_mine": pattern_is_mine,
                })
            patterns.sort(key=lambda d: (d["label"].lower(), d["name"]))
            groups.append({
                "name": m.group.name,
                "label": m.group.label,
                "is_personal": (m.group.name == user.name),
                "role": role,
                "can_write": can_write,
            })
            patterns_by_group[m.group.name] = patterns
        # Order: personal first, then alphabetical by label.
        groups.sort(key=lambda gr: (
            0 if gr["is_personal"] else 1, gr["label"].lower(),
        ))
        active = request.args.get("group") or user.name
        if active not in patterns_by_group:
            active = user.name if user.name in patterns_by_group else (
                groups[0]["name"] if groups else user.name
            )
        return render_template(
            "user_private.html",
            user=user,
            is_owner=is_owner,
            groups=groups,
            patterns_by_group=patterns_by_group,
            active_group=active,
        )
    else:
        # Public view: same metadata shape as the private view so the
        # template can reuse view modes / sort / filter, but only the
        # user's *own* public patterns are listed (deduped).
        ids = set()
        patterns = []
        for m in user.memberships:
            for a in m.group.assignments:
                p = a.pattern
                if not p.public:
                    continue
                if p.owner_id != user.id:
                    continue
                if p.id in ids:
                    continue
                ids.add(p.id)
                patterns.append({
                    "name": p.name,
                    "label": p.label,
                    "owner_name": p.owner.name,
                    "owner_label": p.owner.label,
                    "pattern_type": p.pattern_type,
                    "public": True,
                    "modified": p.modified.isoformat() if p.modified else None,
                    "created": p.created.isoformat() if p.created else None,
                    "author": p.author or "",
                    "organization": p.organization or "",
                    "notes": p.notes or "",
                    "pattern_width": p.pattern_width,
                    "pattern_height": p.pattern_height,
                    "rapport_width": p.rapport_width,
                    "rapport_height": p.rapport_height,
                })
        patterns.sort(key=lambda d: (d["label"].lower(), d["name"]))
        return render_template(
            "user_public.html",
            user=user,
            patterns=patterns,
        )


@app.route("/<string:user_name>/<string:pattern_name>")
def edit_pattern(user_name, pattern_name):
    origin = request.args.get("origin", "")
    user = User.query.filter(User.name == user_name.lower()).first()
    if not user:
        return redirect(url_for("index"))
    pattern = (
        Pattern.query
        .join(User, Pattern.owner_id == User.id)
        .filter(Pattern.name == pattern_name)
        .filter(User.name == user_name.lower())
        .first()
    )
    if not pattern:
        return redirect(url_for("user", user_name=user_name))
    readonly = not g.user or g.user.name != user.name
    superuser = g.user and g.user.name == SUPPORT_USERNAME
    if not superuser and readonly and not pattern.public:
        return redirect(url_for("user", user_name=user_name))
    pattern.pattern = json.loads(pattern.contents)
    if pattern.pattern_type == "DB-WEAVE Pattern":
        # fix None in data
        for idx, value in enumerate(pattern.pattern["data_entering"]):
            if value is None:
                pattern.pattern["data_entering"][idx] = 0
        for idx, value in enumerate(pattern.pattern["data_tieup"]):
            if value is None:
                pattern.pattern["data_tieup"][idx] = 0
        for idx, value in enumerate(pattern.pattern["data_treadling"]):
            if value is None:
                pattern.pattern["data_treadling"][idx] = 0
        for idx, value in enumerate(pattern.pattern["data_reed"]):
            if value is None:
                pattern.pattern["data_reed"][idx] = 0
        return render_template(
            "edit_dbweave_pattern.html",
            user=user,
            pattern=pattern,
            readonly=readonly,
            origin=origin,
        )
    elif pattern.pattern_type == "JBead Pattern":
        return render_template(
            "edit_jbead_pattern.html",
            user=user,
            pattern=pattern,
            readonly=readonly,
            origin=origin,
        )
    else:
        return redirect(url_for("user", user_name=user.name))


@app.route("/terms")
def terms():
    return render_template("terms.html", locale=str(get_locale() or "en"))


@app.route("/privacy")
def privacy():
    return render_template("privacy.html", locale=str(get_locale() or "en"))


@app.route("/imprint")
def imprint():
    return render_template("imprint.html", locale=str(get_locale() or "en"))


@app.route("/admin/status")
def status():
    try:
        v = version("textileplatform")
    except Exception:
        v = "-"
    return render_template("status.html", v=v)


@app.route("/<string:user_name>/<string:pattern_name>/download")
def download_pattern(user_name, pattern_name):
    origin = request.args.get("origin", "")
    user = User.query.filter(User.name == user_name.lower()).first()
    if not user:
        return redirect(url_for("index"))
    pattern = (
        Pattern.query
        .join(User, Pattern.owner_id == User.id)
        .filter(Pattern.name == pattern_name)
        .filter(User.name == user_name.lower())
        .first()
    )
    if not pattern:
        return redirect(url_for("user", user_name=user_name))
    readonly = not g.user or g.user.name != user.name
    superuser = g.user and g.user.name == SUPPORT_USERNAME
    if not superuser and readonly and not pattern.public:
        return redirect(url_for("user", user_name=user_name))
    pattern.pattern = json.loads(pattern.contents)
    return send_file(
        io.BytesIO(
            json.dumps(
                pattern.pattern,
                ensure_ascii=False,
                indent=2,
            ).encode("utf8")
        ),
        mimetype="application/json",
        as_attachment=True,
        download_name=f"{user_name}-{pattern_name}.json",
    )


@app.route("/<string:user_name>/<string:pattern_name>/download/legacy")
def download_pattern_legacy(user_name, pattern_name):
    user = User.query.filter(User.name == user_name.lower()).first()
    if not user:
        return redirect(url_for("index"))
    pattern = (
        Pattern.query
        .join(User, Pattern.owner_id == User.id)
        .filter(Pattern.name == pattern_name)
        .filter(User.name == user_name.lower())
        .first()
    )
    if not pattern:
        return redirect(url_for("user", user_name=user_name))
    readonly = not g.user or g.user.name != user.name
    superuser = g.user and g.user.name == SUPPORT_USERNAME
    if not superuser and readonly and not pattern.public:
        return redirect(url_for("user", user_name=user_name))
    pattern.pattern = json.loads(pattern.contents)
    if pattern.pattern_type == "DB-WEAVE Pattern":
        return send_file(
            io.BytesIO(render_dbw_data(pattern.pattern).encode("utf8")),
            mimetype="application/octet-stream",
            as_attachment=True,
            download_name=f"{user_name}-{pattern_name}.dbw",
        )
    elif pattern.pattern_type == "JBead Pattern":
        return send_file(
            io.BytesIO(render_jbb_data(pattern.pattern).encode("utf8")),
            mimetype="application/octet-stream",
            as_attachment=True,
            download_name=f"{user_name}-{pattern_name}.jbb",
        )
    else:
        return redirect(url_for("user", user_name=user_name))


_WEAVE_EXPORT = {
    "png":  ("image/png",       "png", exporter.export_png),
    "jpeg": ("image/jpeg",      "jpg", exporter.export_jpeg),
    "jpg":  ("image/jpeg",      "jpg", exporter.export_jpeg),
    "svg":  ("image/svg+xml",   "svg", exporter.export_svg),
    "pdf":  ("application/pdf", "pdf", exporter.export_pdf),
}

_BEAD_EXPORT = {
    "png":  ("image/png",       "png", bead_exporter.export_png),
    "jpeg": ("image/jpeg",      "jpg", bead_exporter.export_jpeg),
    "jpg":  ("image/jpeg",      "jpg", bead_exporter.export_jpeg),
    "svg":  ("image/svg+xml",   "svg", bead_exporter.export_svg),
    "pdf":  ("application/pdf", "pdf", bead_exporter.export_pdf),
}


def _export_table_for(pattern):
    if pattern.pattern_type == "DB-WEAVE Pattern":
        return _WEAVE_EXPORT
    if pattern.pattern_type == "JBead Pattern":
        return _BEAD_EXPORT
    return None


@app.route(
    "/<string:user_name>/<string:pattern_name>/export/<string:fmt>",
    methods=("GET", "POST"),
)
def export_pattern(user_name, pattern_name, fmt):
    """Export a pattern in PNG / JPEG / SVG / PDF.

    GET renders the on-disk pattern (works for read-only viewers and
    public patterns). POST renders a pattern document supplied by the
    client in the request body — used by the editor's Export menu so
    unsaved in-memory edits can be exported without first being
    committed to the database.
    """
    fmt = fmt.lower()
    user = User.query.filter(User.name == user_name.lower()).first()
    if not user:
        return redirect(url_for("index"))
    pattern = (
        Pattern.query
        .join(User, Pattern.owner_id == User.id)
        .filter(Pattern.name == pattern_name)
        .filter(User.name == user_name.lower())
        .first()
    )
    if not pattern:
        return redirect(url_for("user", user_name=user_name))
    readonly = not g.user or g.user.name != user.name
    superuser = g.user and g.user.name == SUPPORT_USERNAME
    if not superuser and readonly and not pattern.public:
        return redirect(url_for("user", user_name=user_name))
    table = _export_table_for(pattern)
    if table is None:
        return "Export not available for this pattern type", 400
    if fmt not in table:
        return "Unsupported format", 400
    if request.method == "POST":
        # Owners can render in-memory state. Read-only viewers stay on
        # the persisted version even if they POST.
        if readonly and not superuser:
            pattern_data = json.loads(pattern.contents)
        else:
            payload = request.get_json(silent=True) or {}
            pattern_data = payload.get("contents")
            if not isinstance(pattern_data, dict):
                return "Missing 'contents' object in body", 400
    else:
        pattern_data = json.loads(pattern.contents)
    mime, ext, render = table[fmt]
    kwargs = {}
    if fmt == "pdf":
        kwargs["title"] = pattern.label or pattern_name
    try:
        body = render(pattern_data, **kwargs)
    except Exception as e:  # pragma: no cover — surface as 500
        logging.exception("Export %s for %s/%s failed", fmt, user_name, pattern_name)
        return f"Export failed: {e}", 500
    return send_file(
        io.BytesIO(body),
        mimetype=mime,
        as_attachment=True,
        download_name=f"{user_name}-{pattern_name}.{ext}",
    )


@app.route(
    "/<string:user_name>/<string:pattern_name>/print",
    methods=("GET", "POST"),
)
def print_pattern(user_name, pattern_name):
    """Multi-page PDF print of a pattern.

    Optional query / JSON parameters:
        warp_from, warp_to, weft_from, weft_to (1-based, inclusive).
    Without ranges → full pattern (Drucken). With ranges → Teil drucken.
    Like ``/export``, POST allows the editor to send unsaved in-memory
    state in ``contents`` so the user doesn't have to save first.
    """
    user = User.query.filter(User.name == user_name.lower()).first()
    if not user:
        return redirect(url_for("index"))
    pattern = (
        Pattern.query
        .join(User, Pattern.owner_id == User.id)
        .filter(Pattern.name == pattern_name)
        .filter(User.name == user_name.lower())
        .first()
    )
    if not pattern:
        return redirect(url_for("user", user_name=user_name))
    readonly = not g.user or g.user.name != user.name
    superuser = g.user and g.user.name == SUPPORT_USERNAME
    if not superuser and readonly and not pattern.public:
        return redirect(url_for("user", user_name=user_name))
    if pattern.pattern_type not in ("DB-WEAVE Pattern", "JBead Pattern"):
        return "Print not available for this pattern type", 400

    if request.method == "POST":
        payload = request.get_json(silent=True) or {}
        if readonly and not superuser:
            pattern_data = json.loads(pattern.contents)
        else:
            pattern_data = payload.get("contents")
            if not isinstance(pattern_data, dict):
                return "Missing 'contents' object in body", 400
        warp_from = payload.get("warp_from")
        warp_to   = payload.get("warp_to")
        weft_from = payload.get("weft_from")
        weft_to   = payload.get("weft_to")
        full_pattern = payload.get("full_pattern", True)
    else:
        pattern_data = json.loads(pattern.contents)
        warp_from = request.args.get("warp_from", type=int)
        warp_to   = request.args.get("warp_to",   type=int)
        weft_from = request.args.get("weft_from", type=int)
        weft_to   = request.args.get("weft_to",   type=int)
        full_pattern = request.args.get("full_pattern", "1") != "0"

    try:
        if pattern.pattern_type == "DB-WEAVE Pattern":
            body = exporter.print_pdf(
                pattern_data,
                title=pattern.label or pattern_name,
                warp_from=warp_from, warp_to=warp_to,
                weft_from=weft_from, weft_to=weft_to,
            )
        else:
            body = bead_exporter.print_pdf(
                pattern_data,
                title=pattern.label or pattern_name,
                full_pattern=bool(full_pattern),
            )
    except Exception as e:  # pragma: no cover
        logging.exception("Print for %s/%s failed", user_name, pattern_name)
        return f"Print failed: {e}", 500
    suffix = "-part" if any(v is not None for v in (warp_from, warp_to, weft_from, weft_to)) else ""
    return send_file(
        io.BytesIO(body),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"{user_name}-{pattern_name}{suffix}.pdf",
    )


@app.route("/<string:user_name>/<string:pattern_name>/source")
def source_pattern(user_name, pattern_name):
    origin = request.args.get("origin", "")
    user = User.query.filter(User.name == user_name.lower()).first()
    if not user:
        return redirect(url_for("index"))
    pattern = (
        Pattern.query
        .join(User, Pattern.owner_id == User.id)
        .filter(Pattern.name == pattern_name)
        .filter(User.name == user_name.lower())
        .first()
    )
    if not pattern:
        return redirect(url_for("user", user_name=user_name))
    readonly = not g.user or g.user.name != user.name
    superuser = g.user and g.user.name == SUPPORT_USERNAME
    if not superuser and readonly and not pattern.public:
        return redirect(url_for("user", user_name=user_name))
    pattern.pattern = json.loads(pattern.contents)
    return render_template(
        "source-pattern.html",
        user=user,
        pattern=pattern,
        contents=format_pattern_source(pattern.pattern),
    )


@app.route("/profile", methods=("GET", "POST"))
@login_required
def profile():
    user = g.user
    if request.method == "POST":
        action = request.form.get("action", "settings")
        if action == "password":
            current = request.form.get("current_password", "")
            new = request.form.get("new_password", "")
            confirm = request.form.get("confirm_password", "")
            if not check_password_hash(user.password, current):
                flash(gettext("Current password is incorrect"))
            elif not new:
                flash(gettext("Password cannot be empty"))
            elif new != confirm:
                flash(gettext("Passwords do not match"))
            else:
                try:
                    user.password = generate_password_hash(new)
                    db.session.commit()
                    flash(gettext("Password changed"))
                except Exception:
                    logging.exception("Password change failed")
                    flash(gettext("Changes could not be saved"))
            return redirect(url_for("profile"))

        email = request.form["email"]
        darkmode_raw = request.form.get("darkmode", "")
        if darkmode_raw == "1":
            darkmode = True
        elif darkmode_raw == "0":
            darkmode = False
        else:
            darkmode = None
        block_invitations = request.form.get("block_invitations") == "1"
        locale = request.form.get("locale", "").strip()
        if locale not in ("de", "en"):
            locale = None
        timezone = request.form.get("timezone", "").strip()
        if timezone and timezone not in pytz.all_timezones_set:
            timezone = None
        elif not timezone:
            timezone = None
        user.email = email
        user.email_lower = email.lower()
        # TODO reset verified?!
        user.darkmode = darkmode
        user.block_invitations = block_invitations
        user.locale = locale
        user.timezone = timezone
        try:
            db.session.commit()
            flash(gettext("Profile updated"))
        except Exception:
            logging.exception("Profile changes not changed")
            flash(gettext("Changes could not be saved"))
        return redirect(url_for("profile"))

    return render_template(
        "profile.html",
        user=user,
        timezones=pytz.common_timezones,
    )


@app.route("/profile/export")
@login_required
def profile_export():
    user = g.user
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("profile.json", json.dumps({
            "name": user.name,
            "label": user.label,
            "email": user.email,
            "locale": user.locale,
            "timezone": user.timezone,
            "darkmode": user.darkmode,
            "block_invitations": user.block_invitations,
            "verified": bool(user.verified),
            "create_date":
                user.create_date.isoformat() if user.create_date else None,
            "verify_date":
                user.verify_date.isoformat() if user.verify_date else None,
            "access_date":
                user.access_date.isoformat() if user.access_date else None,
        }, indent=2, ensure_ascii=False))

        for p in user.mypatterns:
            base = f"patterns/{p.name}"
            meta = {
                "name": p.name,
                "label": p.label,
                "pattern_type": p.pattern_type,
                "description": p.description,
                "created": p.created.isoformat() if p.created else None,
                "modified": p.modified.isoformat() if p.modified else None,
                "public": bool(p.public),
                "author": p.author,
                "organization": p.organization,
                "notes": p.notes,
                "pattern_width": p.pattern_width,
                "pattern_height": p.pattern_height,
                "rapport_width": p.rapport_width,
                "rapport_height": p.rapport_height,
                "groups": [
                    a.group.name for a in p.assignments if a.group
                ],
            }
            zf.writestr(
                f"{base}.meta.json",
                json.dumps(meta, indent=2, ensure_ascii=False),
            )
            if p.contents:
                zf.writestr(f"{base}.json", p.contents)
            if p.preview_image:
                zf.writestr(f"{base}.preview.png", p.preview_image)

        zf.writestr("groups.json", json.dumps([
            {
                "group_name": m.group.name,
                "group_label": m.group.label,
                "description": m.group.description,
                "role": m.role,
                "state": m.state,
            }
            for m in user.memberships
        ], indent=2, ensure_ascii=False))

        for c in conversations_for_user(user):
            if c.kind == "group" and c.group is not None:
                fname = f"messages/group-{c.group.name}.json"
                header = {"group": c.group.name, "label": c.group.label}
            else:
                other = c.other_user(user.id)
                partner = other.name if other else f"unknown-{c.id}"
                fname = f"messages/direct-{partner}.json"
                header = {
                    "partner": partner,
                    "partner_label": other.label if other else None,
                }
            payload = {
                "kind": c.kind,
                **header,
                "messages": [
                    {
                        "id": msg.id,
                        "sender":
                            msg.sender.name if msg.sender else None,
                        "body": "" if msg.deleted else msg.body,
                        "deleted": bool(msg.deleted),
                        "created":
                            msg.created.isoformat() if msg.created else None,
                    }
                    for msg in c.messages
                ],
            }
            zf.writestr(
                fname, json.dumps(payload, indent=2, ensure_ascii=False),
            )

    buf.seek(0)
    return send_file(
        buf,
        mimetype="application/zip",
        as_attachment=True,
        download_name=f"{user.name}-export.zip",
    )


def _create_deleted_user_placeholder(deleted_user):
    """Create a per-account sentinel User row that takes over the
    deleted account's place in surviving conversations. One placeholder
    is created per deletion so surviving partners see distinct inbox
    rows even when several of their chat partners delete their accounts.
    The sentinel is disabled+unverified so it never shows up in searches
    or admin lists outside of the chats it inherits.
    """
    name = f"_deleted_{deleted_user.id}"
    placeholder = User(
        name=name,
        label="[deleted user]",
        email=f"{name}@invalid.local",
        email_lower=f"{name}@invalid.local",
        password="!",
        disabled=True,
        verified=False,
    )
    db.session.add(placeholder)
    db.session.flush()
    return placeholder


def _delete_user_data(user):
    # Patterns owned by user (and their group assignments).
    for p in list(user.mypatterns):
        for a in list(p.assignments):
            db.session.delete(a)
        db.session.delete(p)

    placeholder = None

    # Direct conversations: preserve the chat history for the surviving
    # partner. Reassign the deleted user's participant row to a fresh
    # placeholder. If every other participant has already been deleted
    # (i.e. only placeholders are left) the conversation is dropped.
    direct_cps = (
        ConversationParticipant.query
        .join(
            Conversation,
            Conversation.id == ConversationParticipant.conversation_id,
        )
        .filter(
            Conversation.kind == "direct",
            ConversationParticipant.user_id == user.id,
        )
        .all()
    )
    for cp in direct_cps:
        others = [
            p for p in cp.conversation.participants
            if p.user_id != user.id
        ]
        all_disabled = bool(others) and all(
            (p.user.disabled if p.user is not None else True)
            for p in others
        )
        if not others or all_disabled:
            db.session.delete(cp.conversation)
        else:
            if placeholder is None:
                placeholder = _create_deleted_user_placeholder(user)
            cp.user_id = placeholder.id

    # Group conversations: drop the user's participation row.
    ConversationParticipant.query.filter_by(user_id=user.id).delete(
        synchronize_session=False,
    )

    # Reattribute every remaining message authored by the user to the
    # placeholder, mark it deleted, and wipe its body — so chat history
    # stays readable structurally but no original content remains in
    # the database.
    remaining_messages = Message.query.filter_by(sender_id=user.id).all()
    if remaining_messages:
        if placeholder is None:
            placeholder = _create_deleted_user_placeholder(user)
        for msg in remaining_messages:
            msg.sender_id = placeholder.id
            msg.deleted = True
            msg.body = ""

    # Memberships in groups.
    for m in list(user.memberships):
        db.session.delete(m)

    # Personal group (same name as user) — remove if present.
    pg = Group.query.filter(Group.name == user.name).first()
    if pg is not None:
        gc = Conversation.query.filter_by(group_id=pg.id).first()
        if gc is not None:
            db.session.delete(gc)
        for m in list(pg.memberships):
            db.session.delete(m)
        for a in list(pg.assignments):
            db.session.delete(a)
        db.session.delete(pg)

    db.session.delete(user)


@app.route("/profile/delete", methods=("POST",))
@login_required
def profile_delete():
    user = g.user
    if user.name == SUPPORT_USERNAME:
        flash(gettext("The support account cannot be deleted."))
        return redirect(url_for("profile"))
    password = request.form.get("password", "")
    confirm = request.form.get("confirm", "")
    if confirm.strip().upper() != "DELETE":
        flash(gettext('Please type "DELETE" to confirm.'))
        return redirect(url_for("profile"))
    if not check_password_hash(user.password, password):
        flash(gettext("Incorrect password."))
        return redirect(url_for("profile"))
    try:
        _delete_user_data(user)
        db.session.commit()
    except Exception:
        logging.exception("Account deletion failed")
        db.session.rollback()
        flash(gettext("The account could not be deleted."))
        return redirect(url_for("profile"))
    session.clear()
    flash(gettext("Your account and all related data have been deleted."))
    return redirect(url_for("index"))


@app.route("/patterns/upload", methods=("GET", "POST"))
@login_required
def upload_pattern():
    if request.method == "POST":
        name = request.form["name"]
        name = name.replace("..", "").replace("/", "").replace("\\", "")
        files = request.files.getlist("file")
        # Track names of imported patterns so we can redirect a
        # single-file upload directly into the editor (which will
        # auto-save to capture thumbnail + rapport).
        imported = []  # list of (saved_name, owner_name)
        for idx, file in enumerate(files):
            if not name or len(files) > 1:
                if file.filename:
                    name = os.path.splitext(file.filename)[0]
                else:
                    name = f"unnamed {idx+1}"
            bytedata = file.read()
            data = bytedata.decode("latin-1", "ignore")
            saved = None
            if data.startswith("@dbw3:"):
                saved = add_weave_pattern(parse_dbw_data(data, name), g.user)
            elif data.startswith("(jbb"):
                saved = add_bead_pattern(parse_jbb_data(data, name), g.user)
            else:
                try:
                    jsondata = json.loads(bytedata.decode("utf-8", "ignore"))
                    if "max_shafts" in jsondata:
                        if "name" not in jsondata:
                            jsondata["name"] = name
                        saved = add_weave_pattern(jsondata, g.user)
                    else:
                        if "name" not in jsondata:
                            jsondata["name"] = name
                        saved = add_bead_pattern(jsondata, g.user)
                except Exception:
                    pass  # TODO handle errors
            if saved:
                imported.append(saved)
        if len(imported) == 1:
            return redirect(url_for(
                "edit_pattern",
                user_name=g.user.name,
                pattern_name=imported[0],
                autosave="1",
            ))
        return redirect(url_for("user", user_name=g.user.name))
    return render_template("upload_pattern.html", user=g.user)


@app.route("/patterns/create", methods=("GET", "POST"))
@login_required
def create_pattern():
    if request.method == "POST":
        if request.form["pattern_type"] == "DB-WEAVE Pattern":
            name = request.form["name"]
            width = request.form["width"]
            height = request.form["height"]

            errors = False

            if not name:
                flash(gettext("Please provide a name for the pattern"))
                errors = True

            try:
                width = int(width)
                print(width)
                if width < 10 or 1000 < width:
                    flash(gettext("Width must be between 10 and 1000"))
                    errors = True
            except ValueError:
                flash(gettext("Width must be between 10 and 1000"))
                errors = True

            try:
                height = int(height)
                print(height)
                if height < 10 or 1000 < height:
                    flash(gettext("Height must be between 10 and 1000"))
                    errors = True
            except ValueError:
                flash(gettext("Height must be between 10 and 1000"))
                errors = True

            pattern = dict()
            pattern["name"] = name
            pattern["author"] = g.user.label
            pattern["organization"] = ""
            pattern["notes"] = ""

            pattern["width"] = width
            pattern["height"] = height
            pattern["max_shafts"] = 32
            pattern["max_treadles"] = 32

            pattern["data_entering"] = [0] * width
            pattern["data_tieup"] = (
                [0] * (pattern["max_shafts"] * pattern["max_treadles"])
            )
            pattern["data_treadling"] = (
                [0] * (pattern["max_treadles"] * height)
            )
            pattern["data_reed"] = (
                ([0, 0, 1, 1] * ((width + 3) // 4))[0:width]
            )

            # TODO use user default color
            pattern["colors_warp"] = [55] * width
            # TODO use user default color
            pattern["colors_weft"] = [49] * height

            # TODO use user default palette?
            pattern["palette"] = default_weave_palette[:]

            pattern["visible_shafts"] = 12
            pattern["visible_treadles"] = 12
            pattern["warp_lifting"] = True
            pattern["zoom"] = 3
            pattern["single_treadling"] = True

            pattern["display_repeat"] = False
            pattern["display_reed"] = True
            pattern["display_colors_warp"] = True
            pattern["display_colors_weft"] = True
            pattern["display_entering"] = True
            pattern["display_threading"] = True

            # TODO use user defaults
            pattern["direction_righttoleft"] = False
            pattern["directon_toptobottom"] = False
            pattern["direction_entering_at_bottom"] = False
            pattern["entering_style"] = "dash"
            pattern["treadling_style"] = "dot"
            pattern["tieup_style"] = "cross"

            pattern["weave_style"] = "draft"

            if not errors:
                try:
                    name = add_weave_pattern(pattern, g.user)
                    return redirect(url_for("edit_pattern",
                                            user_name=g.user.name,
                                            pattern_name=name))
                except HTTPException:
                    raise
                except Exception:
                    logging.exception("Failed to create pattern")
                    flash(gettext("Failed to create pattern"))

        elif request.form["pattern_type"] == "JBead Pattern":
            label = request.form["name"]
            width = request.form["width"]
            height = request.form["height"]

            errors = False

            if not label:
                flash(gettext("Please provide a name for the pattern"))
                errors = True

            try:
                width = int(width)
                if width < 6 or 100 < width:
                    flash(gettext("Width must be between 6 and 100"))
                    errors = True
            except ValueError:
                flash(gettext("Width must be between 6 and 100"))
                errors = True

            try:
                height = int(height)
                if height < 5 or 5000 < height:
                    flash(gettext("Height must be between 5 and 5000"))
                    errors = True
            except ValueError:
                flash(gettext("Height must be between 5 and 5000"))
                errors = True

            pattern = dict()
            pattern["name"] = label
            pattern["author"] = g.user.label
            pattern["organization"] = ""
            pattern["notes"] = ""

            # Each row must be a fresh list — `[[0]*width]*height`
            # produces `height` references to the *same* inner list,
            # so editing one row would mutate every row when the
            # editor serializes the pattern back to JSON.
            pattern["model"] = [[0] * width for _ in range(height)]

            # TODO use user default palette?
            pattern["colors"] = [list(c) for c in default_bead_palette]

            view = dict()
            view["draft-visible"] = True
            view["corrected-visible"] = True
            view["simulation-visible"] = True
            view["report-visible"] = True
            view["draw-colors"] = True
            view["draw-symbols"] = False
            # Zoom is the cell size in pixels — must be in [4, 48] or
            # the editor falls back to its default. 12 matches the
            # editor's ViewSettings() default (dx=12).
            view["zoom"] = 12
            view["shift"] = 0
            view["scroll"] = 0
            # Open new patterns in the pencil tool so the user can
            # immediately click-and-paint. Saving "select" would put
            # the editor into rectangular-selection mode on load,
            # which makes clicks just create a 1×1 selection rather
            # than draw.
            view["selected-tool"] = "pencil"
            view["selected-color"] = 1
            # Default per-colour symbol glyphs (matches the desktop's
            # BeadSymbols.DEFAULT_SYMBOLS). Slot 0 is the background
            # and never drawn; the rest cycle through middle-dot +
            # a..z + a few punctuation marks.
            view["symbols"] = "·abcdefghijklmnopqrstuvwxyz+-/\\*"
            pattern["view"] = view

            if not errors:
                try:
                    name = add_bead_pattern(pattern, g.user)
                    return redirect(url_for("edit_pattern",
                                            user_name=g.user.name,
                                            pattern_name=name))
                except HTTPException:
                    raise
                except Exception:
                    logging.exception("Failed to create pattern")
                    flash(gettext("Failed to create pattern"))

    return render_template("create_pattern.html", user=g.user)


@app.route("/patterns/delete/<string:pattern_name>", methods=("GET", "POST"))
@login_required
def delete(pattern_name):
    pattern = (
        Pattern.query
        .join(User, Pattern.owner_id == User.id)
        .filter(Pattern.name == pattern_name)
        .filter(User.name == g.user.name)
        .first()
    )
    if not pattern:
        return redirect(url_for("user", user_name=g.user.name))

    if request.method == "POST":
        error = None

        try:
            for assignment in pattern.assignments:
                db.session.delete(assignment)
            db.session.delete(pattern)
            db.session.commit()
        except Exception:
            logging.exception("Pattern could not be deleted")
            error = gettext("Pattern could not be deleted.")
        else:
            return redirect(url_for("user", user_name=g.user.name))

        flash(error)

    return render_template("delete_pattern.html", pattern=pattern)


@app.route("/patterns/assignments/<string:pattern_name>", methods=("GET", "POST"))
@login_required
def assignments(pattern_name):
    pattern = (
        Pattern.query
        .join(User, Pattern.owner_id == User.id)
        .filter(Pattern.name == pattern_name)
        .filter(User.name == g.user.name)
        .first()
    )
    if not pattern:
        return redirect(url_for("user", user_name=g.user.name))

    if request.method == "POST":
        try:
            fixed = [
                assignment
                for assignment in pattern.assignments
                if assignment.group.name == g.user.name
            ]
            # Only allow assigning to groups where the user can write.
            writable_group_ids = {
                m.group_id for m in g.user.memberships
                if m.state == "accepted"
                and m.role in ("owner", "writer")
                and m.group.name != g.user.name
            }
            requested_ids = request.form.getlist("assignments")
            new_group_ids = [
                gid for gid in requested_ids
                if int(gid) in writable_group_ids
            ]
            new_group_ids_int = {int(gid) for gid in new_group_ids}
            old_group_ids = [a.group.id for a in pattern.assignments]
            existing = []
            todelete = []
            new = []
            for assignment in pattern.assignments:
                if assignment.group_id in new_group_ids_int:
                    existing.append(assignment)
                elif (
                    assignment.group.name != g.user.name
                    and assignment.group_id in writable_group_ids
                ):
                    todelete.append(assignment)
            for group_id in new_group_ids_int:
                if group_id in old_group_ids:
                    continue
                new.append(
                    Assignment(group_id=group_id, pattern_id=pattern.id)
                )
            for a in todelete:
                db.session.delete(a)
            for a in new:
                db.session.add(a)
            pattern.assignments = fixed + existing + new
            db.session.commit()
        except Exception:
            logging.exception("Assignments could not be saved")
            flash(gettext("Assignments could not be saved."))
        else:
            return redirect(url_for("user", user_name=g.user.name))

    return render_template("assignments_pattern.html", pattern=pattern)


@app.route("/groups")
@login_required
def edit_groups():
    return render_template(
        "edit_groups.html",
        user=g.user,
        groups=[
            m.group for m in g.user.memberships
            if m.state == "accepted"
        ],
    )


@app.route("/groups/edit/<group_name>")
@login_required
def edit_group(group_name):
    group = Group.query.filter(Group.name == group_name).first()
    if not group:
        return redirect(url_for("edit_groups"))
    if not g.user.is_in_group(group.id):
        return redirect(url_for("edit_groups"))
    role = g.user.role_in(group)
    return render_template(
        "edit_group.html",
        user=g.user,
        group=group,
        role=role,
        is_owner=(role == "owner"),
        is_personal=(group.name == g.user.name),
    )


@app.route("/groups/<group_name>/update", methods=("POST",))
@login_required
def update_group(group_name):
    group = Group.query.filter(Group.name == group_name).first()
    if not group:
        abort(404)
    if not g.user.is_owner_of(group):
        abort(403)
    if group.name == g.user.name:
        flash(gettext("Cannot edit a personal group"))
        return redirect(url_for("edit_group", group_name=group.name))
    description = (request.form.get("description") or "").strip()
    group.description = description
    db.session.commit()
    flash(gettext("Group updated"))
    return redirect(url_for("edit_group", group_name=group.name))


@app.route("/groups/<group_name>/invite", methods=("POST",))
@login_required
def invite_to_group(group_name):
    group = Group.query.filter(Group.name == group_name).first()
    if not group:
        abort(404)
    if not g.user.is_owner_of(group):
        abort(403)
    if group.name == g.user.name:
        flash(gettext("Cannot invite to a personal group"))
        return redirect(url_for("edit_group", group_name=group.name))

    target_name = (request.form.get("user_name") or "").strip().lower()
    role = request.form.get("role") or "reader"
    if role not in ("owner", "writer", "reader"):
        flash(gettext("Invalid role"))
        return redirect(url_for("edit_group", group_name=group.name))

    target = User.query.filter(User.name == target_name).first()
    if not target or target.disabled or not target.verified:
        flash(gettext("User not found"))
        return redirect(url_for("edit_group", group_name=group.name))
    if target.name == SUPPORT_USERNAME:
        flash(gettext("User not found"))
        return redirect(url_for("edit_group", group_name=group.name))
    if target.block_invitations:
        flash(gettext("User not found"))
        return redirect(url_for("edit_group", group_name=group.name))

    existing = target.membership_in(group)
    if existing is not None:
        if existing.state == "accepted":
            flash(gettext("User is already a member"))
        elif existing.state == "invited":
            flash(gettext("User has already been invited"))
        else:
            # declined → re-invite with new role
            existing.role = role
            existing.state = "invited"
            db.session.commit()
            flash(gettext("Invitation sent"))
        return redirect(url_for("edit_group", group_name=group.name))

    membership = Membership(
        user=target,
        group=group,
        role=role,
        state="invited",
    )
    db.session.add(membership)
    db.session.commit()
    flash(gettext("Invitation sent"))
    return redirect(url_for("edit_group", group_name=group.name))


@app.route("/invitations")
@login_required
def invitations():
    pending = g.user.pending_invitations()
    return render_template(
        "invitations.html",
        user=g.user,
        invitations=pending,
    )


@app.route("/invitations/<int:membership_id>/accept", methods=("POST",))
@login_required
def accept_invitation(membership_id):
    m = Membership.query.filter(Membership.id == membership_id).first()
    if not m or m.user_id != g.user.id:
        abort(404)
    if m.state != "invited":
        return redirect(url_for("invitations"))
    m.state = "accepted"
    db.session.commit()
    flash(gettext("Invitation accepted"))
    return redirect(url_for("edit_group", group_name=m.group.name))


@app.route("/invitations/<int:membership_id>/decline", methods=("POST",))
@login_required
def decline_invitation(membership_id):
    m = Membership.query.filter(Membership.id == membership_id).first()
    if not m or m.user_id != g.user.id:
        abort(404)
    if m.state != "invited":
        return redirect(url_for("invitations"))
    m.state = "declined"
    db.session.commit()
    flash(gettext("Invitation declined"))
    return redirect(url_for("invitations"))


@app.route(
    "/groups/<group_name>/members/<user_name>",
    methods=("POST",),
)
@login_required
def update_membership(group_name, user_name):
    group = Group.query.filter(Group.name == group_name).first()
    if not group:
        abort(404)
    if not g.user.is_owner_of(group):
        abort(403)
    if group.name == g.user.name:
        abort(400)

    target = User.query.filter(User.name == user_name.lower()).first()
    if not target:
        abort(404)
    membership = target.membership_in(group)
    if membership is None or membership.state != "accepted":
        abort(404)

    action = request.form.get("action")
    if action == "remove":
        # Last-owner protection
        if membership.role == "owner" and group.owner_count() <= 1:
            flash(gettext("Cannot remove the last owner of a group"))
            return redirect(url_for("edit_group", group_name=group.name))
        db.session.delete(membership)
        db.session.commit()
        flash(gettext("Member removed"))
    elif action == "set_role":
        new_role = request.form.get("role")
        if new_role not in ("owner", "writer", "reader"):
            flash(gettext("Invalid role"))
            return redirect(url_for("edit_group", group_name=group.name))
        if (
            membership.role == "owner"
            and new_role != "owner"
            and group.owner_count() <= 1
        ):
            flash(gettext("Cannot demote the last owner of a group"))
            return redirect(url_for("edit_group", group_name=group.name))
        membership.role = new_role
        db.session.commit()
        flash(gettext("Role updated"))
    else:
        abort(400)
    return redirect(url_for("edit_group", group_name=group.name))


@app.route("/groups/<group_name>/leave", methods=("POST",))
@login_required
def leave_group(group_name):
    group = Group.query.filter(Group.name == group_name).first()
    if not group:
        abort(404)
    if group.name == g.user.name:
        flash(gettext("Cannot leave your personal group"))
        return redirect(url_for("edit_group", group_name=group.name))
    membership = g.user.membership_in(group)
    if membership is None or membership.state != "accepted":
        abort(404)
    if membership.role == "owner" and group.owner_count() <= 1:
        flash(gettext(
            "You are the last owner. Promote another owner before leaving."
        ))
        return redirect(url_for("edit_group", group_name=group.name))
    db.session.delete(membership)
    db.session.commit()
    flash(gettext("You left the group"))
    return redirect(url_for("edit_groups"))


@app.route("/api/users/search")
@login_required
def api_users_search():
    q = (request.args.get("q") or "").strip().lower()
    group_name = request.args.get("group")
    if len(q) < 2:
        return jsonify({"status": "OK", "users": []})
    query = (
        User.query
        .filter(User.name.ilike(f"%{q}%") | User.label.ilike(f"%{q}%"))
        .filter(User.verified.is_(True))
        .filter((User.disabled.is_(False)) | (User.disabled.is_(None)))
    )
    if group_name:
        query = query.filter(User.name != SUPPORT_USERNAME)
    query = query.filter(
        (User.block_invitations.is_(False))
        | (User.block_invitations.is_(None))
        | (User.name == SUPPORT_USERNAME)
    ).order_by(User.label).limit(20).all()
    exclude_ids = set()
    if group_name:
        group = Group.query.filter(Group.name == group_name).first()
        if group:
            for m in group.memberships:
                if m.state in ("accepted", "invited"):
                    exclude_ids.add(m.user_id)
    results = [
        {"name": u.name, "label": u.label}
        for u in query
        if u.id not in exclude_ids and u.id != g.user.id
    ]
    return jsonify({"status": "OK", "users": results})


@app.route("/admin/impersonate/<string:user_name>", methods=("POST",))
@login_required
def impersonate(user_name):
    if not is_real_support():
        abort(403)
    target = User.query.filter(User.name == user_name.lower()).first()
    if not target or target.name == SUPPORT_USERNAME:
        abort(404)
    if target.disabled:
        flash(gettext("Cannot impersonate a disabled user"))
        return redirect(url_for("users"))
    session["impersonator"] = SUPPORT_USERNAME
    session["user_name"] = target.name
    return redirect(url_for("user", user_name=target.name))


@app.route("/admin/stop-impersonating", methods=("POST",))
def stop_impersonating():
    impersonator = session.get("impersonator")
    if not impersonator:
        return redirect(url_for("index"))
    session["user_name"] = impersonator
    session.pop("impersonator", None)
    return redirect(url_for("user", user_name=impersonator))


@app.context_processor
def inject_impersonation():
    return {
        "impersonating": bool(session.get("impersonator")),
        "impersonator_name": session.get("impersonator"),
    }


@app.context_processor
def inject_invitation_count():
    if g.get("user"):
        try:
            count = sum(
                1 for m in g.user.memberships if m.state == "invited"
            )
        except Exception:
            count = 0
        return {"invitation_count": count}
    return {"invitation_count": 0}


@app.route("/groups/add", methods=("GET", "POST"))
@login_required
def add_group():
    if request.method == "POST":
        label = request.form["name"]
        name = from_label(label)
        description = request.form["description"]

        group = Group.query.filter(Group.name == name).first()
        if group:
            flash(gettext("Group already exists"))
        else:
            group = Group(
                name=name,
                label=label,
                description=description,
            )
            membership = Membership(
                user=g.user,
                group=group,
                role="owner",
                state="accepted",
            )
            db.session.add(group)
            db.session.add(membership)
            db.session.flush()
            ensure_group_conversation(group)
            db.session.commit()
            # TODO errorhandling
            return redirect(url_for("edit_groups", user_name=g.user.name))
    return render_template("add_group.html")


@app.route("/admin/groups")
@login_required
@support_required
def groups():
    try:
        all_groups = (
            Group.query
            .filter(Group.name != SUPPORT_USERNAME)
            .order_by(Group.name)
            .all()
        )
        return render_template("admin-groups.html", groups=all_groups)
    except HTTPException:
        raise
    except Exception:
        logging.exception("failed to get all groups")
        abort(500, description="Failed to get all groups")


@app.route("/admin/users")
@login_required
@support_required
def users():
    try:
        all_users = (
            User.query
            .filter(User.name != SUPPORT_USERNAME)
            .order_by(User.name)
            .all()
        )
        rows = (
            db.session.query(
                Pattern.owner_id,
                Pattern.pattern_type,
                db.func.count(Pattern.id),
            )
            .group_by(Pattern.owner_id, Pattern.pattern_type)
            .all()
        )
        counts = {}
        for owner_id, ptype, n in rows:
            counts.setdefault(owner_id, {})[ptype] = n
        user_counts = {
            u.id: {
                "weave": counts.get(u.id, {}).get("DB-WEAVE Pattern", 0),
                "bead": counts.get(u.id, {}).get("JBead Pattern", 0),
            }
            for u in all_users
        }
        return render_template(
            "admin-users.html", users=all_users, user_counts=user_counts,
        )
    except HTTPException:
        raise
    except Exception:
        logging.exception("failed to get all users")
        abort(500, description="Failed to get all users")


@app.route("/admin/patterns")
@login_required
@support_required
def patterns():
    try:
        all_users = (
            User.query
            .filter(User.name != SUPPORT_USERNAME)
            .order_by(User.name)
            .all()
        )
        return render_template("admin-patterns.html", users=all_users)
    except HTTPException:
        raise
    except Exception:
        logging.exception("failed to get all users")
        abort(500, description="Failed to get all users")


@app.route("/admin/users/<string:user_name>")
@login_required
@support_required
def edit_user(user_name):
    try:
        user = User.query.filter(User.name == user_name).first()
        if not user:
            abort(404, description=f"User {user_name} not found")
        patterns = get_patterns_for_user(user)
        return render_template(
            "admin-edit-user.html",
            user=user,
            patterns=patterns,
        )
    except HTTPException:
        raise
    except Exception:
        logging.exception("failed to get user")
        abort(500, description="Failed to get user")


@app.route("/admin/users/<string:user_name>/set-disabled", methods=("POST",))
@login_required
@support_required
def admin_set_user_disabled(user_name):
    target = User.query.filter(User.name == user_name).first()
    if not target:
        abort(404, description=f"User {user_name} not found")
    if target.name == SUPPORT_USERNAME:
        flash(gettext("The support account cannot be disabled."))
        return redirect(url_for("edit_user", user_name=target.name))
    if g.user and target.id == g.user.id:
        flash(gettext("You cannot disable your own account."))
        return redirect(url_for("edit_user", user_name=target.name))
    desired = request.form.get("disabled") == "1"
    if bool(target.disabled) == desired:
        return redirect(url_for("edit_user", user_name=target.name))
    try:
        target.disabled = desired
        db.session.commit()
    except Exception:
        logging.exception("Failed to update disabled state")
        db.session.rollback()
        flash(gettext("Could not update the account state."))
        return redirect(url_for("edit_user", user_name=target.name))
    if desired:
        flash(gettext("Account disabled."))
    else:
        flash(gettext("Account enabled."))
    return redirect(url_for("edit_user", user_name=target.name))


@app.route("/admin/system")
@login_required
@support_required
def admin_system():
    from textileplatform.sysinfo import collect
    return render_template("admin-system.html", info=collect())


@app.route("/admin")
@login_required
@support_required
def support_console():
    investigations = (
        Pattern.query
        .filter(Pattern.owner_id == g.user.id)
        .filter(Pattern.investigation_origin_user_id.isnot(None))
        .order_by(Pattern.modified.desc())
        .all()
    )
    return render_template(
        "admin-console.html",
        investigations=investigations,
    )


@app.route(
    "/admin/investigate/<string:owner_name>/<string:pattern_name>",
    methods=("POST",),
)
@login_required
@support_required
def investigate_pattern(owner_name, pattern_name):
    owner = User.query.filter(User.name == owner_name).first()
    if not owner:
        abort(404, description="Owner not found")
    src = (
        Pattern.query
        .filter(Pattern.owner_id == owner.id)
        .filter(Pattern.name == pattern_name)
        .first()
    )
    if not src:
        abort(404, description="Pattern not found")
    support_user = g.user
    suffix = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d%H%M%S")
    base_label = f"{src.label} [{owner.label}]"
    label = f"{base_label} {suffix}"
    name = from_label(label)
    now = datetime.datetime.now(datetime.timezone.utc)
    copy = Pattern(
        name=name,
        label=label,
        description=src.description,
        pattern_type=src.pattern_type,
        contents=src.contents,
        preview_image=src.preview_image,
        thumbnail_image=src.thumbnail_image,
        created=now,
        modified=now,
        public=False,
        owner=support_user,
        author=src.author,
        organization=src.organization,
        notes=src.notes,
        pattern_width=src.pattern_width,
        pattern_height=src.pattern_height,
        rapport_width=src.rapport_width,
        rapport_height=src.rapport_height,
        investigation_origin_user_id=owner.id,
        investigation_origin_pattern_id=src.id,
        investigation_origin_label=f"{owner.name}/{src.name}",
        investigation_origin_public=bool(src.public),
    )
    db.session.add(copy)
    db.session.commit()
    flash(gettext("Investigation copy created"))
    return redirect(url_for("support_console"))


@app.route(
    "/admin/investigate/<int:pattern_id>/delete", methods=("POST",),
)
@login_required
@support_required
def delete_investigation(pattern_id):
    pattern = Pattern.query.get(pattern_id)
    if (
        not pattern
        or pattern.owner_id != g.user.id
        or pattern.investigation_origin_user_id is None
    ):
        abort(404)
    for a in list(pattern.assignments):
        db.session.delete(a)
    db.session.delete(pattern)
    db.session.commit()
    flash(gettext("Investigation copy deleted"))
    return redirect(url_for("support_console"))


@app.route("/auth/register", methods=("GET", "POST"))
def register():
    if request.method == "POST":
        name = request.form["name"]
        email = request.form["email"]
        password = request.form["password"]

        error = None

        if not name:
            error = gettext("Name is required")
        elif not email:
            error = gettext("E-Mail is required")
        elif not password:
            error = gettext("Password is required")
        elif request.form["x"].strip() != "7":
            error = gettext("Calculation result required")

        label = name
        name = from_label(label)

        if not is_valid(name):
            error = gettext("Name is invalid and cannot be used")

        if error is None:
            try:
                locale = get_locale() or babel.Locale("de", "CH")
                tz = get_timezone() or pytz.timezone("Europe/Zurich")
                user = User(
                    name=name,
                    label=label,
                    email=email,
                    email_lower=email.lower(),
                    password=generate_password_hash(password),
                    darkmode=None,
                    verified=False,
                    disabled=False,
                    locale=str(locale),
                    timezone=str(tz),
                    verification_code=secrets.token_urlsafe(30),
                    create_date=datetime.datetime.now(datetime.timezone.utc),
                    verify_date=None,
                    access_date=None,
                )
                db.session.add(user)
                group = Group(
                    name=name,
                    label=label,
                    description="",
                )
                db.session.add(group)
                membership = Membership(
                    group=group,
                    user=user,
                    role="owner",
                    state="accepted",
                )
                db.session.add(membership)
                db.session.flush()
                ensure_group_conversation(group)
                db.session.commit()

                send_verification_mail(user)
                send_admin_notification_mail(user, "User created account")
                print(f"verify/{user.name}/{user.verification_code}")
                return render_template(
                    "verification_pending.html",
                    user=user
                )
            except IntegrityError:
                logging.exception(f"Failed to register user '{name}'")
                error = gettext("Name or E-Mail is already used")
            except HTTPException:
                raise
            except Exception:
                logging.exception("System error")
                error = gettext("System error")

        flash(error)

    return render_template("register.html")


@app.route("/auth/login", methods=("GET", "POST"))
def login():
    if request.method == "POST":
        email = request.form["email"] or ""
        password = request.form["password"]
        error = None
        try:
            user = User.query.filter(User.email_lower == email.lower()).first()

            if user is None:
                logging.error(f"user {email.lower()} not found")
                error = gettext("Login data are not correct")
            elif not check_password_hash(user.password, password):
                logging.error(f"user {email.lower()} incorrect password")
                error = gettext("Login data are not correct")
            elif not user.verified:
                error = gettext("Account verification is pending")
            elif user.disabled:
                error = gettext("Account is disabled")
        except HTTPException:
            raise
        except Exception:
            logging.exception("system error")
            error = gettext("System error")

        if error is None:
            session.clear()
            session["user_name"] = user.name
            session.permanent = True

            user.access_date = datetime.datetime.now(datetime.timezone.utc)
            db.session.commit()

            return redirect(url_for("user", user_name=user.name))

        flash(error)

    return render_template("login.html")


@app.route("/auth/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/auth/verify/<string:user_name>/<string:verification_code>")
def verify(user_name, verification_code):
    try:
        user = User.query.filter(User.name == user_name).first()
        if not user:
            return render_template("verification_failed.html")
        if user.verified:
            return render_template("verification_successful.html")
        if not user.verification_code or not secrets.compare_digest(
            user.verification_code, verification_code
        ):
            logging.error(
                f"verification, expected {user.verification_code} "
                f"but got {verification_code}"
            )
            return render_template("verification_failed.html")
        user.verified = True
        user.verification_code = None
        logging.error(f"user {user_name} successfully verified")
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return render_template("verification_failed.html")
        send_admin_notification_mail(
            user, 
            "User completed email account verification step",
        )
        return render_template("verification_successful.html")
    except HTTPException:
        raise
    except Exception:
        logging.exception("system error")
        abort(500)


@app.route("/auth/recover", methods=("GET", "POST"))
def recover():
    if request.method == "POST":
        error = None

        email = request.form["email"]
        if not email:
            error = gettext("E-Mail is required.")
        try:
            user = User.query.filter(User.email_lower == email.lower()).first()
            if not user:
                error = gettext("E-Mail is unknown.")
            elif not user.verified:
                error = gettext("E-Mail is unknown.")
        except Exception:
            error = gettext("System error")

        if error is None:
            try:
                user.password_reset_code = secrets.token_urlsafe(30)
                user.password_reset_expires = (
                    datetime.datetime.now(datetime.timezone.utc)
                    + datetime.timedelta(hours=1)
                )
                db.session.commit()
                send_recover_mail(user)
                send_admin_notification_mail(
                    user,
                    "User requested password recovery",
                )
                return render_template(
                    "recover_mail_sent.html",
                    user=user
                )
            except IntegrityError:
                error = gettext("Could not save changes.")
            except HTTPException:
                raise
            except Exception:
                logging.exception("system error")
                error = gettext("System error")

        flash(error)

    return render_template("recover.html")


@app.route(
    "/auth/reset-password/<string:user_name>/<string:verification_code>",
    methods=("GET", "POST"),
)
def reset_password(user_name, verification_code):
    try:
        user = User.query.filter(User.name == user_name).first()
        if not user:
            return render_template("recover_failed.html")
        if not user.verified:
            return render_template("recover_failed.html")
        if not user.password_reset_code:
            return render_template("recover_failed.html")
        if not secrets.compare_digest(
            user.password_reset_code, verification_code
        ):
            return render_template("recover_failed.html")
        if (
            user.password_reset_expires is None
            or user.password_reset_expires
            < datetime.datetime.now(datetime.timezone.utc)
        ):
            return render_template("recover_failed.html")

        if request.method == "POST":
            error = None
            password = request.form["password"]
            if not password:
                error = gettext("Password is required.")

            if error is None:
                try:
                    user.password = generate_password_hash(password)
                    user.password_reset_code = None
                    user.password_reset_expires = None
                    db.session.commit()
                    send_admin_notification_mail(
                        user,
                        "User successfully reset password",
                    )
                except IntegrityError:
                    error = gettext("Could not save changes.")
                else:
                    return render_template("recover_success.html")

            flash(error)

        return render_template("recover_set_password.html")
    except HTTPException:
        raise
    except Exception:
        logging.exception("system error")
        abort(500)


@app.route("/api/pattern/<user_name>/<pattern_name>")
def get_pattern(user_name, pattern_name):
    try:
        user = User.query.filter(User.name == user_name).first()
        if not user:
            return respond("NOK", "User not found", 404)
        pattern = (
            Pattern.query
            .join(User, Pattern.owner_id == User.id)
            .filter(Pattern.name == pattern_name)
            .filter(User.name == user_name)
            .first()
        )
        if not pattern:
            return respond("NOK", "Pattern not found", 404)
        superuser = g.user and g.user.name == SUPPORT_USERNAME
        if (
            not superuser
            and not pattern.public
            and (not g.user or user.name != g.user.name)
        ):
            return respond("NOK", "Invalid user", 403)
        contents = json.loads(pattern.contents)
        return jsonify({
            "status": "OK",
            "pattern": contents,
        }), 200
    except HTTPException:
        raise
    except Exception:
        logging.exception("Failed to get pattern")
        return respond("NOK", "Failed to get pattern", 500)


@app.route("/api/pattern/<user_name>/<pattern_name>", methods=("PUT",))
def update_pattern(user_name, pattern_name):
    try:
        user = User.query.filter(User.name == user_name).first()
        if not user:
            return respond("NOK", "User not found", 404)
        pattern = (
            Pattern.query
            .join(User, Pattern.owner_id == User.id)
            .filter(Pattern.name == pattern_name)
            .filter(User.name == user_name)
            .first()
        )
        if not pattern:
            return respond("NOK", "Pattern not found", 404)
        superuser = g.user and g.user.name == SUPPORT_USERNAME
        if not superuser and not pattern.public and (not g.user or user.name != g.user.name):
            return respond("NOK", "Invalid user", 403)
        data = request.get_json()
        action = data["action"]
        if action == "set-publication-state":
            if not g.user or user.name != g.user.name:
                return respond("NOK", "Invalid user", 403)
            pattern.public = data["publication_state"]
            db.session.commit()
            return jsonify({"status": "OK"}), 200
        elif action == "save-pattern":
            if not g.user or user.name != g.user.name:
                return respond("NOK", "Invalid user", 403)
            contents = data["contents"]
            pattern.contents = json.dumps(contents)
            pattern.modified = datetime.datetime.now(datetime.timezone.utc)
            apply_pattern_metadata(pattern, contents)
            thumb_bytes = _decode_data_url_png(data.get("thumbnail"))
            if thumb_bytes is not None:
                pattern.thumbnail_image = thumb_bytes
            preview_bytes = _decode_data_url_png(data.get("preview"))
            if preview_bytes is not None:
                pattern.preview_image = preview_bytes
            db.session.commit()
            return jsonify({"status": "OK"}), 200
        elif action == "clone-pattern":
            if not g.user:
                return respond("NOK", "Invalid user", 403)
            # Inline clone (from the profile list) doesn't send the
            # pattern body — fall back to the persisted contents.
            payload = data.get("contents")
            contents = (
                json.dumps(payload) if payload is not None
                else pattern.contents
            )
            clone_pattern(g.user, pattern, contents)
            return jsonify({"status": "OK"}), 200
        elif action == "rename-pattern":
            if not g.user or user.name != g.user.name:
                return respond("NOK", "Invalid user", 403)
            new_label = (data.get("label") or "").strip()
            if not new_label:
                return respond("NOK", "Label is required", 400)
            new_name = from_label(new_label)
            if not is_valid(new_name):
                return respond("NOK", "Invalid name", 400)
            if new_name != pattern.name:
                # Check uniqueness for this owner.
                existing = (
                    Pattern.query
                    .filter(Pattern.owner_id == user.id)
                    .filter(Pattern.name == new_name)
                    .first()
                )
                if existing:
                    return respond("NOK", "Name already in use", 409)
            pattern.label = new_label
            pattern.name = new_name
            try:
                db.session.commit()
            except IntegrityError:
                db.session.rollback()
                return respond("NOK", "Name already in use", 409)
            return jsonify({
                "status": "OK",
                "name": pattern.name,
                "label": pattern.label,
            }), 200
        else:
            return respond("NOK", "Illegal action", 400)
    except HTTPException:
        raise
    except Exception:
        logging.exception("Failed to update pattern")
        return respond("NOK", "Failed to update pattern", 500)


# --- Thumbnails ------------------------------------------------------------

import base64 as _base64


def _decode_data_url_png(value):
    """Accept a 'data:image/png;base64,...' string and return raw bytes,
    or None if the value is missing/invalid. Caller decides whether to
    persist."""
    if not value or not isinstance(value, str):
        return None
    prefix = "data:image/png;base64,"
    if not value.startswith(prefix):
        return None
    try:
        return _base64.b64decode(value[len(prefix):], validate=True)
    except Exception:
        return None


_PLACEHOLDER_SVG = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 96" '
    'preserveAspectRatio="xMidYMid meet">'
    '<rect width="192" height="96" fill="#eee"/>'
    '<line x1="96" y1="0" x2="96" y2="96" stroke="#bbb"/>'
    '<text x="96" y="54" text-anchor="middle" font-family="sans-serif" '
    'font-size="14" fill="#888">no preview</text>'
    '</svg>'
)


def _serve_pattern_image(user_name, pattern_name, attr):
    user = User.query.filter(User.name == user_name.lower()).first()
    if not user:
        abort(404)
    pattern = (
        Pattern.query
        .join(User, Pattern.owner_id == User.id)
        .filter(Pattern.name == pattern_name)
        .filter(User.name == user_name.lower())
        .first()
    )
    if not pattern:
        abort(404)
    superuser = g.user and g.user.name == SUPPORT_USERNAME
    if (
        not superuser
        and not pattern.public
        and (not g.user or user.name != g.user.name)
    ):
        # Non-owner can fetch images for public patterns; private 403.
        abort(403)
    img = getattr(pattern, attr)
    if not img:
        # Don't cache the placeholder — once the user saves, the next
        # request should return the real PNG, not a cached SVG.
        response = send_file(
            io.BytesIO(_PLACEHOLDER_SVG.encode("utf-8")),
            mimetype="image/svg+xml",
            max_age=0,
        )
        response.cache_control.no_cache = True
        return response
    etag = (
        pattern.modified.isoformat()
        if pattern.modified else str(pattern.id)
    )
    response = send_file(
        io.BytesIO(img),
        mimetype="image/png",
        max_age=0,
    )
    response.set_etag(etag)
    response.cache_control.no_cache = True
    return response.make_conditional(request)


@app.route("/thumbnail/<string:user_name>/<string:pattern_name>")
def pattern_thumbnail(user_name, pattern_name):
    return _serve_pattern_image(user_name, pattern_name, "thumbnail_image")


@app.route("/preview/<string:user_name>/<string:pattern_name>")
def pattern_preview(user_name, pattern_name):
    return _serve_pattern_image(user_name, pattern_name, "preview_image")


# --- Messaging API ---------------------------------------------------------

def _serialize_message(msg):
    return {
        "id": msg.id,
        "sender": {
            "name": msg.sender.name,
            "label": msg.sender.label,
        },
        "body": "" if msg.deleted else msg.body,
        "deleted": bool(msg.deleted),
        "created": msg.created.isoformat() if msg.created else None,
    }


def _serialize_conversation(conv, user):
    last_msg = None
    for m in reversed(conv.messages):
        if not m.deleted:
            last_msg = m
            break
    base = {
        "id": conv.id,
        "kind": conv.kind,
        "unread": unread_count(conv, user),
        "last_message": _serialize_message(last_msg) if last_msg else None,
    }
    if conv.kind == "group":
        base["group"] = {
            "name": conv.group.name,
            "label": conv.group.label,
        }
        base["url"] = url_for(
            "messages_group", group_name=conv.group.name,
        )
    else:
        other = conv.other_user(user.id)
        if other is not None:
            base["user"] = {"name": other.name, "label": other.label}
            base["url"] = url_for(
                "messages_direct", user_name=other.name,
            )
    return base


@app.route("/api/conversations")
@login_required
def api_conversations():
    convs = conversations_for_user(g.user)
    convs.sort(
        key=lambda c: (
            c.messages[-1].created if c.messages else c.created
            or datetime.datetime.min
        ),
        reverse=True,
    )
    return jsonify({
        "status": "OK",
        "conversations": [_serialize_conversation(c, g.user) for c in convs],
    })


def _conversation_history(conv, before_id, limit):
    q = Message.query.filter(Message.conversation_id == conv.id)
    if before_id is not None:
        q = q.filter(Message.id < before_id)
    msgs = q.order_by(Message.id.desc()).limit(limit).all()
    msgs.reverse()
    return msgs


def _find_direct_conversation(user_a, user_b):
    convs = (
        Conversation.query
        .filter(Conversation.kind == "direct")
        .join(
            ConversationParticipant,
            Conversation.id == ConversationParticipant.conversation_id,
        )
        .filter(ConversationParticipant.user_id == user_a.id)
        .all()
    )
    for c in convs:
        ids = {p.user_id for p in c.participants}
        if ids == {user_a.id, user_b.id}:
            return c
    return None


@app.route("/api/conversations/direct/<string:user_name>",
           methods=("GET", "POST"))
@login_required
def api_direct_conversation(user_name):
    target = User.query.filter(User.name == user_name.lower()).first()
    if not target:
        return respond("NOK", "User not found", 404)
    if target.id == g.user.id:
        return respond("NOK", "Cannot message yourself", 400)
    conv = _find_direct_conversation(g.user, target)
    # Disabled accounts (incl. the deleted-user placeholder) are read-only:
    # the existing chat history is viewable but no new messages may be sent.
    if target.disabled and conv is None:
        return respond("NOK", "User not found", 404)

    if request.method == "POST":
        if target.disabled:
            return respond("NOK", "Cannot message this user", 403)
        # Sending a new message: enforce block_invitations only when
        # *starting* a new conversation. The support user always accepts
        # incoming DMs regardless of block_invitations.
        if (conv is None and target.block_invitations
                and not is_support(target)):
            return respond("NOK", "User does not accept messages", 403)
        if conv is None:
            conv = get_or_create_direct_conversation(g.user, target)
        data = request.get_json(silent=True) or {}
        body = data.get("body", "")
        msg = post_message(conv, g.user, body)
        if msg is None:
            return respond("NOK", "Empty message", 400)
        db.session.commit()
        if is_support(target) and not is_support(g.user):
            try:
                send_support_dm_mail(
                    g.user,
                    msg.body,
                    url_for(
                        "messages_direct",
                        user_name=g.user.name,
                        _external=True,
                        _scheme="https",
                    ),
                )
            except Exception:
                logging.exception("support DM notification failed")
        return jsonify({
            "status": "OK",
            "conversation_id": conv.id,
            "message": _serialize_message(msg),
        })

    # GET history
    if conv is None:
        return jsonify({
            "status": "OK",
            "conversation_id": None,
            "user": {"name": target.name, "label": target.label},
            "messages": [],
            "blocked": bool(target.block_invitations),
        })
    before = request.args.get("before", type=int)
    limit = min(int(request.args.get("limit", 50) or 50), 200)
    msgs = _conversation_history(conv, before, limit)
    return jsonify({
        "status": "OK",
        "conversation_id": conv.id,
        "user": {"name": target.name, "label": target.label},
        "messages": [_serialize_message(m) for m in msgs],
        "has_more": len(msgs) == limit,
    })


@app.route("/api/conversations/group/<string:group_name>",
           methods=("GET", "POST"))
@login_required
def api_group_conversation(group_name):
    group = Group.query.filter(Group.name == group_name).first()
    if not group or not g.user.is_in_group(group.id):
        return respond("NOK", "Not a member of this group", 403)
    conv = ensure_group_conversation(group)

    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        msg = post_message(conv, g.user, data.get("body", ""))
        if msg is None:
            return respond("NOK", "Empty message", 400)
        db.session.commit()
        return jsonify({
            "status": "OK",
            "conversation_id": conv.id,
            "message": _serialize_message(msg),
        })

    before = request.args.get("before", type=int)
    limit = min(int(request.args.get("limit", 50) or 50), 200)
    msgs = _conversation_history(conv, before, limit)
    return jsonify({
        "status": "OK",
        "conversation_id": conv.id,
        "group": {"name": group.name, "label": group.label},
        "messages": [_serialize_message(m) for m in msgs],
        "has_more": len(msgs) == limit,
    })


@app.route("/api/messages/<int:message_id>", methods=("DELETE",))
@login_required
def api_delete_message(message_id):
    msg = Message.query.filter(Message.id == message_id).first()
    if msg is None:
        return respond("NOK", "Message not found", 404)
    if msg.sender_id != g.user.id:
        return respond("NOK", "Not your message", 403)
    if msg.deleted:
        return jsonify({"status": "OK"})
    msg.deleted = True
    db.session.commit()
    return jsonify({"status": "OK"})


@app.route("/api/conversations/<int:conversation_id>/read",
           methods=("POST",))
@login_required
def api_mark_read(conversation_id):
    conv = Conversation.query.filter(
        Conversation.id == conversation_id,
    ).first()
    if not conv or not can_access_conversation(conv, g.user):
        return respond("NOK", "Conversation not found", 404)
    p = get_or_create_group_participant(conv, g.user) \
        if conv.kind == "group" \
        else next(
            (pp for pp in conv.participants if pp.user_id == g.user.id),
            None,
        )
    if p is None:
        return respond("NOK", "Not a participant", 403)
    p.last_read_at = datetime.datetime.now(datetime.timezone.utc)
    db.session.commit()
    total = sum(
        unread_count(c, g.user)
        for c in conversations_for_user(g.user)
    )
    return jsonify({"status": "OK", "unread_total": total})


@app.context_processor
def inject_unread_message_count():
    if g.get("user"):
        try:
            convs = conversations_for_user(g.user)
            count = sum(unread_count(c, g.user) for c in convs)
        except Exception:
            count = 0
        return {"unread_message_count": count}
    return {"unread_message_count": 0}


@app.route("/messages")
@login_required
def messages_inbox():
    return render_template("messages_inbox.html")


@app.route("/messages/u/<string:user_name>")
@login_required
def messages_direct(user_name):
    target = User.query.filter(User.name == user_name.lower()).first()
    if not target:
        return redirect(url_for("messages_inbox"))
    if target.id == g.user.id:
        return redirect(url_for("messages_inbox"))
    # Disabled targets (e.g. the deleted-user placeholder) are read-only
    # and only reachable if a conversation already exists.
    if target.disabled and _find_direct_conversation(g.user, target) is None:
        return redirect(url_for("messages_inbox"))
    return render_template(
        "conversation.html",
        kind="direct",
        partner=target,
        group=None,
        api_url=url_for("api_direct_conversation", user_name=target.name),
        title=target.label,
        is_blocked=bool(target.block_invitations) or bool(target.disabled),
    )


@app.route("/messages/g/<string:group_name>")
@login_required
def messages_group(group_name):
    group = Group.query.filter(Group.name == group_name).first()
    if not group or not g.user.is_in_group(group.id):
        return redirect(url_for("messages_inbox"))
    accepted = sum(
        1 for m in group.memberships if m.state == "accepted"
    )
    if accepted < 2:
        return redirect(url_for("edit_group", group_name=group.name))
    return render_template(
        "conversation.html",
        kind="group",
        partner=None,
        group=group,
        api_url=url_for("api_group_conversation", group_name=group.name),
        title=group.label,
        is_blocked=False,
    )

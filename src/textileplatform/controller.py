from textileplatform.beadpattern import parse_jbb_data, render_jbb_data
from textileplatform.db import db
from textileplatform.app import app, limiter
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
from textileplatform.models import Announcement
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
from textileplatform.mail import send_email_changed_notice
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
def assign_csp_nonce():
    g.csp_nonce = secrets.token_urlsafe(16)


@app.context_processor
def inject_csp_nonce():
    return {"csp_nonce": getattr(g, "csp_nonce", "")}


def _current_announcement():
    """Return the most recent non-expired announcement, or None."""
    now = datetime.datetime.now(datetime.timezone.utc)
    return (
        Announcement.query
        .filter(Announcement.expires > now)
        .order_by(Announcement.id.desc())
        .first()
    )


@app.context_processor
def inject_pending_announcement():
    """Expose `pending_announcement = {id, body}` to templates when the
    logged-in user has not yet dismissed the current announcement."""
    user = getattr(g, "user", None)
    if user is None:
        return {}
    # Don't show the modal during an impersonation session — the real
    # user hasn't seen it, and dismissing would mark it seen on their
    # behalf.
    if session.get("impersonator"):
        return {}
    current = _current_announcement()
    if current is None:
        return {}
    last = user.last_seen_announcement_id or 0
    if current.id <= last:
        return {}
    # Locale picked at render time so a language switch between visits
    # is reflected without extra bookkeeping.
    body = (
        current.body_de
        if str(get_locale() or "en") == "de"
        else current.body_en
    )
    return {"pending_announcement": {
        "id": current.id,
        "body": body,
    }}


@app.before_request
def load_logged_in_user():
    g.usage_pending = False
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
                    return _auth_redirect_or_401()

                # If the session's token version is stale (e.g. the
                # password was changed elsewhere), force logout. Skip
                # while impersonating so a support session isn't
                # invalidated when the target user's password is reset.
                if not impersonating:
                    session_ver = session.get("session_token_version")
                    user_ver = g.user.session_token_version or 0
                    if session_ver is None:
                        # Pre-existing sessions without the field — adopt
                        # the current value so we don't kick everyone out
                        # at deploy time.
                        session["session_token_version"] = user_ver
                    elif session_ver != user_ver:
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
                    return _auth_redirect_or_401()

                # Flush access_date + day counters when either:
                #   - it's the first access of a new day (so day counters
                #     are accurate), or
                #   - more than 10 minutes have passed since the last
                #     access_date write (cheap "still here" heartbeat).
                # When the day rolls over we always write — otherwise the
                # next request would see the same stale date and bump the
                # day counter a second time.
                if not impersonating:
                    last = g.user.access_date
                    if (
                        last is None
                        or last.date() != now.date()
                        or (now - last).total_seconds() > 600
                    ):
                        g.usage_pending = True
                        g.usage_now = now
        except Exception:
            g.user = None


def _pattern_has_data(contents, pattern_type):
    """True if the parsed pattern has at least one non-zero data cell.
    A freshly-created pattern, or one whose grid arrays are all zeros,
    returns False. Used by the save-pattern tripwire to detect when an
    incoming save would empty an otherwise-substantial pattern."""
    if not isinstance(contents, dict):
        return False
    if pattern_type == "DB-WEAVE Pattern":
        for key in ("data_entering", "data_tieup", "data_treadling"):
            arr = contents.get(key)
            if isinstance(arr, list) and any(arr):
                return True
        return False
    if pattern_type == "JBead Pattern":
        model = contents.get("model")
        if isinstance(model, list):
            for row in model:
                if isinstance(row, list) and any(row):
                    return True
        return False
    return False


def _bump_pattern_edit(pattern_type):
    """Unthrottled edit-count bump used by save / create / upload / delete
    routes."""
    if not g.user or session.get("impersonator"):
        return
    if pattern_type == "DB-WEAVE Pattern":
        g.user.bump_category("weave_edit")
    elif pattern_type == "JBead Pattern":
        g.user.bump_category("bead_edit")


def _bump_pattern_view(pattern_type):
    """Unthrottled view-count bump. Only called when the user explicitly
    opens a pattern in the editor (edit_pattern route)."""
    if not g.user or session.get("impersonator"):
        return
    if pattern_type == "DB-WEAVE Pattern":
        g.user.bump_category("weave_view")
    elif pattern_type == "JBead Pattern":
        g.user.bump_category("bead_view")


def _bump_messaging():
    """Unthrottled bump for each message the user sends (direct or group)."""
    if not g.user or session.get("impersonator"):
        return
    g.user.bump_category("messaging")


def _touch_group(group):
    """Stamp the group as modified now. Caller is responsible for the
    surrounding commit."""
    if group is None:
        return
    group.modified = datetime.datetime.now(datetime.timezone.utc)


def _resolve_extra_group(group_name, user):
    """Return a Group the user can write to, or None.

    Used by create/upload flows to honour an optional `group` form field
    so newly created patterns land in the originating group rather than
    only in the user's primary personal group. Resolves the name first
    among the user's personal groups, then among global groups.
    """
    if not group_name or not user:
        return None
    if group_name == user.name:
        # The user's primary personal group is the default destination —
        # no "extra" assignment needed.
        return None
    group = Group.query.filter(
        Group.owner_id == user.id, Group.name == group_name,
    ).one_or_none()
    if group is None:
        group = Group.query.filter(
            Group.owner_id.is_(None), Group.name == group_name,
        ).one_or_none()
    if not group:
        return None
    if not user.can_assign_to(group):
        return None
    return group


def _assign_new_pattern_to_group(pattern_name, group):
    """Add an Assignment of the just-created pattern to ``group``.

    No-op if ``group`` is None. The caller is responsible for committing.
    Used by create/upload flows so newly created patterns appear in the
    originating non-personal group instead of only the personal one.
    """
    if group is None:
        return
    p = (
        Pattern.query
        .filter(Pattern.owner_id == g.user.id)
        .filter(Pattern.name == pattern_name)
        .one_or_none()
    )
    if p is None:
        return
    if any(a.group_id == group.id for a in p.assignments):
        return
    db.session.add(Assignment(pattern_id=p.id, group_id=group.id))
    _touch_group(group)


@app.after_request
def set_security_headers(response):
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    # HSTS — only meaningful (and only safe) on HTTPS responses.
    # request.scheme is "https" for proxied HTTPS requests because
    # ProxyFix translates X-Forwarded-Proto. 2 years + subdomains;
    # not adding `preload` until you've decided to commit to HSTS
    # preload-list submission, which is hard to reverse.
    if request.scheme == "https":
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=63072000; includeSubDomains",
        )
    # First-party CSS/JS only; pattern editors use inline styles for
    # canvas-driven layout, so 'unsafe-inline' is allowed for styles
    # but not scripts. data: is needed for the embedded preview/
    # thumbnail images returned by the pattern API.
    nonce = getattr(g, "csp_nonce", "")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        "img-src 'self' data:; "
        "style-src 'self' 'unsafe-inline'; "
        f"script-src 'self' 'nonce-{nonce}'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'",
    )
    return response


@app.after_request
def flush_usage_stats(response):
    if not getattr(g, "usage_pending", False):
        return response
    user = getattr(g, "user", None)
    if user is None:
        return response
    try:
        now = g.usage_now
        user.bump_usage_day(now)
        user.access_date = now
        db.session.commit()
    except Exception:
        db.session.rollback()
        logging.exception("failed to flush usage stats")
    return response


def _is_api_request():
    return request.path.startswith("/api/")


def _auth_redirect_or_401():
    """Force-logout response: 401 JSON for /api/ requests (so JS clients
    can reload), HTML redirect to login otherwise."""
    if _is_api_request():
        return jsonify({"status": "NOK", "message": "Not authenticated"}), 401
    return redirect(url_for("login"))


def _safe_next_url(candidate):
    """Return candidate iff it is a safe same-origin relative path.
    Blocks absolute URLs, protocol-relative URLs (//evil.com), and the
    login URL itself (which would loop)."""
    if not candidate:
        return None
    if not candidate.startswith("/"):
        return None
    if candidate.startswith("//") or candidate.startswith("/\\"):
        return None
    try:
        login_path = url_for("login")
    except Exception:
        login_path = "/auth/login"
    if candidate == login_path or candidate.startswith(login_path + "?"):
        return None
    return candidate


def login_required(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None:
            if _is_api_request():
                return jsonify({"status": "NOK", "message": "Not authenticated"}), 401
            nxt = None
            if request.method == "GET":
                path = request.full_path if request.query_string else request.path
                nxt = _safe_next_url(path)
            if nxt:
                return redirect(url_for("login", next=nxt))
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


# Lenient email shape check. We're not trying to validate RFC 5322 —
# we just want to bounce obvious garbage like "" or "foo" before it
# hits the database. PostgreSQL's unique constraint and the verification
# email are the real correctness gate.
_EMAIL_RE = __import__("re").compile(
    r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
)


def is_valid_email(email):
    if not email:
        return False
    if len(email) > 254:
        return False
    return bool(_EMAIL_RE.match(email))


def change_user_email(user, new_email):
    """Apply an admin-driven email change. Returns None on success or a
    user-facing error message string. Does not commit — callers commit
    after they have finished the surrounding transaction.

    Bumps session_token_version so any active sessions for the user are
    forced to re-login (the email is the login credential, so this is
    the safe thing to do)."""
    new_email = (new_email or "").strip()
    if not is_valid_email(new_email):
        return "E-Mail is not valid"
    if new_email.lower() == (user.email_lower or "").lower():
        return None
    clash = User.query.filter(
        User.email_lower == new_email.lower(),
        User.id != user.id,
    ).first()
    if clash is not None:
        return "Another account already uses this e-mail address"
    user.email = new_email
    user.email_lower = new_email.lower()
    user.session_token_version = (user.session_token_version or 0) + 1
    return None


def _is_name_taken(name):
    """A handle is taken if it collides in the *global* namespace —
    i.e. any user, or any global (non-personal) group. Personal-group
    names live under their owner's account and don't participate in
    this check; they're validated per-user via
    `_is_personal_group_name_taken`."""
    if User.query.filter(User.name == name).first():
        return True
    if Group.query.filter(
        Group.name == name, Group.owner_id.is_(None),
    ).first():
        return True
    return False


def _user_group_by_name(user, group_name):
    """Find a group by name from the user's perspective: prefer a
    global group the user has any membership in, otherwise a personal
    group the user owns. Returns None when neither matches. Disjoint
    namespaces (enforced at create time) guarantee at most one match."""
    if user is None or not group_name:
        return None
    global_group = Group.query.filter(
        Group.owner_id.is_(None), Group.name == group_name,
    ).one_or_none()
    if global_group is not None:
        return global_group
    return Group.query.filter(
        Group.owner_id == user.id, Group.name == group_name,
    ).one_or_none()


def _is_personal_group_name_taken(user, name, exclude_id=None):
    """True if `user` already has a personal group called `name`.
    Pass `exclude_id` when checking during a rename to ignore the
    group being renamed."""
    if user is None or not name:
        return False
    q = Group.query.filter(
        Group.owner_id == user.id, Group.name == name,
    )
    if exclude_id is not None:
        q = q.filter(Group.id != exclude_id)
    return q.first() is not None


def _propose_free_name(base):
    """Pick a free handle that visibly relates to `base`. Tries numeric
    suffixes first (`base-2`, `base-3`, …), which most users immediately
    understand. Falls back to a short random suffix only when the
    numeric range is exhausted, so we never loop unbounded."""
    if not base:
        base = "user"
    for i in range(2, 10):
        candidate = f"{base}-{i}"
        if not _is_name_taken(candidate) and is_valid(candidate, max_len=50):
            return candidate
    for _ in range(10):
        candidate = f"{base}-{secrets.token_hex(3)}"
        if not _is_name_taken(candidate) and is_valid(candidate, max_len=50):
            return candidate
    return f"{base}-{secrets.token_hex(6)}"


def _i18n_marker():
    # Strings returned from change_user_name / change_user_label below.
    # Listed here so pybabel sees them as gettext literals — the actual
    # lookup happens in the route handlers that call flash(gettext(err)).
    gettext("Label is required")
    gettext("Label is too long")
    gettext("Another group already uses this name")


def change_user_name(user, new_name):
    """Apply an admin-driven user-name change. Returns None on success
    or a user-facing error message string. Does not commit.

    Renames the user's primary group (which shares the name) as part
    of the same transaction so the group handle continues to match the
    user. Bumps session_token_version so any active session for the
    user is forced to re-login — every URL containing the handle just
    changed."""
    new_name = (new_name or "").strip().lower()
    if not new_name:
        return "Name is required"
    if not is_valid(new_name, max_len=50):
        return "Name is invalid and cannot be used"
    if new_name == user.name:
        return None
    clash_user = User.query.filter(
        User.name == new_name, User.id != user.id,
    ).first()
    if clash_user is not None:
        return "Another account already uses this name"
    primary = Group.query.filter(
        Group.owner_id == user.id, Group.name == user.name,
    ).first()
    # A global group claiming the new handle would clash with the
    # forthcoming user URL. Personal groups owned by *other* users are
    # fine — they're namespaced under their owner.
    clash_group = Group.query.filter(
        Group.name == new_name, Group.owner_id.is_(None),
    ).first()
    if clash_group is not None:
        return "Another group already uses this name"
    if primary is not None:
        primary.name = new_name
    user.name = new_name
    user.session_token_version = (user.session_token_version or 0) + 1
    return None


def change_user_label(user, new_label):
    """Apply a label change for a user. Returns None on success or a
    user-facing error message string. Does not commit.

    Labels are purely display — duplicates are allowed (five Silvias
    can all call themselves Silvia). The URL handle on `name` stays
    unique and is the only identifier that has to be."""
    new_label = (new_label or "").strip()
    if not new_label:
        return "Label is required"
    if len(new_label) > 50:
        return "Label is too long"
    if new_label == user.label:
        return None
    primary = Group.query.filter(
        Group.owner_id == user.id, Group.name == user.name,
    ).first()
    if primary is not None:
        primary.label = new_label
    user.label = new_label
    return None


# Trivially weak passwords that are rejected outright. Kept short on
# purpose — the goal is to bounce the absolute worst, not enforce a
# strict policy. Add to this if real-world abuse shows new patterns.
_TRIVIAL_PASSWORDS = frozenset({
    "password", "passwort", "geheim", "secret",
    "12345678", "123456789", "1234567890",
    "qwertyui", "qwertz12", "asdfghjk",
    "letmein1", "welcome1", "iloveyou",
    "textile1", "textileplatform",
})


def is_acceptable_password(password, name=None, email=None):
    """Return True iff the password meets minimum rules: at least 8
    characters, not on the trivial list, and not equal (case-insensitive)
    to the user's name or email-local-part. Intentionally lenient — if
    a user wants to use 'aaaaaaaa' that's their call. We just prevent
    the very worst defaults."""
    if not password or len(password) < 8:
        return False
    lower = password.lower()
    if lower in _TRIVIAL_PASSWORDS:
        return False
    if name and lower == name.lower():
        return False
    if email:
        local = email.split("@", 1)[0].lower()
        if local and lower == local:
            return False
    return True


@app.route("/")
def index():
    if g.user:
        return redirect(url_for("user", user_name=g.user.name))
    elif str(get_locale() or "en") == "de":
        return redirect(url_for(
            "personal_group", user_name="beispiele", group_name="beispiele",
        ))
    else:
        return redirect(url_for(
            "personal_group", user_name="examples", group_name="examples",
        ))


def _group_view_payload(group):
    """Build the dict shape used by group.html for the public read-only
    view. Shared by the global and personal-group routes."""
    raw = []
    for a in group.assignments:
        p = a.pattern
        if not p.public:
            continue
        raw.append(p)
    raw.sort(key=lambda p: (p.label.lower(), p.name, p.owner.name, p.id))
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
    return {
        "patterns_weave": [
            p for p in patterns if p["pattern_type"] == "DB-WEAVE Pattern"
        ],
        "patterns_bead": [
            p for p in patterns if p["pattern_type"] == "JBead Pattern"
        ],
        "patterns_other": [
            p for p in patterns
            if p["pattern_type"] not in ("DB-WEAVE Pattern", "JBead Pattern")
        ],
    }


def group_url(group, **kwargs):
    """Build the correct URL for a Group, picking the global or personal
    route based on ownership. Use this instead of hand-building
    `/groups/...` so personal vs global stays transparent to templates
    and callers."""
    if group is None:
        return url_for("index")
    if group.is_personal():
        return url_for(
            "personal_group",
            user_name=group.owner.name,
            group_name=group.name,
            **kwargs,
        )
    return url_for("group", group_name=group.name, **kwargs)


@app.context_processor
def inject_group_url():
    return {"group_url": group_url}


@app.route("/groups/<string:group_name>")
def group(group_name):
    try:
        # Only global groups live at /groups/<name>. Hitting this URL
        # with a former primary-group handle (now a personal group)
        # redirects to the canonical personal URL so old links keep
        # working.
        group = Group.query.filter(
            Group.name == group_name, Group.owner_id.is_(None),
        ).one_or_none()
        if not group:
            personal = Group.query.filter(
                Group.name == group_name,
            ).join(User, Group.owner_id == User.id).filter(
                User.name == group_name,
            ).one_or_none()
            if personal is not None:
                return redirect(group_url(personal), code=301)
            return redirect(url_for("index"))
        if not group.public:
            abort(404)
        # /groups/<name> is a shareable read-only public view — show only
        # public patterns even to logged-in members. Members manage and
        # see private content via their personal page's group tabs.
        return render_template(
            "group.html", group=group, **_group_view_payload(group),
        )
    except HTTPException:
        raise
    except Exception:
        logging.exception("system error")
        abort(500)


@app.route("/<string:user_name>/g/<string:group_name>")
def personal_group(user_name, group_name):
    """Read-only public view of a personal group. Owner-only views and
    edits use the regular profile tabs."""
    try:
        owner = User.query.filter(
            User.name == user_name.lower(),
        ).one_or_none()
        if owner is None:
            abort(404)
        group = Group.query.filter(
            Group.owner_id == owner.id, Group.name == group_name,
        ).one_or_none()
        if group is None:
            abort(404)
        if not group.public:
            # Owner reaching their own private personal group is sent to
            # their profile with the group's tab activated.
            if g.user and g.user.id == owner.id:
                return redirect(url_for(
                    "user", user_name=owner.name,
                ) + f"?group={group.name}")
            abort(404)
        return render_template(
            "group.html", group=group, **_group_view_payload(group),
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
        # Primary-personal-group view hides patterns that are also
        # assigned to any *other* group the user is in — shared or
        # personal. The primary is the catch-all "everything not
        # otherwise sorted"; once a pattern has been filed into a
        # shared or personal group it lives there. Unassigning it from
        # all those groups makes it reappear in the primary.
        non_primary_member_group_ids = {
            m.group_id for m in user.memberships
            if m.state == "accepted"
            and not (
                m.group.owner_id == user.id
                and m.group.name == user.name
            )
        }
        for m in user.memberships:
            if m.state != "accepted":
                continue
            if m.group.id in seen:
                continue
            seen.add(m.group.id)
            role = m.role
            can_write = role in ("owner", "writer")
            is_personal_group = (m.group.owner_id == user.id)
            is_primary_group = (
                is_personal_group and m.group.name == user.name
            )
            patterns = []
            for a in m.group.assignments:
                p = a.pattern
                if is_primary_group and any(
                    other.group_id in non_primary_member_group_ids
                    for other in p.assignments
                ):
                    continue
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
                "is_personal": is_personal_group,
                "is_primary": is_primary_group,
                "is_public": bool(m.group.public),
                "role": role,
                "can_write": can_write,
            })
            patterns_by_group[m.group.name] = patterns
        # Order: primary personal first, then other personal groups
        # (alphabetical), then shared groups (alphabetical).
        def _group_sort_key(gr):
            if gr.get("is_primary"):
                return (0, "")
            if gr["is_personal"]:
                return (1, gr["label"].lower())
            return (2, gr["label"].lower())
        groups.sort(key=_group_sort_key)
        active = request.args.get("group") or user.name
        if active not in patterns_by_group:
            active = user.name if user.name in patterns_by_group else (
                groups[0]["name"] if groups else user.name
            )
        try:
            user_settings = (
                json.loads(g.user.settings)
                if g.user and g.user.settings
                else {}
            )
            if not isinstance(user_settings, dict):
                user_settings = {}
        except Exception:
            user_settings = {}
        return render_template(
            "user_private.html",
            user=user,
            is_owner=is_owner,
            groups=groups,
            patterns_by_group=patterns_by_group,
            active_group=active,
            user_settings=user_settings,
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
    if not readonly:
        _bump_pattern_view(pattern.pattern_type)
        try:
            db.session.commit()
        except Exception:
            db.session.rollback()
            logging.exception("failed to bump view count")
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
        viewer = g.user
        try:
            user_settings = (
                json.loads(viewer.settings)
                if viewer and viewer.settings
                else {}
            )
            if not isinstance(user_settings, dict):
                user_settings = {}
        except Exception:
            user_settings = {}
        return render_template(
            "edit_dbweave_pattern.html",
            user=user,
            pattern=pattern,
            readonly=readonly,
            origin=origin,
            user_settings=user_settings,
        )
    elif pattern.pattern_type == "JBead Pattern":
        viewer = g.user
        try:
            user_settings = (
                json.loads(viewer.settings)
                if viewer and viewer.settings
                else {}
            )
            if not isinstance(user_settings, dict):
                user_settings = {}
        except Exception:
            user_settings = {}
        return render_template(
            "edit_jbead_pattern.html",
            user=user,
            pattern=pattern,
            readonly=readonly,
            origin=origin,
            user_settings=user_settings,
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
        harness_from = payload.get("harness_from")
        harness_to   = payload.get("harness_to")
        treadle_from = payload.get("treadle_from")
        treadle_to   = payload.get("treadle_to")
        full_pattern = payload.get("full_pattern", True)
    else:
        pattern_data = json.loads(pattern.contents)
        warp_from = request.args.get("warp_from", type=int)
        warp_to   = request.args.get("warp_to",   type=int)
        weft_from = request.args.get("weft_from", type=int)
        weft_to   = request.args.get("weft_to",   type=int)
        harness_from = request.args.get("harness_from", type=int)
        harness_to   = request.args.get("harness_to",   type=int)
        treadle_from = request.args.get("treadle_from", type=int)
        treadle_to   = request.args.get("treadle_to",   type=int)
        full_pattern = request.args.get("full_pattern", "1") != "0"

    try:
        if pattern.pattern_type == "DB-WEAVE Pattern":
            body = exporter.print_pdf(
                pattern_data,
                title=pattern.label or pattern_name,
                warp_from=warp_from, warp_to=warp_to,
                weft_from=weft_from, weft_to=weft_to,
                harness_from=harness_from, harness_to=harness_to,
                treadle_from=treadle_from, treadle_to=treadle_to,
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
    suffix = "-part" if any(v is not None for v in (
        warp_from, warp_to, weft_from, weft_to,
        harness_from, harness_to, treadle_from, treadle_to,
    )) else ""
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
        if action == "label":
            new_label = (request.form.get("label") or "").strip()
            err = change_user_label(user, new_label)
            if err:
                flash(gettext(err))
            else:
                try:
                    db.session.commit()
                    flash(gettext("Display name updated"))
                except Exception:
                    db.session.rollback()
                    logging.exception("Label change failed")
                    flash(gettext("Changes could not be saved"))
            return redirect(url_for("profile"))

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
            elif not is_acceptable_password(
                new, name=user.name, email=user.email
            ):
                flash(gettext(
                    "Password must be at least 8 characters and not a "
                    "common or trivial password"
                ))
            else:
                try:
                    user.password = generate_password_hash(new)
                    # Invalidate any outstanding password-reset tokens
                    # and bump the session-token version so other
                    # active sessions for this user are forced out.
                    user.password_reset_code = None
                    user.password_reset_expires = None
                    user.session_token_version = (
                        (user.session_token_version or 0) + 1
                    )
                    session["session_token_version"] = (
                        user.session_token_version
                    )
                    db.session.commit()
                    flash(gettext("Password changed"))
                except Exception:
                    logging.exception("Password change failed")
                    flash(gettext("Changes could not be saved"))
            return redirect(url_for("profile"))

        # Email is intentionally not user-editable here. Self-service
        # email change requires a verified-change flow (token sent to
        # the new address, notification to the old address) which we
        # haven't built yet. Until then, changes go through the admin
        # UI / `change-email` CLI. We ignore any submitted email field
        # so a hand-crafted POST cannot bypass the read-only template.
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
        # An unguessable random hash that no plaintext can match. Using
        # a real hash (rather than a sentinel like "!") means the column
        # cannot accidentally satisfy check_password_hash regardless of
        # werkzeug version.
        password=generate_password_hash(secrets.token_urlsafe(32)),
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

    # Personal groups (owned by this user) — remove all of them.
    personal_groups = Group.query.filter(Group.owner_id == user.id).all()
    for pg in personal_groups:
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
        extra_group = _resolve_extra_group(
            request.form.get("group"), g.user
        )
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
            saved_kind = None
            if data.startswith("@dbw3:"):
                saved = add_weave_pattern(parse_dbw_data(data, name), g.user)
                saved_kind = "DB-WEAVE Pattern"
            elif data.startswith("(jbb"):
                saved = add_bead_pattern(parse_jbb_data(data, name), g.user)
                saved_kind = "JBead Pattern"
            else:
                try:
                    jsondata = json.loads(bytedata.decode("utf-8", "ignore"))
                    if "max_shafts" in jsondata:
                        if "name" not in jsondata:
                            jsondata["name"] = name
                        saved = add_weave_pattern(jsondata, g.user)
                        saved_kind = "DB-WEAVE Pattern"
                    else:
                        if "name" not in jsondata:
                            jsondata["name"] = name
                        saved = add_bead_pattern(jsondata, g.user)
                        saved_kind = "JBead Pattern"
                except Exception:
                    pass  # TODO handle errors
            if saved:
                imported.append(saved)
                _bump_pattern_edit(saved_kind)
                if extra_group is not None:
                    p = (
                        Pattern.query
                        .filter(Pattern.owner_id == g.user.id)
                        .filter(Pattern.name == saved)
                        .one_or_none()
                    )
                    if p is not None and not any(
                        a.group_id == extra_group.id
                        for a in p.assignments
                    ):
                        db.session.add(Assignment(
                            pattern_id=p.id,
                            group_id=extra_group.id,
                        ))
                        _touch_group(extra_group)
        if imported:
            db.session.commit()
        if len(imported) == 1:
            return redirect(url_for(
                "edit_pattern",
                user_name=g.user.name,
                pattern_name=imported[0],
                autosave="1",
                origin=(
                    "user-tab-" + extra_group.name
                    if extra_group is not None else ""
                ),
            ))
        if extra_group is not None:
            return redirect(url_for(
                "user",
                user_name=g.user.name,
                group=extra_group.name,
            ))
        return redirect(url_for("user", user_name=g.user.name))
    return render_template("upload_pattern.html", user=g.user)


@app.route("/patterns/create", methods=("POST",))
@login_required
def create_pattern():
    # POST-only: invoked exclusively by the inline "+ new" button on the
    # user listing page. There is no GET form — defaults are seeded from
    # the user's server-side editor settings on the listing template.
    pattern_type = request.form.get("pattern_type")
    extra_group = _resolve_extra_group(request.form.get("group"), g.user)
    if pattern_type == "DB-WEAVE Pattern":
        name = request.form["name"]
        width = request.form["width"]
        height = request.form["height"]

        errors = False

        if not name:
            flash(gettext("Please provide a name for the pattern"))
            errors = True

        try:
            width = int(width)
            if width < 10 or 1000 < width:
                flash(gettext("Width must be between 10 and 1000"))
                errors = True
        except ValueError:
            flash(gettext("Width must be between 10 and 1000"))
            errors = True

        try:
            height = int(height)
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

        pattern["display_repeat"] = False
        pattern["display_reed"] = True
        pattern["display_colors_warp"] = True
        pattern["display_colors_weft"] = True
        pattern["display_entering"] = True
        pattern["display_threading"] = True

        # Style/direction defaults come from the user's saved dbweave
        # prefs (Extras ▸ Grundeinstellung / Optionen ▸ Global…) so the
        # American/Scandinavian/Swiss preset chosen in the editor flows
        # through to subsequently created patterns. Falls back to the
        # Swiss preset when no preference is stored.
        try:
            dbw_prefs = (
                json.loads(g.user.settings).get("dbweave", {})
                if g.user and g.user.settings else {}
            )
            if not isinstance(dbw_prefs, dict):
                dbw_prefs = {}
        except Exception:
            dbw_prefs = {}

        pattern["direction_righttoleft"] = bool(
            dbw_prefs.get("direction_righttoleft", False))
        pattern["direction_toptobottom"] = bool(
            dbw_prefs.get("direction_toptobottom", False))
        pattern["direction_entering_at_bottom"] = bool(
            dbw_prefs.get("entering_at_bottom", False))
        pattern["entering_style"]  = dbw_prefs.get("entering_style",  "vdash")
        pattern["treadling_style"] = dbw_prefs.get("treadling_style", "dot")
        pattern["tieup_style"]     = dbw_prefs.get("tieup_style",     "cross")
        pattern["pegplan_style"]   = dbw_prefs.get("pegplan_style",   "filled")
        pattern["sinking_shed"]    = bool(dbw_prefs.get("sinking_shed", False))
        pattern["single_treadling"] = bool(
            dbw_prefs.get("single_treadling", True))

        pattern["weave_style"] = "draft"

        if not errors:
            try:
                name = add_weave_pattern(pattern, g.user)
                _bump_pattern_edit("DB-WEAVE Pattern")
                _assign_new_pattern_to_group(name, extra_group)
                db.session.commit()
                return redirect(url_for(
                    "edit_pattern",
                    user_name=g.user.name,
                    pattern_name=name,
                    origin=(
                        "user-tab-" + extra_group.name
                        if extra_group is not None else ""
                    ),
                ))
            except HTTPException:
                raise
            except Exception:
                logging.exception("Failed to create pattern")
                flash(gettext("Failed to create pattern"))

    elif pattern_type == "JBead Pattern":
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

        # Pull the user's last toggled view-state choices in as
        # defaults; explicit keys below still win.
        try:
            jb_prefs = (
                json.loads(g.user.settings) if g.user and g.user.settings
                else {}
            )
            jb_prefs = jb_prefs.get("jbead") if isinstance(
                jb_prefs, dict) else {}
            if not isinstance(jb_prefs, dict):
                jb_prefs = {}
        except Exception:
            jb_prefs = {}

        def _pref_bool(key, default):
            v = jb_prefs.get(key)
            return bool(v) if v is not None else default

        view = dict()
        view["draft-visible"]      = _pref_bool("draft-visible", True)
        view["corrected-visible"]  = _pref_bool("corrected-visible", True)
        view["simulation-visible"] = _pref_bool("simulation-visible", True)
        view["report-visible"]     = _pref_bool("report-visible", True)
        view["draw-colors"]        = _pref_bool("draw-colors", True)
        view["draw-symbols"]       = _pref_bool("draw-symbols", False)
        # Zoom is the cell size in pixels — must be in [4, 48] or
        # the editor falls back to its default. 12 matches the
        # editor's ViewSettings() default (dx=12).
        pref_zoom = jb_prefs.get("zoom")
        view["zoom"] = (
            int(pref_zoom)
            if isinstance(pref_zoom, (int, float))
            and 4 <= int(pref_zoom) <= 48
            else 12)
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
        pref_symbols = jb_prefs.get("symbols")
        view["symbols"] = (
            pref_symbols
            if isinstance(pref_symbols, str) and pref_symbols
            else "·abcdefghijklmnopqrstuvwxyz+-/\\*")
        pattern["view"] = view

        if not errors:
            try:
                name = add_bead_pattern(pattern, g.user)
                _bump_pattern_edit("JBead Pattern")
                _assign_new_pattern_to_group(name, extra_group)
                db.session.commit()
                return redirect(url_for(
                    "edit_pattern",
                    user_name=g.user.name,
                    pattern_name=name,
                    origin=(
                        "user-tab-" + extra_group.name
                        if extra_group is not None else ""
                    ),
                ))
            except HTTPException:
                raise
            except Exception:
                logging.exception("Failed to create pattern")
                flash(gettext("Failed to create pattern"))

    # Validation failed or pattern_type was unknown. Send the user back
    # to their listing; the flash message explains what to fix.
    if extra_group is not None:
        return redirect(url_for(
            "user",
            user_name=g.user.name,
            group=extra_group.name,
        ))
    return redirect(url_for("user", user_name=g.user.name))


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
            _bump_pattern_edit(pattern.pattern_type)
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
            touched_group_ids = (
                {a.group_id for a in todelete}
                | {a.group_id for a in new}
            )
            for a in todelete:
                db.session.delete(a)
            for a in new:
                db.session.add(a)
            pattern.assignments = fixed + existing + new
            if touched_group_ids:
                for gr in (
                    Group.query
                    .filter(Group.id.in_(touched_group_ids))
                    .all()
                ):
                    _touch_group(gr)
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
    group = _user_group_by_name(g.user, group_name)
    if not group:
        return redirect(url_for("edit_groups"))
    if group.is_global() and not g.user.is_in_group(group.id):
        return redirect(url_for("edit_groups"))
    role = g.user.role_in(group)
    is_personal = group.is_personal()
    is_primary = group.is_primary_personal()
    return render_template(
        "edit_group.html",
        user=g.user,
        group=group,
        role=role,
        is_owner=(role == "owner") or (is_personal and group.owner_id == g.user.id),
        is_personal=is_personal,
        is_primary=is_primary,
    )


@app.route("/groups/<group_name>/update", methods=("POST",))
@login_required
def update_group(group_name):
    group = _user_group_by_name(g.user, group_name)
    if not group:
        abort(404)
    if group.is_personal():
        if group.owner_id != g.user.id:
            abort(403)
        if group.is_primary_personal():
            flash(gettext("Cannot edit your primary group"))
            return redirect(url_for("edit_group", group_name=group.name))
    else:
        if not g.user.is_owner_of(group):
            abort(403)
    label = (request.form.get("label") or "").strip()
    if label:
        group.label = label
    description = (request.form.get("description") or "").strip()
    group.description = description
    _touch_group(group)
    db.session.commit()
    flash(gettext("Group updated"))
    return redirect(url_for("edit_group", group_name=group.name))


@app.route("/groups/<group_name>/visibility", methods=("POST",))
@login_required
def update_group_visibility(group_name):
    group = _user_group_by_name(g.user, group_name)
    if not group:
        abort(404)
    if group.is_personal():
        if group.owner_id != g.user.id:
            abort(403)
        if group.is_primary_personal():
            flash(gettext("Cannot change visibility of your primary group"))
            return redirect(url_for("edit_group", group_name=group.name))
    else:
        if not g.user.is_owner_of(group):
            abort(403)
    group.public = bool(request.form.get("public"))
    _touch_group(group)
    db.session.commit()
    return redirect(url_for("edit_group", group_name=group.name))


@app.route("/groups/<group_name>/invite", methods=("POST",))
@login_required
def invite_to_group(group_name):
    group = _user_group_by_name(g.user, group_name)
    if not group:
        abort(404)
    if group.is_personal():
        flash(gettext("Cannot invite to a personal group"))
        return redirect(url_for("edit_group", group_name=group.name))
    if not g.user.is_owner_of(group):
        abort(403)

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
            _touch_group(group)
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
    _touch_group(group)
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
    _touch_group(m.group)
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
    _touch_group(m.group)
    db.session.commit()
    flash(gettext("Invitation declined"))
    return redirect(url_for("invitations"))


@app.route(
    "/groups/<group_name>/members/<user_name>",
    methods=("POST",),
)
@login_required
def update_membership(group_name, user_name):
    group = _user_group_by_name(g.user, group_name)
    if not group:
        abort(404)
    if group.is_personal():
        abort(400)
    if not g.user.is_owner_of(group):
        abort(403)

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
        _touch_group(group)
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
        _touch_group(group)
        db.session.commit()
        flash(gettext("Role updated"))
    else:
        abort(400)
    return redirect(url_for("edit_group", group_name=group.name))


@app.route("/groups/<group_name>/delete", methods=("POST",))
@login_required
def delete_group(group_name):
    group = _user_group_by_name(g.user, group_name)
    if not group:
        abort(404)
    if group.is_primary_personal():
        flash(gettext("Cannot delete your primary group"))
        return redirect(url_for("edit_group", group_name=group.name))
    if group.is_personal():
        if group.owner_id != g.user.id:
            abort(403)
    else:
        if not g.user.is_owner_of(group):
            abort(403)
    label = group.label
    conv = Conversation.query.filter_by(group_id=group.id).first()
    if conv is not None:
        db.session.delete(conv)
    for a in list(group.assignments):
        db.session.delete(a)
    for m in list(group.memberships):
        db.session.delete(m)
    db.session.delete(group)
    db.session.commit()
    flash(gettext("Group \"%(label)s\" deleted", label=label))
    return redirect(url_for("edit_groups"))


@app.route("/groups/<group_name>/leave", methods=("POST",))
@login_required
def leave_group(group_name):
    group = _user_group_by_name(g.user, group_name)
    if not group:
        abort(404)
    if group.is_personal():
        flash(gettext("Cannot leave a personal group"))
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
    _touch_group(group)
    db.session.commit()
    flash(gettext("You left the group"))
    return redirect(url_for("edit_groups"))


@app.route("/api/user/settings", methods=("GET", "PUT"))
@login_required
def api_user_settings():
    if request.method == "GET":
        try:
            obj = json.loads(g.user.settings) if g.user.settings else {}
        except Exception:
            obj = {}
        return jsonify({"status": "OK", "settings": obj}), 200
    try:
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return respond("NOK", "Invalid payload", 400)
        # Merge with existing so callers can do partial updates without
        # round-tripping the full document.
        try:
            existing = json.loads(g.user.settings) if g.user.settings else {}
            if not isinstance(existing, dict):
                existing = {}
        except Exception:
            existing = {}
        existing.update(payload)
        g.user.settings = json.dumps(existing)
        db.session.commit()
        return jsonify({"status": "OK", "settings": existing}), 200
    except Exception:
        logging.exception("Failed to save user settings")
        return respond("NOK", "Failed to save user settings", 500)


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
        group = Group.query.filter(
            Group.name == group_name, Group.owner_id.is_(None),
        ).first()
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
    # Optional next_url so admin links can drop straight into a specific
    # page (e.g. the editor for a given pattern). Accept only relative,
    # same-origin paths to prevent open-redirect.
    next_url = request.form.get("next_url") or ""
    if (
        next_url.startswith("/")
        and not next_url.startswith("//")
        and "\\" not in next_url
    ):
        return redirect(next_url)
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
        kind = (request.form.get("kind") or "").strip().lower()
        if kind not in ("personal", "shared"):
            flash(gettext("Please choose a group kind"))
            return render_template("add_group.html", form=request.form)
        label = (request.form.get("name") or "").strip()
        name = from_label(label)
        description = request.form.get("description") or ""
        make_public = bool(request.form.get("public"))

        if not label:
            flash(gettext("Group Name is required"))
            return render_template("add_group.html", form=request.form)
        if not name or not is_valid(name, max_len=50):
            flash(gettext("Name is invalid and cannot be used"))
            return render_template("add_group.html", form=request.form)

        if kind == "shared":
            # Shared groups must own a globally unique handle (no user
            # and no other global group may already hold it).
            if _is_name_taken(name):
                flash(gettext("Group already exists"))
                return render_template("add_group.html", form=request.form)
            owner_id = None
        else:
            # Personal groups live under the user's namespace. Disallow
            # colliding with an existing global group's handle so that
            # name-based lookups (e.g. /groups/edit/<name>) remain
            # unambiguous for this user.
            if _is_personal_group_name_taken(g.user, name):
                flash(gettext("You already have a group with this name"))
                return render_template("add_group.html", form=request.form)
            global_clash = Group.query.filter(
                Group.owner_id.is_(None), Group.name == name,
            ).first()
            if global_clash is not None:
                flash(gettext(
                    "A shared group already uses this name. Choose another."
                ))
                return render_template("add_group.html", form=request.form)
            owner_id = g.user.id

        now_utc = datetime.datetime.now(datetime.timezone.utc)
        group = Group(
            name=name,
            label=label,
            description=description,
            owner_id=owner_id,
            public=make_public,
            created=now_utc,
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
        if kind == "shared":
            # Personal groups never get a group conversation — they're
            # single-member by construction.
            ensure_group_conversation(group)
        db.session.commit()

        if kind == "personal":
            return redirect(url_for(
                "user", user_name=g.user.name,
            ) + f"?group={group.name}")
        return redirect(url_for("edit_groups", user_name=g.user.name))
    return render_template("add_group.html")


@app.route("/admin/groups")
@login_required
@support_required
def groups():
    try:
        # Admin overview lists only shared (global) groups. Personal
        # groups are namespaced to their owner and managed there.
        all_groups = (
            Group.query
            .filter(Group.owner_id.is_(None))
            .filter(Group.name != SUPPORT_USERNAME)
            .order_by(Group.name)
            .all()
        )
        member_rows = (
            db.session.query(
                Membership.group_id, db.func.count(Membership.id),
            )
            .filter(Membership.state == "accepted")
            .group_by(Membership.group_id)
            .all()
        )
        pattern_rows = (
            db.session.query(
                Assignment.group_id, db.func.count(Assignment.id),
            )
            .group_by(Assignment.group_id)
            .all()
        )
        member_counts = {gid: n for gid, n in member_rows}
        pattern_counts = {gid: n for gid, n in pattern_rows}
        return render_template(
            "admin-groups.html",
            groups=all_groups,
            member_counts=member_counts,
            pattern_counts=pattern_counts,
        )
    except HTTPException:
        raise
    except Exception:
        logging.exception("failed to get all groups")
        abort(500, description="Failed to get all groups")


@app.route("/admin/groups/<string:group_name>")
@login_required
@support_required
def admin_view_group(group_name):
    group = Group.query.filter(
        Group.name == group_name, Group.owner_id.is_(None),
    ).first()
    if not group:
        abort(404, description=f"Group {group_name} not found")
    memberships = sorted(
        group.memberships,
        key=lambda m: (m.state != "accepted", m.user.name.lower()),
    )
    patterns = sorted(
        [a.pattern for a in group.assignments],
        key=lambda p: p.name.lower(),
    )
    return render_template(
        "admin-view-group.html",
        group=group,
        memberships=memberships,
        patterns=patterns,
    )


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
        all_patterns = (
            Pattern.query
            .join(User, Pattern.owner_id == User.id)
            .filter(User.name != SUPPORT_USERNAME)
            .order_by(Pattern.name)
            .all()
        )
        return render_template(
            "admin-patterns.html", patterns=all_patterns,
        )
    except HTTPException:
        raise
    except Exception:
        logging.exception("failed to get all patterns")
        abort(500, description="Failed to get all patterns")


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


@app.route("/admin/users/<string:user_name>/delete", methods=("POST",))
@login_required
@support_required
def admin_delete_user(user_name):
    target = User.query.filter(User.name == user_name).first()
    if not target:
        abort(404, description=f"User {user_name} not found")
    if target.name == SUPPORT_USERNAME:
        flash(gettext("The support account cannot be deleted."))
        return redirect(url_for("edit_user", user_name=target.name))
    if g.user and target.id == g.user.id:
        flash(gettext("You cannot delete your own account from here."))
        return redirect(url_for("edit_user", user_name=target.name))
    typed = (request.form.get("confirm_name") or "").strip()
    if typed != target.name:
        flash(gettext(
            "Please type the user's name exactly to confirm deletion."
        ))
        return redirect(url_for("edit_user", user_name=target.name))
    target_label = target.label
    try:
        _delete_user_data(target)
        db.session.commit()
    except Exception:
        logging.exception("admin user deletion failed")
        db.session.rollback()
        flash(gettext("Could not delete the account."))
        return redirect(url_for("edit_user", user_name=user_name))
    flash(gettext('Account "%(label)s" deleted.', label=target_label))
    return redirect(url_for("users"))


@app.route(
    "/admin/users/<string:user_name>/set-email", methods=("POST",)
)
@login_required
@support_required
def admin_set_user_email(user_name):
    target = User.query.filter(User.name == user_name).first()
    if not target:
        abort(404, description=f"User {user_name} not found")
    new_email = (request.form.get("email") or "").strip()
    old_email = target.email
    err = change_user_email(target, new_email)
    if err:
        flash(gettext(err))
        return redirect(url_for("edit_user", user_name=target.name))
    changed = (old_email or "").lower() != target.email.lower()
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        flash(gettext("Another account already uses this e-mail address"))
        return redirect(url_for("edit_user", user_name=target.name))
    except Exception:
        db.session.rollback()
        logging.exception("Failed to update e-mail")
        flash(gettext("Could not update the e-mail."))
        return redirect(url_for("edit_user", user_name=target.name))
    if changed:
        try:
            send_email_changed_notice(target, old_email)
        except Exception:
            # The DB change already happened — don't roll it back just
            # because a notification mail bounced. Log and move on.
            logging.exception("email-change notification failed")
        send_admin_notification_mail(
            target, f"Admin changed e-mail from {old_email}",
        )
    flash(gettext("E-Mail updated."))
    return redirect(url_for("edit_user", user_name=target.name))


@app.route(
    "/admin/users/<string:user_name>/set-name", methods=("POST",)
)
@login_required
@support_required
def admin_set_user_name(user_name):
    target = User.query.filter(User.name == user_name).first()
    if not target:
        abort(404, description=f"User {user_name} not found")
    if target.name == SUPPORT_USERNAME:
        flash(gettext("The support account cannot be renamed."))
        return redirect(url_for("edit_user", user_name=target.name))
    if g.user and target.id == g.user.id:
        flash(gettext("You cannot rename your own account from here."))
        return redirect(url_for("edit_user", user_name=target.name))
    new_name = (request.form.get("name") or "").strip()
    old_name = target.name
    err = change_user_name(target, new_name)
    if err:
        flash(gettext(err))
        return redirect(url_for("edit_user", user_name=old_name))
    changed = old_name != target.name
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        flash(gettext("Another account already uses this name"))
        return redirect(url_for("edit_user", user_name=old_name))
    except Exception:
        db.session.rollback()
        logging.exception("Failed to update name")
        flash(gettext("Could not update the name."))
        return redirect(url_for("edit_user", user_name=old_name))
    if changed:
        try:
            send_admin_notification_mail(
                target, f"Admin changed name from {old_name}",
            )
        except Exception:
            logging.exception("name-change notification failed")
    flash(gettext("Name updated."))
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
        current_announcement=_current_announcement(),
    )


@app.route("/admin/announcement", methods=("POST",))
@login_required
@support_required
def publish_announcement():
    body_de = (request.form.get("body_de") or "").strip()
    body_en = (request.form.get("body_en") or "").strip()
    try:
        days = int(request.form.get("days") or "0")
    except ValueError:
        days = 0
    if not body_de or not body_en:
        flash(gettext("Both German and English text are required."))
        return redirect(url_for("support_console"))
    if days < 1 or days > 365:
        flash(gettext("Duration must be between 1 and 365 days."))
        return redirect(url_for("support_console"))
    now = datetime.datetime.now(datetime.timezone.utc)
    ann = Announcement(
        body_de=body_de,
        body_en=body_en,
        created=now,
        expires=now + datetime.timedelta(days=days),
        author_id=g.user.id,
    )
    db.session.add(ann)
    db.session.commit()
    flash(gettext("Announcement published."))
    return redirect(url_for("support_console"))


@app.route("/admin/announcement/retire", methods=("POST",))
@login_required
@support_required
def retire_announcement():
    current = _current_announcement()
    if current is not None:
        current.expires = datetime.datetime.now(datetime.timezone.utc)
        db.session.commit()
        flash(gettext("Announcement retired."))
    return redirect(url_for("support_console"))


@app.route("/api/announcement/dismiss", methods=("POST",))
@login_required
def dismiss_announcement():
    payload = request.get_json(silent=True) or {}
    try:
        aid = int(payload.get("id") or 0)
    except (TypeError, ValueError):
        return respond("NOK", "Invalid id", 400)
    if aid <= 0:
        return respond("NOK", "Invalid id", 400)
    # During an impersonation session a stale modal could otherwise
    # mark the impersonated user's pointer on behalf of support.
    if session.get("impersonator"):
        return jsonify({"status": "OK"}), 200
    # Only move the pointer forward — never let a stale tab regress it.
    current = g.user.last_seen_announcement_id or 0
    if aid > current:
        g.user.last_seen_announcement_id = aid
        db.session.commit()
    return jsonify({"status": "OK"}), 200


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


def _new_captcha():
    """Mint a fresh arithmetic question and store the answer in the
    session. The user has to echo the answer back; a static script that
    posts a constant value won't get past it."""
    rng = secrets.SystemRandom()
    a = rng.randint(2, 9)
    b = rng.randint(2, 9)
    session["captcha_answer"] = a + b
    return f"{a} + {b}"


def _seed_starter_patterns(user):
    """Clone configured starter weave + bead patterns into a new user.

    Picks the example user (beispiele/examples) by the new user's locale,
    falls back to the other locale if a configured pattern can't be
    found there. Failures are logged but never block verification.
    """
    locale = (user.locale or "de").lower()
    if locale.startswith("de"):
        order = [("beispiele", "de"), ("examples", "en")]
    else:
        order = [("examples", "en"), ("beispiele", "de")]

    for kind in ("WEAVE", "BEAD"):
        for example_user_name, lang in order:
            cfg_name = app.config.get(f"STARTER_{kind}_{lang.upper()}")
            if not cfg_name:
                continue
            try:
                example_user = User.query.filter(
                    User.name == example_user_name
                ).one_or_none()
                if not example_user:
                    continue
                src = (
                    Pattern.query
                    .filter(Pattern.owner_id == example_user.id)
                    .filter(Pattern.name == cfg_name)
                    .one_or_none()
                )
                if not src:
                    logging.warning(
                        "starter pattern %s/%s not found",
                        example_user_name, cfg_name,
                    )
                    continue
                already = (
                    Pattern.query
                    .filter(Pattern.owner_id == user.id)
                    .filter(Pattern.name == src.name)
                    .first()
                )
                if already:
                    break
                clone_pattern(user, src, src.contents)
                break
            except Exception:
                logging.exception(
                    "failed seeding starter %s for user_id=%s",
                    kind, user.id,
                )
                break


@app.route("/auth/register", methods=("GET", "POST"))
@limiter.limit("5/hour", methods=["POST"])
def register():
    if request.method == "POST":
        # Two-field mode is entered when a clash on the slug forced us
        # to surface the handle separately. The client carries this
        # state back via a hidden flag, plus an explicit `name` input.
        two_field = request.form.get("mode") == "two"
        label = (request.form.get("label") or "").strip()
        # Legacy/single-field form posts only carry `label`; in
        # two-field mode the user has an editable `name` input too.
        handle_raw = (request.form.get("name") or "").strip().lower()
        email = (request.form.get("email") or "").strip()
        password = request.form["password"]
        confirm = request.form.get("confirm_password", "")
        expected = session.pop("captcha_answer", None)
        try:
            given = int((request.form.get("x") or "").strip())
        except ValueError:
            given = None

        error = None

        if not label:
            error = gettext("Name is required")
        elif not email:
            error = gettext("E-Mail is required")
        elif not is_valid_email(email):
            error = gettext("E-Mail is not valid")
        elif not password:
            error = gettext("Password is required")
        elif password != confirm:
            error = gettext("Passwords do not match")
        elif expected is None or given != expected:
            error = gettext("Calculation result required")
        elif not is_acceptable_password(password, name=label, email=email):
            error = gettext(
                "Password must be at least 8 characters and not a "
                "common or trivial password"
            )

        # In two-field mode the user controls the handle directly; in
        # single-field mode we derive it from the label as we always
        # have. Empty `name` in two-field mode falls back to the slug.
        if two_field and handle_raw:
            name = handle_raw
        else:
            name = from_label(label)

        if error is None and (not name or not is_valid(name, max_len=50)):
            error = gettext("Name is invalid and cannot be used")

        clash = False
        if error is None and _is_name_taken(name):
            clash = True

        if clash and not two_field:
            # First-time conflict: propose a free suffix, switch the
            # form into two-field mode, and ask the user to confirm.
            proposed = _propose_free_name(name)
            return render_template(
                "register.html",
                captcha_question=_new_captcha(),
                form_label=label,
                form_name=proposed,
                two_field=True,
                conflict_notice=gettext(
                    "The handle “%(taken)s” is already in use. We can "
                    "register you as “%(proposed)s” and keep "
                    "“%(label)s” as your display name. Adjust the "
                    "handle below if you prefer, then submit again.",
                    taken=name, proposed=proposed, label=label,
                ),
            )

        if clash and two_field:
            error = gettext("Name or E-Mail is already used")

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
                db.session.flush()
                now_utc = datetime.datetime.now(datetime.timezone.utc)
                group = Group(
                    name=name,
                    label=label,
                    description="",
                    owner_id=user.id,
                    created=now_utc,
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
                return render_template(
                    "verification_pending.html",
                    user=user,
                    show_code=app.config.get("SHOW_VERIFICATION_CODE", False),
                    verification_url=url_for(
                        "verify",
                        user_name=user.name,
                        verification_code=user.verification_code,
                    ),
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
        return render_template(
            "register.html",
            captcha_question=_new_captcha(),
            form_label=label,
            form_name=handle_raw if two_field else "",
            two_field=two_field,
        )

    return render_template("register.html", captcha_question=_new_captcha())


@app.route("/auth/login", methods=("GET", "POST"))
@limiter.limit("10/minute;60/hour", methods=["POST"])
def login():
    if request.method == "POST":
        email = (request.form.get("email") or "").strip()
        password = request.form["password"]
        error = None
        try:
            user = User.query.filter(User.email_lower == email.lower()).first()

            if user is None:
                logging.info("login failed: unknown email")
                error = gettext("Login data are not correct")
            elif not check_password_hash(user.password, password):
                logging.info("login failed: incorrect password")
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
            session["session_token_version"] = (
                user.session_token_version or 0
            )
            session.permanent = True

            now = datetime.datetime.now(datetime.timezone.utc)
            user.bump_usage_day(now)
            user.access_date = now
            db.session.commit()

            nxt = _safe_next_url(request.form.get("next") or request.args.get("next"))
            if nxt:
                return redirect(nxt)
            return redirect(url_for("user", user_name=user.name))

        flash(error)

    next_url = _safe_next_url(request.args.get("next"))
    return render_template("login.html", next_url=next_url)


@app.route("/auth/logout", methods=("GET", "POST"))
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/auth/verify/<string:user_name>/<string:verification_code>")
@limiter.limit("30/hour")
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
            logging.info("verification failed for user_id=%s", user.id)
            return render_template("verification_failed.html")
        user.verified = True
        user.verification_code = None
        logging.info("user_id=%s successfully verified", user.id)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            return render_template("verification_failed.html")
        send_admin_notification_mail(
            user,
            "User completed email account verification step",
        )
        _seed_starter_patterns(user)
        return render_template("verification_successful.html")
    except HTTPException:
        raise
    except Exception:
        logging.exception("system error")
        abort(500)


@app.route("/auth/recover", methods=("GET", "POST"))
@limiter.limit("3/hour;10/day", methods=["POST"])
def recover():
    if request.method == "POST":
        email = (request.form.get("email") or "").strip()
        if not email:
            flash(gettext("E-Mail is required."))
            return render_template("recover.html")
        if not is_valid_email(email):
            # Don't leak via a different error path: render the same
            # response we use for unknown/known emails, just as if we
            # accepted the input. This keeps recover non-enumerable.
            return render_template(
                "recover_mail_sent.html",
                email=email,
                show_code=False,
                reset_url=None,
            )

        user = None
        reset_url = None
        try:
            user = User.query.filter(
                User.email_lower == email.lower()
            ).first()
            if user is not None and user.verified:
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
                reset_url = url_for(
                    "reset_password",
                    user_name=user.name,
                    verification_code=user.password_reset_code,
                )
        except HTTPException:
            raise
        except Exception:
            db.session.rollback()
            logging.exception("recover failed")

        # Always render the same response regardless of whether the
        # email exists or is verified — otherwise the page itself is
        # an account-enumeration oracle.
        return render_template(
            "recover_mail_sent.html",
            email=email,
            show_code=(
                app.config.get("SHOW_VERIFICATION_CODE", False)
                and reset_url is not None
            ),
            reset_url=reset_url,
        )

    return render_template("recover.html")


@app.route(
    "/auth/reset-password/<string:user_name>/<string:verification_code>",
    methods=("GET", "POST"),
)
@limiter.limit("10/hour")
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
            confirm = request.form.get("confirm_password", "")
            if not password:
                error = gettext("Password is required.")
            elif password != confirm:
                error = gettext("Passwords do not match")
            elif not is_acceptable_password(
                password, name=user.name, email=user.email
            ):
                error = gettext(
                    "Password must be at least 8 characters and not a "
                    "common or trivial password"
                )

            if error is None:
                try:
                    user.password = generate_password_hash(password)
                    user.password_reset_code = None
                    user.password_reset_expires = None
                    user.session_token_version = (
                        (user.session_token_version or 0) + 1
                    )
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
            # Tripwire: if the existing pattern has real data and the
            # incoming save would empty it, stash the prior contents to
            # contents_salvage and log a warning. The client-side
            # localStorage draft is the first line of defence; this is
            # the server-side last-good copy in case the draft is
            # unavailable (other browser, private mode, quota exceeded).
            try:
                existing = (
                    json.loads(pattern.contents) if pattern.contents else None
                )
            except Exception:
                existing = None
            if (
                _pattern_has_data(existing, pattern.pattern_type)
                and not _pattern_has_data(contents, pattern.pattern_type)
            ):
                pattern.contents_salvage = pattern.contents
                logging.warning(
                    "save-pattern would empty %s/%s; stashed prior "
                    "contents to contents_salvage (%d bytes, ip=%s)",
                    user.name, pattern.name,
                    len(pattern.contents or ""),
                    request.remote_addr,
                )
            pattern.contents = json.dumps(contents)
            pattern.modified = datetime.datetime.now(datetime.timezone.utc)
            apply_pattern_metadata(pattern, contents)
            # Distinguish "absent" (don't touch) from "explicit null"
            # (clear). The dbweave editor sends explicit nulls when the
            # pattern is empty, so the listing falls back to the no-image
            # placeholder instead of keeping a stale render.
            if "thumbnail" in data:
                pattern.thumbnail_image = _decode_data_url_png(
                    data.get("thumbnail"))
            if "preview" in data:
                pattern.preview_image = _decode_data_url_png(
                    data.get("preview"))
            _bump_pattern_edit(pattern.pattern_type)
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
            _bump_pattern_edit(pattern.pattern_type)
            db.session.commit()
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
        _bump_messaging()
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
    group = Group.query.filter(
        Group.name == group_name, Group.owner_id.is_(None),
    ).first()
    if not group or not g.user.is_in_group(group.id):
        return respond("NOK", "Not a member of this group", 403)
    conv = ensure_group_conversation(group)

    if request.method == "POST":
        data = request.get_json(silent=True) or {}
        msg = post_message(conv, g.user, data.get("body", ""))
        if msg is None:
            return respond("NOK", "Empty message", 400)
        _bump_messaging()
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


@app.route("/api/intro/dismiss", methods=("POST",))
@login_required
def api_intro_dismiss():
    g.user.intro_seen = True
    db.session.commit()
    return jsonify({"status": "OK"})


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
    group = Group.query.filter(
        Group.name == group_name, Group.owner_id.is_(None),
    ).first()
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

from textileplatform.beadpattern import parse_jbb_data
from textileplatform.db import db
from textileplatform.app import app
from textileplatform.models import User
from textileplatform.models import Pattern
from textileplatform.models import Group
from textileplatform.models import Membership
from textileplatform.models import Assignment
from textileplatform.patterns import add_weave_pattern
from textileplatform.patterns import add_bead_pattern
from textileplatform.patterns import get_patterns_for_user
from textileplatform.patterns import clone_pattern
from textileplatform.name import from_label
from textileplatform.name import is_valid
from textileplatform.mail import send_verification_mail
from textileplatform.mail import send_admin_notification_mail
from textileplatform.mail import send_recover_mail
from textileplatform.palette import default_weave_palette
from textileplatform.palette import default_bead_palette
from textileplatform.weavepattern import parse_dbw_data

from importlib.metadata import version
import datetime
import io
import json
import logging
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
                # if the user got disabled, we force logout
                if g.user.disabled:
                    session.clear()
                    return redirect(url_for("login"))
                now = datetime.datetime.now()

                # we force logout after a month of inactivity
                if (
                    g.user.access_date
                    and (now - g.user.access_date).days > 30
                ):
                    session.clear()
                    return redirect(url_for("login"))

                # we update access date every 10 minutes in the database
                # this gives us reasonably accurrate usage info without
                # writing to the database with each click.
                if (
                    g.user.access_date
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


def superuser_required(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None or g.user.name != "superuser":
            return redirect(url_for("index"))
        return view(**kwargs)
    return wrapped_view


def respond(status, message, status_code=500):
    return jsonify({"status": status, "message": message}), status_code


@app.route("/")
def index():
    if g.user:
        return redirect(url_for("user", user_name=g.user.name))
    elif request.accept_languages.best_match(["de", "en"]) == "de":
        return redirect(url_for("group", group_name="beispiele"))
    else:
        return redirect(url_for("group", group_name="examples"))


@app.route("/groups/<string:group_name>")
def group(group_name):
    try:
        group = Group.query.filter(Group.name == group_name).one_or_none()
        if not group:
            return redirect(url_for("index"))
        if g.user and g.user.is_in_group(group.id):
            # show private view
            patterns = []
            for a in group.assignments:
                patterns.append(a.pattern)
        else:
            # show public view
            patterns = []
            for a in group.assignments:
                if not a.pattern.public:
                    continue
                patterns.append(a.pattern)
        patterns.sort(key=lambda p: (p.label, p.name, p.owner.name, p.id))
        patterns_weave = []
        patterns_bead = []
        patterns_other = []
        for pattern in patterns:
            if pattern.pattern_type == "DB-WEAVE Pattern":
                patterns_weave.append(pattern)
            elif pattern.pattern_type == "JBead Pattern":
                patterns_bead.append(pattern)
            else:
                patterns_other.append(pattern)
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
    elif g.user and (g.user.name == user.name or g.user.name == "superuser"):
        # show private view
        patterns_weave = []
        patterns_bead = []
        patterns_other = []
        group_patterns = {}
        for m in user.memberships:
            # only collect the users patterns
            if m.group.name == user.name:
                for a in m.group.assignments:
                    if a.pattern.pattern_type == "DB-WEAVE Pattern":
                        patterns_weave.append(a.pattern)
                    elif a.pattern.pattern_type == "JBead Pattern":
                        patterns_bead.append(a.pattern)
                    else:
                        patterns_other.append(a.pattern)
            else:
                if m.group.id not in group_patterns:
                    group_patterns[m.group.id] = [m.group, []]
                    patterns = group_patterns[m.group.id][1]
                    for a in m.group.assignments:
                        patterns.append(a.pattern)
        patterns_weave.sort(key=lambda p: (p.label, p.name, p.id))
        patterns_bead.sort(key=lambda p: (p.label, p.name, p.id))
        patterns_other.sort(key=lambda p: (p.label, p.name, p.id))
        for gid in group_patterns:
            group_patterns[gid][1].sort(key=lambda p: (p.label, p.name, p.id))
        return render_template(
            "user_private.html",
            user=user,
            patterns_weave=patterns_weave,
            patterns_bead=patterns_bead,
            patterns_other=patterns_other,
            group_patterns=group_patterns.values(),
            active_group=user.name,
        )
    else:
        # show public view
        patterns_weave = []
        patterns_bead = []
        patterns_other = []
        ids = set()
        for m in user.memberships:
            for a in m.group.assignments:
                if not a.pattern.public:
                    continue
                if a.pattern.owner.id != user.id:
                    continue
                if a.pattern.id in ids:
                    continue
                ids.add(a.pattern.id)
                if a.pattern.pattern_type == "DB-WEAVE Pattern":
                    patterns_weave.append(a.pattern)
                elif a.pattern.pattern_type == "JBead Pattern":
                    patterns_bead.append(a.pattern)
                else:
                    patterns_other.append(a.pattern)
        patterns_weave.sort(key=lambda p: (p.label, p.name, p.id))
        patterns_bead.sort(key=lambda p: (p.label, p.name, p.id))
        patterns_other.sort(key=lambda p: (p.label, p.name, p.id))
        return render_template(
            "user_public.html",
            user=user,
            patterns_weave=patterns_weave,
            patterns_bead=patterns_bead,
            patterns_other=patterns_other,
        )


@app.route("/<string:user_name>/<string:pattern_name>")
def edit_pattern(user_name, pattern_name):
    origin = request.args.get("origin", "")
    user = User.query.filter(User.name == user_name.lower()).first()
    if not user:
        return redirect(url_for("index"))
    pattern = (
        Pattern.query
        .join(User)
        .filter(Pattern.name == pattern_name)
        .filter(User.name == user_name.lower())
        .first()
    )
    if not pattern:
        return redirect(url_for("user", user_name=user_name))
    readonly = not g.user or g.user.name != user.name
    superuser = g.user and g.user.name == "superuser"
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
        .join(User)
        .filter(Pattern.name == pattern_name)
        .filter(User.name == user_name.lower())
        .first()
    )
    if not pattern:
        return redirect(url_for("user", user_name=user_name))
    readonly = not g.user or g.user.name != user.name
    superuser = g.user and g.user.name == "superuser"
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


@app.route("/<string:user_name>/<string:pattern_name>/source")
def source_pattern(user_name, pattern_name):
    origin = request.args.get("origin", "")
    user = User.query.filter(User.name == user_name.lower()).first()
    if not user:
        return redirect(url_for("index"))
    pattern = (
        Pattern.query
        .join(User)
        .filter(Pattern.name == pattern_name)
        .filter(User.name == user_name.lower())
        .first()
    )
    if not pattern:
        return redirect(url_for("user", user_name=user_name))
    readonly = not g.user or g.user.name != user.name
    superuser = g.user and g.user.name == "superuser"
    if not superuser and readonly and not pattern.public:
        return redirect(url_for("user", user_name=user_name))
    pattern.pattern = json.loads(pattern.contents)
    return render_template(
        "source-pattern.html",
        user=user,
        pattern=pattern,
        contents=json.dumps(pattern.pattern, ensure_ascii=False, indent=2),
    )


@app.route("/profile", methods=("GET", "POST"))
@login_required
def profile():
    if request.method == "POST":
        email = request.form["email"]
        darkmode = "darkmode" in request.form
        user = g.user
        user.email = email
        user.email_lower = email.lower()
        # TODO reset verified?!
        user.darkmode = darkmode
        try:
            db.session.commit()
            return redirect(url_for("user", user_name=user.name))
        except Exception:
            logging.exception("Profile changes not changed")
            flash(gettext("Changes could not be saved"))

    return render_template("profile.html", user=g.user)


@app.route("/patterns/upload", methods=("GET", "POST"))
@login_required
def upload_pattern():
    if request.method == "POST":
        name = request.form["name"]
        name = name.replace("..", "").replace("/", "").replace("\\", "")
        files = request.files.getlist("file")
        for idx, file in enumerate(files):
            if not name or len(files) > 1:
                if file.filename:
                    name = os.path.splitext(file.filename)[0]
                else:
                    name = f"unnamed {idx+1}"
            bytedata = file.read()
            data = bytedata.decode("latin-1", "ignore")
            if data.startswith("@dbw3:"):
                add_weave_pattern(parse_dbw_data(data, name), g.user)
            elif data.startswith("(jbb"):
                add_bead_pattern(parse_jbb_data(data, name), g.user)
            else:
                try:
                    jsondata = json.loads(bytedata.decode("utf-8", "ignore"))
                    if "max_shafts" in jsondata:
                        add_weave_pattern(jsondata, g.user)
                    else:
                        add_bead_pattern(jsondata, g.user)
                except Exception:
                    pass  # TODO handle errors
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

            pattern["model"] = [[0] * width] * height

            # TODO use user default palette?
            pattern["colors"] = default_bead_palette[:]

            view = dict()
            view["draft-visible"] = True
            view["corrected-visible"] = True
            view["simulation-visible"] = True
            view["report-visible"] = True
            view["zoom"] = 2
            view["shift"] = 0
            view["scroll"] = 0
            view["selected-tool"] = "select"
            view["selected-color"] = 1
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
        .join(User)
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
        .join(User)
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
            new_group_ids = request.form.getlist("assignments")
            old_group_ids = [a.group.id for a in pattern.assignments]
            existing = []
            todelete = []
            new = []
            for assignment in pattern.assignments:
                if assignment.group_id in new_group_ids:
                    existing.append(assignment)
                elif assignment.group.name != g.user.name:
                    todelete.append(assignment)
            for group_id in new_group_ids:
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
        groups=[m.group for m in g.user.memberships],
    )


@app.route("/groups/edit/<group_name>")
@login_required
def edit_group(group_name):
    group = Group.query.filter(Group.name == group_name).first()
    if not group:
        return redirect('index')
    return render_template(
        "edit_group.html",
        user=g.user,
        group=group,
    )


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
            db.session.commit()
            # TODO errorhandling
            return redirect(url_for("edit_groups", user_name=g.user.name))
    return render_template("add_group.html")


@app.route("/admin/groups")
@login_required
@superuser_required
def groups():
    try:
        all_groups = Group.query.order_by(Group.name).all()
        return render_template("groups.html", groups=all_groups)
    except HTTPException:
        raise
    except Exception:
        logging.exception("failed to get all groups")
        abort(500, description="Failed to get all groups")


@app.route("/admin/users")
@login_required
@superuser_required
def users():
    try:
        all_users = User.query.order_by(User.name).all()
        return render_template("users.html", users=all_users)
    except HTTPException:
        raise
    except Exception:
        logging.exception("failed to get all users")
        abort(500, description="Failed to get all users")


@app.route("/admin/patterns")
@login_required
@superuser_required
def patterns():
    try:
        all_users = User.query.order_by(User.name).all()
        return render_template("patterns.html", users=all_users)
    except HTTPException:
        raise
    except Exception:
        logging.exception("failed to get all users")
        abort(500, description="Failed to get all users")


@app.route("/admin/users/<string:user_name>")
@login_required
@superuser_required
def edit_user(user_name):
    try:
        user = User.query.filter(User.name == user_name).first()
        if not user:
            abort(404, description=f"User {user_name} not found")
        patterns = get_patterns_for_user(user)
        return render_template(
            "edit_user.html",
            user=user,
            patterns=patterns,
        )
    except HTTPException:
        raise
    except Exception:
        logging.exception("failed to get user")
        abort(500, description="Failed to get user")


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
                    darkmode=False,
                    verified=False,
                    disabled=False,
                    locale=str(locale),
                    timezone=str(tz),
                    verification_code=secrets.token_urlsafe(30),
                    create_date=datetime.datetime.now(),
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

            user.access_date = datetime.datetime.now()
            db.session.commit()

            return redirect(url_for("user", user_name=user.name))

        flash(error)

    return render_template("login.html")


@app.route("/auth/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/auth/verify/<string:user_name>/<string:verification_code>")
def verify(user_name, verification_code):
    try:
        user = User.query.filter(User.name == user_name).first()
        if not user:
            return render_template("verification_failed.html")
        if user.verified:
            return render_template("verification_successful.html")
        if user.verification_code != verification_code:
            logging.error(
                f"verification, expected {user.verification_ocde} "
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
        except Exception:
            error = gettext("System error")

        if error is None:
            try:
                user.verification_code = secrets.token_urlsafe(30)
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
        if user.verification_code != verification_code:
            return render_template("recover_failed.html")

        if request.method == "POST":
            error = None
            password = request.form["password"]
            if not password:
                error = gettext("Password is required.")

            if error is None:
                try:
                    user.password = generate_password_hash(password)
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
            .join(User)
            .filter(Pattern.name == pattern_name)
            .filter(User.name == user_name)
            .first()
        )
        if not pattern:
            return respond("NOK", "Pattern not found", 404)
        superuser = g.user and g.user.name == "superuser"
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
            .join(User)
            .filter(Pattern.name == pattern_name)
            .filter(User.name == user_name)
            .first()
        )
        if not pattern:
            return respond("NOK", "Pattern not found", 404)
        superuser = g.user and g.user.name == "superuser"
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
            pattern.contents = json.dumps(data["contents"])
            pattern.modified = datetime.datetime.utcnow()
            db.session.commit()
            return jsonify({"status": "OK"}), 200
        elif action == "clone-pattern":
            if not g.user:
                return respond("NOK", "Invalid user", 403)
            contents = json.dumps(data["contents"])
            clone_pattern(g.user, pattern, contents)
            return jsonify({"status": "OK"}), 200
        else:
            return respond("NOK", "Illegal action", 400)
    except HTTPException:
        raise
    except Exception:
        logging.exception("Failed to update pattern")
        return respond("NOK", "Failed to update pattern", 500)

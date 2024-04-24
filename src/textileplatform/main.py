from textileplatform.auth import login_required
from textileplatform.beadpattern import parse_jbb_data
from textileplatform.models import db
from textileplatform.models import User
from textileplatform.models import Pattern
from textileplatform.models import Group
from textileplatform.models import add_weave_pattern
from textileplatform.models import add_bead_pattern
from textileplatform.models import get_patterns_for_user
from textileplatform.name import from_label
from textileplatform.palette import default_weave_palette
from textileplatform.palette import default_bead_palette
from textileplatform.weavepattern import parse_dbw_data

from importlib.metadata import version
import json
import logging
import os

from flask import Blueprint
from flask import abort
from flask import flash
from flask import g
from flask import redirect
from flask import render_template
from flask import request
from flask import url_for
from flask_babel import gettext
from werkzeug.exceptions import HTTPException


bp = Blueprint("main", __name__)


@bp.route("/")
def index():
    try:
        weave_user = User.query.filter(User.name == "weave").first()
        weave_patterns = get_patterns_for_user(weave_user, True)
        bead_user = User.query.filter(User.name == "bead").first()
        bead_patterns = get_patterns_for_user(bead_user, True)
        return render_template(
            "main/index.html",
            weave_patterns=weave_patterns,
            bead_patterns=bead_patterns,
        )
    except HTTPException:
        raise
    except Exception:
        logging.exception("system error")
        abort(500)


@bp.route("/<string:user_name>")
def user(user_name):
    user = User.query.filter(User.name == user_name.lower()).first()
    if not user:
        return redirect(url_for("main.index"))
    elif g.user and g.user.name == user.name:
        # show private view
        patterns = get_patterns_for_user(g.user)
        return render_template(
            "main/user_private.html",
            user=user,
            patterns=patterns,
        )
    else:
        # show public view
        patterns = get_patterns_for_user(user, True)
        return render_template(
            "main/user_public.html",
            user=user,
            patterns=patterns,
        )


@bp.route("/groups")
def edit_groups():
    return render_template(
        "main/edit_groups.html",
        user=g.user,
        groups=g.user.groups,
    )


@bp.route("/add-group", methods=("GET", "POST"))
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
            group.owner = g.user
            db.session.add(group)
            g.user.groups.append(group)
            db.session.commit()
            # TODO errorhandling
            return redirect(url_for("main.edit_groups", user_name=g.user.name))
    return render_template("main/add_group.html")


@bp.route("/<string:user_name>/<string:pattern_name>")
def edit_pattern(user_name, pattern_name):
    user = User.query.filter(User.name == user_name.lower()).first()
    if not user:
        return redirect(url_for("main.index"))
    pattern = (
        Pattern.query
        .join(User)
        .filter(Pattern.name == pattern_name)
        .filter(User.name == user_name.lower())
        .first()
    )
    if not pattern:
        return redirect(url_for("main.user", user_name=user_name))
    readonly = not g.user or g.user.name != user.name
    if readonly and not pattern.public:
        return redirect(url_for("main.user", user_name=user_name))
    pattern.pattern = json.loads(pattern.contents)
    if pattern.pattern_type.pattern_type == "DB-WEAVE Pattern":
        return render_template(
            "main/edit_dbweave_pattern.html",
            user=user,
            pattern=pattern,
            readonly=readonly,
        )
    elif pattern.pattern_type.pattern_type == "JBead Pattern":
        return render_template(
            "main/edit_jbead_pattern.html",
            user=user,
            pattern=pattern,
            readonly=readonly,
        )
    else:
        return redirect(url_for("main.user", user_name=user.name))


@bp.route("/status")
def status():
    try:
        v = version("textileplatform")
    except Exception:
        v = "-"
    return render_template("main/status.html", v=v)


@bp.route("/profile", methods=("GET", "POST"))
@login_required
def profile():
    if request.method == "POST":
        email = request.form["email"]
        darkmode = "darkmode" in request.form
        user = g.user
        user.email = email
        # TODO reset verified?!
        user.darkmode = darkmode
        try:
            db.session.commit()
            return redirect(url_for("main.user", user_name=user.name))
        except Exception:
            logging.exception("Profile changes not changed")
            flash(gettext("Changes could not be saved"))

    return render_template("main/profile.html", user=g.user)


@bp.route("/upload", methods=("GET", "POST"))
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
                pass  # TODO import generic pattern (e.g. image)
        return redirect(url_for("main.user", user_name=g.user.name))
    return render_template("main/upload_pattern.html", user=g.user)


@bp.route("/create", methods=("GET", "POST"))
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
                    return redirect(url_for("main.edit_pattern",
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
            pattern["colors"] = default_bead_palette

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
                    return redirect(url_for("main.edit_pattern",
                                            user_name=g.user.name,
                                            pattern_name=name))
                except HTTPException:
                    raise
                except Exception:
                    logging.exception("Failed to create pattern")
                    flash(gettext("Failed to create pattern"))

    return render_template("main/create_pattern.html", user=g.user)


@bp.route("/delete/<string:pattern_name>", methods=("GET", "POST"))
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
        return redirect(url_for("main.user", user_name=g.user.name))

    if request.method == "POST":
        error = None

        try:
            db.session.delete(pattern)
            db.session.commit()
        except Exception:
            logging.exception("Pattern could not be deleted")
            error = gettext("Pattern could not be deleted.")
        else:
            return redirect(url_for("main.user", user_name=g.user.name))

        flash(error)

    return render_template("main/delete_pattern.html", pattern=pattern)

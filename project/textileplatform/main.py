import os

from importlib.metadata import version
from sqlalchemy.exc import IntegrityError
from flask_babel import gettext

from flask import (
    Blueprint, flash, g, redirect, render_template, render_template_string, request, url_for
)

bp = Blueprint('main', __name__)

from textileplatform.persistence import (
    update_user, 
    get_user_by_name, 
    add_weave_pattern,
    add_bead_pattern,
    get_patterns_for_userid,
    get_pattern_by_name
)
from textileplatform.model import (
    get_type_label,
    TYPE_DBWEAVE_PATTERN,
    TYPE_JBEAD_PATTERN,
    TYPE_GENERIC_IMAGE
)
from textileplatform.auth import login_required
from textileplatform.weavepattern import parse_dbw_data
from textileplatform.beadpattern import parse_jbb_data


@bp.route('/')
def index():
    if g.user:
        patterns = get_patterns_for_userid(g.user.id)
        return render_template('main/user_private.html', user=g.user, patterns=patterns)
    return render_template('main/index.html')


@bp.route('/<string:name>')
def user(name):
    user = get_user_by_name(name.lower())
    if not user:
        return redirect(url_for('main.index'))
    elif g.user and g.user.name == user.name:
        # show private view
        patterns = get_patterns_for_userid(g.user.id)
        return render_template('main/user_private.html', user=user, patterns=patterns)
    else:
        # show public view
        patterns = [pattern for pattern in get_patterns_for_userid(user.id) if pattern.public]
        return render_template('main/user_public.html', user=user, patterns=patterns)


@bp.route('/<string:user_name>/<string:pattern_name>')
def edit_pattern(user_name, pattern_name):
    user = get_user_by_name(user_name.lower())
    if not user:
        return redirect(url_for('main.index'))
    elif g.user and g.user.name == user.name:
        pattern = get_pattern_by_name(user.id, pattern_name)
        if not pattern:
            return redirect(url_for('main.user', name=user_name))
        if pattern.type_id == TYPE_DBWEAVE_PATTERN:
            return render_template('main/edit_dbweave_pattern.html', user=user, pattern=pattern)
        elif pattern.type_id == TYPE_JBEAD_PATTERN:
            return render_template('main/edit_jbead_pattern.html', user=user, pattern=pattern)
        elif pattern.type_id == TYPE_GENERIC_IMAGE_PATTERN:
            return render_template('main/edit_generic_image_pattern.html', user=user, pattern=pattern)
        else:
            return redirect(url_for('main.user'), name=user_name)
    else:
        return redirect(url_for('main.user', name=user_name))


@bp.route('/status')
def status():
    try:
        v = version('textileplatform')
    except Exception:
        v = "-"
    return render_template('main/status.html', v = v)


@bp.route('/profile', methods=('GET', 'POST'))
@login_required
def profile():
    if request.method == 'POST':
        email = request.form['email']
        darkmode = 'darkmode' in request.form
        
        user = g.user
        user.email = email
        # TODO reset verified?!
        user.darkmode = darkmode

        error = None
        
        try:
            update_user(user)
        except IntegrityError as e:
            app.logger.exception("Profile changes not changed")
            error = gettext('Changes could not be saved.')
        else:
            return redirect(url_for("main.user", name=user.name))

        flash(error)

    return render_template('main/profile.html', user=g.user)


@bp.route('/upload', methods=('GET', 'POST'))
@login_required
def upload_pattern():
    if request.method == 'POST':
        name = request.form['name']
        file = request.files['file']
        name = name.replace("..", "").replace("/", "").replace("\\", "")
        if not name:
            if file.filename:
                name = os.path.splitext(file.filename)[0]
            else:
                name = "unnamed"

        filetype = "generic"
        if file.filename.endswith(".dbw"):
            filetype = "dbw"
        elif file.filename.endswith(".jbb"):
            filetype = "jbb"
        bytedata = file.read()
        data = bytedata.decode("latin-1", "ignore")
        if data.startswith("@dbw3:"):
            filetype = "dbw"
        elif data.startswith("(jbb"):
            filetype = "jbb"

        if filetype == "dbw":
            add_weave_pattern(parse_dbw_data(data, name), g.user.id)
        elif filetype == "jbb":
            add_bead_pattern(parse_jbb_data(data, name), g.user.id)
        else:
            pass

        return redirect(url_for("main.user", name=g.user.name))

    return render_template('main/upload_pattern.html')


@bp.route('/create', methods=('GET', 'POST'))
@login_required
def create_pattern():
    if request.method == 'POST':
        pass

    return render_template('main/create_pattern.html')


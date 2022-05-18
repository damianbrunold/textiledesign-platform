import json
import os

from importlib.metadata import version
from sqlalchemy.exc import IntegrityError
from flask_babel import gettext

from flask import (
    Blueprint,
    flash,
    g,
    current_app,
    redirect,
    render_template,
    request,
    url_for
)

from textileplatform.palette import default_weave_palette
from textileplatform.beadpattern import parse_jbb_data
from textileplatform.weavepattern import parse_dbw_data
from textileplatform.auth import (
    login_required,
)
from textileplatform.persistence import (
    update_user,
    get_user_by_name,
    add_weave_pattern,
    add_bead_pattern,
    get_patterns_for_user_name,
    get_pattern_by_name,
    delete_pattern,
)

bp = Blueprint('main', __name__)


@bp.route('/')
def index():
    if g.user:
        patterns = get_patterns_for_user_name(g.user.name)
        return render_template('main/user_private.html',
                               user=g.user,
                               patterns=patterns)
    else:
        weave_patterns = get_patterns_for_user_name("weave", True)
        bead_patterns = get_patterns_for_user_name("bead", True)
        return render_template('main/index.html',
                               weave_patterns=weave_patterns,
                               bead_patterns=bead_patterns)


@bp.route('/<string:name>')
def user(name):
    user = get_user_by_name(name.lower())
    if not user:
        return redirect(url_for('main.index'))
    elif g.user and g.user.name == user.name:
        # show private view
        patterns = get_patterns_for_user_name(g.user.name)
        return render_template('main/user_private.html',
                               user=user,
                               patterns=patterns)
    else:
        # show public view
        patterns = get_patterns_for_user_name(user.name, True)
        return render_template('main/user_public.html',
                               user=user,
                               patterns=patterns)


@bp.route('/<string:user_name>/<string:pattern_name>')
def edit_pattern(user_name, pattern_name):
    user = get_user_by_name(user_name.lower())
    if not user:
        return redirect(url_for('main.index'))
    pattern = get_pattern_by_name(user.name, pattern_name)
    if not pattern:
        return redirect(url_for('main.user', name=user_name))
    if (not g.user or g.user.name != user.name) and not pattern.public:
        return redirect(url_for('main.user', name=user_name))
    readonly = not g.user or g.user.name != user.name
    pattern.pattern = json.loads(pattern.contents)
    if pattern.pattern_type == "DB-WEAVE Pattern":
        return render_template('main/edit_dbweave_pattern.html',
                               user=user,
                               pattern=pattern,
                               readonly=readonly)
    elif pattern.pattern_type == "JBead Pattern":
        return render_template('main/edit_jbead_pattern.html',
                               user=user,
                               pattern=pattern,
                               readonly=readonly)
    else:
        return redirect(url_for('main.user'), name=user_name)


@bp.route('/status')
def status():
    try:
        v = version('textileplatform')
    except Exception:
        v = "-"
    return render_template('main/status.html', v=v)


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
        except IntegrityError:
            current_app.logger.exception("Profile changes not changed")
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
        name = name.replace("..", "").replace("/", "").replace("\\", "")
        files = request.files.getlist('file')
        for idx, file in enumerate(files):
            if not name or len(files) > 1:
                if file.filename:
                    name = os.path.splitext(file.filename)[0]
                else:
                    name = f"unnamed {idx+1}"

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
                add_weave_pattern(parse_dbw_data(data, name), g.user.name)
            elif filetype == "jbb":
                add_bead_pattern(parse_jbb_data(data, name), g.user.name)
            else:
                pass

        return redirect(url_for("main.user", name=g.user.name))

    return render_template('main/upload_pattern.html')


@bp.route('/create', methods=('GET', 'POST'))
@login_required
def create_pattern():
    if request.method == 'POST':
        if request.form['pattern_type'] == "DB-WEAVE Pattern":
            name = request.form['name']
            width = request.form['width']
            height = request.form['height']

            # TODO validate width and height
            width = int(width)
            height = int(height)

            pattern = dict()
            pattern['name'] = name
            pattern['author'] = g.user.label
            pattern['organization'] = ""
            pattern['notes'] = ""

            pattern['width'] = width
            pattern['height'] = height
            pattern['max_shafts'] = 32
            pattern['max_treadles'] = 32

            pattern['data_entering'] = [0] * width
            pattern['data_tieup'] = [0] * \
                (pattern['max_shafts'] * pattern['max_treadles'])
            pattern['data_treadling'] = [0] * \
                (pattern['max_treadles'] * height)
            pattern['data_reed'] = ([0, 0, 1, 1] * ((width + 3) // 4))[0:width]

            # TODO use user default color
            pattern['colors_warp'] = [55] * width
            # TODO use user default color
            pattern['colors_weft'] = [49] * height

            # TODO use user default palette?
            pattern['palette'] = default_weave_palette

            pattern['visible_shafts'] = 12
            pattern['visible_treadles'] = 12
            pattern['warp_lifting'] = True
            pattern['zoom'] = 3
            pattern['single_treadling'] = True
            pattern['show_repeat'] = False

            pattern['display_reed'] = True
            pattern['display_colors_warp'] = True
            pattern['display_colors_weft'] = True

            pattern['weave_style'] = 'draft'
            pattern['entering_style'] = 'filled'  # TODO use user defaults
            pattern['treadling_style'] = 'filled'  # TODO use user defaults
            pattern['tieup_style'] = 'filled'  # TODO use user defaults

            # TODO handle exceptions (e.g. due to duplicate name!)
            add_weave_pattern(pattern, g.user.name)

            return redirect(url_for("main.edit_pattern",
                                    user_name=g.user.name,
                                    pattern_name=name))
        elif request.form['pattern_type'] == "JBead Pattern":
            label = request.form['name']
            name = label.replace("..", "").replace("/", "").replace("\\", "")
            width = request.form['width']
            height = request.form['height']

            # TODO

            return redirect(url_for("main.edit_pattern",
                                    user_name=g.user.name,
                                    pattern_name=name))

    return render_template('main/create_pattern.html')


@bp.route('/delete/<string:pattern_name>', methods=('GET', 'POST'))
@login_required
def delete(pattern_name):
    pattern = get_pattern_by_name(g.user.name, pattern_name)
    if not pattern:
        return redirect(url_for('main.user', name=g.user.name))

    if request.method == 'POST':
        error = None

        try:
            delete_pattern(g.user.name, pattern)
        except Exception:
            error = gettext('Pattern could not be deleted.')
        else:
            return redirect(url_for("main.user", name=g.user.name))

        flash(error)

    return render_template('main/delete_pattern.html', pattern=pattern)

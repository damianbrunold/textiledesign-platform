import os

from importlib.metadata import version
from sqlalchemy.exc import IntegrityError
from flask_babel import gettext

from flask import (
    Blueprint,
    flash,
    g,
    redirect,
    render_template,
    render_template_string,
    request,
    url_for
)

bp = Blueprint('main', __name__)

from textileplatform.persistence import (
    update_user, 
    get_user_by_name, 
    add_weave_pattern,
    add_bead_pattern,
    get_patterns_for_user_name,
    get_pattern_by_name
)
from textileplatform.auth import login_required
from textileplatform.weavepattern import parse_dbw_data
from textileplatform.beadpattern import parse_jbb_data


@bp.route('/')
def index():
    if g.user:
        patterns = get_patterns_for_user_name(g.user.name)
        return render_template('main/user_private.html', user=g.user, patterns=patterns)
    else:
        weave_patterns = get_patterns_for_user_name("weave")
        bead_patterns = get_patterns_for_user_name("bead")
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
        return render_template('main/user_private.html', user=user, patterns=patterns)
    else:
        # show public view
        patterns = [pattern for pattern in get_patterns_for_user_name(user.name) if pattern.public]
        return render_template('main/user_public.html', user=user, patterns=patterns)


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
        pass

    return render_template('main/create_pattern.html')

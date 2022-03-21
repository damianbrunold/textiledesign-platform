from importlib.metadata import version
from sqlalchemy.exc import IntegrityError

from flask import (
    Blueprint, flash, g, redirect, render_template, render_template_string, request, url_for
)

bp = Blueprint('main', __name__)

from textileplatform.persistence import update_user
from textileplatform.auth import login_required


@bp.route('/')
def index():
    return render_template('main/index.html')


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
        name = request.form['name']
        darkmode = 'darkmode' in request.form
        
        user = g.user
        user.name = name
        user.darkmode = darkmode

        error = None
        
        try:
            update_user(user)
        except IntegrityError as e:
            app.logger.exception("Profile changes not changed")
            error = f"Änderungen können nicht gespeichert werden."
        else:
            return redirect(url_for("main.index"))

        flash(error)

    return render_template('main/profile.html', user=g.user)


from textileplatform.auth import login_required
from textileplatform.auth import superuser_required
from textileplatform.persistence import get_all_users
from textileplatform.persistence import get_user_by_name
from textileplatform.persistence import get_patterns_for_user

from flask import Blueprint
from flask import render_template

bp = Blueprint('admin', __name__, url_prefix="/admin")


@bp.route('/users')
@login_required
@superuser_required
def users():
    all_users = get_all_users()
    return render_template('admin/users.html', users=all_users)


@bp.route('/users/<string:user_name>')
@login_required
@superuser_required
def edit_user(user_name):
    user = get_user_by_name(user_name)
    patterns = get_patterns_for_user(user)
    return render_template(
        'admin/edit_user.html',
        user=user,
        patterns=patterns,
    )

from flask import (
    Blueprint,
    render_template,
)

from textileplatform.auth import (
    login_required,
    superuser_required,
)
from textileplatform.persistence import (
    get_all_users,
)

bp = Blueprint('admin', __name__, url_prefix="/admin")


@bp.route('/users')
@login_required
@superuser_required
def users():
    all_users = get_all_users()
    print(len(all_users))
    return render_template('admin/users.html', users=all_users)


@bp.route('/users/<string:user_name>')
@login_required
@superuser_required
def edit_user(user_name):
    pass

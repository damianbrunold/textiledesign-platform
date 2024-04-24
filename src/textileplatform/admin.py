from textileplatform.auth import login_required
from textileplatform.auth import superuser_required
from textileplatform.models import User
from textileplatform.models import get_patterns_for_user

import logging

from flask import abort
from flask import Blueprint
from flask import render_template
from werkzeug.exceptions import HTTPException

bp = Blueprint("admin", __name__, url_prefix="/admin")


@bp.route("/users")
@login_required
@superuser_required
def users():
    try:
        all_users = User.query.order_by(User.name).all()
        return render_template("admin/users.html", users=all_users)
    except HTTPException:
        raise
    except Exception:
        logging.exception("failed to get all users")
        abort(500, description="Failed to get all users")


@bp.route("/users/<string:user_name>")
@login_required
@superuser_required
def edit_user(user_name):
    try:
        user = User.query.filter(User.name == user_name).first()
        if not user:
            abort(404, description=f"User {user_name} not found")
        patterns = get_patterns_for_user(user)
        return render_template(
            "admin/edit_user.html",
            user=user,
            patterns=patterns,
        )
    except HTTPException:
        raise
    except Exception:
        logging.exception("failed to get user")
        abort(500, description="Failed to get user")

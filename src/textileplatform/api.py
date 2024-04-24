from textileplatform.models import db
from textileplatform.models import clone_pattern
from textileplatform.models import Pattern
from textileplatform.models import User

import datetime
import json
import logging

from flask import Blueprint
from flask import request
from flask import jsonify
from flask import g
from werkzeug.exceptions import HTTPException


bp = Blueprint("api", __name__, url_prefix="/api")


def respond(status, message, status_code=500):
    return jsonify({"status": status, "message": message}), status_code


@bp.route("/pattern/<user_name>/<pattern_name>")
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
        if not pattern.public and (not g.user or user.name != g.user.name):
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


@bp.route("/pattern/<user_name>/<pattern_name>", methods=("PUT",))
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
        if not pattern.public and (not g.user or user.name != g.user.name):
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
            clone_pattern(g.user.name, pattern, contents)
            return jsonify({"status": "OK"}), 200
        else:
            return respond("NOK", "Illegal action", 400)
    except HTTPException:
        raise
    except Exception:
        logging.exception("Failed to update pattern")
        return respond("NOK", "Failed to update pattern", 500)

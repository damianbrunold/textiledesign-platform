import datetime
import json

from flask import Blueprint
from flask import request
from flask import make_response
from flask import jsonify
from flask import g

from textileplatform.db import db
from textileplatform.persistence import get_user_by_name
from textileplatform.persistence import get_pattern_by_name
from textileplatform.persistence import clone_pattern

bp = Blueprint('api', __name__, url_prefix='/api')


def respond(status, message, status_code=500):
    return make_response(
        jsonify({"status": status, "message": message}),
        status_code
    )


@bp.route('/pattern/<string:user_name>/<string:pattern_name>',
          methods=('GET', 'PUT'))
def pattern(user_name, pattern_name):
    user = get_user_by_name(user_name)
    if not user:
        return respond("NOK", "User not found")

    pattern = get_pattern_by_name(user.name, pattern_name)
    if not pattern:
        return respond("NOK", "Pattern not found")

    if not pattern.public and (not g.user or user.name != g.user.name):
        return respond("NOK", "Invalid user")

    if request.method == "GET":
        return get_pattern(pattern)
    elif request.method == "PUT":
        data = request.get_json()
        action = data['action']
        if action == 'set-publication-state':
            if not g.user or user.name != g.user.name:
                return respond("NOK", "Invalid user")
            return set_publication_state(pattern, data['publication_state'])
        elif action == 'save-pattern':
            if not g.user or user.name != g.user.name:
                return respond("NOK", "Invalid user")
            return save_pattern(pattern, data['contents'])
        elif action == 'clone-pattern':
            if not g.user:
                return respond("NOK", "Invalid user")
            contents = json.dumps(data['contents'])
            clone_pattern(g.user.name, pattern, contents)
            return make_response(jsonify({"status": "OK"}), 200)
        else:
            return respond("NOK", "Illegal action")
    else:
        return respond("NOK", "Unsupported method")


def get_pattern(pattern):
    contents = json.loads(pattern.contents)
    return make_response(jsonify({
        "status": "OK",
        "pattern": contents
    }), 200)


def set_publication_state(pattern, publication_state):
    pattern.public = publication_state
    db.session.commit()
    return make_response(jsonify({"status": "OK"}), 200)


def save_pattern(pattern, contents):
    pattern.contents = json.dumps(contents)
    pattern.modified = datetime.datetime.utcnow()
    db.session.commit()
    return make_response(jsonify({"status": "OK"}), 200)

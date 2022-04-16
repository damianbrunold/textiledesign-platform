import json

from sqlalchemy import update

from flask import (
    Blueprint,
    request,
    make_response,
    jsonify,
    g,
)

from textileplatform.db import get_db, document_table
from textileplatform.persistence import (
        get_user_by_name,
        get_pattern_by_name,
        update_pattern
)
from textileplatform.auth import login_required

bp = Blueprint('api', __name__, url_prefix='/api')


@bp.route('/pattern/<string:user_name>/<string:pattern_name>', methods=('GET', 'PUT'))
@login_required
def pattern(user_name, pattern_name):
    user = get_user_by_name(user_name)
    if not user:
        return make_response(jsonify({"status": "NOK", "message": "User not found"}), 500)
    if user.id != g.user.id:
        return make_response(jsonify({"status": "NOK", "message": "Invalid user"}), 500)
    
    pattern = get_pattern_by_name(user.id, pattern_name)
    if not pattern:
        return make_response(jsonify({"status": "NOK", "message": "Pattern not found"}), 500)

    if request.method == "GET":
        return get_pattern(pattern)
    elif request.method == "PUT":
        data = request.get_json()
        action = data['action']
        if action == 'set-publication-state':
            return set_publication_state(pattern, data['publication_state'])
        elif action == 'save-pattern':
            return save_pattern(pattern, data['contents'])
        else:
            return make_response(jsonify({"status": "NOK", "message": "Illegal action"}), 500)
    else:
        return make_response(jsonify({"status": "NOK", "message": "Unsupported method"}), 500)


def get_pattern(pattern):
    contents = json.loads(pattern.contents)
    return make_response(jsonify({
        "status": "OK",
        "pattern": contents
    }), 200)


def set_publication_state(pattern, publication_state):
    with get_db().begin() as conn:
        conn.execute(
            update(document_table).values(
                public=publication_state
            ).where(document_table.c.id == pattern.id)
        )
    return make_response(jsonify({"status": "OK"}), 200)


def save_pattern(pattern, contents):
    pattern.contents = json.dumps(contents)
    update_pattern(pattern)
    return make_response(jsonify({"status": "OK"}), 200)

from sqlalchemy import update

from flask import (
    Blueprint,
    request,
    make_response,
    jsonify,
)

from textileplatform.db import get_db, document_table
from textileplatform.persistence import (
        get_user_by_name,
        get_pattern_by_name,
)
from textileplatform.auth import login_required

bp = Blueprint('api', __name__, url_prefix='/api')

@bp.route('/pattern/publish', methods=('POST', ))
@login_required
def pattern_publish():
    req = request.get_json()
    user_name = req['user']
    pattern_name = req['pattern']
    publication_state = req['publication_state']

    user = get_user_by_name(user_name)
    if not user:
        return make_response(jsonify({"status": "NOK", "message": "User not found"}), 500)

    pattern = get_pattern_by_name(user.id, pattern_name)
    if not pattern:
        return make_response(jsonify({"status": "NOK", "message": "Pattern not found"}), 500)

    with get_db().begin() as conn:
        conn.execute(
            update(document_table).values(
                public=publication_state
            ).where(document_table.c.id == pattern.id)
        )

    return make_response(jsonify({"status": "OK"}), 200)

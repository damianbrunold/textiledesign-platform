import datetime
import json

from sqlalchemy.exc import IntegrityError

from textileplatform.db import db
from textileplatform.db import User
from textileplatform.db import Pattern


def clean_name(name):
    return name.replace("..", "").replace("/", "").replace("\\", "")


def add_weave_pattern(pattern, user_name):
    now = datetime.datetime.utcnow()
    db.session.add(Pattern(
        name=clean_name(pattern['name']),
        label=pattern['name'],
        owner=user_name,
        pattern_type="DB-WEAVE Pattern",
        description=pattern['notes'],
        contents=json.dumps(pattern),
        created=now,
        modified=now,
        public=False
    ))
    db.session.commit()


def add_bead_pattern(pattern, user_name):
    now = datetime.datetime.utcnow()
    db.session.add(Pattern(
        name=clean_name(pattern['name']),
        label=pattern['name'],
        owner=user_name,
        pattern_type="JBead Pattern",
        description=pattern['notes'],
        contents=json.dumps(pattern),
        created=now,
        modified=now,
        public=False,
    ))
    db.session.commit()


def get_patterns_for_user_name(user_name, only_public=False):
    query = Pattern.query.filter(Pattern.owner == user_name)
    if only_public:
        query = query.filter(Pattern.public)
    query = query.order_by(Pattern.pattern_type, db.func.lower(Pattern.label))
    return query.all()


def get_pattern_by_name(user_name, name):
    query = Pattern.query.filter(Pattern.owner == user_name)
    query = query.filter(Pattern.name == name)
    return query.first()


def clone_pattern(user_name, pattern, contents):
    suffix = None
    while True:
        if suffix and suffix > 10:
            break
        try:
            now = datetime.datetime.utcnow()
            if suffix:
                name = pattern.name + " - " + str(suffix)
                label = pattern.label + " - " + str(suffix)
            else:
                name = pattern.name
                label = pattern.label
            db.session.add(Pattern(
                name=name,
                label=label,
                owner=user_name,
                pattern_type=pattern.pattern_type,
                description=pattern.description,
                contents=contents,
                preview_image=pattern.preview_image,
                thumbnail_image=pattern.thumbnail_image,
                created=now,
                modified=now,
                public=False,
            ))
            db.session.commit()
            break
        except IntegrityError:
            db.session.rollback()
            if not suffix:
                suffix = 1
            else:
                suffix += 1


def delete_pattern(user_name, pattern):
    db.session.delete(pattern)
    db.session.commit()


def get_user_by_name(name):
    return User.query.filter(User.name == name).first()


def get_user_by_email(email):
    return User.query.filter(User.email == email).first()


def get_all_users():
    return User.query.all()

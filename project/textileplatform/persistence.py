import datetime
import json

from sqlalchemy.exc import IntegrityError

from textileplatform.db import db
from textileplatform.db import User
from textileplatform.db import Pattern
from textileplatform.db import PatternType
from textileplatform.name import from_label


def get_weave_pattern_type():
    return PatternType.query.filter(
        PatternType.pattern_type == "DB-WEAVE Pattern"
    ).first()


def get_bead_pattern_type():
    return PatternType.query.filter(
        PatternType.pattern_type == "JBead Pattern"
    ).first()


def add_weave_pattern(pattern, user):
    suffix = None
    now = datetime.datetime.utcnow()
    while True:
        if suffix and suffix > 10:
            break
        if suffix:
            label = pattern["name"] + " - " + str(suffix)
        else:
            label = pattern["name"]
        name = from_label(label)
        try:
            p = Pattern(
                name=name,
                label=label,
                description=pattern["notes"],
                contents=json.dumps(pattern),
                created=now,
                modified=now,
                public=False
            )
            p.owner = user
            p.pattern_type = get_weave_pattern_type()
            db.session.add(p)
            db.session.commit()
            return name
        except IntegrityError:
            db.session.rollback()
            if suffix:
                suffix += 1
            else:
                suffix = 1


def add_bead_pattern(pattern, user):
    suffix = None
    now = datetime.datetime.utcnow()
    while True:
        if suffix and suffix > 10:
            break
        if suffix:
            label = pattern["name"] + " - " + str(suffix)
        else:
            label = pattern["name"]
        name = from_label(label)
        try:
            p = Pattern(
                name=name,
                label=label,
                description=pattern["notes"],
                contents=json.dumps(pattern),
                created=now,
                modified=now,
                public=False,
            )
            p.owner = user
            p.pattern_type = get_bead_pattern_type()
            db.session.add(p)
            db.session.commit()
            return name
        except IntegrityError:
            db.session.rollback()
            if suffix:
                suffix += 1
            else:
                suffix = 1


def get_patterns_for_user(user, only_public=False):
    if only_public:
        return [p for p in user.mypatterns if p.public]
    return user.mypatterns


def get_pattern_by_name(user, name):
    for pattern in user.mypatterns:
        if pattern.name == name:
            return pattern


def clone_pattern(user, pattern, contents):
    suffix = None
    while True:
        if suffix and suffix > 10:
            break
        try:
            now = datetime.datetime.utcnow()
            if suffix:
                label = pattern.label + " - " + str(suffix)
            else:
                label = pattern.label
            name = from_label(label)
            p = Pattern(
                name=name,
                label=label,
                description=pattern.description,
                contents=contents,
                preview_image=pattern.preview_image,
                thumbnail_image=pattern.thumbnail_image,
                created=now,
                modified=now,
                public=False,
            )
            p.owner = user
            p.pattern_type = pattern.pattern_type
            db.session.add(p)
            db.session.commit()
            break
        except IntegrityError:
            db.session.rollback()
            if not suffix:
                suffix = 1
            else:
                suffix += 1


def delete_pattern(pattern):
    db.session.delete(pattern)
    db.session.commit()


def get_user_by_name(name):
    return User.query.filter(User.name == name).first()


def get_user_by_email(email):
    return User.query.filter(User.email == email).first()


def get_all_users():
    return User.query.all()

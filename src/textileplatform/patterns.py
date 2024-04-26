from textileplatform.db import db
from textileplatform.models import Assignment
from textileplatform.models import Group
from textileplatform.models import Pattern
from textileplatform.name import from_label

import datetime
import json
import logging

from flask import abort
from sqlalchemy.exc import IntegrityError


def add_weave_pattern(pattern, user):
    group = Group.query.filter(Group.name == user.name).one_or_none()
    if not group:
        logging.error(f"User {user.name} does not have primary group")
        abort(500)
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
                pattern_type="DB-WEAVE Pattern",
                contents=json.dumps(pattern),
                created=now,
                modified=now,
                public=False,
                owner=user,
            )
            assignment = Assignment(
                pattern=p,
                group=group,
            )
            db.session.add(p)
            db.session.add(assignment)
            db.session.commit()
            return name
        except IntegrityError:
            db.session.rollback()
            if suffix:
                suffix += 1
            else:
                suffix = 1


def add_bead_pattern(pattern, user):
    group = Group.query.filter(Group.name == user.name).one_or_none()
    if not group:
        logging.error(f"User {user.name} does not have primary group")
        abort(500)
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
                pattern_type="JBead Pattern",
                contents=json.dumps(pattern),
                created=now,
                modified=now,
                public=False,
                owner=user,
            )
            assignment = Assignment(
                pattern=p,
                group=group,
            )
            db.session.add(p)
            db.session.add(assignment)
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
        return (
            Pattern.query
            .filter(Pattern.owner_id == user.id)
            .filter(Pattern.public is True)
            .all()
        )
    else:
        return (
            Pattern.query
            .filter(Pattern.owner_id == user.id)
            .all()
        )


def clone_pattern(user, pattern, contents):
    group = Group.query.filter(Group.name == user.name).one_or_none()
    if not group:
        logging.error(f"User {user.name} does not have primary group")
        abort(500)
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
                pattern_type=pattern.pattern_type,
                contents=contents,
                preview_image=pattern.preview_image,
                thumbnail_image=pattern.thumbnail_image,
                created=now,
                modified=now,
                public=False,
                owner=user,
            )
            assignment = Assignment(
                pattern=p,
                group=group,
            )
            db.session.add(p)
            db.session.add(assignment)
            db.session.commit()
            break
        except IntegrityError:
            db.session.rollback()
            if not suffix:
                suffix = 1
            else:
                suffix += 1

from textileplatform.name import from_label

import datetime
import json

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash as gen_pw_hash


db = SQLAlchemy()


user_group_table = db.Table(
    "txusergroup",
    db.Column(
        "user",
        db.Integer,
        db.ForeignKey("txuser.id"),
        primary_key=True,
    ),
    db.Column(
        "group",
        db.Integer,
        db.ForeignKey("txgroup.id"),
        primary_key=True,
    )
)


user_group_invite_table = db.Table(
    "txusergroupinvite",
    db.Column(
        "user",
        db.Integer,
        db.ForeignKey("txuser.id"),
        primary_key=True,
    ),
    db.Column(
        "group",
        db.Integer,
        db.ForeignKey("txgroup.id"),
        primary_key=True,
    )
)


group_pattern_table = db.Table(
    "txgrouppattern",
    db.Column(
        "group",
        db.Integer,
        db.ForeignKey("txgroup.id"),
        primary_key=True,
    ),
    db.Column(
        "pattern",
        db.Integer,
        db.ForeignKey("txpattern.id"),
        primary_key=True,
    )
)


class User(db.Model):
    __tablename__ = "txuser"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)
    label = db.Column(db.String(50), nullable=False, unique=True)
    email = db.Column(db.String(255), nullable=False, unique=True)
    password = db.Column(db.String(255), nullable=False)
    darkmode = db.Column(db.Boolean)
    verified = db.Column(db.Boolean)
    disabled = db.Column(db.Boolean)
    locale = db.Column(db.String(20))
    timezone = db.Column(db.String(20))
    verification_code = db.Column(db.String(100))

    mygroups = db.relationship("Group", back_populates="owner")
    mypatterns = db.relationship("Pattern", back_populates="owner")

    groups = db.relationship(
        "Group",
        secondary=user_group_table,
        backref=db.backref("users", lazy=True),
    )

    invited_groups = db.relationship(
        "Group",
        secondary=user_group_invite_table,
        backref=db.backref("invited_users", lazy=True),
    )


class Group(db.Model):
    __tablename__ = "txgroup"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)
    label = db.Column(db.String(50), nullable=False, unique=True)
    owner_id = db.Column(db.Integer, db.ForeignKey("txuser.id"))
    description = db.Column(db.Text, nullable=False)

    owner = db.relationship("User", back_populates="mygroups")

    patterns = db.relationship(
        "Pattern",
        secondary=group_pattern_table,
        backref=db.backref("groups", lazy=True),
    )

    def user_label_list(self):
        return ", ".join([user.name for user in self.users])


class Pattern(db.Model):
    __tablename__ = "txpattern"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    label = db.Column(db.String(100), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey("txuser.id"))
    pattern_type_id = db.Column(db.Integer, db.ForeignKey("txpatterntype.id"))
    description = db.Column(db.Text)
    contents = db.Column(db.Text)
    preview_image = db.Column(db.LargeBinary)
    thumbnail_image = db.Column(db.LargeBinary)
    created = db.Column(db.DateTime)
    modified = db.Column(db.DateTime)
    public = db.Column(db.Boolean)

    db.UniqueConstraint(owner_id, name)

    owner = db.relationship("User", back_populates="mypatterns")
    pattern_type = db.relationship("PatternType")


class PatternType(db.Model):
    __tablename__ = "txpatterntype"

    id = db.Column(db.Integer, primary_key=True)
    pattern_type = db.Column(db.String(50), nullable=False, unique=True)


def ensure_db_contents(app):
    with app.app_context():
        if PatternType.query.count() == 0:
            db.session.add(PatternType(pattern_type="DB-WEAVE Pattern"))
            db.session.add(PatternType(pattern_type="JBead Pattern"))
            db.session.add(PatternType(pattern_type="Generic Image"))
            db.session.commit()
        if User.query.count() == 0:
            db.session.add(User(
                name="superuser",
                label="Superuser",
                email="admin@textileplatform.ch",
                darkmode=True,
                verified=True,
                disabled=False,
                locale="en",
                timezone="CET",
                password=gen_pw_hash(app.config["ADMIN_PASSWORD"])
            ))
            db.session.add(User(
                name="weave",
                label="Weave",
                email="weave@textileplatform.ch",
                darkmode=True,
                verified=True,
                disabled=False,
                locale="en",
                timezone="CET",
                password=gen_pw_hash(app.config["ADMIN_PASSWORD"])
            ))
            db.session.add(User(
                name="bead",
                label="Bead",
                email="bead@textileplatform.ch",
                darkmode=True,
                verified=True,
                disabled=False,
                locale="en",
                timezone="CET",
                password=gen_pw_hash(app.config["ADMIN_PASSWORD"])
            ))
            db.session.commit()


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

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash as gen_pw_hash

db = SQLAlchemy()


user_group_table = db.Table(
    "txusergroup",
    db.Column(
        "user",
        db.String(100),
        db.ForeignKey("txuser.name"),
        primary_key=True,
    ),
    db.Column(
        "group",
        db.String(100),
        db.ForeignKey("txgroup.name"),
        primary_key=True,
    )
)


class User(db.Model):
    __tablename__ = "txuser"

    name = db.Column(db.String(100), primary_key=True)
    label = db.Column(db.String(255), nullable=False, unique=True)
    email = db.Column(db.String(255), nullable=False, unique=True)
    password = db.Column(db.String(255), nullable=False)
    darkmode = db.Column(db.Boolean)
    verified = db.Column(db.Boolean)
    disabled = db.Column(db.Boolean)
    locale = db.Column(db.String(20))
    timezone = db.Column(db.String(20))
    verification_code = db.Column(db.String(100))

    groups = db.relationship(
        "Group",
        secondary=user_group_table,
        backref=db.backref("users", lazy=True),
    )


class Group(db.Model):
    __tablename__ = "txgroup"

    name = db.Column(db.String(100), primary_key=True)
    label = db.Column(db.String(255), nullable=False, unique=True)
    owner = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=False)


class Pattern(db.Model):
    __tablename__ = "txpattern"

    name = db.Column(db.String(100), primary_key=True)
    owner = db.Column(db.String(100), primary_key=True)
    label = db.Column(db.String(255), nullable=False)
    pattern_type = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    contents = db.Column(db.Text)
    preview_image = db.Column(db.LargeBinary)
    thumbnail_image = db.Column(db.LargeBinary)
    created = db.Column(db.DateTime)
    modified = db.Column(db.DateTime)
    public = db.Column(db.Boolean)

    db.UniqueConstraint(owner, label)


class Permission(db.Model):
    __tablename__ = "txpermission"

    pattern = db.Column(db.String(100), primary_key=True)
    user = db.Column(db.String(100), primary_key=True)
    view = db.Column(db.Boolean)
    edit = db.Column(db.Boolean)
    delete = db.Column(db.Boolean)
    share = db.Column(db.Boolean)
    publish = db.Column(db.Boolean)


class PatternType(db.Model):
    __tablename__ = "txtype"

    pattern_type = db.Column(db.String(100), primary_key=True)


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

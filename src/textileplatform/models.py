from textileplatform.db import db

from werkzeug.security import generate_password_hash as gen_pw_hash


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
    block_invitations = db.Column(db.Boolean)
    locale = db.Column(db.String(20))
    timezone = db.Column(db.String(20))
    verification_code = db.Column(db.String(100))

    memberships = db.relationship("Membership", back_populates="user")
    mypatterns = db.relationship(
        "Pattern",
        back_populates="owner",
        order_by="Pattern.name",
    )


class Membership(db.Model):
    __tablename__ = "txmembership"

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey("txgroup.id"))
    user_id = db.Column(db.Integer, db.ForeignKey("txuser.id"))
    role = db.Column(db.String(10))  # owner, writer, reader
    state = db.Column(db.String(10))  # invited, accepted, declined

    user = db.relationship("User", back_populates="memberships")
    group = db.relationship("Group", back_populates="memberships")


class Group(db.Model):
    __tablename__ = "txgroup"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)
    label = db.Column(db.String(50), nullable=False, unique=True)
    description = db.Column(db.Text, nullable=False)

    memberships = db.relationship("Membership", back_populates="group")
    assignments = db.relationship("Assignment", back_populates="group")

    def user_label_list(self):
        return ", ".join([user.name for user in self.users])


class Assignment(db.Model):
    __tablename__ = "txassignment"

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey("txgroup.id"))
    pattern_id = db.Column(db.Integer, db.ForeignKey("txpattern.id"))

    group = db.relationship("Group", back_populates="assignments")
    pattern = db.relationship("Pattern", back_populates="assignments")


class Pattern(db.Model):
    __tablename__ = "txpattern"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    label = db.Column(db.String(100), nullable=False)
    owner_id = db.Column(db.Integer, db.ForeignKey("txuser.id"))
    pattern_type = db.Column(db.String(50))  # DB-WEAVE Pattern, JBead Pattern
    description = db.Column(db.Text)
    contents = db.Column(db.Text)
    preview_image = db.Column(db.LargeBinary)
    thumbnail_image = db.Column(db.LargeBinary)
    created = db.Column(db.DateTime)
    modified = db.Column(db.DateTime)
    public = db.Column(db.Boolean)

    db.UniqueConstraint(owner_id, name)

    owner = db.relationship("User", back_populates="mypatterns")
    assignments = db.relationship("Assignment", back_populates="pattern")


def ensure_db_contents(app):
    with app.app_context():
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
            db.session.commit()
        for user in User.query.all():
            group = Group.query.filter(Group.name == user.name).one_or_none()
            if not group:
                # Create default group for user and assign all owned
                # patterns to the group
                group = Group(
                    name=user.name,
                    label=user.label,
                    description="",
                )
                db.session.add(group)
                membership = Membership(
                    group=group,
                    user=user,
                )
                db.session.add(membership)
                for pattern in user.mypatterns:
                    assignment = Assignment(
                        group=group,
                        pattern=pattern,
                    )
                    db.session.add(assignment)
                db.session.commit()

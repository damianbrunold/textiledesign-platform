from textileplatform.db import db


class User(db.Model):
    __tablename__ = "txuser"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)
    label = db.Column(db.String(50), nullable=False, unique=True)
    email = db.Column(db.String(255), nullable=False, unique=True)
    email_lower = db.Column(db.String(255), nullable=True, unique=True)
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

    def is_in_group(self, group_id):
        for m in self.memberships:
            if m.group.id == group_id:
                return True
        return False


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
        users = [membership.user.label for membership in self.memberships]
        return ",".join(sorted(users))

    def contains_user(self, user_id):
        for m in self.memberships:
            if m.user.id == user_id:
                return True
        return False

    def is_assigned(self, pattern):
        for assignment in self.assignments:
            if assignment.pattern.id == pattern.id:
                return True
        return False

    def weave_patterns(self, public=False):
        if public:
            result = [
                assignment.pattern
                for assignment in self.assignments
                if assignment.pattern.pattern_type == "DB-WEAVE Pattern"
                and assignment.pattern.public
            ]
        else:
            result = [
                assignment.pattern
                for assignment in self.assignments
                if assignment.pattern.pattern_type == "DB-WEAVE Pattern"
            ]
        return sorted(
            result,
            key=lambda pattern: (pattern.owner.label, pattern.label)
        )

    def bead_patterns(self, public=False):
        if public:
            result = [
                assignment.pattern
                for assignment in self.assignments
                if assignment.pattern.pattern_type == "JBead Pattern"
                and assignment.pattern.public
            ]
        else:
            result = [
                assignment.pattern
                for assignment in self.assignments
                if assignment.pattern.pattern_type == "JBead Pattern"
            ]
        return sorted(
            result,
            key=lambda pattern: (pattern.owner.label, pattern.label)
        )

    def other_patterns(self, public=False):
        if public:
            result = [
                assignment.pattern
                for assignment in self.assignments
                if assignment.pattern.pattern_type not in [
                    "DB-WEAVE Pattern",
                    "JBead Pattern",
                ]
                and assignment.pattern.public
            ]
        else:
            result = [
                assignment.pattern
                for assignment in self.assignments
                if assignment.pattern.pattern_type not in [
                    "DB-WEAVE Pattern",
                    "JBead Pattern",
                ]
            ]
        return sorted(
            result,
            key=lambda pattern: (pattern.owner.label, pattern.label)
        )


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

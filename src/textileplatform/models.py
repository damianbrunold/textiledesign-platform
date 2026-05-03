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
    password_reset_code = db.Column(db.String(100))
    password_reset_expires = db.Column(db.DateTime(timezone=True))
    create_date = db.Column(db.DateTime(timezone=True))
    verify_date = db.Column(db.DateTime(timezone=True))
    access_date = db.Column(db.DateTime(timezone=True))

    memberships = db.relationship("Membership", back_populates="user")
    mypatterns = db.relationship(
        "Pattern",
        back_populates="owner",
        order_by="Pattern.name",
        foreign_keys="Pattern.owner_id",
    )

    def is_in_group(self, group_id):
        for m in self.memberships:
            if m.group.id == group_id and m.state == "accepted":
                return True
        return False

    def membership_in(self, group):
        for m in self.memberships:
            if m.group_id == group.id:
                return m
        return None

    def role_in(self, group):
        m = self.membership_in(group)
        if m is None or m.state != "accepted":
            return None
        return m.role

    def is_owner_of(self, group):
        return self.role_in(group) == "owner"

    def can_assign_to(self, group):
        return self.role_in(group) in ("owner", "writer")

    def pending_invitations(self):
        return [m for m in self.memberships if m.state == "invited"]


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

    def accepted_memberships(self):
        return [m for m in self.memberships if m.state == "accepted"]

    def owner_count(self):
        return sum(
            1 for m in self.memberships
            if m.state == "accepted" and m.role == "owner"
        )

    def is_personal(self):
        return any(
            m.user.name == self.name for m in self.memberships
        )

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


class Conversation(db.Model):
    __tablename__ = "txconversation"

    id = db.Column(db.Integer, primary_key=True)
    kind = db.Column(db.String(10), nullable=False)  # "direct", "group"
    group_id = db.Column(
        db.Integer,
        db.ForeignKey("txgroup.id"),
        nullable=True,
        unique=True,
    )
    created = db.Column(db.DateTime(timezone=True))

    group = db.relationship("Group")
    participants = db.relationship(
        "ConversationParticipant",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )
    messages = db.relationship(
        "Message",
        back_populates="conversation",
        order_by="Message.created",
        cascade="all, delete-orphan",
    )

    def participant_user_ids(self):
        if self.kind == "group" and self.group is not None:
            return {
                m.user_id for m in self.group.memberships
                if m.state == "accepted"
            }
        return {p.user_id for p in self.participants}

    def other_user(self, user_id):
        if self.kind != "direct":
            return None
        for p in self.participants:
            if p.user_id != user_id:
                return p.user
        return None


class ConversationParticipant(db.Model):
    __tablename__ = "txconversation_participant"

    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(
        db.Integer,
        db.ForeignKey("txconversation.id"),
        nullable=False,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("txuser.id"),
        nullable=False,
    )
    last_read_at = db.Column(db.DateTime(timezone=True), nullable=True)

    __table_args__ = (
        db.UniqueConstraint(
            "conversation_id", "user_id",
            name="uq_conversation_participant",
        ),
    )

    conversation = db.relationship(
        "Conversation", back_populates="participants",
    )
    user = db.relationship("User")


class Message(db.Model):
    __tablename__ = "txmessage"

    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(
        db.Integer,
        db.ForeignKey("txconversation.id"),
        nullable=False,
        index=True,
    )
    sender_id = db.Column(
        db.Integer,
        db.ForeignKey("txuser.id"),
        nullable=False,
    )
    body = db.Column(db.Text, nullable=False)
    created = db.Column(db.DateTime(timezone=True), nullable=False, index=True)
    deleted = db.Column(db.Boolean, default=False)

    conversation = db.relationship("Conversation", back_populates="messages")
    sender = db.relationship("User")


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
    created = db.Column(db.DateTime(timezone=True))
    modified = db.Column(db.DateTime(timezone=True))
    public = db.Column(db.Boolean)
    # Metadata extracted from contents JSON for fast list rendering.
    author = db.Column(db.String(120))
    organization = db.Column(db.String(120))
    notes = db.Column(db.Text)
    pattern_width = db.Column(db.Integer)
    pattern_height = db.Column(db.Integer)
    rapport_width = db.Column(db.Integer)
    rapport_height = db.Column(db.Integer)
    investigation_origin_user_id = db.Column(
        db.Integer,
        db.ForeignKey("txuser.id", ondelete="SET NULL"),
        nullable=True,
    )
    investigation_origin_pattern_id = db.Column(
        db.Integer,
        db.ForeignKey("txpattern.id", ondelete="SET NULL"),
        nullable=True,
    )
    investigation_origin_label = db.Column(db.String(255), nullable=True)
    investigation_origin_public = db.Column(db.Boolean, nullable=True)

    db.UniqueConstraint(owner_id, name)

    owner = db.relationship(
        "User", back_populates="mypatterns", foreign_keys=[owner_id],
    )
    assignments = db.relationship("Assignment", back_populates="pattern")
    investigation_origin_user = db.relationship(
        "User", foreign_keys=[investigation_origin_user_id]
    )
    investigation_origin_pattern = db.relationship(
        "Pattern",
        remote_side="Pattern.id",
        foreign_keys=[investigation_origin_pattern_id],
    )

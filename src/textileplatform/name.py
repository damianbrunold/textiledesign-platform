import re


def label_from_email(email):
    """Turn an e-mail address into a readable name suggestion, e.g.
    `charlie.chesterton@example.com` -> `Charlie Chesterton`. Keep in
    sync with labelFromEmail() in templates/register.html."""
    local_part = email.split("@", 1)[0]
    words = re.split(r"[._-]+", local_part.split("+", 1)[0])
    words = [word for word in words if word]
    if not words:
        return local_part
    if local_part == local_part.lower():
        words = [word[0].upper() + word[1:] for word in words]
    return " ".join(words)


# Characters that would break or change the meaning of a URL path
# segment (or of the .dbw/.jbb names derived from it).
_UNSAFE = re.compile(r"[\s/\\?#%&<>\"'`:;@=+!]")

# User and group names live at /<name>, next to the app's own routes.
RESERVED_NAMES = frozenset({
    "admin", "api", "auth", "groups", "imprint", "invitations",
    "messages", "patterns", "preview", "privacy", "profile", "static",
    "terms", "thumbnail",
    "support",     # the administrator account (Support)
    "examples",    # example patterns (en)
    "beispiele",   # example patterns (de)
})


def from_label(label):
    """URL handle for a user-visible label: lower case, whitespace and
    underscores become dashes, unsafe characters are dropped."""
    name = label.lower().replace("..", "")
    name = re.sub(r"[\s_]+", "-", name)
    name = _UNSAFE.sub("", name)
    return re.sub(r"-{2,}", "-", name)


def is_valid(name, max_len=100):
    if not name or len(name) > max_len:
        return False
    if _UNSAFE.search(name) or name.strip(".") == "":
        return False
    return name not in RESERVED_NAMES

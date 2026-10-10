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


def from_label(label):
    return (
        label.lower()
        .replace("..", "")
        .replace("/", "")
        .replace("\\", "")
        .replace("@", "")
        .replace(":", "")
        .replace(";", "")
        .replace("?", "")
        .replace("<", "")
        .replace(">", "")
        .replace("&", "")
        .replace(" ", "-")
        .replace("_", "-")
        .replace("\t", "-")
        .replace("\n", "-")
        .replace("\r", "-")
        .replace("----", "-")
        .replace("---", "-")
        .replace("--", "-")
    )


def is_valid(name, max_len=100):
    for ch in "@/\\:?;!<>&=":
        if ch in name:
            return False
    if len(name) > max_len:
        return False
    return name not in [
        "api",
        "admin",
        "groups",
        "patterns",
        "auth",
        "profile",
        "support",    # reserved name for administrator (Support)
        "examples",   # reserved name for examples
    ]

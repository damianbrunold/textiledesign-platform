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
        "patterns",
        "auth",
        "profile",
        "superuser",  # reserved name for administrator
        "weave",      # reserved name for weave examples
        "bead",       # reserved name for bead examples
    ]

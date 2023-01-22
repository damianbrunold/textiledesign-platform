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
        "db",
        "auth",
        "admin",
        "status",
    ]

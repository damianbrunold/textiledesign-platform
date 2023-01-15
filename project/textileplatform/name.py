def from_display(display_name):
    result = display_name.lower()
    result = result.replace(" ", "-")
    result = result.replace("_", "-")
    result = result.replace("\t", "-")
    return result


def is_valid(name):
    for ch in "@/\\:?;!<>&=":
        if ch in name:
            return False
    if len(name) > 100:
        return False
    return name not in [
        "api",
        "db",
        "auth",
        "admin",
        "status",
    ]

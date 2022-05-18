def from_display(display_name):
    result = display_name.lower()
    result = result.replace(" ", "-")
    result = result.replace("_", "-")
    result = result.replace("\t", "-")
    return result


def is_valid(name):
    return name not in [
        "api",
        "db",
        "auth",
        "admin",
        "status",
    ]

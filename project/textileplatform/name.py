def from_display(display_name):
    result = display_name.lower()
    result = result.replace(" ", "-")
    result = result.replace("_", "-")
    result = result.replace("\t", "-")
    return result

def parse_jbb_data(jbbdata, name=''):
    contents = _parse_jbb_into_struct(jbbdata)
    result = dict()
    result['name'] = name
    result['author'] = contents['author']
    result['organization'] = ''
    result['notes'] = contents['notes']
    result['colors'] = contents['colors']
    result['view'] = contents['view']
    result['model'] = contents['model']
    return result


def render_jbb_data(pattern):
    # TODO fill contents as required by jbb format
    # TODO serialize contents
    pass


def _parse_jbb_into_struct(data):
    lines = [line.strip() for line in data.splitlines()
             if not line.startswith(";")]
    if lines[0] == '(jbb':
        lines = lines[1:]  # skip file identification line
    result = dict()
    current = result
    stack = []
    for line in lines:
        if not line or line.startswith(";"):
            pass
        elif line.startswith("(") and not line.endswith(")"):
            name = line[1:]
            child = [] if name in ("model", "colors") else dict()
            current[name] = child
            stack.append(current)
            current = child
        elif line.endswith(")))"):
            key, value = _parse_key_value(line[1:-3])
            if type(current) == list:
                current.append(value)
            else:
                current[key] = value
            current = stack.pop()
            break
        elif line.endswith("))"):
            key, value = _parse_key_value(line[1:-2])
            if type(current) == list:
                current.append(value)
            else:
                current[key] = value
            current = stack.pop()
        else:
            key, value = _parse_key_value(line[1:-1])
            if type(current) == list:
                current.append(value)
            else:
                current[key] = value
    return result


def _parse_key_value(line):
    key, *values = line.split()
    values = [_parse_value(value) for value in values]
    return key, values[0] if len(values) == 1 else values


def _parse_value(value):
    if value.startswith('"') or value.startswith("'"):
        return value[1:-1]
    elif value == 'true':
        return True
    elif value == 'false':
        return False
    else:
        return int(value)

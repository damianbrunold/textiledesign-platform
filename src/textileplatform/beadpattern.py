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
    lines = ['(jbb']
    lines.append('    (version 1)')
    lines.append(f'    (author {_render_value(pattern["author"])})')
    lines.append(f'    (notes {_render_value(pattern["notes"])})')

    colors = pattern['colors']
    lines.append('    (colors')
    for i, color in enumerate(colors):
        r, g, b = color[0], color[1], color[2]
        close = '))' if i == len(colors) - 1 else ')'
        lines.append(f'        (rgb {r} {g} {b}{close}')

    view = pattern['view']
    view_keys = [
        'draft-visible', 'corrected-visible', 'simulation-visible',
        'report-visible', 'selected-tool', 'selected-color',
        'zoom', 'scroll', 'shift',
        'draw-colors', 'draw-symbols', 'symbols',
    ]
    # Skip keys that the file doesn't carry — keeps backward
    # compatibility with patterns saved before these slots existed.
    view_keys = [k for k in view_keys if k in view]
    lines.append('    (view')
    for i, key in enumerate(view_keys):
        close = '))' if i == len(view_keys) - 1 else ')'
        lines.append(f'        ({key} {_render_value(view[key])}{close}')

    model = pattern['model']
    lines.append('    (model')
    for i, row in enumerate(model):
        row_str = ' '.join(str(v) for v in row)
        close = ')))' if i == len(model) - 1 else ')'
        lines.append(f'        (row {row_str}{close}')

    return '\n'.join(lines) + '\n'


def _render_value(value):
    if isinstance(value, bool):
        return 'true' if value else 'false'
    elif isinstance(value, str):
        return f'"{value}"'
    else:
        return str(value)


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

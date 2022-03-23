import json

def serialize_pattern(pattern):
    return json.dumps(pattern)


def deserialize_pattern(s):
    return json.loads(s)


def parse_dbw_data(dbwdata):
    contents = _parse_dbw_into_struct(dbwdata)
    result = dict()
    
    props = contents['properties']
    result['author'] = props['author']
    result['organization'] = props['organization']
    result['notes'] = props['remarks']

    data = contents['data']

    size = data['size']
    result['width'] = int(size['maxx1'])
    result['height'] = int(size['maxy2'])
    result['max_heddles'] = int(size['maxx1'])
    result['max_treadles'] = int(size['maxy1'])

    fields = data['fields']
    result['data_threading'] = _dehex_short(fields['einzug']['data'])
    result['data_tieup'] = _dehex_byte(fields['aufknuepfung']['data'])
    result['data_treadling'] = _dehex_byte(fields['trittfolge']['trittfolge']['data'])
    # TODO handle pegplan?
    result['data_blatteinzug'] = _dehex_byte(fields['blatteinzug']['data'])
    result['colors_warp'] = _dehex_byte(fields['kettfarben']['data'])
    result['colors_weft'] = _dehex_byte(fields['schussfarben']['data'])

    # TODO add rest
    return result


def render_dbw_data(pattern):
    # TODO fill contents as required by dbw format
    # TODO serialize contents
    pass


def _unsplit_lines(lines):
    result = []
    current = ""
    for line in lines:
        if line.endswith("\\"):
            current += line[:-1]
        else:
            current += line
            result.append(current)
            current = ""
    return result


def _parse_dbw_into_struct(data):
    lines = [line for line in data.splitlines() if not line.startswith(";")]
    lines = _unsplit_lines(lines)
    lines = [line.strip() for line in lines]
    if lines[0] == '@dbw3:file': lines = lines[1:] # skip file identification line
    result = dict()
    stack = []
    current = result
    for line in lines:
        print(line)
        if line.startswith("\\") and line.endswith("{"):
            child = dict()
            current[line[1:-1]] = child
            stack.append(current)
            current = child
        elif "==" in line:
            key, _, value = line.partition("==")
            current[key] = value
        elif line == "}":
            current = stack.pop()
        else:
            raise RuntimeError("should not happen")
    return result


def _dehex_byte(data):
    result = []
    while data:
        result.append(int(data[0:2], 16))
        data = data[2:]
    return result


def _dehex_short(data):
    result = []
    while data:
        result.append(int(data[2:4] + data[0:2], 16))
        data = data[4:]
    return result


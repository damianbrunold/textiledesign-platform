def parse_dbw_data(dbwdata, name=''):
    contents = _parse_dbw_into_struct(dbwdata)
    result = dict()

    props = contents['properties']
    result['name'] = name
    result['author'] = props['author']
    result['organization'] = props['organization']
    result['notes'] = props['remarks']

    data = contents['data']

    size = data['size']
    result['width'] = int(size['maxx1'])
    result['height'] = int(size['maxy2'])
    result['max_shafts'] = int(size['maxx2'])
    result['max_treadles'] = int(size['maxy1'])

    fields = data['fields']
    result['data_entering'] = _dehex_short(fields['einzug']['data'])
    result['data_tieup'] = _dehex_byte(fields['aufknuepfung']['data'])
    result['data_treadling'] = _dehex_byte(
        fields['trittfolge']['trittfolge']['data']
    )
    # TODO handle pegplan?
    result['data_reed'] = _dehex_byte(fields['blatteinzug']['data'])
    result['colors_warp'] = _dehex_ubyte(fields['kettfarben']['data'])
    result['colors_weft'] = _dehex_ubyte(fields['schussfarben']['data'])

    result['palette'] = _dehex_colors(data['palette']['data2'])

    view = contents['view']
    result['visible_shafts'] = int(view['einzug']['hvisible'])
    result['visible_treadles'] = int(view['trittfolge']['wvisible'])
    result['warp_lifting'] = view['general']['hebung'] == '0'
    result['zoom'] = int(view['general']['zoom'])
    result['current_color'] = int(view['general']['color'])
    result['color_effect_with_grid'] = view['gewebe']['withgrid'] == '1'
    result['single_treadling'] = view['trittfolge']['single'] == '1'
    result['weave_locked'] = view['gewebe']['locked'] == '1'
    result['unit_width'] = int(view['gewebe']['stronglinex'])
    result['unit_height'] = int(view['gewebe']['strongliney'])
    result['warp_factor'] = float(view['general']['faktor_kette'])
    result['weft_factor'] = float(view['general']['faktor_schuss'])
    result['direction_righttoleft'] = view['general']['righttoleft'] == '1'
    result['direction_toptobottom'] = view['general']['toptobottom'] == '1'
    result['entering_at_bottom'] = view['einzug']['down'] == '1'

    result['display_reed'] = view['blatteinzug']['visible'] == '1'
    result['display_colors_warp'] = view['kettfarben']['visible'] == '1'
    result['display_colors_weft'] = view['schussfarben']['visible'] == '1'
    result['display_hlines'] = view['general']['viewhlines'] == '1'
    result['display_repeat'] = view['general']['viewrapport'] == '1'
    result['display_palette'] = view['general']['viewpalette'] == '1'
    result['display_pegplan'] = view['general']['viewpegplan'] == '1'
    result['display_entering'] = view['einzug']['visible'] == '1'
    result['display_treadling'] = view['trittfolge']['visible'] == '1'

    state = view['gewebe']['state']
    if state == '0':
        result['weave_style'] = 'draft'
    elif state == '1':
        result['weave_style'] = 'color'
    elif state == '2':
        result['weave_style'] = 'simulation'
    elif state == '3':
        result['weave_style'] = 'invisible'

    result['entering_style'] = _decode_viewtype(view['einzug']['viewtype'])
    result['treadling_style'] = _decode_viewtype(
        view['trittfolge']['viewtype'])
    result['tieup_style'] = _decode_viewtype(view['aufknuepfung']['viewtype'])

    # TODO add fixeinzug?
    # TODO add block/bereich data
    # TODO add page setup
    # TODO add weave stuff

    return result


def render_dbw_data(pattern):
    lines = ['@dbw3:file']

    lines.append('\\properties{')
    lines.append(f'author=={pattern.get("author", "")}')
    lines.append(f'organization=={pattern.get("organization", "")}')
    lines.append(f'remarks=={pattern.get("notes", "")}')
    lines.append('}')

    lines.append('\\data{')

    lines.append('\\size{')
    lines.append(f'maxx1=={pattern["width"]}')
    lines.append(f'maxy2=={pattern["height"]}')
    lines.append(f'maxx2=={pattern["max_shafts"]}')
    lines.append(f'maxy1=={pattern["max_treadles"]}')
    lines.append('}')

    lines.append('\\fields{')
    lines.append('\\einzug{')
    lines.append(f'data=={_enhex_short(pattern["data_entering"])}')
    lines.append('}')
    lines.append('\\aufknuepfung{')
    lines.append(f'data=={_enhex_byte(pattern["data_tieup"])}')
    lines.append('}')
    lines.append('\\trittfolge{')
    lines.append('\\trittfolge{')
    lines.append(f'data=={_enhex_byte(pattern["data_treadling"])}')
    lines.append('}')
    lines.append('}')
    lines.append('\\blatteinzug{')
    lines.append(f'data=={_enhex_byte(pattern["data_reed"])}')
    lines.append('}')
    lines.append('\\kettfarben{')
    lines.append(f'data=={_enhex_ubyte(pattern["colors_warp"])}')
    lines.append('}')
    lines.append('\\schussfarben{')
    lines.append(f'data=={_enhex_ubyte(pattern["colors_weft"])}')
    lines.append('}')
    lines.append('}')  # fields

    lines.append('\\palette{')
    lines.append(f'data2=={_enhex_colors(pattern["palette"])}')
    lines.append('}')

    lines.append('}')  # data

    hebung = '0' if pattern.get('warp_lifting', True) else '1'
    lines.append('\\view{')
    lines.append('\\general{')
    lines.append(f'hebung=={hebung}')
    lines.append(f'zoom=={pattern.get("zoom", 1)}')
    lines.append(f'color=={pattern.get("current_color", 0)}')
    lines.append(f'faktor_kette=={pattern.get("warp_factor", 1.0)}')
    lines.append(f'faktor_schuss=={pattern.get("weft_factor", 1.0)}')
    lines.append(f'righttoleft=={"1" if pattern.get("direction_righttoleft") else "0"}')
    lines.append(f'toptobottom=={"1" if pattern.get("direction_toptobottom") else "0"}')
    lines.append(f'viewhlines=={"1" if pattern.get("display_hlines") else "0"}')
    lines.append(f'viewrapport=={"1" if pattern.get("display_repeat") else "0"}')
    lines.append(f'viewpalette=={"1" if pattern.get("display_palette") else "0"}')
    lines.append(f'viewpegplan=={"1" if pattern.get("display_pegplan") else "0"}')
    lines.append('}')  # general

    lines.append('\\einzug{')
    lines.append(f'hvisible=={pattern.get("visible_shafts", 0)}')
    lines.append(f'visible=={"1" if pattern.get("display_entering") else "0"}')
    lines.append(f'down=={"1" if pattern.get("entering_at_bottom") else "0"}')
    lines.append(f'viewtype=={_encode_viewtype(pattern.get("entering_style", "filled"))}')
    lines.append('}')

    lines.append('\\trittfolge{')
    lines.append(f'wvisible=={pattern.get("visible_treadles", 0)}')
    lines.append(f'visible=={"1" if pattern.get("display_treadling") else "0"}')
    lines.append(f'single=={"1" if pattern.get("single_treadling") else "0"}')
    lines.append(f'viewtype=={_encode_viewtype(pattern.get("treadling_style", "filled"))}')
    lines.append('}')

    lines.append('\\aufknuepfung{')
    lines.append(f'viewtype=={_encode_viewtype(pattern.get("tieup_style", "filled"))}')
    lines.append('}')

    weave_style_map = {
        'draft': '0', 'color': '1', 'simulation': '2', 'invisible': '3'
    }
    state = weave_style_map.get(pattern.get('weave_style', 'draft'), '0')
    lines.append('\\gewebe{')
    lines.append(f'withgrid=={"1" if pattern.get("color_effect_with_grid") else "0"}')
    lines.append(f'locked=={"1" if pattern.get("weave_locked") else "0"}')
    lines.append(f'stronglinex=={pattern.get("unit_width", 0)}')
    lines.append(f'strongliney=={pattern.get("unit_height", 0)}')
    lines.append(f'state=={state}')
    lines.append('}')

    lines.append('\\blatteinzug{')
    lines.append(f'visible=={"1" if pattern.get("display_reed") else "0"}')
    lines.append('}')

    lines.append('\\kettfarben{')
    lines.append(f'visible=={"1" if pattern.get("display_colors_warp") else "0"}')
    lines.append('}')

    lines.append('\\schussfarben{')
    lines.append(f'visible=={"1" if pattern.get("display_colors_weft") else "0"}')
    lines.append('}')

    lines.append('}')  # view

    return '\n'.join(lines) + '\n'


def _enhex_short(values):
    parts = []
    for v in values:
        if v is None: v = 0
        if v < 0:
            v += 65536
        lo = v & 0xff
        hi = (v >> 8) & 0xff
        parts.append(f'{lo:02x}{hi:02x}')
    return ''.join(parts)


def _enhex_byte(values):
    parts = []
    for v in values:
        if v is None: v = 0
        if v < 0:
            v += 256
        parts.append(f'{v:02x}')
    return ''.join(parts)


def _enhex_ubyte(values):
    return ''.join(f'{v:02x}' if v is not None else '00' for v in values)


def _enhex_colors(colors):
    parts = []
    for c in colors:
        parts.append(f'{c[0]:02x}{c[1]:02x}{c[2]:02x}{c[3]:02x}')
    return ''.join(parts)


def _encode_viewtype(style):
    styles = {
        'filled': '0', 'dash': '1', 'cross': '2', 'dot': '3',
        'circle': '4', 'rising': '5', 'falling': '6',
        'smallcross': '7', 'smallcircle': '8', 'number': '9',
    }
    return styles.get(style, '0')


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
    if lines[0] == '@dbw3:file':
        lines = lines[1:]  # skip file identification line
    result = dict()
    stack = []
    current = result
    for line in lines:
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
        elif line == "":
            continue
        else:
            print(line)
            raise RuntimeError("should not happen")
    return result


def _dehex_byte(data):
    result = []
    while data:
        v = int(data[0:2], 16)
        if v < 128:
            result.append(v)
        else:
            result.append(v - 256)
        data = data[2:]
    return result


def _dehex_ubyte(data):
    result = []
    while data:
        result.append(int(data[0:2], 16))
        data = data[2:]
    return result


def _dehex_short(data):
    result = []
    while data:
        v = int(data[2:4] + data[0:2], 16)
        if v < 32768:
            result.append(v)
        else:
            result.append(v - 65536)
        data = data[4:]
    return result


def _dehex_colors(data):
    result = []
    while data:
        result.append([
            int(data[0:2], 16),
            int(data[2:4], 16),
            int(data[4:6], 16),
            int(data[6:8], 16)
        ])
        data = data[8:]
    return result


def _decode_viewtype(n):
    if n == '0':
        return "filled"
    elif n == '1':
        return "dash"
    elif n == '2':
        return "cross"
    elif n == '3':
        return "dot"
    elif n == '4':
        return "circle"
    elif n == '5':
        return "rising"
    elif n == '6':
        return "falling"
    elif n == '7':
        return "smallcross"
    elif n == '8':
        return "smallcircle"
    elif n == '9':
        return "number"
    else:
        return "filled"

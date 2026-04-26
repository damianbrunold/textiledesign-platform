def _dig(d, *path, default=None):
    """Walk a nested dict, returning default if any segment is missing."""
    cur = d
    for key in path:
        if not isinstance(cur, dict) or key not in cur:
            return default
        cur = cur[key]
    return cur


def parse_dbw_data(dbwdata, name=''):
    """Parse a desktop .dbw export into the platform's JSON-shape dict.

    Tolerant of missing sections / keys: the desktop app omits some
    blocks depending on which features were used, and the format has
    evolved over the years. Anything we can't read falls back to a
    sensible default rather than raising.
    """
    contents = _parse_dbw_into_struct(dbwdata)
    result = dict()

    result['name'] = name
    result['author'] = _dig(contents, 'properties', 'author', default='') or ''
    result['organization'] = _dig(
        contents, 'properties', 'organization', default='') or ''
    result['notes'] = _dig(contents, 'properties', 'remarks', default='') or ''

    size = _dig(contents, 'data', 'size', default={}) or {}
    result['width'] = int(size.get('maxx1') or 0) or 50
    result['height'] = int(size.get('maxy2') or 0) or 50
    result['max_shafts'] = int(size.get('maxx2') or 0) or 32
    result['max_treadles'] = int(size.get('maxy1') or 0) or 32

    width = result['width']
    height = result['height']
    max_shafts = result['max_shafts']
    max_treadles = result['max_treadles']

    entering_hex = _dig(contents, 'data', 'fields', 'einzug', 'data')
    result['data_entering'] = (
        _dehex_short(entering_hex) if entering_hex else [0] * width
    )
    tieup_hex = _dig(contents, 'data', 'fields', 'aufknuepfung', 'data')
    result['data_tieup'] = (
        _dehex_byte(tieup_hex) if tieup_hex
        else [0] * (max_shafts * max_treadles)
    )
    treadling_hex = _dig(
        contents, 'data', 'fields', 'trittfolge', 'trittfolge', 'data')
    result['data_treadling'] = (
        _dehex_byte(treadling_hex) if treadling_hex
        else [0] * (max_treadles * height)
    )
    reed_hex = _dig(contents, 'data', 'fields', 'blatteinzug', 'data')
    result['data_reed'] = (
        _dehex_byte(reed_hex) if reed_hex
        else ([0, 0, 1, 1] * ((width + 3) // 4))[0:width]
    )
    cw_hex = _dig(contents, 'data', 'fields', 'kettfarben', 'data')
    result['colors_warp'] = (
        _dehex_ubyte(cw_hex) if cw_hex else [55] * width
    )
    cwf_hex = _dig(contents, 'data', 'fields', 'schussfarben', 'data')
    result['colors_weft'] = (
        _dehex_ubyte(cwf_hex) if cwf_hex else [49] * height
    )

    palette_hex = _dig(contents, 'data', 'palette', 'data2')
    if palette_hex:
        result['palette'] = _dehex_colors(palette_hex)
    else:
        # Fall back to the platform default so the editor always has
        # a working colour set; users can still edit the palette later.
        from textileplatform.palette import default_weave_palette
        result['palette'] = list(default_weave_palette)

    view = _dig(contents, 'view', default={}) or {}

    def vint(*path, default=0):
        v = _dig(view, *path)
        try:
            return int(v) if v is not None else default
        except (ValueError, TypeError):
            return default

    def vfloat(*path, default=1.0):
        v = _dig(view, *path)
        try:
            return float(v) if v is not None else default
        except (ValueError, TypeError):
            return default

    def vbool(*path, default=False, true_value='1'):
        v = _dig(view, *path)
        if v is None:
            return default
        return v == true_value

    result['visible_shafts'] = vint('einzug', 'hvisible', default=12)
    result['visible_treadles'] = vint('trittfolge', 'wvisible', default=12)
    result['warp_lifting'] = vbool('general', 'hebung', default=True,
                                   true_value='0')
    result['zoom'] = vint('general', 'zoom', default=3)
    result['current_color'] = vint('general', 'color', default=0)
    result['color_effect_with_grid'] = vbool('gewebe', 'withgrid')
    result['single_treadling'] = vbool('trittfolge', 'single', default=True)
    result['weave_locked'] = vbool('gewebe', 'locked')
    result['unit_width'] = vint('gewebe', 'stronglinex', default=4)
    result['unit_height'] = vint('gewebe', 'strongliney', default=4)
    result['warp_factor'] = vfloat('general', 'faktor_kette', default=1.0)
    result['weft_factor'] = vfloat('general', 'faktor_schuss', default=1.0)
    result['direction_righttoleft'] = vbool('general', 'righttoleft')
    result['direction_toptobottom'] = vbool('general', 'toptobottom')
    result['entering_at_bottom'] = vbool('einzug', 'down')

    result['display_reed'] = vbool('blatteinzug', 'visible', default=True)
    result['display_colors_warp'] = vbool('kettfarben', 'visible', default=True)
    result['display_colors_weft'] = vbool('schussfarben', 'visible',
                                          default=True)
    result['display_hlines'] = vbool('general', 'viewhlines')
    result['display_repeat'] = vbool('general', 'viewrapport')
    result['display_palette'] = vbool('general', 'viewpalette', default=True)
    result['display_pegplan'] = vbool('general', 'viewpegplan')
    result['display_entering'] = vbool('einzug', 'visible', default=True)
    result['display_treadling'] = vbool('trittfolge', 'visible', default=True)

    state = _dig(view, 'gewebe', 'state')
    state_map = {
        '0': 'draft', '1': 'color', '2': 'simulation', '3': 'invisible',
    }
    result['weave_style'] = state_map.get(state, 'draft')

    result['entering_style'] = _decode_viewtype(
        _dig(view, 'einzug', 'viewtype', default='1'))
    result['treadling_style'] = _decode_viewtype(
        _dig(view, 'trittfolge', 'viewtype', default='3'))
    result['tieup_style'] = _decode_viewtype(
        _dig(view, 'aufknuepfung', 'viewtype', default='2'))

    # TODO add fixeinzug?
    # TODO add block/bereich data
    # TODO add page setup
    # TODO add weave stuff (rapport bounds, hlines, pegplan, etc.)

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

r"""DB-WEAVE (.dbw) import / export.

The .dbw text format is a hierarchical structure of `\section{ key==value }`
blocks (with optional `;` comments between them). The desktop app emits a
fairly rich set of subsections — pattern data, palette, view state, page
setup, print settings, loom configuration, etc. The platform editor only
mutates a subset of these fields directly, but for high-fidelity round-
tripping (desktop → platform → desktop) we need to preserve the rest.

Strategy
--------

Import:
    1. Parse the raw text into a nested dict via `_parse_dbw_into_struct`.
    2. Map known fields onto platform JSON keys (`width`, `data_entering`,
       `display_pegplan`, …) so the editor can render and edit them.
    3. Stash the entire raw dict under `_dbw_raw` in the same JSON, so we
       can reconstruct the unmodified sections on export.

Export:
    1. Take a working copy of `_dbw_raw` (or a sensible default skeleton).
    2. Overwrite known fields from the platform JSON (so user edits in
       the editor land in the right slots).
    3. Serialise the dict back into `.dbw` text in the same hierarchical
       layout the desktop emits.

Limitations
-----------

* Hilfslinien (guide lines) round-trip *only when imported from a .dbw*:
  the platform editor keeps its own representation in `hlines`, but we do
  not (yet) re-encode that into the desktop's binary list format. If the
  user adds/removes hlines in the editor, those changes won't reach .dbw.
* Pegplan data is not exported (the desktop derives it on demand from
  treadling+tieup, same as the platform).
* Webstuhl / pagesetup / printsettings / `\schlagpatrone{ viewtype }`
  are preserved opaquely from `_dbw_raw`. Patterns *created* in the
  platform get sensible defaults for these.
"""

import array
import copy
import re
import sys

from textileplatform.palette import default_weave_palette
from textileplatform.validation import (
    PatternError, WEAVE_MAX_SHAFTS, WEAVE_MAX_SIZE,
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_dbw_data(dbwdata, name=''):
    """Parse a `.dbw` text file into the platform's pattern dict.

    Tolerant of missing sections / keys: falls back to defaults rather
    than raising. Stashes the raw nested dict under `_dbw_raw` so that
    `render_dbw_data` can round-trip unmodified sections back out.
    """
    raw = _parse_dbw_into_struct(dbwdata)
    result = _map_raw_to_platform(raw, name)
    result['_dbw_raw'] = raw
    return result


def render_dbw_data(pattern):
    """Render a platform pattern dict back into `.dbw` text.

    Starts from the original `_dbw_raw` when available so opaque
    sections (webstuhl, pagesetup, …) survive intact, then overwrites
    every known field from the platform dict.
    """
    raw = pattern.get('_dbw_raw')
    raw = (
        copy.deepcopy(raw) if raw and isinstance(raw, dict)
        else _default_skeleton(pattern)
    )
    _apply_platform_to_raw(raw, pattern)
    return _render_struct(raw)


# ---------------------------------------------------------------------------
# Raw text → nested dict
# ---------------------------------------------------------------------------

# The desktop breaks lines at CR / LF only. str.splitlines() would also
# break inside a value at NEL, U+2028 etc. and then reject the file.
_LINE_BREAK = re.compile(r'\r\n|\r|\n')


def _parse_dbw_into_struct(data):
    lines = [
        line for line in _LINE_BREAK.split(data) if not line.startswith(";")
    ]
    lines = _unsplit_lines(lines)
    lines = [line.strip() for line in lines]
    if lines and lines[0] == '@dbw3:file':
        lines = lines[1:]
    result = {}
    stack = []
    current = result
    for line in lines:
        if line.startswith("\\") and line.endswith("{"):
            child = {}
            current[line[1:-1]] = child
            stack.append(current)
            current = child
        elif "==" in line:
            key, _, value = line.partition("==")
            current[key] = value
        elif line == "}":
            if not stack:
                raise PatternError("unbalanced '}' in .dbw")
            current = stack.pop()
        elif line == "":
            continue
        else:
            raise PatternError(f"unexpected line in .dbw: {line[:40]!r}")
    return result


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
    if current:
        result.append(current)
    return result


# ---------------------------------------------------------------------------
# Helpers — dict navigation + simple type coercion
# ---------------------------------------------------------------------------

def _section(parent, key):
    """parent[key] as a dict, replacing a missing or scalar entry (a
    malformed or hand-edited _dbw_raw) with an empty section."""
    child = parent.get(key)
    if not isinstance(child, dict):
        child = parent[key] = {}
    return child


def _dig(d, *path, default=None):
    cur = d
    for key in path:
        if not isinstance(cur, dict) or key not in cur:
            return default
        cur = cur[key]
    return cur


def _str_int(v, default=0):
    try:
        return int(v) if v is not None else default
    except (ValueError, TypeError):
        return default


def _str_float(v, default=1.0):
    try:
        return float(v) if v is not None else default
    except (ValueError, TypeError):
        return default


def _eq(v, true_value='1'):
    return v == true_value


# ---------------------------------------------------------------------------
# Raw → platform mapping (import)
# ---------------------------------------------------------------------------

def _map_raw_to_platform(raw, name):
    result = {}

    result['name'] = name
    result['author'] = _dig(raw, 'properties', 'author', default='') or ''
    result['organization'] = (
        _dig(raw, 'properties', 'organization', default='') or ''
    )
    result['notes'] = _remarks_to_notes(
        _dig(raw, 'properties', 'remarks', default=''))

    # Sizes (with sensible fallbacks).
    size = _dig(raw, 'data', 'size', default={})
    if not isinstance(size, dict):
        size = {}
    width = _str_int(size.get('maxx1')) or 50
    height = _str_int(size.get('maxy2')) or 50
    max_shafts = _str_int(size.get('maxx2')) or 32
    max_treadles = _str_int(size.get('maxy1')) or 32
    # Check before the fallback arrays below are allocated from these.
    if not (
        0 < width <= WEAVE_MAX_SIZE and 0 < height <= WEAVE_MAX_SIZE
        and 0 < max_shafts <= WEAVE_MAX_SHAFTS
        and 0 < max_treadles <= WEAVE_MAX_SHAFTS
    ):
        raise PatternError(
            f"pattern size {width} x {height} with {max_shafts} shafts / "
            f"{max_treadles} treadles is out of range"
        )
    result['width'] = width
    result['height'] = height
    result['max_shafts'] = max_shafts
    result['max_treadles'] = max_treadles

    # Fields — hex-encoded grid data with reasonable empty-array fallbacks.
    entering_hex = _dig(raw, 'data', 'fields', 'einzug', 'data')
    result['data_entering'] = (
        _dehex_short(entering_hex) if entering_hex else [0] * width
    )
    tieup_hex = _dig(raw, 'data', 'fields', 'aufknuepfung', 'data')
    result['data_tieup'] = (
        _dehex_byte(tieup_hex) if tieup_hex
        else [0] * (max_shafts * max_treadles)
    )
    treadling_hex = _dig(
        raw, 'data', 'fields', 'trittfolge', 'trittfolge', 'data')
    result['data_treadling'] = (
        _dehex_byte(treadling_hex) if treadling_hex
        else [0] * (max_treadles * height)
    )
    reed_hex = _dig(raw, 'data', 'fields', 'blatteinzug', 'data')
    result['data_reed'] = (
        _dehex_byte(reed_hex) if reed_hex
        else ([0, 0, 1, 1] * ((width + 3) // 4))[0:width]
    )
    cw_hex = _dig(raw, 'data', 'fields', 'kettfarben', 'data')
    result['colors_warp'] = (
        _dehex_ubyte(cw_hex) if cw_hex else [55] * width
    )
    cwf_hex = _dig(raw, 'data', 'fields', 'schussfarben', 'data')
    result['colors_weft'] = (
        _dehex_ubyte(cwf_hex) if cwf_hex else [49] * height
    )

    # Fixiert-template — kept on the platform too.
    fix_hex = _dig(raw, 'data', 'fields', 'fixeinzug', 'fixeinzug')
    result['data_fixeinzug'] = (
        _dehex_short(fix_hex) if fix_hex else [0] * width
    )
    result['fixsize'] = _str_int(
        _dig(raw, 'data', 'fields', 'fixeinzug', 'fixsize'))
    result['firstfree'] = _str_int(
        _dig(raw, 'data', 'fields', 'fixeinzug', 'firstfree'))

    # Block- / Bereichmuster slots — 10 each, 12×12 = 144 cells per slot.
    blockmuster = []
    for k in range(10):
        h = _dig(raw, 'data', 'blockmuster', f'bindung{k}')
        blockmuster.append(_dehex_byte(h) if h else [0] * 144)
    result['data_blockmuster'] = blockmuster
    bereichmuster = []
    for k in range(10):
        h = _dig(raw, 'data', 'bereichmuster', f'bindung{k}')
        bereichmuster.append(_dehex_byte(h) if h else [0] * 144)
    result['data_bereichmuster'] = bereichmuster

    # Palette.
    palette_hex = _dig(raw, 'data', 'palette', 'data2')
    if palette_hex:
        result['palette'] = _dehex_colors(palette_hex)
    else:
        result['palette'] = list(default_weave_palette)

    # View-state mapping.
    view = _dig(raw, 'view', default={}) or {}

    def vint(*path, default=0):
        return _str_int(_dig(view, *path), default)

    def vfloat(*path, default=1.0):
        return _str_float(_dig(view, *path), default)

    def vbool(*path, default=False, true_value='1'):
        v = _dig(view, *path)
        if v is None:
            return default
        return v == true_value

    result['visible_shafts'] = vint('einzug', 'hvisible', default=12)
    result['visible_treadles'] = vint('trittfolge', 'wvisible', default=12)
    result['warp_lifting'] = vbool(
        'general', 'hebung', default=True, true_value='0')
    result['zoom'] = vint('general', 'zoom', default=3)
    result['current_color'] = vint('general', 'color', default=0)
    result['color_effect_with_grid'] = vbool('gewebe', 'withgrid')
    result['single_treadling'] = vbool(
        'trittfolge', 'single', default=True)
    result['weave_locked'] = vbool('gewebe', 'locked')
    result['unit_width'] = vint('gewebe', 'stronglinex', default=4)
    result['unit_height'] = vint('gewebe', 'strongliney', default=4)
    result['warp_factor'] = vfloat('general', 'faktor_kette', default=1.0)
    result['weft_factor'] = vfloat('general', 'faktor_schuss', default=1.0)
    result['direction_righttoleft'] = vbool('general', 'righttoleft')
    result['direction_toptobottom'] = vbool('general', 'toptobottom')
    result['entering_at_bottom'] = vbool('einzug', 'down')

    result['display_reed'] = vbool('blatteinzug', 'visible', default=True)
    result['display_colors_warp'] = vbool(
        'kettfarben', 'visible', default=True)
    result['display_colors_weft'] = vbool(
        'schussfarben', 'visible', default=True)
    result['display_hlines'] = vbool('general', 'viewhlines')
    result['display_repeat'] = vbool('general', 'viewrapport')
    result['display_palette'] = vbool(
        'general', 'viewpalette', default=True)
    # Pegplan: read as-is. The editor compensates when the data has
    # no pegplan grid by deriving one from the weave on first load.
    result['display_pegplan'] = vbool('general', 'viewpegplan')
    result['display_entering'] = vbool('einzug', 'visible', default=True)
    result['display_treadling'] = vbool(
        'trittfolge', 'visible', default=True)

    state_map = {
        '0': 'draft', '1': 'color', '2': 'simulation', '3': 'invisible',
    }
    result['weave_style'] = state_map.get(
        _dig(view, 'gewebe', 'state'), 'draft')

    # Hilfslinien (guide lines) — decode the desktop's binary list into
    # the platform's `hlines` array of {typ, feld, pos} dicts.
    hl_count = _str_int(_dig(raw, 'data', 'hilfslinien', 'count'))
    hl_list = _dig(raw, 'data', 'hilfslinien', 'list') or ''
    result['hlines'] = _decode_hlines(hl_list, hl_count)
    result['entering_style'] = _decode_viewtype(
        _dig(view, 'einzug', 'viewtype', default='1'),
        _dig(view, 'einzug', 'viewtype2'))
    result['treadling_style'] = _decode_viewtype(
        _dig(view, 'trittfolge', 'viewtype', default='3'),
        _dig(view, 'trittfolge', 'viewtype2'))
    result['tieup_style'] = _decode_viewtype(
        _dig(view, 'aufknuepfung', 'viewtype', default='2'),
        _dig(view, 'aufknuepfung', 'viewtype2'))

    return result


# ---------------------------------------------------------------------------
# Platform → raw mapping (export). Mutates `raw` in place.
# ---------------------------------------------------------------------------

def _apply_platform_to_raw(raw, pattern):
    width = int(pattern.get('width') or 0)
    height = int(pattern.get('height') or 0)
    max_shafts = int(pattern.get('max_shafts') or 0)
    max_treadles = int(pattern.get('max_treadles') or 0)

    # ----- properties ------------------------------------------------------
    props = _section(raw, 'properties')
    props['author'] = str(pattern.get('author') or '')
    props['organization'] = str(pattern.get('organization') or '')
    # Remarks are the one multi-line field; the value itself is passed
    # through _format_value like every other.
    props['remarks'] = _notes_to_remarks(pattern.get('notes'))

    # ----- data.size -------------------------------------------------------
    data_section = _section(raw, 'data')
    size = _section(data_section, 'size')
    size['maxx1'] = str(width)
    size['maxy1'] = str(max_treadles)
    size['maxx2'] = str(max_shafts)
    size['maxy2'] = str(height)

    # ----- data.fields -----------------------------------------------------
    fields = _section(data_section, 'fields')
    einzug = _section(fields, 'einzug')
    einzug['size'] = str(width)
    einzug['data'] = _enhex_short(_pad(pattern.get('data_entering'), width))
    einzug.setdefault('dummy', '0')

    aufk = _section(fields, 'aufknuepfung')
    aufk['sizex'] = str(max_treadles)
    aufk['sizey'] = str(max_shafts)
    aufk['data'] = _enhex_byte(
        _pad(pattern.get('data_tieup'), max_treadles * max_shafts))

    tf_outer = _section(fields, 'trittfolge')
    tf_inner = _section(tf_outer, 'trittfolge')
    treadling = _pad(pattern.get('data_treadling'), max_treadles * height)
    tf_inner['sizex'] = str(max_treadles)
    tf_inner['sizey'] = str(height)
    tf_inner['data'] = _enhex_byte(treadling)
    # Derived: per-row "is empty" cache.
    isempty = _section(tf_outer, 'isempty')
    isempty_bytes = []
    if max_treadles > 0:
        for j in range(height):
            row = treadling[j * max_treadles:(j + 1) * max_treadles]
            isempty_bytes.append(0 if any(v for v in row) else 1)
    isempty['size'] = str(height)
    isempty['data'] = _enhex_byte(isempty_bytes)

    kf = _section(fields, 'kettfarben')
    kf['size'] = str(width)
    kf['data'] = _enhex_ubyte(_pad(pattern.get('colors_warp'), width))
    sf = _section(fields, 'schussfarben')
    sf['size'] = str(height)
    sf['data'] = _enhex_ubyte(_pad(pattern.get('colors_weft'), height))
    be = _section(fields, 'blatteinzug')
    be['size'] = str(width)
    be['data'] = _enhex_byte(_pad(pattern.get('data_reed'), width))

    fe = _section(fields, 'fixeinzug')
    fe['fixeinzug'] = _enhex_short(
        _pad(pattern.get('data_fixeinzug'), width))
    fe['fixsize'] = str(int(pattern.get('fixsize') or 0))
    fe['firstfree'] = str(int(pattern.get('firstfree') or 0))

    # ----- data.webstuhl --------------------------------------------------
    data_section.setdefault('webstuhl', _default_webstuhl())

    # ----- data.palette ---------------------------------------------------
    palette = pattern.get('palette') or list(default_weave_palette)
    pal = _section(data_section, 'palette')
    pal['size'] = str(len(palette))
    pal['data2'] = _enhex_colors(palette)

    # ----- data.blockmuster / bereichmuster -------------------------------
    blockmuster = (
        pattern.get('data_blockmuster') or [[0] * 144 for _ in range(10)]
    )
    bm = _section(data_section, 'blockmuster')
    for k in range(10):
        slot = blockmuster[k] if k < len(blockmuster) else [0] * 144
        bm[f'bindung{k}'] = _enhex_byte(_pad(slot, 144))
    bm.setdefault('einzugz', '0')
    bm.setdefault('trittfolgez', '0')

    bereichmuster = (
        pattern.get('data_bereichmuster') or [[0] * 144 for _ in range(10)]
    )
    bem = _section(data_section, 'bereichmuster')
    for k in range(10):
        slot = bereichmuster[k] if k < len(bereichmuster) else [0] * 144
        bem[f'bindung{k}'] = _enhex_byte(_pad(slot, 144))

    # ----- data.hilfslinien ----------------------------------------------
    # If the platform's `hlines` exactly matches what was originally
    # imported, leave the raw bytes verbatim (preserves any uninitialised
    # padding bytes the desktop may have written). Otherwise encode the
    # platform's current list — the desktop accepts zeroed padding.
    hl = _section(data_section, 'hilfslinien')
    hl.setdefault('count', '0')
    hl.setdefault('list', '')
    raw_count = _str_int(hl.get('count'))
    raw_list = hl.get('list') or ''
    raw_decoded = _decode_hlines(raw_list, raw_count)
    plat_hlines = pattern.get('hlines') or []
    if not _hlines_equal(raw_decoded, plat_hlines):
        hl['count'] = str(len(plat_hlines))
        hl['list'] = _encode_hlines(plat_hlines)

    # ----- view ----------------------------------------------------------
    view = _section(raw, 'view')
    general = _section(view, 'general')
    general.setdefault('strongcolor', '0')
    general['hebung'] = '0' if pattern.get('warp_lifting', True) else '1'
    general['zoom'] = str(int(pattern.get('zoom') or 0))
    general['color'] = str(int(pattern.get('current_color') or 0))
    general['faktor_kette'] = (
        f"{float(pattern.get('warp_factor') or 1.0):.8f}"
    )
    general['faktor_schuss'] = (
        f"{float(pattern.get('weft_factor') or 1.0):.8f}"
    )
    general['righttoleft'] = (
        '1' if pattern.get('direction_righttoleft') else '0'
    )
    general['toptobottom'] = (
        '1' if pattern.get('direction_toptobottom') else '0'
    )
    general['viewhlines'] = '1' if pattern.get('display_hlines') else '0'
    general['viewrapport'] = '1' if pattern.get('display_repeat') else '0'
    general['viewpalette'] = '1' if pattern.get('display_palette') else '0'
    general['viewpegplan'] = '1' if pattern.get('display_pegplan') else '0'

    einzug_view = _section(view, 'einzug')
    einzug_view['visible'] = (
        '1' if pattern.get('display_entering') else '0'
    )
    einzug_view['down'] = (
        '1' if pattern.get('entering_at_bottom') else '0'
    )
    _write_viewtype(einzug_view, pattern.get('entering_style', 'filled'))
    einzug_view.setdefault('stronglinex', '4')
    einzug_view.setdefault('strongliney', '4')
    einzug_view['hvisible'] = str(int(pattern.get('visible_shafts') or 12))
    einzug_view.setdefault('style', '1')

    aufk_view = _section(view, 'aufknuepfung')
    _write_viewtype(aufk_view, pattern.get('tieup_style', 'filled'))
    aufk_view.setdefault('stronglinex', '4')
    aufk_view.setdefault('strongliney', '4')

    tf_view = _section(view, 'trittfolge')
    tf_view['visible'] = (
        '1' if pattern.get('display_treadling') else '0'
    )
    _write_viewtype(tf_view, pattern.get('treadling_style', 'filled'))
    tf_view.setdefault('stronglinex', '4')
    tf_view.setdefault('strongliney', '4')
    tf_view['single'] = (
        '1' if pattern.get('single_treadling') else '0'
    )
    tf_view['wvisible'] = str(int(pattern.get('visible_treadles') or 12))
    tf_view.setdefault('style', '0')

    gewebe_view = _section(view, 'gewebe')
    state_map = {
        'draft': '0', 'color': '1', 'simulation': '2', 'invisible': '3'
    }
    gewebe_view['state'] = state_map.get(
        pattern.get('weave_style', 'draft'), '0')
    gewebe_view['locked'] = '1' if pattern.get('weave_locked') else '0'
    gewebe_view['stronglinex'] = str(int(pattern.get('unit_width') or 4))
    gewebe_view['strongliney'] = str(int(pattern.get('unit_height') or 4))
    gewebe_view['withgrid'] = (
        '1' if pattern.get('color_effect_with_grid') else '0'
    )

    blatt_view = _section(view, 'blatteinzug')
    blatt_view['visible'] = '1' if pattern.get('display_reed') else '0'
    kf_view = _section(view, 'kettfarben')
    kf_view['visible'] = (
        '1' if pattern.get('display_colors_warp') else '0'
    )
    sf_view = _section(view, 'schussfarben')
    sf_view['visible'] = (
        '1' if pattern.get('display_colors_weft') else '0'
    )

    # `\schlagpatrone{ viewtype }`, `\pagesetup{ … }`, `\printsettings`,
    # `\version` are preserved opaquely when present in raw and emitted
    # as defaults from the skeleton when starting from scratch — we
    # don't fill them in here so a raw-without-them stays without them.


# ---------------------------------------------------------------------------
# Default skeleton (for platform-created patterns w/o `_dbw_raw`)
# ---------------------------------------------------------------------------

def _default_skeleton(pattern):
    width = int(pattern.get('width') or 0)
    height = int(pattern.get('height') or 0)
    max_shafts = int(pattern.get('max_shafts') or 0)
    max_treadles = int(pattern.get('max_treadles') or 0)
    return {
        'version': {'fmt': '0002', 'ver': '3.70.0127'},
        'properties': {},
        'data': {
            'size': {},
            'fields': {},
            'webstuhl': _default_webstuhl(),
            'palette': {},
            'blockmuster': {},
            'bereichmuster': {},
            'hilfslinien': {'count': '0', 'list': ''},
        },
        'view': {
            'pagesetup': _default_pagesetup(),
        },
        'printsettings': _default_printsettings(
            width, height, max_shafts, max_treadles),
    }


def _default_webstuhl():
    ws = {}
    for k in range(9):
        ws[f'klammer{k}'] = {'first': '0', 'last': '1', 'repetitions': '0'}
    ws['current'] = {'position': '0', 'klammer': '0', 'repetition': '1'}
    ws['last'] = {'position': '0', 'klammer': '0', 'repetition': '1'}
    ws['divers'] = {
        'schussselected': '1', 'scrolly': '0',
        'firstschuss': '0', 'weaving': '0',
    }
    return ws


def _default_pagesetup():
    return {
        'topmargin': '25', 'bottommargin': '25',
        'leftmargin': '20', 'rightmargin': '20',
        'headerheight': '6', 'headertext': 'DB-WEAVE - &Pattern (&Author)',
        'footerheight': '6', 'footertext': '',
    }


def _default_printsettings(width, height, max_shafts, max_treadles):
    return {
        'printrange': {
            'kettevon': '0',
            'kettebis': str(max(0, width - 1)),
            'schuessevon': '0',
            'schuessebis': str(max(0, height - 1)),
            'schaeftevon': '0',
            'schaeftebis': str(max(0, max_shafts - 1)),
            'trittevon': '0',
            'trittebis': str(max(0, max_treadles - 1)),
        },
    }


# ---------------------------------------------------------------------------
# Nested dict → .dbw text
# ---------------------------------------------------------------------------

# Comments emitted before each top-level section, matching the desktop
# layout. Sections not in this map are emitted without a header comment.
_TOP_LEVEL_COMMENTS = {
    'version':       'Dateiformat und Applikationsversion',
    'properties':    'Dateieigenschaften',
    'data':          'Daten',
    'view':          'Ansicht',
    'printsettings': 'Druckeinstellungen',
}


def _render_struct(d):
    lines = ['@dbw3:file']
    first = True
    for key, value in d.items():
        if not _is_valid_key(key):
            continue
        comment = _TOP_LEVEL_COMMENTS.get(key)
        if comment:
            if not first:
                lines.append(';')
            lines.append(';')
            lines.append(f'; {comment}')
            lines.append(';')
        first = False
        if isinstance(value, dict):
            lines.append(f'\\{key}{{')
            _render_dict_into(value, lines, 1)
            lines.append('}')
        else:
            lines.append(f'{key}=={_format_value(value)}')
    # Legacy dbweave requires CRLF line endings (in particular after
    # the @dbw3:file signature), so emit CRLF throughout for full
    # compatibility.
    return '\r\n'.join(lines) + '\r\n'


def _render_dict_into(d, lines, indent):
    pad = '    ' * indent
    for key, value in d.items():
        if not _is_valid_key(key):
            continue
        if isinstance(value, dict):
            lines.append(f'{pad}\\{key}{{')
            _render_dict_into(value, lines, indent + 1)
            lines.append(f'{pad}}}')
        else:
            lines.append(f'{pad}{key}=={_format_value(value)}')


def _format_value(v):
    r"""Long hex strings are wrapped to ~70 chars per line, with the
    desktop's `\` continuation marker — matches the original format
    and keeps lines manageable in text editors."""
    if v is None:
        return ''
    s = str(v)
    if len(s) <= 70 or not _looks_like_long_hex(s):
        return _single_line(s)
    return '\\\r\n'.join(s[i:i + 70] for i in range(0, len(s), 70))


def _single_line(s):
    """A value ends at the line break, and a backslash right before it
    means "continued on the next line" — so a written value must not
    contain line breaks or end in a backslash. Trailing whitespace is
    dropped too, as the reader strips lines: the file then holds exactly
    the value that reads back, and exporting again changes nothing."""
    s = s.replace('\r\n', ' ').replace('\r', ' ').replace('\n', ' ')
    s = s.rstrip()
    while s.endswith('\\'):
        s = s.rstrip('\\').rstrip()
    return s


_KEY_RE = re.compile(r'[^\s\\{}=;@]+')


def _is_valid_key(key):
    """Keys come from the stored _dbw_raw; skip anything that would not
    read back as a single section or field name."""
    return isinstance(key, str) and _KEY_RE.fullmatch(key) is not None


def _notes_to_remarks(notes):
    """Desktop FileProperties::RemoveNL: line breaks are stored as a
    single backslash."""
    notes = str(notes or '').replace('\r\n', '\n').replace('\r', '\n')
    return notes.rstrip('\n').replace('\n', '\\')


def _remarks_to_notes(remarks):
    """Desktop FileProperties::InsertNL."""
    return remarks.replace('\\', '\n') if isinstance(remarks, str) else ''


def _looks_like_long_hex(s):
    if len(s) < 70:
        return False
    return all(c in '0123456789abcdefABCDEF' for c in s)


# ---------------------------------------------------------------------------
# Hex codecs (unchanged from original)
# ---------------------------------------------------------------------------

def _pad(seq, n):
    seq = list(seq or [])
    if len(seq) < n:
        seq = seq + [0] * (n - len(seq))
    elif len(seq) > n:
        seq = seq[:n]
    return seq


def _clamped(v, lo, hi):
    """Cell value as an int within [lo, hi]. Out-of-range values used to
    emit extra hex digits and shift every following cell."""
    try:
        v = int(v or 0)
    except (TypeError, ValueError, OverflowError):
        v = 0
    return min(max(v, lo), hi)


def _enhex_short(values):
    # Signed or unsigned 16-bit, written little-endian.
    raw = bytearray()
    for v in values:
        v = _clamped(v, -32768, 65535) & 0xffff
        raw += bytes((v & 0xff, v >> 8))
    return raw.hex()


def _enhex_byte(values):
    # Signed or unsigned 8-bit.
    return bytes(_clamped(v, -128, 255) & 0xff for v in values).hex()


def _enhex_ubyte(values):
    return bytes(_clamped(v, 0, 255) for v in values).hex()


def _enhex_colors(colors):
    raw = bytearray()
    for c in colors:
        c = list(c)[:4] if isinstance(c, (list, tuple)) else []
        c += [0] * (4 - len(c))
        raw += bytes(_clamped(v, 0, 255) for v in c)
    return raw.hex()


def _hex_bytes(data):
    """Decode a hex string. A trailing odd nibble is read as a byte of
    its own, as the original per-character decoder did."""
    if len(data) % 2:
        data = data[:-1] + '0' + data[-1]
    try:
        return bytes.fromhex(data)
    except ValueError:
        raise PatternError("invalid hex data in .dbw") from None


def _dehex_byte(data):
    return array.array('b', _hex_bytes(data)).tolist()


def _dehex_ubyte(data):
    return list(_hex_bytes(data))


def _dehex_short(data):
    raw = _hex_bytes(data)
    if len(raw) % 2:
        raw += bytes(1)
    values = array.array('h', raw)
    if sys.byteorder == 'big':
        values.byteswap()
    return values.tolist()


def _dehex_colors(data):
    raw = _hex_bytes(data)
    return [list(raw[i:i + 4]) for i in range(0, len(raw) - 3, 4)]


# ---------------------------------------------------------------------------
# Hilfslinien (guide lines) — desktop format
# ---------------------------------------------------------------------------
#
# Each entry is 8 bytes:
#   byte 0     typ:  0 = horizontal, 1 = vertical
#   byte 1     feld: 0 = top/left half, 1 = bottom/right half
#   bytes 2-3  padding (uninitialised in the desktop's struct — sample
#              files contain ASCII fragments like "ni" or "pp"; we
#              write zeros and the desktop accepts them, as confirmed
#              by the test-* files which already have zero padding).
#   bytes 4-7  pos: little-endian uint32 cell index.
#
# `hilfslinien.list` is the concatenation of `count` such entries,
# encoded as hex.

def _decode_hlines(hex_str, count):
    out = []
    if not hex_str:
        return out
    for i in range(count):
        chunk = hex_str[i * 16:(i + 1) * 16]
        if len(chunk) < 16:
            break
        try:
            b = bytes.fromhex(chunk)
        except ValueError:
            break
        typ = "vert" if b[0] == 1 else "horz"
        feld = 1 if b[1] else 0
        pos = int.from_bytes(b[4:8], "little", signed=False)
        out.append({"typ": typ, "feld": feld, "pos": pos})
    return out


def _encode_hlines(hlines):
    out = []
    for h in hlines or []:
        typ = 1 if (h.get("typ") == "vert") else 0
        feld = 1 if h.get("feld") else 0
        pos = int(h.get("pos") or 0) & 0xffffffff
        out.append(
            f'{typ:02x}{feld:02x}0000'
            f'{pos & 0xff:02x}{(pos >> 8) & 0xff:02x}'
            f'{(pos >> 16) & 0xff:02x}{(pos >> 24) & 0xff:02x}'
        )
    return ''.join(out)


def _hlines_equal(a, b):
    if len(a) != len(b):
        return False
    for x, y in zip(a, b):
        if (x.get("typ") != y.get("typ")
                or int(x.get("feld") or 0) != int(y.get("feld") or 0)
                or int(x.get("pos") or 0) != int(y.get("pos") or 0)):
            return False
    return True


# Numeric viewtype codes used in `.dbw` files. 0..9 are the legacy
# values understood by every reader; 10 (HDASH) and 11 (PLUS) were
# added later. Files written by recent dbweave/textile versions store
# the extended values in a sibling "viewtype2" field while keeping
# "viewtype" coerced to a 0..9 visual analogue, so older readers still
# render something sensible.
_VIEWTYPE_TO_STYLE = {
    '0': 'filled', '1': 'vdash', '2': 'cross', '3': 'dot',
    '4': 'circle', '5': 'rising', '6': 'falling',
    '7': 'smallcross', '8': 'smallcircle', '9': 'number',
    '10': 'hdash', '11': 'plus',
}

# 'dash' is a legacy alias for 'vdash' kept on the import side for
# patterns saved by older textile versions; the JS settings dialog
# only lists 'vdash', so we always normalise to that on decode.
_STYLE_TO_VIEWTYPE = {
    'filled': '0', 'vdash': '1', 'dash': '1', 'cross': '2', 'dot': '3',
    'circle': '4', 'rising': '5', 'falling': '6',
    'smallcross': '7', 'smallcircle': '8', 'number': '9',
    'hdash': '10', 'plus': '11',
}

# When writing for legacy readers, HDASH/PLUS need a 0..9 substitute.
# Matches dbweave's filesave.cpp `legacyViewtype`: HDASH→STRICH(dash),
# PLUS→KREUZ(cross).
_LEGACY_COERCE = {'10': '1', '11': '2'}


def _decode_viewtype(n, n2=None):
    """Resolve the effective style. ``n2`` (viewtype2) wins when it
    encodes one of the extended values (HDASH/PLUS); otherwise the
    legacy ``n`` is used."""
    if n2 in ('10', '11'):
        return _VIEWTYPE_TO_STYLE[n2]
    return _VIEWTYPE_TO_STYLE.get(n, 'filled')


def _encode_viewtype(style):
    """Legacy 0..9 viewtype string (HDASH→dash, PLUS→cross). Companion
    viewtype2 is emitted separately by :func:`_write_viewtype`."""
    n = _STYLE_TO_VIEWTYPE.get(style, '0')
    return _LEGACY_COERCE.get(n, n)


def _write_viewtype(view_dict, style):
    """Emit ``viewtype`` (legacy-coerced) and, only when needed,
    ``viewtype2`` carrying the full extended value."""
    n = _STYLE_TO_VIEWTYPE.get(style, '0')
    view_dict['viewtype'] = _LEGACY_COERCE.get(n, n)
    if n in _LEGACY_COERCE:
        view_dict['viewtype2'] = n
    else:
        view_dict.pop('viewtype2', None)

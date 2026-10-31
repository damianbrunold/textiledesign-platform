r"""JBead (.jbb) import / export.

The .jbb format is the S-expression the desktop JBead writes through its
ObjectModel (jbead/src/io/objectmodel.cpp, jbeadmemento.cpp)::

    (jbb
        (version 1)
        (author "...")
        (organization "...")
        (notes "...")
        (colors
            (rgb r g b a)
            ...)
        (view
            (draft-visible true)
            ...
            (symbols "..."))
        (model
            (row b0 b1 ...)
            ...))

Strings are double-quoted with ``\`` escaping the next character, may
span lines, and the file is UTF-8. ``#`` starts a comment. A node either
holds child nodes or is a leaf holding a list of values (int, bool,
string). This module mirrors the desktop lexer, parser and formatter.
"""
import math
import re

from textileplatform.validation import PatternError


def smallest_period(seq):
    """Length of the shortest period p of ``seq`` (seq[k] == seq[k - p]
    for every k >= p), or len(seq) if there is none. 0 for an empty
    sequence. Linear time via the KMP prefix function; this is the bead
    repeat that jbead.js BeadList.updateRepeat computes."""
    n = len(seq)
    if n == 0:
        return 0
    prefix = [0] * n
    k = 0
    for i in range(1, n):
        while k and seq[i] != seq[k]:
            k = prefix[k - 1]
        if seq[i] == seq[k]:
            k += 1
        prefix[i] = k
    return n - prefix[-1]


# The desktop stores a zoom *index* into this table of cell sizes; the
# platform editor stores the cell size in pixels.
DESKTOP_ZOOM_TABLE = (6, 8, 10, 12, 14, 16, 18, 20)
DEFAULT_ZOOM = 12

VIEW_KEYS = (
    'draft-visible', 'corrected-visible', 'simulation-visible',
    'report-visible', 'selected-tool', 'selected-color',
    'zoom', 'scroll', 'shift',
    'draw-colors', 'draw-symbols', 'symbols',
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_jbb_data(jbbdata, name=''):
    """Parse a .jbb file into the platform's bead pattern dict. Raises
    PatternError on syntax errors. Missing sections fall back to the
    same defaults the desktop uses."""
    root = _parse(_tokenize(jbbdata))
    if not isinstance(root, _Node) or root.name != 'jbb':
        raise PatternError("not a JBead file")

    view = {}
    view_node = root.find('view')
    if isinstance(view_node, _Node):
        for leaf in view_node.children:
            if isinstance(leaf, _Leaf) and leaf.values:
                view[leaf.name] = (
                    leaf.values[0] if len(leaf.values) == 1 else leaf.values
                )
    if 'zoom' in view:
        view['zoom'] = _zoom_from_desktop(view['zoom'])

    return {
        'name': name,
        'author': root.string('author'),
        'organization': root.string('organization'),
        'notes': root.string('notes'),
        'colors': [
            leaf.values for leaf in root.leaves('colors', 'rgb')
            if len(leaf.values) >= 3
        ],
        'view': view,
        'model': _rectangular(
            [leaf.values for leaf in root.leaves('model', 'row')]
        ),
    }


def render_jbb_data(pattern):
    """Render a platform bead pattern dict as .jbb text, in the layout
    the desktop writes."""
    view = pattern.get('view') or {}
    view_leaves = []
    for key in VIEW_KEYS:
        if key not in view:
            # Patterns saved before a slot existed don't carry it.
            continue
        value = view[key]
        if value is None:
            continue
        if key == 'zoom':
            value = _zoom_to_desktop(value)
        values = value if isinstance(value, list) else [value]
        # Validation only checks that `view` is an object; skip what a
        # .jbb leaf cannot hold.
        if values and all(_is_leaf_value(v) for v in values):
            view_leaves.append((key, *values))

    lines = ['(jbb']
    _leaf(lines, 1, 'version', 1)
    _leaf(lines, 1, 'author', str(pattern.get('author') or ''))
    _leaf(lines, 1, 'organization', str(pattern.get('organization') or ''))
    _leaf(lines, 1, 'notes', str(pattern.get('notes') or ''))
    _node(lines, 1, 'colors', [
        ('rgb', *color) for color in pattern.get('colors') or []
        # The reader keeps entries of at least three numbers.
        if isinstance(color, list) and len(color) >= 3
        and all(_is_number(c) for c in color)
    ])
    _node(lines, 1, 'view', view_leaves)
    _node(lines, 1, 'model', [
        ('row', *row) for row in pattern.get('model') or []
    ])
    lines[-1] += ')'
    return '\n'.join(lines) + '\n'


# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------

def _is_number(v):
    return (isinstance(v, int) and not isinstance(v, bool)) or (
        isinstance(v, float) and math.isfinite(v))


def _is_leaf_value(v):
    return isinstance(v, (bool, str)) or _is_number(v)


def _render_value(value):
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, str):
        escaped = value.replace('\\', '\\\\').replace('"', '\\"')
        return f'"{escaped}"'
    return str(int(value))


def _leaf(lines, depth, name, *values):
    rendered = ''.join(' ' + _render_value(v) for v in values)
    lines.append(f"{'    ' * depth}({name}{rendered})")


def _node(lines, depth, name, leaves):
    lines.append(f"{'    ' * depth}({name}")
    for leaf_name, *values in leaves:
        _leaf(lines, depth + 1, leaf_name, *values)
    lines[-1] += ')'


def _zoom_to_desktop(pixels):
    """Platform cell size → index of the nearest desktop zoom step."""
    if not isinstance(pixels, int) or isinstance(pixels, bool):
        pixels = DEFAULT_ZOOM
    return min(
        range(len(DESKTOP_ZOOM_TABLE)),
        key=lambda i: abs(DESKTOP_ZOOM_TABLE[i] - pixels),
    )


def _zoom_from_desktop(index):
    if (
        isinstance(index, int) and not isinstance(index, bool)
        and 0 <= index < len(DESKTOP_ZOOM_TABLE)
    ):
        return DESKTOP_ZOOM_TABLE[index]
    return DEFAULT_ZOOM


def _rectangular(rows):
    """Pad or cut every row to the width of the first, as the desktop
    reader does (it takes the width from the first row)."""
    if not rows:
        return []
    width = len(rows[0])
    return [(row + [0] * width)[:width] for row in rows]


# ---------------------------------------------------------------------------
# Lexer + parser (mirrors jbead/src/io/objectmodel.cpp)
# ---------------------------------------------------------------------------

_OPEN = object()
_CLOSE = object()

_TOKEN_RE = re.compile(
    r'(?P<space>\s+)'
    r'|(?P<comment>[#;][^\n]*)'
    r'|(?P<paren>[()])'
    r'|"(?P<string>(?:[^"\\]|\\.)*)"'
    r'|(?P<general>[^ \n\r()"][^ \n\r()]*)',
    re.DOTALL,
)
_UNESCAPE_RE = re.compile(r'\\(.)', re.DOTALL)
_INT_RE = re.compile(r'[+-]?\d+')


def _tokenize(text):
    tokens = []
    pos = 0
    end = len(text)
    while pos < end:
        m = _TOKEN_RE.match(text, pos)
        if m is None:
            raise PatternError(f"unterminated string at offset {pos}")
        pos = m.end()
        kind = m.lastgroup
        if kind == 'paren':
            tokens.append(_OPEN if m.group('paren') == '(' else _CLOSE)
        elif kind == 'string':
            tokens.append(_UNESCAPE_RE.sub(r'\1', m.group('string')))
        elif kind == 'general':
            tok = m.group('general')
            if tok == 'true':
                tokens.append(True)
            elif tok == 'false':
                tokens.append(False)
            elif _INT_RE.fullmatch(tok):
                tokens.append(int(tok))
            else:
                tokens.append(tok)
    return tokens


class _Node:
    def __init__(self, name):
        self.name = name
        self.children = []

    def find(self, name):
        for child in self.children:
            if child.name == name:
                return child
        return None

    def leaves(self, node_name, leaf_name):
        node = self.find(node_name)
        if not isinstance(node, _Node):
            return []
        return [
            c for c in node.children
            if isinstance(c, _Leaf) and c.name == leaf_name
        ]

    def string(self, name, default=''):
        leaf = self.find(name)
        if isinstance(leaf, _Leaf) and leaf.values:
            return str(leaf.values[0])
        return default


class _Leaf:
    def __init__(self, name):
        self.name = name
        self.values = []


_MAX_DEPTH = 64


def _parse(tokens):
    pos = 0

    def next_token():
        nonlocal pos
        if pos >= len(tokens):
            raise PatternError("unexpected end of file")
        token = tokens[pos]
        pos += 1
        return token

    def parse_node(token, depth=0):
        if token is not _OPEN:
            raise PatternError("syntax error, expected (")
        if depth > _MAX_DEPTH:
            # Real files nest three levels; this keeps a hostile one
            # from exhausting the recursion limit.
            raise PatternError("nodes are nested too deeply")
        name = next_token()
        if not isinstance(name, str):
            raise PatternError("syntax error, expected a node name")
        token = next_token()
        if token is _CLOSE:
            return _Node(name)
        if token is _OPEN:
            node = _Node(name)
            while token is not _CLOSE:
                node.children.append(parse_node(token, depth + 1))
                token = next_token()
            return node
        leaf = _Leaf(name)
        while token is not _CLOSE:
            if token is _OPEN:
                raise PatternError(f"syntax error in ({name} ...)")
            leaf.values.append(token)
            token = next_token()
        return leaf

    if not tokens:
        raise PatternError("empty file")
    return parse_node(next_token())

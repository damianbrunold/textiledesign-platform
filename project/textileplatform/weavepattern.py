import json

class WeavePattern:
    def __init__(self):
        self.author = ""
        self.organization = ""
        self.notes = ""

        self.width = 300
        self.height = 300
        self.max_heddles = 30
        self.max_treadling = 30
        self.data_threading = []
        self.data_tieup = []
        self.data_pegplan = []
        self.data_treadling = []
        self.data_blatteinzug = [] # TODO rename
        self.data_colors_warp = []
        self.data_colors_weft = []

        # TODO fixeinzug?
        # TODO webstuhl klammern

        self.color_palette = []

        self.block_patterns = MiniPatterns()
        self.block_threadingz = False
        self.block_threadingz = False

        self.range_patterns = MiniPatterns()

        self.support_lines = []

        # TODO view settings
        # TODO page setup
        # TODO print settings

    def to_json(self):
        return json.dumps({
            "author": self.author,
            "organization": self.organization,
            "notes": self.notes,
            "width": self.width,
            "height": self.height,
            "max_heddles": self.max_heddles,
            "max_treadling": self.max_treadling,
            "data_threading": self.data_threading,
            "data_tieup": self.data_tieup,
            "data_pegplan": self.data_pegplan,
            "data_treadling": self.data_treadling,
            "data_blatteinzug": self.data_blatteinzug,
            "data_colors_warp": self.data_colors_warp,
            "data_colors_weft": self.data_colors_weft,
            "color_palette": self.color_palette,
            # TODO add rest
        })

class MiniPatterns():
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

def _data_dehex(data):
    result = []
    while data:
        result.append(int(data[0:2], 16))
        data = data[2:]
    return result

def _data_dehex_short(data):
    result = []
    while data:
        result.append(int(data[2:4] + data[0:2], 16))
        data = data[4:]
    return result

def parse_dbw_data(data):
    data = _parse_dbw_into_struct(data)
    result = WeavePattern()
    result.author = data['properties']['author']
    result.organization = data['properties']['organization']
    result.notes = data['properties']['remarks']
    result.width = int(data['data']['size']['maxx1'])
    result.height = int(data['data']['size']['maxy2'])
    result.max_heddles = int(data['data']['size']['maxy1'])
    result.max_treadling = int(data['data']['size']['maxx2'])
    result.data_threading = _data_dehex_short(data['data']['fields']['einzug']['data'])
    result.data_tieup = _data_dehex(data['data']['fields']['aufknuepfung']['data'])
    result.data_pegplan = _data_dehex(data['data']['fields']['trittfolge']['trittfolge']['data'])
    result.data_treadling = _data_dehex(data['data']['fields']['trittfolge']['trittfolge']['data'])
    result.data_blatteinzug = _data_dehex(data['data']['fields']['blatteinzug']['data'])
    result.data_colors_warp = _data_dehex(data['data']['fields']['kettfarben']['data'])
    result.data_colors_weft = _data_dehex(data['data']['fields']['schussfarben']['data'])
    # TODO add rest
    return result


def render_dbw_data(pattern):
    pass

def parse_wif_data(data):
    pass

def render_wif_data(pattern):
    pass


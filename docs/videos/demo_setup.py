"""Prepare the demo state for recording one tutorial video.

Run from the repository root with the video environment loaded (see
README.md, "Recording setup"):

    DEMO_PASSWORD=... python docs/videos/demo_setup.py 09 en
    DEMO_PASSWORD=... python docs/videos/demo_setup.py 10 de \
        --files "C:/Users/me/Documents/Desktop-Muster"

Each run deletes the three demo users of that language (with their
patterns, groups and chats), recreates them as freshly verified accounts
with the starter patterns, and adds what the given video needs. Files for
the upload scenes (videos 02 and 10) are written to --files.

Safety: refuses to run unless DATABASE points at the `textile_video`
database, so it can never touch production data.
"""
import argparse
import datetime
import json
import os
import pathlib
import sys

if "textile_video" not in os.environ.get("DATABASE", ""):
    sys.exit("DATABASE must point at the textile_video database")
if not os.environ.get("DEMO_PASSWORD"):
    sys.exit("set DEMO_PASSWORD (shared password of the demo users)")

from werkzeug.security import generate_password_hash  # noqa: E402

from textileplatform import app  # noqa: E402
from textileplatform.beadpattern import render_jbb_data  # noqa: E402
from textileplatform.controller import _delete_user_data  # noqa: E402
from textileplatform.controller import _seed_starter_patterns  # noqa: E402
from textileplatform.db import db  # noqa: E402
from textileplatform.messaging import ensure_group_conversation  # noqa: E402
from textileplatform.messaging import get_or_create_direct_conversation  # noqa: E402,E501
from textileplatform.messaging import get_or_create_group_participant  # noqa: E402,E501
from textileplatform.messaging import post_message  # noqa: E402
from textileplatform.models import Assignment  # noqa: E402
from textileplatform.models import Conversation  # noqa: E402
from textileplatform.models import ConversationParticipant  # noqa: E402
from textileplatform.models import Group  # noqa: E402
from textileplatform.models import Membership  # noqa: E402
from textileplatform.models import Pattern  # noqa: E402
from textileplatform.models import User  # noqa: E402
from textileplatform.name import from_label  # noqa: E402
from textileplatform.patterns import apply_pattern_metadata  # noqa: E402
from textileplatform.weavepattern import render_dbw_data  # noqa: E402

NOW = datetime.datetime.now(datetime.timezone.utc)

# Generated patterns have no preview image until opened once in the
# editor; their autosave links are printed at the end.
NEEDS_PREVIEW = []

# Cast and all names used by the scripts, per language.
T = {
    "en": {
        "examples": "examples",
        "anna": ("Anna Weaver", "anna.weaver@example.com"),
        "ben": ("Ben Beader", "ben.beader@example.com"),
        "carla": ("Carla Sample", "carla.sample@example.com"),
        "guild": ("Weaving Guild Sampleton",
                  "Weekly weaving course in Sampleton – exercises, "
                  "questions and results."),
        "scarves": "Scarves",
        "twill_sampler": "Twill Sampler",
        "table_runner": "Table Runner",
        "blue_spiral_rope": "Blue Spiral Rope",
        "zigzag_bracelet": "Zigzag Bracelet",
        "ocean_waves": "Ocean Waves",
        "exercise1": "Exercise 1",
        "exercise2": "Exercise 2",
        "exercise2_twill": "Exercise 2 Twill",
        "block_exercise": "Block Exercise",
        "my_first_rope": "My first rope",
        "hearts": "Hearts",
        "ex": {  # example pattern names (account "examples")
            "twill": "twill-variation", "siropa": "siropa",
            "stripes": "stripes", "small_hearts": "small-hearts",
            "hearts": "hearts", "rosepath": "tromp-as-writ",
            "kautschuk": "kautschuk", "pepita": "pepita",
            "satin": "satin", "double_face": "double-face",
        },
        "files02": {"Rosepath.dbw": "rosepath",
                    "Herringbone.dbw": "kautschuk",
                    "Spiral Rope.jbb": "stripes"},
        "broken02": ("broken-file.dbw", "This is not a pattern.\n"),
        "files10": {"Rosepath.dbw": "rosepath",
                    "Barleycorn.dbw": "pepita",
                    "Satin Stripes.dbw": "satin",
                    "Waffle Weave.dbw": "double_face",
                    "Blue Spiral.jbb": "stripes",
                    "Zigzag Rope.jbb": "small_hearts"},
        "broken10": ("Old Scarf.dbw", "My old scarf notes.\n"),
        "chat_welcome": "Welcome to the Weaving Guild Sampleton! I'll post "
                        "our exercises here. Questions are always welcome.",
        "dm_ben": "Hi Anna, thanks for adding me to the guild! Is it OK "
                  "if I just watch at first? I mostly do bead crochet.",
    },
    "de": {
        "examples": "beispiele",
        "anna": ("Anna Weber", "anna.weber@example.com"),
        "ben": ("Ben Perle", "ben.perle@example.com"),
        "carla": ("Carla Muster", "carla.muster@example.com"),
        "guild": ("Webkurs Musterhausen",
                  "Wöchentlicher Webkurs in Musterhausen – Übungen, "
                  "Fragen und Ergebnisse."),
        "scarves": "Schals",
        "twill_sampler": "Köperprobe",
        "table_runner": "Tischläufer",
        "blue_spiral_rope": "Blaue Spirale",
        "zigzag_bracelet": "Zickzack-Armband",
        "ocean_waves": "Meereswellen",
        "exercise1": "Übung 1",
        "exercise2": "Übung 2",
        "exercise2_twill": "Übung 2 Köper",
        "block_exercise": "Blockübung",
        "my_first_rope": "Meine erste Kette",
        "hearts": "Herzen",
        "ex": {  # example pattern names (account "beispiele")
            "twill": "köpervariation", "siropa": "siropa",
            "stripes": "streifen", "small_hearts": "kleine-herzen",
            "hearts": "herzen", "rosepath": "tromp-as-writ",
            "kautschuk": "kautschuk", "pepita": "pepita",
            "satin": "satin", "double_face": "double-face",
        },
        "files02": {"Rosengang.dbw": "rosepath",
                    "Fischgrat.dbw": "kautschuk",
                    "Spiralkette.jbb": "stripes"},
        "broken02": ("defekte-datei.dbw", "Das ist kein Muster.\n"),
        "files10": {"Rosenweg.dbw": "rosepath",
                    "Gerstenkorn.dbw": "pepita",
                    "Atlasstreifen.dbw": "satin",
                    "Waffelbindung.dbw": "double_face",
                    "Blaue Spirale.jbb": "stripes",
                    "Zickzack-Kette.jbb": "small_hearts"},
        "broken10": ("Alter Schal.dbw", "Notizen zu meinem alten Schal.\n"),
        "chat_welcome": "Willkommen im Webkurs Musterhausen! Hier stelle "
                        "ich unsere Übungen ein. Fragen sind jederzeit "
                        "willkommen.",
        "dm_ben": "Hallo Anna, danke für die Aufnahme in den Kurs! Ist es "
                  "in Ordnung, wenn ich zuerst nur zuschaue? Ich häkle "
                  "sonst vor allem Perlenketten.",
    },
}


# ---- reset ------------------------------------------------------------


def purge_cast(t):
    """Delete the demo users of one language and everything they own,
    including shared groups they belong to and all their chats."""
    users = [
        u for u in (
            User.query.filter(User.email_lower == t[k][1]).first()
            for k in ("anna", "ben", "carla")
        ) if u is not None
    ]
    ids = {u.id for u in users}
    groups = {
        m.group for u in users for m in u.memberships
        if m.group.owner_id is None
    }
    named = Group.query.filter(
        Group.owner_id.is_(None), Group.name == from_label(t["guild"][0])
    ).first()
    if named is not None:
        groups.add(named)
    for grp in groups:
        conv = Conversation.query.filter_by(group_id=grp.id).first()
        if conv is not None:
            db.session.delete(conv)
        for m in list(grp.memberships):
            db.session.delete(m)
        for a in list(grp.assignments):
            db.session.delete(a)
        db.session.delete(grp)
    if ids:
        conv_ids = {
            cp.conversation_id for cp in
            ConversationParticipant.query.filter(
                ConversationParticipant.user_id.in_(ids)
            )
        }
        for conv in Conversation.query.filter(
            Conversation.id.in_(conv_ids), Conversation.kind == "direct"
        ):
            db.session.delete(conv)
    db.session.flush()
    for u in users:
        _delete_user_data(u)
    db.session.commit()


def make_user(label, email, locale):
    user = User(
        name=from_label(label),
        label=label,
        email=email,
        email_lower=email.lower(),
        password=generate_password_hash(os.environ["DEMO_PASSWORD"]),
        darkmode=False,
        verified=True,
        disabled=False,
        block_invitations=False,
        locale=locale,
        timezone="Europe/Zurich",
        create_date=NOW,
        verify_date=NOW,
        access_date=None,
        intro_seen=True,
    )
    group = Group(name=user.name, label=label, description="",
                  owner=user, created=NOW)
    db.session.add_all([
        user, group,
        Membership(user=user, group=group, role="owner", state="accepted"),
    ])
    db.session.commit()
    _seed_starter_patterns(user)
    return user


# ---- patterns ---------------------------------------------------------


def example(t, key):
    owner = User.query.filter_by(name=t["examples"]).one()
    return Pattern.query.filter_by(owner_id=owner.id,
                                   name=t["ex"][key]).one()


def add_pattern(user, label, ptype, contents, public=False, groups=(),
                images_from=None):
    contents = dict(contents, name=label)
    p = Pattern(
        name=from_label(label), label=label, owner=user,
        pattern_type=ptype, description=contents.get("notes", ""),
        contents=json.dumps(contents), created=NOW, modified=NOW,
        public=public,
    )
    if images_from is not None:
        p.preview_image = images_from.preview_image
        p.thumbnail_image = images_from.thumbnail_image
    else:
        NEEDS_PREVIEW.append((user.label, f"/{user.name}/{p.name}"
                                          "?autosave=1"))
    apply_pattern_metadata(p, contents)
    db.session.add(p)
    primary = Group.query.filter_by(owner_id=user.id, name=user.name).one()
    for grp in (primary, *groups):
        db.session.add(Assignment(pattern=p, group=grp))
    db.session.commit()
    return p


def copy_example(t, user, key, label, **kw):
    src = example(t, key)
    contents = json.loads(src.contents)
    contents.update(author="", organization="", notes="")
    return add_pattern(user, label, src.pattern_type, contents,
                       images_from=src, **kw)


def weave(t, user, label, entering, tieup, treadling, **kw):
    """New weave pattern from (warp -> shaft), {(treadle, shaft)} and
    (pick -> treadle) lists, all 1-based; laid out like a pattern made
    with + in the list."""
    c = json.loads(example(t, "pepita").contents)
    w, h = 300, 300
    ms, mt = c["max_shafts"], c["max_treadles"]
    # Defaults of a pattern made with + (base setting German/Swiss).
    c.update(author=user.label, organization="", notes="",
             width=w, height=h, display_repeat=False, weave_style="draft",
             visible_shafts=12, visible_treadles=12,
             direction_righttoleft=False, direction_toptobottom=False,
             entering_at_bottom=False, entering_style="vdash",
             treadling_style="dot", tieup_style="cross",
             pegplan_style="filled", sinking_shed=False,
             single_treadling=True, display_reed=True,
             display_hlines=False, current_range=1, cursor_x=0,
             cursor_y=0, cursor_part="weave")
    for k in ("data_blockmuster", "data_bereichmuster", "data_fixeinzug",
              "hlines"):
        c.pop(k, None)
    for k in [k for k in c if k.startswith("rapport_")]:
        del c[k]
    c.pop("data_pegplan", None)
    c["data_entering"] = [0] * w
    c["data_tieup"] = [0] * (ms * mt)
    c["data_treadling"] = [0] * (mt * h)
    c["colors_warp"] = [55] * w
    c["colors_weft"] = [49] * h
    for i, s in enumerate(entering):
        c["data_entering"][i] = s
    for tr, s in tieup:
        c["data_tieup"][(tr - 1) + (s - 1) * mt] = 1
    for j, tr in enumerate(treadling):
        c["data_treadling"][(tr - 1) + j * mt] = 1
    return add_pattern(user, label, "DB-WEAVE Pattern", c, **kw)


def bead(t, user, label, width, height, cells, color1=None, **kw):
    c = json.loads(example(t, "stripes").contents)
    c.update(author=user.label, organization="", notes="")
    c.pop("repeat", None)
    c["model"] = [[0] * width for _ in range(height)]
    for col, row in cells:  # 1-based, rows from the bottom
        c["model"][row - 1][col - 1] = 1
    if color1 is not None:
        c["colors"][1] = list(color1)
    return add_pattern(user, label, "JBead Pattern", c, **kw)


def shared_group(t, owner, members):
    label, description = t["guild"]
    grp = Group(name=from_label(label), label=label,
                description=description, owner_id=None, created=NOW,
                public=False)
    db.session.add(grp)
    db.session.add(Membership(user=owner, group=grp, role="owner",
                              state="accepted"))
    for user, role in members:
        db.session.add(Membership(user=user, group=grp, role=role,
                                  state="accepted"))
    db.session.commit()
    return grp


def personal_group(user, label):
    grp = Group(name=from_label(label), label=label, description="",
                owner=user, created=NOW)
    db.session.add_all([grp, Membership(user=user, group=grp,
                                        role="owner", state="accepted")])
    db.session.commit()
    return grp


def write_files(t, folder, files, broken):
    folder = pathlib.Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    for fname, key in files.items():
        contents = json.loads(example(t, key).contents)
        contents.update(author="", organization="", notes="",
                        name=pathlib.Path(fname).stem)
        if fname.endswith(".dbw"):
            data = render_dbw_data(contents)
        else:
            data = render_jbb_data(contents)
        # Bytes exactly as the ⤓ download serves them (no newline
        # translation, which would break .dbw line continuations).
        (folder / fname).write_bytes(data.encode("utf-8"))
    (folder / broken[0]).write_bytes(broken[1].encode("utf-8"))
    print(f"wrote {len(files) + 1} files to {folder}")


# ---- videos -----------------------------------------------------------


def setup(video, lang, files_dir):
    t = T[lang]
    purge_cast(t)
    if video == "01":
        # Carla registers live; Anna and Ben are not needed.
        print("demo users removed; carla registers on camera")
        return
    anna = make_user(*t["anna"], lang)
    ben = make_user(*t["ben"], lang)
    carla = make_user(*t["carla"], lang)

    twill_2_2 = dict(
        entering=[(i % 4) + 1 for i in range(48)],
        tieup=[(tr, s) for tr in range(1, 5)
               for s in (tr, tr % 4 + 1)],
        treadling=[(j % 4) + 1 for j in range(48)],
    )
    if video in ("04", "05"):
        weave(t, anna, t["exercise1"], **twill_2_2)
        weave(t, anna, t["exercise2"], [], [], [])
    if video == "05":
        weave(t, anna, t["block_exercise"],
              entering=[1, 1, 2, 2], tieup=[(1, 1), (2, 2)],
              treadling=[1, 1, 2, 2])
    if video == "07":
        bead(t, ben, t["my_first_rope"], 12, 200,
             [(i, i) for i in range(1, 13)], color1=(0, 0, 255))
        copy_example(t, ben, "hearts", t["hearts"])
    if video in ("08", "09"):
        copy_example(t, ben, "stripes", t["blue_spiral_rope"], public=True)
        copy_example(t, ben, "small_hearts", t["zigzag_bracelet"],
                     public=True)
        copy_example(t, anna, "siropa", t["table_runner"], public=True)
    if video == "08":
        copy_example(t, anna, "twill", t["twill_sampler"])
    if video == "09":
        grp = shared_group(t, anna, [(carla, "writer"), (ben, "reader")])
        copy_example(t, anna, "twill", t["twill_sampler"], public=True,
                     groups=[grp])
        weave(t, anna, t["exercise2_twill"], **twill_2_2)
        conv = ensure_group_conversation(grp)
        msg = post_message(conv, anna, t["chat_welcome"])
        msg.created = NOW - datetime.timedelta(days=1)
        for user in (anna, carla, ben):
            get_or_create_group_participant(conv, user).last_read_at = NOW
        dm = get_or_create_direct_conversation(ben, anna)
        post_message(dm, ben, t["dm_ben"])
        for cp in dm.participants:
            if cp.user_id == ben.id:
                cp.last_read_at = NOW + datetime.timedelta(seconds=1)
        db.session.commit()
    if video == "10":
        personal_group(anna, t["scarves"])
        shared_group(t, anna, [(carla, "writer")])
        copy_example(t, ben, "stripes", t["ocean_waves"], public=True)
    if video in ("02", "10"):
        if not files_dir:
            sys.exit(f"video {video} needs --files DIR for the upload files")
        write_files(t, files_dir, t[f"files{video}"], t[f"broken{video}"])
    db.session.commit()
    print(f"video {video} ({lang}) ready: "
          + ", ".join(u.name for u in (anna, ben, carla)))
    if NEEDS_PREVIEW:
        print("open once in the browser (logged in as the owner) to "
              "create the preview images:")
        for label, url in NEEDS_PREVIEW:
            print(f"  {label}: {url}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("video", choices=[f"{n:02d}" for n in range(1, 11)])
    ap.add_argument("lang", choices=["en", "de"])
    ap.add_argument("--files", help="folder for upload files (02, 10)")
    args = ap.parse_args()
    with app.app_context():
        setup(args.video, args.lang, args.files)


if __name__ == "__main__":
    main()

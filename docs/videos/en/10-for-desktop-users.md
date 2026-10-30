# 10 — For DB-WEAVE and JBead desktop users

**Working title:** For DB-WEAVE and JBead desktop users

**YouTube title:** Textile Platform for DB-WEAVE and JBead users: move your patterns to the browser

**YouTube description:** You already design with DB-WEAVE or JBead on your computer? This video shows how to upload your .dbw and .jbb files to the Textile Platform at textile-platform.ch, how to download them again for the desktop apps, and what is different in the browser. We also cover what the platform adds (sharing, groups, messages), what the web version can't do yet, and how to export or delete your data.

**Target length:** about 7:40

**Audience:** existing users of the DB-WEAVE and JBead desktop apps

**Learning goals:**

- Know that the web editors are ports of the desktop apps: same file formats, same concepts, same menu structure.
- Upload many .dbw and .jbb files at once and understand the message for unreadable files.
- Download a pattern as a native .dbw / .jbb file and keep using it in the desktop apps.
- Know the differences in the browser: no installation, tablets, local draft recovery, explicit Save, Print and Export as PDF/PNG/JPEG/SVG.
- Know what the platform adds (public/private, public link, groups, cloning, messages, Help) and what is not (yet) in the web version (loom control, WIF, print preview).
- Export account data as a ZIP and know where to delete the account.

**Demo setup:**

- Local video instance (see README), app version 1.0.56 or later, browser window 1920×1080, zoom 100 %, light appearance.
- **Anna Weaver** (handle `anna-weaver`, `anna.weaver@example.com`): verified, language English, welcome popup already dismissed. Patterns: only the two starter patterns *Double Weave* and *Green Yellow Diagonal*. No pattern named like one of the files below (otherwise the upload adds " - 2").
  - Personal group **Scarves** (empty is fine).
  - Owner of the shared group **Weaving Guild Sampleton**, with **Carla Sample** as accepted member (so the group tab and the Group chat button are visible).
- **Ben Beader** (handle `ben-beader`): one **public** bead pattern **Ocean Waves** (e.g. a clone of an example bead pattern, renamed). Anna has not cloned it yet.
- Files on disk, in a folder `Documents/Desktop patterns` (fictional, prepared beforehand, e.g. by cloning example patterns into a scratch account and downloading them with ⤓, then renaming):
  - `Rosepath.dbw`, `Barleycorn.dbw`, `Satin Stripes.dbw`, `Waffle Weave.dbw` — valid DB-WEAVE files.
  - `Old Scarf.dbw` — deliberately broken: a plain text file renamed to .dbw. It must **not** start with `@dbw3:` (a truncated real .dbw that still has the header may be imported anyway).
  - `Blue Spiral.jbb`, `Zigzag Rope.jbb` — valid JBead files.
- The desktop apps **DB-WEAVE** (6.x) and **JBead** (2.x) are installed on the recording computer for the side-by-side scene; the browser's download folder is easy to reach.
- Optional: a tablet with a browser logged in as Anna, for a short touch cutaway in scene 6. If no tablet is available, skip the cutaway.

## Scenes

| # | Time | On screen / action | Narration |
|---|---|---|---|
| 1 | 00:00 | Anna's pattern page "Anna Weaver — My patterns" with the sections DB-WEAVE Patterns and JBead Patterns. Next to the browser, briefly show the DB-WEAVE and JBead desktop icons. | Hello! If you already design with DB-WEAVE or JBead on your computer, this video is for you. The Textile Platform comes from the same author as the two desktop programs. It uses the same file formats and the same ideas. In the next few minutes, I'll show you how to move your pattern library into the browser, how to get your files back out, and what is different. Including what the web version can't do yet. |
| 2 | 00:30 | Click *Double Weave* to open the weave editor. Hover over the menu bar: File, Edit, View, Threading, Treadling, Tie-up, Insert, Ranges, Repeat, Colors, Extras. Press F4 (Overview), F4 again to close. Open Extras ▸ Base settings and show American, Scandinavian, German/Swiss (don't change). Close. | Let's open a weave pattern. You'll recognise the screen right away: threading, tie-up, treadling and the pattern grid. The web editor is a port of the desktop program, so the menus are the same. File, Edit, View, Threading, Treadling, and so on. Most keyboard shortcuts work as you know them. For example, F4 shows the overview. Under Extras, Base settings, you can switch to the American or Scandinavian layout. The bead editor is a port of JBead in the same way. |
| 3 | 01:15 | Back on the pattern page. In the DB-WEAVE Patterns section click ↑ (Upload pattern file). File dialog: open `Desktop patterns`, Ctrl+click `Rosepath.dbw`, `Barleycorn.dbw`, `Satin Stripes.dbw`, `Waffle Weave.dbw` and `Old Scarf.dbw`, click Open. The list reloads with four new weave patterns and the message "These files could not be read as patterns: Old Scarf.dbw". Point at the message. | Now let's bring your own files over. On your pattern page, click the arrow in the DB-WEAVE Patterns section: Upload pattern file. In the file dialog you can select many files at once. Hold Ctrl, or Cmd on a Mac, and click. I'm choosing five .dbw files from my desktop folder. The platform recognises the format by the file's content. Every readable file becomes its own pattern, named after the file. If that name already exists, the new pattern gets a number, like "dash 2". One of my files is damaged. The platform doesn't stop because of it. It imports the others and tells me at the top: These files could not be read as patterns. Followed by the file name. Files up to eight megabytes are accepted. |
| 4 | 02:15 | In the JBead Patterns section click ↑ (Upload pattern file). Select `Blue Spiral.jbb` and `Zigzag Rope.jbb`, click Open. Both appear with thumbnails. Switch to Detail view, show size and repeat, switch back to Thumbnails. | JBead files work the same way. I click the arrow in the JBead Patterns section and pick my .jbb files. Here they are, with their thumbnails. In Detail view you see size and repeat at a glance. A tip: if you upload just one file, the platform opens it directly in the editor. |
| 5 | 02:50 | On the *Rosepath* row click ⤓ (Download). The browser downloads `anna-weaver-rosepath.dbw`. Switch to the DB-WEAVE desktop app and open the downloaded file. Show it next to the browser editor with the same pattern. Briefly do the same with a .jbb in JBead (optional). | And the way back? Every pattern row has a download icon. For a weave pattern you get a native .dbw file, for a bead pattern a .jbb file. Here is the file I just downloaded, opened in DB-WEAVE on my computer. Same threading, same tie-up, same colours. Settings the browser editor doesn't use, such as your loom settings, are kept from the original file. So you don't have to choose. Use the platform and the desktop apps side by side, and move files back and forth whenever you like. One small exception: guide lines you add in the browser are not written into the .dbw file. |
| 6 | 03:40 | Optional cutaway: the pattern page and editor on a tablet; long press on a cell. Back on the computer: open *Rosepath*, click a few cells in the pattern (save-state dot turns red). Close the browser tab and confirm the browser's leave prompt. Open the pattern page in a new tab, open *Rosepath*: dialog "Recover unsaved changes?" with Recover, Discard local edits, Decide later. Click Recover. Then press Ctrl+S (dot turns green). | What's different in the browser? First, there is nothing to install. You log in from any computer, and on a tablet, too. On a touch screen, a long press does what Ctrl+click does with a mouse. In the bead editor, a long press picks up a colour, like the pipette. Second, saving. As on the desktop, you save explicitly, with File, Save or Ctrl+S. But the browser also keeps a local draft, about a second after each change. Watch: I change a few cells and close the tab without saving. When I open the pattern again, the platform asks: Recover unsaved changes? I click Recover, and my edits are back. The draft lives in this browser on this computer, so keep saving regularly. |
| 7 | 04:40 | In *Rosepath*: open File ▸ Export and show PNG image…, JPEG image…, SVG file…, PDF file…. Click PDF file…, the PDF downloads. Then File ▸ Print…, the PDF downloads; open it briefly in the PDF viewer. | Printing and export are done on the server. Under File, Export, you get PNG, JPEG, SVG and PDF. Print creates a PDF, which you open and print with your usual PDF viewer. Unsaved changes are included. The bead editor has the same Print and Export commands. |
| 8 | 05:15 | Close the editor. On the pattern page: click 🌐/🔒 (Toggle public/private) on *Rosepath* to make it public. Open Profile, show Public link with Copy. Back on the pattern page, show the tabs *Scarves* and *Weaving Guild Sampleton (Owner)*. Click ↗ (Share to groups) on *Rosepath*, show the checkboxes, Cancel. Open `textile-platform.ch/ben-beader`, click ⎘ Clone to my patterns on *Ocean Waves*, confirm; the button turns ✓. Click Messages in the top bar, then Help. | Now to what the desktop apps can't do. Every pattern is private until you make it public with the globe and lock icon. Your public patterns appear under your public link, which you find in your profile. With groups, you organise your patterns. A personal group is just for you, like a folder. A shared group is for working together, and members are owners, writers or readers. With the share icon, you put a pattern into one or more groups. On another user's page, like Ben's here, you can clone a public pattern into your own patterns. And communication is built in: direct messages, a group chat for shared groups, and Help, which opens a chat with support. Videos 08 and 09 show all of this in detail. |
| 9 | 06:20 | Open *Rosepath* again and open the File menu: Save, Discard changes, Export, Print…, Print part…, Properties…, Page setup…, Information…, Close. On-screen text: "Not (yet) in the web version: loom control · WIF import/export · print preview". | Let's be honest about what's missing. The web version cannot control a loom. If you weave with an ARM Patronic or another supported loom, use DB-WEAVE for that. Simply download the .dbw file. There is no WIF import or export. Use the desktop app to convert. And there is no print preview. Print goes straight to a PDF, which you check in your PDF viewer. |
| 10 | 06:50 | Profile: scroll to Export Account Data, click Download ZIP; briefly show the ZIP contents (profile.json, patterns folder, groups.json, messages folder). Scroll to Delete Account: show Current Password, Type DELETE to confirm and Delete my account — do **not** submit. | Finally, your data belongs to you. In your profile, under Export Account Data, click Download ZIP. You get your profile, all your patterns, your group memberships and your messages. The patterns are in the platform's JSON format, which you can upload again. For the desktop apps, use the download icon on each pattern. And if you ever want to leave, Delete Account removes everything, after you enter your password and type DELETE. |
| 11 | 07:25 | Pattern page with the imported weave and bead patterns; DB-WEAVE desktop window beside the browser. End card with links to videos 08 and 09. | That's it. Your files, your formats, in the browser and on the desktop. Next, watch video 08 on sharing and groups, and video 09 on messages and collaboration. See you there! |

## Closing

**YouTube chapters:**

```
00:00 Welcome, desktop users
00:30 Same editors, same menus
01:15 Uploading your .dbw files
02:15 Uploading your .jbb files
02:50 Downloading back to the desktop
03:40 In the browser: tablets, saving, local draft
04:40 Print and export
05:15 What the platform adds
06:20 Not (yet) in the web version
06:50 Your data: export and delete
07:25 What's next
```

**Next:** [08 — Sharing and groups](08-sharing-and-groups.md), then [09 — Messages and collaboration](09-messages-and-collaboration.md). The editor videos (03–07) serve as reference for the individual commands.

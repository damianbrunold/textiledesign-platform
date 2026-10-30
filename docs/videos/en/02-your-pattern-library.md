# 02 — Your pattern library

- **Working title:** Your pattern library
- **YouTube title:** Textile Platform: create, upload and manage your weave and bead patterns
- **YouTube description:** Your pattern page is the home of all your weave and bead patterns. In this video you create a new pattern, upload .dbw and .jbb files, filter and sort your list, switch between thumbnails and details, and learn the actions for renaming, publishing, downloading, cloning and deleting patterns. Part 2 of the Textile Platform tutorial series at textile-platform.ch.
- **Target length:** about 8:00
- **Audience:** everyone
- **Learning goals:**
  - Find your way around the pattern page: group tabs, toolbar, DB-WEAVE and JBead sections.
  - Create a new pattern with + and upload one or several files with ↑.
  - Understand the message for files that could not be read.
  - Filter and sort the list; switch between Thumbnails and Detail.
  - Use the row actions: rename, public/private, share (overview), download, clone, delete.
  - Open a pattern and return to the list with Close.

## Demo setup

- Clean local video instance as described in the [README](../README.md).
- Account **Carla Sample** (`carla-sample`, carla.sample@example.com), verified, language **English**, appearance Light, welcome message already dismissed. Logged in, on her pattern page.
- Carla owns only the two starter patterns: "Double Weave" (DB-WEAVE) and "Green Yellow Diagonal" (JBead), both private, not in any group. Carla is not a member of any group.
- Clear the browser's site data for the instance before recording, so the list starts in the default state (view **Thumbnails**, sort **Name A–Z ▲**, filter empty).
- Files on disk, in a folder "Textile demo" that the file dialog opens directly:
  - `Rosepath.dbw` and `Herringbone.dbw` — two DB-WEAVE files. Prepare them beforehand on the local instance: log in as the `examples` account, download two suitable weave examples with ⤓ and rename the files.
  - `Spiral Rope.jbb` — a JBead file, downloaded the same way from a bead example of the `examples` account.
  - `broken-file.dbw` — deliberately broken: a plain text file (e.g. containing "This is not a pattern.") renamed to `.dbw`.
- For scene 10: the browser's download bar/list visible. Optional: DB-WEAVE desktop installed, to show the downloaded file opening in it.
- Patterns created during rehearsals ("First Twill", "Rosepath", "Herringbone", "Spiral Rope", clones) are deleted before the take.

## Scenes

| # | Time | On screen / action | Narration |
|---|---|---|---|
| 1 | 00:00 | Carla's pattern page in Thumbnails view with "Double Weave" and "Green Yellow Diagonal". | Welcome back! In the first video, Carla created her account. Now we'll look at the place where all her patterns live: her pattern page. You'll learn how to create new patterns, upload files and find patterns quickly. And we'll go through the small icons for renaming, publishing, downloading, cloning and deleting. |
| 2 | 00:24 | Click the logo (top left) → pattern page. Point at the group tab "Carla Sample", then the toolbar (**Filter…**, sort buttons, **Thumbnails** / **Detail**, **Groups**), then the section titles **DB-WEAVE Patterns** and **JBead Patterns** with their **+** and **↑** buttons. | You get to this page by clicking the logo at the top left. At the very top are the group tabs. The first tab carries your own name and contains all your own patterns. When you create or join a group later, it gets its own tab here. That's the topic of video 8. Below is a toolbar for filtering, sorting and the view. The patterns are sorted by type: DB-WEAVE Patterns for weaving and JBead Patterns for beading. Next to each section title are two small buttons: the plus for a new pattern and the arrow for uploading a file. |
| 3 | 01:10 | Click **+** next to **DB-WEAVE Patterns** (tooltip "Add new pattern"). Inline field **Pattern name** appears: type "First Twill", click **Create**. The weave editor opens with an empty pattern. Click **Close** → back on the list, "First Twill" is there. | Let's create a new weave pattern. Click the plus next to DB-WEAVE Patterns. A field appears: Pattern name. I'll type First Twill and click Create. Pressing Enter works too. Notice that the platform doesn't ask for a size. Every new pattern starts with a generous default size, and the editor opens straight away. The pattern is empty and ready for your first threads. If you need a different size, you can change it later in the editor. Click Close at the top right, and you're back on the list. A new bead pattern works exactly the same way, with the plus next to JBead Patterns. |
| 4 | 02:02 | Click **↑** next to **DB-WEAVE Patterns** (tooltip "Upload pattern file"). File dialog in folder "Textile demo": select `Rosepath.dbw`, `Herringbone.dbw` and `broken-file.dbw` together, click **Open**. Back on the list: "Herringbone" and "Rosepath" are added; at the top the message "These files could not be read as patterns: broken-file.dbw". | Maybe you already have pattern files on your computer, for example from the DB-WEAVE or JBead desktop programs, or downloaded from this platform. Click the arrow next to DB-WEAVE Patterns: Upload pattern file. A file dialog opens. It shows DB-WEAVE files, which end in .dbw, and the platform's own .json files. You can select one file or several at once. I'll select three files: Rosepath, Herringbone, and a file called broken-file. That one isn't a real pattern. Click Open. The two good files are now in the list, each named after its file. And at the top, a message says: These files could not be read as patterns, followed by broken-file.dbw. So you always know if something didn't work. |
| 5 | 03:02 | Click **↑** next to **JBead Patterns**. Select only `Spiral Rope.jbb`, click **Open**. The bead editor opens with "Spiral Rope". Click **Close** → "Spiral Rope" is in the JBead section. | Now a bead pattern. The arrow next to JBead Patterns shows JBead files, ending in .jbb, and again .json files. This time I select just one file, Spiral Rope. When you upload a single file, it opens directly in the editor. Close, and it's in the list. Files can be up to eight megabytes. |
| 6 | 03:31 | Type "rose" into **Filter…** → only "Rosepath" remains. Clear the field. Click the sort buttons one after the other: **Name Z–A ▼**, **Newest**, **Oldest**, back to **Name A–Z ▲**. | With many patterns, the filter helps. Type a few letters into the Filter field, for example rose. Only Rosepath remains. The filter searches the pattern name, but also the author, the organization and the notes of a pattern. Clear the field, and everything is back. Next to it you choose the order: by name from A to Z or from Z to A, the newest first, or the oldest first. Newest is handy to find what you worked on last. Your browser remembers your choice. |
| 7 | 04:11 | Click **Detail**. Point at the columns of the "Rosepath" row: size, repeat (r:…), author, organization, modified date, **Private**. Point at the repeat of "Spiral Rope" (r:… beads). Click **Thumbnails** again. | So far we've seen the Thumbnails view, with a small picture of each pattern. Click Detail for a compact list with more information. For each pattern you see its size, for weave patterns in threads wide by threads high. After r colon comes the repeat, the part of the pattern that repeats. For weave patterns that's again width by height, for bead patterns the number of beads in one repeat. A dash means there is no value. Then the author, the organization, the date of the last change, and whether the pattern is public or private. Click Thumbnails to go back. |
| 8 | 04:57 | Row icons of "First Twill": hover over each one to show its tooltip (**Rename**, **Toggle public/private**, **Share to groups**, **Download**, **Clone pattern**, **Delete**). Click **✎** → the name becomes editable; change it to "My First Twill", press Enter. | Each of your patterns has a row of small icons. If you hover over one, a tooltip tells you what it does. Let's start with the pencil: Rename. The name turns into an input field. I'll type My First Twill and press Enter. Escape would cancel. Keep in mind that the web address of the pattern changes along with the name. |
| 9 | 05:27 | On "My First Twill" click **🔒** → it changes to **🌐**. Switch to **Detail** briefly: the row now says **Public**; back to **Thumbnails**. Point at **↗** (Share to groups). | The lock means the pattern is private. Only you can see it. Click it, and it turns into a globe. Now the pattern is public. Public means: anyone who has the link to your public page, here textile-platform.ch slash carla-sample, can see the pattern and open it read-only. Logged-in users can also clone it. There is no big list of all public patterns, so people find yours through your link or through groups. Click the globe again to make it private. The arrow next to it shares a pattern with your groups. We'll cover that in video 8. |
| 10 | 06:13 | On "Rosepath" click **⤓** (Download). The browser downloads `carla-sample-rosepath.dbw`; show it in the download list. Optional: open it in DB-WEAVE desktop. | The next icon downloads the pattern as a file. Weave patterns are saved as .dbw files, bead patterns as .jbb files. These are the native file formats of the desktop programs, so you can open the file directly in DB-WEAVE or JBead on your computer. It's also a good way to keep a copy of an important pattern. More about working with the desktop programs in video 10. |
| 11 | 06:45 | On "Double Weave" click **⎘** (Clone pattern). Confirm **Clone this pattern?** with OK. The list reloads with "Double Weave - 2" (private). | The two overlapping squares mean clone. Cloning makes a copy of the pattern. The platform asks: Clone this pattern? Click OK. Here's the copy, Double Weave - 2. Copies always start out private. Cloning is perfect when you want to try out a variation and keep the original untouched. |
| 12 | 07:10 | On "Double Weave - 2" click **🗑** (Delete). Confirm **Delete pattern "Double Weave - 2"?** with OK. The row disappears. | And finally the bin: Delete. The platform asks once more, with the name of the pattern. Click OK, and the pattern is gone. Deleting can't be undone, so if in doubt, download the pattern first. |
| 13 | 07:28 | Click the thumbnail of "Green Yellow Diagonal" → bead editor opens. Click **Close** → back on the list. End card with links to video 03 and video 06. | To open a pattern, click its picture or its name. Close at the top right always brings you back to your list. That's your pattern library. In the next videos we finally start designing. Video 3 shows the first steps in weaving, and video 6 the first steps in beading. See you there! |

## YouTube chapters

```
00:00 Introduction
00:24 The pattern page at a glance
01:10 Creating a new pattern
02:02 Uploading several files
03:02 Uploading a single file
03:31 Filter and sort
04:11 Thumbnails and Detail view
04:57 Renaming a pattern
05:27 Public or private
06:13 Downloading for the desktop programs
06:45 Cloning a pattern
07:10 Deleting a pattern
07:28 Opening a pattern and what's next
```

## Next video

**03 — Weaving: first steps** (weavers) or **06 — Beading: first steps** (bead crocheters). Sharing patterns with groups (↗) is covered in **08 — Sharing and groups**.

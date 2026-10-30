# 07 — Beading: advanced, print and export

- **Working title:** Beading: advanced, print and export
- **YouTube title:** Arrange motifs, print and export bead crochet patterns with the JBead editor | Textile Platform
- **YouTube description:** Take your bead crochet patterns further: select, mirror, rotate and arrange motifs along the rope, move all copies at once, and change the pattern size. Then prepare the pattern for the workbench with symbols for black-and-white printing, a bead count per colour, a printed PDF and image exports, and download the .jbb file for the JBead desktop program. Part 7 of the Textile Platform tutorial series at textile-platform.ch.
- **Target length:** about 7:45
- **Audience:** bead crocheters who know the basics of the bead editor (video 06)
- **Learning goals:**
  - Select an area, delete it, mirror it (H, V) and rotate it (R).
  - Use Arrange… with its live preview to place copies along the rope, and understand why copies wrap to the next row.
  - Move all identical copies at once with the Select tool.
  - Insert and delete rows, change the pattern width and height (and know the shrink warning).
  - Rotate the simulation with Shift left / Shift right and switch views on and off.
  - Use symbols for black-and-white printouts and read the technical info as a shopping list.
  - Set properties and the page header/footer, print a PDF, export PNG/JPEG/SVG/PDF and download the .jbb file.

## Demo setup

- Clean local video instance as described in the [README](../README.md), app version 1.0.56 or later.
- **Ben Beader** (handle `ben-beader`, `ben.beader@example.com`): verified, language English, appearance Light, welcome popup already closed.
- Patterns in Ben's account used in this video:
  - **My first rope** — as left at the end of video 06: 12 beads around, 200 rows, one diagonal line from row 1, column 1 to row 12, column 12 in colour 1 (changed to blue), saved. If video 06 is not recorded right before, create it the same way.
  - **Hearts** — Ben's own, private clone of the public English example *Hearts* (account `examples`). If the clone was named "Hearts - 2", rename it to "Hearts". Properties: Author and Organization empty. Page setup: unchanged (default header, empty footer).
- Bead editor in its default state for Ben: all four views visible, Draw colors on, Draw symbols off, symbols at their defaults, normal zoom. The editor remembers views, symbols and zoom per user, so reset them after rehearsals (and after the recording, for other videos).
- Browser downloads go to a visible folder; a PDF viewer is available to open the printed PDF briefly. Optional: JBead desktop installed, to show the downloaded .jbb file opening (scene 18).

## Scenes

| # | Time | On screen / action | Narration |
|---|---|---|---|
| 1 | 00:00 | Title card "Beading: advanced, print and export", then Ben's pattern page. Click **My first rope** → the editor opens. | Welcome back! In the first video we drew a simple spiral. Today we go further. We'll select and arrange motifs, change the pattern size, add symbols for black-and-white printing, count the beads you need, and print and export. At the end, I'll show you how to take your pattern to the JBead desktop program. |
| 2 | 00:25 | Click the **Select** tool. Drag a rectangle over rows 1–12 in the draft view; the status bar shows **Sel: 12 × 12**. Press **Del** → the diagonal disappears. Point at **Edit** ▸ **Delete selection**. | I've opened My first rope. First, a clean start. I choose the Select tool and drag a rectangle over the diagonal line. The status bar shows the size of the selection. Pressing Delete, or Edit, Delete selection, clears the selected beads. |
| 3 | 00:45 | Click the **Pencil** tool. Click five beads in the bottom-left corner to form an "L" (row 1, columns 1–3, plus column 1 in rows 2 and 3). Click **Select**, drag exactly over the 3 × 3 area (**Sel: 3 × 3**). | With the pencil I draw a small motif in the bottom-left corner: an L shape, three beads wide and three rows high. Then I switch back to the Select tool and select exactly this three by three area. |
| 4 | 01:03 | Press **H** (L flips left–right), **V** (flips upside down), **R** (rotates by 90°). Open the **Edit** menu, point at **Mirror horizontal**, **Mirror vertical**, **Rotate**. | With a selection you can transform the motif. H mirrors it horizontally, V mirrors it vertically, and R rotates it by ninety degrees. Rotate only works for square selections, like this one. You'll find all three in the Edit menu, too. |
| 5 | 01:23 | **Edit** ▸ **Arrange…** → dialog **Arrange selection** (defaults: **Horizontal offset:** 3, **Vertical offset:** 3, **Number of copies:** 1; one copy appears in the preview). Click **+** at the horizontal offset → 4. Click **+** at the number of copies several times; the preview grows. | Now my favourite feature: Edit, Arrange. The dialog Arrange selection places copies of the motif along the rope. Horizontal offset and Vertical offset say how far each copy is from the previous one. Number of copies says how many there are. I set the horizontal offset to four and keep the vertical offset at three. Then I raise the number of copies with the plus button. The pattern behind the dialog shows a live preview. |
| 6 | 01:57 | Point at the third copy: it continues at the left edge, one row higher. Set **Number of copies:** 10, click **OK**. Point at the spiral of motifs in the **Simulation view**, then at **Repeat: 40 (40 beads)** in the status bar. | Look at the right edge. The copy doesn't get cut off. It continues on the left side, one row higher. That's because the offsets count along the rope, bead by bead, just like the beads on your yarn. I set ten copies and click OK. The motifs now wind around the rope in a spiral. And because every copy is exactly forty beads after the previous one, the repeat is only forty beads. |
| 7 | 02:30 | The original motif in the bottom-left corner is still selected (**Sel: 3 × 3**). Click inside the selection and drag two beads to the right: all eleven motifs move together. Release. Press **Shift+←** twice → all move back. | Here's a special feature of the Select tool. My first motif is still selected. When I click inside the selection and drag, all identical copies in the pattern move together. That way you can adjust a whole arrangement in one go. Shift and the arrow keys do the same, one bead at a time. |
| 8 | 02:55 | Starting outside the current selection, drag a new selection over a few beads in row 5. **Edit** ▸ **Insert row** → an empty row appears, the rows above move up; the repeat in the status bar changes. Press **Ctrl+Z**. Point at **Edit** ▸ **Delete row**. | To insert an empty row, select something in that row and choose Edit, Insert row. An empty row is inserted at the top row of the selection, and everything above moves up. Delete row removes a row in the same way. Without a selection, both use the topmost row that contains beads. I don't need the extra row, so Ctrl+Z. |
| 9 | 03:23 | Open the **Pattern** menu, point at **Pattern width…**. Click **Pattern height…** → dialog **Pattern height**, **New height:** 200. Type 60, click **OK** → browser confirmation "Shrinking will discard data outside the new size. Continue?" → **OK**. The scrollbar range shrinks. | The size of the pattern is in the Pattern menu. Pattern width changes the circumference, for example for a thicker rope with more beads around. Pattern height changes the number of rows. My motifs end below row forty, so I set the height to sixty. Because the pattern gets smaller, the editor warns that shrinking discards everything outside the new size. Nothing is lost here, so I confirm. |
| 10 | 03:54 | Press **→** a few times, then **←**: only the **Simulation view** turns. Point at the **Shift left** and **Shift right** buttons in the toolbar. | The arrow keys left and right, or these two toolbar buttons, rotate the simulation around the rope. Shift left and Shift right only change the view, not the pattern. It's like turning the rope in your hand to look at the back. |
| 11 | 04:14 | Open **View**: untick **Corrected view** → the view disappears and the others move closer. Tick it again. Point at **Draft view**, **Simulation view**, **Report view**. Press **Ctrl+S**, click **Close**. | In the View menu you can switch each view on or off: Draft view, Corrected view, Simulation view and Report view. If you only need the draft and the bead list, that gives you more room. What you switch on here is also what gets printed. I save my rope and close it. |
| 12 | 04:39 | On the pattern page, click **Hearts** → editor opens. **View** ▸ **Draw symbols** → letters appear in the beads, the palette and the bead list. **Colors** ▸ **Edit symbols…** → dialog **Edit symbols**; change the character of one colour, point at **Reset to default**, click **Cancel**. | Next, I open Hearts, my clone of a public example. A printout in black and white can't show colours. So choose View, Draw symbols. Every colour now gets a letter: in the beads, in the palette and in the bead list. The symbols appear when the zoom is large enough. With Colors, Edit symbols, you can choose your own character for each colour. Reset to default brings back the original letters. |
| 13 | 05:11 | **View** ▸ **Draw colors** (untick) → the pattern is shown with symbols only. Tick **Draw colors** again. | If I also switch off View, Draw colors, I see the pattern the way a black-and-white printout will look. You can't switch off colours and symbols at the same time. The editor always keeps one of them on. I'll turn the colours back on. |
| 14 | 05:32 | **Info** ▸ **Technical info…** → dialog **Technical info**: point at **Circumference:**, **Rows:**, **Total beads:**, **Repeat:**, **Colour runs:**, then at the swatches under **Beads per colour:**. Click **OK**. | Before you buy beads, open Info, Technical info. It shows the circumference, the number of rows, the total number of beads, the repeat and the number of colour runs. Below, Beads per colour tells you how many beads you need of each colour, including the background colour. That's your shopping list. |
| 15 | 05:56 | **File** ▸ **Properties…** → dialog **Properties**: type "Ben Beader" in **Author:**, click **OK**. **File** ▸ **Page setup…** → dialog **Page setup**: **Header:** shows "JBead - &Pattern (&Author)"; point at the tokens hint; type "Page &Page" in **Footer:**, click **OK**. | Under File, Properties, you can enter the author, the organization and notes. I enter my name as the author. File, Page setup defines the header and footer of the printout. The default header is JBead, the pattern name, and the author in brackets. Placeholders that start with an ampersand, like Pattern or Page, are filled in when printing. I add a footer with the page number. |
| 16 | 06:26 | **File** ▸ **Print…** (or **Ctrl+P**) → "hearts.pdf" downloads. Open it briefly: header "JBead - Hearts (Ben Beader)", pattern information, the views and the bead list with symbols, footer with the page number. | Now File, Print, or Ctrl+P. The platform creates a PDF and downloads it. Inside you find the pattern information, the visible views and the bead list, with symbols, spread over as many pages as needed. Print this, and you can thread straight from the paper. |
| 17 | 06:47 | **File** ▸ **Export** → point at **PNG image…**, **JPEG image…**, **SVG file…**, **PDF file…**; click **PNG image…** → "hearts.png" downloads. | For a picture on your website or for social media, use File, Export. You can choose a PNG image, a JPEG image, an SVG file or a PDF file. An export puts everything on a single page or image. Both print and export include changes you haven't saved yet. |
| 18 | 07:10 | Press **Ctrl+S**, click **Close**. On the pattern page, click ⤓ (**Download**) on **Hearts** → "ben-beader-hearts.jbb" downloads. Optional: open it in JBead desktop. Point at ↑ (**Upload pattern file**) in **JBead Patterns**. | Finally, the desktop program. I save and close the editor. In the pattern list, the Download button saves the pattern as a .jbb file. You can open it in JBead on Windows, macOS or Linux. And the other way round, the upload button brings .jbb files from JBead onto the platform. |
| 19 | 07:34 | End card with a link to video 08. | That's the bead editor. In the next video you'll learn how to share your patterns with others and work together in groups. See you there! |

## YouTube chapters

```
00:00 Welcome
00:25 Selecting and deleting
00:45 Drawing a motif
01:03 Mirror and rotate
01:23 Arrange: copies along the rope
01:57 Why copies wrap to the next row
02:30 Moving all copies at once
02:55 Inserting and deleting rows
03:23 Pattern width and height
03:54 Turning the simulation
04:14 Switching views on and off
04:39 Symbols for black-and-white printing
05:11 Printing without colours
05:32 Technical info: your bead shopping list
05:56 Properties and page setup
06:26 Printing a PDF
06:47 Exporting images and PDF
07:10 Downloading the .jbb file for JBead
07:34 What's next
```

## Next video

**08 — Sharing and groups:** making patterns public, personal and shared groups, inviting members, roles, and sharing patterns into groups.

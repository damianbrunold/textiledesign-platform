# 03 — Weaving: first steps

- **Working title:** Weaving: first steps
- **YouTube title:** Weave editor for beginners: threading, tie-up, treadling and your first draft | Textile Platform
- **YouTube description:** Your first steps in the DB-WEAVE weave editor of the Textile Platform. Anna explains every part of the weaving draft — warp colors, threading, reed, tie-up, pattern, treadling and weft colors — and draws a first pattern while threading, tie-up and treadling build themselves. You also learn the four views, how to color warp and weft threads, and how to save your work safely.
- **Target length:** about 7:30 min
- **Audience:** newcomers to weaving software; weavers who have never used DB-WEAVE
- **Learning goals:**
  - Name the parts of a weaving draft on screen and say what each means on the loom.
  - Create a new weave pattern and draw in the pattern; understand that threading, tie-up and treadling are calculated automatically.
  - Edit threading, tie-up and treadling directly.
  - Switch between Draft view, Color view, Simulation view and Empty view.
  - Color warp and weft threads with the palette, including Shift+click to pick up a color.
  - Zoom, undo/redo, save, recover a local draft and close the editor.
- **Demo setup:**
  - Local video instance (see README), English UI, light appearance, browser window 1920×1080.
  - Logged in as **Anna Weaver** (anna-weaver@example.com).
  - Her account contains only the two starter patterns **Double Weave** and **Green Yellow Diagonal**, both unchanged. No pattern named "Exercise 1" exists yet (it is created in scene 6).
  - Extras ▸ Base settings is **German/Swiss** (the default) and the weave style is Draft view.
  - Scene 12 (local draft recovery) is staged off camera: after scene 11, make one more change in Exercise 1, open the browser DevTools ▸ Network ▸ Offline, close the tab (confirm the browser's "Leave site?" prompt), switch back to Online, close DevTools, open the pattern list and click Exercise 1. Resume recording when the dialog "Recover unsaved changes?" is visible.

## Scenes

| # | Time | On screen / action | Narration |
|---|---|---|---|
| 1 | 00:00 | Anna's pattern page "Anna Weaver — My patterns" on textile-platform.ch, section DB-WEAVE Patterns with Double Weave and Green Yellow Diagonal. | Hello, I'm Anna, and I teach weaving. In this video I'll show you the weave editor of the Textile Platform. You don't need to install anything — it all runs in your browser. We'll look at what's on the screen, draw a first pattern, add some color, and save it. If you have never used DB-WEAVE before, this is the right place to start. |
| 2 | 00:30 | Click the thumbnail of **Double Weave**. The editor opens. Point with the mouse to the menu bar, the toolbar and the status bar at the bottom; hover over the pattern so the status bar shows "Pattern" with Col and Row. | Let's open a pattern. I click on Double Weave, one of the two example patterns every new account gets. This is the editor. At the top you see the menu bar and the toolbar, and at the bottom there's a status bar. It tells you which part of the draft you're in, and the column and row. The large area in the middle is the weaving draft. It has several parts, and each part stands for something on the loom. |
| 3 | 01:05 | Point in turn to: the warp colors row at the very top, the threading below it, and the reed threading row below the threading. | Along the top is a single row: the warp colors. Each square is one warp thread, and its color is the yarn color of that thread. Below it is the threading. Each column is a warp thread, each row is a shaft, and the mark shows which shaft the thread is threaded through. Under the threading is a thin row for the reed threading. It shows how the warp threads are spread across the reed. |
| 4 | 01:40 | Point to: the pattern (large grid, bottom left), the tie-up (right of the threading), the treadling (right of the pattern), the weft colors (far right). | The big grid at the bottom left is the pattern — the cloth itself. A filled square means the warp thread lies on top at this point. An empty square means the weft is on top. To the right of the threading is the tie-up. It shows which shafts are tied to which treadle. Below the tie-up is the treadling. Each row is one weft pick, and the mark shows which treadle you press. On the far right are the weft colors, one square per pick. Threading, tie-up and treadling together define the cloth exactly. That's what you need at the loom. |
| 5 | 02:30 | Open View ▸ Style and show the four entries. Press Alt+2 (Color view), Alt+3 (Simulation view), Alt+4 (Empty view), then Alt+1 (Draft view). | You can look at the cloth in different ways. In the View menu, under Style, there are four views. Draft view, Alt+1, is the classic black-and-white draft. Color view, Alt+2, paints each point in its warp or weft color, so you see the color effect. Simulation view, Alt+3, draws the threads almost like real fabric. Empty view, Alt+4, hides the pattern, so you can concentrate on the other parts. I'll go back to the draft view with Alt+1. |
| 6 | 03:05 | Click **Close** (top right). Back on the pattern page, in the section DB-WEAVE Patterns click **+** (Add new pattern), type "Exercise 1" into the field Pattern name, click **Create**. The empty pattern opens in the editor. | Now let's make our own pattern. I click Close at the top right to go back to my patterns. In the DB-WEAVE Patterns section I click the plus button, Add new pattern. I type the name Exercise 1 and click Create. The new pattern opens straight away in the editor. It's empty and ready for drawing. |
| 7 | 03:30 | In the pattern, click the bottom-left square (status bar: Col 1, Row 1). Then click Col 2/Row 2, Col 3/Row 3, Col 4/Row 4 — a small diagonal. Marks appear in threading, tie-up and treadling. Then click Col 2/Row 1: a second mark appears in the tie-up. Click it again to remove it, then once more to set it. | Watch what happens when I click into the pattern. I click the square at the bottom left. Immediately, a mark appears in the threading, in the tie-up and in the treadling. Now I click the next square diagonally up to the right, then the next, and one more. Four warp threads, four shafts, four treadles. The editor works out threading, tie-up and treadling by itself — you simply draw the cloth you want. Now I add one more point in the first row. The tie-up gets a second mark: this treadle now lifts two shafts. Clicking a point again removes it. |
| 8 | 04:20 | Click in the threading: move warp thread 4 to shaft 1 — the pattern changes. Click an empty square in the tie-up — every pick on that treadle changes. Click in the treadling to move pick 3 to another treadle — the old mark disappears. Then press the arrow keys, Space and Tab to show keyboard editing. | You can also work the other way round, just like at the loom. I click in the threading and move the fourth warp thread to shaft one. The pattern follows at once. In the tie-up, I click a square to tie another shaft to a treadle. Every pick that uses this treadle changes. And in the treadling, I click to move a pick to a different treadle. Each pick uses one treadle, so the old mark disappears. If you prefer the keyboard: the arrow keys move the cursor, Space sets or clears a point, and Tab jumps to the next part of the draft. |
| 9 | 05:05 | Press Ctrl+F: the Palette panel opens. Click a dark blue swatch, then click several squares in the warp colors row. Click a light yellow swatch; open Colors ▸ Set weft color…, pick the yellow, OK. Shift+click a blue warp thread: the blue swatch becomes current. Press Alt+2. | Time for some color. Press Ctrl+F to open the palette. I click a dark blue to make it the current color. Then I click warp threads in the warp colors row, and each one turns blue. For the weft, I'd like light yellow everywhere. So I use Colors, Set weft color, and choose the yellow. That colors all weft threads at once. Here's a handy trick: hold Shift and click a thread, and its color becomes the current color. And if you double-click a swatch in the palette, you can change the color itself. Now Alt+2 for the color view — and there's our color effect. |
| 10 | 05:55 | Click the zoom buttons in the toolbar, then press Ctrl+I twice and Ctrl+U twice. Make a change, press Ctrl+Z, then Ctrl+Y. | To see more or less detail, use the two magnifier buttons in the toolbar, or press Ctrl+I to zoom in and Ctrl+U to zoom out. Made a mistake? Ctrl+Z undoes the last step, and Ctrl+Y redoes it. You can go back up to two hundred steps. |
| 11 | 06:15 | Zoom in on the toolbar's right end: the dot is red. Press Ctrl+S: the dot turns green. Make one change: red again. Click the Save button (disk icon): green. | Look at the small dot next to the Close button. Green means everything is saved. As soon as I change something, it turns red. To save, press Ctrl+S, or click the disk icon in the toolbar. The dot is green again. Saving also updates the preview picture in your pattern list. |
| 12 | 06:40 | (Staged, see demo setup.) The dialog **Recover unsaved changes?** is shown with the buttons Recover, Discard local edits and Decide later. Click **Recover**: the last change is back, the dot is red. | What happens if your browser crashes, or the connection drops before you've saved? The editor keeps a copy of your changes in the browser, about a second after each edit. When you open the pattern again, it asks: Recover unsaved changes? Click Recover to get your work back. Discard local edits throws the copy away, and Decide later asks you again next time. |
| 13 | 07:10 | Click **Close**. The dialog "Close pattern" appears with Cancel, Don't save and Save. Click **Save**. The pattern page shows Exercise 1 with its new thumbnail. | When you're finished, click Close. If there are unsaved changes, the editor asks whether to save them. I click Save, and I'm back in my pattern list, where Exercise 1 now has its own preview. That's it for the basics. In the next video I'll show you the design tools: inserting twills and satins, drawing shapes, working with selections and repeats. See you there! |

## YouTube chapters

```
00:00 Introduction
00:30 The weave editor
01:05 Warp colors, threading and reed
01:40 Pattern, tie-up, treadling and weft colors
02:30 Draft, color, simulation and empty view
03:05 Creating a new pattern
03:30 Drawing in the pattern
04:20 Editing threading, tie-up and treadling
05:05 Colors and the palette
05:55 Zoom, undo and redo
06:15 Saving
06:40 Recovering unsaved changes
07:10 Closing and outlook
```

## Next video

[04 — Weaving: design tools](04-weaving-design-tools.md): inserting twills and satins, drawing tools, selections, threading wizard and repeats.

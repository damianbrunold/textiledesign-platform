# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`textileplatform` is a Flask web application for managing textile pattern files — DB-WEAVE (`.dbw`) weave patterns and JBead (`.jbb`) bead patterns. Users can upload, create, edit, share, export and print patterns, organise them in groups and message each other. The app is deployed as a WSGI app (`application = app` in `__init__.py`).

## Setup

Requires a `.env` file with:
```
DATABASE=postgresql+psycopg://...
SECRET_KEY=...
ADMIN_PASSWORD=...
```

Install (runtime pins plus dev tools) and run:
```bash
pip install -r requirements-dev.txt -e .
npm install          # JS test and lint tools (development only)
playwright install chromium   # browser for the e2e tests
flask --app textileplatform run
```

Initialize the database / run migrations:
```bash
flask --app textileplatform init-db
flask --app textileplatform db upgrade
flask --app textileplatform db check   # models and migrations must agree
```

## Common Commands

**All checks at once:** `python run_tests.py` (with the venv's Python) runs ruff, pytest including the browser tests, ESLint and Vitest, and prints a summary. `--fast` skips the browser tests, `--cov` writes coverage reports (`htmlcov/`, `coverage/js/`), `py` / `js` runs one side only, and pytest arguments go after `--` (`python run_tests.py py -- -k drafts -x`).

**Tests:** `pytest` (in-memory SQLite, see `tests/conftest.py`):
- `test_security.py` — auth, sessions, CSRF, rate limiting, passwords, e-mail changes
- `test_patterns.py` — metadata, upload, group access; `_make_user` / `_login` helpers
- `test_limits.py` — size limits, validation, print/export budgets, primary group scoping
- `test_formats.py` — `.jbb` / `.dbw` import and export against the desktop formats, upload decoding
- `test_format_golden.py` — the desktop sample files in `tests/data/formats/`: lossless desktop → platform → desktop round trips, plus snapshots in `golden/` (JSON digest per sample, reference PNGs for a subset). After an intentional import/export change: `UPDATE_GOLDEN=1 pytest tests/test_format_golden.py`, then review the diff.
- `test_format_properties.py` — hypothesis properties: `.dbw` / `.jbb` round trips (the `expected_*` helpers spell out the desktop normalisations), parsers only raise `PatternError`, everything `validate_pattern` accepts can be exported, bead repeat. `PROPERTY_SCALE=10` searches ten times as many examples; failing examples are replayed from `.hypothesis/`. Bugs the properties find get a deterministic regression test at the end of the file.
- `e2e/` — browser end-to-end tests (Playwright, marker `e2e`): the app runs in a server thread on the test's in-memory database; scenarios cover login/registration, the editors (edit, save, undo, close/navigation guards, drafts, export and print of unsaved state, read-only view) and workflows across pages (`test_workflows.py`: sharing a pattern with an invited group member, messaging, uploading a desktop file, printing). The `bob_page` fixture is a second logged-in browser session for two-user scenarios. `test_all_actions.py` invokes every registered editor action (ActionRegistry; menus, toolbar, shortcuts) and confirms every dialog with its defaults, failing on uncaught errors, exceptions and alerts — the safety net for restructuring the editor code. Every action must really run; a new action that the setup can't enable needs a retry state there. `pytest -m "not e2e"` skips them, `pytest tests/e2e --headed --slowmo 300` shows the browser. Seed data with `helpers.py` (`make_user`, `make_weave_pattern`, `stored_contents`, all inside `db_access()`; never hold it while the browser acts), drive the editors with `editor.py` (`open_editor`, `click_weave_cell(page, pane, i, j)`, `click_bead`, `save`, `is_modified`). Editor state is reachable through the `window.txEditor` test handle (getters over the module state, plus `ActionRegistry`, `Modal`, `setModified`, weave `select_part`): `page.evaluate("txEditor.pattern.weave.get(0, 0)")`; a name a new test needs gets added to the handle at the end of `weave/editor.js` / `bead/editor.js`. Uncaught page errors fail the test.

SQLite drops tzinfo; the app normalises stored timestamps to UTC (`controller._as_utc`), so tests need no workaround for access dates.

**JavaScript tests:** `npm test` (Vitest; `npm run coverage` for coverage, `npm install` once first). Tests live in `tests/js/` and import the `static/js` modules directly (`tests/js/weave-model.test.js`); they run in plain Node, a test file that needs a DOM opts in with `// @vitest-environment jsdom`. Code that reads editor state takes it as parameters or an `env` object (e.g. the bead views), so tests pass plain objects. Known bugs are pinned with `it.fails`. Random test data comes from `tests/js/helpers/random.js` (`randomSource(seed)`; a plain `seed % n` LCG repeats in its low bits and makes "random" patterns nearly identical).

**Coverage:** `pytest --cov` (branch coverage, configured in `pyproject.toml`; `--cov-report=html` for `htmlcov/`).

**Lint:** `ruff check .` — or `pre-commit run --all-files` (trailing whitespace, EOF, autopep8, ruff; migrations and `docs/` are excluded). Ruff's rule set is in `pyproject.toml`; formatting stays with autopep8. The `# noqa: E402` comments in `tests/conftest.py` keep autopep8 from hoisting the imports above the environment setup.

**JavaScript lint:** `npm run lint` (ESLint, `eslint.config.js`; also a pre-commit hook). The editor code is ES modules, so `no-undef` catches typos and missing imports; only names that are also browser globals (`Selection`, `Clipboard`) slip past it.

**Dependency audit:** `pip-audit -r requirements.txt`.

**Dependencies:** `pyproject.toml` lists runtime dependencies with lower bounds (plus a `dev` extra); `requirements.txt` pins the runtime set for deployment and `requirements-dev.txt` adds the dev tools. After changing dependencies, regenerate `requirements.txt` from a clean venv (`pip install .` then `pip freeze --exclude textileplatform`), as described in its header.

**i18n / Babel translations:**
```bash
pybabel extract -F babel.cfg -o messages.pot .
pybabel update -i messages.pot -d src/textileplatform/translations
pybabel compile -d src/textileplatform/translations   # the .mo is committed
```

**Admin CLI commands (via `flask --app textileplatform <cmd>`):**
- Users: `list-users`, `list-access`, `user-patterns <user>`, `reset-password <user>`, `change-email <user> <email>`, `delete-user <user>`, `clean-up-non-verified-users`
- Patterns: `create-weave-pattern <user> <name>`, `create-bead-pattern <user> <name>`, `delete-user-pattern <user> <name>`, `refresh-pattern-metadata`, `validate-patterns` (read-only; lists stored patterns that fail validation), `list-pattern-salvage`, `restore-pattern-salvage <user> <name>`, `seed-starter-patterns`
- Groups: `ensure-primary-groups`, `clean-up-orphan-personal-groups`

**Deploy:** `python deploy_to_server.py <user@server>` builds the wheel and runs `update_server.py` on the server (pip install of `requirements.txt` + wheel, `flask db upgrade`, supervisor restart).

## Architecture

### Python package: `src/textileplatform/`

- **`app.py`** — The bare Flask `app` and the in-memory rate `limiter`.
- **`__init__.py`** — Entry point: loads `.env`, configures the app, Babel, Flask-Migrate, CSRF, ProxyFix, static cache-busting, and all CLI commands.
- **`controller.py`** — All routes and API endpoints (the bulk of the app).
- **`models.py`** — SQLAlchemy models: `User`, `Group`, `Membership`, `Pattern`, `Assignment`, `Conversation`, `ConversationParticipant`, `Message`, `Announcement`. Table names are prefixed with `tx`.
- **`patterns.py`** — `add_pattern`, `clone_pattern` (free-name search), `new_weave_pattern` / `new_bead_pattern` (default contents), `primary_group`, list metadata extraction (`apply_pattern_metadata`), source formatting.
- **`validation.py`** — `validate_pattern(contents, pattern_type)`: shape and size limits for pattern JSON; applied on save, upload, clone, export, print and legacy download. Limits are at least what the editors allow. `scrub_surrogates` replaces lone UTF-16 surrogates (half an emoji, which can't be encoded as UTF-8) with U+FFFD; the controller applies it where pattern text comes in (save, clone, export / print source) and goes out (downloads, profile export).
- **`weavepattern.py`** / **`beadpattern.py`** — `.dbw` / `.jbb` import and export. They follow the desktop apps' formats; the sources are in the sibling repositories `../dbweave` (`src/io/fileformat.cpp`, `src/ui/properties.cpp`) and `../jbead` (`src/io/objectmodel.cpp`, `jbeadmemento.cpp`). `beadpattern.smallest_period` is the bead repeat.
- **`export.py`** / **`beadexport.py`** / **`exportcommon.py`** — PNG / JPEG / SVG / PDF export and multi-page print (Pillow, reportlab). Work is bounded (cell budget, raster pixel cap, page / bead limits); `TooLargeError` becomes a 400. PDF text (and non-Latin-1 raster text) goes through `exportcommon.draw_pdf_text` / `text_runs`: bundled fonts Carlito (Latin, Greek, Cyrillic), DejaVu Sans (Arabic, Hebrew) and Droid Sans Fallback (CJK), first font with the glyph wins; Arabic/Hebrew are shaped and reordered with arabic-reshaper + python-bidi.
- **`messaging.py`** — Direct and group conversations.
- **`mail.py`** — Mail via localhost SMTP (verification, recovery, notifications).
- **`support.py`** — The `support` admin account (`SUPPORT_USERNAME`).
- **`sysinfo.py`** — System status for the admin console.
- **`name.py`** — URL-safe names (`from_label`) and validation (`is_valid`).
- **`palette.py`**, **`ensure.py`**, **`db.py`** — Default palettes, DB initialization, the `db` instance.

### Data model

Every user has a **primary group**: a personal group (`owner_id` = the user) with the user's name. Personal group names are unique per owner and shared (global, `owner_id` NULL) group names are globally unique — enforced by partial unique indexes. Always look groups up by owner and name. Patterns are stored in `txpattern` with their full JSON in `contents` (plus `contents_salvage`, a stash the save tripwire fills when a save would empty a pattern); `(owner_id, name)` is unique. Patterns belong to users (`owner_id`) and are shared into groups via `txassignment`. `txmembership` tracks group membership with roles (`owner`, `writer`, `reader`) and states (`invited`, `accepted`, `declined`).

### Pattern types

- `"DB-WEAVE Pattern"` — weave patterns (`.dbw`, or JSON with a `max_shafts` key)
- `"JBead Pattern"` — bead patterns (`.jbb`, or JSON)

Uploads are detected by header (`@dbw3:` / `(jbb`), decoded as UTF-8 with a Windows-1252 fallback (old DB-WEAVE files). Legacy downloads are UTF-8.

### Frontend

Jinja2 templates in `src/textileplatform/templates/`. The pattern editors are JS-heavy:
- `static/js/weave/editor.js` — ES module: the DB-WEAVE editor's entry module (`edit_dbweave_pattern.html`): startup (`init` on window `load`), mouse / pointer input (cells, drawing-tool drags, pane resizing, long press as Ctrl) and the keyboard. Its feature modules import downwards only (never from `editor.js`):
  - `weave/state.js` — the shared editor state (`pattern`, `view`, `settings`, `cursor`, `colors`, `readonly`, `commandBus`, `toolDrag`) as live bindings; assigned only through the setters (`setPattern`, …)
  - `weave/actions.js` — every menu / toolbar / shortcut action registered in ActionRegistry (`setupEditorActions`), export / revert, toolbar wiring, status bar
  - `weave/edits.js` — the undoable editing operations: cells / threads with recalculation (`_applyGridToggle`, `_recalcFor`, …), insert / remove / move shafts, treadles, warps, wefts, repeat dialog, threading / treadling operations and arrangement styles, generators, pegplan transforms, repeat extension / reduction; `weave/selection-ops.js` — operations on the selection, cut / copy / paste; `weave/cursor.js` — pane navigation (`select_part`), arrow-key movement, selection icons; `weave/toolboxes.js` — tools / ranges side panels and colour actions; `weave/overview.js` — overview window
  - `weave/views.js` (pane views, scrollbars, `ViewSettings`, `PatternView` layout / drawing; `view.afterDraw` hook), `weave/painters.js` (cell styles, range colours, pane pixel maths), `weave/guides.js` (guide lines), `weave/thumbnail.js` (`captureThumbnails`)
  - `weave/history.js` — whole-pattern undo snapshots and command helpers (`_fullSnapCommand`, `_snapshotCommand`, `_structuralCommand`, `_resizePatternCommand`); `weave/persist.js` — `initSettings` / `saveSettings` / `initPatternData` / `savePatternData` around `io.js`
  - dialogs: `weave/info.js` (properties, page setup, pattern info, print part), `weave/options.js` (options, presets, ratio, cursor movement, arrangement styles, user preferences), `weave/palette.js` (palette, blending, bulk colour operations), `weave/blocks.js` (block / range substitution), `weave/userdef.js`, `weave/threading-wizard.js`, `weave/lancee.js`, `weave/fixed-threading.js`
- `static/js/weave/model.js` — ES module: the DB-WEAVE data model (`Grid`, `Entering`, `Muster`, `Pattern` with weave calculation in both directions and repeat detection). No DOM, no editor globals; the editor connects through `Pattern`'s hooks (`isPegplan`, `recalcFixedEntering`, `afterRecalcFromWeave`).
- `static/js/weave/io.js` — ES module: conversion between the stored pattern JSON and the editor (`loadPatternData` / `storePatternData`, `loadSettings` / `storeSettings`); the editor's `initPatternData` / `savePatternData` / `initSettings` / `saveSettings` delegate to it. Save followed by load must give back the same data (`tests/js/weave-io.test.js`).
- `static/js/weave/arrange.js` — ES module: threading / treadling arrangement styles (`arrangeThreading`, `arrangeTreadling`; desktop ports run after every weave-driven recalculation) and the fixed threading (`recalcFixedEntering`, `updateFixedEntering`). Contract: an arrangement only renumbers shafts / treadles, the weave never changes (`tests/js/weave-arrange.test.js` checks this on random patterns).
- `static/js/weave/generators.js` — ES module: atlas / satin and twill insertion (`stampAtlas`, `stampTwill`) and twill completion (`completeTwill`) on a grid; they return the block to select. The editor wrappers (`_insertAtlas`, `_insertKoeper`, `_fillKoeper`) keep the undo command, cursor and recalculation.
- `static/js/weave/transforms.js` — ES module: switch side (`switchSide`, F11), pegplan invert / mirror / delete, repeat extension / reduction (`repeatWarp`, `repeatWeft`, F8 / F7). Contract: afterwards the weave is what the threading and tie-up + treadling (or pegplan) give (`tests/js/weave-transforms.test.js`). In pegplan mode F11 inverts the threaded shafts within the used wefts; F11 twice is a round trip except for a fully raised first / last used weft, which can't be told from "no weft" in the pegplan.
- `static/js/bead/editor.js` — ES module: the JBead editor (entry module of `edit_jbead_pattern.html`)
- `static/js/bead/views.js` — ES module: the bead views (`ViewDraft`, `ViewCorrected`, `ViewSimulated`, ruler, palette, bead list, `PatternView` layout). They read editor state from an `env` object (the editor's `viewEnv`: getters for `pattern`, `settings`, `colors`, `drawColors`, `drawSymbols`, …).
- `static/js/bead/model.js` — ES module: the JBead data model (`Pattern`, `BeadList` with used height, repeat and run-length bead list) and `loadModel` / `storeModel` for `data.model` / `data.repeat`. The repeat is the same smallest period the server computes (`patterns._bead_repeat`).
- `static/js/bead/selection.js` — ES module: moving a selection group (`captureGroup`, `stampGroup`, `affectedRect`, `restoreBaseline`). Beads are matched and moved by linear index, so shapes wrap across the tube's seam. Contract: a move only changes beads inside `affectedRect` (the undo snapshot).
- `static/js/bead/transforms.js` — ES module: "Arrange" (`selectionSource`, `arrangeCopies` at linear offsets, `arrangeUndoRows` for the undo snapshot) and the data side of resize / insert row / delete row (`resizedData`, `withRowInserted`, `withRowDeleted`).
- `static/js/bead/symbols.js` — ES module: per-colour symbol glyphs (`symbolFor`, `padSymbols`, `setSymbol`, `DEFAULT_SYMBOLS`; one string indexed by UTF-16 unit like the desktop, so a symbol must be a single BMP character) and `contrastingColor`.
- `static/js/bead/geometry.js` — ES module: geometry of the draft, corrected and simulated views (`foldIndex` / `rowStart` for the W / W + 1 corrected rows, `*Cell` draw rectangles, `*Hit` hit tests). The views' `draw()` and `pixelToDataCoord()` both use it; a row's parity is the absolute row's, independent of scrolling: the rope is folded once from its start and scrolling moves that picture (deliberately unlike the desktop, which re-folds from the first visible data row). Contract (`tests/js/bead-views.test.js`): every drawn bead hit-tests back to itself, and every visible bead is drawn. The unscrolled geometry must match the exports: `tests/data/bead_geometry.json` is generated from `beadexport.py` (`tests/test_bead_geometry.py`, `UPDATE_GOLDEN=1` to regenerate) and `tests/js/bead-geometry.test.js` checks the editor against it. The simulation shows `trunc(W / 2)` columns, like the desktop.
- `static/js/ui/common.js` — ES module: shared editor plumbing: `startEditor` (startup sequence), `savePattern`, the modified flag, local drafts in localStorage, navigation / close guards, `editorI18n()` (the `#tx-i18n` JSON block of the editor templates). `data` and `modified` are exported live bindings; the editor passes `readonly`, `preSave`, `init` and `captureThumbnails` to `startEditor`.
- `static/js/ui/` — ES modules: the shared editor UI. `commands.js` (`CommandBus` undo/redo with saved-state tracking — `markSaved`, `isAtSavedState` — plus the snapshot / command factories), `actions.js` (`ActionRegistry`), `menu.js`, `shortcuts.js` (`Shortcuts.install({ blocked })`), `modal.js`, `colorpicker.js`, `legal.js`, `tools.js` (`ToolRaster`), `selection.js` (`Selection` takes the editor's `cursor` / `pattern` as arguments; `Clipboard`). The editors own their `commandBus` / `toolDrag` state.

**ES modules:** all editor code is ES modules under `static/js/<area>/` (`ui`, `weave`, `bead`); each editor template loads one entry module with `<script type="module" src="{{ module_url('weave/editor.js') }}">`. `module_url` serves `static/js` from `/static/m/<version>/…` (one version for the whole tree, so relative imports are cache-busted together; old versions are served with `no-store`). Do not import modules via `url_for('static', …)`. The editors still start on the window `load` event. Pure logic belongs in its own module with the editor state turned into parameters, hooks or an `env` object, so it can be unit-tested. A feature that needs a helper still in `editor.js` gets that helper moved down into a shared module first, so imports stay acyclic.

Leaving an editor with unsaved changes never saves to the server implicitly: the in-app guards ask (save / discard / cancel) and tab close / reload keeps the changes in the local draft, which is offered for recovery on the next open.

### API

- `GET /api/pattern/<user>/<pattern>` — `{pattern, modified}`
- `PUT /api/pattern/<user>/<pattern>` — actions: `save-pattern` (returns `modified`), `set-publication-state`, `clone-pattern`, `rename-pattern`
- Export / print: `/<user>/<pattern>/export/<fmt>` and `/<user>/<pattern>/print` (GET renders the stored pattern; POST lets the owner render unsaved editor state)

### Authentication

Session-based, CSRF-protected (Flask-WTF), with login/registration rate limits. `support` is the reserved admin username; it can impersonate users. Users must verify their e-mail before logging in. Sessions end after 30 days of inactivity (`PERMANENT_SESSION_LIFETIME`, used for both the cookie and the account-activity check); a password change invalidates other sessions (`session_token_version`).

### Migrations

Alembic migrations in `migrations/versions/`. Run with Flask-Migrate (`flask db upgrade`); keep `flask db check` clean.

### i18n

Supports `de` and `en`. Translation files in `src/textileplatform/translations/`. User locale stored in DB; falls back to browser `Accept-Language`.

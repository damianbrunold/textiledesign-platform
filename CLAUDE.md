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

**Tests:** `pytest` (in-memory SQLite, see `tests/conftest.py`):
- `test_security.py` — auth, sessions, CSRF, rate limiting, passwords, e-mail changes
- `test_patterns.py` — metadata, upload, group access; `_make_user` / `_login` helpers
- `test_limits.py` — size limits, validation, print/export budgets, primary group scoping
- `test_formats.py` — `.jbb` / `.dbw` import and export against the desktop formats, upload decoding
- `test_format_golden.py` — the desktop sample files in `tests/data/formats/`: lossless desktop → platform → desktop round trips, plus snapshots in `golden/` (JSON digest per sample, reference PNGs for a subset). After an intentional import/export change: `UPDATE_GOLDEN=1 pytest tests/test_format_golden.py`, then review the diff.
- `test_format_properties.py` — hypothesis properties: `.dbw` / `.jbb` round trips (the `expected_*` helpers spell out the desktop normalisations), parsers only raise `PatternError`, everything `validate_pattern` accepts can be exported, bead repeat. `PROPERTY_SCALE=10` searches ten times as many examples; failing examples are replayed from `.hypothesis/`. Bugs the properties find get a deterministic regression test at the end of the file.
- `e2e/` — browser end-to-end tests (Playwright, marker `e2e`): the app runs in a server thread on the test's in-memory database; scenarios cover login/registration and the editors (edit, save, undo, close/navigation guards, drafts, export of unsaved state, read-only view). `pytest -m "not e2e"` skips them, `pytest tests/e2e --headed --slowmo 300` shows the browser. Seed data with `helpers.py` (`make_user`, `make_weave_pattern`, `stored_contents`, all inside `db_access()`; never hold it while the browser acts), drive the editors with `editor.py` (`open_editor`, `click_weave_cell(page, pane, i, j)`, `click_bead`, `save`, `is_modified`). Editor globals are reachable with `page.evaluate("pattern.weave.get(0, 0)")`. Uncaught page errors fail the test.

SQLite drops tzinfo, so tests call `_reset_access_date(user)` between requests.

**JavaScript tests:** `npm test` (Vitest; `npm run coverage` for coverage, `npm install` once first). Tests live in `tests/js/`. `tests/js/helpers/load.js` runs the real `static/js` scripts unchanged in a fresh jsdom window per test: `loadScripts([...])` loads named files, `await loadEditor("dbweave" | "jbead")` loads the script list parsed from the editor template, in order, after installing the template's bridge modules into the jsdom window. ES modules are tested by importing them directly (`tests/js/weave-model.test.js`). Top-level `let` / `const` / `class` bindings are not `window` properties, so tests reach them with `run("expression")` (e.g. `run("new CommandBus()")`, `run("pattern = new Pattern(8, 6, 4, 4)")`). `load` listeners (the editor startup) are held back until `fireLoad()`. Known bugs are pinned with `it.fails`. Random test data comes from `tests/js/helpers/random.js` (`randomSource(seed)`; a plain `seed % n` LCG repeats in its low bits and makes "random" patterns nearly identical).

**Coverage:** `pytest --cov` (branch coverage, configured in `pyproject.toml`; `--cov-report=html` for `htmlcov/`).

**Lint:** `ruff check .` — or `pre-commit run --all-files` (trailing whitespace, EOF, autopep8, ruff; migrations and `docs/` are excluded). Ruff's rule set is in `pyproject.toml`; formatting stays with autopep8. The `# noqa: E402` comments in `tests/conftest.py` keep autopep8 from hoisting the imports above the environment setup.

**JavaScript lint:** `npm run lint` (ESLint, `eslint.config.js`; also a pre-commit hook). Each `static/js` file sees the other files' top-level names as globals, so `no-undef` catches typos across the shared script scope.

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
- **`validation.py`** — `validate_pattern(contents, pattern_type)`: shape and size limits for pattern JSON; applied on save, upload, clone, export, print and legacy download. Limits are at least what the editors allow.
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
- `static/js/dbweave.js` — DB-WEAVE editor (classic script)
- `static/js/weave/model.js` — ES module: the DB-WEAVE data model (`Grid`, `Entering`, `Muster`, `Pattern` with weave calculation in both directions and repeat detection). No DOM, no editor globals; the editor connects through `Pattern`'s hooks (`isPegplan`, `recalcFixedEntering`, `afterRecalcFromWeave`). `weave/globals.js` is a transition bridge that puts the classes on `window` for the classic scripts.
- `static/js/weave/io.js` — ES module: conversion between the stored pattern JSON and the editor (`loadPatternData` / `storePatternData`, `loadSettings` / `storeSettings`); `dbweave.js`'s `initPatternData` / `savePatternData` / `initSettings` / `saveSettings` delegate to it. Save followed by load must give back the same data (`tests/js/weave-io.test.js`).
- `static/js/weave/arrange.js` — ES module: threading / treadling arrangement styles (`arrangeThreading`, `arrangeTreadling`; desktop ports run after every weave-driven recalculation) and the fixed threading (`recalcFixedEntering`, `updateFixedEntering`). Contract: an arrangement only renumbers shafts / treadles, the weave never changes (`tests/js/weave-arrange.test.js` checks this on random patterns).
- `static/js/weave/generators.js` — ES module: atlas / satin and twill insertion (`stampAtlas`, `stampTwill`) and twill completion (`completeTwill`) on a grid; they return the block to select. The editor wrappers (`_insertAtlas`, `_insertKoeper`, `_fillKoeper`) keep the undo command, cursor and recalculation.
- `static/js/weave/transforms.js` — ES module: switch side (`switchSide`, F11), pegplan invert / mirror / delete, repeat extension / reduction (`repeatWarp`, `repeatWeft`, F8 / F7). Contract: afterwards the weave is what the threading and tie-up + treadling (or pegplan) give (`tests/js/weave-transforms.test.js`). In pegplan mode F11 inverts the threaded shafts within the used wefts; F11 twice is a round trip except for a fully raised first / last used weft, which can't be told from "no weft" in the pegplan.
- `static/js/jbead.js` — JBead editor
- `static/js/common.js` — shared editor plumbing: `startEditor` (startup sequence), `savePattern`, the modified flag, local drafts in localStorage, navigation / close guards, `editorI18n()` (the `#tx-i18n` JSON block of the editor templates)
- `static/js/commands.js` — `CommandBus` undo/redo, including saved-state tracking (`markSaved`, `isAtSavedState`)
- `shortcuts.js`, `actions.js`, `menu.js`, `modal.js`, `colorpicker.js`, … — shared UI pieces

**Moving editor code into ES modules (in progress):** pure logic moves out of `dbweave.js` / `jbead.js` into modules under `static/js/<area>/`, with its editor globals turned into parameters or hooks. Templates load modules with `<script type="module" src="{{ module_url('weave/globals.js') }}">`: `module_url` serves `static/js` from `/static/m/<version>/…` (one version for the whole tree, so relative imports are cache-busted together; old versions are served with `no-store`). Do not import modules via `url_for('static', …)`. Classic code that still needs a moved name gets it from the area's `globals.js` bridge; module scripts run before the window `load` event that starts the editors, so classic code must not use bridged names at script load time.

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

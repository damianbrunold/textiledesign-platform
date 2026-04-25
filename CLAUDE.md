# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`textileplatform` is a Flask web application for managing textile pattern files — specifically DB-WEAVE (`.dbw`) weave patterns and JBead (`.jbb`) bead patterns. Users can upload, create, edit, share, and export patterns. The app is deployed as a WSGI app (`application = app` in `__init__.py`).

## Setup

Requires a `.env` file with:
```
DATABASE=postgresql://...
SECRET_KEY=...
ADMIN_PASSWORD=...
```

Install and run:
```bash
pip install -e .
flask --app textileplatform run
```

Initialize the database:
```bash
flask --app textileplatform init-db
```

Run database migrations:
```bash
flask --app textileplatform db upgrade
```

## Common Commands

**Lint:**
```bash
flake8 src/
```

**Tests:** There is no test suite currently.

**i18n / Babel translations:**
```bash
# Extract strings
pybabel extract -F babel.cfg -o messages.pot .
# Update existing translations
pybabel update -i messages.pot -d src/textileplatform/translations
# Compile translations
pybabel compile -d src/textileplatform/translations
```

**Admin CLI commands (via `flask --app textileplatform <cmd>`):**
- `list-users` / `list-access`
- `delete-user <user-name>`
- `reset-password <user-name>`
- `create-weave-pattern <user-name> <pattern-name>`
- `create-bead-pattern <user-name> <pattern-name>`
- `clean-up-non-verified-users`
- `ensure-primary-groups`

## Architecture

### Python package: `src/textileplatform/`

- **`app.py`** — Creates the bare Flask `app` instance.
- **`__init__.py`** — Main entry point: loads `.env`, configures app (DB, secret key), sets up Babel (i18n), Flask-Migrate, registers all CLI commands, and exposes `application = app` for WSGI.
- **`controller.py`** — All Flask routes and API endpoints. This is the bulk of the application logic.
- **`models.py`** — SQLAlchemy models: `User`, `Group`, `Membership`, `Pattern`, `Assignment`. DB table names are prefixed with `tx` (e.g., `txuser`, `txpattern`).
- **`patterns.py`** — Helper functions: `add_weave_pattern`, `add_bead_pattern`, `clone_pattern`, `get_patterns_for_user`.
- **`weavepattern.py`** / **`beadpattern.py`** — Parsers for `.dbw` and `.jbb` file formats.
- **`palette.py`** — Default color palettes for weave and bead patterns.
- **`name.py`** — URL-safe name generation (`from_label`) and validation (`is_valid`) for usernames and pattern names.
- **`mail.py`** — Email sending via localhost SMTP for verification, password recovery, and admin notifications.
- **`db.py`** — Flask-SQLAlchemy `db` instance.
- **`ensure.py`** — DB initialization helpers.

### Data model

Every user gets a **primary group** (same name as user). Patterns are stored in `txpattern` with their full JSON content in `contents`. Patterns belong to users (`owner_id`) and are shared into groups via `txassignment`. `txmembership` tracks which users belong to which groups with roles (`owner`, `writer`, `reader`) and states (`invited`, `accepted`, `declined`).

### Pattern types

- `"DB-WEAVE Pattern"` — Weave/loom patterns (`.dbw` or JSON with `max_shafts` key)
- `"JBead Pattern"` — Bead patterns (`.jbb` or JSON)

Uploaded files are auto-detected by file header (`@dbw3:` for DB-WEAVE, `(jbb` for JBead).

### Frontend

Jinja2 templates in `src/textileplatform/templates/`. Pattern editors are JS-heavy:
- `static/js/dbweave.js` — DB-WEAVE pattern editor
- `static/js/jbead.js` — JBead pattern editor
- `static/js/common.js` — Shared utilities

### API

`GET /api/pattern/<user>/<pattern>` — returns pattern JSON
`PUT /api/pattern/<user>/<pattern>` — actions: `save-pattern`, `set-publication-state`, `clone-pattern`

### Authentication

Session-based. `superuser` is the reserved admin username. Users must verify email before logging in. Auto-logout after 30 days of inactivity.

### Migrations

Alembic migrations in `migrations/versions/`. Run with Flask-Migrate (`flask db upgrade`).

### i18n

Supports `de` and `en`. Translation files in `src/textileplatform/translations/`. User locale stored in DB; falls back to browser `Accept-Language`.

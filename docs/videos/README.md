# Textile Platform — video tutorial series

Scripts for a series of 10 YouTube tutorials (5–8 minutes each) that show
what the Textile Platform is and how to use it for weave (DB-WEAVE) and
bead (JBead) patterns. Every video exists in two parallel versions with
identical content:

- English: [`en/`](en/) — platform at **textile-platform.ch**
- German: [`de/`](de/) — platform at **textil-plattform.ch**

The EN and DE file of a video have the same file name, the same scene
numbers, the same timings and the same on-screen actions. Only the
language (narration and UI labels) differs.

## The series

| # | Video | Main audience |
|---|---|---|
| 01 | [What is the Textile Platform?](en/01-what-is-the-textile-platform.md) | everyone |
| 02 | [Your pattern library](en/02-your-pattern-library.md) | everyone |
| 03 | [Weaving: first steps](en/03-weaving-first-steps.md) | newcomers |
| 04 | [Weaving: design tools](en/04-weaving-design-tools.md) | newcomers, weavers |
| 05 | [Weaving: advanced, print and export](en/05-weaving-advanced-print-export.md) | weavers |
| 06 | [Beading: first steps](en/06-beading-first-steps.md) | newcomers |
| 07 | [Beading: advanced, print and export](en/07-beading-advanced-print-export.md) | bead crocheters |
| 08 | [Sharing and groups](en/08-sharing-and-groups.md) | everyone, esp. desktop users |
| 09 | [Messages and collaboration](en/09-messages-and-collaboration.md) | everyone, esp. desktop users |
| 10 | [For DB-WEAVE and JBead desktop users](en/10-for-desktop-users.md) | desktop users |

Suggested playlists:

- **Newcomers:** 01 → 02 → 03 → 04 → 05 (weaving) and/or 06 → 07 (beading) → 08 → 09
- **DB-WEAVE / JBead desktop users:** 01 → 10 → 08 → 09, then the editor videos as reference

## Script format

Each script file has:

1. A header: working title, YouTube title, YouTube description, target
   length, audience, learning goals, and the **demo setup** that must be in
   place before recording.
2. A scene table: `| # | Time | On screen / action | Narration |`
   - *On screen / action* — what to show and click, with UI labels exactly
     as they appear in that language.
   - *Narration* — the complete voice-over text, ready to read.
3. A closing section with the YouTube chapter list (from the scene times)
   and a pointer to the next video.

Narration is written for about 140 words per minute; 5–8 minutes means
roughly 700–1100 words per video. German narration uses the formal "Sie"
and Swiss spelling (ss instead of ß), matching the platform's UI.

## Recording setup

**Never record against the production database or the restored copy of
it.** All videos are recorded on a clean local instance that contains only
the system accounts, the public example patterns and fictional demo users.

- Database: `textile_video` (local PostgreSQL). It contains the accounts
  `support`, `examples`, `beispiele` and the 32 public example patterns
  copied from production — nothing else.
- Start the app with the video environment (database, secret key,
  `SHOW_VERIFICATION_CODE=1`, the production `STARTER_*` values) and run a
  local SMTP sink so registration and verification mails work offline.
- Use a separate browser profile for recording, so no URL bar suggestions,
  autofill or history from real accounts appear on screen.
- Browser window 1920×1080, browser zoom 100 %; use **light** appearance
  (Profile ▸ Appearance) unless a scene says otherwise.
- Record EN and DE separately: switch the demo user's language in
  Profile ▸ Language before each recording, and use the EN or DE cast below.
- Use only fake e-mail addresses at `example.com`.

## Demo cast

| Role | DE | EN |
|---|---|---|
| Weaving teacher, group owner | Anna Weber | Anna Weaver |
| Bead crocheter | Ben Perle | Ben Beader |
| Student / new user | Carla Muster | Carla Sample |
| Shared group (weaving course) | Webkurs Musterhausen | Weaving Guild Sampleton |

Video 01 registers the "new user" live; all other accounts are prepared
beforehand. Each script's header lists the exact state it needs
(patterns, group members, pending invitations, unread messages, …).

## Glossary EN ↔ DE

Use these terms consistently in narration; they match the UI.

| English | German |
|---|---|
| Textile Platform | Textil-Plattform |
| pattern | Muster |
| weave pattern / DB-WEAVE pattern | Webmuster / DB-WEAVE Muster |
| bead pattern / JBead pattern | Perlenmuster / JBead Muster |
| warp / weft | Kette / Schuss |
| warp thread / weft thread | Kettfaden / Schussfaden |
| shaft (harness) / treadle | Schaft / Tritt |
| threading | Einzug |
| tie-up | Aufknüpfung |
| treadling | Trittfolge |
| pegplan | Schlagpatrone |
| pattern (weave grid) | Gewebe |
| reed threading | Blatteinzug |
| warp colors / weft colors | Kettfarben / Schussfarben |
| repeat | Rapport |
| range | Bereich |
| twill / satin / plain weave | Köper / Atlas / Leinwand |
| draft view / color view / simulation view | Entwurfsansicht / Farbansicht / Simulationsansicht |
| bead crochet rope | gehäkelte Perlenkette |
| circumference | Umfang |
| corrected view | Korrigierte Ansicht |
| report view / bead list | Berichtsansicht / Perlenliste |
| pencil / select / fill / pipette | Stift / Auswählen / Füllen / Pipette |
| group, personal group, shared group | Gruppe, persönliche Gruppe, gemeinsame Gruppe |
| owner / writer / reader | Eigentümer / Autor / Leser |
| invitation | Einladung |
| messages, group chat | Nachrichten, Gruppenchat |
| public / private | öffentlich / privat |
| clone | klonen |

## Before recording — checklist

- The app runs version 1.0.56 or later. That version fixes the issues that
  would otherwise show on camera: German labels on the pattern list,
  the untranslated Overview (F4) window, missing bead repeats in the list,
  silent upload failures, and editable cells in read-only weave patterns.
- The demo state for the video is prepared (see the script header).
- Notifications, other tabs and bookmarks bar are hidden.
- For German recordings the demo user's language is set to Deutsch; for
  English recordings to English.

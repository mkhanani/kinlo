# Data

Everything kinlo knows is in one SQLite file, `kinlo.db`, in the app's own data folder. Each build channel (dev, staging, production) has its own folder, so they never share a database. See `ENVIRONMENTS.md`.

## Schema

The schema is the numbered SQL files in `src-tauri/migrations/`. They are the source of truth and are commented.

| Table | Holds |
|---|---|
| `contacts` | People. Emails, phones and socials are JSON arrays of `{ label?, value }`. |
| `avatars` | One small JPEG thumbnail per person, stored as a data URL. |
| `tags`, `contact_tags` | Tags and who has them. Tag names are case-insensitive. |
| `interactions` | Calls, messages, meetings, emails and notes on a contact's timeline. |
| `reminders` | Things to do, optionally about a contact, optionally repeating. |
| `stages`, `deals` | The pipeline. Seeded with Lead, Talking, Proposal, Won, Lost; the first three can be changed. |
| `ai_threads`, `ai_messages` | Assistant conversations. |
| `settings` | Key and JSON value. Never API keys: those live in the OS keychain. |
| `search` | FTS5 index over names, company, role, notes and interaction summaries. |

### The two sides

kinlo has a personal side and a business side. A person can be on either, or on both:

- `contacts.personal` is 1 when they are part of your personal life.
- `contacts.business` is NULL when they are not a work contact, otherwise what they are to your work: `lead`, `client`, or `other` (a supplier, a partner, your accountant).

Reminders have a `side` too. One about a person who is on only one side always takes that side. For someone on both, or a reminder about nobody, it is the side it was made on.

Everyone is on at least one side; a trigger refuses anything else. Which sides the user has switched on, and which one is on screen, are the `sides` and `activeSide` settings. The pipeline belongs to the business side.

### Rules the database enforces

These are triggers, so they hold no matter what writes to the database (the UI, the assistant's tools, an import):

- Logging a call, message, meeting or email moves the contact's `last_contacted_at` forward. A note does not: it is something you wrote down, not contact. Editing or deleting an interaction moves the date back only if that interaction was the one that set it.
- A deal's `closed_at` is set when it enters a stage with an outcome (Won, Lost) and cleared when it leaves.
- The search index follows every change to contacts and interactions.
- Deleting a contact deletes their interactions, reminders, deals, tag links and photo.

### Where this differs from the build brief

- People have `personal` and `business` instead of a single `kind`, so one person can be on both sides.
- Photos are stored in the database (`avatars`) instead of as a file path, so they travel with the one data file.
- `stages` has an `outcome` column, so the app knows which stages close a deal.
- Ids are random UUIDs stored as text.

## Getting data out and in

Settings has a "Your data" section. It shows where `kinlo.db` is, with a button that opens the folder.

| | What it does |
|---|---|
| Export everything | One JSON file holding every table, row for row (`exportAll` in `src/data/transfer.ts`). API keys are not in it, because they are not in the database. |
| Export people | A CSV with one row per person, archived people included. It opens in any spreadsheet or address book. Cells that a spreadsheet would run as a formula are written as plain text. |
| Import people | Reads a CSV from Google Contacts, Outlook, most address books, or kinlo itself. It shows what it found before adding anyone. |

Import only ever adds. Someone is treated as already in kinlo when the name is the same, unless both have email addresses and none match, which means two people who share a name. Those rows are left out and the existing person is not touched; details the file has for them are not merged in. Rows without a name are skipped. A birthday is only read when the date can mean one thing: `03/04/1990` could be March or April, so it is left out rather than guessed.

The JSON export is a copy for safekeeping and for moving to other tools; this version cannot read it back in. The complete backup is the database file itself: close kinlo, copy `kinlo.db`, and put it back in the same folder to restore.

In the app, the system's own Save and Open dialogs choose the file (`src-tauri/src/files.rs`). The web view hands over text and a suggested name, or receives text; it never names a path.

## Pipeline stages

The open stages are the user's to change from the Pipeline page: rename, add (up to eight), reorder and remove. A stage has to be empty before it can be removed, so a deal is never moved or lost without the user doing it, and one open stage always remains. Won and Lost are fixed, because closing a deal depends on them.

## Changing the schema

Add a new file, `000N_what_it_does.sql`, and register it in `src-tauri/src/db.rs`. Never edit a migration that has shipped: installed apps have already run it. A test fails if a file is not registered or the numbering has a gap.

## The data layer

`src/data/` is the only code that writes SQL. Screens call its typed functions (`createContact`, `addInteraction`, `moveDeal`, ...) and never talk to the database directly.

It runs on a small `Driver` interface with three implementations, all applying the same migration files:

| Where | Driver |
|---|---|
| The desktop app | `drivers/tauri.ts`, the SQL plugin |
| Unit tests | `drivers/node.ts`, in-memory SQLite |
| `npm run dev` in a browser | `drivers/wasm.ts`, SQLite in WebAssembly, kept for the tab's session |

So the unit tests run the real queries against the real schema, and the UI can be previewed in a browser with working data.

There are no multi-statement transactions. The plugin gives each call to a connection pool, so a `BEGIN` and its `COMMIT` could land on different connections. Anything that must be atomic is one statement or a trigger.

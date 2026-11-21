-- kinlo schema, version 1.
--
-- Conventions
--   ids          TEXT, random UUIDs made by the app
--   timestamps   TEXT, ISO 8601 in UTC, for example 2026-01-31T09:30:00.000Z
--   dates        TEXT, YYYY-MM-DD
--   birthday     TEXT, YYYY-MM-DD, or --MM-DD when the year is not known
--   json columns TEXT holding a JSON array, checked with json_valid
--   booleans     INTEGER 0 or 1

CREATE TABLE contacts (
  id                 TEXT PRIMARY KEY NOT NULL,
  name               TEXT NOT NULL CHECK (length(trim(name)) > 0),
  nickname           TEXT,
  kind               TEXT NOT NULL DEFAULT 'personal'
                       CHECK (kind IN ('personal', 'client', 'lead', 'other')),
  company            TEXT,
  role               TEXT,
  emails             TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(emails)),
  phones             TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(phones)),
  socials            TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(socials)),
  location           TEXT,
  birthday           TEXT,
  how_we_met         TEXT,
  notes              TEXT,
  keep_in_touch_days INTEGER CHECK (keep_in_touch_days IS NULL OR keep_in_touch_days > 0),
  last_contacted_at  TEXT,
  avatar_path        TEXT,
  archived           INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

CREATE INDEX contacts_by_name ON contacts (archived, name COLLATE NOCASE);
CREATE INDEX contacts_by_kind ON contacts (kind);

CREATE TABLE tags (
  id         TEXT PRIMARY KEY NOT NULL,
  name       TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
  created_at TEXT NOT NULL
);

CREATE TABLE contact_tags (
  contact_id TEXT NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  tag_id     TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, tag_id)
) WITHOUT ROWID;

CREATE INDEX contact_tags_by_tag ON contact_tags (tag_id);

CREATE TABLE interactions (
  id          TEXT PRIMARY KEY NOT NULL,
  contact_id  TEXT NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('call', 'message', 'meeting', 'email', 'note')),
  happened_at TEXT NOT NULL,
  summary     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE INDEX interactions_by_contact ON interactions (contact_id, happened_at DESC);

-- Adding an interaction moves the contact's last_contacted_at forward.
CREATE TRIGGER interactions_after_insert AFTER INSERT ON interactions
BEGIN
  UPDATE contacts
     SET last_contacted_at = NEW.happened_at
   WHERE id = NEW.contact_id
     AND (last_contacted_at IS NULL OR last_contacted_at < NEW.happened_at);
END;

-- Editing or removing an interaction only pulls last_contacted_at back if that interaction
-- was the one that set it. A date the user typed in by hand is left alone.
CREATE TRIGGER interactions_after_update AFTER UPDATE OF happened_at, contact_id ON interactions
BEGIN
  UPDATE contacts
     SET last_contacted_at = (
           SELECT max(happened_at) FROM interactions WHERE contact_id = OLD.contact_id)
   WHERE id = OLD.contact_id
     AND last_contacted_at = OLD.happened_at;

  UPDATE contacts
     SET last_contacted_at = NEW.happened_at
   WHERE id = NEW.contact_id
     AND (last_contacted_at IS NULL OR last_contacted_at < NEW.happened_at);
END;

CREATE TRIGGER interactions_after_delete AFTER DELETE ON interactions
BEGIN
  UPDATE contacts
     SET last_contacted_at = (
           SELECT max(happened_at) FROM interactions WHERE contact_id = OLD.contact_id)
   WHERE id = OLD.contact_id
     AND last_contacted_at = OLD.happened_at;
END;

CREATE TABLE reminders (
  id          TEXT PRIMARY KEY NOT NULL,
  contact_id  TEXT REFERENCES contacts (id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK (length(trim(title)) > 0),
  due_at      TEXT NOT NULL,
  repeat_rule TEXT CHECK (repeat_rule IS NULL
                          OR repeat_rule IN ('daily', 'weekly', 'monthly', 'yearly')),
  done_at     TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX reminders_open ON reminders (due_at) WHERE done_at IS NULL;
CREATE INDEX reminders_by_contact ON reminders (contact_id);

CREATE TABLE stages (
  id       TEXT PRIMARY KEY NOT NULL,
  name     TEXT NOT NULL CHECK (length(trim(name)) > 0),
  position INTEGER NOT NULL,
  -- Set on the stages that end a deal. A deal in one of these is closed.
  outcome  TEXT CHECK (outcome IS NULL OR outcome IN ('won', 'lost'))
);

CREATE TABLE deals (
  id             TEXT PRIMARY KEY NOT NULL,
  contact_id     TEXT NOT NULL REFERENCES contacts (id) ON DELETE CASCADE,
  title          TEXT NOT NULL CHECK (length(trim(title)) > 0),
  stage_id       TEXT NOT NULL REFERENCES stages (id) ON DELETE RESTRICT,
  value          REAL CHECK (value IS NULL OR value >= 0),
  currency       TEXT NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
  expected_close TEXT,
  notes          TEXT,
  -- Order inside a stage. Fractional, so a drag only rewrites the moved deal.
  position       REAL NOT NULL DEFAULT 0,
  closed_at      TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX deals_by_stage ON deals (stage_id, position);
CREATE INDEX deals_by_contact ON deals (contact_id);

-- closed_at follows the stage, wherever the move comes from.
CREATE TRIGGER deals_after_insert AFTER INSERT ON deals
WHEN NEW.closed_at IS NULL
 AND (SELECT outcome FROM stages WHERE id = NEW.stage_id) IS NOT NULL
BEGIN
  UPDATE deals SET closed_at = NEW.created_at WHERE id = NEW.id;
END;

CREATE TRIGGER deals_after_move AFTER UPDATE OF stage_id ON deals
WHEN NEW.stage_id <> OLD.stage_id
BEGIN
  UPDATE deals
     SET closed_at = CASE
           WHEN (SELECT outcome FROM stages WHERE id = NEW.stage_id) IS NULL THEN NULL
           ELSE coalesce(OLD.closed_at, NEW.updated_at)
         END
   WHERE id = NEW.id;
END;

CREATE TABLE ai_threads (
  id         TEXT PRIMARY KEY NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_messages (
  id         TEXT PRIMARY KEY NOT NULL,
  thread_id  TEXT NOT NULL REFERENCES ai_threads (id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  -- JSON: the message parts (text, tool calls, tool results) as the AI SDK gives them.
  content    TEXT NOT NULL CHECK (json_valid(content)),
  created_at TEXT NOT NULL
);

CREATE INDEX ai_messages_by_thread ON ai_messages (thread_id, created_at);

-- Key/value settings. Values are JSON. API keys never go here: they live in the OS keychain.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL CHECK (json_valid(value))
) WITHOUT ROWID;

-- Every reminder belongs to one side, so "Renew passport" stays out of your work list and
-- "Send invoice" stays out of your personal one.
--
-- A reminder about a person who is on only one side always takes that side. For someone
-- on both, or for a reminder about nobody, it is the side it was made on.

ALTER TABLE reminders ADD COLUMN side TEXT NOT NULL DEFAULT 'personal'
  CHECK (side IN ('personal', 'business'));

-- Existing reminders about someone who is only a work contact belong to the business side.
UPDATE reminders
   SET side = 'business'
 WHERE contact_id IN (SELECT id FROM contacts WHERE personal = 0);

DROP INDEX reminders_open;
CREATE INDEX reminders_open ON reminders (side, due_at) WHERE done_at IS NULL;

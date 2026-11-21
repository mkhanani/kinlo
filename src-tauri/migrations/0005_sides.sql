-- kinlo has two sides: personal and business. A person can be on either, or on both.
--
--   personal  1 when they are part of your personal life
--   business  NULL when they are not a work contact, otherwise what they are to your work:
--             'lead', 'client', or 'other' (a supplier, a partner, your accountant)
--
-- This replaces the single `kind` column.

ALTER TABLE contacts ADD COLUMN personal INTEGER NOT NULL DEFAULT 0 CHECK (personal IN (0, 1));
ALTER TABLE contacts ADD COLUMN business TEXT
  CHECK (business IS NULL OR business IN ('lead', 'client', 'other'));

UPDATE contacts SET personal = 1 WHERE kind = 'personal';
UPDATE contacts SET business = kind WHERE kind IN ('lead', 'client', 'other');

DROP INDEX contacts_by_kind;
ALTER TABLE contacts DROP COLUMN kind;

CREATE INDEX contacts_personal ON contacts (name COLLATE NOCASE) WHERE personal = 1 AND archived = 0;
CREATE INDEX contacts_business ON contacts (name COLLATE NOCASE) WHERE business IS NOT NULL AND archived = 0;

-- Everyone is on at least one side.
CREATE TRIGGER contacts_need_a_side_insert BEFORE INSERT ON contacts
WHEN NEW.personal = 0 AND NEW.business IS NULL
BEGIN
  SELECT RAISE(ABORT, 'A person has to be on the personal side, the business side, or both.');
END;

CREATE TRIGGER contacts_need_a_side_update BEFORE UPDATE OF personal, business ON contacts
WHEN NEW.personal = 0 AND NEW.business IS NULL
BEGIN
  SELECT RAISE(ABORT, 'A person has to be on the personal side, the business side, or both.');
END;

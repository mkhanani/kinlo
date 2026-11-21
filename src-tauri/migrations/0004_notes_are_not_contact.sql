-- A note is something you wrote down about a person, not contact with them.
-- From here on only calls, messages, meetings and emails move last_contacted_at.

DROP TRIGGER interactions_after_insert;
DROP TRIGGER interactions_after_update;
DROP TRIGGER interactions_after_delete;

CREATE TRIGGER interactions_after_insert AFTER INSERT ON interactions
WHEN NEW.type <> 'note'
BEGIN
  UPDATE contacts
     SET last_contacted_at = NEW.happened_at
   WHERE id = NEW.contact_id
     AND (last_contacted_at IS NULL OR last_contacted_at < NEW.happened_at);
END;

-- Editing or removing an interaction only pulls last_contacted_at back if that interaction
-- was the one that set it. A date the user typed in by hand is left alone.
CREATE TRIGGER interactions_after_update AFTER UPDATE OF happened_at, type, contact_id ON interactions
BEGIN
  UPDATE contacts
     SET last_contacted_at = (
           SELECT max(happened_at) FROM interactions
            WHERE contact_id = OLD.contact_id AND type <> 'note')
   WHERE id = OLD.contact_id
     AND OLD.type <> 'note'
     AND last_contacted_at = OLD.happened_at;

  UPDATE contacts
     SET last_contacted_at = NEW.happened_at
   WHERE id = NEW.contact_id
     AND NEW.type <> 'note'
     AND (last_contacted_at IS NULL OR last_contacted_at < NEW.happened_at);
END;

CREATE TRIGGER interactions_after_delete AFTER DELETE ON interactions
WHEN OLD.type <> 'note'
BEGIN
  UPDATE contacts
     SET last_contacted_at = (
           SELECT max(happened_at) FROM interactions
            WHERE contact_id = OLD.contact_id AND type <> 'note')
   WHERE id = OLD.contact_id
     AND last_contacted_at = OLD.happened_at;
END;

-- Put right anyone whose last_contacted_at was set by a note under the old rule.
UPDATE contacts
   SET last_contacted_at = (
         SELECT max(i.happened_at) FROM interactions i
          WHERE i.contact_id = contacts.id AND i.type <> 'note')
 WHERE EXISTS (
         SELECT 1 FROM interactions i
          WHERE i.contact_id = contacts.id AND i.type = 'note'
            AND i.happened_at = contacts.last_contacted_at)
   AND NOT EXISTS (
         SELECT 1 FROM interactions i
          WHERE i.contact_id = contacts.id AND i.type <> 'note'
            AND i.happened_at = contacts.last_contacted_at);

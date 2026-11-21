-- Full-text search: one row per contact, kept in step by triggers.
-- Covers the contact's name, nickname, company, role, notes and the summaries of
-- their interactions.

CREATE VIRTUAL TABLE search USING fts5 (
  contact_id UNINDEXED,
  name,
  nickname,
  company,
  role,
  notes,
  interactions,
  tokenize = 'unicode61 remove_diacritics 2',
  prefix = '2 3'
);

CREATE TRIGGER search_contacts_insert AFTER INSERT ON contacts
BEGIN
  INSERT INTO search (contact_id, name, nickname, company, role, notes, interactions)
  VALUES (NEW.id, NEW.name, NEW.nickname, NEW.company, NEW.role,
          coalesce(NEW.notes, '') || ' ' || coalesce(NEW.how_we_met, ''), '');
END;

CREATE TRIGGER search_contacts_update
AFTER UPDATE OF name, nickname, company, role, notes, how_we_met ON contacts
BEGIN
  UPDATE search
     SET name = NEW.name,
         nickname = NEW.nickname,
         company = NEW.company,
         role = NEW.role,
         notes = coalesce(NEW.notes, '') || ' ' || coalesce(NEW.how_we_met, '')
   WHERE contact_id = NEW.id;
END;

CREATE TRIGGER search_contacts_delete AFTER DELETE ON contacts
BEGIN
  DELETE FROM search WHERE contact_id = OLD.id;
END;

CREATE TRIGGER search_interactions_insert AFTER INSERT ON interactions
BEGIN
  UPDATE search
     SET interactions = (SELECT coalesce(group_concat(summary, ' '), '')
                           FROM interactions WHERE contact_id = NEW.contact_id)
   WHERE contact_id = NEW.contact_id;
END;

CREATE TRIGGER search_interactions_update AFTER UPDATE OF summary, contact_id ON interactions
BEGIN
  UPDATE search
     SET interactions = (SELECT coalesce(group_concat(summary, ' '), '')
                           FROM interactions WHERE contact_id = OLD.contact_id)
   WHERE contact_id = OLD.contact_id;
  UPDATE search
     SET interactions = (SELECT coalesce(group_concat(summary, ' '), '')
                           FROM interactions WHERE contact_id = NEW.contact_id)
   WHERE contact_id = NEW.contact_id;
END;

CREATE TRIGGER search_interactions_delete AFTER DELETE ON interactions
BEGIN
  UPDATE search
     SET interactions = (SELECT coalesce(group_concat(summary, ' '), '')
                           FROM interactions WHERE contact_id = OLD.contact_id)
   WHERE contact_id = OLD.contact_id;
END;

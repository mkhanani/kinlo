-- Snoozing moves a reminder's due time and remembers where it was.
--
-- `due_at` stays the one time everything shows and sorts by. `snoozed_from` holds the
-- original time while a reminder is snoozed, so a repeating reminder keeps its rhythm:
-- "every Monday", snoozed to Tuesday, goes back to Monday next week.

ALTER TABLE reminders ADD COLUMN snoozed_from TEXT;

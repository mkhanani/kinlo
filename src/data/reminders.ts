import { db, type SqlValue } from "./driver";
import type { Reminder, ReminderInput, ReminderWithContact, RepeatRule } from "./types";
import { buildSet, newId, nowIso, text } from "./util";

export interface ReminderFilter {
  /** Defaults to "open". */
  status?: "open" | "done" | "all";
  contactId?: string;
  /** Only reminders due at or before this moment. */
  dueBefore?: string;
}

export async function listReminders(filter: ReminderFilter = {}): Promise<ReminderWithContact[]> {
  const where: string[] = [];
  const params: SqlValue[] = [];
  const add = (value: SqlValue) => `$${params.push(value)}`;

  const status = filter.status ?? "open";
  if (status === "open") where.push("r.done_at IS NULL");
  if (status === "done") where.push("r.done_at IS NOT NULL");
  if (filter.contactId) where.push(`r.contact_id = ${add(filter.contactId)}`);
  if (filter.dueBefore) where.push(`r.due_at <= ${add(filter.dueBefore)}`);

  return db().select<ReminderWithContact>(
    `SELECT r.*, c.name AS contact_name
       FROM reminders r LEFT JOIN contacts c ON c.id = r.contact_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY r.due_at, r.created_at`,
    params,
  );
}

export async function getReminder(id: string): Promise<Reminder | null> {
  const rows = await db().select<Reminder>("SELECT * FROM reminders WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createReminder(input: ReminderInput): Promise<Reminder> {
  const title = input.title.trim();
  if (!title) throw new Error("A reminder needs a title.");
  const id = newId();
  await db().execute(
    `INSERT INTO reminders (id, contact_id, title, due_at, repeat_rule, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.contact_id ?? null, title, input.due_at, input.repeat_rule ?? null, nowIso()],
  );
  return (await getReminder(id))!;
}

export async function updateReminder(
  id: string,
  patch: Partial<Pick<Reminder, "title" | "due_at" | "repeat_rule" | "contact_id">>,
): Promise<void> {
  if (patch.title !== undefined && !patch.title.trim()) throw new Error("A reminder needs a title.");
  const { clause, params } = buildSet(
    patch,
    { title: (v) => text(v) ?? "", due_at: (v) => v, repeat_rule: (v) => v, contact_id: (v) => v },
    2,
  );
  if (clause) await db().execute(`UPDATE reminders SET ${clause} WHERE id = $1`, [id, ...params]);
}

/**
 * The next due time for a repeating reminder: the first step of the rule that lands
 * after `after`. Month and year steps keep the day of the month where it exists and
 * otherwise use the month's last day (Jan 31 monthly gives Feb 28, then Mar 31).
 */
export function nextDue(dueAt: string, rule: RepeatRule, after: string = nowIso()): string {
  const start = new Date(dueAt);
  const floor = new Date(after).getTime();
  for (let step = 1; step < 100_000; step++) {
    const next = new Date(start);
    if (rule === "daily") next.setUTCDate(start.getUTCDate() + step);
    else if (rule === "weekly") next.setUTCDate(start.getUTCDate() + 7 * step);
    else {
      const months = rule === "monthly" ? step : 12 * step;
      const day = start.getUTCDate();
      next.setUTCDate(1);
      next.setUTCMonth(start.getUTCMonth() + months);
      const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
      next.setUTCDate(Math.min(day, lastDay));
    }
    if (next.getTime() > floor) return next.toISOString();
  }
  throw new Error("Could not work out the next due date.");
}

/**
 * Marks a reminder done. A repeating reminder is not closed: it moves to its next due
 * time and stays open. Either way it is one statement.
 */
export async function completeReminder(id: string, now: string = nowIso()): Promise<Reminder | null> {
  const reminder = await getReminder(id);
  if (!reminder || reminder.done_at) return reminder;
  if (reminder.repeat_rule) {
    const due = nextDue(reminder.due_at, reminder.repeat_rule, now);
    await db().execute("UPDATE reminders SET due_at = $2 WHERE id = $1 AND done_at IS NULL", [id, due]);
  } else {
    await db().execute("UPDATE reminders SET done_at = $2 WHERE id = $1 AND done_at IS NULL", [id, now]);
  }
  return getReminder(id);
}

export async function reopenReminder(id: string): Promise<void> {
  await db().execute("UPDATE reminders SET done_at = NULL WHERE id = $1", [id]);
}

export async function deleteReminder(id: string): Promise<void> {
  await db().execute("DELETE FROM reminders WHERE id = $1", [id]);
}

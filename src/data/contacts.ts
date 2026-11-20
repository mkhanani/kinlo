import { db, type SqlValue } from "./driver";
import type { Contact, ContactFilter, ContactInput, ContactPatch, LabeledValue, OverdueContact, Tag } from "./types";
import { buildSet, newId, nowIso, parseJsonArray, text, toFtsQuery } from "./util";

interface ContactRow extends Omit<Contact, "emails" | "phones" | "socials" | "archived" | "tags"> {
  emails: string;
  phones: string;
  socials: string;
  archived: number;
  tags_json: string | null;
  days_overdue?: number;
}

const SELECT = `
  SELECT c.*,
         (SELECT json_group_array(json_object('id', t.id, 'name', t.name))
            FROM (SELECT t.id, t.name
                    FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
                   WHERE ct.contact_id = c.id
                   ORDER BY t.name COLLATE NOCASE) t) AS tags_json`;

/** Whole days past the keep-in-touch interval, counted from the last contact (or from when they were added). */
const daysOverdue = (now: string) =>
  `(CAST(julianday(${now}) - julianday(coalesce(c.last_contacted_at, c.created_at)) AS INTEGER) - c.keep_in_touch_days)`;

function toContact(row: ContactRow): Contact {
  const { tags_json, days_overdue: _days, ...rest } = row;
  return {
    ...rest,
    emails: parseJsonArray<LabeledValue>(row.emails),
    phones: parseJsonArray<LabeledValue>(row.phones),
    socials: parseJsonArray<LabeledValue>(row.socials),
    archived: row.archived === 1,
    tags: parseJsonArray<Tag>(tags_json),
  };
}

function cleanList(list: LabeledValue[] | null | undefined): string {
  const cleaned = (list ?? [])
    .map((item) => ({ label: text(item.label) ?? undefined, value: item.value.trim() }))
    .filter((item) => item.value !== "");
  return JSON.stringify(cleaned);
}

export async function listContacts(filter: ContactFilter = {}, now: string = nowIso()): Promise<Contact[]> {
  const where: string[] = [];
  const params: SqlValue[] = [];
  const add = (value: SqlValue) => `$${params.push(value)}`;

  if (!filter.includeArchived) where.push("c.archived = 0");
  if (filter.kind) where.push(`c.kind = ${add(filter.kind)}`);
  if (filter.tagId) {
    where.push(`EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = ${add(filter.tagId)})`);
  }
  if (filter.overdueOnly) {
    where.push(`c.keep_in_touch_days IS NOT NULL AND ${daysOverdue(add(now))} > 0`);
  }
  if (filter.search?.trim()) {
    const query = toFtsQuery(filter.search);
    if (!query) return [];
    where.push(`c.id IN (SELECT contact_id FROM search WHERE search MATCH ${add(query)})`);
  }

  const rows = await db().select<ContactRow>(
    `${SELECT} FROM contacts c
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY c.name COLLATE NOCASE, c.created_at`,
    params,
  );
  return rows.map(toContact);
}

export async function getContact(id: string): Promise<Contact | null> {
  const rows = await db().select<ContactRow>(`${SELECT} FROM contacts c WHERE c.id = $1`, [id]);
  return rows[0] ? toContact(rows[0]) : null;
}

/** People whose keep-in-touch interval has passed, most overdue first. */
export async function listOverdueContacts(now: string = nowIso()): Promise<OverdueContact[]> {
  const rows = await db().select<ContactRow>(
    `${SELECT}, ${daysOverdue("$1")} AS days_overdue
       FROM contacts c
      WHERE c.archived = 0
        AND c.keep_in_touch_days IS NOT NULL
        AND ${daysOverdue("$1")} > 0
      ORDER BY days_overdue DESC, c.name COLLATE NOCASE`,
    [now],
  );
  return rows.map((row) => ({ ...toContact(row), days_overdue: row.days_overdue ?? 0 }));
}

export async function createContact(input: ContactInput): Promise<Contact> {
  const name = input.name.trim();
  if (!name) throw new Error("A person needs a name.");
  const id = newId();
  const now = nowIso();
  await db().execute(
    `INSERT INTO contacts (id, name, nickname, kind, company, role, emails, phones, socials, location,
                           birthday, how_we_met, notes, keep_in_touch_days, last_contacted_at,
                           avatar_path, archived, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $18)`,
    [
      id,
      name,
      text(input.nickname),
      input.kind ?? "personal",
      text(input.company),
      text(input.role),
      cleanList(input.emails),
      cleanList(input.phones),
      cleanList(input.socials),
      text(input.location),
      text(input.birthday),
      text(input.how_we_met),
      text(input.notes),
      input.keep_in_touch_days ?? null,
      input.last_contacted_at ?? null,
      text(input.avatar_path),
      input.archived ? 1 : 0,
      now,
    ],
  );
  return (await getContact(id))!;
}

export async function updateContact(id: string, patch: ContactPatch): Promise<Contact> {
  if (patch.name !== undefined && !patch.name.trim()) throw new Error("A person needs a name.");
  const { clause, params } = buildSet<ContactPatch>(
    patch,
    {
      name: (v) => (v ?? "").trim(),
      nickname: text,
      kind: (v) => v ?? "personal",
      company: text,
      role: text,
      emails: cleanList,
      phones: cleanList,
      socials: cleanList,
      location: text,
      birthday: text,
      how_we_met: text,
      notes: text,
      keep_in_touch_days: (v) => v,
      last_contacted_at: (v) => v,
      avatar_path: text,
      archived: (v) => (v ? 1 : 0),
    },
    3,
  );
  if (clause) {
    await db().execute(`UPDATE contacts SET ${clause}, updated_at = $2 WHERE id = $1`, [id, nowIso(), ...params]);
  }
  const contact = await getContact(id);
  if (!contact) throw new Error("That person no longer exists.");
  return contact;
}

export const archiveContact = (id: string, archived = true) => updateContact(id, { archived });

/** Removes the person and, with them, their interactions, reminders, deals and tag links. */
export async function deleteContact(id: string): Promise<void> {
  await db().execute("DELETE FROM contacts WHERE id = $1", [id]);
}

export async function countContacts(): Promise<number> {
  const rows = await db().select<{ n: number }>("SELECT count(*) AS n FROM contacts WHERE archived = 0");
  return rows[0]?.n ?? 0;
}

/** For the command palette: best matches first, with a short excerpt of what matched. */
export async function searchContacts(input: string, limit = 20) {
  const query = toFtsQuery(input);
  if (!query) return [];
  const rows = await db().select<ContactRow & { excerpt: string }>(
    `${SELECT},
            snippet(search, -1, '[', ']', '…', 12) AS excerpt
       FROM search
       JOIN contacts c ON c.id = search.contact_id
      WHERE search MATCH $1 AND c.archived = 0
      ORDER BY bm25(search, 0, 10.0, 8.0, 4.0, 2.0, 1.0, 1.0)
      LIMIT $2`,
    [query, limit],
  );
  return rows.map(({ excerpt, ...row }) => ({ contact: toContact(row), excerpt }));
}

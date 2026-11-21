import { db } from "./driver";
import type { Tag, TagWithCount } from "./types";
import { newId, nowIso } from "./util";

export async function listTags(): Promise<TagWithCount[]> {
  return db().select<TagWithCount>(
    `SELECT t.id, t.name,
            (SELECT count(*) FROM contact_tags ct
               JOIN contacts c ON c.id = ct.contact_id
              WHERE ct.tag_id = t.id AND c.archived = 0) AS contact_count
       FROM tags t
      ORDER BY t.name COLLATE NOCASE`,
  );
}

/** Returns the tag with this name, creating it if needed. Names are case-insensitive. */
export async function ensureTag(name: string): Promise<Tag> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A tag needs a name.");
  await db().execute(
    "INSERT INTO tags (id, name, created_at) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING",
    [newId(), trimmed, nowIso()],
  );
  const rows = await db().select<Tag>("SELECT id, name FROM tags WHERE name = $1", [trimmed]);
  return rows[0]!;
}

export async function renameTag(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A tag needs a name.");
  const clash = await db().select<{ id: string }>("SELECT id FROM tags WHERE name = $1 AND id <> $2", [trimmed, id]);
  if (clash.length) throw new Error("There is already a tag with that name.");
  await db().execute("UPDATE tags SET name = $2 WHERE id = $1", [id, trimmed]);
}

export async function deleteTag(id: string): Promise<void> {
  await db().execute("DELETE FROM tags WHERE id = $1", [id]);
}

export async function addTagToContact(contactId: string, tagId: string): Promise<void> {
  await db().execute(
    "INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [contactId, tagId],
  );
}

export async function removeTagFromContact(contactId: string, tagId: string): Promise<void> {
  await db().execute("DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2", [contactId, tagId]);
}

/** Makes the contact's tags exactly these names, creating any that are new. */
export async function setContactTags(contactId: string, names: string[]): Promise<Tag[]> {
  const tags: Tag[] = [];
  for (const name of names) {
    if (!name.trim()) continue;
    const tag = await ensureTag(name);
    if (!tags.some((t) => t.id === tag.id)) tags.push(tag);
  }
  // json_each keeps this to one statement however many tags there are.
  const ids = JSON.stringify(tags.map((t) => t.id));
  await db().execute(
    "DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id NOT IN (SELECT value FROM json_each($2))",
    [contactId, ids],
  );
  await db().execute(
    `INSERT INTO contact_tags (contact_id, tag_id)
     SELECT $1, value FROM json_each($2) WHERE true
     ON CONFLICT DO NOTHING`,
    [contactId, ids],
  );
  return tags;
}

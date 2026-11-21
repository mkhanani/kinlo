import { db } from "./driver";
import { nowIso } from "./util";

/** Every photo, keyed by contact id. Loaded once and cached, so lists never query per row. */
export async function loadAvatars(): Promise<Record<string, string>> {
  const rows = await db().select<{ contact_id: string; image: string }>("SELECT contact_id, image FROM avatars");
  return Object.fromEntries(rows.map((row) => [row.contact_id, row.image]));
}

/** Saves a photo for a person, replacing any they had. `image` is a data URL. */
export async function setAvatar(contactId: string, image: string): Promise<void> {
  if (!image.startsWith("data:image/")) throw new Error("That is not an image.");
  await db().execute(
    `INSERT INTO avatars (contact_id, image, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (contact_id) DO UPDATE SET image = excluded.image, updated_at = excluded.updated_at`,
    [contactId, image, nowIso()],
  );
}

export async function removeAvatar(contactId: string): Promise<void> {
  await db().execute("DELETE FROM avatars WHERE contact_id = $1", [contactId]);
}

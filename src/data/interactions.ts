import { db } from "./driver";
import type { Interaction, InteractionInput } from "./types";
import { buildSet, newId, nowIso } from "./util";

/** A contact's timeline, newest first. */
export async function listInteractions(contactId: string, limit?: number): Promise<Interaction[]> {
  return db().select<Interaction>(
    `SELECT * FROM interactions WHERE contact_id = $1
      ORDER BY happened_at DESC, created_at DESC
      LIMIT $2`,
    [contactId, limit ?? -1],
  );
}

/**
 * Logs an interaction. The schema moves the contact's last_contacted_at forward in the
 * same statement, so the two can never disagree.
 */
export async function addInteraction(input: InteractionInput): Promise<Interaction> {
  const id = newId();
  const now = nowIso();
  await db().execute(
    `INSERT INTO interactions (id, contact_id, type, happened_at, summary, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.contact_id, input.type, input.happened_at ?? now, (input.summary ?? "").trim(), now],
  );
  const rows = await db().select<Interaction>("SELECT * FROM interactions WHERE id = $1", [id]);
  return rows[0]!;
}

export async function updateInteraction(
  id: string,
  patch: Partial<Pick<Interaction, "type" | "happened_at" | "summary">>,
): Promise<void> {
  const { clause, params } = buildSet(
    patch,
    { type: (v) => v, happened_at: (v) => v, summary: (v) => (v ?? "").trim() },
    2,
  );
  if (clause) await db().execute(`UPDATE interactions SET ${clause} WHERE id = $1`, [id, ...params]);
}

export async function deleteInteraction(id: string): Promise<void> {
  await db().execute("DELETE FROM interactions WHERE id = $1", [id]);
}

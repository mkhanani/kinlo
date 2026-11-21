import { db, type SqlValue } from "./driver";
import type { Deal, DealInput, DealPatch, DealWithContact, Stage } from "./types";
import { buildSet, newId, nowIso, text } from "./util";

export async function listStages(): Promise<Stage[]> {
  return db().select<Stage>("SELECT * FROM stages ORDER BY position");
}

export interface DealFilter {
  stageId?: string;
  contactId?: string;
  /** true for open deals only, false for closed only. */
  open?: boolean;
}

export async function listDeals(filter: DealFilter = {}): Promise<DealWithContact[]> {
  const where: string[] = ["c.archived = 0"];
  const params: SqlValue[] = [];
  const add = (value: SqlValue) => `$${params.push(value)}`;

  if (filter.stageId) where.push(`d.stage_id = ${add(filter.stageId)}`);
  if (filter.contactId) where.push(`d.contact_id = ${add(filter.contactId)}`);
  if (filter.open === true) where.push("d.closed_at IS NULL");
  if (filter.open === false) where.push("d.closed_at IS NOT NULL");

  return db().select<DealWithContact>(
    `SELECT d.*, c.name AS contact_name
       FROM deals d
       JOIN contacts c ON c.id = d.contact_id
       JOIN stages s ON s.id = d.stage_id
      WHERE ${where.join(" AND ")}
      ORDER BY s.position, d.position, d.created_at`,
    params,
  );
}

export async function getDeal(id: string): Promise<Deal | null> {
  const rows = await db().select<Deal>("SELECT * FROM deals WHERE id = $1", [id]);
  return rows[0] ?? null;
}

/** Adds a deal at the bottom of its stage. Without a stage it goes in the first one. */
export async function createDeal(input: DealInput): Promise<Deal> {
  const title = input.title.trim();
  if (!title) throw new Error("A deal needs a title.");
  const id = newId();
  const now = nowIso();
  await db().execute(
    `INSERT INTO deals (id, contact_id, title, stage_id, value, currency, expected_close, notes,
                        position, created_at, updated_at)
     SELECT $1, $2, $3, s.id, $5, $6, $7, $8,
            (SELECT coalesce(max(position), 0) + 1 FROM deals WHERE stage_id = s.id), $9, $9
       FROM (SELECT id FROM stages
              WHERE $4 IS NULL OR id = $4
              ORDER BY position LIMIT 1) s`,
    [
      id,
      input.contact_id,
      title,
      input.stage_id ?? null,
      input.value ?? null,
      (input.currency ?? "USD").toUpperCase(),
      text(input.expected_close),
      text(input.notes),
      now,
    ],
  );
  const deal = await getDeal(id);
  if (!deal) throw new Error("That stage no longer exists.");
  return deal;
}

export async function updateDeal(id: string, patch: DealPatch): Promise<void> {
  if (patch.title !== undefined && !patch.title.trim()) throw new Error("A deal needs a title.");
  const { clause, params } = buildSet<DealPatch>(
    patch,
    {
      title: (v) => (v ?? "").trim(),
      value: (v) => v,
      currency: (v) => (v ?? "USD").toUpperCase(),
      expected_close: text,
      notes: text,
      contact_id: (v) => v,
    },
    3,
  );
  if (clause) {
    await db().execute(`UPDATE deals SET ${clause}, updated_at = $2 WHERE id = $1`, [id, nowIso(), ...params]);
  }
}

/**
 * The position for a deal dropped between two neighbours. Pass null for "no neighbour"
 * (top or bottom of the column). Positions are fractional so only the moved deal changes.
 */
export function positionBetween(before: number | null, after: number | null): number {
  if (before == null && after == null) return 1;
  if (before == null) return after! - 1;
  if (after == null) return before + 1;
  return (before + after) / 2;
}

/**
 * Moves a deal to a stage and position. The schema sets closed_at when the stage is Won
 * or Lost and clears it when the deal moves back to an open stage.
 */
export async function moveDeal(id: string, stageId: string, position: number): Promise<void> {
  await db().execute("UPDATE deals SET stage_id = $2, position = $3, updated_at = $4 WHERE id = $1", [
    id,
    stageId,
    position,
    nowIso(),
  ]);
}

export async function deleteDeal(id: string): Promise<void> {
  await db().execute("DELETE FROM deals WHERE id = $1", [id]);
}

export async function countOpenDeals(): Promise<number> {
  const rows = await db().select<{ n: number }>(
    `SELECT count(*) AS n FROM deals d JOIN contacts c ON c.id = d.contact_id
      WHERE d.closed_at IS NULL AND c.archived = 0`,
  );
  return rows[0]?.n ?? 0;
}

/** What the open deals add up to, one total per currency, largest first. */
export async function openDealTotals(): Promise<{ currency: string; total: number; count: number }[]> {
  return db().select(
    `SELECT d.currency, coalesce(sum(d.value), 0) AS total, count(*) AS count
       FROM deals d JOIN contacts c ON c.id = d.contact_id
      WHERE d.closed_at IS NULL AND c.archived = 0
      GROUP BY d.currency
      ORDER BY total DESC, d.currency`,
  );
}

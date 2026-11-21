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

/** Moves a deal to the bottom of another stage, for when there is no drop position. */
export async function moveDealToStage(id: string, stageId: string): Promise<void> {
  await db().execute(
    `UPDATE deals
        SET stage_id = $2,
            position = (SELECT coalesce(max(position), 0) + 1 FROM deals WHERE stage_id = $2 AND id <> $1),
            updated_at = $3
      WHERE id = $1 AND stage_id <> $2`,
    [id, stageId, nowIso()],
  );
}

/**
 * Renumbers a stage's deals 1, 2, 3... in their current order. Dropping a deal between
 * two others halves the gap between their positions; after very many moves in one spot
 * the gap would become too small to halve again, so the board calls this when it gets close.
 */
export async function renumberStage(stageId: string): Promise<void> {
  // The new numbers are worked out from the order as it stands, in the FROM part, before
  // any row is changed. Counting inside the UPDATE itself would read rows it had already
  // renumbered and get the order wrong.
  await db().execute(
    `UPDATE deals
        SET position = ranked.place
       FROM (SELECT id, row_number() OVER (ORDER BY position, created_at, id) AS place
               FROM deals WHERE stage_id = $1) AS ranked
      WHERE deals.id = ranked.id`,
    [stageId],
  );
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

// ── Stages ──────────────────────────────────────────────────────────────────────────────
//
// The open stages (Lead, Talking, Proposal to begin with) are the user's to rename, add
// to, reorder and remove. The two that end a deal, Won and Lost, are fixed: closing a
// deal, the Home totals and the 30-day view all depend on them.

/** More columns than this do not fit a board anyone can read. */
export const MAX_OPEN_STAGES = 8;

/** Puts the open stages 1, 2, 3... in their current order, with Won and Lost after them. */
async function renumberStages(): Promise<void> {
  await db().execute(
    `UPDATE stages SET position = ranked.place
       FROM (SELECT id, row_number() OVER (
                      ORDER BY CASE outcome WHEN 'won' THEN 1 WHEN 'lost' THEN 2 ELSE 0 END, position, name) AS place
               FROM stages) AS ranked
      WHERE stages.id = ranked.id`,
  );
}

async function nameTaken(name: string, exceptId: string | null): Promise<boolean> {
  const rows = await db().select<{ id: string }>(
    "SELECT id FROM stages WHERE lower(trim(name)) = lower($1) AND ($2 IS NULL OR id <> $2)",
    [name, exceptId],
  );
  return rows.length > 0;
}

/** Adds an open stage after the other open ones, just before Won. */
export async function createStage(input: string): Promise<Stage> {
  const name = input.trim();
  if (!name) throw new Error("A stage needs a name.");
  if (await nameTaken(name, null)) throw new Error(`There is already a stage called ${name}.`);
  const stages = await listStages();
  if (stages.filter((s) => s.outcome === null).length >= MAX_OPEN_STAGES) {
    throw new Error(`A pipeline can have up to ${MAX_OPEN_STAGES} stages before Won and Lost.`);
  }
  const id = newId();
  // Half a step past the last open stage puts it before Won; renumbering tidies it up.
  await db().execute(
    `INSERT INTO stages (id, name, position, outcome)
     VALUES ($1, $2, (SELECT coalesce(max(position), 0) FROM stages WHERE outcome IS NULL) + 1, NULL)`,
    [id, name],
  );
  await renumberStages();
  return (await listStages()).find((s) => s.id === id)!;
}

export async function renameStage(id: string, input: string): Promise<void> {
  const name = input.trim();
  if (!name) throw new Error("A stage needs a name.");
  if (await nameTaken(name, id)) throw new Error(`There is already a stage called ${name}.`);
  // Won and Lost keep their names: the app and the assistant refer to them by name.
  await db().execute("UPDATE stages SET name = $2 WHERE id = $1 AND outcome IS NULL", [id, name]);
}

/** Sets the order of the open stages. Ids that are not open stages are ignored. */
export async function reorderStages(ids: string[]): Promise<void> {
  for (const [index, id] of ids.entries()) {
    await db().execute("UPDATE stages SET position = $2 WHERE id = $1 AND outcome IS NULL", [id, index + 1]);
  }
  await renumberStages();
}

/**
 * Removes an open stage. It has to be empty first, so no deal is ever moved or lost
 * without the user doing it, and at least one open stage always remains.
 */
export async function deleteStage(id: string): Promise<void> {
  const stages = await listStages();
  const stage = stages.find((s) => s.id === id);
  if (!stage) return;
  if (stage.outcome !== null) throw new Error(`${stage.name} cannot be removed.`);
  if (stages.filter((s) => s.outcome === null).length <= 1) {
    throw new Error("A pipeline needs at least one stage before Won and Lost.");
  }
  const [{ n } = { n: 0 }] = await db().select<{ n: number }>("SELECT count(*) AS n FROM deals WHERE stage_id = $1", [id]);
  if (n > 0) {
    throw new Error(`${stage.name} still has ${n} ${n === 1 ? "deal" : "deals"}. Move ${n === 1 ? "it" : "them"} to another stage first.`);
  }
  await db().execute("DELETE FROM stages WHERE id = $1 AND outcome IS NULL", [id]);
  await renumberStages();
}

/** How many deals each stage holds, archived people's deals included. */
export async function countDealsByStage(): Promise<Record<string, number>> {
  const rows = await db().select<{ stage_id: string; n: number }>("SELECT stage_id, count(*) AS n FROM deals GROUP BY stage_id");
  return Object.fromEntries(rows.map((row) => [row.stage_id, row.n]));
}

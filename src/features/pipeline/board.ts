import { positionBetween } from "@/data/deals";
import type { DealWithContact, Stage } from "@/data/types";

/** The board: each stage's deals, in order from top to bottom. */
export type Board = Record<string, DealWithContact[]>;

/** Below this, two neighbouring positions are too close to keep halving. */
export const MIN_GAP = 1e-6;

export function toBoard(stages: Stage[], deals: DealWithContact[]): Board {
  const board: Board = Object.fromEntries(stages.map((stage) => [stage.id, []]));
  for (const deal of [...deals].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))) {
    (board[deal.stage_id] ??= []).push(deal);
  }
  return board;
}

export function findStage(board: Board, dealId: string): string | null {
  for (const [stageId, deals] of Object.entries(board)) {
    if (deals.some((d) => d.id === dealId)) return stageId;
  }
  return null;
}

/**
 * The board with one deal moved to `index` in `toStage`. Used while dragging, to show
 * where the deal will land, and once more when it is dropped.
 */
export function moveOnBoard(board: Board, dealId: string, toStage: string, index: number): Board {
  const fromStage = findStage(board, dealId);
  if (!fromStage) return board;
  const deal = board[fromStage]!.find((d) => d.id === dealId)!;
  const next: Board = { ...board, [fromStage]: board[fromStage]!.filter((d) => d.id !== dealId) };
  const target = [...(next[toStage] ?? [])];
  const at = Math.max(0, Math.min(index, target.length));
  target.splice(at, 0, { ...deal, stage_id: toStage });
  next[toStage] = target;
  return next;
}

/**
 * The position to save for the deal at `index` in a column, from its neighbours above
 * and below. `needsRenumber` says the gap it landed in is nearly used up.
 */
export function positionAt(column: DealWithContact[], index: number): { position: number; needsRenumber: boolean } {
  const before = index > 0 ? column[index - 1]!.position : null;
  const after = index < column.length - 1 ? column[index + 1]!.position : null;
  const position = positionBetween(before, after);
  const needsRenumber = before != null && after != null && after - before < MIN_GAP * 4;
  return { position, needsRenumber };
}

/** A column's deals added up, one total per currency, largest first. */
export function columnTotals(deals: DealWithContact[]): { currency: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const deal of deals) {
    if (deal.value != null && deal.value > 0) totals.set(deal.currency, (totals.get(deal.currency) ?? 0) + deal.value);
  }
  return [...totals].map(([currency, total]) => ({ currency, total })).sort((a, b) => b.total - a.total);
}

/** "$4,800", "€1.2K" for big numbers on a small card. Falls back gracefully for an unknown currency code. */
export function formatMoney(value: number, currency: string, compact = false): string {
  const short = compact && value >= 100_000;
  try {
    return value.toLocaleString(undefined, {
      style: "currency",
      currency,
      // A shortened amount keeps two decimals of the unit shown: $1.25M, not $1M.
      maximumFractionDigits: short ? 2 : Number.isInteger(value) ? 0 : 2,
      notation: short ? "compact" : "standard",
    });
  } catch {
    return `${value.toLocaleString()} ${currency}`;
  }
}

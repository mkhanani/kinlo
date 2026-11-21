import type { SqlValue } from "./driver";

export const newId = (): string => crypto.randomUUID();

export const nowIso = (): string => new Date().toISOString();

/** Empty or whitespace-only text is stored as NULL, everything else trimmed. */
export function text(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Builds `col = $n` pairs for an UPDATE from a patch, in a fixed column order.
 * Only columns named in `columns` can ever reach the SQL string.
 */
export function buildSet<P extends object>(
  patch: P,
  columns: { [K in keyof P]?: (value: NonNullable<P[K]> | null) => SqlValue },
  startAt = 1,
): { clause: string; params: SqlValue[] } {
  const parts: string[] = [];
  const params: SqlValue[] = [];
  for (const key of Object.keys(columns) as (keyof P & string)[]) {
    if (!(key in patch) || patch[key] === undefined) continue;
    const encode = columns[key]!;
    params.push(encode(patch[key] as NonNullable<P[typeof key]> | null));
    parts.push(`${key} = $${startAt + params.length - 1}`);
  }
  return { clause: parts.join(", "), params };
}

/**
 * Turns what someone typed into an FTS5 query: every word must match, as a prefix.
 * Returns null when there is nothing to search for.
 */
export function toFtsQuery(input: string): string | null {
  const words = input.match(/[\p{L}\p{N}]+/gu);
  if (!words || words.length === 0) return null;
  return words.map((w) => `"${w}"*`).join(" ");
}

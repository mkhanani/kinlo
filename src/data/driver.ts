/**
 * The one seam between the app and SQLite.
 *
 * Everything in `src/data` talks to a Driver, never to Tauri directly. In the app the
 * driver is the SQL plugin. In unit tests it is an in-memory SQLite. In a plain browser
 * during development it is SQLite compiled to WebAssembly. All three run the same
 * migration files, so the queries are tested against the real schema.
 *
 * Parameters are positional and written `$1`, `$2`, ... in the SQL.
 *
 * There are no multi-statement transactions here on purpose: the plugin hands each call
 * to a connection pool, so BEGIN and COMMIT could land on different connections. Anything
 * that must be atomic is a single statement or a trigger in the schema.
 */
export type SqlValue = string | number | null;

export interface ExecResult {
  rowsAffected: number;
}

export interface Driver {
  select<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  execute(sql: string, params?: SqlValue[]): Promise<ExecResult>;
}

let current: Driver | null = null;

export function setDriver(driver: Driver | null) {
  current = driver;
}

export function db(): Driver {
  if (!current) throw new Error("The database is not open yet.");
  return current;
}

/** Open the right database for where the app is running. Call once at startup. */
export async function openDatabase(): Promise<void> {
  if (current) return;
  const { isTauri } = await import("@/lib/platform");
  if (isTauri) {
    const { createTauriDriver } = await import("./drivers/tauri");
    current = await createTauriDriver();
  } else if (import.meta.env.DEV) {
    // Browser preview only. Never part of a release build.
    const { createWasmDriver } = await import("./drivers/wasm");
    current = await createWasmDriver();
  } else {
    throw new Error("kinlo needs to run as a desktop app to open its database.");
  }
}

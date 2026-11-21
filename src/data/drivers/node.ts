import type * as NodeSqlite from "node:sqlite";
import type { Driver, SqlValue } from "../driver";
import { migrations, namedParams } from "./migrations";

/** In-memory SQLite for unit tests, with every migration applied. */
export function createTestDriver(): Driver & { close(): void } {
  // Loaded at run time so this file also works in tests that use a browser-like environment,
  // where the bundler refuses to import Node built-ins.
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as typeof NodeSqlite;
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const m of migrations) database.exec(m.sql);

  type Bind = Record<string, SqlValue>;
  return {
    async select<T>(sql: string, params: SqlValue[] = []) {
      return database.prepare(sql).all(namedParams(sql, params) as Bind) as T[];
    },
    async execute(sql: string, params: SqlValue[] = []) {
      const result = database.prepare(sql).run(namedParams(sql, params) as Bind);
      return { rowsAffected: Number(result.changes) };
    },
    close: () => database.close(),
  };
}

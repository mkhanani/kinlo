import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { Driver, SqlValue } from "../driver";
import { migrations, namedParams } from "./migrations";

/**
 * SQLite in WebAssembly, for previewing the UI in a plain browser with `npm run dev`.
 * Data lives in the tab's session storage, so it survives a reload and is gone when the
 * tab closes. Development only: release builds always use the desktop driver.
 */
export async function createWasmDriver(): Promise<Driver> {
  const sqlite3 = await sqlite3InitModule();
  const database = new sqlite3.oo1.JsStorageDb("session");
  database.exec("PRAGMA foreign_keys = ON");

  const applied = Number(database.selectValue("PRAGMA user_version") ?? 0);
  for (const m of migrations) {
    if (m.version <= applied) continue;
    database.exec("BEGIN");
    try {
      database.exec(m.sql);
      database.exec(`PRAGMA user_version = ${m.version}`);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  type Bind = Record<string, SqlValue>;
  return {
    async select<T>(sql: string, params: SqlValue[] = []) {
      return database.exec({
        sql,
        bind: namedParams(sql, params) as Bind,
        rowMode: "object",
        returnValue: "resultRows",
      }) as T[];
    },
    async execute(sql: string, params: SqlValue[] = []) {
      database.exec({ sql, bind: namedParams(sql, params) as Bind });
      return { rowsAffected: database.changes() };
    },
  };
}

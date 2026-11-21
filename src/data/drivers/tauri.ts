import Database from "@tauri-apps/plugin-sql";
import type { Driver, SqlValue } from "../driver";

/** Must match DB_URL in src-tauri/src/db.rs, where the migrations are registered. */
const DB_URL = "sqlite:kinlo.db";

export async function createTauriDriver(): Promise<Driver> {
  // Loading runs any pending migrations before the first query.
  const database = await Database.load(DB_URL);
  return {
    select: <T>(sql: string, params: SqlValue[] = []) => database.select<T[]>(sql, params),
    execute: async (sql: string, params: SqlValue[] = []) => {
      const result = await database.execute(sql, params);
      return { rowsAffected: result.rowsAffected };
    },
  };
}

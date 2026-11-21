/**
 * The migration files, for the test and browser-preview drivers.
 * The desktop app does not use this: there the Rust side embeds and runs the same files.
 */
const files = import.meta.glob<string>("../../../src-tauri/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

export interface MigrationFile {
  version: number;
  name: string;
  sql: string;
}

export const migrations: MigrationFile[] = Object.entries(files)
  .map(([path, sql]) => {
    const name = path.split("/").pop()!;
    return { version: Number.parseInt(name, 10), name, sql };
  })
  .sort((a, b) => a.version - b.version);

/** `$1` style placeholders, as named parameters for drivers that bind by name. */
export function namedParams(sql: string, params: readonly unknown[]): Record<string, unknown> {
  const named: Record<string, unknown> = {};
  for (const match of sql.matchAll(/\$(\d+)/g)) {
    const index = Number(match[1]);
    if (index < 1 || index > params.length) throw new Error(`No value for $${index} in: ${sql}`);
    named[`$${index}`] = params[index - 1];
  }
  return named;
}

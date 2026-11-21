import { afterEach, beforeEach } from "vitest";
import { setDriver } from "./driver";
import { createTestDriver } from "./drivers/node";

/** Gives each test a fresh, fully migrated in-memory database. */
export function useTestDatabase() {
  let driver: ReturnType<typeof createTestDriver>;
  beforeEach(() => {
    driver = createTestDriver();
    setDriver(driver);
  });
  afterEach(() => {
    setDriver(null);
    driver.close();
  });
}

/** An ISO timestamp `days` days before (negative: after) the given moment. */
export function daysAgo(days: number, from = "2026-06-15T12:00:00.000Z"): string {
  return new Date(new Date(from).getTime() - days * 86_400_000).toISOString();
}

export const NOW = "2026-06-15T12:00:00.000Z";

import { db } from "./driver";

export type ThemePref = "system" | "light" | "dark";
export type AiProvider = "anthropic" | "openai" | "google" | "ollama";

/**
 * Every setting the app stores, with its type. API keys are not settings: they live in
 * the operating system's keychain and never touch this table.
 */
export interface Settings {
  theme: ThemePref;
  pipelineEnabled: boolean;
  defaultCurrency: string;
  aiProvider: AiProvider | null;
  aiModel: string | null;
  /** Custom endpoint for OpenAI-compatible servers. */
  aiBaseUrl: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  pipelineEnabled: true,
  defaultCurrency: "USD",
  aiProvider: null,
  aiModel: null,
  aiBaseUrl: null,
};

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

/** All settings, with defaults filled in for anything not saved yet. */
export async function loadSettings(): Promise<Settings> {
  const rows = await db().select<{ key: string; value: string }>("SELECT key, value FROM settings");
  const settings: Settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (!KEYS.includes(row.key as keyof Settings)) continue;
    try {
      (settings as unknown as Record<string, unknown>)[row.key] = JSON.parse(row.value);
    } catch {
      // A value that does not parse falls back to its default.
    }
  }
  return settings;
}

export async function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  await db().execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    [key, JSON.stringify(value)],
  );
}

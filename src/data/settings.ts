import { db } from "./driver";
import type { Side } from "./types";

export type ThemePref = "system" | "light" | "dark";
export type AiProvider = "anthropic" | "openai" | "google" | "ollama";

/**
 * Every setting the app stores, with its type. API keys are not settings: they live in
 * the operating system's keychain and never touch this table.
 */
/** Which sides of kinlo the user has switched on. */
export type SidesChoice = "personal" | "business" | "both";

export interface Settings {
  /** False until the welcome setup has been finished. */
  onboarded: boolean;
  /** What to call the user in greetings. */
  userName: string | null;
  theme: ThemePref;
  sides: SidesChoice;
  /** The side on screen. Only matters when `sides` is "both". */
  activeSide: Side;
  /** Show a system notification when a reminder is due. */
  notifications: boolean;
  /** Keep running in the tray after the window is closed, so reminders can still notify. */
  runInBackground: boolean;
  /** The last moment the app was running and watching reminders, as an ISO timestamp. */
  notifiedThrough: string | null;
  defaultCurrency: string;
  aiProvider: AiProvider | null;
  aiModel: string | null;
  /** Custom endpoint for OpenAI-compatible servers. */
  aiBaseUrl: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  userName: null,
  theme: "system",
  sides: "both",
  activeSide: "personal",
  notifications: true,
  runInBackground: true,
  notifiedThrough: null,
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

/** The side on screen right now: the only one switched on, or the one chosen when both are. */
export function currentSide(settings: Pick<Settings, "sides" | "activeSide">): Side {
  return settings.sides === "both" ? settings.activeSide : settings.sides;
}

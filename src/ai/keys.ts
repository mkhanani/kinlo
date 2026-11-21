import type { AiProvider } from "@/data/settings";
import { isTauri } from "@/lib/platform";

/**
 * API keys. In the app they live in the operating system's keychain, reached through
 * the two Rust commands `set_key` and `get_key`. They are never written to the database
 * or to localStorage, and never logged.
 *
 * In a plain browser (development and tests) there is no keychain, so a key is held in
 * memory until the page is reloaded.
 */
const memory = new Map<AiProvider, string>();

export async function getKey(provider: AiProvider): Promise<string | null> {
  if (!isTauri) return memory.get(provider) ?? null;
  const { invoke } = await import("@tauri-apps/api/core");
  return (await invoke<string | null>("get_key", { provider })) ?? null;
}

/** Saves a key. An empty or missing key removes the saved one. */
export async function setKey(provider: AiProvider, key: string | null): Promise<void> {
  const value = key?.trim() ?? "";
  if (!isTauri) {
    if (value) memory.set(provider, value);
    else memory.delete(provider);
    return;
  }
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_key", { provider, key: value || null });
}

/** Test helper: forget every key held in memory. */
export function clearMemoryKeys() {
  memory.clear();
}

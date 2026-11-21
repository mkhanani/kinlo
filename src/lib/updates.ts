import { isProduction } from "./channel";
import { isTauri } from "./platform";

/**
 * Updating kinlo from inside kinlo. Nothing here runs by itself: every call comes from a
 * button the person pressed. The work is done by the Rust shell, which asks GitHub for the
 * newest release and only installs a download that carries this project's signature.
 */

/** Where every release can be downloaded by hand. */
export const RELEASES_URL = "https://github.com/mkhanani/kinlo/releases/latest";

export const releaseUrl = (version: string) => `https://github.com/mkhanani/kinlo/releases/tag/v${version}`;

/** Only the released app updates itself. A dev or staging build has nothing to update to. */
export function canUpdate(): boolean {
  return isTauri && isProduction;
}

/** The version that is running, such as "0.2.0". Null outside the app. */
export async function appVersion(): Promise<string | null> {
  if (!isTauri) return null;
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

/** Asks whether there is a newer version. Resolves to its number, or null when up to date. */
export async function checkForUpdate(): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  const found = await invoke<{ version: string } | null>("check_for_update");
  return found?.version ?? null;
}

export type UpdateStep = { step: "downloading"; received: number; total: number | null } | { step: "installing" };

/**
 * Downloads and installs the version the last check found, then restarts kinlo. When it
 * works the app closes, so this only ever comes back to say why it could not.
 */
export async function installUpdate(onStep: (step: UpdateStep) => void): Promise<void> {
  const { invoke, Channel } = await import("@tauri-apps/api/core");
  const progress = new Channel<UpdateStep>();
  progress.onmessage = onStep;
  await invoke("install_update", { progress });
}

/** Turns whatever a failed call threw into the sentence to show. */
export function updateError(error: unknown): string {
  if (typeof error === "string" && error) return error;
  if (error instanceof Error && error.message) return error.message;
  return "The update could not be installed. Nothing was changed.";
}

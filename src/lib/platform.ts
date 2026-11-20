import { platform as osPlatform } from "@tauri-apps/plugin-os";

export type Platform = "windows" | "macos" | "linux" | "web";

/** True when running inside the Tauri webview (false in a plain browser during dev). */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function detect(): Platform {
  if (!isTauri) return "web";
  try {
    const p = osPlatform();
    if (p === "windows" || p === "macos" || p === "linux") return p;
  } catch {
    /* fall through */
  }
  return "linux";
}

export const platform: Platform = detect();

/** Native blur exists on Windows (Mica / Acrylic) and macOS (vibrancy). Linux gets a solid backdrop. */
export const hasNativeEffects = platform === "windows" || platform === "macos";

export const modKey = platform === "macos" ? "⌘" : "Ctrl";

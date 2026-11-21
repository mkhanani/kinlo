import type { ThemePref } from "@/data/settings";

/**
 * The theme preference lives in the settings table. A copy is kept in localStorage only
 * so index.html can paint the right theme before the database is open.
 */
const CACHE_KEY = "kinlo.theme";

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function applyTheme(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && media().matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try {
    localStorage.setItem(CACHE_KEY, pref);
  } catch {
    // Storage can be unavailable. The theme still applies for this session.
  }
}

/** Re-applies the theme when the OS switches between light and dark. Returns a cleanup. */
export function followSystemTheme(getPref: () => ThemePref): () => void {
  const mq = media();
  const onChange = () => {
    if (getPref() === "system") applyTheme("system");
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

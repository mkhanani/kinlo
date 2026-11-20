import { create } from "zustand";

export type ThemePref = "system" | "light" | "dark";

const THEME_KEY = "kinlo.theme";

function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  return "system";
}

const media = window.matchMedia("(prefers-color-scheme: dark)");

export function applyTheme(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

interface UIState {
  theme: ThemePref;
  setTheme: (t: ThemePref) => void;
  assistantOpen: boolean;
  toggleAssistant: (open?: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  pipelineEnabled: boolean;
  setPipelineEnabled: (on: boolean) => void;
}

export const useUI = create<UIState>((set, get) => ({
  theme: readTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
    applyTheme(theme);
    set({ theme });
  },
  assistantOpen: false,
  toggleAssistant: (open) => set({ assistantOpen: open ?? !get().assistantOpen }),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  // Moves to the settings table in step 2.
  pipelineEnabled: true,
  setPipelineEnabled: (pipelineEnabled) => set({ pipelineEnabled }),
}));

// Follow the OS when the preference is "system".
media.addEventListener("change", () => {
  if (useUI.getState().theme === "system") applyTheme("system");
});

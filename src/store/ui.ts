import { create } from "zustand";

/** Transient UI state. Anything that should survive a restart belongs in the settings table. */
interface UIState {
  assistantOpen: boolean;
  toggleAssistant: (open?: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

export const useUI = create<UIState>((set, get) => ({
  assistantOpen: false,
  toggleAssistant: (open) => set({ assistantOpen: open ?? !get().assistantOpen }),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));

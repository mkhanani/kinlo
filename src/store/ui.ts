import { create } from "zustand";
import type { BusinessKind } from "@/data/types";

export interface PeopleFilter {
  search: string;
  /** Business side only: narrow to leads, clients or other work contacts. */
  business: BusinessKind | "all";
  tagId: string | null;
  overdueOnly: boolean;
  includeArchived: boolean;
}

export const EMPTY_PEOPLE_FILTER: PeopleFilter = {
  search: "",
  business: "all",
  tagId: null,
  overdueOnly: false,
  includeArchived: false,
};

/** Transient UI state. Anything that should survive a restart belongs in the settings table. */
interface UIState {
  assistantOpen: boolean;
  toggleAssistant: (open?: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;

  /** The add/edit person dialog. `contactId` null means a new person. */
  contactForm: { open: boolean; contactId: string | null };
  openContactForm: (contactId?: string | null) => void;
  closeContactForm: () => void;

  /** Kept here so the People list is as you left it when you come back from a person. */
  peopleFilter: PeopleFilter;
  setPeopleFilter: (patch: Partial<PeopleFilter>) => void;
}

export const useUI = create<UIState>((set, get) => ({
  assistantOpen: false,
  toggleAssistant: (open) => set({ assistantOpen: open ?? !get().assistantOpen }),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),

  contactForm: { open: false, contactId: null },
  openContactForm: (contactId = null) => set({ contactForm: { open: true, contactId }, paletteOpen: false }),
  closeContactForm: () => set({ contactForm: { ...get().contactForm, open: false } }),

  peopleFilter: EMPTY_PEOPLE_FILTER,
  setPeopleFilter: (patch) => set({ peopleFilter: { ...get().peopleFilter, ...patch } }),
}));

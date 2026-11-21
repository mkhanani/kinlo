import { useEffect } from "react";
import { create } from "zustand";

/** The person whose page is open, if any. */
export interface FocusedContact {
  id: string;
  name: string;
}

/**
 * What the user is looking at. The assistant is told, so that "them" or "this person"
 * means the person on screen. It is only ever sent along with a question the user asks.
 */
export const useFocus = create<{ contact: FocusedContact | null }>(() => ({ contact: null }));

/** Marks a person's page as open for as long as the calling component is on screen. */
export function useFocusOn(contact: FocusedContact | null | undefined) {
  const id = contact?.id;
  const name = contact?.name;
  useEffect(() => {
    if (!id || !name) return;
    useFocus.setState({ contact: { id, name } });
    return () => {
      if (useFocus.getState().contact?.id === id) useFocus.setState({ contact: null });
    };
  }, [id, name]);
}

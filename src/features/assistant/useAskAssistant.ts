import { useCallback } from "react";
import { useChat } from "@/ai/chat";
import { useSettings } from "@/app/settings";
import { useUI } from "@/store/ui";

/**
 * Starts a fresh conversation in the assistant panel from somewhere else in the app.
 * `ask` sends a question straight away. `prefill` writes the start of one and leaves the
 * rest to the user. If no model is connected, the panel opens and says so.
 */
export function useAskAssistant() {
  const settings = useSettings();
  const toggle = useUI((s) => s.toggleAssistant);

  const ask = useCallback(
    (text: string) => {
      const chat = useChat.getState();
      chat.newChat();
      toggle(true);
      void useChat.getState().send(text, settings);
    },
    [settings, toggle],
  );

  const prefill = useCallback(
    (text: string) => {
      const chat = useChat.getState();
      chat.newChat();
      useChat.getState().setDraft(text);
      toggle(true);
    },
    [toggle],
  );

  /** Puts the cursor in the assistant's message box. */
  const focusBox = useCallback(() => useChat.getState().focusBox(), []);

  return { ask, prefill, focusBox };
}

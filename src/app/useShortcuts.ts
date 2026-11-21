import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUI } from "@/store/ui";
import { useSaveSetting, useSettings, useSide } from "./settings";

/**
 * Global keyboard shortcuts. Ctrl on Windows/Linux, Cmd on macOS. The list the user sees
 * is in shortcuts.ts; keep the two in step.
 */
export function useShortcuts() {
  const navigate = useNavigate();
  const side = useSide();
  const { sides } = useSettings();
  const save = useSaveSetting();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      const ui = useUI.getState();
      const key = e.key.toLowerCase();
      const handle = (action: () => void) => {
        e.preventDefault();
        action();
      };

      if (e.shiftKey) {
        if (key === "n") handle(() => ui.openReminderForm());
        else if (key === "d" && side === "business") handle(() => ui.openDealForm());
        else if (key === "s" && sides === "both") {
          handle(() => save("activeSide", side === "personal" ? "business" : "personal"));
        }
        return;
      }

      const routes: Record<string, string> = { "1": "/", "2": "/people", "3": "/pipeline", "4": "/reminders", ",": "/settings" };
      if (key === "k") handle(() => ui.setPaletteOpen(!ui.paletteOpen));
      else if (key === "j") handle(() => ui.toggleAssistant());
      else if (key === "/") handle(() => ui.setShortcutsOpen(!ui.shortcutsOpen));
      else if (key === "n") handle(() => ui.openContactForm());
      else if (routes[key]) {
        if (key === "3" && side !== "business") return;
        handle(() => navigate(routes[key]!));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, side, sides, save]);
}

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUI } from "@/store/ui";

/** Global keyboard shortcuts. Ctrl on Windows/Linux, Cmd on macOS. */
export function useShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      const ui = useUI.getState();
      const key = e.key.toLowerCase();

      const routes: Record<string, string> = { "1": "/", "2": "/people", "3": "/pipeline", "4": "/reminders", ",": "/settings" };
      if (key === "k") {
        e.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
      } else if (key === "j") {
        e.preventDefault();
        ui.toggleAssistant();
      } else if (routes[key]) {
        if (key === "3" && !ui.pipelineEnabled) return;
        e.preventDefault();
        navigate(routes[key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}

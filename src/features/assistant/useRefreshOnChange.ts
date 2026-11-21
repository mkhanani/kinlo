import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatStore } from "@/ai/chat";
import { settingsKey } from "@/app/settings";

/** When the assistant has changed something, every screen that shows it must catch up. */
export function useRefreshOnChange(store: ChatStore) {
  const client = useQueryClient();
  const dataVersion = store((s) => s.dataVersion);
  const seen = useRef(dataVersion);
  useEffect(() => {
    if (dataVersion === seen.current) return;
    seen.current = dataVersion;
    void client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== settingsKey[0] });
  }, [dataVersion, client]);
}

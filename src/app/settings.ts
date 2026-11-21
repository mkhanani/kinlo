import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { currentSide, DEFAULT_SETTINGS, loadSettings, saveSetting, type Settings } from "@/data/settings";
import type { Side } from "@/data/types";
import { applyTheme, followSystemTheme } from "@/lib/theme";

export const settingsKey = ["settings"] as const;

/** One setting and a value of its own type. */
type Change = { [K in keyof Settings]: { key: K; value: Settings[K] } }[keyof Settings];

/** Current settings. Loaded before the first render, so this never flashes defaults. */
export function useSettings(): Settings {
  const { data } = useQuery({ queryKey: settingsKey, queryFn: loadSettings });
  return data ?? DEFAULT_SETTINGS;
}

/** The side of kinlo on screen: personal or business. */
export function useSide(): Side {
  return currentSide(useSettings());
}

/** Saves one setting. The UI updates at once and rolls back if the write fails. */
export function useSaveSetting() {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ key, value }: Change) => saveSetting(key, value as never),
    onMutate: async ({ key, value }) => {
      await client.cancelQueries({ queryKey: settingsKey });
      const previous = client.getQueryData<Settings>(settingsKey);
      client.setQueryData<Settings>(settingsKey, { ...(previous ?? DEFAULT_SETTINGS), [key]: value });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(settingsKey, context.previous);
    },
  });
  const { mutate } = mutation;
  return useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => mutate({ key, value } as Change),
    [mutate],
  );
}

/** Keeps the document's theme in step with the saved preference and the OS. */
export function useThemeSync() {
  const { theme } = useSettings();
  const client = useQueryClient();
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(
    () => followSystemTheme(() => client.getQueryData<Settings>(settingsKey)?.theme ?? DEFAULT_SETTINGS.theme),
    [client],
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSettings } from "@/app/settings";
import type { AiProvider } from "@/data/settings";
import { getKey, setKey } from "./keys";
import { cleanBaseUrl, configFrom, listModels, PROVIDERS, type AiConfig } from "./providers";

const keyQuery = (provider: AiProvider | null) => ["ai", "key", provider] as const;

/**
 * Whether a key is saved for this provider. Only a yes or no is kept in memory here;
 * the key itself is read from the keychain at the moment it is needed.
 */
export function useHasKey(provider: AiProvider | null) {
  return useQuery({
    queryKey: keyQuery(provider),
    queryFn: async () => (provider ? (await getKey(provider)) !== null : false),
    // A provider that takes no key never needs the keychain to be asked.
    enabled: provider !== null && PROVIDERS[provider].needsKey,
  });
}

/** Saves a key to the keychain, or removes it when given null. */
export function useSaveKey() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ provider, key }: { provider: AiProvider; key: string | null }) => setKey(provider, key),
    onSuccess: (_result, { provider }) => {
      void client.invalidateQueries({ queryKey: keyQuery(provider) });
      void client.invalidateQueries({ queryKey: ["ai", "models", provider] });
    },
  });
}

/** The models the provider offers for the saved key. Fails quietly into free text. */
export function useModels(provider: AiProvider | null, baseUrl: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["ai", "models", provider, cleanBaseUrl(baseUrl)] as const,
    queryFn: async () => listModels(provider!, PROVIDERS[provider!].needsKey ? await getKey(provider!) : null, baseUrl),
    enabled: provider !== null && enabled,
    staleTime: 5 * 60_000,
  });
}

export type AssistantStatus =
  | { state: "ready"; config: AiConfig }
  | { state: "checking" | "no-provider" | "no-key" | "no-model"; config: null };

/** Whether the assistant can be used yet, and if not, what is missing. */
export function useAssistantStatus(): AssistantStatus {
  const settings = useSettings();
  const provider = settings.aiProvider;
  const hasKey = useHasKey(provider);
  if (!provider) return { state: "no-provider", config: null };
  if (PROVIDERS[provider].needsKey) {
    if (hasKey.isPending) return { state: "checking", config: null };
    if (!hasKey.data) return { state: "no-key", config: null };
  }
  const config = configFrom(settings);
  return config ? { state: "ready", config } : { state: "no-model", config: null };
}

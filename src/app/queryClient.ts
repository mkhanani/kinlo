import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    // The database is local and only this app writes to it, so data is fresh until we change it.
    defaultOptions: { queries: { staleTime: Infinity, refetchOnWindowFocus: false, retry: false } },
  });
}

export const queryClient = createQueryClient();

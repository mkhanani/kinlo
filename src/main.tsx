import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/app/AppShell";
import { hasNativeEffects, platform } from "@/lib/platform";
import "@/styles/index.css";

document.documentElement.dataset.platform = platform;
document.documentElement.dataset.effects = hasNativeEffects ? "native" : "none";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: false } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <HashRouter>
          <AppShell />
        </HashRouter>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);

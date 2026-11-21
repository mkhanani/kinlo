import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/app/AppShell";
import { StartupError } from "@/app/StartupError";
import { queryClient } from "@/app/queryClient";
import { settingsKey } from "@/app/settings";
import { loadSettings, openDatabase } from "@/data";
import { hasNativeEffects, platform } from "@/lib/platform";
import "@/styles/index.css";

document.documentElement.dataset.platform = platform;
document.documentElement.dataset.effects = hasNativeEffects ? "native" : "none";

const root = createRoot(document.getElementById("root")!);

async function start() {
  // Open the database (this runs any pending migrations) and read settings before the
  // first render, so the app never flashes the wrong theme or a hidden page.
  await openDatabase();
  queryClient.setQueryData(settingsKey, await loadSettings());

  root.render(
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
}

start().catch((error: unknown) => {
  console.error(error);
  root.render(<StartupError error={error} />);
});

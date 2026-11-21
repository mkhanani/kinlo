import { render } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { MemoryRouter } from "react-router-dom";
import { Root } from "@/app/Root";
import { createQueryClient } from "@/app/queryClient";
import { settingsKey } from "@/app/settings";
import { DEFAULT_SETTINGS, type Settings } from "@/data";
import { EMPTY_PEOPLE_FILTER, useUI } from "@/store/ui";

/** Renders the whole app at a route, the way main.tsx does, on the current test database. */
export function renderApp(path = "/", settings: Partial<Settings> = {}) {
  useUI.setState({
    assistantOpen: false,
    paletteOpen: false,
    contactForm: { open: false, contactId: null },
    peopleFilter: EMPTY_PEOPLE_FILTER,
  });
  localStorage.clear();
  const client = createQueryClient();
  // The real app loads settings before its first render. Do the same here.
  client.setQueryData(settingsKey, { ...DEFAULT_SETTINGS, onboarded: true, ...settings });
  return render(
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="always">
        <MemoryRouter initialEntries={[path]}>
          <Root />
        </MemoryRouter>
      </MotionConfig>
    </QueryClientProvider>,
  );
}

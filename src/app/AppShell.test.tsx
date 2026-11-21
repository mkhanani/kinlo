import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./AppShell";
import { createQueryClient } from "./queryClient";
import { settingsKey } from "./settings";
import { DEFAULT_SETTINGS, type Settings } from "@/data";
import { useTestDatabase } from "@/data/testing";
import { useUI } from "@/store/ui";

useTestDatabase();

function renderShell(path = "/", settings: Partial<Settings> = {}) {
  const client = createQueryClient();
  // The real app loads settings before its first render. Do the same here.
  client.setQueryData(settingsKey, { ...DEFAULT_SETTINGS, ...settings });
  return render(
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="always">
        <MemoryRouter initialEntries={[path]}>
          <AppShell />
        </MemoryRouter>
      </MotionConfig>
    </QueryClientProvider>,
  );
}

describe("app shell", () => {
  it("shows the main navigation", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const name of ["Home", "People", "Pipeline", "Reminders", "Settings"]) {
      expect(nav).toHaveTextContent(name);
    }
  });

  it("hides Pipeline when it is turned off", () => {
    renderShell("/", { pipelineEnabled: false });
    expect(screen.queryByRole("link", { name: "Pipeline" })).not.toBeInTheDocument();
  });

  it("sends a hidden Pipeline route back to Home", async () => {
    renderShell("/pipeline", { pipelineEnabled: false });
    expect(screen.queryByRole("heading", { name: "Pipeline" })).not.toBeInTheDocument();
    expect(await screen.findByText("Due for a catch-up")).toBeInTheDocument();
  });

  it("opens the command palette on Ctrl+K", async () => {
    useUI.setState({ paletteOpen: false });
    renderShell();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("toggles the assistant on Ctrl+J", () => {
    useUI.setState({ assistantOpen: false });
    renderShell();
    fireEvent.keyDown(window, { key: "j", ctrlKey: true });
    expect(useUI.getState().assistantOpen).toBe(true);
  });

  it("marks non-production builds next to the wordmark", () => {
    // Tests run outside the Tauri shell, which is the dev channel.
    renderShell();
    expect(screen.getByText("dev")).toBeInTheDocument();
  });
});

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MotionConfig } from "motion/react";
import { AppShell } from "./AppShell";
import { useUI } from "@/store/ui";

function renderShell(path = "/") {
  return render(
    <MotionConfig reducedMotion="always">
      <MemoryRouter initialEntries={[path]}>
        <AppShell />
      </MemoryRouter>
    </MotionConfig>,
  );
}

describe("app shell", () => {
  it("shows the main navigation", () => {
    useUI.setState({ pipelineEnabled: true });
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const name of ["Home", "People", "Pipeline", "Reminders", "Settings"]) {
      expect(nav).toHaveTextContent(name);
    }
  });

  it("hides Pipeline when it is turned off", () => {
    useUI.setState({ pipelineEnabled: false });
    renderShell();
    expect(screen.queryByRole("link", { name: "Pipeline" })).not.toBeInTheDocument();
  });

  it("sends a hidden Pipeline route back to Home", () => {
    useUI.setState({ pipelineEnabled: false });
    renderShell("/pipeline");
    expect(screen.queryByRole("heading", { name: "Pipeline" })).not.toBeInTheDocument();
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

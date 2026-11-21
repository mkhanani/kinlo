import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { useTestDatabase } from "@/data/testing";
import { useUI } from "@/store/ui";
import { renderApp as renderShell } from "@/test/render";

useTestDatabase();

describe("app shell", () => {
  it("shows the main navigation, with the pipeline on the business side", () => {
    renderShell("/", { activeSide: "business" });
    const nav = screen.getByRole("navigation", { name: "Main" });
    for (const name of ["Home", "People", "Pipeline", "Reminders", "Settings"]) {
      expect(nav).toHaveTextContent(name);
    }
  });

  it("hides Pipeline on the personal side", () => {
    renderShell("/", { activeSide: "personal" });
    expect(screen.queryByRole("link", { name: "Pipeline" })).not.toBeInTheDocument();
  });

  it("sends a hidden Pipeline route back to Home", async () => {
    renderShell("/pipeline", { sides: "personal" });
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

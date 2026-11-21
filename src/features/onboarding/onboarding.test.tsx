import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { loadSettings } from "@/data";
import { useTestDatabase } from "@/data/testing";
import { renderApp } from "@/test/render";

useTestDatabase();

const enter = () => fireEvent.keyDown(window, { key: "Enter" });

/** Walks the first three screens with the keyboard, as far as the split screen. */
async function reachSides(name = "Mustafa") {
  renderApp("/", { onboarded: false });
  await screen.findByRole("heading", { name: "Remember your people." });
  fireEvent.click(screen.getByRole("button", { name: "Get started" }));

  const input = await screen.findByLabelText("Your name");
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: "Enter" });

  await screen.findByRole("heading", { name: "How should kinlo look?" });
  fireEvent.keyDown(window, { key: "c" });
  await waitFor(() => expect(screen.getByRole("radio", { name: /Dark/ })).toBeChecked());
  enter();

  await screen.findByRole("heading", { name: "What will you use kinlo for?" });
}

describe("Welcome setup", () => {
  it("is what a new user sees, instead of the app", async () => {
    renderApp("/", { onboarded: false });
    expect(await screen.findByRole("heading", { name: "Remember your people." })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
  });

  it("choosing Business opens the app on the business side, with the answers saved", async () => {
    await reachSides();
    fireEvent.click(screen.getByRole("button", { name: /^Business/ }));

    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /, Mustafa$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pipeline" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Side" })).not.toBeInTheDocument();

    await waitFor(async () =>
      expect(await loadSettings()).toMatchObject({
        onboarded: true,
        userName: "Mustafa",
        theme: "dark",
        sides: "business",
        activeSide: "business",
      }),
    );
  });

  it("choosing Personal opens the personal side, with no pipeline", async () => {
    await reachSides();
    fireEvent.click(screen.getByRole("button", { name: /^Personal/ }));
    expect(await screen.findByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Pipeline" })).not.toBeInTheDocument();
    await waitFor(async () => expect(await loadSettings()).toMatchObject({ onboarded: true, sides: "personal" }));
  });

  it("ticking I want both gives the switch between sides", async () => {
    await reachSides();
    const both = screen.getByRole("checkbox", { name: "I want both" });
    fireEvent.click(both);
    expect(both).toBeChecked();
    expect(await screen.findByRole("radiogroup", { name: "Side" }, { timeout: 3000 })).toBeInTheDocument();
    await waitFor(async () => expect(await loadSettings()).toMatchObject({ onboarded: true, sides: "both" }));
  });

  it("the name can be skipped, and you can go back", async () => {
    renderApp("/", { onboarded: false });
    fireEvent.click(await screen.findByRole("button", { name: "Get started" }));
    await screen.findByLabelText("Your name");
    expect(screen.getByRole("button", { name: /Skip/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous question" }));
    expect(await screen.findByRole("heading", { name: "Remember your people." })).toBeInTheDocument();
  });

  it("can be run again from Settings without losing anything", async () => {
    renderApp("/settings", { userName: "Mustafa", sides: "business" });
    fireEvent.click(await screen.findByRole("button", { name: "Run again" }));
    expect(await screen.findByRole("heading", { name: "Remember your people." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Get started" }));
    // The name from last time is already filled in.
    expect(await screen.findByLabelText("Your name")).toHaveValue("Mustafa");
  });
});

import { describe, expect, it } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { getKey } from "@/ai/keys";
import { loadSettings } from "@/data";
import { db } from "@/data/driver";
import { useTestDatabase } from "@/data/testing";
import { renderApp } from "@/test/render";

useTestDatabase();

const enter = () => fireEvent.keyDown(window, { key: "Enter" });

/**
 * Waits for a question to be on screen and ready for the keyboard. A screen listens for
 * keys from an effect, which React runs a moment after the heading appears; a key
 * pressed in that gap would be lost, which no person is fast enough to do.
 */
async function question(name: string) {
  const heading = await screen.findByRole("heading", { name });
  await act(async () => {});
  return heading;
}

/** Walks the first screens with the keyboard, as far as the split screen. */
async function reachSides(name = "Mustafa") {
  renderApp("/", { onboarded: false });
  await question("Remember your people.");
  fireEvent.click(screen.getByRole("button", { name: "Get started" }));

  const input = await screen.findByLabelText("Your name");
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: "Enter" });

  await question("How should kinlo look?");
  fireEvent.keyDown(window, { key: "c" });
  await waitFor(() => expect(screen.getByRole("radio", { name: /Dark/ })).toBeChecked());
  enter();

  // The assistant is optional: Enter skips it.
  await question("Would you like an assistant?");
  expect(screen.getByRole("button", { name: /Skip/ })).toBeInTheDocument();
  enter();

  await question("What will you use kinlo for?");
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

  it("can connect a model on the way, with the key going to the keychain and not the database", async () => {
    renderApp("/", { onboarded: false });
    fireEvent.click(await screen.findByRole("button", { name: "Get started" }));
    fireEvent.keyDown(await screen.findByLabelText("Your name"), { key: "Enter" });
    await question("How should kinlo look?");
    enter();

    await question("Would you like an assistant?");
    fireEvent.keyDown(window, { key: "a" });
    await waitFor(() => expect(screen.getByRole("radio", { name: /Anthropic/ })).toBeChecked());
    const key = screen.getByLabelText("API key");
    fireEvent.change(key, { target: { value: "sk-ant-onboarding" } });
    // Typing a letter in the key box does not change the answer.
    fireEvent.keyDown(key, { key: "e" });
    expect(screen.getByRole("radio", { name: /Anthropic/ })).toBeChecked();
    fireEvent.keyDown(key, { key: "Enter" });

    await question("What will you use kinlo for?");
    await waitFor(async () => expect(await getKey("anthropic")).toBe("sk-ant-onboarding"));
    expect(await loadSettings()).toMatchObject({ aiProvider: "anthropic", aiModel: null });
    const stored = await db().select<{ value: string }>("SELECT value FROM settings");
    expect(JSON.stringify(stored)).not.toContain("sk-ant-onboarding");
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

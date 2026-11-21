import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { setModelFactory, useChat } from "@/ai/chat";
import { clearMemoryKeys } from "@/ai/keys";
import { buildInstructions } from "@/ai/prompt";
import { scriptedModel, type Scripted } from "@/ai/testing";
import * as data from "@/data";
import { useTestDatabase } from "@/data/testing";
import { renderApp } from "@/test/render";

useTestDatabase();

afterEach(() => {
  setModelFactory();
  clearMemoryKeys();
});

const connected = { aiProvider: "ollama" as const, aiModel: "test-model", sides: "personal" as const };

function script(replies: Scripted[][]) {
  const scripted = scriptedModel(replies);
  setModelFactory(async () => scripted.model);
  return scripted;
}

/** Opens the palette and types a line into it. */
async function typeInPalette(text: string) {
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const input = await screen.findByRole("combobox");
  fireEvent.change(input, { target: { value: text } });
  return input;
}

const instructionsOf = (request: unknown) => JSON.stringify((request as { prompt: unknown[] }).prompt[0]);

describe("Quick add in the palette", () => {
  it("is offered for a sentence once a model is connected", async () => {
    script([[{ say: "ok" }]]);
    renderApp("/", connected);
    await typeInPalette("Had coffee with Zoë yesterday");
    const option = await screen.findByRole("option", { name: /Quick add/ });
    expect(option).toHaveTextContent("Had coffee with Zoë yesterday");
  });

  it("is not offered without a model, or for a plain search", async () => {
    renderApp("/");
    await typeInPalette("Had coffee with Zoë yesterday");
    await screen.findByText("Nothing matches that.");
    expect(screen.queryByRole("option", { name: /Quick add/ })).not.toBeInTheDocument();
  });

  it("does not get in the way of opening a person", async () => {
    script([[{ say: "ok" }]]);
    const zoe = await data.createContact({ name: "Zoë Nakamura" });
    renderApp("/", connected);
    const input = await typeInPalette("Zoë Nakamura");
    // The person comes first, so Enter still opens them.
    await screen.findByRole("option", { name: /^Zoë Nakamura/ });
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[1]).toHaveTextContent("Quick add");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByRole("heading", { name: "Zoë Nakamura" })).toBeInTheDocument();
    expect(zoe.id).toBeTruthy();
  });

  it("waits for the search before acting on Enter, so a name typed fast still opens the person", async () => {
    script([[{ say: "ok" }]]);
    await data.createContact({ name: "Zoë Nakamura" });
    renderApp("/", connected);
    const input = await typeInPalette("Zoë Nakamura");
    // Enter straight away, before any result has arrived.
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByRole("heading", { name: "Zoë Nakamura" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Quick add" })).not.toBeInTheDocument();
  });

  it("shows what it would save, and saves on Enter", async () => {
    const zoe = await data.createContact({ name: "Zoë Nakamura" });
    const scripted = script([
      [{ call: "search_contacts", input: { query: "Zoë" } }],
      [
        { call: "log_interaction", input: { contact_id: zoe.id, type: "meeting", summary: "Coffee. She is moving to Lisbon." } },
        { call: "create_reminder", input: { title: "Send Zoë the photos", due_at: "2031-05-02T09:00", contact_id: zoe.id } },
      ],
      [{ say: "Saved both." }],
    ]);
    renderApp("/reminders", connected);
    const input = await typeInPalette("Had coffee with Zoë, she is moving to Lisbon. Remind me to send the photos");
    await screen.findByRole("option", { name: /Quick add/ });
    fireEvent.keyDown(input, { key: "Enter" });

    const quick = within(await screen.findByRole("group", { name: "Quick add" }));
    expect(await quick.findByRole("group", { name: "Log a meeting with Zoë Nakamura" })).toBeInTheDocument();
    expect(await quick.findByRole("group", { name: "Remind you: Send Zoë the photos" })).toBeInTheDocument();
    expect(quick.getByText("Enter to confirm all · Esc to cancel")).toBeInTheDocument();
    // Nothing yet.
    expect(await data.listInteractions(zoe.id)).toEqual([]);
    expect(await data.listReminders()).toEqual([]);

    fireEvent.keyDown(screen.getByRole("group", { name: "Quick add" }), { key: "Enter" });
    await waitFor(async () => expect(await data.listReminders()).toHaveLength(1));
    expect(await data.listInteractions(zoe.id)).toHaveLength(1);
    // The palette closes by itself, and the page behind has caught up.
    await waitFor(() => expect(screen.queryByRole("group", { name: "Quick add" })).not.toBeInTheDocument(), {
      timeout: 4000,
    });
    expect(await within(await screen.findByRole("main")).findByText("Send Zoë the photos")).toBeInTheDocument();

    // It was told this is a quick add, and it is not kept as a conversation.
    expect(instructionsOf(scripted.requests[0])).toContain("quick add box");
    expect(await data.listThreads()).toEqual([]);
    expect(useChat.getState().messages).toEqual([]);
  });

  it("saves nothing when the palette is closed instead", async () => {
    script([[{ call: "create_contact", input: { name: "Sam Rivera", how_we_met: "Design conference" } }]]);
    renderApp("/", connected);
    const input = await typeInPalette("Met Sam Rivera at the design conference");
    await screen.findByRole("option", { name: /Quick add/ });
    fireEvent.keyDown(input, { key: "Enter" });

    const quick = await screen.findByRole("group", { name: "Quick add" });
    await within(quick).findByRole("group", { name: "Add Sam Rivera" });
    fireEvent.keyDown(quick, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("group", { name: "Quick add" })).not.toBeInTheDocument());
    expect(await data.countContacts()).toBe(0);
  });

  it("can add someone new and then record the rest, one confirmation at a time", async () => {
    const scripted = script([
      [{ call: "search_contacts", input: { query: "Sam Rivera" } }],
      [{ call: "create_contact", input: { name: "Sam Rivera" } }],
      // The second step needs the new person's id, which only exists once they are saved.
      [{ say: "placeholder" }],
    ]);
    renderApp("/", connected);
    const input = await typeInPalette("Met Sam Rivera today, talked about hiking");
    await screen.findByRole("option", { name: /Quick add/ });
    fireEvent.keyDown(input, { key: "Enter" });

    const quick = await screen.findByRole("group", { name: "Quick add" });
    await within(quick).findByRole("group", { name: "Add Sam Rivera" });
    fireEvent.keyDown(quick, { key: "Enter" });
    await waitFor(async () => expect(await data.countContacts()).toBe(1));
    // The model was told the new person's id, so it can carry on.
    const [sam] = await data.listContacts();
    await waitFor(() => expect(JSON.stringify(scripted.requests.at(-1))).toContain(sam!.id));
  });

  it("shows a plain reply when there is nothing to save", async () => {
    script([[{ say: "There is nothing to save in that." }]]);
    renderApp("/", connected);
    const input = await typeInPalette("what a lovely day it is");
    await screen.findByRole("option", { name: /Quick add/ });
    fireEvent.keyDown(input, { key: "Enter" });
    const quick = within(await screen.findByRole("group", { name: "Quick add" }));
    expect(await quick.findByText("There is nothing to save in that.")).toBeInTheDocument();
    expect(await quick.findByText("Esc to close")).toBeInTheDocument();
  });
});

describe("Assistant on a person's page", () => {
  const panel = () => within(screen.getByRole("complementary", { name: "Assistant" }));

  async function openMenu() {
    const button = await screen.findByRole("button", { name: "Ask the assistant" });
    fireEvent.pointerDown(button, { button: 0, ctrlKey: false });
  }

  it("is only there once a provider has been chosen", async () => {
    const zoe = await data.createContact({ name: "Zoë Nakamura" });
    renderApp(`/people/${zoe.id}`);
    await screen.findByRole("heading", { name: "Zoë Nakamura" });
    expect(screen.queryByRole("button", { name: "Ask the assistant" })).not.toBeInTheDocument();
  });

  it("summarizes the person in a new conversation", async () => {
    const zoe = await data.createContact({ name: "Zoë Nakamura", company: "Fernhill Studio" });
    await data.addInteraction({ contact_id: zoe.id, type: "call", summary: "Talked about the rebrand" });
    const scripted = script([
      [{ call: "get_contact", input: { contact_id: zoe.id } }],
      [{ say: "Zoë runs Fernhill Studio. You last spoke about the rebrand." }],
    ]);
    renderApp(`/people/${zoe.id}`, connected);
    await openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Summarize" }));

    expect(await panel().findByText("Summarize where things stand with Zoë Nakamura.")).toBeInTheDocument();
    expect(await panel().findByText("Zoë runs Fernhill Studio. You last spoke about the rebrand.")).toBeInTheDocument();
    expect(panel().getByText("Read a person's details")).toBeInTheDocument();
    // It knew whose page was open, and it read the conversation from the database.
    expect(instructionsOf(scripted.requests[0])).toContain(zoe.id);
    expect(JSON.stringify(scripted.requests[1])).toContain("Talked about the rebrand");
  });

  it("starts a draft for you to finish", async () => {
    const zoe = await data.createContact({ name: "Zoë Nakamura" });
    const scripted = script([[{ say: "Hi Zoë, congratulations on the launch." }]]);
    renderApp(`/people/${zoe.id}`, connected);
    await openMenu();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Draft a message" }));

    const box = await panel().findByLabelText("Message the assistant");
    expect(box).toHaveValue("Draft a short message to Zoë Nakamura ");
    // The cursor is in the box, ready to finish the sentence, not back on the menu button.
    await waitFor(() => expect(box).toHaveFocus());
    // Nothing is sent until the user finishes the sentence.
    expect(scripted.turns()).toBe(0);
    fireEvent.change(box, { target: { value: "Draft a short message to Zoë Nakamura about her launch" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(await panel().findByText("Hi Zoë, congratulations on the launch.")).toBeInTheDocument();
    expect(await panel().findByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("knows who is meant by them while their page is open, and forgets after", async () => {
    const zoe = await data.createContact({ name: "Zoë Nakamura" });
    const scripted = script([[{ say: "ok" }], [{ say: "ok again" }]]);
    const view = renderApp(`/people/${zoe.id}`, connected);
    await screen.findByRole("heading", { name: "Zoë Nakamura" });
    fireEvent.keyDown(window, { key: "j", ctrlKey: true });
    const box = await panel().findByLabelText("Message the assistant");
    fireEvent.change(box, { target: { value: "When did I last talk to them?" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await panel().findByText("ok");
    expect(instructionsOf(scripted.requests[0])).toContain("Zoë Nakamura's page open");

    // Away from the page, the name is no longer sent along.
    fireEvent.click(screen.getByRole("link", { name: "Home" }));
    await screen.findByText("Due for a catch-up");
    await act(async () => {});
    await waitFor(() => expect(panel().getByRole("button", { name: "Send" })).toBeInTheDocument());
    const again = panel().getByLabelText("Message the assistant");
    fireEvent.change(again, { target: { value: "And now?" } });
    fireEvent.keyDown(again, { key: "Enter" });
    await panel().findByText("ok again");
    expect(instructionsOf(scripted.requests[1])).not.toContain("page open");
    view.unmount();
  });
});

describe("standing instructions", () => {
  it("name the open person only when there is one", () => {
    const base = { userName: "Mustafa", side: "personal" as const, sides: "both" as const };
    expect(buildInstructions(base)).not.toContain("page open");
    const focused = buildInstructions({ ...base, focus: { id: "c-1", name: "Ana Lima" } });
    expect(focused).toContain("Ana Lima's page open (id: c-1)");
  });
});

import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
  addInteraction,
  createContact,
  getContact,
  listContacts,
  listInteractions,
  listTags,
  loadSettings,
  setContactTags,
} from "@/data";
import { useTestDatabase } from "@/data/testing";
import { renderApp } from "@/test/render";

useTestDatabase();

const type = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/** Opens a dropdown menu the way a keyboard user would, then picks an item. */
async function pickFromMenu(trigger: HTMLElement, item: string | RegExp) {
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: item }));
}

describe("People list", () => {
  it("starts empty with one clear action", async () => {
    renderApp("/people");
    expect(await screen.findByText("Nobody here yet. Add your first person.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Search people")).not.toBeInTheDocument();
  });

  it("lists people with their work, tags and last contact", async () => {
    const zoe = await createContact({ name: "Zoë Nakamura", company: "Fernhill Studio", role: "Creative director" });
    await setContactTags(zoe.id, ["Design"]);
    await addInteraction({ contact_id: zoe.id, type: "call", happened_at: daysAgo(3) });
    await createContact({ name: "Marcus Bell" });

    renderApp("/people");
    const list = await screen.findByRole("list", { name: "People" });
    const rows = await within(list).findAllByRole("link");
    expect(rows.map((r) => within(r).getByText(/Zoë|Marcus/).textContent)).toEqual(["Marcus Bell", "Zoë Nakamura"]);
    expect(rows[1]).toHaveTextContent("Creative director at Fernhill Studio");
    expect(rows[1]).toHaveTextContent("Design");
    expect(rows[1]).toHaveTextContent("3 days ago");
    expect(rows[0]).toHaveTextContent("No contact yet");
    expect(screen.getByText("2 people")).toBeInTheDocument();
  });

  it("marks people who are overdue and can show only them", async () => {
    const late = await createContact({ name: "Ingrid Solberg", keep_in_touch_days: 7 });
    await addInteraction({ contact_id: late.id, type: "call", happened_at: daysAgo(16) });
    await createContact({ name: "Marcus Bell" });

    renderApp("/people");
    expect(await screen.findByText("9 days overdue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Overdue" }));
    await waitFor(() => expect(screen.queryByText("Marcus Bell")).not.toBeInTheDocument());
    expect(screen.getByText("Ingrid Solberg")).toBeInTheDocument();
  });

  it("searches notes and interaction summaries as you type", async () => {
    const zoe = await createContact({ name: "Zoë Nakamura", notes: "Collects vinyl" });
    await addInteraction({ contact_id: zoe.id, type: "meeting", summary: "Greenhouse rebrand kickoff" });
    await createContact({ name: "Marcus Bell" });

    renderApp("/people");
    const search = await screen.findByLabelText("Search people");

    type(search, "greenh");
    await waitFor(() => expect(screen.queryByText("Marcus Bell")).not.toBeInTheDocument());
    expect(screen.getByText("Zoë Nakamura")).toBeInTheDocument();

    type(search, "nobody at all");
    expect(await screen.findByText("Nobody matches that.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Marcus Bell")).toBeInTheDocument();
  });

  it("on the business side, filters by kind and hides archived people until asked", async () => {
    await createContact({ name: "Client Carla", business: "client" });
    await createContact({ name: "Lead Lars", business: "lead" });
    await createContact({ name: "Old Olga", business: "client", archived: true });

    renderApp("/people", { activeSide: "business" });
    await screen.findByText("Client Carla");
    expect(screen.queryByText("Old Olga")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Clients" }));
    await waitFor(() => expect(screen.queryByText("Lead Lars")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    fireEvent.click(screen.getByRole("button", { name: "Archived" }));
    expect(await screen.findByText("Old Olga")).toBeInTheDocument();
  });
});

describe("Adding and editing a person", () => {
  it("adds a person from the form and opens their page", async () => {
    renderApp("/people");
    fireEvent.click((await screen.findAllByRole("button", { name: /Add person/ }))[0]!);

    const dialog = await screen.findByRole("dialog");
    type(within(dialog).getByLabelText("Name"), "Priya Raman");
    type(within(dialog).getByLabelText("Company"), "Northwind Health");
    type(within(dialog).getByLabelText("Email"), "priya@northwind.example");
    fireEvent.change(within(dialog).getByLabelText("Birthday month"), { target: { value: "4" } });
    type(within(dialog).getByLabelText("Birthday day"), "9");
    fireEvent.change(within(dialog).getByLabelText("Keep in touch"), { target: { value: "30" } });
    const tags = within(dialog).getByLabelText("Tags");
    type(tags, "Clients");
    fireEvent.keyDown(tags, { key: "Enter" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add person" }));

    expect(await screen.findByRole("heading", { name: "Priya Raman" })).toBeInTheDocument();
    expect(screen.getByText("Every month")).toBeInTheDocument();

    const [saved] = await listContacts();
    expect(saved).toMatchObject({
      name: "Priya Raman",
      company: "Northwind Health",
      emails: [{ value: "priya@northwind.example" }],
      birthday: "--04-09",
      keep_in_touch_days: 30,
    });
    expect(saved!.tags.map((t) => t.name)).toEqual(["Clients"]);
    // Added from the personal side, so that is where they are.
    expect(saved).toMatchObject({ personal: true, business: null });
  });

  it("on the business side a new person is a lead unless you say otherwise, and can be on both", async () => {
    renderApp("/people", { activeSide: "business" });
    fireEvent.click((await screen.findAllByRole("button", { name: /Add person/ }))[0]!);
    const dialog = await screen.findByRole("dialog");

    type(within(dialog).getByLabelText("Name"), "Dana Whitfield");
    expect(within(dialog).getByRole("button", { name: "Business" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "Personal" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Client" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Personal" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add person" }));

    await screen.findByRole("heading", { name: "Dana Whitfield" });
    expect((await listContacts())[0]).toMatchObject({ personal: true, business: "client" });
  });

  it("will not save someone who is on neither side", async () => {
    renderApp("/people");
    fireEvent.click((await screen.findAllByRole("button", { name: /Add person/ }))[0]!);
    const dialog = await screen.findByRole("dialog");
    type(within(dialog).getByLabelText("Name"), "Nobody Nowhere");
    fireEvent.click(within(dialog).getByRole("button", { name: "Personal" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add person" }));
    expect(await within(dialog).findByText("Choose Personal, Business, or both.")).toBeInTheDocument();
    expect(await listContacts()).toEqual([]);
  });

  it("hides the side choice when only one side is switched on", async () => {
    renderApp("/people", { sides: "personal" });
    fireEvent.click((await screen.findAllByRole("button", { name: /Add person/ }))[0]!);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText("Shows on")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("radiogroup", { name: "Business kind" })).not.toBeInTheDocument();
  });

  it("asks for a name and refuses a date that does not exist", async () => {
    renderApp("/people");
    fireEvent.click((await screen.findAllByRole("button", { name: /Add person/ }))[0]!);
    const dialog = await screen.findByRole("dialog");

    fireEvent.change(within(dialog).getByLabelText("Birthday month"), { target: { value: "2" } });
    type(within(dialog).getByLabelText("Birthday day"), "31");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add person" }));

    expect(await within(dialog).findByText("Add a name.")).toBeInTheDocument();
    expect(within(dialog).getByText(/That date does not exist/)).toBeInTheDocument();
    expect(await listContacts()).toEqual([]);
  });

  it("edits an existing person, starting from what is saved", async () => {
    const ana = await createContact({ name: "Ana Lima", company: "Northwind" });
    await setContactTags(ana.id, ["Friends"]);

    renderApp(`/people/${ana.id}`);
    fireEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    const dialog = await screen.findByRole("dialog");

    const company = within(dialog).getByLabelText("Company");
    expect(company).toHaveValue("Northwind");
    expect(within(dialog).getByText("Friends")).toBeInTheDocument();
    type(company, "Southwind");
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(async () => expect((await getContact(ana.id))!.company).toBe("Southwind"));
    expect((await getContact(ana.id))!.tags.map((t) => t.name)).toEqual(["Friends"]);
  });
});

describe("A person's page", () => {
  it("shows details and the timeline, newest first", async () => {
    const zoe = await createContact({
      name: "Zoë Nakamura",
      nickname: "Zo",
      location: "Portland",
      birthday: "--04-09",
      emails: [{ label: "work", value: "zoe@fernhill.example" }],
    });
    await addInteraction({ contact_id: zoe.id, type: "meeting", happened_at: daysAgo(40), summary: "Kickoff" });
    await addInteraction({ contact_id: zoe.id, type: "email", happened_at: daysAgo(2), summary: "Sent moodboard" });

    renderApp(`/people/${zoe.id}`);
    expect(await screen.findByRole("heading", { name: "Zoë Nakamura" })).toBeInTheDocument();
    expect(screen.getByText("zoe@fernhill.example")).toBeInTheDocument();
    expect(screen.getByText("Portland")).toBeInTheDocument();

    const timeline = screen.getByRole("region", { name: "Timeline" });
    const entries = await within(timeline).findAllByRole("listitem");
    expect(entries[0]).toHaveTextContent("Sent moodboard");
    expect(entries[1]).toHaveTextContent("Kickoff");
  });

  it("logging an interaction adds it to the timeline and clears overdue", async () => {
    const ingrid = await createContact({ name: "Ingrid Solberg", keep_in_touch_days: 7 });
    await addInteraction({ contact_id: ingrid.id, type: "call", happened_at: daysAgo(16) });

    renderApp(`/people/${ingrid.id}`);
    expect(await screen.findByText("9 days overdue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Message" }));
    type(screen.getByLabelText("Summary"), "Wished her luck for the move");
    fireEvent.click(screen.getByRole("button", { name: "Log message" }));

    expect(await screen.findByText("Wished her luck for the move")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("9 days overdue")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Summary")).toHaveValue("");
    expect((await listInteractions(ingrid.id))[0]).toMatchObject({ type: "message" });
  });

  it("saves notes when you click away", async () => {
    const ana = await createContact({ name: "Ana Lima" });
    renderApp(`/people/${ana.id}`);
    const notes = await screen.findByRole("textbox", { name: "Notes" });
    type(notes, "Prefers calls in the morning");
    fireEvent.blur(notes);
    await waitFor(async () => expect((await getContact(ana.id))!.notes).toBe("Prefers calls in the morning"));
  });

  it("says so when the person does not exist", async () => {
    renderApp("/people/not-a-real-id");
    expect(await screen.findByText("This person is not here any more.")).toBeInTheDocument();
  });
});

describe("The two sides", () => {
  it("each side lists its own people, and someone on both appears on both", async () => {
    await createContact({ name: "Friend Farid" });
    await createContact({ name: "Client Carla", business: "client" });
    await createContact({ name: "Both Bea", personal: true, business: "lead" });

    renderApp("/people", { activeSide: "personal" });
    await screen.findByText("Friend Farid");
    expect(screen.getByText("Both Bea")).toBeInTheDocument();
    expect(screen.queryByText("Client Carla")).not.toBeInTheDocument();
    expect(screen.getByText("2 people")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Pipeline" })).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Side" })).getByRole("radio", { name: "Business" }));
    expect(await screen.findByText("Client Carla")).toBeInTheDocument();
    expect(screen.getByText("Both Bea")).toBeInTheDocument();
    expect(screen.queryByText("Friend Farid")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pipeline" })).toBeInTheDocument();
    await waitFor(async () => expect((await loadSettings()).activeSide).toBe("business"));
  });

  it("shows no switch when only one side is in use", async () => {
    renderApp("/people", { sides: "business" });
    await screen.findByText(/No business contacts yet/);
    expect(screen.queryByRole("radiogroup", { name: "Side" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pipeline" })).toBeInTheDocument();
  });

  it("the palette only finds people on the side you are on", async () => {
    await createContact({ name: "Jordan Friend" });
    await createContact({ name: "Jordan Client", business: "client" });
    renderApp("/", { activeSide: "business" });
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    type(await screen.findByRole("combobox"), "jordan");
    expect(await screen.findByRole("option", { name: /Jordan Client/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Jordan Friend/ })).not.toBeInTheDocument();
  });
});

describe("Menus and destructive actions", () => {
  it("archives and unarchives from a person's menu", async () => {
    const ana = await createContact({ name: "Ana Lima" });
    renderApp(`/people/${ana.id}`);
    await pickFromMenu(await screen.findByRole("button", { name: "More" }), /^Archive/);
    await waitFor(async () => expect((await getContact(ana.id))!.archived).toBe(true));
    expect(await screen.findByText("Archived")).toBeInTheDocument();

    await pickFromMenu(screen.getByRole("button", { name: "More" }), /Unarchive/);
    await waitFor(async () => expect((await getContact(ana.id))!.archived).toBe(false));
  });

  it("deleting a person asks first, and cancelling keeps them", async () => {
    const ana = await createContact({ name: "Ana Lima" });
    renderApp(`/people/${ana.id}`);

    await pickFromMenu(await screen.findByRole("button", { name: "More" }), /Delete/);
    const confirm = await screen.findByRole("dialog", { name: "Delete Ana Lima?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await getContact(ana.id)).not.toBeNull();

    await pickFromMenu(screen.getByRole("button", { name: "More" }), /Delete/);
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Delete Ana Lima?" })).getByRole("button", { name: "Delete" }));
    await waitFor(async () => expect(await getContact(ana.id)).toBeNull());
    // Back on the list, which is now empty.
    expect(await screen.findByText("Nobody here yet. Add your first person.")).toBeInTheDocument();
  });

  it("edits and deletes a timeline entry from its menu", async () => {
    const ana = await createContact({ name: "Ana Lima" });
    await addInteraction({ contact_id: ana.id, type: "call", happened_at: daysAgo(2), summary: "First draft" });
    renderApp(`/people/${ana.id}`);
    await screen.findByText("First draft");

    await pickFromMenu(screen.getByRole("button", { name: "Call options" }), "Edit");
    const box = await screen.findByDisplayValue("First draft");
    type(box, "Final wording");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // Wait for the edit box to close, then the entry shows the new text.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
    expect(await screen.findByText("Final wording")).toBeInTheDocument();

    await pickFromMenu(await screen.findByRole("button", { name: "Call options" }), "Delete");
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Delete this call?" })).getByRole("button", { name: "Delete" }));
    await waitFor(async () => expect(await listInteractions(ana.id)).toEqual([]));
    await waitFor(async () => expect((await getContact(ana.id))!.last_contacted_at).toBeNull());
  });

  it("filters by tag from the tag menu, and manages tags", async () => {
    const ana = await createContact({ name: "Ana Lima" });
    const bo = await createContact({ name: "Bo Chen" });
    await setContactTags(ana.id, ["Friends"]);
    await setContactTags(bo.id, ["Climbing"]);
    renderApp("/people");
    await screen.findByText("Bo Chen");

    await pickFromMenu(screen.getByRole("button", { name: "Tag filter" }), /Friends/);
    await waitFor(() => expect(screen.queryByText("Bo Chen")).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Ana Lima/ })).toBeInTheDocument();

    await pickFromMenu(screen.getByRole("button", { name: "Tag filter: Friends" }), "Manage tags");
    const dialog = await screen.findByRole("dialog", { name: "Tags" });

    // A name that is already taken is refused.
    fireEvent.click(within(dialog).getByRole("button", { name: "Rename Friends" }));
    const input = within(dialog).getByLabelText("New name for Friends");
    type(input, "climbing");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await within(dialog).findByText("There is already a tag with that name.")).toBeInTheDocument();

    type(input, "Close friends");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(async () => expect((await listTags()).map((t) => t.name)).toEqual(["Climbing", "Close friends"]));

    // Deleting the tag the list is filtered by clears the filter and keeps the person.
    fireEvent.click(await within(dialog).findByRole("button", { name: "Delete Close friends" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete tag" }));
    await waitFor(async () => expect((await listTags()).map((t) => t.name)).toEqual(["Climbing"]));
    expect(await getContact(ana.id)).not.toBeNull();
    expect(await screen.findByText("Bo Chen")).toBeInTheDocument();
  });
});

describe("Choosing when something happened", () => {
  it("logs for now by default, or for a day and time you pick", async () => {
    const ana = await createContact({ name: "Ana Lima" });
    renderApp(`/people/${ana.id}`);

    fireEvent.click(await screen.findByRole("button", { name: "When: Now" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yesterday" }));
    const time = screen.getByLabelText("Time");
    type(time, "3:30pm");
    fireEvent.keyDown(time, { key: "Enter" });
    expect(await screen.findByRole("button", { name: "When: Yesterday, 3:30 PM" })).toBeInTheDocument();

    type(screen.getByLabelText("Summary"), "Yesterday's call");
    fireEvent.click(screen.getByRole("button", { name: "Log call" }));
    await screen.findByText("Yesterday's call");

    const [logged] = await listInteractions(ana.id);
    const when = new Date(logged!.happened_at);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect([when.getDate(), when.getHours(), when.getMinutes()]).toEqual([yesterday.getDate(), 15, 30]);
    // Ready for the next one, back at "now".
    expect(screen.getByRole("button", { name: "When: Now" })).toBeInTheDocument();
  });

  it("does not offer days that have not happened yet", async () => {
    const ana = await createContact({ name: "Ana Lima" });
    renderApp(`/people/${ana.id}`);
    fireEvent.click(await screen.findByRole("button", { name: "When: Now" }));
    const grid = await screen.findByRole("grid");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const label = tomorrow.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const cell = within(grid).queryByRole("button", { name: label });
    // Tomorrow may fall outside the weeks shown at the very end of a month's grid.
    if (cell) expect(cell).toBeDisabled();
  });

  it("a note does not count as being in touch", async () => {
    const ingrid = await createContact({ name: "Ingrid Solberg", keep_in_touch_days: 7 });
    await addInteraction({ contact_id: ingrid.id, type: "call", happened_at: daysAgo(16) });
    renderApp(`/people/${ingrid.id}`);
    await screen.findByText("9 days overdue");

    fireEvent.click(screen.getByRole("radio", { name: "Note" }));
    type(screen.getByLabelText("Summary"), "Ask about the move");
    fireEvent.click(screen.getByRole("button", { name: "Log note" }));

    expect(await screen.findByText("Ask about the move")).toBeInTheDocument();
    expect(screen.getByText("9 days overdue")).toBeInTheDocument();
  });
});

describe("Command palette", () => {
  it("finds a person and opens their page", async () => {
    const zoe = await createContact({ name: "Zoë Nakamura", notes: "Collects vinyl" });
    renderApp("/");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByRole("combobox");
    type(input, "vinyl");
    expect(await screen.findByRole("option", { name: /Zoë Nakamura/ })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByRole("heading", { name: "Zoë Nakamura" })).toBeInTheDocument();
    expect(zoe.id).toBeTruthy();
  });

  it("jumps to pages and starts adding a person", async () => {
    renderApp("/");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByRole("combobox");
    type(input, "add");
    fireEvent.click(await screen.findByRole("option", { name: /Add person/ }));
    expect(await screen.findByRole("dialog", { name: "Add person" })).toBeInTheDocument();
  });
});

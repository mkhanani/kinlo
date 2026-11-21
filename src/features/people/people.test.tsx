import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { addInteraction, createContact, getContact, listContacts, listInteractions, setContactTags } from "@/data";
import { useTestDatabase } from "@/data/testing";
import { renderApp } from "@/test/render";

useTestDatabase();

const type = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

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

  it("filters by kind and hides archived people until asked", async () => {
    await createContact({ name: "Client Carla", kind: "client" });
    await createContact({ name: "Friend Farid", kind: "personal" });
    await createContact({ name: "Old Olga", archived: true });

    renderApp("/people");
    await screen.findByText("Client Carla");
    expect(screen.queryByText("Old Olga")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Client" }));
    await waitFor(() => expect(screen.queryByText("Friend Farid")).not.toBeInTheDocument());

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
    const notes = await screen.findByLabelText("Notes");
    type(notes, "Prefers calls in the morning");
    fireEvent.blur(notes);
    await waitFor(async () => expect((await getContact(ana.id))!.notes).toBe("Prefers calls in the morning"));
  });

  it("says so when the person does not exist", async () => {
    renderApp("/people/not-a-real-id");
    expect(await screen.findByText("This person is not here any more.")).toBeInTheDocument();
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

import { describe, expect, it } from "vitest";
import {
  addInteraction,
  archiveContact,
  createContact,
  createDeal,
  createReminder,
  deleteContact,
  deleteInteraction,
  getContact,
  listContacts,
  listDeals,
  listInteractions,
  listOverdueContacts,
  listReminders,
  listTags,
  searchContacts,
  setContactTags,
  updateContact,
  updateInteraction,
} from "./index";
import { daysAgo, NOW, useTestDatabase } from "./testing";

useTestDatabase();

describe("contacts", () => {
  it("creates a person with defaults and reads them back", async () => {
    const c = await createContact({ name: "  Priya Raman  " });
    expect(c).toMatchObject({
      name: "Priya Raman",
      kind: "personal",
      emails: [],
      phones: [],
      socials: [],
      tags: [],
      archived: false,
      last_contacted_at: null,
      keep_in_touch_days: null,
    });
    expect(c.created_at).toBe(c.updated_at);
    expect(await getContact(c.id)).toEqual(c);
  });

  it("stores every field, tidying text and contact details", async () => {
    const c = await createContact({
      name: "Tomás Okafor",
      nickname: "Tom",
      kind: "client",
      company: "Larkspur Co",
      role: "Founder",
      emails: [{ label: "work", value: " tom@larkspur.example " }, { value: "  " }],
      phones: [{ value: "+1 555 0100" }],
      socials: [{ label: "LinkedIn", value: "tomas-okafor" }],
      location: "Lisbon",
      birthday: "--04-09",
      how_we_met: "Conference in Porto",
      notes: "   ",
      keep_in_touch_days: 30,
    });
    expect(c.emails).toEqual([{ label: "work", value: "tom@larkspur.example" }]);
    expect(c.phones).toEqual([{ value: "+1 555 0100" }]);
    expect(c.notes).toBeNull();
    expect(c.birthday).toBe("--04-09");
    expect(c.keep_in_touch_days).toBe(30);
  });

  it("refuses a person without a name", async () => {
    await expect(createContact({ name: "   " })).rejects.toThrow("needs a name");
    const c = await createContact({ name: "Ana" });
    await expect(updateContact(c.id, { name: "" })).rejects.toThrow("needs a name");
  });

  it("updates only the fields in the patch", async () => {
    const c = await createContact({ name: "Ana", company: "Northwind", notes: "Likes tea" });
    const updated = await updateContact(c.id, { company: null, kind: "lead" });
    expect(updated.company).toBeNull();
    expect(updated.kind).toBe("lead");
    expect(updated.notes).toBe("Likes tea");
    expect(updated.name).toBe("Ana");
  });

  it("rejects values the schema does not allow", async () => {
    const c = await createContact({ name: "Ana" });
    await expect(updateContact(c.id, { kind: "enemy" as never })).rejects.toThrow();
    await expect(updateContact(c.id, { keep_in_touch_days: 0 })).rejects.toThrow();
  });

  it("lists by name, ignoring case, and hides archived people unless asked", async () => {
    await createContact({ name: "bea" });
    await createContact({ name: "Ana" });
    const carl = await createContact({ name: "Carl" });
    await archiveContact(carl.id);

    expect((await listContacts()).map((c) => c.name)).toEqual(["Ana", "bea"]);
    expect((await listContacts({ includeArchived: true })).map((c) => c.name)).toEqual(["Ana", "bea", "Carl"]);
  });

  it("filters by kind and by tag", async () => {
    const ana = await createContact({ name: "Ana", kind: "client" });
    const bea = await createContact({ name: "Bea", kind: "personal" });
    const [family] = await setContactTags(bea.id, ["Family"]);
    await setContactTags(ana.id, ["Design"]);

    expect((await listContacts({ kind: "client" })).map((c) => c.name)).toEqual(["Ana"]);
    expect((await listContacts({ tagId: family!.id })).map((c) => c.name)).toEqual(["Bea"]);
  });

  it("removes everything that belongs to a deleted person", async () => {
    const ana = await createContact({ name: "Ana" });
    await addInteraction({ contact_id: ana.id, type: "call", summary: "Hello" });
    await createReminder({ title: "Call Ana", due_at: NOW, contact_id: ana.id });
    await createDeal({ contact_id: ana.id, title: "Website" });
    await setContactTags(ana.id, ["Friend"]);

    await deleteContact(ana.id);

    expect(await getContact(ana.id)).toBeNull();
    expect(await listInteractions(ana.id)).toEqual([]);
    expect(await listReminders({ status: "all" })).toEqual([]);
    expect(await listDeals()).toEqual([]);
    expect(await searchContacts("Ana")).toEqual([]);
    // The tag itself stays, with nobody on it.
    expect(await listTags()).toMatchObject([{ name: "Friend", contact_count: 0 }]);
  });
});

describe("tags", () => {
  it("treats names as case-insensitive and never duplicates", async () => {
    const ana = await createContact({ name: "Ana" });
    const bea = await createContact({ name: "Bea" });
    await setContactTags(ana.id, ["Family", "family", " Design "]);
    await setContactTags(bea.id, ["FAMILY"]);

    expect(await listTags()).toMatchObject([
      { name: "Design", contact_count: 1 },
      { name: "Family", contact_count: 2 },
    ]);
    expect((await getContact(ana.id))!.tags.map((t) => t.name)).toEqual(["Design", "Family"]);
  });

  it("replaces a person's tags with exactly the new set", async () => {
    const ana = await createContact({ name: "Ana" });
    await setContactTags(ana.id, ["One", "Two"]);
    await setContactTags(ana.id, ["Two", "Three"]);
    expect((await getContact(ana.id))!.tags.map((t) => t.name)).toEqual(["Three", "Two"]);
    await setContactTags(ana.id, []);
    expect((await getContact(ana.id))!.tags).toEqual([]);
  });
});

describe("interactions and last contacted", () => {
  it("adding an interaction sets last_contacted_at", async () => {
    const ana = await createContact({ name: "Ana" });
    await addInteraction({ contact_id: ana.id, type: "call", happened_at: daysAgo(3), summary: "Caught up" });
    expect((await getContact(ana.id))!.last_contacted_at).toBe(daysAgo(3));
  });

  it("an older interaction never moves last_contacted_at backwards", async () => {
    const ana = await createContact({ name: "Ana" });
    await addInteraction({ contact_id: ana.id, type: "meeting", happened_at: daysAgo(2) });
    await addInteraction({ contact_id: ana.id, type: "email", happened_at: daysAgo(40) });
    expect((await getContact(ana.id))!.last_contacted_at).toBe(daysAgo(2));
  });

  it("deleting or re-dating the latest interaction falls back to the one before", async () => {
    const ana = await createContact({ name: "Ana" });
    await addInteraction({ contact_id: ana.id, type: "call", happened_at: daysAgo(10) });
    const latest = await addInteraction({ contact_id: ana.id, type: "call", happened_at: daysAgo(1) });

    await updateInteraction(latest.id, { happened_at: daysAgo(20) });
    expect((await getContact(ana.id))!.last_contacted_at).toBe(daysAgo(10));

    await updateInteraction(latest.id, { happened_at: daysAgo(1) });
    await deleteInteraction(latest.id);
    expect((await getContact(ana.id))!.last_contacted_at).toBe(daysAgo(10));
  });

  it("leaves a date typed in by hand alone when an older interaction is removed", async () => {
    const ana = await createContact({ name: "Ana" });
    const old = await addInteraction({ contact_id: ana.id, type: "call", happened_at: daysAgo(10) });
    await updateContact(ana.id, { last_contacted_at: daysAgo(1) });
    await deleteInteraction(old.id);
    expect((await getContact(ana.id))!.last_contacted_at).toBe(daysAgo(1));
  });

  it("returns the timeline newest first", async () => {
    const ana = await createContact({ name: "Ana" });
    await addInteraction({ contact_id: ana.id, type: "call", happened_at: daysAgo(5), summary: "first" });
    await addInteraction({ contact_id: ana.id, type: "note", happened_at: daysAgo(1), summary: "second" });
    expect((await listInteractions(ana.id)).map((i) => i.summary)).toEqual(["second", "first"]);
    expect(await listInteractions(ana.id, 1)).toHaveLength(1);
  });

  it("refuses an interaction for someone who does not exist", async () => {
    await expect(addInteraction({ contact_id: "nobody", type: "call" })).rejects.toThrow();
  });
});

describe("overdue for contact", () => {
  it("lists people past their keep-in-touch interval, most overdue first", async () => {
    const weekly = await createContact({ name: "Weekly", keep_in_touch_days: 7 });
    const monthly = await createContact({ name: "Monthly", keep_in_touch_days: 30 });
    const fine = await createContact({ name: "Fine", keep_in_touch_days: 30 });
    await createContact({ name: "No interval" });
    await addInteraction({ contact_id: weekly.id, type: "call", happened_at: daysAgo(10) });
    await addInteraction({ contact_id: monthly.id, type: "call", happened_at: daysAgo(90) });
    await addInteraction({ contact_id: fine.id, type: "call", happened_at: daysAgo(5) });

    const overdue = await listOverdueContacts(NOW);
    expect(overdue.map((c) => [c.name, c.days_overdue])).toEqual([
      ["Monthly", 60],
      ["Weekly", 3],
    ]);
    expect((await listContacts({ overdueOnly: true }, NOW)).map((c) => c.name)).toEqual(["Monthly", "Weekly"]);
  });

  it("is not overdue on the last day of the interval, and is the day after", async () => {
    const ana = await createContact({ name: "Ana", keep_in_touch_days: 7 });
    await addInteraction({ contact_id: ana.id, type: "call", happened_at: daysAgo(7) });
    expect(await listOverdueContacts(NOW)).toEqual([]);
    await updateInteraction((await listInteractions(ana.id))[0]!.id, { happened_at: daysAgo(8) });
    expect((await listOverdueContacts(NOW)).map((c) => c.days_overdue)).toEqual([1]);
  });

  it("counts from when the person was added if there has been no contact yet", async () => {
    const ana = await createContact({ name: "Ana", keep_in_touch_days: 14 });
    const later = new Date(new Date(ana.created_at).getTime() + 20 * 86_400_000).toISOString();
    expect((await listOverdueContacts(later)).map((c) => c.days_overdue)).toEqual([6]);
  });

  it("leaves archived people out", async () => {
    const ana = await createContact({ name: "Ana", keep_in_touch_days: 7 });
    await addInteraction({ contact_id: ana.id, type: "call", happened_at: daysAgo(30) });
    await archiveContact(ana.id);
    expect(await listOverdueContacts(NOW)).toEqual([]);
  });
});

describe("search", () => {
  it("finds people by name, company, notes and interaction summaries", async () => {
    const zoe = await createContact({ name: "Zoë Nakamura", company: "Fernhill Studio", notes: "Collects vinyl" });
    await createContact({ name: "Marcus Bell", how_we_met: "Climbing gym" });
    await addInteraction({ contact_id: zoe.id, type: "meeting", summary: "Planned the greenhouse project" });

    const names = async (q: string) => (await searchContacts(q)).map((h) => h.contact.name);
    expect(await names("zoe")).toEqual(["Zoë Nakamura"]); // accents ignored
    expect(await names("fern")).toEqual(["Zoë Nakamura"]); // prefix
    expect(await names("vinyl")).toEqual(["Zoë Nakamura"]);
    expect(await names("greenhouse")).toEqual(["Zoë Nakamura"]);
    expect(await names("climbing")).toEqual(["Marcus Bell"]);
    expect(await names("nakamura fernhill")).toEqual(["Zoë Nakamura"]); // all words must match
    expect(await names("nakamura climbing")).toEqual([]);
  });

  it("follows edits and deletions", async () => {
    const ana = await createContact({ name: "Ana", company: "Northwind" });
    const call = await addInteraction({ contact_id: ana.id, type: "call", summary: "Discussed sailing" });

    await updateContact(ana.id, { company: "Southwind" });
    expect(await searchContacts("northwind")).toEqual([]);
    expect(await searchContacts("southwind")).toHaveLength(1);

    await updateInteraction(call.id, { summary: "Discussed cycling" });
    expect(await searchContacts("sailing")).toEqual([]);
    expect(await searchContacts("cycling")).toHaveLength(1);

    await deleteInteraction(call.id);
    expect(await searchContacts("cycling")).toEqual([]);
  });

  it("ranks a name match above a mention in notes, and leaves archived people out", async () => {
    await createContact({ name: "Someone Else", notes: "Introduced me to Jordan" });
    await createContact({ name: "Jordan Lee" });
    const gone = await createContact({ name: "Jordan Archived" });
    await archiveContact(gone.id);

    const hits = await searchContacts("jordan");
    expect(hits.map((h) => h.contact.name)).toEqual(["Jordan Lee", "Someone Else"]);
    expect(hits[1]!.excerpt).toContain("[Jordan]");
  });

  it("copes with punctuation and empty input", async () => {
    await createContact({ name: "O'Brien & Sons" });
    expect(await searchContacts("")).toEqual([]);
    expect(await searchContacts('  "*) OR (  ')).toEqual([]);
    expect(await searchContacts("o'brien")).toHaveLength(1);
    expect(await listContacts({ search: "brien" })).toHaveLength(1);
    expect(await listContacts({ search: "!!!" })).toEqual([]);
  });
});

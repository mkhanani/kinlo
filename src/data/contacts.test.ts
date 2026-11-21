import { describe, expect, it } from "vitest";
import {
  addInteraction,
  archiveContact,
  countContacts,
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
  loadAvatars,
  overdueDays,
  removeAvatar,
  renameTag,
  deleteTag,
  setAvatar,
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
      personal: true,
      business: null,
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
      business: "client",
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
    const updated = await updateContact(c.id, { company: null, business: "lead" });
    expect(updated.company).toBeNull();
    expect(updated.business).toBe("lead");
    expect(updated.personal).toBe(true);
    expect(updated.notes).toBe("Likes tea");
    expect(updated.name).toBe("Ana");
  });

  it("rejects values the schema does not allow", async () => {
    const c = await createContact({ name: "Ana" });
    await expect(updateContact(c.id, { business: "enemy" as never })).rejects.toThrow();
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
    const ana = await createContact({ name: "Ana", business: "client" });
    const bea = await createContact({ name: "Bea" });
    const [family] = await setContactTags(bea.id, ["Family"]);
    await setContactTags(ana.id, ["Design"]);

    expect((await listContacts({ business: "client" })).map((c) => c.name)).toEqual(["Ana"]);
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

describe("sides", () => {
  it("a person can be personal, business, or both, and each side lists its own", async () => {
    await createContact({ name: "Friend" });
    await createContact({ name: "Client", business: "client" });
    await createContact({ name: "Both", personal: true, business: "lead" });

    expect((await listContacts({ side: "personal" })).map((c) => c.name)).toEqual(["Both", "Friend"]);
    expect((await listContacts({ side: "business" })).map((c) => c.name)).toEqual(["Both", "Client"]);
    expect((await listContacts({ side: "business", business: "lead" })).map((c) => c.name)).toEqual(["Both"]);
    expect(await countContacts("personal")).toBe(2);
    expect(await countContacts("business")).toBe(2);
    expect(await countContacts()).toBe(3);
  });

  it("someone added without a side goes on the personal one, and a business contact does not", async () => {
    expect(await createContact({ name: "Ana" })).toMatchObject({ personal: true, business: null });
    expect(await createContact({ name: "Bo", business: "other" })).toMatchObject({ personal: false, business: "other" });
  });

  it("nobody can be left on no side at all", async () => {
    await expect(createContact({ name: "Ana", personal: false })).rejects.toThrow("Choose Personal, Business, or both.");
    const ana = await createContact({ name: "Ana" });
    await expect(updateContact(ana.id, { personal: false })).rejects.toThrow("Choose Personal, Business, or both.");
    // Moving across in one step is fine.
    expect(await updateContact(ana.id, { personal: false, business: "client" })).toMatchObject({
      personal: false,
      business: "client",
    });
  });

  it("search and overdue can be limited to a side", async () => {
    const friend = await createContact({ name: "Jordan Friend", keep_in_touch_days: 7 });
    const client = await createContact({ name: "Jordan Client", business: "client", keep_in_touch_days: 7 });
    await addInteraction({ contact_id: friend.id, type: "call", happened_at: daysAgo(20) });
    await addInteraction({ contact_id: client.id, type: "call", happened_at: daysAgo(20) });

    expect((await searchContacts("jordan", 20, "business")).map((h) => h.contact.name)).toEqual(["Jordan Client"]);
    expect((await searchContacts("jordan", 20, "personal")).map((h) => h.contact.name)).toEqual(["Jordan Friend"]);
    expect((await listOverdueContacts(NOW, "personal")).map((c) => c.name)).toEqual(["Jordan Friend"]);
    expect(await listOverdueContacts(NOW)).toHaveLength(2);
  });
});

describe("photos", () => {
  const PIXEL = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

  it("are saved, replaced and removed per person", async () => {
    const ana = await createContact({ name: "Ana" });
    expect(await loadAvatars()).toEqual({});
    await setAvatar(ana.id, PIXEL);
    await setAvatar(ana.id, PIXEL + "AA");
    expect(await loadAvatars()).toEqual({ [ana.id]: PIXEL + "AA" });
    await removeAvatar(ana.id);
    expect(await loadAvatars()).toEqual({});
  });

  it("go when the person is deleted, and only images are accepted", async () => {
    const ana = await createContact({ name: "Ana" });
    await setAvatar(ana.id, PIXEL);
    await deleteContact(ana.id);
    expect(await loadAvatars()).toEqual({});
    const bo = await createContact({ name: "Bo" });
    await expect(setAvatar(bo.id, "javascript:alert(1)")).rejects.toThrow("not an image");
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

  it("can be renamed and deleted without touching the people", async () => {
    const ana = await createContact({ name: "Ana" });
    const [friends, work] = await setContactTags(ana.id, ["Friends", "Work"]);

    await renameTag(friends!.id, "Close friends");
    expect((await getContact(ana.id))!.tags.map((t) => t.name)).toEqual(["Close friends", "Work"]);

    await expect(renameTag(friends!.id, "work")).rejects.toThrow("already a tag with that name");
    await expect(renameTag(friends!.id, "  ")).rejects.toThrow("needs a name");

    await deleteTag(work!.id);
    expect((await getContact(ana.id))!.tags.map((t) => t.name)).toEqual(["Close friends"]);
    expect(await getContact(ana.id)).not.toBeNull();
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
  it("a note is not contact: it never moves last_contacted_at", async () => {
    const ana = await createContact({ name: "Ana" });
    await addInteraction({ contact_id: ana.id, type: "call", happened_at: daysAgo(30) });
    const note = await addInteraction({ contact_id: ana.id, type: "note", happened_at: daysAgo(1), summary: "Ask about the job" });
    expect((await getContact(ana.id))!.last_contacted_at).toBe(daysAgo(30));

    // Turning the note into a call counts from then on, and back again undoes it.
    await updateInteraction(note.id, { type: "call" });
    expect((await getContact(ana.id))!.last_contacted_at).toBe(daysAgo(1));
    await updateInteraction(note.id, { type: "note" });
    expect((await getContact(ana.id))!.last_contacted_at).toBe(daysAgo(30));

    await deleteInteraction(note.id);
    expect((await getContact(ana.id))!.last_contacted_at).toBe(daysAgo(30));
    // The note is still searchable while it exists.
    await addInteraction({ contact_id: ana.id, type: "note", summary: "Loves sailing" });
    expect(await searchContacts("sailing")).toHaveLength(1);
  });

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
    // The in-memory calculation agrees with the SQL one for everybody.
    for (const c of await listContacts({}, NOW)) {
      expect(overdueDays(c, NOW)).toBe(overdue.find((o) => o.id === c.id)?.days_overdue ?? 0);
    }
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

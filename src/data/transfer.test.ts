import { describe, expect, it } from "vitest";
import { addInteraction } from "./interactions";
import { createContact, listContacts } from "./contacts";
import { setContactTags } from "./tags";
import { saveSetting } from "./settings";
import { useTestDatabase } from "./testing";
import {
  contactsToCsv,
  countDuplicates,
  exportAll,
  exportContactsCsv,
  importContacts,
  parseCsv,
  readBirthday,
  readContactsCsv,
} from "./transfer";

useTestDatabase();

describe("reading CSV", () => {
  it("handles quotes, commas and line breaks inside a cell", () => {
    expect(parseCsv('Name,Notes\r\n"Lima, Ana","Said ""hello""\nand left"\r\nBo,\r\n')).toEqual([
      ["Name", "Notes"],
      ["Lima, Ana", 'Said "hello"\nand left'],
      ["Bo", ""],
    ]);
  });

  it("works out semicolons and tabs by itself, and drops the marker Excel adds", () => {
    expect(parseCsv("﻿Name;Email\nAna;ana@example.com")).toEqual([
      ["Name", "Email"],
      ["Ana", "ana@example.com"],
    ]);
    expect(parseCsv("Name\tEmail\nAna\tana@example.com")[1]).toEqual(["Ana", "ana@example.com"]);
  });

  it("skips blank lines", () => {
    expect(parseCsv("Name\n\nAna\n\n")).toEqual([["Name"], ["Ana"]]);
  });
});

describe("reading birthdays", () => {
  it("accepts dates that can only mean one thing", () => {
    expect(readBirthday("1990-05-17")).toBe("1990-05-17");
    expect(readBirthday("--05-17")).toBe("--05-17");
    expect(readBirthday("1990/5/7")).toBe("1990-05-07");
    expect(readBirthday("17/05/1990")).toBe("1990-05-17");
    expect(readBirthday("05/17/1990")).toBe("1990-05-17");
    expect(readBirthday("04/04/1990")).toBe("1990-04-04");
  });

  it("leaves out a date that could be read two ways, rather than guess", () => {
    expect(readBirthday("03/04/1990")).toBeUndefined();
    expect(readBirthday("0/0/00")).toBeUndefined();
    expect(readBirthday("1990-02-31")).toBeUndefined();
    expect(readBirthday("soon")).toBeUndefined();
  });
});

describe("reading a contacts file", () => {
  it("reads a Google Contacts export", () => {
    const csv = [
      "First Name,Middle Name,Last Name,Nickname,Organization Name,Organization Title,Birthday,Notes,Labels,E-mail 1 - Label,E-mail 1 - Value,E-mail 2 - Value,Phone 1 - Label,Phone 1 - Value",
      'Zoë,,Nakamura,Zo,Fernhill Studio,Designer,1990-05-17,"Met at a conference, 2019",* myContacts ::: Friends,Work,zoe@fernhill.example,zoe@home.example,Mobile,+44 20 7946 0000',
    ].join("\n");
    const { rows, unnamed, recognized } = readContactsCsv(csv);
    expect(recognized).toBe(true);
    expect(unnamed).toBe(0);
    expect(rows).toEqual([
      {
        name: "Zoë Nakamura",
        nickname: "Zo",
        company: "Fernhill Studio",
        role: "Designer",
        birthday: "1990-05-17",
        notes: "Met at a conference, 2019",
        tags: ["Friends"],
        emails: ["zoe@fernhill.example", "zoe@home.example"],
        phones: ["+44 20 7946 0000"],
        socials: [],
        location: undefined,
      },
    ]);
  });

  it("reads an Outlook export", () => {
    const csv = [
      "First Name,Last Name,Company,Job Title,E-mail Address,E-mail 2 Address,Mobile Phone,Business Phone,Business Fax,Home City,Home Country/Region,Categories",
      "Tomás,Okafor,Larkspur Co,Founder,tomas@larkspur.example,,555 0101,555 0102,555 0199,Lagos,Nigeria,Clients;VIP",
    ].join("\n");
    const [row] = readContactsCsv(csv).rows;
    expect(row).toMatchObject({
      name: "Tomás Okafor",
      company: "Larkspur Co",
      role: "Founder",
      emails: ["tomas@larkspur.example"],
      // The fax number is not a way to reach a person.
      phones: ["555 0101", "555 0102"],
      location: "Lagos, Nigeria",
      tags: ["Clients", "VIP"],
    });
  });

  it("leaves out rows with no name, and says how many", () => {
    const { rows, unnamed } = readContactsCsv("Name,Email\nAna,ana@example.com\n,orphan@example.com\n  ,\n");
    expect(rows.map((r) => r.name)).toEqual(["Ana"]);
    expect(unnamed).toBe(1);
  });

  it("says when a file is not a list of contacts", () => {
    expect(readContactsCsv("Date,Amount\n2026-01-01,12.50").recognized).toBe(false);
    expect(readContactsCsv("").recognized).toBe(false);
  });
});

describe("importing people", () => {
  it("adds them to the chosen side", async () => {
    const { rows } = readContactsCsv("Name,Email,Tags\nAna Lima,ana@example.com,Friends\nBo Chen,,");
    expect(await importContacts(rows, { side: "personal" })).toEqual({ added: 2, skipped: 0 });
    const people = await listContacts();
    expect(people.map((p) => [p.name, p.personal, p.business])).toEqual([
      ["Ana Lima", true, null],
      ["Bo Chen", true, null],
    ]);
    expect(people[0]!.emails).toEqual([{ value: "ana@example.com" }]);
    expect(people[0]!.tags.map((t) => t.name)).toEqual(["Friends"]);
  });

  it("makes business contacts leads unless told otherwise", async () => {
    const { rows } = readContactsCsv("Name\nPriya Raman\nTom Okafor");
    await importContacts(rows.slice(0, 1), { side: "business" });
    await importContacts(rows.slice(1), { side: "business", kind: "client" });
    expect((await listContacts({ side: "business" })).map((p) => [p.name, p.personal, p.business])).toEqual([
      ["Priya Raman", false, "lead"],
      ["Tom Okafor", false, "client"],
    ]);
  });

  it("leaves alone anyone already there, and a second copy in the same file", async () => {
    await createContact({ name: "Ana Lima", emails: [{ value: "ana@example.com" }], notes: "Keep me" });
    await createContact({ name: "Bo Chen" });
    const { rows } = readContactsCsv(
      [
        "Name,Email,Notes",
        "ana lima,ANA@example.com,Overwrite?", // same person, different capitals
        "Ana Lima,other@example.com,", // same name, different email: someone else
        "Bo Chen,,", // same name, and no email to tell them apart
        "Cy Diaz,cy@example.com,",
        "Cy Diaz,cy@example.com,", // twice in the file
      ].join("\n"),
    );
    expect(await countDuplicates(rows)).toBe(2);
    expect(await importContacts(rows, { side: "personal" })).toEqual({ added: 2, skipped: 3 });

    const people = await listContacts();
    expect(people.map((p) => p.name)).toEqual(["Ana Lima", "Ana Lima", "Bo Chen", "Cy Diaz"]);
    // The person who was already there was not touched.
    expect(people.find((p) => p.emails[0]?.value === "ana@example.com")?.notes).toBe("Keep me");
  });

  it("does not double someone added by hand without an email", async () => {
    await createContact({ name: "Dee Park" });
    await createContact({ name: "Eli Stone", emails: [{ value: "eli@example.com" }] });
    const { rows } = readContactsCsv("Name,Email\nDee Park,dee@example.com\nEli Stone,\n");
    expect(await importContacts(rows, { side: "personal" })).toEqual({ added: 0, skipped: 2 });
    expect((await listContacts()).map((p) => p.name)).toEqual(["Dee Park", "Eli Stone"]);
  });

  it("reports progress", async () => {
    const seen: number[] = [];
    const { rows } = readContactsCsv("Name\nA One\nB Two\nC Three");
    await importContacts(rows, { side: "personal", onProgress: (done) => seen.push(done) });
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe("exporting", () => {
  it("writes people as CSV that reads back the same", async () => {
    const zoe = await createContact({
      name: 'Zoë "Zo" Nakamura',
      company: "Fernhill, Studio",
      emails: [{ value: "zoe@fernhill.example" }, { value: "zoe@home.example" }],
      phones: [{ value: "+44 20 7946 0000" }],
      notes: "Line one\nLine two",
      birthday: "--05-17",
      keep_in_touch_days: 30,
    });
    await setContactTags(zoe.id, ["Friends", "Design"]);
    await createContact({ name: "Priya Raman", personal: false, business: "client", archived: true });

    const { csv, count } = await exportContactsCsv();
    expect(count).toBe(2);
    expect(csv.startsWith("﻿Name,Nickname,Personal,Business,")).toBe(true);

    const back = readContactsCsv(csv).rows;
    expect(back.find((r) => r.name.startsWith("Zoë"))).toMatchObject({
      name: 'Zoë "Zo" Nakamura',
      company: "Fernhill, Studio",
      emails: ["zoe@fernhill.example", "zoe@home.example"],
      phones: ["+44 20 7946 0000"],
      notes: "Line one\nLine two",
      birthday: "--05-17",
      keep_in_touch_days: 30,
      tags: ["Design", "Friends"],
    });
    // Archived people are in the file too.
    expect(back.map((r) => r.name)).toContain("Priya Raman");
  });

  it("stops a spreadsheet from running a cell as a formula", async () => {
    const [contact] = [await createContact({ name: "=HYPERLINK(\"http://x\")", notes: "+1 to this", company: "-Co" })];
    const csv = contactsToCsv([contact!]);
    expect(csv).toContain("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csv).toContain("'+1 to this");
    expect(csv).toContain("'-Co");
    // Reading it back gives the original text.
    expect(readContactsCsv(csv).rows[0]).toMatchObject({ name: '=HYPERLINK("http://x")', notes: "+1 to this", company: "-Co" });
  });

  it("writes everything as JSON, and no API key", async () => {
    const ana = await createContact({ name: "Ana Lima" });
    await addInteraction({ contact_id: ana.id, type: "call", summary: "Caught up" });
    await saveSetting("aiProvider", "anthropic");

    const file = await exportAll();
    expect(file.format).toBe("kinlo-export");
    expect(file.version).toBe(1);
    expect(Object.keys(file.tables)).toEqual([
      "contacts",
      "avatars",
      "tags",
      "contact_tags",
      "interactions",
      "reminders",
      "stages",
      "deals",
      "ai_threads",
      "ai_messages",
      "settings",
    ]);
    expect(file.tables.contacts).toHaveLength(1);
    expect(file.tables.interactions[0]).toMatchObject({ summary: "Caught up" });
    expect(file.tables.stages).toHaveLength(5);
    expect(file.tables.settings).toContainEqual({ key: "aiProvider", value: '"anthropic"' });
    // It is plain JSON all the way down.
    expect(JSON.parse(JSON.stringify(file))).toEqual(file);
  });
});

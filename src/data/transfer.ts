import { createContact, listContacts } from "./contacts";
import { db } from "./driver";
import { setContactTags } from "./tags";
import type { BusinessKind, Contact, ContactInput, Side } from "./types";
import { nowIso } from "./util";

/**
 * Getting data out of kinlo and people into it.
 *
 * Export writes everything the database holds as one JSON file, and people as a CSV
 * that any spreadsheet opens. Import reads a CSV of people, from kinlo itself or from
 * Google Contacts, Outlook and similar.
 */

/** Every table, in an order that respects what refers to what. */
const TABLES = [
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
] as const;

export interface FullExport {
  format: "kinlo-export";
  version: 1;
  exported_at: string;
  tables: Record<(typeof TABLES)[number], Record<string, unknown>[]>;
}

/** Everything in the database, row for row. API keys are not in it; they are not in the database. */
export async function exportAll(): Promise<FullExport> {
  const tables = {} as FullExport["tables"];
  for (const table of TABLES) {
    tables[table] = await db().select<Record<string, unknown>>(`SELECT * FROM ${table}`);
  }
  return { format: "kinlo-export", version: 1, exported_at: nowIso(), tables };
}

// ── CSV out ─────────────────────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  "Name",
  "Nickname",
  "Personal",
  "Business",
  "Company",
  "Role",
  "Emails",
  "Phones",
  "Socials",
  "Location",
  "Birthday",
  "How we met",
  "Notes",
  "Keep in touch days",
  "Last contacted",
  "Tags",
  "Archived",
  "Added",
] as const;

function csvCell(value: string): string {
  // A cell starting with one of these is treated as a formula by spreadsheet programs.
  // A leading apostrophe makes it plain text there, and import takes it off again.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** People as CSV, one row each. Starts with a marker so Excel reads accents correctly. */
export function contactsToCsv(contacts: Contact[]): string {
  const join = (list: { value: string }[]) => list.map((item) => item.value).join("; ");
  const rows = contacts.map((c) => [
    c.name,
    c.nickname ?? "",
    c.personal ? "yes" : "no",
    c.business ?? "",
    c.company ?? "",
    c.role ?? "",
    join(c.emails),
    join(c.phones),
    join(c.socials),
    c.location ?? "",
    c.birthday ?? "",
    c.how_we_met ?? "",
    c.notes ?? "",
    c.keep_in_touch_days?.toString() ?? "",
    c.last_contacted_at ?? "",
    c.tags.map((t) => t.name).join("; "),
    c.archived ? "yes" : "no",
    c.created_at,
  ]);
  const lines = [CSV_COLUMNS as readonly string[], ...rows].map((row) => row.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Everyone, archived people included, as CSV. */
export async function exportContactsCsv(): Promise<{ csv: string; count: number }> {
  const contacts = await listContacts({ includeArchived: true });
  return { csv: contactsToCsv(contacts), count: contacts.length };
}

// ── CSV in ──────────────────────────────────────────────────────────────────────────────

/** Works out whether the file uses commas, semicolons or tabs, from its first line. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let best = ",";
  let bestCount = 0;
  for (const candidate of [",", ";", "\t"]) {
    let count = 0;
    let quoted = false;
    for (const char of firstLine) {
      if (char === '"') quoted = !quoted;
      else if (char === candidate && !quoted) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/** Reads CSV into rows of cells. Handles quotes, doubled quotes and line breaks inside cells. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

/** One person read from a file, not yet saved. */
export interface ImportRow {
  name: string;
  nickname?: string;
  company?: string;
  role?: string;
  emails: string[];
  phones: string[];
  socials: string[];
  location?: string;
  birthday?: string;
  how_we_met?: string;
  notes?: string;
  keep_in_touch_days?: number;
  tags: string[];
}

export interface ImportPreview {
  rows: ImportRow[];
  /** Rows left out because they had no name. */
  unnamed: number;
  /** False when no column that could hold a name was found: probably not a contacts file. */
  recognized: boolean;
}

const key = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, "");

const isDetail = (k: string) => k.endsWith("type") || k.endsWith("label") || k.includes("display");
const isEmail = (k: string) => (k.startsWith("email") || k === "emails") && !isDetail(k);
const isPhone = (k: string) =>
  (k.includes("phone") || k === "mobile" || k === "tel" || k === "telephone") && !isDetail(k) && !k.includes("fax");

const SINGLE: Record<string, keyof Pick<ImportRow, "nickname" | "company" | "role" | "how_we_met" | "notes">> = {
  nickname: "nickname",
  company: "company",
  companyname: "company",
  organization: "company",
  organizationname: "company",
  organization1name: "company",
  jobtitle: "role",
  role: "role",
  title: "role",
  position: "role",
  organizationtitle: "role",
  organization1title: "role",
  howwemet: "how_we_met",
  notes: "notes",
  note: "notes",
  description: "notes",
};

/** Takes off the apostrophe that export puts before a cell a spreadsheet would run. */
const plain = (value: string) => value.trim().replace(/^'(?=[=+\-@])/, "");

const split = (value: string, pattern: RegExp) =>
  value
    .split(pattern)
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * Reads a birthday when its meaning is certain: 1990-05-17, --05-17, 1990/05/17, or a
 * slashed date where only one order is possible (17/05/1990). A date like 03/04/1990
 * could be March or April, so it is left out rather than guessed.
 */
export function readBirthday(value: string): string | undefined {
  const text = value.trim();
  const pad = (n: number) => String(n).padStart(2, "0");
  const valid = (year: number | null, month: number, day: number) =>
    month >= 1 && month <= 12 && day >= 1 && day <= new Date(year ?? 2000, month, 0).getDate();
  const build = (year: number | null, month: number, day: number) =>
    valid(year, month, day) && (year === null || (year >= 1900 && year <= new Date().getFullYear()))
      ? `${year === null ? "-" : String(year)}-${pad(month)}-${pad(day)}`
      : undefined;

  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (match) return build(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^--(\d{2})-?(\d{2})$/.exec(text);
  if (match) return build(null, Number(match[1]), Number(match[2]));
  match = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(text);
  if (match) {
    const [a, b, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (a > 12 && b <= 12) return build(year, b, a);
    if (b > 12 && a <= 12) return build(year, a, b);
    if (a === b) return build(year, a, b);
  }
  return undefined;
}

/** Turns the text of a contacts CSV into people, matching the column names it finds. */
export function readContactsCsv(text: string): ImportPreview {
  const [header, ...lines] = parseCsv(text);
  if (!header) return { rows: [], unnamed: 0, recognized: false };
  const columns = header.map(key);
  const recognized = columns.some((k) =>
    ["name", "fullname", "displayname", "firstname", "givenname", "first", "lastname", "familyname", "surname", "last"].includes(k),
  );
  if (!recognized) return { rows: [], unnamed: 0, recognized: false };

  const rows: ImportRow[] = [];
  let unnamed = 0;
  for (const line of lines) {
    const row: ImportRow = { name: "", emails: [], phones: [], socials: [], tags: [] };
    const parts: { first?: string; middle?: string; last?: string; city?: string; country?: string } = {};

    columns.forEach((k, index) => {
      const value = plain(line[index] ?? "");
      if (!value) return;
      if (k === "name" || k === "fullname" || k === "displayname") row.name ||= value;
      else if (k === "firstname" || k === "givenname" || k === "first") parts.first = value;
      else if (k === "middlename" || k === "additionalname") parts.middle = value;
      else if (k === "lastname" || k === "familyname" || k === "surname" || k === "last") parts.last = value;
      else if (isEmail(k)) row.emails.push(...split(value, /[;,\s]+|:::/));
      else if (isPhone(k)) row.phones.push(...split(value, /;|:::/));
      else if (k === "socials") row.socials.push(...split(value, /;/));
      else if (k === "location") row.location ||= value;
      else if (k === "city" || k === "homecity" || k === "businesscity") parts.city ||= value;
      else if (k === "country" || k === "homecountry" || k === "homecountryregion") parts.country ||= value;
      else if (k === "birthday" || k === "birthdate" || k === "dateofbirth") row.birthday = readBirthday(value);
      else if (k === "keepintouchdays") {
        const days = Number.parseInt(value, 10);
        if (Number.isInteger(days) && days >= 1 && days <= 3650) row.keep_in_touch_days = days;
      } else if (k === "tags" || k === "labels" || k === "categories" || k === "groupmembership") {
        row.tags.push(
          ...split(value, /;|:::|,/)
            .map((tag) => tag.replace(/^\*\s*/, ""))
            .filter((tag) => !/^(mycontacts|starred)$/i.test(tag)),
        );
      } else if (SINGLE[k]) row[SINGLE[k]] ||= value;
    });

    row.name ||= [parts.first, parts.middle, parts.last].filter(Boolean).join(" ");
    row.location ||= [parts.city, parts.country].filter(Boolean).join(", ") || undefined;
    row.emails = [...new Set(row.emails.filter((email) => email.includes("@")))];
    row.phones = [...new Set(row.phones)];
    row.tags = [...new Set(row.tags)];
    if (row.name.trim()) rows.push(row);
    else unnamed += 1;
  }
  return { rows, unnamed, recognized: true };
}

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Whether someone is already in kinlo: the same name, unless both have email addresses
 * and none of them match, which means two people who share a name.
 *
 * So a person added by hand without an email is not doubled by importing an address
 * book that has one for them.
 */
function alreadyThere(row: ImportRow, known: Map<string, Set<string>[]>): boolean {
  const matches = known.get(norm(row.name));
  if (!matches) return false;
  const emails = row.emails.map(norm);
  return matches.some((theirs) => emails.length === 0 || theirs.size === 0 || emails.some((e) => theirs.has(e)));
}

/** How many of these people are already in kinlo, without changing anything. */
export async function countDuplicates(rows: ImportRow[]): Promise<number> {
  const known = await knownPeople();
  return rows.filter((row) => alreadyThere(row, known)).length;
}

async function knownPeople(): Promise<Map<string, Set<string>[]>> {
  const known = new Map<string, Set<string>[]>();
  for (const contact of await listContacts({ includeArchived: true })) remember(known, contact.name, contact.emails.map((e) => e.value));
  return known;
}

function remember(known: Map<string, Set<string>[]>, name: string, emails: string[]) {
  const list = known.get(norm(name)) ?? [];
  list.push(new Set(emails.map(norm)));
  known.set(norm(name), list);
}

export interface ImportOptions {
  side: Side;
  /** What imported people are on the business side. */
  kind?: BusinessKind;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Adds people from a file. Anyone already in kinlo is left alone, and so is a second
 * copy of the same person in the file. Nothing existing is changed or removed.
 */
export async function importContacts(rows: ImportRow[], options: ImportOptions): Promise<{ added: number; skipped: number }> {
  const known = await knownPeople();
  let added = 0;
  let skipped = 0;
  for (const [index, row] of rows.entries()) {
    if (alreadyThere(row, known)) {
      skipped += 1;
    } else {
      const input: ContactInput = {
        name: row.name,
        nickname: row.nickname,
        company: row.company,
        role: row.role,
        emails: row.emails.map((value) => ({ value })),
        phones: row.phones.map((value) => ({ value })),
        socials: row.socials.map((value) => ({ value })),
        location: row.location,
        birthday: row.birthday,
        how_we_met: row.how_we_met,
        notes: row.notes,
        keep_in_touch_days: row.keep_in_touch_days,
        personal: options.side === "personal",
        business: options.side === "business" ? (options.kind ?? "lead") : null,
      };
      const contact = await createContact(input);
      if (row.tags.length) await setContactTags(contact.id, row.tags);
      remember(known, row.name, row.emails);
      added += 1;
    }
    options.onProgress?.(index + 1, rows.length);
  }
  return { added, skipped };
}

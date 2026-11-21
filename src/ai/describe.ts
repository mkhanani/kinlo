import * as data from "@/data";
import type { Side } from "@/data";
import { formatBirthday } from "@/lib/dates";
import { parseLocal } from "./tools";

/** A change the assistant wants to make, put in words the user can check at a glance. */
export interface ActionCard {
  title: string;
  rows: { label: string; value: string }[];
  /** Set when the change cannot be made as asked. The card then cannot be confirmed. */
  problem: string | null;
}

type Input = Record<string, unknown>;

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

const KIND_LABEL: Record<string, string> = { lead: "Lead", client: "Client", other: "Other" };
const TYPE_TITLE: Record<string, string> = {
  call: "Log a call with",
  message: "Log a message with",
  meeting: "Log a meeting with",
  email: "Log an email with",
  note: "Add a note about",
};
const REPEAT_LABEL: Record<string, string> = {
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};

function when(value: unknown): string | null {
  const text = str(value);
  if (!text) return null;
  try {
    return new Date(parseLocal(text)).toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return text;
  }
}

function day(value: unknown): string | null {
  const text = str(value);
  if (!text) return null;
  const date = new Date(`${text}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? text
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function money(value: unknown, currency: string): string | null {
  if (typeof value !== "number") return null;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

const every = (value: unknown) =>
  typeof value === "number" ? (value === 1 ? "Every day" : `Every ${value} days`) : null;

const list = (value: unknown) =>
  Array.isArray(value) && value.length ? value.filter((v) => typeof v === "string").join(", ") : null;

function personRows(input: Input): [string, string | null][] {
  return [
    ["Nickname", str(input.nickname)],
    ["Company", str(input.company)],
    ["Role", str(input.role)],
    ["Email", str(input.email) ?? str(input.add_email)],
    ["Phone", str(input.phone) ?? str(input.add_phone)],
    ["Location", str(input.location)],
    ["Birthday", formatBirthday(str(input.birthday))],
    ["How you met", str(input.how_we_met)],
    ["Keep in touch", every(input.keep_in_touch_days)],
    ["Tags", list(input.tags) ?? list(input.add_tags)],
    ["Notes", str(input.notes)],
  ];
}

const card = (title: string, rows: [string, string | null][], problem: string | null = null): ActionCard => ({
  title,
  rows: rows.filter((row): row is [string, string] => row[1] !== null).map(([label, value]) => ({ label, value })),
  problem,
});

const MISSING_PERSON = "kinlo could not find this person, so there is nothing to change.";

async function nameOf(id: unknown, side: Side): Promise<string | null> {
  const contact = typeof id === "string" ? await data.getContact(id) : null;
  if (!contact) return null;
  const here = side === "personal" ? contact.personal : contact.business !== null;
  return here ? contact.name : null;
}

/** Describes a change before it is made. Reads names from the database; writes nothing. */
export async function describeAction(
  toolName: string,
  rawInput: unknown,
  context: { side: Side; currency: string },
): Promise<ActionCard> {
  const input: Input = rawInput && typeof rawInput === "object" ? (rawInput as Input) : {};
  const { side } = context;

  switch (toolName) {
    case "create_contact": {
      const name = str(input.name) ?? "someone";
      const as = side === "business" ? (KIND_LABEL[str(input.kind) ?? "lead"] ?? "Lead") : null;
      return card(`Add ${name}`, [["As", as], ...personRows(input)]);
    }
    case "update_contact": {
      const person = await nameOf(input.contact_id, side);
      const renamed = str(input.name);
      return card(
        `Update ${person ?? "a person"}`,
        [["Name", renamed && renamed !== person ? renamed : null], ["As", KIND_LABEL[str(input.kind) ?? ""] ?? null], ...personRows(input)],
        person ? null : MISSING_PERSON,
      );
    }
    case "log_interaction": {
      const person = await nameOf(input.contact_id, side);
      const title = TYPE_TITLE[str(input.type) ?? ""] ?? "Log a conversation with";
      return card(
        `${title} ${person ?? "a person"}`,
        [["When", when(input.happened_at) ?? "Now"], ["Summary", str(input.summary)]],
        person ? null : MISSING_PERSON,
      );
    }
    case "create_reminder": {
      const hasPerson = input.contact_id !== undefined && input.contact_id !== null;
      const person = hasPerson ? await nameOf(input.contact_id, side) : null;
      return card(
        `Remind you: ${str(input.title) ?? "something"}`,
        [["When", when(input.due_at)], ["About", person], ["Repeats", REPEAT_LABEL[str(input.repeat) ?? ""] ?? null]],
        hasPerson && !person ? MISSING_PERSON : null,
      );
    }
    case "create_deal": {
      const person = await nameOf(input.contact_id, side);
      const currency = (str(input.currency) ?? context.currency).toUpperCase();
      const stages = await data.listStages();
      const wanted = str(input.stage)?.toLowerCase();
      const stage = wanted ? stages.find((s) => s.id === wanted || s.name.toLowerCase() === wanted) : stages[0];
      return card(
        `Add a deal: ${str(input.title) ?? "untitled"}`,
        [
          ["With", person],
          ["Value", money(input.value, currency)],
          ["Stage", stage?.name ?? null],
          ["Expected close", day(input.expected_close)],
          ["Notes", str(input.notes)],
        ],
        !person ? MISSING_PERSON : !stage ? `There is no stage called "${str(input.stage)}".` : null,
      );
    }
    case "move_deal": {
      const deal = typeof input.deal_id === "string" ? await data.getDeal(input.deal_id) : null;
      const stages = await data.listStages();
      const wanted = str(input.stage)?.toLowerCase();
      const stage = stages.find((s) => s.id === wanted || s.name.toLowerCase() === wanted);
      const person = deal ? await nameOf(deal.contact_id, side) : null;
      return card(
        `Move ${deal?.title ?? "a deal"} to ${stage?.name ?? str(input.stage) ?? "another stage"}`,
        [
          ["With", person],
          ["From", deal ? (stages.find((s) => s.id === deal.stage_id)?.name ?? null) : null],
          ["Note", stage?.outcome ? "This closes the deal." : null],
        ],
        !deal
          ? "kinlo could not find this deal, so there is nothing to move."
          : !stage
            ? `There is no stage called "${str(input.stage)}".`
            : null,
      );
    }
    default:
      return card("Make a change", [], "kinlo does not know how to do this.");
  }
}

/** A few words for a lookup the assistant made, shown as a quiet line in the chat. */
export function describeLookup(toolName: string, rawInput: unknown): string {
  const input: Input = rawInput && typeof rawInput === "object" ? (rawInput as Input) : {};
  switch (toolName) {
    case "search_contacts":
      return str(input.query) ? `Searched your people for "${str(input.query)}"` : "Searched your people";
    case "get_contact":
      return "Read a person's details";
    case "list_overdue_contacts":
      return "Checked who is due for a catch-up";
    case "list_reminders":
      return "Looked at your reminders";
    case "list_deals":
      return "Looked at your deals";
    default:
      return "Looked something up";
  }
}

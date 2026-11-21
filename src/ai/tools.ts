import { tool, type ToolSet } from "ai";
import { z } from "zod";
import * as data from "@/data";
import type { BusinessKind, Contact, ContactPatch, Side, Stage } from "@/data";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/dates";

/**
 * What the assistant can do. Reading tools run straight away. Writing tools never run
 * on the model's say-so: each one is first shown to the user as a card, and only runs
 * once they confirm it (see WRITE_TOOLS and the engine).
 *
 * Everything is limited to the side of kinlo on screen, the same as the rest of the app.
 */
export interface ToolContext {
  side: Side;
  /** Currency for new deals when the model does not name one. */
  currency: string;
}

export const WRITE_TOOLS = [
  "create_contact",
  "update_contact",
  "log_interaction",
  "create_reminder",
  "create_deal",
  "move_deal",
] as const;
export type WriteTool = (typeof WRITE_TOOLS)[number];

export const isWriteTool = (name: string): name is WriteTool => (WRITE_TOOLS as readonly string[]).includes(name);

const DAY = 86_400_000;

/** Local date and time, the way the model is asked to write them: 2026-11-24 09:30. */
export const localStamp = (iso: string | null) => (iso ? toDateTimeLocal(iso).replace("T", " ") : null);

const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/, "Use YYYY-MM-DDTHH:mm in the user's local time.");
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const birthday = z.string().regex(/^(\d{4}|-)-\d{2}-\d{2}$/, "Use YYYY-MM-DD, or --MM-DD when the year is not known.");

/** Turns the model's local time into the UTC timestamp the database stores. */
export function parseLocal(value: string): string {
  const iso = fromDateTimeLocal(value.replace(" ", "T").slice(0, 16));
  if (!iso) throw new Error("That date could not be read.");
  return iso;
}

const onSide = (contact: Contact, side: Side) => (side === "personal" ? contact.personal : contact.business !== null);

/** The person with this id, as long as they are on the side on screen. */
export async function requireContact(id: string, side: Side): Promise<Contact> {
  const contact = await data.getContact(id);
  if (!contact || !onSide(contact, side)) {
    throw new Error("There is no person with that id here. Search for them first to get the right id.");
  }
  return contact;
}

/** Finds a stage by its name or id, ignoring case. */
export async function resolveStage(nameOrId: string): Promise<Stage> {
  const stages = await data.listStages();
  const wanted = nameOrId.trim().toLowerCase();
  const stage = stages.find((s) => s.id === nameOrId || s.name.toLowerCase() === wanted);
  if (!stage) throw new Error(`There is no stage called "${nameOrId}". The stages are: ${stages.map((s) => s.name).join(", ")}.`);
  return stage;
}

function relationship(contact: Contact, side: Side): string {
  return side === "business" ? (contact.business ?? "other") : "personal";
}

function brief(contact: Contact, side: Side) {
  return {
    id: contact.id,
    name: contact.name,
    company: contact.company,
    role: contact.role,
    relationship: relationship(contact, side),
    location: contact.location,
    tags: contact.tags.map((t) => t.name),
    last_contacted: localStamp(contact.last_contacted_at),
    keep_in_touch_days: contact.keep_in_touch_days,
  };
}

const contactFields = {
  nickname: z.string().optional(),
  company: z.string().optional(),
  role: z.string().optional().describe("Their job title."),
  location: z.string().optional(),
  birthday: birthday.optional(),
  how_we_met: z.string().optional(),
  notes: z.string().optional().describe("Lasting notes about the person. Not for logging a conversation."),
  keep_in_touch_days: z.number().int().min(1).max(3650).optional().describe("How often to be in touch, in days."),
};

export function buildTools(context: ToolContext): ToolSet {
  const { side } = context;
  const business = side === "business";
  const kind = z.enum(data.BUSINESS_KINDS);

  const tools: ToolSet = {
    search_contacts: tool({
      description:
        "Search the user's people by name, company, notes or anything said in past conversations. Returns the best matches with their ids.",
      inputSchema: z.object({
        query: z.string().describe("Words to look for, such as a name or a topic."),
        limit: z.number().int().min(1).max(25).optional(),
      }),
      execute: async ({ query, limit }) => {
        const hits = await data.searchContacts(query, limit ?? 8, side);
        return hits.map((hit) => ({ ...brief(hit.contact, side), matched: hit.excerpt }));
      },
    }),

    get_contact: tool({
      description:
        "Everything kinlo knows about one person: details, notes, recent conversations, open reminders" +
        (business ? " and deals." : "."),
      inputSchema: z.object({ contact_id: z.string() }),
      execute: async ({ contact_id }) => {
        const contact = await requireContact(contact_id, side);
        const [interactions, reminders, deals, stages] = await Promise.all([
          data.listInteractions(contact.id, 15),
          data.listReminders({ contactId: contact.id, side }),
          business ? data.listDeals({ contactId: contact.id }) : Promise.resolve([]),
          business ? data.listStages() : Promise.resolve([]),
        ]);
        const stageName = (id: string) => stages.find((s) => s.id === id)?.name ?? id;
        return {
          ...brief(contact, side),
          nickname: contact.nickname,
          emails: contact.emails.map((e) => e.value),
          phones: contact.phones.map((p) => p.value),
          socials: contact.socials.map((s) => s.value),
          birthday: contact.birthday,
          how_we_met: contact.how_we_met,
          notes: contact.notes,
          recent_interactions: interactions.map((i) => ({
            type: i.type,
            when: localStamp(i.happened_at),
            summary: i.summary,
          })),
          open_reminders: reminders.map((r) => ({ id: r.id, title: r.title, due: localStamp(r.due_at) })),
          ...(business
            ? {
                deals: deals.map((d) => ({
                  id: d.id,
                  title: d.title,
                  stage: stageName(d.stage_id),
                  value: d.value,
                  currency: d.currency,
                  closed: d.closed_at !== null,
                })),
              }
            : {}),
        };
      },
    }),

    list_overdue_contacts: tool({
      description: "People the user is overdue to catch up with, most overdue first.",
      inputSchema: z.object({}),
      execute: async () => {
        const overdue = await data.listOverdueContacts(undefined, side);
        return overdue.slice(0, 40).map((c) => ({ ...brief(c, side), days_overdue: c.days_overdue }));
      },
    }),

    list_reminders: tool({
      description: "The user's reminders. Open ones by default, soonest first.",
      inputSchema: z.object({
        status: z.enum(["open", "done"]).optional(),
        due: z.enum(["overdue", "today", "next_7_days", "any"]).optional().describe("Only for open reminders."),
        contact_id: z.string().optional(),
      }),
      execute: async ({ status, due, contact_id }) => {
        const now = new Date();
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
        const limits: Record<string, number> = {
          overdue: now.getTime(),
          today: endOfToday,
          next_7_days: now.getTime() + 7 * DAY,
        };
        const limit = due && due !== "any" && status !== "done" ? limits[due] : undefined;
        const reminders = await data.listReminders({
          status: status ?? "open",
          side,
          contactId: contact_id,
          dueBefore: limit === undefined ? undefined : new Date(limit).toISOString(),
        });
        return reminders.slice(0, 60).map((r) => ({
          id: r.id,
          title: r.title,
          due: localStamp(r.due_at),
          repeats: r.repeat_rule,
          contact_id: r.contact_id,
          contact_name: r.contact_name,
          done: r.done_at !== null,
        }));
      },
    }),

    create_contact: tool({
      description:
        "Add a new person. Search first to make sure they are not already there. The user is asked to confirm before anything is saved.",
      inputSchema: z.object({
        name: z.string().min(1),
        ...contactFields,
        email: z.string().optional(),
        phone: z.string().optional(),
        tags: z.array(z.string()).optional(),
        ...(business ? { kind: kind.optional().describe("What they are to the user's work. Defaults to lead.") } : {}),
      }),
      execute: async (input) => {
        const { name, email, phone, tags, kind: chosen, ...rest } = input as typeof input & { kind?: BusinessKind };
        const contact = await data.createContact({
          name,
          ...rest,
          emails: email ? [{ value: email.trim() }] : [],
          phones: phone ? [{ value: phone.trim() }] : [],
          personal: !business,
          business: business ? (chosen ?? "lead") : null,
        });
        if (tags?.length) await data.setContactTags(contact.id, tags);
        return { saved: true, contact_id: contact.id, name: contact.name };
      },
    }),

    update_contact: tool({
      description:
        "Change details of a person who is already in kinlo. Only pass what should change. The user is asked to confirm first.",
      inputSchema: z.object({
        contact_id: z.string(),
        name: z.string().min(1).optional(),
        ...contactFields,
        add_email: z.string().optional(),
        add_phone: z.string().optional(),
        add_tags: z.array(z.string()).optional(),
        ...(business ? { kind: kind.optional() } : {}),
      }),
      execute: async (input) => {
        const { contact_id, add_email, add_phone, add_tags, kind: chosen, ...fields } = input as typeof input & {
          kind?: BusinessKind;
        };
        const contact = await requireContact(contact_id, side);
        const patch: ContactPatch = { ...fields };
        const has = (list: { value: string }[], value: string) =>
          list.some((item) => item.value.toLowerCase() === value.toLowerCase());
        if (add_email?.trim() && !has(contact.emails, add_email.trim())) {
          patch.emails = [...contact.emails, { value: add_email.trim() }];
        }
        if (add_phone?.trim() && !has(contact.phones, add_phone.trim())) {
          patch.phones = [...contact.phones, { value: add_phone.trim() }];
        }
        if (business && chosen) patch.business = chosen;
        if (Object.keys(patch).length) await data.updateContact(contact.id, patch);
        if (add_tags?.length) {
          await data.setContactTags(contact.id, [...contact.tags.map((t) => t.name), ...add_tags]);
        }
        return { saved: true, contact_id: contact.id };
      },
    }),

    log_interaction: tool({
      description:
        "Record that the user was in touch with someone: a call, message, meeting or email. Use type \"note\" for something worth remembering that was not a conversation. The user is asked to confirm first.",
      inputSchema: z.object({
        contact_id: z.string(),
        type: z.enum(data.INTERACTION_TYPES),
        summary: z.string().describe("What was said or what happened, in a sentence or two."),
        happened_at: localDateTime.optional().describe("Local time, YYYY-MM-DDTHH:mm. Leave out for now."),
      }),
      execute: async ({ contact_id, type, summary, happened_at }) => {
        const contact = await requireContact(contact_id, side);
        const happened = happened_at ? parseLocal(happened_at) : undefined;
        if (happened && new Date(happened).getTime() > Date.now() + 5 * 60_000) {
          throw new Error("That time is in the future. Use create_reminder for something that has not happened yet.");
        }
        const interaction = await data.addInteraction({ contact_id: contact.id, type, summary, happened_at: happened });
        return { saved: true, interaction_id: interaction.id };
      },
    }),

    create_reminder: tool({
      description: "Set a reminder, optionally about a person. The user is asked to confirm first.",
      inputSchema: z.object({
        title: z.string().min(1).describe("Short, starting with a verb: \"Call Ana about the move\"."),
        due_at: localDateTime.describe("Local time, YYYY-MM-DDTHH:mm. Use 09:00 when no time was given."),
        contact_id: z.string().optional(),
        repeat: z.enum(data.REPEAT_RULES).optional(),
      }),
      execute: async ({ title, due_at, contact_id, repeat }) => {
        const contact = contact_id ? await requireContact(contact_id, side) : null;
        const reminder = await data.createReminder({
          title,
          due_at: parseLocal(due_at),
          contact_id: contact?.id ?? null,
          repeat_rule: repeat ?? null,
          side,
        });
        return { saved: true, reminder_id: reminder.id, due: localStamp(reminder.due_at) };
      },
    }),
  };

  if (business) {
    tools.list_deals = tool({
      description: "Deals in the pipeline, with their stage and value. Open ones by default.",
      inputSchema: z.object({
        status: z.enum(["open", "closed", "all"]).optional(),
        stage: z.string().optional().describe("A stage name, such as Proposal."),
        contact_id: z.string().optional(),
      }),
      execute: async ({ status, stage, contact_id }) => {
        const stages = await data.listStages();
        const chosen = stage ? await resolveStage(stage) : null;
        const deals = await data.listDeals({
          stageId: chosen?.id,
          contactId: contact_id,
          open: status === "all" ? undefined : status !== "closed",
        });
        return deals.slice(0, 80).map((d) => ({
          id: d.id,
          title: d.title,
          contact_id: d.contact_id,
          contact_name: d.contact_name,
          stage: stages.find((s) => s.id === d.stage_id)?.name ?? d.stage_id,
          value: d.value,
          currency: d.currency,
          expected_close: d.expected_close,
          closed: localStamp(d.closed_at),
        }));
      },
    });

    tools.create_deal = tool({
      description: "Add a deal with one of the user's business contacts. The user is asked to confirm first.",
      inputSchema: z.object({
        contact_id: z.string(),
        title: z.string().min(1),
        value: z.number().nonnegative().optional(),
        currency: z.string().length(3).optional().describe("Three letters, such as USD."),
        stage: z.string().optional().describe("A stage name. Defaults to the first stage."),
        expected_close: dateOnly.optional(),
        notes: z.string().optional(),
      }),
      execute: async ({ contact_id, title, value, currency, stage, expected_close, notes }) => {
        const contact = await requireContact(contact_id, side);
        const chosen = stage ? await resolveStage(stage) : null;
        const deal = await data.createDeal({
          contact_id: contact.id,
          title,
          value: value ?? null,
          currency: currency ?? context.currency,
          stage_id: chosen?.id,
          expected_close: expected_close ?? null,
          notes: notes ?? null,
        });
        return { saved: true, deal_id: deal.id };
      },
    });

    tools.move_deal = tool({
      description:
        "Move a deal to another stage. Moving it to Won or Lost closes it. The user is asked to confirm first.",
      inputSchema: z.object({ deal_id: z.string(), stage: z.string().describe("The stage name to move it to.") }),
      execute: async ({ deal_id, stage }) => {
        const deal = await data.getDeal(deal_id);
        if (!deal) throw new Error("There is no deal with that id. Use list_deals to get the right id.");
        const target = await resolveStage(stage);
        if (deal.stage_id === target.id) return { saved: false, note: `It is already in ${target.name}.` };
        await data.moveDealToStage(deal.id, target.id);
        return { saved: true, deal_id: deal.id, stage: target.name };
      },
    });
  }

  return tools;
}

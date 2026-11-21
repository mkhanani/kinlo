/**
 * Domain types. Field names match the database columns one to one.
 * Timestamps are ISO 8601 strings in UTC. Dates are YYYY-MM-DD.
 */

/** The two sides of kinlo. A person can be on either, or on both. */
export const SIDES = ["personal", "business"] as const;
export type Side = (typeof SIDES)[number];

/** What a business contact is to your work. "other" covers suppliers, partners and the like. */
export const BUSINESS_KINDS = ["lead", "client", "other"] as const;
export type BusinessKind = (typeof BUSINESS_KINDS)[number];

export const INTERACTION_TYPES = ["call", "message", "meeting", "email", "note"] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export const REPEAT_RULES = ["daily", "weekly", "monthly", "yearly"] as const;
export type RepeatRule = (typeof REPEAT_RULES)[number];

/** An email, a phone number or a social handle, with an optional label such as "work". */
export interface LabeledValue {
  label?: string;
  value: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface TagWithCount extends Tag {
  contact_count: number;
}

export interface Contact {
  id: string;
  name: string;
  nickname: string | null;
  /** On the personal side. */
  personal: boolean;
  /** On the business side when set. Everyone is on at least one side. */
  business: BusinessKind | null;
  company: string | null;
  role: string | null;
  emails: LabeledValue[];
  phones: LabeledValue[];
  socials: LabeledValue[];
  location: string | null;
  /** YYYY-MM-DD, or --MM-DD when the year is not known. */
  birthday: string | null;
  how_we_met: string | null;
  notes: string | null;
  /** How often to be in touch, in days. Null means no reminder to keep in touch. */
  keep_in_touch_days: number | null;
  last_contacted_at: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  tags: Tag[];
}

export interface OverdueContact extends Contact {
  /** Whole days past the keep-in-touch interval. Always at least 1. */
  days_overdue: number;
}

export type ContactInput = { name: string } & Partial<
  Omit<Contact, "id" | "name" | "created_at" | "updated_at" | "tags">
>;
export type ContactPatch = Partial<Omit<Contact, "id" | "created_at" | "updated_at" | "tags">>;

export interface ContactFilter {
  /** Free text, matched against names, company, notes and interaction summaries. */
  search?: string;
  /** Only people on this side. */
  side?: Side;
  /** Only business contacts of this kind. */
  business?: BusinessKind;
  tagId?: string;
  overdueOnly?: boolean;
  /** Archived contacts are left out unless this is set. */
  includeArchived?: boolean;
}

export interface Interaction {
  id: string;
  contact_id: string;
  type: InteractionType;
  happened_at: string;
  summary: string;
  created_at: string;
}

export interface InteractionInput {
  contact_id: string;
  type: InteractionType;
  summary?: string;
  /** Defaults to now. */
  happened_at?: string;
}

export interface Reminder {
  id: string;
  contact_id: string | null;
  title: string;
  due_at: string;
  repeat_rule: RepeatRule | null;
  done_at: string | null;
  created_at: string;
}

export interface ReminderWithContact extends Reminder {
  contact_name: string | null;
}

export interface ReminderInput {
  title: string;
  due_at: string;
  contact_id?: string | null;
  repeat_rule?: RepeatRule | null;
}

export interface Stage {
  id: string;
  name: string;
  position: number;
  /** Set on stages that end a deal. */
  outcome: "won" | "lost" | null;
}

export interface Deal {
  id: string;
  contact_id: string;
  title: string;
  stage_id: string;
  value: number | null;
  currency: string;
  expected_close: string | null;
  notes: string | null;
  position: number;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealWithContact extends Deal {
  contact_name: string;
}

export interface DealInput {
  contact_id: string;
  title: string;
  /** Defaults to the first stage. */
  stage_id?: string;
  value?: number | null;
  currency?: string;
  expected_close?: string | null;
  notes?: string | null;
}

export type DealPatch = Partial<Pick<Deal, "title" | "value" | "currency" | "expected_close" | "notes" | "contact_id">>;

export interface AiThread {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export type AiRole = "system" | "user" | "assistant" | "tool";

export interface AiMessage<Content = unknown> {
  id: string;
  thread_id: string;
  role: AiRole;
  content: Content;
  created_at: string;
}

export interface SearchHit {
  contact: Contact;
  /** A short excerpt around the match, with the matched words wrapped in [ ]. */
  excerpt: string;
}

import type { RepeatRule } from "@/data/types";
import { calendarDaysBetween, formatTime } from "@/lib/dates";

export type DueGroup = "overdue" | "today" | "upcoming";

export const GROUP_LABEL: Record<DueGroup, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
};

export const REPEAT_LABEL: Record<RepeatRule, string> = {
  daily: "Every day",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};

/**
 * Which group a reminder falls in, by calendar day. Something due earlier today is still
 * "today", not overdue: it only becomes overdue once the day has passed.
 */
export function dueGroup(dueAt: string, now: Date = new Date()): DueGroup {
  const days = calendarDaysBetween(now, new Date(dueAt));
  return days < 0 ? "overdue" : days === 0 ? "today" : "upcoming";
}

export function groupByDue<T extends { due_at: string }>(items: T[], now: Date = new Date()): Record<DueGroup, T[]> {
  const groups: Record<DueGroup, T[]> = { overdue: [], today: [], upcoming: [] };
  for (const item of items) groups[dueGroup(item.due_at, now)].push(item);
  return groups;
}

/** When a reminder is due, in a few words: "3:30 PM", "Tomorrow, 9:00 AM", "Fri, Nov 27". */
export function dueLabel(dueAt: string, now: Date = new Date()): string {
  const due = new Date(dueAt);
  const days = calendarDaysBetween(now, due);
  const time = formatTime(dueAt);
  if (days === 0) return time;
  if (days === 1) return `Tomorrow, ${time}`;
  if (days === -1) return `Yesterday, ${time}`;
  if (days < -1) return `${-days} days ago`;
  if (days < 7) return `${due.toLocaleDateString(undefined, { weekday: "long" })}, ${time}`;
  return due.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: due.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/** A sensible starting point for a new reminder: tomorrow at nine in the morning. */
export function defaultDue(now: Date = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0).toISOString();
}

export interface SnoozeOption {
  label: string;
  /** When the reminder comes back, as an ISO timestamp. */
  until: string;
}

/**
 * The places a reminder can be put off to, from the moment you ask. "This evening" is
 * only offered while there is still some afternoon left.
 */
export function snoozeOptions(now: Date = new Date()): SnoozeOption[] {
  const day = (offset: number, hours: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hours, 0).toISOString();
  const options: SnoozeOption[] = [{ label: "In an hour", until: new Date(now.getTime() + 3_600_000).toISOString() }];
  if (now.getHours() < 17) options.push({ label: "This evening", until: day(0, 18) });
  options.push({ label: "Tomorrow morning", until: day(1, 9) });
  options.push({ label: "Next week", until: day(7, 9) });
  return options;
}

/**
 * The end of the week ahead: the last moment of the seventh day, counting today.
 * Home uses a rolling seven days rather than the calendar week, so on the last day of a
 * week it still shows what is coming tomorrow.
 */
export function weekAhead(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6, 23, 59, 59, 999);
}

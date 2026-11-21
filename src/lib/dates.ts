/** Date helpers. Storage is ISO 8601 in UTC; everything shown to the user is local time. */

const DAY = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Calendar days from `from` to `to` in local time. Yesterday evening to this morning is 1. */
export function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY);
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", "in 3 days", ... */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const days = calendarDaysBetween(new Date(iso), now);
  const ago = Math.abs(days);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days === -1) return "tomorrow";
  let span: string;
  if (ago < 14) span = plural(ago, "day");
  else if (ago < 60) span = plural(Math.round(ago / 7), "week");
  else if (ago < 365) span = plural(Math.round(ago / 30), "month");
  else span = plural(Math.round(ago / 365), "year");
  return days > 0 ? `${span} ago` : `in ${span}`;
}

/** "Nov 20" in the current year, "Nov 20, 2024" otherwise. */
export function formatDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** ISO timestamp to the value a datetime-local input expects, in local time. */
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export interface BirthdayParts {
  month: number; // 1 to 12
  day: number;
  year: number | null;
}

/** Birthdays are stored as YYYY-MM-DD, or --MM-DD when the year is not known. */
export function parseBirthday(value: string | null | undefined): BirthdayParts | null {
  if (!value) return null;
  const match = /^(?:(\d{4})|-)-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: match[1] ? Number(match[1]) : null, month: Number(match[2]), day: Number(match[3]) };
}

/** Returns null unless the parts make a real date (29 February is allowed without a year). */
export function buildBirthday(parts: { month: number | null; day: number | null; year: number | null }): string | null {
  const { month, day, year } = parts;
  if (!month || !day) return null;
  if (month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(year ?? 2000, month, 0).getDate();
  if (day > daysInMonth) return null;
  if (year != null && (year < 1900 || year > new Date().getFullYear())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year != null ? String(year).padStart(4, "0") : "-"}-${pad(month)}-${pad(day)}`;
}

export function formatBirthday(value: string | null | undefined): string | null {
  const parts = parseBirthday(value);
  if (!parts) return null;
  const d = new Date(parts.year ?? 2000, parts.month - 1, parts.day);
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: parts.year != null ? "numeric" : undefined,
  });
}

export const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString(undefined, { month: "long" }),
);

/**
 * Reads a time the way people type it: "15:30", "3:30 pm", "3pm", "1530", "9".
 * Returns null when it cannot be read as a time of day.
 */
export function parseTime(input: string): { hours: number; minutes: number } | null {
  const match = /^\s*(\d{1,2})(?:[:.\s]?(\d{2}))?\s*(a|am|p|pm)?\s*$/i.exec(input.replace(/\./g, ":").replace(/::/g, ":"));
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase()[0];
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "p" && hours !== 12) hours += 12;
    if (meridiem === "a" && hours === 12) hours = 0;
  }
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/** The first day of the week where the user is: 0 for Sunday, 1 for Monday, and so on. */
export function firstDayOfWeek(): number {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const first = locale.getWeekInfo?.().firstDay ?? locale.weekInfo?.firstDay;
    if (first) return first % 7;
  } catch {
    // Older engines: fall through.
  }
  return 1;
}

/** The days shown for a month: whole weeks, so it may start and end in neighbouring months. */
export function monthGrid(year: number, month: number, weekStart: number): Date[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => new Date(year, month, 1 - lead + i));
}

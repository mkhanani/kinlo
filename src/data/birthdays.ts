import { listContacts } from "./contacts";
import type { Side, UpcomingBirthday } from "./types";

function parse(value: string): { month: number; day: number; year: number | null } | null {
  const match = /^(?:(\d{4})|-)-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: match[1] ? Number(match[1]) : null, month: Number(match[2]), day: Number(match[3]) };
}

const pad = (n: number) => String(n).padStart(2, "0");
const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * Birthdays coming up in the next `withinDays` days, soonest first, today included.
 * Works in local time. Someone born on 29 February is celebrated on the 28th in other years.
 */
export async function listUpcomingBirthdays(
  side: Side | undefined,
  now: Date = new Date(),
  withinDays = 30,
): Promise<UpcomingBirthday[]> {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const upcoming: UpcomingBirthday[] = [];

  for (const contact of await listContacts({ side })) {
    const born = contact.birthday ? parse(contact.birthday) : null;
    if (!born) continue;

    const occurrence = (year: number) => {
      const day = born.month === 2 && born.day === 29 && !isLeap(year) ? 28 : born.day;
      return new Date(year, born.month - 1, day);
    };
    let next = occurrence(today.getFullYear());
    if (next.getTime() < today.getTime()) next = occurrence(today.getFullYear() + 1);

    const days_until = Math.round((next.getTime() - today.getTime()) / 86_400_000);
    if (days_until > withinDays) continue;

    upcoming.push({
      contact,
      date: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`,
      days_until,
      turning: born.year != null ? next.getFullYear() - born.year : null,
    });
  }

  return upcoming.sort((a, b) => a.days_until - b.days_until || a.contact.name.localeCompare(b.contact.name));
}

import { useEffect, useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { calendarDaysBetween, firstDayOfWeek, formatDate, formatTime, monthGrid, parseTime } from "@/lib/dates";

interface Props {
  /** ISO timestamp, or null for "now" (only offered when `allowNow` is set). */
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
  /** Offer "Now" as a choice. The value is then null until a date is picked. */
  allowNow?: boolean;
  /** Days after today cannot be picked. For things that have already happened. */
  pastOnly?: boolean;
}

function describe(value: string | null): string {
  if (!value) return "Now";
  const days = calendarDaysBetween(new Date(value), new Date());
  const day = days === 0 ? "Today" : days === 1 ? "Yesterday" : days === -1 ? "Tomorrow" : formatDate(value);
  return `${day}, ${formatTime(value)}`;
}

/**
 * A date and time picker drawn by kinlo, so it looks and behaves the same on Windows,
 * macOS and Linux. The built-in browser control differs on each.
 */
export function DateTimeField({ value, onChange, label, allowNow, pastOnly }: Props) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => (value ? new Date(value) : null), [value]);
  const [view, setView] = useState(() => {
    const d = selected ?? new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [time, setTime] = useState("");

  // Each time it opens, start on the chosen month with the chosen time.
  useEffect(() => {
    if (!open) return;
    const d = selected ?? new Date();
    setView({ year: d.getFullYear(), month: d.getMonth() });
    setTime(formatTime(d.toISOString()));
  }, [open, selected]);

  const today = new Date();
  const weekStart = firstDayOfWeek();
  const days = monthGrid(view.year, view.month, weekStart);
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 7 + weekStart + i).toLocaleDateString(undefined, { weekday: "narrow" }),
  );
  const monthName = new Date(view.year, view.month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const emit = (date: Date) => {
    // Something that already happened cannot be later than this moment.
    const capped = pastOnly && date.getTime() > Date.now() ? new Date() : date;
    onChange(capped.toISOString());
  };

  const pickDay = (day: Date) => {
    const base = selected ?? new Date();
    emit(new Date(day.getFullYear(), day.getMonth(), day.getDate(), base.getHours(), base.getMinutes()));
  };

  const commitTime = () => {
    const parsed = parseTime(time);
    const base = selected ?? new Date();
    if (!parsed) {
      setTime(formatTime(base.toISOString()));
      return;
    }
    emit(new Date(base.getFullYear(), base.getMonth(), base.getDate(), parsed.hours, parsed.minutes));
  };

  const shift = (months: number) => {
    const d = new Date(view.year, view.month + months, 1);
    setView({ year: d.getFullYear(), month: d.getMonth() });
  };

  /** Jumps to a day relative to today, keeping the time already chosen. */
  const quick = (daysFromToday: number) => {
    const base = selected ?? new Date();
    const d = new Date();
    d.setDate(d.getDate() + daysFromToday);
    emit(new Date(d.getFullYear(), d.getMonth(), d.getDate(), base.getHours(), base.getMinutes()));
  };

  // Things that happened look back; things to do look ahead.
  const shortcuts = pastOnly
    ? [
        { label: "Today", days: 0 },
        { label: "Yesterday", days: -1 },
      ]
    : [
        { label: "Today", days: 0 },
        { label: "Tomorrow", days: 1 },
        { label: "Next week", days: 7 },
      ];

  const chip = "h-7 rounded-[8px] px-2 text-sm text-muted transition-colors duration-150 hover:bg-control-hover hover:text-fg";

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${describe(value)}`}
          className="control inline-flex h-8 items-center gap-2 px-2.5 text-sm text-fg"
        >
          <CalendarDays size={14} strokeWidth={1.5} className="text-muted" />
          {describe(value)}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="menu-surface glass-float z-50 w-[264px] p-3" aria-label={label}>
          <div className="mb-2 flex flex-wrap gap-1">
            {allowNow && (
              <button
                type="button"
                className={`${chip} ${value === null ? "bg-active !text-fg" : ""}`}
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                Now
              </button>
            )}
            {shortcuts.map((shortcut) => (
              <button key={shortcut.label} type="button" className={chip} onClick={() => quick(shortcut.days)}>
                {shortcut.label}
              </button>
            ))}
          </div>

          <div className="mb-1 flex items-center justify-between">
            <span className="px-1 text-sm font-medium">{monthName}</span>
            <div className="flex">
              <button type="button" aria-label="Previous month" className={`${chip} !px-1.5`} onClick={() => shift(-1)}>
                <ChevronLeft size={15} strokeWidth={1.5} />
              </button>
              <button type="button" aria-label="Next month" className={`${chip} !px-1.5`} onClick={() => shift(1)}>
                <ChevronRight size={15} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 text-center" role="grid" aria-label={monthName}>
            {weekdays.map((w, i) => (
              <span key={i} className="flex h-7 items-center justify-center text-xs text-subtle">
                {w}
              </span>
            ))}
            {days.map((day) => {
              const outside = day.getMonth() !== view.month;
              const isToday = calendarDaysBetween(day, today) === 0;
              const isSelected = !!selected && calendarDaysBetween(day, selected) === 0;
              const disabled = !!pastOnly && calendarDaysBetween(today, day) > 0;
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  disabled={disabled}
                  aria-pressed={isSelected}
                  aria-label={day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  onClick={() => pickDay(day)}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors duration-150 disabled:opacity-25 ${
                    isSelected
                      ? "bg-fg font-medium text-bg"
                      : `${outside ? "text-subtle" : "text-fg"} ${isToday ? "border border-hairline" : ""} hover:bg-control-hover`
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <label className="mt-2 flex items-center justify-between gap-3 border-t border-hairline pt-2.5 text-sm text-muted">
            Time
            <input
              value={time}
              onChange={(e) => setTime(e.target.value)}
              onBlur={commitTime}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  commitTime();
                }
              }}
              aria-label="Time"
              className="h-7 w-[104px] rounded-[8px] border border-hairline bg-control px-2 text-right text-sm text-fg outline-none focus:border-[var(--ring)]"
            />
          </label>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

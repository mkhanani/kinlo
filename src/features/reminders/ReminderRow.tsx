import { useState } from "react";
import { Link } from "react-router-dom";
import { AlarmClock, Check, MoreHorizontal, Repeat } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/Menu";
import { useCompleteReminder, useDeleteReminder, useReopenReminder, useSnoozeReminder } from "@/data/hooks";
import type { ReminderWithContact } from "@/data/types";
import { relativeDay } from "@/lib/dates";
import { useUI } from "@/store/ui";
import { dueGroup, dueLabel, REPEAT_LABEL, snoozeOptions } from "./due";

interface Props {
  reminder: ReminderWithContact;
  /** Leave out the person's name, for lists that are already about one person. */
  hidePerson?: boolean;
  /** A tighter row without the menu, for cards on Home and a person's page. */
  compact?: boolean;
}

/** One reminder: a tick to finish it, what it is, who it is about and when it is due. */
export function ReminderRow({ reminder, hidePerson, compact }: Props) {
  const complete = useCompleteReminder();
  const reopen = useReopenReminder();
  const remove = useDeleteReminder();
  const openForm = useUI((s) => s.openReminderForm);
  const [confirming, setConfirming] = useState(false);

  const snooze = useSnoozeReminder();
  const done = !!reminder.done_at;
  const snoozed = !done && !!reminder.snoozed_from;
  const overdue = !done && dueGroup(reminder.due_at) === "overdue";
  const busy = complete.isPending || reopen.isPending;

  const when = (
    <time
      dateTime={done ? reminder.done_at! : reminder.due_at}
      className={`shrink-0 text-sm ${overdue ? "font-medium text-fg" : "text-muted"}`}
    >
      {done ? `Done ${relativeDay(reminder.done_at!)}` : dueLabel(reminder.due_at)}
    </time>
  );

  return (
    <div className={`group flex items-center gap-3 ${compact ? "py-1.5" : "px-4 py-2.5"}`}>
      <button
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `Reopen: ${reminder.title}` : `Done: ${reminder.title}`}
        disabled={busy}
        onClick={() => (done ? reopen.mutate(reminder.id) : complete.mutate(reminder.id))}
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
          done
            ? "border-[var(--fg)] bg-fg text-bg"
            : "border-[var(--subtle)] text-transparent hover:border-[var(--fg)] hover:text-muted"
        }`}
      >
        <Check size={11} strokeWidth={2.5} />
      </button>

      <div className="min-w-0 flex-1">
        <div className={`truncate text-base ${done ? "text-muted line-through" : ""}`}>{reminder.title}</div>
        {compact || (!hidePerson && reminder.contact_name) || reminder.repeat_rule || snoozed ? (
          <div className="flex items-center gap-2 truncate text-sm text-muted">
            {/* In a narrow card the time goes under the title, so the title keeps its room. */}
            {compact && when}
            {!hidePerson && reminder.contact_id && reminder.contact_name && (
              <Link to={`/people/${reminder.contact_id}`} className="truncate hover:text-fg hover:underline">
                {reminder.contact_name}
              </Link>
            )}
            {reminder.repeat_rule && (
              <span className="inline-flex shrink-0 items-center gap-1 text-subtle">
                <Repeat size={11} strokeWidth={1.75} /> {REPEAT_LABEL[reminder.repeat_rule]}
              </span>
            )}
            {snoozed && (
              <span className="inline-flex shrink-0 items-center gap-1 text-subtle">
                <AlarmClock size={11} strokeWidth={1.75} /> Snoozed
              </span>
            )}
          </div>
        ) : null}
      </div>

      {!compact && when}

      {!done && (
        <div className="opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
          <Menu
            trigger={
              <button
                aria-label={`Snooze ${reminder.title}`}
                title="Snooze"
                className="flex h-6 w-6 items-center justify-center rounded-[8px] text-muted hover:bg-control hover:text-fg"
              >
                <AlarmClock size={14} strokeWidth={1.5} />
              </button>
            }
          >
            <MenuLabel>Remind me again</MenuLabel>
            {snoozeOptions().map((option) => (
              <MenuItem key={option.label} onSelect={() => snooze.mutate({ id: reminder.id, until: option.until })}>
                {option.label} <span className="text-sm text-subtle">{dueLabel(option.until)}</span>
              </MenuItem>
            ))}
          </Menu>
        </div>
      )}

      {!compact && (
        <div className="opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
          <Menu
            trigger={
              <button
                aria-label={`Options for ${reminder.title}`}
                className="flex h-6 w-6 items-center justify-center rounded-[8px] text-muted hover:bg-control hover:text-fg"
              >
                <MoreHorizontal size={15} strokeWidth={1.5} />
              </button>
            }
          >
            <MenuItem onSelect={() => openForm({ reminderId: reminder.id })}>Edit</MenuItem>
            <MenuItem danger onSelect={() => setConfirming(true)}>
              Delete
            </MenuItem>
          </Menu>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this reminder?"
        description={`“${reminder.title}” will be removed. This cannot be undone.`}
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={() => remove.mutate(reminder.id, { onSuccess: () => setConfirming(false) })}
      />
    </div>
  );
}

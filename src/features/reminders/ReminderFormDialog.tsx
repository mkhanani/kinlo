import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSide } from "@/app/settings";
import { Button } from "@/components/ui/Button";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { Field, Input, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PersonPicker } from "@/components/ui/PersonPicker";
import { getReminder } from "@/data";
import { keys, useCreateReminder, useUpdateReminder } from "@/data/hooks";
import { REPEAT_RULES } from "@/data/types";
import type { Reminder, RepeatRule } from "@/data/types";
import { useUI } from "@/store/ui";
import { defaultDue, REPEAT_LABEL } from "./due";

/** The one dialog for adding and editing a reminder. Opened from anywhere through the UI store. */
export function ReminderFormDialog() {
  const { open, reminderId, contactId } = useUI((s) => s.reminderForm);
  const close = useUI((s) => s.closeReminderForm);
  const { data: reminder } = useQuery({
    queryKey: [...keys.reminders, "detail", reminderId],
    queryFn: () => getReminder(reminderId!),
    enabled: !!reminderId,
  });
  const ready = !reminderId || !!reminder;

  return (
    <Modal
      open={open && ready}
      onOpenChange={(next) => !next && close()}
      title={reminderId ? "Edit reminder" : "Add reminder"}
      width={460}
    >
      <ReminderForm
        key={reminderId ?? `new-${contactId ?? ""}`}
        reminder={reminderId ? (reminder ?? null) : null}
        startContactId={contactId}
        onDone={close}
      />
    </Modal>
  );
}

function ReminderForm({
  reminder,
  startContactId,
  onDone,
}: {
  reminder: Reminder | null;
  startContactId: string | null;
  onDone: () => void;
}) {
  const side = useSide();
  const [title, setTitle] = useState(reminder?.title ?? "");
  const [due, setDue] = useState<string>(reminder?.due_at ?? defaultDue());
  const [repeat, setRepeat] = useState<RepeatRule | "">(reminder?.repeat_rule ?? "");
  const [contactId, setContactId] = useState<string | null>(reminder ? reminder.contact_id : startContactId);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const busy = create.isPending || update.isPending;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return setError("Say what to be reminded of.");
    try {
      if (reminder) {
        await update.mutateAsync({
          id: reminder.id,
          patch: { title, due_at: due, repeat_rule: repeat || null, contact_id: contactId },
        });
      } else {
        await create.mutateAsync({ title, due_at: due, repeat_rule: repeat || null, contact_id: contactId, side });
      }
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That did not save. Try again.");
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Remind me to" error={error}>
        {(id) => (
          <Input
            id={id}
            autoFocus
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
            placeholder="Call, send, ask about"
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">When</span>
          <DateTimeField label="When" value={due} onChange={(value) => value && setDue(value)} />
        </div>
        <Field label="Repeat">
          {(id) => (
            <Select id={id} value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatRule | "")}>
              <option value="">Does not repeat</option>
              {REPEAT_RULES.map((rule) => (
                <option key={rule} value={rule}>
                  {REPEAT_LABEL[rule]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field label="About" hint="Optional. Link it to a person and it shows on their page too.">
        {(id) => <PersonPicker id={id} value={contactId} onChange={setContactId} side={side} />}
      </Field>

      <div className="-mx-5 -mb-5 mt-1 flex items-center justify-end gap-2 border-t border-hairline px-5 py-3">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {reminder ? "Save" : "Add reminder"}
        </Button>
      </div>
    </form>
  );
}

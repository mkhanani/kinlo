import { useState } from "react";
import type { KeyboardEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input, Textarea } from "@/components/ui/Field";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { Segmented } from "@/components/ui/Segmented";
import { useAddInteraction, useDeleteInteraction, useInteractions, useUpdateInteraction } from "@/data/hooks";
import { INTERACTION_TYPES } from "@/data/types";
import type { Interaction, InteractionType } from "@/data/types";
import { formatDate, formatTime, fromDateTimeLocal, relativeDay, toDateTimeLocal } from "@/lib/dates";
import { ease } from "@/lib/motion";
import { modKey } from "@/lib/platform";
import { INTERACTION } from "./labels";

const TYPE_OPTIONS = INTERACTION_TYPES.map((t) => ({ value: t, label: INTERACTION[t].label }));

const PROMPT: Record<InteractionType, string> = {
  call: "What did you talk about?",
  message: "What was said?",
  meeting: "What came up?",
  email: "What was it about?",
  note: "Something to remember",
};

/** A person's history, newest first, with a box on top to add to it. */
export function Timeline({ contactId, firstName }: { contactId: string; firstName: string }) {
  const { data: interactions = [], isPending } = useInteractions(contactId);

  return (
    <section aria-label="Timeline" className="flex flex-col gap-3">
      <Composer contactId={contactId} />
      {interactions.length === 0 && !isPending ? (
        <p className="px-1 py-6 text-center text-base text-subtle">
          Nothing logged yet. Add the last time you and {firstName} were in touch.
        </p>
      ) : (
        <ol className="flex flex-col">
          <AnimatePresence initial={false}>
            {interactions.map((interaction) => (
              <motion.li
                key={interaction.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease }}
              >
                <Entry interaction={interaction} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}

function Composer({ contactId }: { contactId: string }) {
  const [type, setType] = useState<InteractionType>("call");
  const [summary, setSummary] = useState("");
  // Empty means "now", so a quick log never carries a stale time.
  const [when, setWhen] = useState("");
  const add = useAddInteraction();

  const submit = () => {
    if (add.isPending) return;
    add.mutate(
      { contact_id: contactId, type, summary, happened_at: fromDateTimeLocal(when) ?? undefined },
      {
        onSuccess: () => {
          setSummary("");
          setWhen("");
        },
      },
    );
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="glass flex flex-col gap-2.5 p-3" onKeyDown={onKeyDown}>
      <Segmented label="Type" value={type} onChange={setType} options={TYPE_OPTIONS} />
      <Textarea
        aria-label="Summary"
        rows={2}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder={PROMPT[type]}
      />
      <div className="flex items-center gap-2">
        <Input
          type="datetime-local"
          aria-label="When"
          value={when}
          max={toDateTimeLocal(new Date().toISOString())}
          onChange={(e) => setWhen(e.target.value)}
          className="!w-[210px] text-sm"
        />
        <span className="text-xs text-subtle">{when ? "" : "Leave empty for now"}</span>
        <span className="ml-auto text-xs text-subtle">{modKey} Enter</span>
        <Button variant="primary" onClick={submit} disabled={add.isPending}>
          Log {INTERACTION[type].label.toLowerCase()}
        </Button>
      </div>
      {add.isError && <p className="text-sm text-danger">That did not save. Try again.</p>}
    </div>
  );
}

function Entry({ interaction }: { interaction: Interaction }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteInteraction();
  const { label, icon: Icon } = INTERACTION[interaction.type];

  return (
    <div className="group relative flex gap-3 py-2.5 pl-1">
      {/* The line that joins entries into a timeline. */}
      <span aria-hidden className="absolute bottom-0 left-[16px] top-[40px] w-px bg-hairline group-last:hidden" />
      <span className="relative z-10 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-hairline bg-control text-muted">
        <Icon size={14} strokeWidth={1.5} />
      </span>

      {editing ? (
        <EditEntry interaction={interaction} onDone={() => setEditing(false)} />
      ) : (
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{label}</span>
            <time
              dateTime={interaction.happened_at}
              title={`${formatDate(interaction.happened_at)} at ${formatTime(interaction.happened_at)}`}
              className="text-subtle"
            >
              {relativeDay(interaction.happened_at)} · {formatDate(interaction.happened_at)}
            </time>
            <div className="ml-auto opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
              <Menu
                trigger={
                  <button
                    aria-label={`${label} options`}
                    className="flex h-6 w-6 items-center justify-center rounded-[8px] text-muted hover:bg-control hover:text-fg"
                  >
                    <MoreHorizontal size={15} strokeWidth={1.5} />
                  </button>
                }
              >
                <MenuItem onSelect={() => setEditing(true)}>Edit</MenuItem>
                <MenuItem danger onSelect={() => setConfirming(true)}>
                  Delete
                </MenuItem>
              </Menu>
            </div>
          </div>
          {interaction.summary && (
            <p className="mt-0.5 select-text whitespace-pre-wrap break-words text-base text-fg/90">{interaction.summary}</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete this ${label.toLowerCase()}?`}
        description="It will be removed from the timeline. This cannot be undone."
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={() => remove.mutate(interaction, { onSuccess: () => setConfirming(false) })}
      />
    </div>
  );
}

function EditEntry({ interaction, onDone }: { interaction: Interaction; onDone: () => void }) {
  const [type, setType] = useState(interaction.type);
  const [summary, setSummary] = useState(interaction.summary);
  const [when, setWhen] = useState(toDateTimeLocal(interaction.happened_at));
  const update = useUpdateInteraction();

  const save = () => {
    const happened_at = fromDateTimeLocal(when) ?? interaction.happened_at;
    update.mutate({ interaction, patch: { type, summary, happened_at } }, { onSuccess: onDone });
  };

  return (
    <div className="glass flex min-w-0 flex-1 flex-col gap-2.5 p-3">
      <Segmented label="Type" value={type} onChange={setType} options={TYPE_OPTIONS} />
      <Textarea aria-label="Summary" rows={3} autoFocus value={summary} onChange={(e) => setSummary(e.target.value)} />
      <div className="flex items-center gap-2">
        <Input
          type="datetime-local"
          aria-label="When"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="!w-[210px] text-sm"
        />
        <Button variant="ghost" className="ml-auto" onClick={onDone}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={update.isPending}>
          Save
        </Button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Bell, CheckCheck, Plus } from "lucide-react";
import { useSide } from "@/app/settings";
import { Button } from "@/components/ui/Button";
import { ToggleChip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Page, PageHeader } from "@/components/ui/Page";
import { useReminders } from "@/data/hooks";
import type { ReminderWithContact } from "@/data/types";
import { ease } from "@/lib/motion";
import { useUI } from "@/store/ui";
import { GROUP_LABEL, groupByDue, type DueGroup } from "./due";
import { ReminderRow } from "./ReminderRow";

const ORDER: DueGroup[] = ["overdue", "today", "upcoming"];

export function RemindersPage() {
  const side = useSide();
  const openForm = useUI((s) => s.openReminderForm);
  const [showDone, setShowDone] = useState(false);
  const { data: reminders, isPending } = useReminders({ side, status: showDone ? "done" : "open" });

  const groups = groupByDue(reminders ?? []);
  const open = reminders?.length ?? 0;

  return (
    <Page>
      <PageHeader
        title="Reminders"
        subtitle={
          showDone
            ? "Finished"
            : open > 0
              ? `${open} open${groups.overdue.length ? `, ${groups.overdue.length} overdue` : ""}`
              : undefined
        }
        actions={
          <>
            <ToggleChip pressed={showDone} onPressedChange={setShowDone}>
              <CheckCheck size={14} strokeWidth={1.5} /> Done
            </ToggleChip>
            <Button variant="primary" onClick={() => openForm()}>
              <Plus size={15} strokeWidth={1.5} /> Add reminder
            </Button>
          </>
        }
      />

      {!isPending && open === 0 ? (
        showDone ? (
          <EmptyState icon={CheckCheck} title="Nothing finished yet." action={<Button onClick={() => setShowDone(false)}>Back to open</Button>} />
        ) : (
          <EmptyState
            icon={Bell}
            title="Nothing to remember right now. Add a reminder when something needs doing."
            action={
              <Button variant="primary" onClick={() => openForm()}>
                Add reminder
              </Button>
            }
          />
        )
      ) : showDone ? (
        <ReminderList label="Finished" reminders={reminders ?? []} />
      ) : (
        <div className="flex flex-col gap-6">
          {ORDER.filter((group) => groups[group].length > 0).map((group) => (
            <ReminderList key={group} label={GROUP_LABEL[group]} reminders={groups[group]} />
          ))}
        </div>
      )}
    </Page>
  );
}

function ReminderList({ label, reminders }: { label: string; reminders: ReminderWithContact[] }) {
  return (
    <section aria-label={label}>
      <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-medium tracking-normal text-muted">
        {label} <span className="text-subtle">{reminders.length}</span>
      </h2>
      <ul className="glass divide-y divide-hairline overflow-hidden">
        <AnimatePresence initial={false}>
          {reminders.map((reminder) => (
            <motion.li
              key={reminder.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease }}
            >
              <ReminderRow reminder={reminder} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

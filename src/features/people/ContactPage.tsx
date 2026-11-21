import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  AtSign,
  Bell,
  Cake,
  ChevronLeft,
  Clock,
  Columns3,
  Handshake,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Trash2,
  UserX,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSettings } from "@/app/settings";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/Field";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { Page } from "@/components/ui/Page";
import { overdueDays } from "@/data/contacts";
import {
  useContact,
  useContactDeals,
  useContactReminders,
  useDeleteContact,
  useStages,
  useUpdateContact,
} from "@/data/hooks";
import type { Contact, LabeledValue } from "@/data/types";
import { formatBirthday, formatDate, relativeDay } from "@/lib/dates";
import { openExternal } from "@/lib/external";
import { useUI } from "@/store/ui";
import { keepInTouchLabel, sideLabels } from "./labels";
import { ReminderRow } from "@/features/reminders/ReminderRow";
import { Timeline } from "./Timeline";

export function ContactPage() {
  const { id } = useParams();
  const { data: contact, isPending } = useContact(id);

  if (isPending) return <Page>{null}</Page>;
  if (!contact) {
    return (
      <Page>
        <BackLink />
        <EmptyState
          icon={UserX}
          title="This person is not here any more."
          action={
            <Link to="/people">
              <Button>Back to people</Button>
            </Link>
          }
        />
      </Page>
    );
  }
  return <ContactView contact={contact} />;
}

function BackLink() {
  return (
    <Link
      to="/people"
      className="-ml-1.5 mb-5 inline-flex h-7 w-fit items-center gap-1 rounded-[8px] px-1.5 text-sm text-muted hover:bg-control hover:text-fg"
    >
      <ChevronLeft size={15} strokeWidth={1.5} /> People
    </Link>
  );
}

function ContactView({ contact }: { contact: Contact }) {
  const openForm = useUI((s) => s.openContactForm);
  const update = useUpdateContact();
  const remove = useDeleteContact();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const overdue = overdueDays(contact);
  const work = [contact.role, contact.company].filter(Boolean).join(" at ");
  const firstName = contact.nickname ?? contact.name.split(/\s+/)[0] ?? contact.name;
  const keep = keepInTouchLabel(contact.keep_in_touch_days);

  return (
    <Page>
      <BackLink />

      <header className="mb-7 flex items-start gap-4">
        <Avatar name={contact.name} contactId={contact.id} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="select-text truncate text-xl">{contact.name}</h1>
          {(contact.nickname || work) && (
            <p className="mt-0.5 select-text truncate text-base text-muted">
              {[contact.nickname && `“${contact.nickname}”`, work].filter(Boolean).join(" · ")}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {sideLabels(contact).map((label) => (
              <Chip key={label}>{label}</Chip>
            ))}
            {contact.archived && <Chip>Archived</Chip>}
            {contact.tags.map((tag) => (
              <Chip key={tag.id}>{tag.name}</Chip>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button onClick={() => openForm(contact.id)}>
            <Pencil size={14} strokeWidth={1.5} /> Edit
          </Button>
          <Menu
            trigger={
              <Button aria-label="More" className="!px-2">
                <MoreHorizontal size={16} strokeWidth={1.5} />
              </Button>
            }
          >
            <MenuItem onSelect={() => update.mutate({ id: contact.id, patch: { archived: !contact.archived } })}>
              {contact.archived ? (
                <>
                  <ArchiveRestore size={15} strokeWidth={1.5} /> Unarchive
                </>
              ) : (
                <>
                  <Archive size={15} strokeWidth={1.5} /> Archive
                </>
              )}
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={() => setConfirmDelete(true)}>
              <Trash2 size={15} strokeWidth={1.5} /> Delete
            </MenuItem>
          </Menu>
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-6">
        <Timeline contactId={contact.id} firstName={firstName} />

        <aside className="flex flex-col gap-3">
          <Card title="Keeping in touch" icon={Clock}>
            <dl className="flex flex-col gap-1.5 text-base">
              <Row label="Last contact">
                {contact.last_contacted_at ? (
                  <span title={formatDate(contact.last_contacted_at)}>{relativeDay(contact.last_contacted_at)}</span>
                ) : (
                  <span className="text-subtle">Not yet</span>
                )}
              </Row>
              <Row label="Rhythm">{keep ?? <span className="text-subtle">No reminder</span>}</Row>
            </dl>
            {overdue > 0 && (
              <div className="mt-3">
                <Chip tone="strong">
                  {overdue} {overdue === 1 ? "day" : "days"} overdue
                </Chip>
              </div>
            )}
          </Card>

          <Details contact={contact} />
          <Notes contact={contact} />
          <Reminders contactId={contact.id} />
          {contact.business && <Deals contactId={contact.id} />}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${contact.name}?`}
        description="This also deletes their timeline, reminders and deals. It cannot be undone. Archive instead if you only want them out of the way."
        confirmLabel="Delete"
        busy={remove.isPending}
        onConfirm={() =>
          remove.mutate(contact.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              navigate("/people", { replace: true });
            },
          })
        }
      />
    </Page>
  );
}

function Card({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="glass p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-medium tracking-normal text-muted">
          <Icon size={14} strokeWidth={1.5} /> {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function Details({ contact }: { contact: Contact }) {
  const birthday = formatBirthday(contact.birthday);
  const empty =
    !contact.emails.length &&
    !contact.phones.length &&
    !contact.socials.length &&
    !contact.location &&
    !birthday &&
    !contact.how_we_met;

  return (
    <Card title="Details" icon={AtSign}>
      {empty ? (
        <p className="text-base text-subtle">No details yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5 text-base">
          <Values icon={Mail} items={contact.emails} href={(v) => `mailto:${v}`} />
          <Values icon={Phone} items={contact.phones} href={(v) => `tel:${v.replace(/[^\d+]/g, "")}`} />
          <Values icon={AtSign} items={contact.socials} href={(v) => (/^https?:\/\//i.test(v) ? v : null)} />
          {contact.location && <Line icon={MapPin}>{contact.location}</Line>}
          {birthday && <Line icon={Cake}>{birthday}</Line>}
          {contact.how_we_met && <Line icon={Handshake}>{contact.how_we_met}</Line>}
        </ul>
      )}
    </Card>
  );
}

function Line({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <Icon size={14} strokeWidth={1.5} className="mt-[3px] shrink-0 text-subtle" />
      <span className="min-w-0 select-text break-words">{children}</span>
    </li>
  );
}

function Values({ icon, items, href }: { icon: LucideIcon; items: LabeledValue[]; href: (value: string) => string | null }) {
  return (
    <>
      {items.map((item, index) => {
        const url = href(item.value);
        return (
          <Line key={`${item.value}-${index}`} icon={icon}>
            {url ? (
              <button
                onClick={() => void openExternal(url)}
                className="select-text text-left underline decoration-[var(--hairline)] underline-offset-4 hover:decoration-[var(--muted)]"
              >
                {item.value}
              </button>
            ) : (
              item.value
            )}
            {item.label && <span className="ml-2 text-sm text-subtle">{item.label}</span>}
          </Line>
        );
      })}
    </>
  );
}

/** Notes save by themselves when you click away. */
function Notes({ contact }: { contact: Contact }) {
  const [draft, setDraft] = useState(contact.notes ?? "");
  const update = useUpdateContact();

  // Pick up edits made elsewhere (the edit dialog) without clobbering what is being typed.
  useEffect(() => setDraft(contact.notes ?? ""), [contact.notes]);

  const save = () => {
    if (draft.trim() !== (contact.notes ?? "")) update.mutate({ id: contact.id, patch: { notes: draft } });
  };

  return (
    <Card title="Notes" icon={Pencil}>
      <Textarea
        aria-label="Notes"
        rows={5}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        placeholder="Anything worth remembering"
        className="!border-transparent !bg-transparent !px-0 !py-0 hover:!bg-transparent"
      />
    </Card>
  );
}

function Reminders({ contactId }: { contactId: string }) {
  const { data: reminders = [] } = useContactReminders(contactId);
  const openForm = useUI((s) => s.openReminderForm);
  return (
    <Card
      title="Reminders"
      icon={Bell}
      action={
        <button
          aria-label="Add reminder"
          onClick={() => openForm({ contactId })}
          className="-my-1 flex h-6 w-6 items-center justify-center rounded-[8px] text-muted hover:bg-control hover:text-fg"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
      }
    >
      {reminders.length === 0 ? (
        <p className="text-base text-subtle">No reminders.</p>
      ) : (
        <ul className="flex flex-col">
          {reminders.map((reminder) => (
            <li key={reminder.id}>
              <ReminderRow reminder={reminder} hidePerson compact />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Deals({ contactId }: { contactId: string }) {
  const { sides } = useSettings();
  const { data: deals = [] } = useContactDeals(contactId);
  const { data: stages = [] } = useStages();
  // Deals are a business thing. Nothing to show for someone who only uses the personal side.
  if (sides === "personal") return null;
  return (
    <Card title="Deals" icon={Columns3}>
      {deals.length === 0 ? (
        <p className="text-base text-subtle">No deals.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-base">
          {deals.map((d) => (
            <li key={d.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{d.title}</span>
              <span className="shrink-0 text-muted">{stages.find((s) => s.id === d.stage_id)?.name}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

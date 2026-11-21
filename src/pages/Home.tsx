import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Cake, ChevronRight, Clock, Columns3, Plus, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSettings, useSide } from "@/app/settings";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Page, PageHeader } from "@/components/ui/Page";
import {
  useContactCount,
  useDayKey,
  useOpenDeals,
  useOverdueContacts,
  useReminders,
  useUpcomingBirthdays,
} from "@/data/hooks";
import { weekAhead } from "@/features/reminders/due";
import { ReminderRow } from "@/features/reminders/ReminderRow";
import { EMPTY_PEOPLE_FILTER, useUI } from "@/store/ui";

const SHOWN = 5;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** The first screen: what needs your attention on the side you are on. */
export function HomePage() {
  const { userName, sides } = useSettings();
  const side = useSide();
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const where = sides === "both" ? ` · ${side === "personal" ? "Personal" : "Business"}` : "";

  return (
    <Page>
      <PageHeader title={userName ? `${greeting()}, ${userName}` : greeting()} subtitle={`${today}${where}`} />
      <div className="grid grid-cols-2 items-start gap-3">
        <Overdue />
        <ThisWeek />
        <Birthdays />
        {side === "business" ? <OpenDeals /> : <YourPeople />}
      </div>
    </Page>
  );
}

function Card({
  icon: Icon,
  title,
  count,
  footer,
  children,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="glass flex min-h-[168px] flex-col p-5">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted">
        <Icon size={15} strokeWidth={1.5} />
        <h2 className="text-sm font-medium tracking-normal">{title}</h2>
        {count ? <span className="text-subtle">{count}</span> : null}
      </div>
      <div className="flex-1">{children}</div>
      {footer && <div className="mt-3 flex">{footer}</div>}
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-base text-subtle">{children}</p>;

function More({ to, onClick, children }: { to: string; onClick?: () => void; children: ReactNode }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="-ml-1.5 inline-flex h-7 items-center gap-0.5 rounded-[8px] px-1.5 text-sm text-muted hover:bg-control hover:text-fg"
    >
      {children} <ChevronRight size={14} strokeWidth={1.5} />
    </Link>
  );
}

function Overdue() {
  const side = useSide();
  const setFilter = useUI((s) => s.setPeopleFilter);
  const { data: overdue = [] } = useOverdueContacts(side);

  return (
    <Card
      icon={Clock}
      title="Due for a catch-up"
      count={overdue.length}
      footer={
        overdue.length > SHOWN && (
          <More to="/people" onClick={() => setFilter({ ...EMPTY_PEOPLE_FILTER, overdueOnly: true })}>
            See all {overdue.length}
          </More>
        )
      }
    >
      {overdue.length === 0 ? (
        <Empty>Everyone is up to date.</Empty>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {overdue.slice(0, SHOWN).map((contact) => (
            <li key={contact.id}>
              <Link
                to={`/people/${contact.id}`}
                className="flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 transition-colors duration-150 hover:bg-control"
              >
                <Avatar name={contact.name} contactId={contact.id} size={24} />
                <span className="min-w-0 flex-1 truncate text-base">{contact.name}</span>
                <span className="shrink-0 text-sm text-muted">
                  {contact.days_overdue} {contact.days_overdue === 1 ? "day" : "days"} overdue
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ThisWeek() {
  const side = useSide();
  const day = useDayKey();
  const openForm = useUI((s) => s.openReminderForm);
  // Everything overdue, plus what is due in the next seven days. Keyed on the day so it rolls over.
  const dueBefore = weekAhead(new Date(`${day}T12:00:00`)).toISOString();
  const { data: reminders = [] } = useReminders({ side, dueBefore });

  return (
    <Card
      icon={Bell}
      title="Reminders this week"
      count={reminders.length}
      footer={
        reminders.length > SHOWN ? (
          <More to="/reminders">See all {reminders.length}</More>
        ) : reminders.length === 0 ? (
          <Button size="sm" onClick={() => openForm()}>
            <Plus size={13} strokeWidth={1.5} /> Add reminder
          </Button>
        ) : null
      }
    >
      {reminders.length === 0 ? (
        <Empty>Nothing due this week.</Empty>
      ) : (
        <ul className="flex flex-col">
          {reminders.slice(0, SHOWN).map((reminder) => (
            <li key={reminder.id}>
              <ReminderRow reminder={reminder} compact />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function when(daysUntil: number, date: string): string {
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  const [y, m, d] = date.split("-").map(Number);
  const on = new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${on} · in ${daysUntil} days`;
}

function Birthdays() {
  const side = useSide();
  const { data: birthdays = [] } = useUpcomingBirthdays(side);

  return (
    <Card icon={Cake} title="Upcoming birthdays" count={birthdays.length}>
      {birthdays.length === 0 ? (
        <Empty>No birthdays in the next month.</Empty>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {birthdays.slice(0, SHOWN).map(({ contact, date, days_until, turning }) => (
            <li key={contact.id}>
              <Link
                to={`/people/${contact.id}`}
                className="flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 transition-colors duration-150 hover:bg-control"
              >
                <Avatar name={contact.name} contactId={contact.id} size={24} />
                <span className="min-w-0 flex-1 truncate text-base">
                  {contact.name}
                  {turning != null && <span className="ml-2 text-sm text-subtle">turns {turning}</span>}
                </span>
                <span className={`shrink-0 text-sm ${days_until === 0 ? "font-medium text-fg" : "text-muted"}`}>
                  {when(days_until, date)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function OpenDeals() {
  const { data } = useOpenDeals();
  const count = data?.count ?? 0;
  const totals = (data?.totals ?? []).filter((t) => t.total > 0);

  return (
    <Card icon={Columns3} title="Open deals" footer={<More to="/pipeline">Open the pipeline</More>}>
      {count === 0 ? (
        <Empty>No open deals.</Empty>
      ) : (
        <div>
          <div className="text-xl font-semibold tracking-[-0.02em]">{count}</div>
          {totals.length > 0 && (
            <p className="mt-1 text-base text-muted">
              {totals
                .map((t) =>
                  t.total.toLocaleString(undefined, { style: "currency", currency: t.currency, maximumFractionDigits: 0 }),
                )
                .join(" · ")}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function YourPeople() {
  const navigate = useNavigate();
  const openForm = useUI((s) => s.openContactForm);
  const { data: count = 0 } = useContactCount("personal");

  return (
    <Card
      icon={Users}
      title="Your people"
      footer={
        count === 0 ? (
          <Button size="sm" variant="primary" onClick={() => openForm()}>
            <Plus size={13} strokeWidth={1.5} /> Add person
          </Button>
        ) : (
          <More to="/people">See everyone</More>
        )
      }
    >
      {count === 0 ? (
        <Empty>Nobody here yet. Add your first person.</Empty>
      ) : (
        <button onClick={() => navigate("/people")} className="text-left">
          <div className="text-xl font-semibold tracking-[-0.02em]">{count}</div>
          <p className="mt-1 text-base text-muted">{count === 1 ? "person" : "people"} you are keeping up with</p>
        </button>
      )}
    </Card>
  );
}

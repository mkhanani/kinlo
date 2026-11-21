import { Clock, Bell, Cake, Columns3 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSettings } from "@/app/settings";
import { Page, PageHeader } from "@/components/ui/Page";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function HomePage() {
  const { userName } = useSettings();
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <Page>
      <PageHeader title={userName ? `${greeting()}, ${userName}` : greeting()} subtitle={today} />
      <div className="grid grid-cols-2 gap-3">
        <Card icon={Clock} title="Due for a catch-up" empty="Everyone is up to date." />
        <Card icon={Bell} title="Reminders this week" empty="Nothing due this week." />
        <Card icon={Cake} title="Upcoming birthdays" empty="No birthdays in the next month." />
        <Card icon={Columns3} title="Open deals" empty="No open deals." />
      </div>
    </Page>
  );
}

function Card({ icon: Icon, title, empty }: { icon: LucideIcon; title: string; empty: string }) {
  return (
    <section className="glass min-h-[150px] p-5">
      <div className="mb-4 flex items-center gap-2 text-sm text-muted">
        <Icon size={15} strokeWidth={1.5} />
        <h2 className="text-sm font-medium tracking-normal">{title}</h2>
      </div>
      <p className="text-base text-subtle">{empty}</p>
    </section>
  );
}

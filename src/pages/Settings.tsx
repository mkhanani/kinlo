import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useSaveSetting, useSettings } from "@/app/settings";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Page, PageHeader } from "@/components/ui/Page";
import { Segmented } from "@/components/ui/Segmented";
import type { SidesChoice, ThemePref } from "@/data/settings";

export function SettingsPage() {
  const { theme, sides, userName } = useSettings();
  const save = useSaveSetting();
  const [name, setName] = useState(userName ?? "");
  useEffect(() => setName(userName ?? ""), [userName]);

  const themes: { value: ThemePref; label: string; icon: typeof Sun }[] = [
    { value: "system", label: "System", icon: Monitor },
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
  ];

  return (
    <Page>
      <PageHeader title="Settings" />
      <div className="glass divide-y divide-hairline">
        <Row label="Your name" hint="Used when kinlo greets you.">
          <Input
            aria-label="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() !== (userName ?? "") && save("userName", name.trim() || null)}
            placeholder="First name"
            className="!w-[220px]"
          />
        </Row>
        <Row
          label="Use kinlo for"
          hint="Personal keeps track of the people in your life. Business adds leads, clients and the pipeline."
        >
          <Segmented<SidesChoice>
            label="Use kinlo for"
            value={sides}
            onChange={(value) => save("sides", value)}
            options={[
              { value: "personal", label: "Personal" },
              { value: "business", label: "Business" },
              { value: "both", label: "Both" },
            ]}
          />
        </Row>
        <Row label="Theme" hint="Follows your system unless you pick one.">
          <div className="control flex p-0.5 hover:!bg-control">
            {themes.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => save("theme", value)}
                aria-pressed={theme === value}
                className={`flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 text-sm transition-colors duration-200 ${
                  theme === value ? "bg-active text-fg" : "text-muted hover:text-fg"
                }`}
              >
                <Icon size={14} strokeWidth={1.5} /> {label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Welcome setup" hint="Go through the first-run questions again. Your people and data are not touched.">
          <Button onClick={() => save("onboarded", false)}>Run again</Button>
        </Row>
      </div>
    </Page>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="min-w-0">
        <div className="text-base font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-sm text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

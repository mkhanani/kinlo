import type { ReactNode } from "react";
import { Monitor, Sun, Moon } from "lucide-react";
import { Page, PageHeader } from "@/components/ui/Page";
import { useSaveSetting, useSettings } from "@/app/settings";
import type { ThemePref } from "@/data/settings";

export function SettingsPage() {
  const { theme, pipelineEnabled } = useSettings();
  const save = useSaveSetting();
  const options: { value: ThemePref; label: string; icon: typeof Sun }[] = [
    { value: "system", label: "System", icon: Monitor },
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
  ];

  return (
    <Page>
      <PageHeader title="Settings" />
      <div className="glass divide-y divide-hairline">
        <Row label="Theme" hint="Follows your system unless you pick one.">
          <div className="control flex p-0.5">
            {options.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => save("theme", value)}
                className={`flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 text-sm transition-colors duration-200 ${
                  theme === value ? "bg-active text-fg" : "text-muted hover:text-fg"
                }`}
              >
                <Icon size={14} strokeWidth={1.5} /> {label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Pipeline" hint="Turn off if you only use kinlo for the people in your life.">
          <Switch checked={pipelineEnabled} onChange={(on) => save("pipelineEnabled", on)} label="Show pipeline" />
        </Row>
      </div>
    </Page>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div>
        <div className="text-base font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-sm text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full border border-hairline transition-colors duration-200 ${
        checked ? "bg-fg" : "bg-control"
      }`}
    >
      <span
        className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-[left,background-color] duration-200 ease-out ${
          checked ? "left-[18px] bg-bg" : "left-0.5 bg-muted"
        }`}
      />
    </button>
  );
}

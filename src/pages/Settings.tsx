import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useLocation } from "react-router-dom";
import { getOpenAtLogin, notifyNow, quitApp, setOpenAtLogin } from "@/app/notifications";
import { useSaveSetting, useSettings } from "@/app/settings";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Page, PageHeader } from "@/components/ui/Page";
import { Segmented } from "@/components/ui/Segmented";
import { SettingRow as Row } from "@/components/ui/SettingRow";
import { Switch } from "@/components/ui/Switch";
import type { SidesChoice, ThemePref } from "@/data/settings";
import { AssistantSettings } from "@/features/assistant/AssistantSettings";
import { isTauri } from "@/lib/platform";

export function SettingsPage() {
  const { theme, sides, userName, defaultCurrency } = useSettings();
  const save = useSaveSetting();
  const [name, setName] = useState(userName ?? "");
  useEffect(() => setName(userName ?? ""), [userName]);
  const [currency, setCurrency] = useState(defaultCurrency);
  useEffect(() => setCurrency(defaultCurrency), [defaultCurrency]);

  // "Connect a model" in the assistant panel lands here, at the right section.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [hash]);

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
        {sides !== "personal" && (
          <Row label="Currency" hint="What new deals are valued in. Each deal can still use its own.">
            <Input
              aria-label="Currency"
              value={currency}
              maxLength={3}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              onBlur={() => {
                if (/^[A-Z]{3}$/.test(currency)) save("defaultCurrency", currency);
                else setCurrency(defaultCurrency);
              }}
              className="!w-[76px] text-center"
            />
          </Row>
        )}
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

      <AssistantSettings />

      {isTauri && <NotificationSettings />}
    </Page>
  );
}

/** Reminders can only notify while kinlo is running, so these three settings go together. */
function NotificationSettings() {
  const { notifications, runInBackground } = useSettings();
  const save = useSaveSetting();
  const [openAtLogin, setOpenAtLoginState] = useState(false);
  const [tested, setTested] = useState<"sent" | "blocked" | null>(null);

  useEffect(() => {
    void getOpenAtLogin().then(setOpenAtLoginState).catch(() => {});
  }, []);

  const toggleLogin = (enabled: boolean) => {
    setOpenAtLoginState(enabled);
    setOpenAtLogin(enabled).catch(() => setOpenAtLoginState(!enabled));
  };

  const test = async () => {
    const shown = await notifyNow("This is how a reminder looks", "Sent from kinlo's settings.").catch(() => false);
    setTested(shown ? "sent" : "blocked");
  };

  return (
    <>
      <h2 className="mb-2 mt-8 px-1 text-sm font-medium tracking-normal text-muted">Reminders</h2>
      <div className="glass divide-y divide-hairline">
        <Row
          label="Notifications"
          hint={
            tested === "blocked"
              ? "Your system is blocking notifications from kinlo. Allow them in your system settings."
              : tested === "sent"
                ? "Sent. If nothing appeared, check that notifications are allowed for kinlo in your system settings."
                : "Show a notification on this computer when a reminder is due."
          }
        >
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={() => void test()}>
              Send a test
            </Button>
            <Switch label="Notifications" checked={notifications} onChange={(on) => save("notifications", on)} />
          </div>
        </Row>
        <Row
          label="Keep running in the background"
          hint="Closing the window keeps kinlo in the system tray, so reminders can still reach you. Open kinlo again to bring the window back."
        >
          <Switch
            label="Keep running in the background"
            checked={runInBackground}
            onChange={(on) => save("runInBackground", on)}
          />
        </Row>
        <Row label="Open at login" hint="Start kinlo quietly in the tray when you sign in to this computer.">
          <Switch label="Open at login" checked={openAtLogin} onChange={toggleLogin} />
        </Row>
        <Row label="Quit kinlo" hint="Stops kinlo completely. Reminders will not notify you until you open it again.">
          <Button onClick={() => void quitApp()}>Quit</Button>
        </Row>
      </div>
    </>
  );
}

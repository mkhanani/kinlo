import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { listReminders, saveSetting } from "@/data";
import { keys, useDayKey } from "@/data/hooks";
import type { ReminderWithContact } from "@/data/types";
import { isTauri } from "@/lib/platform";
import { useSettings } from "./settings";

/** What the Rust side needs to show one notification at the right time. */
export interface ScheduledNotification {
  id: string;
  title: string;
  body: string;
  /** Milliseconds since 1970. */
  at_ms: number;
}

/** No point handing over thousands: the list is refreshed every time reminders change. */
const MAX_SCHEDULED = 200;

function bodyFor(reminder: ReminderWithContact): string {
  const side = reminder.side === "business" ? "Business" : "Personal";
  return reminder.contact_name ? `${reminder.contact_name} · ${side}` : side;
}

/** Open reminders that are still to come, soonest first, as notifications to schedule. */
export function buildSchedule(reminders: ReminderWithContact[], now: number = Date.now()): ScheduledNotification[] {
  return reminders
    .filter((r) => !r.done_at && Date.parse(r.due_at) > now)
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at))
    .slice(0, MAX_SCHEDULED)
    .map((r) => ({ id: r.id, title: r.title, body: bodyFor(r), at_ms: Date.parse(r.due_at) }));
}

/**
 * Reminders that came due while the app was not running: after the last moment it was
 * watching and up to now. Returns one summary to show, or null when nothing was missed.
 */
export function missedSummary(
  reminders: ReminderWithContact[],
  watchedThrough: string | null,
  now: number = Date.now(),
): { title: string; body: string } | null {
  if (!watchedThrough) return null;
  const since = Date.parse(watchedThrough);
  const missed = reminders.filter((r) => {
    const due = Date.parse(r.due_at);
    return !r.done_at && due > since && due <= now;
  });
  if (missed.length === 0) return null;
  if (missed.length === 1) return { title: missed[0]!.title, body: `Came due while kinlo was closed · ${bodyFor(missed[0]!)}` };
  const names = missed.slice(0, 3).map((r) => r.title).join(", ");
  return {
    title: `${missed.length} reminders came due while kinlo was closed`,
    body: missed.length > 3 ? `${names}, and more` : names,
  };
}

async function invoke(command: string, args?: Record<string, unknown>): Promise<void> {
  const { invoke: call } = await import("@tauri-apps/api/core");
  await call(command, args);
}

/** Shows a notification right now. Asks the system for permission first if it is needed. */
export async function notifyNow(title: string, body: string): Promise<boolean> {
  if (!isTauri) return false;
  if (!(await ensurePermission())) return false;
  await invoke("notify_now", { title, body });
  return true;
}

/** macOS asks the user once. Windows and Linux allow notifications without asking. */
export async function ensurePermission(): Promise<boolean> {
  if (!isTauri) return false;
  const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
  if (await isPermissionGranted()) return true;
  return (await requestPermission()) === "granted";
}

/**
 * Keeps the system's notifications in step with the reminders, for both sides whatever
 * is on screen. Runs for as long as the app does, including while its window is hidden.
 */
export function useReminderNotifications() {
  const { notifications, notifiedThrough } = useSettings();
  const day = useDayKey();
  const { data: reminders } = useQuery({
    queryKey: [...keys.reminders, "to-notify", day],
    queryFn: () => listReminders({ status: "open" }),
    enabled: isTauri,
  });
  // The value from before this run started: what the app last saw before it was closed.
  const watchedThrough = useRef(notifiedThrough);
  const checkedMissed = useRef(false);

  useEffect(() => {
    if (!isTauri || !reminders) return;
    void (async () => {
      const allowed = notifications && (await ensurePermission());
      await invoke("schedule_notifications", { items: allowed ? buildSchedule(reminders) : [] });

      if (!checkedMissed.current) {
        checkedMissed.current = true;
        const missed = allowed ? missedSummary(reminders, watchedThrough.current) : null;
        if (missed) await invoke("notify_now", missed);
      }
      await saveSetting("notifiedThrough", new Date().toISOString());
    })().catch((error: unknown) => console.error("Could not schedule notifications", error));
  }, [reminders, notifications]);

  // Note the time regularly, so "while kinlo was closed" starts from when it really closed.
  useEffect(() => {
    if (!isTauri) return;
    const timer = setInterval(() => void saveSetting("notifiedThrough", new Date().toISOString()), 60_000);
    return () => clearInterval(timer);
  }, []);
}

/** Tells the Rust side whether closing the window should hide it or quit. */
export function useBackgroundSetting() {
  const { runInBackground } = useSettings();
  useEffect(() => {
    if (!isTauri) return;
    void invoke("set_run_in_background", { enabled: runInBackground }).catch(() => {});
  }, [runInBackground]);
}

export const quitApp = () => invoke("quit_app");

/** Whether the system starts kinlo at login, and a way to change it. */
export async function getOpenAtLogin(): Promise<boolean> {
  if (!isTauri) return false;
  const { isEnabled } = await import("@tauri-apps/plugin-autostart");
  return isEnabled();
}

export async function setOpenAtLogin(enabled: boolean): Promise<void> {
  if (!isTauri) return;
  const { enable, disable } = await import("@tauri-apps/plugin-autostart");
  await (enabled ? enable() : disable());
}

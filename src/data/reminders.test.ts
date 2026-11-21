import { describe, expect, it } from "vitest";
import {
  completeReminder,
  createContact,
  createReminder,
  listReminders,
  nextDue,
  reopenReminder,
  updateReminder,
} from "./index";
import { daysAgo, NOW, useTestDatabase } from "./testing";

useTestDatabase();

describe("reminders", () => {
  it("lists open reminders by due date, with the person's name", async () => {
    const ana = await createContact({ name: "Ana" });
    await createReminder({ title: "Later", due_at: daysAgo(-5) });
    await createReminder({ title: "Call Ana", due_at: daysAgo(1), contact_id: ana.id });

    const list = await listReminders();
    expect(list.map((r) => [r.title, r.contact_name])).toEqual([
      ["Call Ana", "Ana"],
      ["Later", null],
    ]);
    expect(await listReminders({ dueBefore: NOW })).toHaveLength(1);
    expect(await listReminders({ contactId: ana.id })).toHaveLength(1);
  });

  it("completing a one-off reminder closes it, and it can be reopened", async () => {
    const r = await createReminder({ title: "Send card", due_at: daysAgo(1) });
    const done = await completeReminder(r.id, NOW);
    expect(done!.done_at).toBe(NOW);
    expect(await listReminders()).toEqual([]);
    expect(await listReminders({ status: "done" })).toHaveLength(1);

    await reopenReminder(r.id);
    expect(await listReminders()).toHaveLength(1);
  });

  it("completing a repeating reminder moves it to the next time instead of closing it", async () => {
    const r = await createReminder({ title: "Check in", due_at: "2026-06-01T09:00:00.000Z", repeat_rule: "weekly" });
    const next = await completeReminder(r.id, NOW);
    expect(next!.done_at).toBeNull();
    // First weekly step after 15 June.
    expect(next!.due_at).toBe("2026-06-22T09:00:00.000Z");
  });

  it("needs a title", async () => {
    await expect(createReminder({ title: " ", due_at: NOW })).rejects.toThrow("needs a title");
    const r = await createReminder({ title: "Ok", due_at: NOW });
    await expect(updateReminder(r.id, { title: "" })).rejects.toThrow("needs a title");
  });

  it("rejects a repeat rule the schema does not know", async () => {
    await expect(createReminder({ title: "x", due_at: NOW, repeat_rule: "hourly" as never })).rejects.toThrow();
  });
});

describe("nextDue", () => {
  const after = "2026-01-01T00:00:00.000Z";

  it("steps by day, week, month and year", () => {
    const due = "2026-03-10T08:30:00.000Z";
    expect(nextDue(due, "daily", due)).toBe("2026-03-11T08:30:00.000Z");
    expect(nextDue(due, "weekly", due)).toBe("2026-03-17T08:30:00.000Z");
    expect(nextDue(due, "monthly", due)).toBe("2026-04-10T08:30:00.000Z");
    expect(nextDue(due, "yearly", due)).toBe("2027-03-10T08:30:00.000Z");
  });

  it("skips past occurrences that were missed", () => {
    expect(nextDue("2026-01-05T09:00:00.000Z", "weekly", "2026-02-01T00:00:00.000Z")).toBe("2026-02-02T09:00:00.000Z");
  });

  it("uses the last day of shorter months without drifting", () => {
    expect(nextDue("2026-01-31T09:00:00.000Z", "monthly", after)).toBe("2026-02-28T09:00:00.000Z");
    // Counted from the original day, so March is the 31st again, not the 28th.
    expect(nextDue("2026-01-31T09:00:00.000Z", "monthly", "2026-03-01T00:00:00.000Z")).toBe("2026-03-31T09:00:00.000Z");
  });

  it("handles a 29 February birthday reminder", () => {
    expect(nextDue("2024-02-29T09:00:00.000Z", "yearly", "2024-03-01T00:00:00.000Z")).toBe("2025-02-28T09:00:00.000Z");
    expect(nextDue("2024-02-29T09:00:00.000Z", "yearly", "2027-03-01T00:00:00.000Z")).toBe("2028-02-29T09:00:00.000Z");
  });
});

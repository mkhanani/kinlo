import { describe, expect, it } from "vitest";
import type { ReminderWithContact } from "@/data/types";
import { buildSchedule, missedSummary } from "./notifications";

const NOW = Date.parse("2026-06-17T12:00:00.000Z");
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

function reminder(patch: Partial<ReminderWithContact> & { id: string; due_at: string }): ReminderWithContact {
  return {
    title: patch.id,
    contact_id: null,
    contact_name: null,
    repeat_rule: null,
    side: "personal",
    snoozed_from: null,
    done_at: null,
    created_at: at(-10_000),
    ...patch,
  };
}

describe("what gets scheduled", () => {
  it("is every open reminder still to come, soonest first", () => {
    const schedule = buildSchedule(
      [
        reminder({ id: "later", due_at: at(120) }),
        reminder({ id: "soon", due_at: at(5) }),
        reminder({ id: "past", due_at: at(-5) }),
        reminder({ id: "done", due_at: at(30), done_at: at(-1) }),
      ],
      NOW,
    );
    expect(schedule.map((s) => s.id)).toEqual(["soon", "later"]);
    expect(schedule[0]!.at_ms).toBe(NOW + 5 * 60_000);
  });

  it("says who it is about and which side it belongs to", () => {
    const [personal, business] = buildSchedule(
      [
        reminder({ id: "a", title: "Call Ana", due_at: at(1), contact_name: "Ana Lima" }),
        reminder({ id: "b", title: "Send invoice", due_at: at(2), side: "business" }),
      ],
      NOW,
    );
    expect(personal).toMatchObject({ title: "Call Ana", body: "Ana Lima · Personal" });
    expect(business).toMatchObject({ title: "Send invoice", body: "Business" });
  });

  it("covers both sides, whichever is on screen", () => {
    const schedule = buildSchedule(
      [reminder({ id: "p", due_at: at(1), side: "personal" }), reminder({ id: "b", due_at: at(2), side: "business" })],
      NOW,
    );
    expect(schedule).toHaveLength(2);
  });
});

describe("what came due while the app was closed", () => {
  const closedAt = at(-180);

  it("is nothing on the very first run", () => {
    expect(missedSummary([reminder({ id: "a", due_at: at(-60) })], null, NOW)).toBeNull();
  });

  it("names a single missed reminder", () => {
    const summary = missedSummary([reminder({ id: "a", title: "Call the bank", due_at: at(-60) })], closedAt, NOW);
    expect(summary).toEqual({ title: "Call the bank", body: "Came due while kinlo was closed · Personal" });
  });

  it("sums up several in one notification", () => {
    const summary = missedSummary(
      ["a", "b", "c", "d"].map((id, i) => reminder({ id, title: `Thing ${id}`, due_at: at(-60 - i) })),
      closedAt,
      NOW,
    );
    expect(summary).toEqual({
      title: "4 reminders came due while kinlo was closed",
      body: "Thing a, Thing b, Thing c, and more",
    });
  });

  it("leaves out what was already due before it closed, what is done, and what is still to come", () => {
    const summary = missedSummary(
      [
        reminder({ id: "old", due_at: at(-600) }), // already shown before the app closed
        reminder({ id: "done", due_at: at(-60), done_at: at(-30) }),
        reminder({ id: "future", due_at: at(60) }),
      ],
      closedAt,
      NOW,
    );
    expect(summary).toBeNull();
  });
});

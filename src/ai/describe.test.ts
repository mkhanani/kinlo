import { describe, expect, it } from "vitest";
import * as data from "@/data";
import { useTestDatabase } from "@/data/testing";
import { describeAction, describeLookup } from "./describe";

useTestDatabase();

const personal = { side: "personal" as const, currency: "USD" };
const business = { side: "business" as const, currency: "EUR" };
const row = (card: Awaited<ReturnType<typeof describeAction>>, label: string) =>
  card.rows.find((r) => r.label === label)?.value;

describe("change cards", () => {
  it("describes a new person with only what was given", async () => {
    const card = await describeAction(
      "create_contact",
      { name: "Sam Rivera", company: "Larkspur", keep_in_touch_days: 30, tags: ["design", "conference"] },
      personal,
    );
    expect(card.title).toBe("Add Sam Rivera");
    expect(card.rows.map((r) => r.label)).toEqual(["Company", "Keep in touch", "Tags"]);
    expect(row(card, "Keep in touch")).toBe("Every 30 days");
    expect(row(card, "Tags")).toBe("design, conference");
    expect(card.problem).toBeNull();
  });

  it("says what a new business contact will be", async () => {
    expect(row(await describeAction("create_contact", { name: "Priya" }, business), "As")).toBe("Lead");
    expect(row(await describeAction("create_contact", { name: "Priya", kind: "client" }, business), "As")).toBe("Client");
  });

  it("names the person a change is about, never their id", async () => {
    const zoe = await data.createContact({ name: "Zoë Nakamura" });
    const card = await describeAction(
      "log_interaction",
      { contact_id: zoe.id, type: "meeting", summary: "Lunch", happened_at: "2026-03-04T12:30" },
      personal,
    );
    expect(card.title).toBe("Log a meeting with Zoë Nakamura");
    expect(row(card, "Summary")).toBe("Lunch");
    expect(row(card, "When")).toContain("2026");
    expect(JSON.stringify(card)).not.toContain(zoe.id);
  });

  it("flags a person it cannot find, or who is on the other side", async () => {
    const client = await data.createContact({ name: "Work Only", personal: false, business: "client" });
    for (const id of ["made-up", client.id]) {
      const card = await describeAction("update_contact", { contact_id: id, company: "New Co" }, personal);
      expect(card.problem).toMatch(/could not find this person/);
      expect(card.title).toBe("Update a person");
    }
  });

  it("describes a reminder with or without a person", async () => {
    const plain = await describeAction("create_reminder", { title: "Renew passport", due_at: "2030-05-01T09:00", repeat: "yearly" }, personal);
    expect(plain.title).toBe("Remind you: Renew passport");
    expect(row(plain, "Repeats")).toBe("Every year");
    expect(row(plain, "About")).toBeUndefined();
    expect(plain.problem).toBeNull();

    const lost = await describeAction("create_reminder", { title: "Call", due_at: "2030-05-01T09:00", contact_id: "nope" }, personal);
    expect(lost.problem).not.toBeNull();
  });

  it("describes deals in the user's currency and warns when a move closes one", async () => {
    const zoe = await data.createContact({ name: "Zoë", personal: false, business: "client" });
    const created = await describeAction("create_deal", { contact_id: zoe.id, title: "Rebrand", value: 5000 }, business);
    expect(created.title).toBe("Add a deal: Rebrand");
    expect(row(created, "With")).toBe("Zoë");
    expect(row(created, "Value")).toMatch(/5,000/);
    expect(row(created, "Value")).toMatch(/€|EUR/);
    expect(row(created, "Stage")).toBe("Lead");

    const deal = await data.createDeal({ contact_id: zoe.id, title: "Rebrand", stage_id: "stage-proposal" });
    const won = await describeAction("move_deal", { deal_id: deal.id, stage: "won" }, business);
    expect(won.title).toBe("Move Rebrand to Won");
    expect(row(won, "From")).toBe("Proposal");
    expect(row(won, "Note")).toBe("This closes the deal.");

    const nowhere = await describeAction("move_deal", { deal_id: deal.id, stage: "Limbo" }, business);
    expect(nowhere.problem).toBe('There is no stage called "Limbo".');
    expect((await describeAction("move_deal", { deal_id: "x", stage: "Won" }, business)).problem).toMatch(/could not find this deal/);
  });
});

describe("lookups", () => {
  it("are described in a few plain words", () => {
    expect(describeLookup("search_contacts", { query: "Ana" })).toBe('Searched your people for "Ana"');
    expect(describeLookup("list_overdue_contacts", {})).toBe("Checked who is due for a catch-up");
    expect(describeLookup("something_new", {})).toBe("Looked something up");
  });
});

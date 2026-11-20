import { describe, expect, it } from "vitest";
import {
  archiveContact,
  countOpenDeals,
  createContact,
  createDeal,
  getDeal,
  listDeals,
  listStages,
  moveDeal,
  positionBetween,
  updateDeal,
} from "./index";
import { useTestDatabase } from "./testing";

useTestDatabase();

describe("stages", () => {
  it("are seeded: Lead, Talking, Proposal, Won, Lost", async () => {
    const stages = await listStages();
    expect(stages.map((s) => s.name)).toEqual(["Lead", "Talking", "Proposal", "Won", "Lost"]);
    expect(stages.map((s) => s.outcome)).toEqual([null, null, null, "won", "lost"]);
  });
});

describe("deals", () => {
  it("start in the first stage, at the bottom", async () => {
    const ana = await createContact({ name: "Ana" });
    const a = await createDeal({ contact_id: ana.id, title: "Website", value: 4800, currency: "eur" });
    const b = await createDeal({ contact_id: ana.id, title: "Retainer" });

    expect(a).toMatchObject({ stage_id: "stage-lead", value: 4800, currency: "EUR", closed_at: null });
    expect(b.position).toBeGreaterThan(a.position);
    expect((await listDeals()).map((d) => [d.title, d.contact_name])).toEqual([
      ["Website", "Ana"],
      ["Retainer", "Ana"],
    ]);
  });

  it("moving to Won or Lost closes the deal, and moving back reopens it", async () => {
    const ana = await createContact({ name: "Ana" });
    const deal = await createDeal({ contact_id: ana.id, title: "Website" });
    expect(await countOpenDeals()).toBe(1);

    await moveDeal(deal.id, "stage-won", 1);
    const won = await getDeal(deal.id);
    expect(won!.closed_at).not.toBeNull();
    expect(await countOpenDeals()).toBe(0);
    expect(await listDeals({ open: false })).toHaveLength(1);

    // Won to Lost keeps the original closing time.
    await moveDeal(deal.id, "stage-lost", 1);
    expect((await getDeal(deal.id))!.closed_at).toBe(won!.closed_at);

    await moveDeal(deal.id, "stage-talking", 1);
    expect((await getDeal(deal.id))!.closed_at).toBeNull();
    expect(await countOpenDeals()).toBe(1);
  });

  it("a deal created straight into Won is closed", async () => {
    const ana = await createContact({ name: "Ana" });
    const deal = await createDeal({ contact_id: ana.id, title: "Done already", stage_id: "stage-won" });
    expect(deal.closed_at).not.toBeNull();
  });

  it("reorders inside a stage by position", async () => {
    const ana = await createContact({ name: "Ana" });
    const a = await createDeal({ contact_id: ana.id, title: "A" });
    const b = await createDeal({ contact_id: ana.id, title: "B" });
    const c = await createDeal({ contact_id: ana.id, title: "C" });

    await moveDeal(c.id, "stage-lead", positionBetween(a.position, b.position));
    expect((await listDeals({ stageId: "stage-lead" })).map((d) => d.title)).toEqual(["A", "C", "B"]);

    await moveDeal(b.id, "stage-lead", positionBetween(null, a.position));
    expect((await listDeals({ stageId: "stage-lead" })).map((d) => d.title)).toEqual(["B", "A", "C"]);
  });

  it("rejects a stage or contact that does not exist, and bad values", async () => {
    const ana = await createContact({ name: "Ana" });
    await expect(createDeal({ contact_id: ana.id, title: "x", stage_id: "nope" })).rejects.toThrow("stage");
    await expect(createDeal({ contact_id: "nobody", title: "x" })).rejects.toThrow();
    const deal = await createDeal({ contact_id: ana.id, title: "x" });
    await expect(moveDeal(deal.id, "nope", 1)).rejects.toThrow();
    await expect(updateDeal(deal.id, { value: -5 })).rejects.toThrow();
    await expect(updateDeal(deal.id, { title: " " })).rejects.toThrow("needs a title");
  });

  it("hides deals of archived people from the board and the open count", async () => {
    const ana = await createContact({ name: "Ana" });
    await createDeal({ contact_id: ana.id, title: "Website" });
    await archiveContact(ana.id);
    expect(await listDeals()).toEqual([]);
    expect(await countOpenDeals()).toBe(0);
  });
});

describe("positionBetween", () => {
  it("handles empty columns, the top, the bottom and the middle", () => {
    expect(positionBetween(null, null)).toBe(1);
    expect(positionBetween(null, 4)).toBe(3);
    expect(positionBetween(4, null)).toBe(5);
    expect(positionBetween(2, 3)).toBe(2.5);
  });
});

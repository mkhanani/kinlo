import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import {
  createContact,
  createDeal,
  getDeal,
  listDeals,
  listStages,
  moveDeal,
  moveDealToStage,
  positionBetween,
  renumberStage,
} from "@/data";
import { useTestDatabase } from "@/data/testing";
import type { DealWithContact } from "@/data/types";
import { renderApp } from "@/test/render";
import { columnTotals, findStage, formatMoney, MIN_GAP, moveOnBoard, positionAt, toBoard } from "./board";
import { parseAmount } from "./DealFormDialog";

useTestDatabase();

const type = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } });

async function pickFromMenu(trigger: HTMLElement, item: string | RegExp) {
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: item }));
}

/** A client with three deals in Lead, in the order A, B, C. */
async function seed() {
  const carla = await createContact({ name: "Carla Client", business: "client" });
  const a = await createDeal({ contact_id: carla.id, title: "A", value: 1000 });
  const b = await createDeal({ contact_id: carla.id, title: "B", value: 2500 });
  const c = await createDeal({ contact_id: carla.id, title: "C" });
  return { carla, a, b, c };
}

const titles = (deals: DealWithContact[]) => deals.map((d) => d.title);

describe("the board, as plain data", () => {
  it("groups deals by stage in order, with every stage present", async () => {
    await seed();
    const board = toBoard(await listStages(), await listDeals());
    expect(Object.keys(board)).toEqual(["stage-lead", "stage-talking", "stage-proposal", "stage-won", "stage-lost"]);
    expect(titles(board["stage-lead"]!)).toEqual(["A", "B", "C"]);
    expect(board["stage-won"]).toEqual([]);
  });

  it("moves a deal within a column and across columns", async () => {
    const { a, c } = await seed();
    let board = toBoard(await listStages(), await listDeals());

    board = moveOnBoard(board, c.id, "stage-lead", 0);
    expect(titles(board["stage-lead"]!)).toEqual(["C", "A", "B"]);

    board = moveOnBoard(board, a.id, "stage-talking", 0);
    expect(titles(board["stage-lead"]!)).toEqual(["C", "B"]);
    expect(titles(board["stage-talking"]!)).toEqual(["A"]);
    expect(findStage(board, a.id)).toBe("stage-talking");

    // An index past the end lands at the bottom rather than failing.
    board = moveOnBoard(board, c.id, "stage-talking", 99);
    expect(titles(board["stage-talking"]!)).toEqual(["A", "C"]);
  });

  it("works out a position from the neighbours, at the top, the bottom and in between", () => {
    const col = [1, 2, 3].map((position, i) => ({ id: String(i), position }) as DealWithContact);
    expect(positionAt(col, 0).position).toBe(1); // top: just above the deal now below it (2)
    expect(positionAt(col, 2).position).toBe(3); // bottom: just below the deal now above it (2)
    expect(positionAt(col, 1)).toEqual({ position: 2, needsRenumber: false });
    expect(positionAt([{ position: 5 } as DealWithContact], 0).position).toBe(1); // alone in a column
  });

  it("asks for a renumber when the gap is nearly used up", () => {
    const tight = [1, 0, 1 + MIN_GAP].map((position) => ({ position }) as DealWithContact);
    expect(positionAt(tight, 1).needsRenumber).toBe(true);
  });

  it("adds up a column per currency and formats money", () => {
    const deals = [
      { value: 1000, currency: "USD" },
      { value: 2500, currency: "USD" },
      { value: 900, currency: "EUR" },
      { value: null, currency: "USD" },
    ] as DealWithContact[];
    expect(columnTotals(deals)).toEqual([
      { currency: "USD", total: 3500 },
      { currency: "EUR", total: 900 },
    ]);
    expect(formatMoney(4800, "USD")).toMatch(/4,800/);
    expect(formatMoney(1_250_000, "USD", true)).toMatch(/1\.25M/);
    expect(formatMoney(99_000, "USD", true)).toMatch(/99,000/); // not shortened until six figures
    expect(formatMoney(10, "ZZZZ")).toBe("10 ZZZZ"); // a currency code the system does not know
  });

  it("reads amounts the way people type them", () => {
    expect(parseAmount("4,800")).toBe(4800);
    expect(parseAmount(" 4 800.50 ")).toBe(4800.5);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("lots")).toBeUndefined();
    expect(parseAmount("-5")).toBeUndefined();
  });
});

describe("saving where a deal was dropped", () => {
  it("keeps the order after dropping between two deals", async () => {
    const { a, b, c } = await seed();
    await moveDeal(c.id, "stage-lead", positionBetween(a.position, b.position));
    expect(titles(await listDeals({ stageId: "stage-lead" }))).toEqual(["A", "C", "B"]);
  });

  it("moving to another stage from the menu goes to the bottom and closes when won", async () => {
    const { carla, a } = await seed();
    await createDeal({ contact_id: carla.id, title: "Already won", stage_id: "stage-won" });
    await moveDealToStage(a.id, "stage-won");
    expect(titles(await listDeals({ stageId: "stage-won" }))).toEqual(["Already won", "A"]);
    expect((await getDeal(a.id))!.closed_at).not.toBeNull();
  });

  it("renumbering keeps the order and spreads the positions out again", async () => {
    const { a, b, c } = await seed();
    // Squeeze C and then B into ever smaller gaps.
    await moveDeal(c.id, "stage-lead", a.position + 1e-9);
    await moveDeal(b.id, "stage-lead", a.position + 5e-10);
    expect(titles(await listDeals({ stageId: "stage-lead" }))).toEqual(["A", "B", "C"]);

    await renumberStage("stage-lead");
    const after = await listDeals({ stageId: "stage-lead" });
    expect(titles(after)).toEqual(["A", "B", "C"]);
    expect(after.map((d) => d.position)).toEqual([1, 2, 3]);
  });
});

describe("Pipeline screen", () => {
  it("asks for a business contact first when there are none", async () => {
    renderApp("/pipeline", { activeSide: "business" });
    expect(await screen.findByText(/A deal is always with someone/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add deal/ })).toBeDisabled();
  });

  it("has one clear action when there are contacts but no deals", async () => {
    await createContact({ name: "Carla Client", business: "client" });
    renderApp("/pipeline", { activeSide: "business" });
    expect(await screen.findByText(/No deals yet/)).toBeInTheDocument();
  });

  it("shows a column per stage with its deals, count and total", async () => {
    const { carla } = await seed();
    await createDeal({ contact_id: carla.id, title: "Signed", stage_id: "stage-won", value: 9000 });
    renderApp("/pipeline", { activeSide: "business" });

    const lead = await screen.findByRole("region", { name: "Lead" });
    expect(within(lead).getAllByRole("listitem").map((li) => within(li).getByRole("button", { name: /^[ABC]$/ }).textContent)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(within(lead).getByText(/3,500/)).toBeInTheDocument();
    expect(within(lead).getAllByRole("link", { name: "Carla Client" })).toHaveLength(3);

    const won = screen.getByRole("region", { name: "Won" });
    expect(within(won).getByText("Signed")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Lost" })).getByText(/when it is lost/)).toBeInTheDocument();
    expect(screen.getByText("3 open deals")).toBeInTheDocument();
  });

  it("adds a deal from the dialog, into the stage whose plus was pressed", async () => {
    const { carla } = await seed();
    await createContact({ name: "Personal Pat" });
    renderApp("/pipeline", { activeSide: "business" });
    fireEvent.click(await screen.findByRole("button", { name: "Add a deal in Proposal" }));

    const dialog = await screen.findByRole("dialog", { name: "Add deal" });
    expect(within(dialog).getByLabelText("Stage")).toHaveValue("stage-proposal");

    fireEvent.click(within(dialog).getByRole("button", { name: "Add deal" }));
    expect(await within(dialog).findByText("Give the deal a name.")).toBeInTheDocument();
    expect(within(dialog).getByText("Choose who the deal is with.")).toBeInTheDocument();

    type(within(dialog).getByLabelText("Deal"), "Brand refresh");
    const withField = within(dialog).getByLabelText("With");
    fireEvent.focus(withField);
    // Only business contacts are offered.
    fireEvent.mouseDown(await within(dialog).findByRole("option", { name: /Carla Client/ }));
    expect(within(dialog).queryByRole("option", { name: /Personal Pat/ })).not.toBeInTheDocument();

    type(within(dialog).getByLabelText("Value"), "nonsense");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add deal" }));
    expect(await within(dialog).findByText(/Enter an amount/)).toBeInTheDocument();

    type(within(dialog).getByLabelText("Value"), "12,500");
    type(within(dialog).getByLabelText("Currency"), "eur");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add deal" }));

    const proposal = await screen.findByRole("region", { name: "Proposal" });
    expect(await within(proposal).findByText("Brand refresh")).toBeInTheDocument();
    const saved = (await listDeals({ stageId: "stage-proposal" }))[0]!;
    expect(saved).toMatchObject({ title: "Brand refresh", value: 12500, currency: "EUR", contact_id: carla.id });
  });

  it("moves a deal from its menu, and the open count follows", async () => {
    await seed();
    renderApp("/pipeline", { activeSide: "business" });
    await screen.findByText("3 open deals");

    await pickFromMenu(screen.getByRole("button", { name: "Options for B" }), "Won");
    const won = screen.getByRole("region", { name: "Won" });
    expect(await within(won).findByText("B")).toBeInTheDocument();
    expect(await screen.findByText("2 open deals")).toBeInTheDocument();
    expect(titles(await listDeals({ stageId: "stage-lead" }))).toEqual(["A", "C"]);
  });

  it("edits a deal, including its stage, and deletes one after asking", async () => {
    const { a } = await seed();
    renderApp("/pipeline", { activeSide: "business" });

    fireEvent.click(await screen.findByRole("button", { name: "A" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit deal" });
    expect(within(dialog).getByLabelText("Value")).toHaveValue("1000");
    type(within(dialog).getByLabelText("Deal"), "A, renamed");
    fireEvent.change(within(dialog).getByLabelText("Stage"), { target: { value: "stage-talking" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    // The page behind the dialog is reachable again once the dialog has closed.
    const talking = await screen.findByRole("region", { name: "Talking" });
    expect(await within(talking).findByText("A, renamed")).toBeInTheDocument();
    expect(await getDeal(a.id)).toMatchObject({ title: "A, renamed", stage_id: "stage-talking" });

    await pickFromMenu(await screen.findByRole("button", { name: "Options for C" }), "Delete");
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Delete this deal?" })).getByRole("button", { name: "Delete" }));
    await waitFor(async () => expect(titles(await listDeals())).toEqual(["B", "A, renamed"]));
  });
});

describe("Deals elsewhere", () => {
  it("a business contact's page lists their deals and can add one for them", async () => {
    const { carla } = await seed();
    renderApp(`/people/${carla.id}`, { activeSide: "business" });

    const card = await screen.findByRole("region", { name: "Deals" });
    expect(await within(card).findByText("B")).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Add deal" }));
    const dialog = await screen.findByRole("dialog", { name: "Add deal" });
    expect(await within(dialog).findByRole("button", { name: "Remove Carla Client" })).toBeInTheDocument();
    type(within(dialog).getByLabelText("Deal"), "Follow-on work");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add deal" }));
    expect(await within(card).findByText("Follow-on work")).toBeInTheDocument();
  });

  it("Home counts open deals on the business side", async () => {
    const { a } = await seed();
    await moveDealToStage(a.id, "stage-lost");
    renderApp("/", { activeSide: "business" });
    const deals = await screen.findByRole("region", { name: "Open deals" });
    expect(await within(deals).findByText("2")).toBeInTheDocument();
    expect(within(deals).getByText(/2,500/)).toBeInTheDocument();
  });
});

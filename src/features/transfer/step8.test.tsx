import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import * as data from "@/data";
import { useTestDatabase } from "@/data/testing";
import * as files from "@/lib/files";
import { renderApp } from "@/test/render";

useTestDatabase();

afterEach(() => vi.restoreAllMocks());

/** Stands in for the system's file dialogs. */
function fakeFiles(picked: { name: string; contents: string } | null = null) {
  const saved: { name: string; contents: string }[] = [];
  vi.spyOn(files, "saveTextFile").mockImplementation(async (name, contents) => {
    saved.push({ name, contents });
    return true;
  });
  vi.spyOn(files, "pickTextFile").mockResolvedValue(picked);
  return saved;
}

describe("Your data, in Settings", () => {
  const section = () => within(screen.getByRole("region", { name: "Your data" }));

  it("exports everything as JSON", async () => {
    const saved = fakeFiles();
    const ana = await data.createContact({ name: "Ana Lima" });
    await data.addInteraction({ contact_id: ana.id, type: "call", summary: "Caught up" });
    renderApp("/settings");

    fireEvent.click(await section().findByRole("button", { name: "Export JSON" }));
    expect(await section().findByText("Saved.")).toBeInTheDocument();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.name).toMatch(/^kinlo-\d{4}-\d{2}-\d{2}\.json$/);
    const file = JSON.parse(saved[0]!.contents) as data.FullExport;
    expect(file.format).toBe("kinlo-export");
    expect(file.tables.contacts).toHaveLength(1);
    expect(file.tables.interactions).toHaveLength(1);
  });

  it("exports people as CSV", async () => {
    const saved = fakeFiles();
    await data.createContact({ name: "Ana Lima", emails: [{ value: "ana@example.com" }] });
    renderApp("/settings");

    fireEvent.click(await section().findByRole("button", { name: "Export CSV" }));
    expect(await section().findByText("Saved.")).toBeInTheDocument();
    expect(saved[0]!.name).toMatch(/^kinlo-people-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(saved[0]!.contents).toContain("Ana Lima");
    expect(saved[0]!.contents).toContain("ana@example.com");
  });

  it("says nothing when the save dialog is cancelled, and explains a failure", async () => {
    const save = vi.spyOn(files, "saveTextFile").mockResolvedValueOnce(false);
    renderApp("/settings");
    fireEvent.click(await section().findByRole("button", { name: "Export JSON" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(section().queryByText("Saved.")).not.toBeInTheDocument();

    save.mockRejectedValueOnce(new Error("kinlo could not save the file there."));
    fireEvent.click(section().getByRole("button", { name: "Export JSON" }));
    expect(await section().findByText("kinlo could not save the file there.")).toBeInTheDocument();
  });
});

describe("Importing people", () => {
  const dialog = () => within(screen.getByRole("dialog", { name: "Import people" }));
  const csv = "Name,Email,Company\nAna Lima,ana@example.com,Larkspur\nBo Chen,,\nCy Diaz,cy@example.com,\n";

  it("shows what is in the file before adding anyone", async () => {
    fakeFiles({ name: "contacts.csv", contents: csv });
    await data.createContact({ name: "Bo Chen" });
    renderApp("/settings", { sides: "personal" });

    fireEvent.click(await screen.findByRole("button", { name: "Import" }));
    fireEvent.click(await dialog().findByRole("button", { name: "Choose a file" }));

    expect(await dialog().findByText(/3 people found in/)).toBeInTheDocument();
    expect(dialog().getByText("1 is already in kinlo and will be left as it is.")).toBeInTheDocument();
    expect(dialog().getByText("Ana Lima")).toBeInTheDocument();
    expect(await data.countContacts()).toBe(1);

    fireEvent.click(dialog().getByRole("button", { name: "Add 2 people" }));
    expect(await dialog().findByText("Added 2 people. 1 was already here.")).toBeInTheDocument();
    expect(await data.countContacts()).toBe(3);

    fireEvent.click(dialog().getByRole("button", { name: "See people" }));
    const main = within(await screen.findByRole("main"));
    expect(await main.findByText("Cy Diaz")).toBeInTheDocument();
    expect(main.getByText("Ana Lima")).toBeInTheDocument();
  });

  it("asks which side when both are in use, and what they are on the business side", async () => {
    fakeFiles({ name: "leads.csv", contents: "Name\nPriya Raman\n" });
    renderApp("/settings", { sides: "both", activeSide: "personal" });
    fireEvent.click(await screen.findByRole("button", { name: "Import" }));
    fireEvent.click(await dialog().findByRole("button", { name: "Choose a file" }));
    await dialog().findByText(/1 person found in/);

    // It starts on the side that is open.
    expect(dialog().getByRole("radio", { name: "Personal" })).toBeChecked();
    fireEvent.click(dialog().getByRole("radio", { name: "Business" }));
    fireEvent.click(dialog().getByRole("radio", { name: "Clients" }));
    fireEvent.click(dialog().getByRole("button", { name: "Add 1 person" }));
    await dialog().findByText("Added 1 person.");
    expect(await data.listContacts({ side: "business" })).toMatchObject([{ name: "Priya Raman", business: "client", personal: false }]);
  });

  it("explains a file that is not a list of contacts", async () => {
    fakeFiles({ name: "bank.csv", contents: "Date,Amount\n2026-01-01,12.50\n" });
    renderApp("/settings");
    fireEvent.click(await screen.findByRole("button", { name: "Import" }));
    fireEvent.click(await dialog().findByRole("button", { name: "Choose a file" }));
    expect(await dialog().findByRole("alert")).toHaveTextContent("does not look like a list of contacts");
    expect(await data.countContacts()).toBe(0);
  });

  it("has nothing to add when everyone is already there", async () => {
    fakeFiles({ name: "contacts.csv", contents: "Name\nBo Chen\n" });
    await data.createContact({ name: "Bo Chen" });
    renderApp("/settings");
    fireEvent.click(await screen.findByRole("button", { name: "Import" }));
    fireEvent.click(await dialog().findByRole("button", { name: "Choose a file" }));
    expect(await dialog().findByText(/already in kinlo, so there is nothing to add/)).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "Add 0 people" })).toBeDisabled();
  });

  it("can be started from the palette", async () => {
    fakeFiles();
    renderApp("/");
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.change(await screen.findByRole("combobox"), { target: { value: "import" } });
    fireEvent.click(await screen.findByRole("option", { name: "Import people" }));
    expect(await screen.findByRole("dialog", { name: "Import people" })).toBeInTheDocument();
  });
});

describe("Pipeline stages", () => {
  const business = { sides: "business" as const };
  const dialog = () => within(screen.getByRole("dialog", { name: "Pipeline stages" }));
  const names = async () => (await data.listStages()).map((stage) => stage.name);

  async function openStages() {
    renderApp("/pipeline", business);
    fireEvent.click(await screen.findByRole("button", { name: "Stages" }));
    await screen.findByRole("dialog", { name: "Pipeline stages" });
  }

  it("can be renamed, added, reordered and removed", async () => {
    await openStages();

    const lead = dialog().getByLabelText("Name of Lead");
    fireEvent.change(lead, { target: { value: "Enquiry" } });
    fireEvent.blur(lead);
    await waitFor(async () => expect(await names()).toEqual(["Enquiry", "Talking", "Proposal", "Won", "Lost"]));

    fireEvent.change(dialog().getByLabelText("New stage"), { target: { value: "Contract" } });
    fireEvent.click(dialog().getByRole("button", { name: "Add" }));
    // New stages go before Won and Lost, never after.
    await waitFor(async () => expect(await names()).toEqual(["Enquiry", "Talking", "Proposal", "Contract", "Won", "Lost"]));

    fireEvent.click(await dialog().findByRole("button", { name: "Move Contract up" }));
    await waitFor(async () => expect(await names()).toEqual(["Enquiry", "Talking", "Contract", "Proposal", "Won", "Lost"]));

    fireEvent.click(dialog().getByRole("button", { name: "Remove Talking" }));
    await waitFor(async () => expect(await names()).toEqual(["Enquiry", "Contract", "Proposal", "Won", "Lost"]));

    // The board behind follows.
    fireEvent.click(dialog().getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Pipeline stages" })).not.toBeInTheDocument());
  });

  it("keeps Won and Lost as they are", async () => {
    await openStages();
    expect(dialog().queryByLabelText("Name of Won")).not.toBeInTheDocument();
    expect(dialog().queryByRole("button", { name: "Remove Lost" })).not.toBeInTheDocument();
    await expect(data.deleteStage("stage-won")).rejects.toThrow("Won cannot be removed.");
    await data.renameStage("stage-lost", "Dropped");
    expect(await names()).toContain("Lost");
  });

  it("will not remove a stage that still has deals, or the last one", async () => {
    const zoe = await data.createContact({ name: "Zoë", personal: false, business: "client" });
    await data.createDeal({ contact_id: zoe.id, title: "Rebrand", stage_id: "stage-talking" });
    await openStages();
    expect(await dialog().findByText("1 deal")).toBeInTheDocument();
    expect(dialog().getByRole("button", { name: "Remove Talking" })).toBeDisabled();
    await expect(data.deleteStage("stage-talking")).rejects.toThrow("Talking still has 1 deal. Move it to another stage first.");

    await data.deleteStage("stage-lead");
    await data.deleteStage("stage-proposal");
    await expect(data.deleteStage("stage-talking")).rejects.toThrow("A pipeline needs at least one stage before Won and Lost.");
    expect(await names()).toEqual(["Talking", "Won", "Lost"]);
  });

  it("refuses two stages with the same name", async () => {
    await openStages();
    fireEvent.change(dialog().getByLabelText("New stage"), { target: { value: "talking" } });
    fireEvent.click(dialog().getByRole("button", { name: "Add" }));
    expect(await dialog().findByRole("alert")).toHaveTextContent("There is already a stage called talking.");
    expect(await names()).toHaveLength(5);
  });

  it("shows a deal in a stage the user made, and closing still works", async () => {
    const zoe = await data.createContact({ name: "Zoë", personal: false, business: "client" });
    const contract = await data.createStage("Contract");
    const deal = await data.createDeal({ contact_id: zoe.id, title: "Rebrand", stage_id: contract.id });
    renderApp("/pipeline", business);
    const column = within(await screen.findByRole("region", { name: "Contract" }));
    expect(await column.findByText("Rebrand")).toBeInTheDocument();

    await data.moveDealToStage(deal.id, "stage-won");
    expect((await data.getDeal(deal.id))?.closed_at).not.toBeNull();
  });
});

describe("Keyboard shortcuts", () => {
  it("are listed with Ctrl or Cmd + /, without business ones on the personal side", async () => {
    renderApp("/", { sides: "personal" });
    fireEvent.keyDown(window, { key: "/", ctrlKey: true });
    const list = within(await screen.findByRole("dialog", { name: "Keyboard shortcuts" }));
    expect(list.getByText("Add a person")).toBeInTheDocument();
    expect(list.queryByText("Add a deal")).not.toBeInTheDocument();
    expect(list.queryByText("Switch between Personal and Business")).not.toBeInTheDocument();
  });

  it("add a person, a reminder and a deal", async () => {
    renderApp("/", { sides: "business" });
    await screen.findByRole("navigation", { name: "Main" });
    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    expect(await screen.findByRole("dialog", { name: /Add person/i })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.keyDown(window, { key: "N", ctrlKey: true, shiftKey: true });
    expect(await screen.findByRole("dialog", { name: /reminder/i })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.keyDown(window, { key: "D", ctrlKey: true, shiftKey: true });
    expect(await screen.findByRole("dialog", { name: /deal/i })).toBeInTheDocument();
  });

  it("switch sides when both are in use", async () => {
    renderApp("/", { sides: "both", activeSide: "personal" });
    await screen.findByRole("navigation", { name: "Main" });
    expect(screen.queryByRole("link", { name: "Pipeline" })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "S", ctrlKey: true, shiftKey: true });
    expect(await screen.findByRole("link", { name: "Pipeline" })).toBeInTheDocument();
    await waitFor(async () => expect(await data.loadSettings()).toMatchObject({ activeSide: "business" }));
  });
});

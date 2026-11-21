import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { ModelMessage } from "ai";
import * as data from "@/data";
import { useTestDatabase } from "@/data/testing";
import { approvalMessage, cancelledMessage, pendingApprovals, runTurn, toView } from "./engine";
import { scriptedModel, type Scripted } from "./testing";
import { buildTools } from "./tools";

useTestDatabase();

const tools = () => buildTools({ side: "personal", currency: "USD" });

async function turn(replies: Scripted[][], messages: ModelMessage[], toolset = tools()) {
  const scripted = scriptedModel(replies);
  const added = await runTurn({ model: scripted.model, instructions: "Test.", messages, tools: toolset });
  return { ...scripted, messages: [...messages, ...added] };
}

const ask = (text: string): ModelMessage[] => [{ role: "user", content: text }];

describe("the assistant's turn", () => {
  it("answers in plain text", async () => {
    const heard: string[] = [];
    const scripted = scriptedModel([[{ say: "Hello there." }]]);
    const added = await runTurn({
      model: scripted.model,
      instructions: "Test.",
      messages: ask("Hi"),
      tools: tools(),
      onText: (delta) => heard.push(delta),
    });
    expect(heard.join("")).toBe("Hello there.");
    expect(toView([...ask("Hi"), ...added])).toEqual([
      { kind: "user", key: "m0", text: "Hi" },
      expect.objectContaining({ kind: "assistant", text: "Hello there." }),
    ]);
  });

  it("looks things up without asking, then answers", async () => {
    await data.createContact({ name: "Zoë Nakamura", company: "Fernhill Studio" });
    const used: string[] = [];
    const scripted = scriptedModel([
      [{ call: "search_contacts", input: { query: "Zoë" } }],
      [{ say: "Zoë works at Fernhill Studio." }],
    ]);
    const added = await runTurn({
      model: scripted.model,
      instructions: "Test.",
      messages: ask("Where does Zoë work?"),
      tools: tools(),
      onTool: (name) => used.push(name),
    });
    expect(used).toEqual(["search_contacts"]);
    expect(scripted.turns()).toBe(2);
    // The second request carried what the search found.
    expect(JSON.stringify(scripted.requests[1])).toContain("Fernhill Studio");
    const view = toView([...ask("Where does Zoë work?"), ...added]);
    expect(view.map((item) => item.kind)).toEqual(["user", "lookup", "assistant"]);
    expect(pendingApprovals(added)).toEqual([]);
  });

  it("does not save a change until the user confirms it", async () => {
    const reminder = { title: "Call Ana", due_at: "2030-01-05T09:00" };
    const first = await turn([[{ call: "create_reminder", input: reminder }]], ask("Remind me to call Ana"));

    // The model asked, and nothing has been written.
    expect(await data.listReminders()).toEqual([]);
    const pending = pendingApprovals(first.messages);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ toolName: "create_reminder", input: reminder });
    expect(toView(first.messages).at(-1)).toMatchObject({ kind: "action", state: "pending" });
    // It stopped to wait instead of carrying on by itself.
    expect(first.turns()).toBe(1);

    const confirmed = [...first.messages, approvalMessage([{ approvalId: pending[0]!.approvalId, approved: true }])];
    expect(toView(confirmed).at(-1)).toMatchObject({ kind: "action", state: "saving" });

    const second = await turn([[{ say: "Done. I will remind you on 5 January." }]], confirmed);
    const saved = await data.listReminders();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ title: "Call Ana", side: "personal" });
    expect(new Date(saved[0]!.due_at).getTime()).toBe(new Date(2030, 0, 5, 9, 0).getTime());

    const view = toView(second.messages);
    expect(view.find((item) => item.kind === "action")).toMatchObject({ state: "done" });
    expect(view.at(-1)).toMatchObject({ kind: "assistant", text: "Done. I will remind you on 5 January." });
    expect(pendingApprovals(second.messages)).toEqual([]);
  });

  it("saves nothing when the user cancels, and tells the model so", async () => {
    const first = await turn(
      [[{ call: "create_contact", input: { name: "Sam Rivera" } }]],
      ask("Add Sam Rivera"),
    );
    const pending = pendingApprovals(first.messages);
    const cancelled = [...first.messages, approvalMessage([{ approvalId: pending[0]!.approvalId, approved: false }])];

    const second = await turn([[{ say: "No problem, I left it." }]], cancelled);
    expect(await data.countContacts()).toBe(0);
    expect(toView(second.messages).find((item) => item.kind === "action")).toMatchObject({ state: "cancelled" });
    expect(JSON.stringify(second.requests[0])).toContain("cancelled this change");
  });

  it("closes a change the user walked away from, so the conversation can go on", async () => {
    const first = await turn([[{ call: "create_contact", input: { name: "Sam Rivera" } }]], ask("Add Sam Rivera"));
    const moved: ModelMessage[] = [
      ...first.messages,
      cancelledMessage(pendingApprovals(first.messages)),
      { role: "user", content: "Never mind" },
    ];
    const second = await turn([[{ say: "All right." }]], moved);
    expect(await data.countContacts()).toBe(0);
    expect(pendingApprovals(second.messages)).toEqual([]);
    expect(toView(second.messages).map((item) => (item.kind === "action" ? item.state : item.kind))).toEqual([
      "user",
      "cancelled",
      "user",
      "assistant",
    ]);
    expect(JSON.stringify(second.requests[0])).toContain("moved on without confirming");
  });

  it("reports a change that could not be made", async () => {
    const first = await turn(
      [[{ call: "log_interaction", input: { contact_id: "nobody", type: "call", summary: "Caught up" } }]],
      ask("Log a call"),
    );
    const pending = pendingApprovals(first.messages);
    const confirmed = [...first.messages, approvalMessage([{ approvalId: pending[0]!.approvalId, approved: true }])];
    const second = await turn([[{ say: "I could not find that person." }]], confirmed);
    expect(toView(second.messages).find((item) => item.kind === "action")).toMatchObject({ state: "failed" });
    expect(JSON.stringify(second.requests[0])).toContain("no person with that id");
  });

  it("handles two changes asked for at once", async () => {
    const ana = await data.createContact({ name: "Ana Lima" });
    const first = await turn(
      [
        [
          { call: "log_interaction", input: { contact_id: ana.id, type: "call", summary: "Talked about the move" } },
          { call: "create_reminder", input: { title: "Send Ana boxes", due_at: "2030-02-01T09:00", contact_id: ana.id } },
        ],
      ],
      ask("I called Ana about the move, remind me to send boxes"),
    );
    const pending = pendingApprovals(first.messages);
    expect(pending.map((p) => p.toolName)).toEqual(["log_interaction", "create_reminder"]);

    const answered = [
      ...first.messages,
      approvalMessage([
        { approvalId: pending[0]!.approvalId, approved: true },
        { approvalId: pending[1]!.approvalId, approved: false },
      ]),
    ];
    const second = await turn([[{ say: "Logged the call." }]], answered);
    expect(await data.listInteractions(ana.id)).toHaveLength(1);
    expect(await data.listReminders()).toEqual([]);
    expect(
      toView(second.messages)
        .filter((item) => item.kind === "action")
        .map((item) => item.state),
    ).toEqual(["done", "cancelled"]);
  });
});

describe("when the provider fails", () => {
  const failing = (error: unknown) =>
    new MockLanguageModelV4({
      doStream: async () => {
        throw error;
      },
    });

  it("passes the failure on, so it can be explained to the user", async () => {
    const refused = Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    await expect(
      runTurn({ model: failing(refused), instructions: "Test.", messages: ask("Hi"), tools: tools() }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("does not write the failure to the console", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runTurn({
      model: failing(new Error("boom")),
      instructions: "Test.",
      messages: ask("Hi"),
      tools: tools(),
    }).catch(() => {});
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("the assistant's tools", () => {
  it("only sees the side of kinlo that is on screen", async () => {
    const friend = await data.createContact({ name: "Maya Friend" });
    const client = await data.createContact({ name: "Maya Client", personal: false, business: "client" });

    const personal = await turn(
      [[{ call: "search_contacts", input: { query: "Maya" } }], [{ say: "ok" }]],
      ask("Maya?"),
    );
    const seen = JSON.stringify(personal.requests[1]);
    expect(seen).toContain(friend.id);
    expect(seen).not.toContain(client.id);

    // Reaching across by id does not work either.
    const across = await turn(
      [[{ call: "get_contact", input: { contact_id: client.id } }], [{ say: "ok" }]],
      ask("Tell me about Maya"),
    );
    expect(JSON.stringify(across.requests[1])).toContain("no person with that id");
  });

  it("keeps the pipeline off the personal side", () => {
    const personal = Object.keys(buildTools({ side: "personal", currency: "USD" }));
    const business = Object.keys(buildTools({ side: "business", currency: "USD" }));
    expect(personal).not.toContain("list_deals");
    expect(personal).not.toContain("create_deal");
    expect(business).toEqual(expect.arrayContaining(["list_deals", "create_deal", "move_deal"]));
  });

  it("adds people to the side it is on", async () => {
    const business = buildTools({ side: "business", currency: "EUR" });
    const first = await turn(
      [[{ call: "create_contact", input: { name: "Priya Raman", company: "Northwind", tags: ["conference"] } }]],
      ask("Add Priya"),
      business,
    );
    const pending = pendingApprovals(first.messages);
    await turn(
      [[{ say: "Added." }]],
      [...first.messages, approvalMessage([{ approvalId: pending[0]!.approvalId, approved: true }])],
      business,
    );
    const [priya] = await data.listContacts({ side: "business" });
    expect(priya).toMatchObject({ name: "Priya Raman", personal: false, business: "lead", company: "Northwind" });
    expect(priya!.tags.map((t) => t.name)).toEqual(["conference"]);
  });

  it("makes and moves deals", async () => {
    const business = buildTools({ side: "business", currency: "EUR" });
    const zoe = await data.createContact({ name: "Zoë", personal: false, business: "client" });
    const approveAll = async (replies: Scripted[][], text: string) => {
      const first = await turn(replies, ask(text), business);
      const decisions = pendingApprovals(first.messages).map((p) => ({ approvalId: p.approvalId, approved: true }));
      return turn([[{ say: "Done." }]], [...first.messages, approvalMessage(decisions)], business);
    };

    await approveAll(
      [[{ call: "create_deal", input: { contact_id: zoe.id, title: "Rebrand", value: 5000, stage: "talking" } }]],
      "New deal",
    );
    const [deal] = await data.listDeals();
    expect(deal).toMatchObject({ title: "Rebrand", value: 5000, currency: "EUR", stage_id: "stage-talking" });

    await approveAll([[{ call: "move_deal", input: { deal_id: deal!.id, stage: "Won" } }]], "We won it");
    const moved = await data.getDeal(deal!.id);
    expect(moved?.stage_id).toBe("stage-won");
    expect(moved?.closed_at).not.toBeNull();
  });
});

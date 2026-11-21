import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { setModelFactory } from "@/ai/chat";
import { clearMemoryKeys, getKey, setKey } from "@/ai/keys";
import { scriptedModel, type Scripted } from "@/ai/testing";
import * as data from "@/data";
import { db } from "@/data/driver";
import { useTestDatabase } from "@/data/testing";
import { renderApp } from "@/test/render";
import { Markdown } from "./Markdown";

useTestDatabase();

afterEach(() => {
  setModelFactory();
  clearMemoryKeys();
  vi.unstubAllGlobals();
});

const panel = () => within(screen.getByRole("complementary", { name: "Assistant" }));

/** Opens the panel the way a person does, and waits for it to be there. */
async function openPanel() {
  fireEvent.keyDown(window, { key: "j", ctrlKey: true });
  await screen.findByRole("complementary", { name: "Assistant" });
}

/** Opens the app with the assistant connected to a model that follows a script. */
async function openAssistant(replies: Scripted[][], path = "/", settings: Partial<data.Settings> = {}) {
  const scripted = scriptedModel(replies);
  setModelFactory(async () => scripted.model);
  renderApp(path, { aiProvider: "ollama", aiModel: "test-model", sides: "personal", ...settings });
  await openPanel();
  return scripted;
}

async function say(text: string) {
  const box = await panel().findByLabelText("Message the assistant");
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter" });
}

describe("Assistant panel", () => {
  it("asks you to connect a model first, and takes you to Settings", async () => {
    renderApp("/");
    await openPanel();
    expect(await panel().findByText("Connect a model to ask about your people.")).toBeInTheDocument();
    fireEvent.click(panel().getByRole("button", { name: "Connect a model" }));
    expect(await screen.findByRole("region", { name: "Assistant settings" })).toBeInTheDocument();
  });

  it("says what is missing when a provider is chosen but not finished", async () => {
    renderApp("/", { aiProvider: "anthropic" });
    await openPanel();
    expect(await panel().findByText("Add your API key to start using the assistant.")).toBeInTheDocument();
  });

  it("asks for a model once the key is there", async () => {
    await setKey("anthropic", "sk-ant-test");
    renderApp("/", { aiProvider: "anthropic" });
    await openPanel();
    expect(await panel().findByText("Pick a model to start using the assistant.")).toBeInTheDocument();
  });

  it("looks things up and answers", async () => {
    await data.createContact({ name: "Zoë Nakamura", company: "Fernhill Studio" });
    const scripted = await openAssistant([
      [{ call: "search_contacts", input: { query: "Zoë" } }],
      [{ say: "Zoë works at **Fernhill Studio**." }],
    ]);
    await say("Where does Zoë work?");

    expect(await panel().findByText("Fernhill Studio")).toBeInTheDocument();
    expect(panel().getByText("Where does Zoë work?")).toBeInTheDocument();
    expect(panel().getByText('Searched your people for "Zoë"')).toBeInTheDocument();
    // Bold came through as bold, not as asterisks.
    expect(panel().getByText("Fernhill Studio").tagName).toBe("STRONG");
    expect(scripted.turns()).toBe(2);
  });

  it("shows a change as a card and saves nothing until it is confirmed", async () => {
    const zoe = await data.createContact({ name: "Zoë Nakamura" });
    await openAssistant(
      [
        [{ call: "create_reminder", input: { title: "Call Zoë", due_at: "2031-03-04T09:00", contact_id: zoe.id } }],
        [{ say: "Done. You will be reminded on 4 March." }],
      ],
      "/reminders",
    );
    await say("Remind me to call Zoë on 4 March 2031");

    const card = within(await panel().findByRole("group", { name: "Remind you: Call Zoë" }));
    expect(card.getByText("Zoë Nakamura")).toBeInTheDocument();
    expect(card.getByText("Nothing is saved until you confirm.")).toBeInTheDocument();
    expect(await data.listReminders()).toEqual([]);

    fireEvent.click(card.getByRole("button", { name: "Confirm" }));
    expect(await panel().findByText("Done. You will be reminded on 4 March.")).toBeInTheDocument();
    expect(await card.findByText("Saved")).toBeInTheDocument();
    expect(card.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();

    const saved = await data.listReminders();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ title: "Call Zoë", contact_id: zoe.id });
    // The Reminders page behind the panel shows it without a reload.
    expect(await within(screen.getByRole("main")).findByText("Call Zoë")).toBeInTheDocument();
  });

  it("cancelling leaves everything as it was", async () => {
    await openAssistant([[{ call: "create_contact", input: { name: "Sam Rivera", company: "Larkspur" } }], [{ say: "Left it." }]]);
    await say("Add Sam Rivera");

    const card = within(await panel().findByRole("group", { name: "Add Sam Rivera" }));
    expect(card.getByText("Larkspur")).toBeInTheDocument();
    fireEvent.click(card.getByRole("button", { name: "Cancel" }));

    expect(await panel().findByText("Left it.")).toBeInTheDocument();
    expect(await card.findByText("Cancelled")).toBeInTheDocument();
    expect(await data.countContacts()).toBe(0);
  });

  it("waits for every card when the assistant asks for two changes", async () => {
    const ana = await data.createContact({ name: "Ana Lima" });
    const scripted = await openAssistant([
      [
        { call: "log_interaction", input: { contact_id: ana.id, type: "call", summary: "Talked about the move" } },
        { call: "create_reminder", input: { title: "Send boxes", due_at: "2031-01-02T09:00", contact_id: ana.id } },
      ],
      [{ say: "Logged the call." }],
    ]);
    await say("I called Ana, remind me to send boxes");

    const call = within(await panel().findByRole("group", { name: "Log a call with Ana Lima" }));
    const reminder = within(await panel().findByRole("group", { name: "Remind you: Send boxes" }));
    fireEvent.click(call.getByRole("button", { name: "Confirm" }));
    // One answer is not enough to go on.
    expect(await call.findByText("Confirmed")).toBeInTheDocument();
    expect(scripted.turns()).toBe(1);
    expect(await data.listInteractions(ana.id)).toEqual([]);

    fireEvent.click(reminder.getByRole("button", { name: "Cancel" }));
    expect(await panel().findByText("Logged the call.")).toBeInTheDocument();
    expect(await data.listInteractions(ana.id)).toHaveLength(1);
    expect(await data.listReminders()).toEqual([]);
  });

  it("will not let you confirm a change about someone it cannot find", async () => {
    await openAssistant([
      [{ call: "log_interaction", input: { contact_id: "made-up", type: "call", summary: "Hello" } }],
      [{ say: "I could not find them." }],
    ]);
    await say("Log a call");
    const card = within(await panel().findByRole("group", { name: "Log a call with a person" }));
    expect(card.getByText(/could not find this person/)).toBeInTheDocument();
    expect(card.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    fireEvent.click(card.getByRole("button", { name: "Dismiss" }));
    expect(await panel().findByText("I could not find them.")).toBeInTheDocument();
  });

  it("treats a new message as cancelling a card left open", async () => {
    const scripted = await openAssistant([
      [{ call: "create_contact", input: { name: "Sam Rivera" } }],
      [{ say: "What would you like instead?" }],
    ]);
    await say("Add Sam");
    await panel().findByRole("group", { name: "Add Sam Rivera" });
    await say("Actually never mind");

    expect(await panel().findByText("What would you like instead?")).toBeInTheDocument();
    expect(await data.countContacts()).toBe(0);
    expect(JSON.stringify(scripted.requests[1])).toContain("moved on without confirming");
  });

  it("explains a refused key in plain words and offers another try", async () => {
    let calls = 0;
    const good = scriptedModel([[{ say: "Hello again." }]]);
    setModelFactory(async () => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("401 sk-secret"), { statusCode: 401 });
      return good.model;
    });
    renderApp("/", { aiProvider: "ollama", aiModel: "test-model" });
    await openPanel();
    await say("Hello");

    const alert = await panel().findByRole("alert");
    expect(alert).toHaveTextContent("Ollama refused the request.");
    expect(alert).not.toHaveTextContent("sk-secret");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await panel().findByText("Hello again.")).toBeInTheDocument();
    expect(panel().queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the conversation, and can start a new one", async () => {
    await openAssistant([[{ say: "Hello there." }]]);
    await say("Hi");
    expect(await panel().findByText("Hello there.")).toBeInTheDocument();

    const threads = await data.listThreads();
    expect(threads).toHaveLength(1);
    expect(threads[0]!.title).toBe("Hi");
    await waitFor(async () => expect(await data.listMessages(threads[0]!.id)).toHaveLength(2));

    fireEvent.click(panel().getByRole("button", { name: "New conversation" }));
    expect(await panel().findByText("Ask about your people, or tell kinlo what happened.")).toBeInTheDocument();
    expect(panel().queryByText("Hello there.")).not.toBeInTheDocument();
  });

  it("offers the pipeline only on the business side", async () => {
    const personal = await openAssistant([[{ say: "ok" }]]);
    await say("Hi");
    await panel().findByText("ok");
    const tools = (request: unknown) =>
      ((request as { tools?: { name: string }[] }).tools ?? []).map((tool) => tool.name);
    expect(tools(personal.requests[0])).not.toContain("list_deals");
    expect(tools(personal.requests[0])).toContain("create_reminder");
  });
});

describe("Assistant settings", () => {
  const settings = () => within(screen.getByRole("region", { name: "Assistant settings" }));

  function stubModels(body: unknown, status = 200) {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify(body), { status });
    });
    return urls;
  }

  it("saves a key to the keychain and never to the database", async () => {
    stubModels({ data: [{ id: "model-one" }, { id: "model-two" }] });
    renderApp("/settings");
    fireEvent.change(await settings().findByLabelText("Model provider"), { target: { value: "anthropic" } });

    const key = await settings().findByLabelText("API key");
    expect(key).toHaveAttribute("type", "password");
    fireEvent.change(key, { target: { value: "sk-ant-very-secret" } });
    fireEvent.click(settings().getByRole("button", { name: "Save" }));

    expect(await settings().findByText(/Saved in your system's keychain/)).toBeInTheDocument();
    // The key is gone from the screen and cannot be read back from it.
    expect(settings().queryByLabelText("API key")).not.toBeInTheDocument();
    expect(document.body.innerHTML).not.toContain("sk-ant-very-secret");
    expect(await getKey("anthropic")).toBe("sk-ant-very-secret");

    const rows = await db().select("SELECT * FROM settings");
    expect(JSON.stringify(rows)).not.toContain("sk-ant-very-secret");
    expect(JSON.stringify({ ...localStorage })).not.toContain("sk-ant-very-secret");
    expect(await data.loadSettings()).toMatchObject({ aiProvider: "anthropic", aiModel: null });
  });

  it("offers the provider's models once the key is saved", async () => {
    stubModels({ data: [{ id: "model-one" }, { id: "model-two" }] });
    await setKey("anthropic", "sk-ant-test");
    renderApp("/settings", { aiProvider: "anthropic" });

    expect(await settings().findByText("Pick one from the list, or type its name.")).toBeInTheDocument();
    fireEvent.pointerDown(settings().getByRole("button", { name: "Choose a model" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitem", { name: "model-two" }));
    await waitFor(async () => expect(await data.loadSettings()).toMatchObject({ aiModel: "model-two" }));
  });

  it("lets you type a model name when the list cannot be fetched", async () => {
    stubModels({ error: "no" }, 401);
    await setKey("openai", "sk-bad");
    renderApp("/settings", { aiProvider: "openai" });

    expect(await settings().findByText(/OpenAI did not accept that key\. You can still type a model name\./)).toBeInTheDocument();
    const model = settings().getByLabelText("Model");
    fireEvent.change(model, { target: { value: "my-model" } });
    fireEvent.blur(model);
    await waitFor(async () => expect(await data.loadSettings()).toMatchObject({ aiModel: "my-model" }));
  });

  it("removes a key", async () => {
    stubModels({ data: [] });
    await setKey("google", "g-key");
    renderApp("/settings", { aiProvider: "google" });
    fireEvent.click(await settings().findByRole("button", { name: "Remove" }));
    expect(await settings().findByLabelText("API key")).toBeInTheDocument();
    expect(await getKey("google")).toBeNull();
  });

  it("needs no key for Ollama, and says nothing leaves the computer", async () => {
    const urls = stubModels({ models: [{ name: "llama3" }] });
    renderApp("/settings");
    fireEvent.change(await settings().findByLabelText("Model provider"), { target: { value: "ollama" } });
    expect(await settings().findByText("Ollama runs on this computer, so nothing you ask leaves it.")).toBeInTheDocument();
    expect(settings().queryByLabelText("API key")).not.toBeInTheDocument();
    await waitFor(() => expect(urls).toContain("http://localhost:11434/api/tags"));
  });

  it("says where your questions go for a hosted provider", async () => {
    stubModels({ data: [] });
    renderApp("/settings", { aiProvider: "anthropic" });
    expect(await settings().findByText(/are sent to Anthropic\. Nothing else leaves this computer\./)).toBeInTheDocument();
  });

  it("forgets the model and address when the provider changes", async () => {
    stubModels({ data: [] });
    renderApp("/settings", { aiProvider: "openai", aiModel: "some-model", aiBaseUrl: "http://localhost:1234/v1" });
    fireEvent.change(await settings().findByLabelText("Model provider"), { target: { value: "" } });
    await waitFor(async () =>
      expect(await data.loadSettings()).toMatchObject({ aiProvider: null, aiModel: null, aiBaseUrl: null }),
    );
    expect(await settings().findByText(/The assistant is optional/)).toBeInTheDocument();
  });
});

describe("Replies", () => {
  it("are shown as text, so nothing in them can run", () => {
    const { container } = render(<Markdown text={'Hello <img src=x onerror="alert(1)"> **bold** and a list:\n- one\n- two'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("strong")?.textContent).toBe("bold");
  });
});

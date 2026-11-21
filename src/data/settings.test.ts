import { describe, expect, it } from "vitest";
import { addMessage, createThread, deleteThread, listMessages, listThreads } from "./ai";
import { db } from "./driver";
import { DEFAULT_SETTINGS, loadSettings, saveSetting } from "./settings";
import { useTestDatabase } from "./testing";

useTestDatabase();

describe("settings", () => {
  it("start at their defaults", async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("save and load, overwriting earlier values", async () => {
    await saveSetting("theme", "dark");
    await saveSetting("pipelineEnabled", false);
    await saveSetting("theme", "light");
    expect(await loadSettings()).toEqual({ ...DEFAULT_SETTINGS, theme: "light", pipelineEnabled: false });
  });

  it("ignore keys the app does not know", async () => {
    await db().execute("INSERT INTO settings (key, value) VALUES ('fromTheFuture', '42')");
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("assistant threads", () => {
  it("keep messages in order and delete them with the thread", async () => {
    const thread = await createThread("Who should I call?");
    await addMessage(thread.id, "user", [{ type: "text", text: "Who is overdue?" }]);
    await addMessage(thread.id, "assistant", [{ type: "text", text: "Two people." }]);

    const messages = await listMessages<{ type: string; text: string }[]>(thread.id);
    expect(messages.map((m) => [m.role, m.content[0]!.text])).toEqual([
      ["user", "Who is overdue?"],
      ["assistant", "Two people."],
    ]);
    expect(await listThreads()).toHaveLength(1);

    await deleteThread(thread.id);
    expect(await listMessages(thread.id)).toEqual([]);
  });
});

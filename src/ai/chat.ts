import type { LanguageModel, ModelMessage } from "ai";
import { create } from "zustand";
import * as data from "@/data";
import type { AiRole, AiThread, Settings } from "@/data";
import { currentSide } from "@/data/settings";
import { approvalMessage, cancelledMessage, pendingApprovals, runTurn } from "./engine";
import { getKey } from "./keys";
import { buildInstructions } from "./prompt";
import { configFrom, createModel, explainError, PROVIDERS, type AiConfig } from "./providers";
import { buildTools, isWriteTool } from "./tools";

/** What is on screen while the assistant is still working on its reply. */
export type LiveItem = { kind: "assistant"; text: string } | { kind: "lookup"; toolName: string; input: unknown };

type ModelFactory = (config: AiConfig, key: string | null) => Promise<LanguageModel>;
let modelFactory: ModelFactory = createModel;

/** Tests swap in a scripted model here. Pass nothing to go back to the real one. */
export function setModelFactory(factory?: ModelFactory) {
  modelFactory = factory ?? createModel;
}

interface ChatState {
  threadId: string | null;
  messages: ModelMessage[];
  live: LiveItem[];
  working: boolean;
  error: string | null;
  /** Answers to change cards given so far, while others in the same reply are still open. */
  decisions: Record<string, boolean>;
  /** Goes up each time the assistant has changed the user's data. */
  dataVersion: number;
  threads: AiThread[];
  loaded: boolean;

  /** Opens the most recent conversation, once. */
  load: () => Promise<void>;
  send: (text: string, settings: Settings) => Promise<void>;
  /** Confirms or cancels one change card. */
  decide: (approvalId: string, approved: boolean, settings: Settings) => Promise<void>;
  /** Runs the assistant again after something went wrong. */
  retry: (settings: Settings) => Promise<void>;
  stop: () => void;
  newChat: () => void;
  openThread: (id: string) => Promise<void>;
  removeThread: (id: string) => Promise<void>;
}

let controller: AbortController | null = null;
/** Guards against a reply landing in a conversation the user has since left. */
let generation = 0;

const titleFrom = (text: string) => {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 60 ? `${line.slice(0, 57).trimEnd()}…` : line;
};

export const useChat = create<ChatState>((set, get) => {
  /** Adds messages to the conversation on screen and saves them. */
  async function append(messages: ModelMessage[]) {
    const { threadId } = get();
    if (!messages.length || !threadId) return;
    set({ messages: [...get().messages, ...messages] });
    for (const message of messages) {
      await data.addMessage(threadId, message.role as AiRole, message.content);
    }
  }

  async function run(settings: Settings) {
    const config = configFrom(settings);
    if (!config) {
      set({ error: "Connect a model in Settings first." });
      return;
    }
    const info = PROVIDERS[config.provider];
    const side = currentSide(settings);
    const mine = ++generation;
    controller = new AbortController();
    set({ working: true, error: null, live: [] });

    try {
      const key = await getKey(config.provider);
      if (info.needsKey && !key) {
        set({ error: `Add your ${info.label} key in Settings first.` });
        return;
      }
      const model = await modelFactory(config, key);
      const added = await runTurn({
        model,
        instructions: buildInstructions({ userName: settings.userName, side, sides: settings.sides }),
        messages: get().messages,
        tools: buildTools({ side, currency: settings.defaultCurrency }),
        signal: controller.signal,
        onText: (delta) => {
          if (mine !== generation) return;
          const live = [...get().live];
          const last = live.at(-1);
          if (last?.kind === "assistant") live[live.length - 1] = { kind: "assistant", text: last.text + delta };
          else live.push({ kind: "assistant", text: delta });
          set({ live });
        },
        onTool: (toolName, input) => {
          if (mine !== generation || isWriteTool(toolName)) return;
          set({ live: [...get().live, { kind: "lookup", toolName, input }] });
        },
      });
      if (mine !== generation) return;
      set({ live: [] });
      await append(added);
      const wrote = added.some(
        (message) =>
          message.role === "tool" &&
          message.content.some((part) => part.type === "tool-result" && isWriteTool(part.toolName)),
      );
      if (wrote) set({ dataVersion: get().dataVersion + 1 });
    } catch (error) {
      if (mine === generation) set({ error: explainError(error, config.provider) });
    } finally {
      if (mine === generation) {
        controller = null;
        set({ working: false, live: [] });
      }
    }
  }

  function leave() {
    generation += 1;
    controller?.abort();
    controller = null;
  }

  return {
    threadId: null,
    messages: [],
    live: [],
    working: false,
    error: null,
    decisions: {},
    dataVersion: 0,
    threads: [],
    loaded: false,

    load: async () => {
      if (get().loaded) return;
      set({ loaded: true });
      const threads = await data.listThreads();
      set({ threads });
      const latest = threads[0];
      if (latest && !get().threadId && !get().messages.length) await get().openThread(latest.id);
    },

    send: async (text, settings) => {
      const content = text.trim();
      if (!content || get().working) return;
      if (!get().threadId) {
        const thread = await data.createThread(titleFrom(content));
        set({ threadId: thread.id, threads: [thread, ...get().threads] });
      }
      // Moving on without answering a change card counts as cancelling it.
      const open = pendingApprovals(get().messages);
      const answers = open.length ? [cancelledMessage(open)] : [];
      set({ decisions: {}, error: null });
      await append([...answers, { role: "user", content }]);
      await run(settings);
    },

    decide: async (approvalId, approved, settings) => {
      if (get().working) return;
      const decisions = { ...get().decisions, [approvalId]: approved };
      const open = pendingApprovals(get().messages);
      if (!open.some((pending) => pending.approvalId === approvalId)) return;
      if (!open.every((pending) => pending.approvalId in decisions)) {
        set({ decisions });
        return;
      }
      set({ decisions: {} });
      await append([
        approvalMessage(open.map((pending) => ({ approvalId: pending.approvalId, approved: decisions[pending.approvalId]! }))),
      ]);
      await run(settings);
    },

    retry: async (settings) => {
      if (get().working || !get().threadId) return;
      await run(settings);
    },

    stop: () => controller?.abort(),

    newChat: () => {
      leave();
      set({ threadId: null, messages: [], live: [], working: false, error: null, decisions: {} });
    },

    openThread: async (id) => {
      leave();
      const stored = await data.listMessages(id);
      set({
        threadId: id,
        messages: stored.map((message) => ({ role: message.role, content: message.content }) as ModelMessage),
        live: [],
        working: false,
        error: null,
        decisions: {},
      });
    },

    removeThread: async (id) => {
      await data.deleteThread(id);
      set({ threads: get().threads.filter((thread) => thread.id !== id) });
      if (get().threadId === id) get().newChat();
    },
  };
});

/** Test helper: back to an empty assistant. */
export function resetChat() {
  generation += 1;
  controller?.abort();
  controller = null;
  useChat.setState({
    threadId: null,
    messages: [],
    live: [],
    working: false,
    error: null,
    decisions: {},
    dataVersion: 0,
    threads: [],
    loaded: false,
  });
}

import { isStepCount, streamText, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import { isWriteTool, WRITE_TOOLS } from "./tools";

/** Lookups in a row before the assistant must answer. Stops a confused model looping. */
const MAX_STEPS = 8;

export interface TurnOptions {
  model: LanguageModel;
  instructions: string;
  messages: ModelMessage[];
  tools: ToolSet;
  signal?: AbortSignal;
  /** Called with each piece of text as it arrives. */
  onText?: (delta: string) => void;
  /** Called when the assistant starts using a tool. */
  onTool?: (toolName: string, input: unknown) => void;
}

/**
 * Runs the assistant until it has answered or needs the user to confirm a change.
 * Returns the messages to add to the conversation.
 *
 * Reading tools run on their own. Every writing tool stops here and waits: the model's
 * request comes back as an approval request, and the tool only runs on a later turn,
 * after the user's answer has been added to the conversation (see `approvalMessage`).
 */
export async function runTurn(options: TurnOptions): Promise<ModelMessage[]> {
  const approvals = Object.fromEntries(
    WRITE_TOOLS.filter((name) => name in options.tools).map((name) => [name, "user-approval" as const]),
  );
  let text = "";
  try {
    const result = streamText({
      model: options.model,
      instructions: options.instructions,
      messages: options.messages,
      tools: options.tools,
      toolApproval: approvals,
      stopWhen: isStepCount(MAX_STEPS),
      abortSignal: options.signal,
      // One try, so a wrong key or a missing model is reported at once.
      maxRetries: 1,
      // Failures are shown to the user by the caller. Keep them out of the console.
      onError: () => {},
    });
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        text += part.text;
        options.onText?.(part.text);
      } else if (part.type === "tool-call") {
        options.onTool?.(part.toolName, part.input);
      } else if (part.type === "error") {
        throw part.error;
      }
    }
    return (await result.responseMessages) as ModelMessage[];
  } catch (error) {
    // Stopped by the user: keep whatever had been written so far.
    if (options.signal?.aborted) return text.trim() ? [{ role: "assistant", content: text }] : [];
    throw error;
  }
}

export interface PendingApproval {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
}

type Part = { type: string } & Record<string, unknown>;

const parts = (message: ModelMessage): Part[] =>
  Array.isArray(message.content) ? (message.content as unknown as Part[]) : [];

/** Changes the assistant has asked for that the user has not answered yet. */
export function pendingApprovals(messages: ModelMessage[]): PendingApproval[] {
  const answered = new Set<string>();
  const calls = new Map<string, Part>();
  for (const message of messages) {
    for (const part of parts(message)) {
      if (part.type === "tool-approval-response") answered.add(String(part.approvalId));
      if (part.type === "tool-call") calls.set(String(part.toolCallId), part);
    }
  }
  const pending: PendingApproval[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of parts(message)) {
      if (part.type !== "tool-approval-request" || part.isAutomatic) continue;
      if (answered.has(String(part.approvalId))) continue;
      const call = calls.get(String(part.toolCallId));
      pending.push({
        approvalId: String(part.approvalId),
        toolCallId: String(part.toolCallId),
        toolName: String(call?.toolName ?? ""),
        input: call?.input,
      });
    }
  }
  return pending;
}

/** The user's answers to pending changes, as the message the next turn starts from. */
export function approvalMessage(decisions: { approvalId: string; approved: boolean }[]): ModelMessage {
  return {
    role: "tool",
    content: decisions.map(({ approvalId, approved }) => ({
      type: "tool-approval-response" as const,
      approvalId,
      approved,
      ...(approved ? {} : { reason: "The user cancelled this change. Do not try it again unless they ask." }),
    })),
  };
}

/**
 * Closes changes the user walked away from, for when they send a new message instead of
 * answering a card. It records both their (implied) answer and the outcome, so the model
 * is told the change was not made.
 */
export function cancelledMessage(pending: PendingApproval[]): ModelMessage {
  const reason = "The user moved on without confirming, so this change was not made.";
  return {
    role: "tool",
    content: pending.flatMap((item) => [
      { type: "tool-approval-response" as const, approvalId: item.approvalId, approved: false, reason },
      {
        type: "tool-result" as const,
        toolCallId: item.toolCallId,
        toolName: item.toolName,
        output: { type: "execution-denied" as const, reason },
      },
    ]),
  };
}

export type ActionState = "pending" | "saving" | "done" | "cancelled" | "failed";

/** What the conversation looks like on screen. */
export type ViewItem =
  | { kind: "user"; key: string; text: string }
  | { kind: "assistant"; key: string; text: string }
  | { kind: "lookup"; key: string; toolName: string; input: unknown }
  | {
      kind: "action";
      key: string;
      approvalId: string;
      toolName: string;
      input: unknown;
      state: ActionState;
    };

const textOf = (message: ModelMessage): string =>
  typeof message.content === "string"
    ? message.content
    : parts(message)
        .filter((part) => part.type === "text")
        .map((part) => String(part.text ?? ""))
        .join("");

/** Turns the stored conversation into what is shown: messages, lookups and change cards. */
export function toView(messages: ModelMessage[]): ViewItem[] {
  const responses = new Map<string, boolean>();
  const results = new Map<string, Part>();
  const requests = new Map<string, string>();
  for (const message of messages) {
    for (const part of parts(message)) {
      if (part.type === "tool-approval-response") responses.set(String(part.approvalId), part.approved === true);
      if (part.type === "tool-result") results.set(String(part.toolCallId), part);
      if (part.type === "tool-approval-request") requests.set(String(part.toolCallId), String(part.approvalId));
    }
  }

  const items: ViewItem[] = [];
  messages.forEach((message, index) => {
    if (message.role === "user") {
      const text = textOf(message);
      if (text) items.push({ kind: "user", key: `m${index}`, text });
      return;
    }
    if (message.role !== "assistant") return;
    if (typeof message.content === "string") {
      if (message.content.trim()) items.push({ kind: "assistant", key: `m${index}`, text: message.content });
      return;
    }
    parts(message).forEach((part, at) => {
      const key = `m${index}p${at}`;
      if (part.type === "text" && String(part.text ?? "").trim()) {
        items.push({ kind: "assistant", key, text: String(part.text) });
      } else if (part.type === "tool-call") {
        const toolName = String(part.toolName);
        const toolCallId = String(part.toolCallId);
        if (!isWriteTool(toolName)) {
          items.push({ kind: "lookup", key, toolName, input: part.input });
          return;
        }
        const approvalId = requests.get(toolCallId);
        // A change that never reached the user (bad input, say) has nothing to show.
        if (!approvalId) return;
        items.push({
          kind: "action",
          key,
          approvalId,
          toolName,
          input: part.input,
          state: actionState(responses.get(approvalId), results.get(toolCallId)),
        });
      }
    });
  });
  return items;
}

function actionState(approved: boolean | undefined, result: Part | undefined): ActionState {
  if (approved === undefined) return "pending";
  if (!approved) return "cancelled";
  if (!result) return "saving";
  const output = result.output as { type?: string; value?: unknown } | undefined;
  if (output?.type === "execution-denied") return "cancelled";
  if (output?.type === "error-text" || output?.type === "error-json") return "failed";
  const value = output?.value;
  if (value && typeof value === "object" && (value as { saved?: unknown }).saved === false) return "cancelled";
  return "done";
}

import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

/** Test helpers: a stand-in model that plays back scripted replies, one per request. */

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

export type Scripted = { say: string } | { call: string; input: Record<string, unknown>; id?: string };

function chunks(reply: Scripted[], turn: number) {
  const out: Record<string, unknown>[] = [];
  let calledTool = false;
  reply.forEach((step, index) => {
    if ("say" in step) {
      const id = `text-${turn}-${index}`;
      out.push({ type: "text-start", id }, { type: "text-delta", id, delta: step.say }, { type: "text-end", id });
    } else {
      calledTool = true;
      out.push({
        type: "tool-call",
        toolCallId: step.id ?? `call-${turn}-${index}`,
        toolName: step.call,
        input: JSON.stringify(step.input),
      });
    }
  });
  out.push({
    type: "finish",
    finishReason: { unified: calledTool ? "tool-calls" : "stop", raw: undefined },
    logprobs: undefined,
    usage,
  });
  return out;
}

/**
 * A model that answers the first request with `replies[0]`, the second with
 * `replies[1]`, and so on. `requests` records what it was sent.
 */
export function scriptedModel(replies: Scripted[][]) {
  const requests: unknown[] = [];
  let turn = 0;
  const model = new MockLanguageModelV4({
    doStream: async (options: unknown) => {
      requests.push(options);
      const reply = replies[Math.min(turn, replies.length - 1)] ?? [];
      turn += 1;
      return { stream: simulateReadableStream({ chunks: chunks(reply, turn) as never[] }) };
    },
  });
  return { model, requests, turns: () => turn };
}

#!/usr/bin/env node
// A stand-in AI provider for trying the assistant without a real key or any cost.
// It speaks the OpenAI chat format (which is also what kinlo uses for Ollama), streams
// its replies, and follows a small script so that tools and change cards can be seen
// working end to end.
//
//   node scripts/fake-model.mjs            then, in kinlo's Settings:
//   Provider: OpenAI   Key: anything   Address: http://localhost:11500/v1   Model: fake-1
//
// It is a development tool only. It is not part of the app and nothing ships with it.

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 11500);
const seen = [];

const lastUser = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") return typeof m.content === "string" ? m.content : m.content.map((p) => p.text ?? "").join("");
  }
  return "";
};
const toolResults = (messages) => {
  const out = [];
  for (let i = messages.length - 1; i >= 0 && messages[i].role !== "user"; i--) {
    if (messages[i].role === "tool") out.unshift(messages[i]);
  }
  return out;
};

/** Decides what to "say" next: either text, or tool calls. */
function reply(body) {
  const messages = body.messages ?? [];
  const asked = lastUser(messages).toLowerCase();
  const results = toolResults(messages);
  const has = (name) => (body.tools ?? []).some((t) => t.function?.name === name);
  const call = (name, args) => ({ tool: name, args });
  const textOf = (r) => (typeof r.content === "string" ? r.content : JSON.stringify(r.content));
  const firstId = () => {
    for (const r of results) {
      const match = /"id":"([^"]+)"/.exec(textOf(r));
      if (match) return match[1];
    }
    return null;
  };
  const denied = results.some((r) => /cancel|denied/i.test(textOf(r)));
  const saved = results.some((r) => /"saved":true/.test(textOf(r)));

  if (asked.includes("catch up")) {
    if (!results.length) return [call("list_overdue_contacts", {})];
    const names = [...results.map(textOf).join(" ").matchAll(/"name":"([^"]+)"/g)].map((m) => m[1]);
    return names.length
      ? `You are overdue with ${names.length === 1 ? names[0] : names.slice(0, -1).join(", ") + " and " + names.at(-1)}.\n\n- **${names[0]}** has waited the longest.`
      : "Nobody is overdue. You are all caught up.";
  }
  if (asked.includes("remind")) {
    if (denied) return "No problem, I left it.";
    if (saved) return "Done. The reminder is set.";
    if (!results.length) return [call("search_contacts", { query: "Zoë" })];
    const id = firstId();
    const due = new Date(Date.now() + 86_400_000);
    const pad = (n) => String(n).padStart(2, "0");
    return [
      call("create_reminder", {
        title: "Call Zoë about the rebrand",
        due_at: `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T09:00`,
        ...(id ? { contact_id: id } : {}),
      }),
    ];
  }
  if (asked.includes("add ")) {
    if (denied) return "No problem, I did not add anyone.";
    if (saved) return "Added.";
    if (!results.length) return [call("search_contacts", { query: "Sam Rivera" })];
    return [
      call("create_contact", { name: "Sam Rivera", company: "Larkspur Co", how_we_met: "Design conference", keep_in_touch_days: 30 }),
    ];
  }
  if (asked.includes("deal") && has("list_deals")) {
    if (!results.length) return [call("list_deals", {})];
    return "Those are your open deals.";
  }
  if (asked.includes("fail")) return { status: 401 };
  return "I am a stand-in model for testing kinlo. Try asking who to catch up with, or to set a reminder.";
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = createServer(async (req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
  if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
  const url = new URL(req.url, "http://x");

  if (req.method === "GET" && url.pathname === "/__seen") {
    return res.writeHead(200, { ...cors, "Content-Type": "application/json" }).end(JSON.stringify(seen));
  }
  if (req.method === "GET" && url.pathname.endsWith("/models")) {
    if (req.headers.authorization === "Bearer wrong") {
      return res.writeHead(401, { ...cors, "Content-Type": "application/json" }).end('{"error":{"message":"bad key"}}');
    }
    return res
      .writeHead(200, { ...cors, "Content-Type": "application/json" })
      .end(JSON.stringify({ data: [{ id: "fake-1" }, { id: "fake-2-mini" }] }));
  }
  if (req.method === "POST" && url.pathname.endsWith("/chat/completions")) {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    seen.push({ authorization: req.headers.authorization ?? null, body });
    const next = reply(body);
    if (next && !Array.isArray(next) && typeof next === "object") {
      return res.writeHead(next.status, { ...cors, "Content-Type": "application/json" }).end('{"error":{"message":"refused"}}');
    }
    res.writeHead(200, { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    const base = { id: "chatcmpl-fake", object: "chat.completion.chunk", created: 0, model: body.model };
    const send = (delta, finish = null) =>
      res.write(`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    send({ role: "assistant", content: "" });
    if (typeof next === "string") {
      for (const word of next.split(/(?<= )/)) {
        send({ content: word });
        await sleep(25);
      }
      send({}, "stop");
    } else {
      next.forEach((c, index) =>
        send({
          tool_calls: [
            { index, id: `call_${seen.length}_${index}`, type: "function", function: { name: c.tool, arguments: JSON.stringify(c.args) } },
          ],
        }),
      );
      send({}, "tool_calls");
    }
    res.write("data: [DONE]\n\n");
    return res.end();
  }
  res.writeHead(404, cors).end();
});

server.listen(PORT, "127.0.0.1", () => console.log(`fake model on http://localhost:${PORT}/v1`));

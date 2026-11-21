import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanBaseUrl, configFrom, explainError, HttpError, listModels } from "./providers";

type Call = { url: string; headers: Record<string, string> };

/** Replaces the network with a canned answer and records what was asked. */
function stubFetch(body: unknown, status = 200) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: { ...(init?.headers as Record<string, string>) } });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("listing models", () => {
  it("asks Anthropic, with the key in its own header", async () => {
    const calls = stubFetch({ data: [{ id: "model-b" }, { id: "model-a" }] });
    expect(await listModels("anthropic", "sk-ant", null)).toEqual(["model-a", "model-b"]);
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).host).toBe("api.anthropic.com");
    expect(calls[0]!.headers["x-api-key"]).toBe("sk-ant");
  });

  it("asks OpenAI and leaves out what is not a chat model", async () => {
    const calls = stubFetch({
      data: [{ id: "chat-large" }, { id: "text-embedding-3" }, { id: "whisper-1" }, { id: "tts-1" }, { id: "chat-mini" }],
    });
    expect(await listModels("openai", "sk-open", null)).toEqual(["chat-large", "chat-mini"]);
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/models");
    expect(calls[0]!.headers.Authorization).toBe("Bearer sk-open");
  });

  it("uses a custom address for OpenAI-style services, and lists everything they offer", async () => {
    const calls = stubFetch({ data: [{ id: "local-embed-chat" }, { id: "llama" }] });
    expect(await listModels("openai", "anything", "http://localhost:1234/v1/")).toEqual(["llama", "local-embed-chat"]);
    expect(calls[0]!.url).toBe("http://localhost:1234/v1/models");
  });

  it("asks Google, and keeps only models that can write text", async () => {
    const calls = stubFetch({
      models: [
        { name: "models/gem-pro", supportedGenerationMethods: ["generateContent"] },
        { name: "models/gem-embed", supportedGenerationMethods: ["embedContent"] },
      ],
    });
    expect(await listModels("google", "g-key", null)).toEqual(["gem-pro"]);
    expect(new URL(calls[0]!.url).host).toBe("generativelanguage.googleapis.com");
    // The key goes in a header, not in the address, so it cannot end up in a log of URLs.
    expect(calls[0]!.url).not.toContain("g-key");
    expect(calls[0]!.headers["x-goog-api-key"]).toBe("g-key");
  });

  it("asks Ollama on this computer, with no key", async () => {
    const calls = stubFetch({ models: [{ name: "llama3:latest" }] });
    expect(await listModels("ollama", null, null)).toEqual(["llama3:latest"]);
    expect(calls[0]!.url).toBe("http://localhost:11434/api/tags");
    expect(calls[0]!.headers).toEqual({});
  });

  it("ignores a custom address for providers that do not have one", async () => {
    const calls = stubFetch({ data: [] });
    await listModels("anthropic", "sk-ant", "https://elsewhere.example");
    expect(new URL(calls[0]!.url).host).toBe("api.anthropic.com");
  });

  it("fails when the key is refused", async () => {
    stubFetch({ error: "no" }, 401);
    await expect(listModels("openai", "bad", null)).rejects.toMatchObject({ status: 401 });
  });
});

describe("explaining what went wrong", () => {
  it("uses plain words", () => {
    expect(explainError(new HttpError(401), "anthropic")).toBe("Anthropic did not accept that key.");
    expect(explainError({ statusCode: 404 }, "openai")).toBe("That model or address was not found.");
    expect(explainError(new HttpError(429), "google")).toContain("limit");
    expect(explainError(new HttpError(503), "openai")).toContain("trouble");
    expect(explainError(new TypeError("fetch failed"), "ollama")).toContain("Check that it is running");
    expect(explainError(new TypeError("fetch failed"), "anthropic")).toContain("Check your connection");
  });

  it("never repeats the error's own text, which could hold anything", () => {
    const message = explainError(Object.assign(new Error("secret sk-123 in body"), { statusCode: 400 }), "openai");
    expect(message).not.toContain("sk-123");
  });
});

describe("settings to configuration", () => {
  it("needs a provider and a model", () => {
    expect(configFrom({ aiProvider: null, aiModel: "m", aiBaseUrl: null })).toBeNull();
    expect(configFrom({ aiProvider: "openai", aiModel: "  ", aiBaseUrl: null })).toBeNull();
    expect(configFrom({ aiProvider: "openai", aiModel: " m ", aiBaseUrl: "http://x/v1/" })).toEqual({
      provider: "openai",
      model: "m",
      baseUrl: "http://x/v1",
    });
  });

  it("only accepts web addresses", () => {
    expect(cleanBaseUrl("https://api.example.com/v1//")).toBe("https://api.example.com/v1");
    expect(cleanBaseUrl("  ")).toBeNull();
    expect(cleanBaseUrl("file:///etc/passwd")).toBeNull();
    expect(cleanBaseUrl("not a url")).toBeNull();
  });
});

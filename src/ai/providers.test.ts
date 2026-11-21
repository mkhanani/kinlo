import { afterEach, describe, expect, it, vi } from "vitest";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { runTurn } from "./engine";
import { cleanBaseUrl, configFrom, errorDetail, explainError, HttpError, listModels, redact } from "./providers";

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

/** An error the way the AI SDK hands it over after it has tried twice. */
function retried(inner: unknown) {
  return Object.assign(new Error("Failed after 2 attempts. Last error: something"), {
    name: "AI_RetryError",
    reason: "maxRetriesExceeded",
    lastError: inner,
  });
}

/** An error the way the AI SDK reports a provider's refusal. */
function apiError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { name: "AI_APICallError", statusCode });
}

describe("explaining a request that was tried twice", () => {
  it("says what the provider said, not that there is no connection", () => {
    expect(explainError(retried(apiError(429, "quota")), "google")).toBe(
      "Google says you have hit a limit. Try again in a little while, or pick another model.",
    );
    expect(explainError(retried(apiError(503, "overloaded")), "google")).toBe(
      "Google is having trouble right now. Try again in a little while.",
    );
    // A connection that really failed, twice, is still a connection problem.
    expect(explainError(retried(new TypeError("fetch failed")), "google")).toBe(
      "kinlo could not reach Google. Check your connection.",
    );
  });

  it("tells an answer it could not read apart from no answer at all", () => {
    const unreadable = Object.assign(new Error("Type validation failed"), { name: "AI_TypeValidationError" });
    expect(explainError(unreadable, "google")).toBe("Google sent an answer kinlo could not read.");
  });
});

describe("the provider's own words", () => {
  it("are passed on, shortened, under the provider's name", () => {
    const quota = "You exceeded your current quota.\n  Quota exceeded for metric: free_tier_requests, limit: 0, model: gemini-4-argon";
    expect(errorDetail(retried(apiError(429, quota)), "google")).toBe(
      "Google said: You exceeded your current quota. Quota exceeded for metric: free_tier_requests, limit: 0, model: gemini-4-argon",
    );
    const long = errorDetail(apiError(400, "x".repeat(900)), "openai")!;
    expect(long.length).toBeLessThanOrEqual("OpenAI said: ".length + 280);
    expect(long.endsWith("…")).toBe(true);
  });

  it("are labelled differently when nobody answered", () => {
    expect(errorDetail(new TypeError("error sending request"), "google")).toBe("Details: error sending request");
    expect(errorDetail("connection closed", "anthropic")).toBe("Details: connection closed");
    expect(errorDetail(null, "google")).toBeNull();
    expect(errorDetail(new Error("   "), "google")).toBeNull();
  });

  it("never show a key, the saved one or anything shaped like one", () => {
    const saved = "my-own-unusual-key-123456";
    const detail = errorDetail(
      apiError(
        401,
        `Incorrect API key provided: ${saved}. Also sk-proj-abcdef123456, AIzaSyA1234567890abcdef, Bearer eyJhbGciOi.abc and https://x.example/v1?key=zzzz9999&alt=sse`,
      ),
      "openai",
      [saved],
    )!;
    for (const secret of [saved, "sk-proj-abcdef123456", "AIzaSyA1234567890abcdef", "eyJhbGciOi.abc", "zzzz9999"]) {
      expect(detail).not.toContain(secret);
    }
    expect(detail).toContain("Incorrect API key provided");
    expect(redact("nothing secret here")).toBe("nothing secret here");
  });
});

describe("a real provider adapter, with the network replaced", () => {
  /** Runs one question through Google's adapter, answering every request the same way. */
  async function ask(status: number, message: string) {
    let calls = 0;
    const google = createGoogleGenerativeAI({
      apiKey: "AIzaSyTESTKEY1234567890",
      fetch: async () => {
        calls++;
        return new Response(JSON.stringify({ error: { code: status, message, status: "X" } }), {
          status,
          headers: { "content-type": "application/json" },
        });
      },
    });
    const failure = await runTurn({
      model: google("gemini-test"),
      instructions: "x",
      messages: [{ role: "user", content: "Whose birthday is next?" }],
      tools: {},
    }).then(
      () => null,
      (error: unknown) => error,
    );
    return { calls, failure };
  }

  it("reports a spent quota as a limit, with Google's reason", async () => {
    const { calls, failure } = await ask(429, "Quota exceeded for metric: free_tier_requests, limit: 0");
    expect(calls).toBe(2); // tried again once, as intended
    expect(explainError(failure, "google")).toContain("hit a limit");
    expect(errorDetail(failure, "google", ["AIzaSyTESTKEY1234567890"])).toBe(
      "Google said: Quota exceeded for metric: free_tier_requests, limit: 0",
    );
  });

  it("reports an overloaded model as trouble on Google's side", async () => {
    const { failure } = await ask(503, "The model is overloaded. Please try again later.");
    expect(explainError(failure, "google")).toBe("Google is having trouble right now. Try again in a little while.");
    expect(errorDetail(failure, "google")).toBe("Google said: The model is overloaded. Please try again later.");
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

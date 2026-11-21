import type { LanguageModel } from "ai";
import type { AiProvider, Settings } from "@/data/settings";
import { httpFetch } from "./http";

export interface ProviderInfo {
  label: string;
  /** Ollama runs on your own computer and needs no key. */
  needsKey: boolean;
  /** Where the user gets a key. */
  keyUrl?: string;
  /** Used when no address has been set. */
  defaultBaseUrl: string;
  /** Whether the address can be changed in Settings. */
  customBaseUrl: boolean;
  /** Runs on this computer, so nothing is sent anywhere. */
  local: boolean;
}

export const PROVIDERS: Record<AiProvider, ProviderInfo> = {
  anthropic: {
    label: "Anthropic",
    needsKey: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    customBaseUrl: false,
    local: false,
  },
  openai: {
    label: "OpenAI",
    needsKey: true,
    keyUrl: "https://platform.openai.com/api-keys",
    defaultBaseUrl: "https://api.openai.com/v1",
    customBaseUrl: true,
    local: false,
  },
  google: {
    label: "Google",
    needsKey: true,
    keyUrl: "https://aistudio.google.com/apikey",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    customBaseUrl: false,
    local: false,
  },
  ollama: {
    label: "Ollama",
    needsKey: false,
    defaultBaseUrl: "http://localhost:11434",
    customBaseUrl: true,
    local: true,
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as AiProvider[];

/** What is needed to talk to a model. */
export interface AiConfig {
  provider: AiProvider;
  model: string;
  /** Null means the provider's own address. */
  baseUrl: string | null;
}

/** The chosen provider and model, or null when the assistant is not set up yet. */
export function configFrom(settings: Pick<Settings, "aiProvider" | "aiModel" | "aiBaseUrl">): AiConfig | null {
  if (!settings.aiProvider || !settings.aiModel?.trim()) return null;
  return { provider: settings.aiProvider, model: settings.aiModel.trim(), baseUrl: cleanBaseUrl(settings.aiBaseUrl) };
}

/** Trims an address and drops trailing slashes. Null when it is empty or not http(s). */
export function cleanBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, "") ?? "";
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

function baseUrlFor(provider: AiProvider, baseUrl: string | null): string {
  const info = PROVIDERS[provider];
  return (info.customBaseUrl ? cleanBaseUrl(baseUrl) : null) ?? info.defaultBaseUrl;
}

/** Anthropic refuses calls that look like they come from a web page unless this is set. */
const ANTHROPIC_HEADERS = { "anthropic-dangerous-direct-browser-access": "true" };

/** Builds the model the assistant talks to. Provider code is loaded only when used. */
export async function createModel(config: AiConfig, key: string | null): Promise<LanguageModel> {
  const custom = PROVIDERS[config.provider].customBaseUrl ? cleanBaseUrl(config.baseUrl) : null;
  switch (config.provider) {
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey: key ?? "", fetch: httpFetch, headers: ANTHROPIC_HEADERS })(config.model);
    }
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const openai = createOpenAI({ apiKey: key ?? "", fetch: httpFetch, ...(custom ? { baseURL: custom } : {}) });
      // The chat format, on purpose. It keeps nothing on OpenAI's side between requests,
      // and it is the one that servers copying OpenAI's API (LM Studio, OpenRouter and
      // others) understand.
      return openai.chat(config.model);
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      return createGoogleGenerativeAI({ apiKey: key ?? "", fetch: httpFetch })(config.model);
    }
    case "ollama": {
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      const ollama = createOpenAICompatible({
        name: "ollama",
        baseURL: `${baseUrlFor("ollama", config.baseUrl)}/v1`,
        fetch: httpFetch,
        ...(key ? { apiKey: key } : {}),
      });
      return ollama(config.model);
    }
  }
}

/** Names that are clearly not chat models, hidden from OpenAI's long list. */
const NOT_CHAT = /embed|whisper|tts|dall-e|image|audio|realtime|moderation|transcribe|davinci|babbage|sora|search/i;

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const response = await httpFetch(url, { headers });
  if (!response.ok) throw new HttpError(response.status);
  return response.json();
}

export class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

function names(list: unknown, field: string): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>)[field] : null))
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

/**
 * Asks the provider which models this key can use. Throws when the provider cannot be
 * reached or refuses the key; the caller then lets the user type a model name instead.
 */
export async function listModels(provider: AiProvider, key: string | null, baseUrl: string | null): Promise<string[]> {
  const base = baseUrlFor(provider, baseUrl);
  let models: string[];
  switch (provider) {
    case "anthropic": {
      const body = (await getJson(`${base}/models?limit=1000`, {
        "x-api-key": key ?? "",
        "anthropic-version": "2023-06-01",
        ...ANTHROPIC_HEADERS,
      })) as { data?: unknown };
      models = names(body.data, "id");
      break;
    }
    case "openai": {
      const body = (await getJson(`${base}/models`, key ? { Authorization: `Bearer ${key}` } : {})) as {
        data?: unknown;
      };
      models = names(body.data, "id");
      // Only OpenAI itself mixes chat models with dozens of others.
      if (!cleanBaseUrl(baseUrl)) models = models.filter((id) => !NOT_CHAT.test(id));
      break;
    }
    case "google": {
      const body = (await getJson(`${base}/models?pageSize=1000`, { "x-goog-api-key": key ?? "" })) as {
        models?: unknown;
      };
      const usable = Array.isArray(body.models)
        ? body.models.filter((model) => {
            const methods = (model as { supportedGenerationMethods?: unknown }).supportedGenerationMethods;
            return !Array.isArray(methods) || methods.includes("generateContent");
          })
        : [];
      models = names(usable, "name").map((name) => name.replace(/^models\//, ""));
      break;
    }
    case "ollama": {
      const body = (await getJson(`${base}/api/tags`, key ? { Authorization: `Bearer ${key}` } : {})) as {
        models?: unknown;
      };
      models = names(body.models, "name");
      break;
    }
  }
  return [...new Set(models)].sort((a, b) => a.localeCompare(b));
}

/**
 * The error that says what actually happened. The AI SDK tries a request again when the
 * provider is busy or says "slow down", and when that fails too it wraps the provider's
 * answer in an error of its own. Without unwrapping, a limit or an overloaded model would
 * look like no connection at all.
 */
function rootError(error: unknown): unknown {
  let current = error;
  for (let depth = 0; depth < 5; depth++) {
    if (!current || typeof current !== "object" || ownStatus(current) !== null) break;
    const inner = (current as { lastError?: unknown }).lastError ?? (current as { cause?: unknown }).cause;
    if (inner === undefined || inner === null) break;
    current = inner;
  }
  return current;
}

function ownStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode;
  return typeof candidate === "number" ? candidate : null;
}

function statusOf(error: unknown): number | null {
  return ownStatus(rootError(error));
}

/** True when the provider answered, but with something the AI SDK could not make sense of. */
function isUnreadableAnswer(error: unknown): boolean {
  const name = (rootError(error) as { name?: unknown } | null)?.name;
  return typeof name === "string" && name.startsWith("AI_") && name !== "AI_APICallError" && name !== "AI_RetryError";
}

/** A short, plain explanation of what went wrong. Never the error's own text. */
export function explainError(error: unknown, provider: AiProvider): string {
  const info = PROVIDERS[provider];
  const status = statusOf(error);
  if (status === 401 || status === 403) {
    return info.needsKey ? `${info.label} did not accept that key.` : `${info.label} refused the request.`;
  }
  if (status === 404) return "That model or address was not found.";
  if (status === 429) return `${info.label} says you have hit a limit. Try again in a little while, or pick another model.`;
  if (status !== null && status >= 500) return `${info.label} is having trouble right now. Try again in a little while.`;
  if (status !== null) return `${info.label} answered with an error (${status}).`;
  if (isUnreadableAnswer(error)) return `${info.label} sent an answer kinlo could not read.`;
  if (info.local) return "kinlo could not reach Ollama. Check that it is running on this computer.";
  return `kinlo could not reach ${info.label}. Check your connection.`;
}

const DETAIL_LIMIT = 280;

/** Takes out anything that looks like a key, and the given keys themselves. */
export function redact(text: string, secrets: (string | null | undefined)[] = []): string {
  let clean = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 6) clean = clean.split(secret).join("***");
  }
  return clean
    .replace(/\b(Bearer|Basic)\s+[^\s"',]+/gi, "$1 ***")
    .replace(/\b((?:api[-_]?)?key|token|secret|password)=[^&\s"']+/gi, "$1=***")
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_*.-]{6,}/g, "***")
    .replace(/\bAIza[0-9A-Za-z_-]{10,}/g, "***");
}

/**
 * What the provider itself said, to show under the plain explanation: it is often the only
 * way to tell a spent quota from a model that a key cannot use. Keys are taken out first,
 * and it is shown on screen only: never saved, never logged.
 */
export function errorDetail(error: unknown, provider: AiProvider, secrets: (string | null | undefined)[] = []): string | null {
  const root = rootError(error);
  const raw = typeof root === "string" ? root : root instanceof Error ? root.message : null;
  if (!raw) return null;
  const tidy = redact(raw, secrets).replace(/\s+/g, " ").trim();
  if (!tidy) return null;
  const short = tidy.length > DETAIL_LIMIT ? `${tidy.slice(0, DETAIL_LIMIT - 1).trimEnd()}…` : tidy;
  return statusOf(error) !== null ? `${PROVIDERS[provider].label} said: ${short}` : `Details: ${short}`;
}

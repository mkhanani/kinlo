import { isTauri } from "@/lib/platform";

/**
 * The only way kinlo talks to the network. In the app, requests go through Tauri's HTTP
 * plugin, which is not held back by the browser's cross-origin rules; AI providers do
 * not allow calls from a web page otherwise. In a plain browser it is ordinary fetch.
 *
 * It is only ever called with the address of the AI provider the user configured.
 */
export const httpFetch: typeof globalThis.fetch = async (input, init) => {
  if (isTauri) {
    const { fetch } = await import("@tauri-apps/plugin-http");
    return fetch(input, init);
  }
  return globalThis.fetch(input, init);
};

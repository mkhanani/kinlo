/**
 * Build channel. One codebase, three flavors:
 *
 *   dev         app.kinlo.desktop.dev       local `npm run app:dev`
 *   staging     app.kinlo.desktop.staging   pushes to the `staging` branch
 *   production  app.kinlo.desktop           `v*` tags on `main`
 *
 * The Rust shell derives the channel from the app identifier and injects it as
 * `window.__KINLO_CHANNEL__` before any app code runs. Each channel has its own
 * data directory and keychain service, so they never see each other's data.
 */
export type Channel = "dev" | "staging" | "production";

declare global {
  interface Window {
    __KINLO_CHANNEL__?: string;
  }
}

export function parseChannel(value: unknown): Channel {
  // Anything unrecognised is treated as dev, never as production.
  return value === "production" || value === "staging" ? value : "dev";
}

export const channel: Channel = parseChannel(typeof window !== "undefined" ? window.__KINLO_CHANNEL__ : undefined);

export const isProduction = channel === "production";

/** Short label shown next to the wordmark on non-production builds. */
export const channelLabel: string | null = isProduction ? null : channel;

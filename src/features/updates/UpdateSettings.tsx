import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SettingRow as Row } from "@/components/ui/SettingRow";
import { openExternal } from "@/lib/external";
import {
  RELEASES_URL,
  appVersion,
  canUpdate,
  checkForUpdate,
  installUpdate,
  releaseUrl,
  updateError,
  type UpdateStep,
} from "@/lib/updates";

type State =
  | { at: "idle" }
  | { at: "checking" }
  | { at: "current" }
  | { at: "available"; version: string }
  | { at: "installing"; version: string; step: UpdateStep | null }
  | { at: "failed"; message: string; version: string | null };

const linkClass = "underline decoration-hairline underline-offset-2 transition-colors duration-200 hover:text-fg";

/** How far along a download is, when the size is known. */
export function progressText(step: UpdateStep | null): string {
  if (!step) return "Starting the download.";
  if (step.step === "installing") return "Installing. kinlo will open again in a moment.";
  if (!step.total) return "Downloading.";
  return `Downloading, ${Math.min(100, Math.round((step.received / step.total) * 100))}%.`;
}

/** The running version, and the one button that looks for a newer one. */
export function UpdateSettings() {
  const [version, setVersion] = useState<string | null>(null);
  const [state, setState] = useState<State>({ at: "idle" });

  useEffect(() => {
    void appVersion()
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  if (!canUpdate()) return null;

  const check = async () => {
    setState({ at: "checking" });
    try {
      const found = await checkForUpdate();
      setState(found ? { at: "available", version: found } : { at: "current" });
    } catch (error) {
      setState({ at: "failed", message: updateError(error), version: null });
    }
  };

  const install = async (next: string) => {
    setState({ at: "installing", version: next, step: null });
    try {
      // When this works kinlo closes, so the line after it only runs on a failure.
      await installUpdate((step) => setState({ at: "installing", version: next, step }));
    } catch (error) {
      setState({ at: "failed", message: updateError(error), version: next });
    }
  };

  const hint = () => {
    switch (state.at) {
      case "idle":
        return "kinlo only looks for a new version when you press this. It asks GitHub, where kinlo is published.";
      case "checking":
        return "Asking GitHub.";
      case "current":
        return "You have the latest version.";
      case "available":
        return (
          <>
            Version {state.version} is ready. kinlo will close, update and open again. Your data is not touched.{" "}
            <button className={linkClass} onClick={() => void openExternal(releaseUrl(state.version))}>
              See what changed
            </button>
          </>
        );
      case "installing":
        return progressText(state.step);
      case "failed":
        return (
          <>
            <span className="text-danger">{state.message}</span>{" "}
            <button className={linkClass} onClick={() => void openExternal(RELEASES_URL)}>
              Download it yourself
            </button>
          </>
        );
    }
  };

  const control = () => {
    switch (state.at) {
      case "available":
        return (
          <Button variant="primary" onClick={() => void install(state.version)}>
            Update and restart
          </Button>
        );
      case "installing":
        return <Button disabled>Updating</Button>;
      case "checking":
        return <Button disabled>Checking</Button>;
      case "failed":
        return (
          <Button onClick={() => void (state.version ? install(state.version) : check())}>Try again</Button>
        );
      default:
        return <Button onClick={() => void check()}>Check for updates</Button>;
    }
  };

  return (
    <section aria-label="Updates">
      <h2 className="mb-2 mt-8 px-1 text-sm font-medium tracking-normal text-muted">Updates</h2>
      <div className="glass divide-y divide-hairline">
        <Row label={version ? `kinlo ${version}` : "kinlo"} hint={<span aria-live="polite">{hint()}</span>}>
          {control()}
        </Row>
      </div>
    </section>
  );
}

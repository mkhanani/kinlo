import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useTestDatabase } from "@/data/testing";
import * as external from "@/lib/external";
import * as updates from "@/lib/updates";
import { renderApp } from "@/test/render";
import { progressText } from "./UpdateSettings";

useTestDatabase();

afterEach(() => vi.restoreAllMocks());

/** Stands in for the released app, where updating is possible. */
function released(version = "0.2.0") {
  vi.spyOn(updates, "canUpdate").mockReturnValue(true);
  vi.spyOn(updates, "appVersion").mockResolvedValue(version);
}

const section = () => within(screen.getByRole("region", { name: "Updates" }));

describe("Updates, in Settings", () => {
  it("is not offered outside the released app", async () => {
    renderApp("/settings");
    await screen.findByRole("region", { name: "Your data" });
    expect(screen.queryByRole("region", { name: "Updates" })).not.toBeInTheDocument();
  });

  it("shows the running version and looks for nothing until asked", async () => {
    released();
    const check = vi.spyOn(updates, "checkForUpdate").mockResolvedValue(null);
    renderApp("/settings");

    expect(await section().findByText("kinlo 0.2.0")).toBeInTheDocument();
    expect(section().getByText(/only looks for a new version when you press this/)).toBeInTheDocument();
    expect(check).not.toHaveBeenCalled();
  });

  it("says so when there is nothing newer", async () => {
    released();
    vi.spyOn(updates, "checkForUpdate").mockResolvedValue(null);
    renderApp("/settings");

    fireEvent.click(await section().findByRole("button", { name: "Check for updates" }));
    expect(await section().findByText("You have the latest version.")).toBeInTheDocument();
    // It can be asked again.
    expect(section().getByRole("button", { name: "Check for updates" })).toBeEnabled();
  });

  it("offers a newer version, and installs it only on a second press", async () => {
    released();
    vi.spyOn(updates, "checkForUpdate").mockResolvedValue("0.3.0");
    let report: (step: updates.UpdateStep) => void = () => {};
    const install = vi.spyOn(updates, "installUpdate").mockImplementation((onStep) => {
      report = onStep;
      return new Promise(() => {}); // the real one never comes back: the app restarts
    });
    renderApp("/settings");

    fireEvent.click(await section().findByRole("button", { name: "Check for updates" }));
    expect(await section().findByText(/Version 0\.3\.0 is ready/)).toBeInTheDocument();
    expect(install).not.toHaveBeenCalled();

    fireEvent.click(section().getByRole("button", { name: "Update and restart" }));
    expect(await section().findByText("Starting the download.")).toBeInTheDocument();
    expect(section().getByRole("button", { name: "Updating" })).toBeDisabled();

    act(() => report({ step: "downloading", received: 2_500_000, total: 10_000_000 }));
    expect(section().getByText("Downloading, 25%.")).toBeInTheDocument();
    act(() => report({ step: "installing" }));
    expect(section().getByText("Installing. kinlo will open again in a moment.")).toBeInTheDocument();
  });

  it("links to what changed in the new version", async () => {
    released();
    vi.spyOn(updates, "checkForUpdate").mockResolvedValue("0.3.0");
    const open = vi.spyOn(external, "openExternal").mockResolvedValue();
    renderApp("/settings");

    fireEvent.click(await section().findByRole("button", { name: "Check for updates" }));
    fireEvent.click(await section().findByRole("button", { name: "See what changed" }));
    expect(open).toHaveBeenCalledWith("https://github.com/mkhanani/kinlo/releases/tag/v0.3.0");
  });

  it("explains a check that failed and offers the download page", async () => {
    released();
    const check = vi
      .spyOn(updates, "checkForUpdate")
      .mockRejectedValueOnce("Could not reach GitHub. Check your connection and try again.")
      .mockResolvedValueOnce(null);
    const open = vi.spyOn(external, "openExternal").mockResolvedValue();
    renderApp("/settings");

    fireEvent.click(await section().findByRole("button", { name: "Check for updates" }));
    expect(await section().findByText("Could not reach GitHub. Check your connection and try again.")).toBeInTheDocument();

    fireEvent.click(section().getByRole("button", { name: "Download it yourself" }));
    expect(open).toHaveBeenCalledWith("https://github.com/mkhanani/kinlo/releases/latest");

    fireEvent.click(section().getByRole("button", { name: "Try again" }));
    expect(await section().findByText("You have the latest version.")).toBeInTheDocument();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it("explains an install that failed, and trying again installs rather than checks", async () => {
    released();
    const check = vi.spyOn(updates, "checkForUpdate").mockResolvedValue("0.3.0");
    const install = vi
      .spyOn(updates, "installUpdate")
      .mockRejectedValueOnce("The download could not be verified, so it was not installed.")
      .mockReturnValueOnce(new Promise(() => {}));
    renderApp("/settings");

    fireEvent.click(await section().findByRole("button", { name: "Check for updates" }));
    fireEvent.click(await section().findByRole("button", { name: "Update and restart" }));
    expect(
      await section().findByText("The download could not be verified, so it was not installed."),
    ).toBeInTheDocument();

    fireEvent.click(section().getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(install).toHaveBeenCalledTimes(2));
    expect(check).toHaveBeenCalledTimes(1);
  });
});

describe("progress wording", () => {
  it("copes with a download of unknown size, and never passes 100%", () => {
    expect(progressText(null)).toBe("Starting the download.");
    expect(progressText({ step: "downloading", received: 10, total: null })).toBe("Downloading.");
    expect(progressText({ step: "downloading", received: 12, total: 10 })).toBe("Downloading, 100%.");
  });
});

describe("failure wording", () => {
  it("shows what the app said, or a plain sentence when it said nothing useful", () => {
    expect(updates.updateError("Could not reach GitHub.")).toBe("Could not reach GitHub.");
    expect(updates.updateError(new Error("Boom"))).toBe("Boom");
    expect(updates.updateError(undefined)).toBe("The update could not be installed. Nothing was changed.");
  });
});

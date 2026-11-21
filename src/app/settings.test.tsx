import { describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { loadSettings, saveSetting } from "@/data";
import { useTestDatabase } from "@/data/testing";
import { applyTheme } from "@/lib/theme";
import { media } from "@/test/setup";
import { createQueryClient } from "./queryClient";
import { useSaveSetting, useSettings, useThemeSync } from "./settings";

useTestDatabase();

const theme = () => document.documentElement.dataset.theme;

function Probe() {
  const settings = useSettings();
  const save = useSaveSetting();
  useThemeSync();
  return (
    <div>
      <output>{`${settings.theme}/${settings.sides}`}</output>
      <button onClick={() => save("theme", "light")}>light</button>
      <button onClick={() => save("sides", "personal")}>hide</button>
    </div>
  );
}

const renderProbe = () =>
  render(
    <QueryClientProvider client={createQueryClient()}>
      <Probe />
    </QueryClientProvider>,
  );

describe("settings in the app", () => {
  it("reads saved settings from the database", async () => {
    await saveSetting("theme", "dark");
    renderProbe();
    expect(await screen.findByText("dark/both")).toBeInTheDocument();
  });

  it("saving updates the screen and the database", async () => {
    renderProbe();
    await screen.findByText("system/both");
    act(() => screen.getByText("hide").click());
    expect(await screen.findByText("system/personal")).toBeInTheDocument();
    await waitFor(async () => expect((await loadSettings()).sides).toBe("personal"));
  });

  it("applies the chosen theme to the document", async () => {
    media.prefersDark = true;
    renderProbe();
    await waitFor(() => expect(theme()).toBe("dark"));
    act(() => screen.getByText("light").click());
    await waitFor(() => expect(theme()).toBe("light"));
    expect(localStorage.getItem("kinlo.theme")).toBe("light");
  });
});

describe("applyTheme", () => {
  it("follows the system when set to system", () => {
    media.prefersDark = true;
    applyTheme("system");
    expect(theme()).toBe("dark");
    media.prefersDark = false;
    applyTheme("system");
    expect(theme()).toBe("light");
  });

  it("lets a manual choice override the system", () => {
    media.prefersDark = true;
    applyTheme("light");
    expect(theme()).toBe("light");
  });
});

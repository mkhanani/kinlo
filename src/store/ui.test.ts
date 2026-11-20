import { beforeEach, describe, expect, it } from "vitest";
import { media } from "@/test/setup";
import { applyTheme, useUI } from "./ui";

const theme = () => document.documentElement.dataset.theme;

describe("theme", () => {
  beforeEach(() => useUI.setState({ theme: "system" }));

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
    useUI.getState().setTheme("light");
    expect(theme()).toBe("light");
    expect(useUI.getState().theme).toBe("light");
  });

  it("remembers the choice", () => {
    useUI.getState().setTheme("dark");
    expect(localStorage.getItem("kinlo.theme")).toBe("dark");
  });
});

describe("assistant panel", () => {
  it("toggles, and can be forced open or closed", () => {
    useUI.setState({ assistantOpen: false });
    useUI.getState().toggleAssistant();
    expect(useUI.getState().assistantOpen).toBe(true);
    useUI.getState().toggleAssistant(true);
    expect(useUI.getState().assistantOpen).toBe(true);
    useUI.getState().toggleAssistant(false);
    expect(useUI.getState().assistantOpen).toBe(false);
  });
});

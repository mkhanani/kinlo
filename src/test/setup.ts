import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no matchMedia. Tests can flip `prefersDark` to simulate the OS theme.
export const media = { prefersDark: true };

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    get matches() {
      return query.includes("dark") ? media.prefersDark : false;
    },
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }),
});

// Bits of the browser that jsdom leaves out and the menu and popover components expect.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};

afterEach(() => {
  cleanup();
  localStorage.clear();
  media.prefersDark = true;
});

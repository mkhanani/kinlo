/**
 * Every keyboard shortcut, in the order they are listed for the user. "mod" is Ctrl on
 * Windows and Linux and Cmd on macOS. The handlers live in useShortcuts.
 */
export interface Shortcut {
  keys: string[];
  label: string;
  /** Only on the business side. */
  business?: boolean;
  /** Only when both sides are switched on. */
  bothSides?: boolean;
}

export const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: "Anywhere",
    items: [
      { keys: ["mod", "K"], label: "Search, jump to a page, or quick add" },
      { keys: ["mod", "J"], label: "Open or close the assistant" },
      { keys: ["mod", "/"], label: "Show this list" },
      { keys: ["Esc"], label: "Close what is open" },
    ],
  },
  {
    group: "Add",
    items: [
      { keys: ["mod", "N"], label: "Add a person" },
      { keys: ["mod", "Shift", "N"], label: "Add a reminder" },
      { keys: ["mod", "Shift", "D"], label: "Add a deal", business: true },
    ],
  },
  {
    group: "Go to",
    items: [
      { keys: ["mod", "1"], label: "Home" },
      { keys: ["mod", "2"], label: "People" },
      { keys: ["mod", "3"], label: "Pipeline", business: true },
      { keys: ["mod", "4"], label: "Reminders" },
      { keys: ["mod", ","], label: "Settings" },
      { keys: ["mod", "Shift", "S"], label: "Switch between Personal and Business", bothSides: true },
    ],
  },
];

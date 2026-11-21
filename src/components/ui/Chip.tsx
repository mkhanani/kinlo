import type { ReactNode } from "react";

/** A small label: a tag, a kind, a status. */
export function Chip({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "strong" }) {
  return (
    <span
      className={`inline-flex h-5 items-center rounded-full border border-hairline px-2 text-xs leading-none ${
        tone === "strong" ? "bg-fg text-bg" : "bg-control text-muted"
      }`}
    >
      {children}
    </span>
  );
}

/** A chip you can switch on and off, for filters. */
export function ToggleChip({
  pressed,
  onPressedChange,
  children,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={`inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-hairline px-2.5 text-sm transition-colors duration-200 ${
        pressed ? "bg-active text-fg" : "bg-control text-muted hover:bg-control-hover hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

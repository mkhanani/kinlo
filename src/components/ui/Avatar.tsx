/** Up to two initials from a name. "Zoë Nakamura" gives "ZN". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0]!)[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1]!)[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-hairline bg-control font-medium text-muted"
    >
      {initials(name)}
    </span>
  );
}

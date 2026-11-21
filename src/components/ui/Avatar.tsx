import { useAvatars } from "@/data/hooks";

/** Up to two initials from a name. "Zoë Nakamura" gives "ZN". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0]!)[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1]!)[0] ?? "") : "";
  return (first + last).toUpperCase();
}

interface Props {
  name: string;
  size?: number;
  /** Shows this person's saved photo when they have one. */
  contactId?: string;
  /** Overrides the saved photo: a data URL to preview, or null to preview "no photo". */
  image?: string | null;
}

/** A person's photo, or their initials when there is none. */
export function Avatar({ name, size = 32, contactId, image }: Props) {
  const { data: avatars } = useAvatars();
  const src = image !== undefined ? image : contactId ? avatars?.[contactId] : undefined;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full border border-hairline object-cover"
      />
    );
  }
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

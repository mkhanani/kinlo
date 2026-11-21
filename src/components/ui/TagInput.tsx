import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { X } from "lucide-react";

/**
 * Type a tag and press Enter or comma to add it. Backspace on an empty field removes the
 * last one. Existing tags are offered as you type.
 */
export function TagInput({
  id,
  value,
  onChange,
  suggestions,
}: {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();
  const has = (name: string) => value.some((t) => t.toLowerCase() === name.toLowerCase());

  const add = (raw: string) => {
    const name = raw.trim().replace(/,+$/, "").trim();
    if (name && !has(name)) {
      // Reuse the existing spelling of a tag when there is one.
      const existing = suggestions.find((s) => s.toLowerCase() === name.toLowerCase());
      onChange([...value, existing ?? name]);
    }
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && draft.trim()) {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const open = suggestions.filter((s) => !has(s));

  return (
    <div className="flex min-h-8 flex-wrap items-center gap-1 rounded-[10px] border border-hairline bg-control px-1.5 py-1 transition-colors duration-200 focus-within:border-[var(--ring)]">
      {value.map((tag) => (
        <span key={tag} className="inline-flex h-6 items-center gap-1 rounded-full bg-active pl-2 pr-1 text-sm">
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="flex h-4 w-4 items-center justify-center rounded-full text-muted hover:bg-control-hover hover:text-fg"
          >
            <X size={11} strokeWidth={1.75} />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        list={listId}
        onChange={(e) => {
          const next = e.target.value;
          // Picking from the suggestion list fills the whole name at once.
          if (open.includes(next)) add(next);
          else setDraft(next);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={value.length ? "" : "Family, Design, Book club"}
        className="h-6 min-w-[120px] flex-1 bg-transparent px-1 text-base outline-none placeholder:text-subtle"
      />
      <datalist id={listId}>
        {open.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { X } from "lucide-react";
import { useContact, useContacts } from "@/data/hooks";
import type { Side } from "@/data/types";
import { useDebounced } from "@/lib/useDebounced";
import { Avatar } from "./Avatar";

interface Props {
  id?: string;
  value: string | null;
  onChange: (contactId: string | null) => void;
  /** Only offer people on this side. */
  side?: Side;
  placeholder?: string;
}

/** Choose one person by typing part of their name. Optional: it can be left empty. */
export function PersonPicker({ id, value, onChange, side, placeholder = "Nobody in particular" }: Props) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const search = useDebounced(query, 120);
  const { data: chosen } = useContact(value ?? undefined);
  const { data: matches = [] } = useContacts({ side, search: search.trim() || undefined });
  const options = matches.slice(0, 6);

  const pick = (contactId: string) => {
    onChange(contactId);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && options[active]) {
      // Choosing a person must not also submit the form around it.
      e.preventDefault();
      pick(options[active]!.id);
    } else if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  if (value && chosen) {
    return (
      <div className="flex h-8 items-center gap-2 rounded-[10px] border border-hairline bg-control pl-1.5 pr-1">
        <Avatar name={chosen.name} contactId={chosen.id} size={20} />
        <span className="min-w-0 flex-1 truncate text-base">{chosen.name}</span>
        <button
          type="button"
          aria-label={`Remove ${chosen.name}`}
          onClick={() => onChange(null)}
          className="flex h-6 w-6 items-center justify-center rounded-[8px] text-muted hover:bg-control-hover hover:text-fg"
        >
          <X size={13} strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="h-8 w-full rounded-[10px] border border-hairline bg-control px-2.5 text-base outline-none transition-colors duration-200 placeholder:text-subtle hover:bg-control-hover focus:border-[var(--ring)] focus:bg-control"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          // In the flow of the form rather than floating, so a dialog grows to fit it instead of clipping it.
          className="mt-1 max-h-[216px] overflow-y-auto rounded-[10px] border border-hairline bg-control p-1"
        >
          {options.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-subtle">{query.trim() ? "Nobody by that name." : "Nobody here yet."}</li>
          ) : (
            options.map((contact, index) => (
              <li
                key={contact.id}
                role="option"
                aria-selected={index === active}
                // Mouse down, not click: the input loses focus (and the list closes) before a click lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(contact.id);
                }}
                onMouseMove={() => setActive(index)}
                className={`flex h-8 items-center gap-2 rounded-[8px] px-1.5 text-base ${
                  index === active ? "bg-control-hover" : ""
                }`}
              >
                <Avatar name={contact.name} contactId={contact.id} size={20} />
                <span className="truncate">{contact.name}</span>
                {contact.company && <span className="truncate text-sm text-subtle">{contact.company}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

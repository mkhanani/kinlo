import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { Bell, Columns3, House, Search, Settings, UserPlus, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useSettings } from "@/app/settings";
import { Avatar } from "@/components/ui/Avatar";
import { useContactSearch } from "@/data/hooks";
import { dialogVariants } from "@/lib/motion";
import { useDebounced } from "@/lib/useDebounced";
import { useUI } from "@/store/ui";

interface Item {
  id: string;
  group: "People" | "Go to" | "Actions";
  label: string;
  detail?: string;
  icon: ReactNode;
  run: () => void;
}

/** Ctrl/Cmd+K: find a person, jump to a page, or start adding someone. */
export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  const setOpen = useUI((s) => s.setPaletteOpen);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-black/30"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.18 } }}
                exit={{ opacity: 0, transition: { duration: 0.18 } }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              forceMount
              aria-describedby={undefined}
              className="pointer-events-none fixed inset-0 z-50 flex justify-center pt-[16vh]"
            >
              <motion.div
                variants={dialogVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                className="glass-float pointer-events-auto h-fit w-[560px] overflow-hidden"
              >
                <Dialog.Title className="sr-only">Command palette</Dialog.Title>
                <PaletteBody close={() => setOpen(false)} />
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function icon(Icon: LucideIcon) {
  return (
    <span className="flex h-7 w-7 items-center justify-center text-muted">
      <Icon size={16} strokeWidth={1.5} />
    </span>
  );
}

function PaletteBody({ close }: { close: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const openContactForm = useUI((s) => s.openContactForm);
  const { pipelineEnabled } = useSettings();
  const search = useDebounced(query, 100);
  const { data: hits = [] } = useContactSearch(search);

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => {
      navigate(to);
      close();
    };
    const pages: Item[] = [
      { id: "go-home", group: "Go to", label: "Home", icon: icon(House), run: go("/") },
      { id: "go-people", group: "Go to", label: "People", icon: icon(Users), run: go("/people") },
      ...(pipelineEnabled
        ? [{ id: "go-pipeline", group: "Go to" as const, label: "Pipeline", icon: icon(Columns3), run: go("/pipeline") }]
        : []),
      { id: "go-reminders", group: "Go to", label: "Reminders", icon: icon(Bell), run: go("/reminders") },
      { id: "go-settings", group: "Go to", label: "Settings", icon: icon(Settings), run: go("/settings") },
    ];
    const actions: Item[] = [
      { id: "add-person", group: "Actions", label: "Add person", icon: icon(UserPlus), run: () => openContactForm() },
    ];

    const q = query.trim().toLowerCase();
    if (!q) return [...actions, ...pages];

    const people: Item[] = (search.trim() ? hits : []).map(({ contact, excerpt }) => ({
      id: `person-${contact.id}`,
      group: "People",
      label: contact.name,
      // Show what matched when it was not the name itself.
      detail: excerpt.toLowerCase().includes(contact.name.toLowerCase())
        ? [contact.role, contact.company].filter(Boolean).join(" at ") || undefined
        : excerpt.replace(/[[\]]/g, ""),
      icon: <Avatar name={contact.name} size={28} />,
      run: go(`/people/${contact.id}`),
    }));
    const matches = (item: Item) => item.label.toLowerCase().includes(q);
    return [...people, ...pages.filter(matches), ...actions.filter(matches)];
  }, [query, search, hits, pipelineEnabled, navigate, close, openContactForm]);

  useEffect(() => setActive(0), [query, items.length]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  };

  return (
    <div onKeyDown={onKeyDown}>
      <div className="flex h-12 items-center gap-3 border-b border-hairline px-4">
        <Search size={16} strokeWidth={1.5} className="text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people or jump to a page"
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={items[active]?.id}
          className="h-full flex-1 bg-transparent text-md outline-none placeholder:text-subtle"
        />
      </div>
      <ul id="palette-list" role="listbox" className="max-h-[340px] overflow-y-auto p-1.5">
        {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-subtle">Nothing matches that.</li>}
        {items.map((item, index) => (
          <li key={item.id} role="presentation">
            {(index === 0 || items[index - 1]!.group !== item.group) && (
              <div className="px-2 pb-1 pt-2 text-xs text-subtle">{item.group}</div>
            )}
            <div
              id={item.id}
              role="option"
              aria-selected={index === active}
              onMouseMove={() => setActive(index)}
              onClick={item.run}
              className={`flex h-10 items-center gap-2.5 rounded-[10px] px-2 ${index === active ? "bg-control-hover" : ""}`}
            >
              {item.icon}
              <span className="truncate text-base">{item.label}</span>
              {item.detail && <span className="min-w-0 flex-1 truncate text-sm text-subtle">{item.detail}</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

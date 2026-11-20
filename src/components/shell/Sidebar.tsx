import { NavLink } from "react-router-dom";
import { motion } from "motion/react";
import { House, Users, Columns3, Bell, Settings, Sparkles, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Wordmark } from "@/components/Logo";
import { useUI } from "@/store/ui";
import { modKey } from "@/lib/platform";
import { useSettings } from "@/app/settings";

interface Item {
  to: string;
  label: string;
  icon: LucideIcon;
  shortcut: string;
}

export function Sidebar() {
  const { pipelineEnabled } = useSettings();
  const toggleAssistant = useUI((s) => s.toggleAssistant);
  const assistantOpen = useUI((s) => s.assistantOpen);
  const setPaletteOpen = useUI((s) => s.setPaletteOpen);

  const items: Item[] = [
    { to: "/", label: "Home", icon: House, shortcut: "1" },
    { to: "/people", label: "People", icon: Users, shortcut: "2" },
    ...(pipelineEnabled ? [{ to: "/pipeline", label: "Pipeline", icon: Columns3, shortcut: "3" }] : []),
    { to: "/reminders", label: "Reminders", icon: Bell, shortcut: "4" },
  ];

  return (
    <nav className="flex w-[216px] shrink-0 flex-col px-3 pb-3" aria-label="Main">
      <div className="px-2 pb-4 pt-1">
        <Wordmark />
      </div>

      <button
        onClick={() => setPaletteOpen(true)}
        className="control mb-4 flex h-8 items-center gap-2 px-2.5 text-sm text-muted"
      >
        <Search size={14} strokeWidth={1.5} />
        <span className="flex-1 text-left">Search</span>
        <kbd className="font-sans text-xs text-subtle">{modKey} K</kbd>
      </button>

      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item.to}>
            <NavItem {...item} />
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-0.5">
        <button
          onClick={() => toggleAssistant()}
          className={`relative flex h-8 items-center gap-2.5 rounded-[10px] px-2.5 text-base transition-colors duration-200 ${
            assistantOpen ? "bg-active text-fg" : "text-muted hover:bg-control hover:text-fg"
          }`}
        >
          <Sparkles size={16} strokeWidth={1.5} />
          <span>Assistant</span>
          <kbd className="ml-auto font-sans text-xs text-subtle">{modKey} J</kbd>
        </button>
        <NavItem to="/settings" label="Settings" icon={Settings} shortcut="," />
      </div>
    </nav>
  );
}

function NavItem({ to, label, icon: Icon }: Item) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `relative flex h-8 items-center gap-2.5 rounded-[10px] px-2.5 text-base transition-colors duration-200 ${
          isActive ? "text-fg" : "text-muted hover:bg-control hover:text-fg"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="nav-active"
              className="absolute inset-0 rounded-[10px] bg-active"
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
          <Icon size={16} strokeWidth={1.5} className="relative" />
          <span className="relative">{label}</span>
        </>
      )}
    </NavLink>
  );
}

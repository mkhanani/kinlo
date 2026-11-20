import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** One message, one clear action. */
export function EmptyState({ icon: Icon, title, action }: { icon: LucideIcon; title: string; action?: ReactNode }) {
  return (
    <div className="glass flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-hairline bg-control text-muted">
        <Icon size={20} strokeWidth={1.5} />
      </div>
      <p className="max-w-[320px] text-base text-muted">{title}</p>
      {action}
    </div>
  );
}

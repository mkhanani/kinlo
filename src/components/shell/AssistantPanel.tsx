import { AnimatePresence, motion } from "motion/react";
import { Sparkles, X } from "lucide-react";
import { useUI } from "@/store/ui";
import { ease } from "@/lib/motion";

/** Side panel that opens from anywhere. Wired to a model in step 6. */
export function AssistantPanel() {
  const open = useUI((s) => s.assistantOpen);
  const toggle = useUI((s) => s.toggleAssistant);

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          key="assistant"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 360, opacity: 1, transition: { duration: 0.22, ease } }}
          exit={{ width: 0, opacity: 0, transition: { duration: 0.18, ease } }}
          className="shrink-0 overflow-hidden"
          aria-label="Assistant"
        >
          <div className="glass ml-2 flex h-full w-[352px] flex-col">
            <div className="flex h-12 items-center justify-between border-b border-hairline px-4">
              <div className="flex items-center gap-2 text-base font-medium">
                <Sparkles size={15} strokeWidth={1.5} /> Assistant
              </div>
              <button
                aria-label="Close assistant"
                onClick={() => toggle(false)}
                className="flex h-7 w-7 items-center justify-center rounded-[8px] text-muted hover:bg-control hover:text-fg"
              >
                <X size={15} strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
              <p className="text-base text-muted">Connect a model to ask about your people.</p>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

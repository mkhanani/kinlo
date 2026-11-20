import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { Search } from "lucide-react";
import { useUI } from "@/store/ui";
import { dialogVariants } from "@/lib/motion";

/** Ctrl/Cmd+K. Search, jump and quick add arrive in steps 3 and 7; this is the shell. */
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
                <div className="flex h-12 items-center gap-3 border-b border-hairline px-4">
                  <Search size={16} strokeWidth={1.5} className="text-muted" />
                  <input
                    autoFocus
                    placeholder="Search people, jump to a page, or type to add"
                    className="h-full flex-1 bg-transparent text-md outline-none placeholder:text-subtle"
                  />
                </div>
                <div className="px-4 py-6 text-center text-sm text-subtle">Start typing.</div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

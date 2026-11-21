import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { dialogVariants } from "@/lib/motion";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

/** A centered dialog on a floating glass surface. Scales in from 0.98. */
export function Modal({ open, onOpenChange, title, description, children, footer, width = 520 }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
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
              aria-describedby={description ? undefined : undefined}
              className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6"
            >
              <motion.div
                variants={dialogVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                style={{ width }}
                className="glass-float pointer-events-auto flex max-h-full max-w-full flex-col overflow-hidden"
              >
                <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
                  <div>
                    <Dialog.Title className="text-md font-semibold tracking-[-0.01em]">{title}</Dialog.Title>
                    {description ? (
                      <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description>
                    ) : (
                      <Dialog.Description className="sr-only">{title}</Dialog.Description>
                    )}
                  </div>
                  <Dialog.Close
                    aria-label="Close"
                    className="-mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-control hover:text-fg"
                  >
                    <X size={15} strokeWidth={1.5} />
                  </Dialog.Close>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
                {footer && (
                  <div className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-3">{footer}</div>
                )}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

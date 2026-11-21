import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { History, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useChat } from "@/ai/chat";
import { useAssistantStatus } from "@/ai/hooks";
import { Button } from "@/components/ui/Button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/Menu";
import { Conversation } from "@/features/assistant/Conversation";
import { ease } from "@/lib/motion";
import { useUI } from "@/store/ui";

const NOT_READY = {
  "no-provider": "Connect a model to ask about your people.",
  "no-key": "Add your API key to start using the assistant.",
  "no-model": "Pick a model to start using the assistant.",
} as const;

const iconButton =
  "flex h-7 w-7 items-center justify-center rounded-[8px] text-muted transition-colors duration-150 hover:bg-control hover:text-fg";

/** Side panel that opens from anywhere. */
export function AssistantPanel() {
  const open = useUI((s) => s.assistantOpen);
  const toggle = useUI((s) => s.toggleAssistant);
  const status = useAssistantStatus();
  const navigate = useNavigate();
  const load = useChat((s) => s.load);
  const newChat = useChat((s) => s.newChat);
  const openThread = useChat((s) => s.openThread);
  const removeThread = useChat((s) => s.removeThread);
  const threads = useChat((s) => s.threads);
  const threadId = useChat((s) => s.threadId);
  const hasMessages = useChat((s) => s.messages.length > 0);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

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
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-hairline pl-4 pr-2.5">
              <div className="flex items-center gap-2 text-base font-medium">
                <Sparkles size={15} strokeWidth={1.5} /> Assistant
              </div>
              <div className="flex items-center gap-0.5">
                {status.state === "ready" && (
                  <>
                    {threads.length > 0 && (
                      <Menu
                        trigger={
                          <button aria-label="Earlier conversations" className={iconButton}>
                            <History size={15} strokeWidth={1.5} />
                          </button>
                        }
                      >
                        <MenuLabel>Earlier conversations</MenuLabel>
                        {threads.slice(0, 12).map((thread) => (
                          <MenuItem key={thread.id} checked={thread.id === threadId} onSelect={() => void openThread(thread.id)}>
                            <span className="max-w-[230px] truncate">{thread.title || "Untitled"}</span>
                          </MenuItem>
                        ))}
                        {threadId && (
                          <>
                            <MenuSeparator />
                            <MenuItem danger onSelect={() => void removeThread(threadId)}>
                              <Trash2 size={14} strokeWidth={1.5} /> Delete this conversation
                            </MenuItem>
                          </>
                        )}
                      </Menu>
                    )}
                    <button
                      aria-label="New conversation"
                      className={`${iconButton} disabled:opacity-40`}
                      disabled={!hasMessages}
                      onClick={newChat}
                    >
                      <Plus size={16} strokeWidth={1.5} />
                    </button>
                  </>
                )}
                <button aria-label="Close assistant" onClick={() => toggle(false)} className={iconButton}>
                  <X size={15} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {status.state === "ready" ? (
              <Conversation config={status.config} />
            ) : status.state === "checking" ? (
              <div className="flex-1" />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
                <p className="text-base text-muted">{NOT_READY[status.state]}</p>
                <Button variant="primary" onClick={() => navigate("/settings#assistant")}>
                  {status.state === "no-provider" ? "Connect a model" : "Open Settings"}
                </Button>
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

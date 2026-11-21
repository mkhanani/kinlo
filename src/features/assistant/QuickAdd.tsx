import { useEffect, useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Search, Sparkles } from "lucide-react";
import { useQuickAdd } from "@/ai/chat";
import { describeLookup, type ActionCard } from "@/ai/describe";
import { pendingApprovals, toView } from "@/ai/engine";
import { useSettings, useSide } from "@/app/settings";
import { Button } from "@/components/ui/Button";
import { ActionCardView, cardQueryKey } from "./ActionCardView";
import { Markdown } from "./Markdown";
import { useRefreshOnChange } from "./useRefreshOnChange";

/** How long "Saved" stays on screen before the palette closes by itself. */
const CLOSE_AFTER = 1100;

/**
 * Quick add, inside the command palette: one line in, the changes it would make shown as
 * cards, Enter to confirm. Nothing is saved before that, and closing the palette at any
 * point leaves everything as it was.
 */
export function QuickAdd({ text, close }: { text: string; close: () => void }) {
  const settings = useSettings();
  const side = useSide();
  const client = useQueryClient();
  const { messages, live, working, error, errorDetail, decisions } = useQuickAdd();
  const decide = useQuickAdd((s) => s.decide);
  const retry = useQuickAdd((s) => s.retry);
  useRefreshOnChange(useQuickAdd);

  // Start when this opens. Leaving stops whatever is in flight and forgets the rest.
  const started = useRef(settings);
  useEffect(() => {
    useQuickAdd.getState().newChat();
    void useQuickAdd.getState().send(text, started.current);
    return () => useQuickAdd.getState().newChat();
  }, [text]);

  // The first item is the line that was typed, which is already shown at the top.
  const view = useMemo(() => toView(messages).slice(1), [messages]);
  const open = useMemo(() => pendingApprovals(messages), [messages]);
  const waiting = open.filter((pending) => decisions[pending.approvalId] === undefined);
  const saved = view.some((item) => item.kind === "action" && item.state === "done");
  const finished = !working && !error && open.length === 0 && messages.length > 1;

  useEffect(() => {
    if (!finished || !saved) return;
    const timer = window.setTimeout(close, CLOSE_AFTER);
    return () => window.clearTimeout(timer);
  }, [finished, saved, close]);

  const box = useRef<HTMLDivElement>(null);
  useEffect(() => box.current?.focus(), []);

  /** Enter confirms every card that can be confirmed, in one go. */
  const confirmAll = () => {
    if (working || !waiting.length) return;
    const answers: Record<string, boolean> = {};
    for (const pending of waiting) {
      const card = client.getQueryData<ActionCard>(cardQueryKey(pending.approvalId, side));
      // Not described yet: the user has not seen what they would be agreeing to.
      if (!card) return;
      answers[pending.approvalId] = card.problem === null;
    }
    void decide(answers, settings);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    // A focused button handles Enter itself.
    if (e.target instanceof HTMLButtonElement) return;
    e.preventDefault();
    if (finished) close();
    else confirmAll();
  };

  const hint = working
    ? "Working on it"
    : error
      ? "Esc to close"
      : waiting.length
        ? `Enter to confirm${waiting.length > 1 ? " all" : ""} · Esc to cancel`
        : finished && saved
          ? "Saved"
          : "Esc to close";

  return (
    <div ref={box} tabIndex={-1} onKeyDown={onKeyDown} className="outline-none" aria-label="Quick add" role="group">
      <div className="flex min-h-12 items-center gap-3 border-b border-hairline px-4 py-2.5">
        <Sparkles size={16} strokeWidth={1.5} className="shrink-0 text-muted" />
        <p className="min-w-0 flex-1 text-md">{text}</p>
      </div>

      <div className="flex max-h-[380px] flex-col gap-2.5 overflow-y-auto p-3" aria-live="polite">
        {view.map((item) => {
          if (item.kind === "lookup") return <Lookup key={item.key} text={describeLookup(item.toolName, item.input)} />;
          if (item.kind === "assistant") {
            return (
              <div key={item.key} className="px-1 text-base leading-[1.5]">
                <Markdown text={item.text} />
              </div>
            );
          }
          if (item.kind !== "action") return null;
          return (
            <ActionCardView
              key={item.key}
              approvalId={item.approvalId}
              toolName={item.toolName}
              input={item.input}
              state={item.state}
              decision={decisions[item.approvalId]}
              side={side}
              currency={settings.defaultCurrency}
              disabled={working}
              onDecide={(approved) => void decide({ [item.approvalId]: approved }, settings)}
            />
          );
        })}
        {live.map((item, index) =>
          item.kind === "lookup" ? (
            <Lookup key={`live${index}`} text={describeLookup(item.toolName, item.input)} />
          ) : (
            <div key={`live${index}`} className="px-1 text-base leading-[1.5]">
              <Markdown text={item.text} />
            </div>
          ),
        )}
        {working && live.at(-1)?.kind !== "assistant" && (
          <div className="flex h-5 items-center gap-1 px-1" role="status" aria-label="Working on it">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:300ms]" />
          </div>
        )}
        {error && (
          <div role="alert" className="rounded-[12px] border border-hairline bg-control px-3 py-2.5 text-sm">
            <p>{error}</p>
            {errorDetail && <p className="mt-1.5 select-text break-words text-xs text-muted">{errorDetail}</p>}
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={() => void retry(settings)}>
                Try again
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex h-9 items-center gap-1.5 border-t border-hairline px-4 text-xs text-subtle">
        {finished && saved && <Check size={13} strokeWidth={1.75} />}
        {hint}
      </div>
    </div>
  );
}

function Lookup({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-1.5 px-1 text-sm text-subtle">
      <Search size={12} strokeWidth={1.75} className="shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  );
}

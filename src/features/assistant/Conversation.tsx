import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, Copy, Search, Square } from "lucide-react";
import { useChat } from "@/ai/chat";
import { describeLookup } from "@/ai/describe";
import { toView } from "@/ai/engine";
import { PROVIDERS, type AiConfig } from "@/ai/providers";
import { useSettings, useSide } from "@/app/settings";
import { Button } from "@/components/ui/Button";
import { ActionCardView } from "./ActionCardView";
import { Markdown } from "./Markdown";
import { useRefreshOnChange } from "./useRefreshOnChange";

const SUGGESTIONS = {
  personal: ["Who should I catch up with?", "What is coming up this week?", "Whose birthday is next?"],
  business: ["Who should I follow up with?", "Which deals are open?", "What is due this week?"],
};

/** The chat itself: what has been said, any changes waiting to be confirmed, and the box to type in. */
export function Conversation({ config }: { config: AiConfig }) {
  const settings = useSettings();
  const side = useSide();
  const { messages, live, working, error, errorDetail, decisions, draft } = useChat();
  const setDraft = useChat((s) => s.setDraft);
  const focusRequests = useChat((s) => s.focusRequests);
  const send = useChat((s) => s.send);
  const decide = useChat((s) => s.decide);
  const retry = useChat((s) => s.retry);
  const stop = useChat((s) => s.stop);

  const view = useMemo(() => toView(messages), [messages]);
  const empty = view.length === 0 && live.length === 0;

  useRefreshOnChange(useChat);

  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [view.length, live, working, error]);

  const info = PROVIDERS[config.provider];

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {empty ? (
          <div className="flex h-full flex-col justify-end gap-2">
            <p className="mb-1 text-base text-muted">Ask about your people, or tell kinlo what happened.</p>
            {SUGGESTIONS[side].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => void send(suggestion, settings)}
                className="control h-8 px-3 text-left text-base text-fg"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {view.map((item) => {
              if (item.kind === "user") return <UserBubble key={item.key} text={item.text} />;
              if (item.kind === "assistant") return <AssistantText key={item.key} text={item.text} copyable />;
              if (item.kind === "lookup") return <Lookup key={item.key} toolName={item.toolName} input={item.input} />;
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
              item.kind === "assistant" ? (
                <AssistantText key={`live${index}`} text={item.text} />
              ) : (
                <Lookup key={`live${index}`} toolName={item.toolName} input={item.input} />
              ),
            )}
            {working && live.at(-1)?.kind !== "assistant" && (
              <div className="flex h-5 items-center gap-1" role="status" aria-label="The assistant is working">
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
        )}
        <div ref={end} />
      </div>

      <Composer text={draft} setText={setDraft} focusRequests={focusRequests} working={working} onSend={(text) => void send(text, settings)} onStop={stop} />
      <p className="truncate px-4 pb-3 text-center text-xs text-subtle">
        {info.local ? `${config.model} · runs on this computer` : `${info.label} · ${config.model}`}
      </p>
    </>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="ml-8 self-end whitespace-pre-wrap break-words rounded-[12px] bg-active px-3 py-2 text-base">{text}</div>
  );
}

function AssistantText({ text, copyable = false }: { text: string; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // The clipboard can be blocked. There is nothing useful to say about it here.
    }
  };
  return (
    <div className="group relative text-base leading-[1.5]">
      <Markdown text={text} />
      {copyable && (
        <button
          aria-label={copied ? "Copied" : "Copy"}
          onClick={() => void copy()}
          className="mt-1 flex h-6 items-center gap-1 rounded-[6px] px-1 text-xs text-subtle opacity-0 transition-opacity duration-150 hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
        >
          {copied ? <Check size={12} strokeWidth={1.75} /> : <Copy size={12} strokeWidth={1.75} />}
          {copied ? "Copied" : "Copy"}
        </button>
      )}
    </div>
  );
}

function Lookup({ toolName, input }: { toolName: string; input: unknown }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-subtle">
      <Search size={12} strokeWidth={1.75} className="shrink-0" />
      <span className="truncate">{describeLookup(toolName, input)}</span>
    </div>
  );
}

function Composer({
  text,
  setText,
  focusRequests,
  working,
  onSend,
  onStop,
}: {
  text: string;
  setText: (text: string) => void;
  focusRequests: number;
  working: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);

  // Grow with what is typed, up to a few lines.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
  }, [text]);
  // Take the cursor when the box appears and whenever it is asked to, and put it at the
  // end. That matters when the box arrives with a start already written, such as
  // "Draft a short message to Ana".
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [focusRequests]);

  const submit = () => {
    if (working || !text.trim()) return;
    setText("");
    onSend(text);
  };

  return (
    <form
      className="mx-3 mb-2 flex items-end gap-2 rounded-[12px] border border-hairline bg-control p-1.5 focus-within:border-[var(--ring)]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={box}
        aria-label="Message the assistant"
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Ask, or say what happened"
        className="max-h-[132px] min-h-[28px] flex-1 resize-none bg-transparent px-1.5 py-1 text-base leading-5 outline-none placeholder:text-subtle"
      />
      {working ? (
        <button
          type="button"
          aria-label="Stop"
          onClick={onStop}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-fg text-bg"
        >
          <Square size={11} strokeWidth={0} fill="currentColor" />
        </button>
      ) : (
        <button
          type="submit"
          aria-label="Send"
          disabled={!text.trim()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-fg text-bg transition-opacity duration-150 disabled:opacity-30"
        >
          <ArrowUp size={15} strokeWidth={2} />
        </button>
      )}
    </form>
  );
}

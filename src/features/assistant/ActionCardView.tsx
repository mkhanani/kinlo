import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { describeAction } from "@/ai/describe";
import type { ActionState } from "@/ai/engine";
import { Button } from "@/components/ui/Button";
import type { Side } from "@/data";

/** Where a card's wording is cached, so other code can read what the user was shown. */
export const cardQueryKey = (approvalId: string, side: Side) => ["ai", "card", approvalId, side] as const;

const STATE_LABEL: Record<Exclude<ActionState, "pending">, string> = {
  saving: "Saving",
  done: "Saved",
  cancelled: "Cancelled",
  failed: "Could not be saved",
};

/**
 * A change the assistant wants to make, shown before anything is written. Nothing is
 * saved until the user presses Confirm.
 */
export function ActionCardView({
  approvalId,
  toolName,
  input,
  state,
  decision,
  side,
  currency,
  disabled,
  onDecide,
}: {
  approvalId: string;
  toolName: string;
  input: unknown;
  state: ActionState;
  /** The answer already given, while other cards in the same reply are still open. */
  decision: boolean | undefined;
  side: Side;
  currency: string;
  disabled: boolean;
  onDecide: (approved: boolean) => void;
}) {
  const { data: card } = useQuery({
    queryKey: cardQueryKey(approvalId, side),
    queryFn: () => describeAction(toolName, input, { side, currency }),
  });
  if (!card) return null;

  const open = state === "pending" && decision === undefined;
  const label = state === "pending" ? (decision ? "Confirmed" : "Cancelled") : STATE_LABEL[state];
  const good = state === "done" || state === "saving" || (state === "pending" && decision === true);

  return (
    <div
      role="group"
      aria-label={card.title}
      className={`rounded-[12px] border border-hairline bg-control px-3 py-2.5 ${open ? "" : "opacity-80"}`}
    >
      <div className="text-base font-medium">{card.title}</div>
      {open && card.rows.length > 0 && (
        <dl className="mt-2 flex flex-col gap-1 text-sm">
          {card.rows.map((row) => (
            <div key={row.label} className="flex gap-2">
              <dt className="w-[92px] shrink-0 text-muted">{row.label}</dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {open ? (
        card.problem ? (
          <>
            <p className="mt-2 text-sm text-muted">{card.problem}</p>
            <div className="mt-2.5 flex justify-end">
              <Button size="sm" disabled={disabled} onClick={() => onDecide(false)}>
                Dismiss
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-xs text-subtle">Nothing is saved until you confirm.</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={disabled} onClick={() => onDecide(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="primary" disabled={disabled} onClick={() => onDecide(true)}>
                Confirm
              </Button>
            </div>
          </div>
        )
      ) : (
        <div className={`mt-1 flex items-center gap-1 text-sm ${state === "failed" ? "text-danger" : "text-muted"}`}>
          {good ? <Check size={13} strokeWidth={1.75} /> : <X size={13} strokeWidth={1.75} />}
          {label}
        </div>
      )}
    </div>
  );
}

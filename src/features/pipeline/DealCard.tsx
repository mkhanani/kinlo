import { forwardRef, useState } from "react";
import type { CSSProperties, HTMLAttributes } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, MoreHorizontal } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/Menu";
import { useDeleteDeal, useMoveDealToStage } from "@/data/hooks";
import type { DealWithContact, Stage } from "@/data/types";
import { calendarDaysBetween, formatDate } from "@/lib/dates";
import { useUI } from "@/store/ui";
import { formatMoney } from "./board";

interface Props extends HTMLAttributes<HTMLDivElement> {
  deal: DealWithContact;
  stages: Stage[];
  /** The copy that follows the pointer while dragging. */
  overlay?: boolean;
  /** The gap left behind in the column while its card is being dragged. */
  ghost?: boolean;
  style?: CSSProperties;
}

function closeLabel(expectedClose: string): { text: string; late: boolean } {
  const [y, m, d] = expectedClose.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!, 12);
  const late = calendarDaysBetween(new Date(), date) < 0;
  return { text: formatDate(date.toISOString()), late };
}

/**
 * One deal on the board. Drag it by its body; the menu offers the same moves for the
 * keyboard, and edit and delete.
 */
export const DealCard = forwardRef<HTMLDivElement, Props>(function DealCard(
  { deal, stages, overlay, ghost, style, className = "", ...rest },
  ref,
) {
  const openForm = useUI((s) => s.openDealForm);
  const move = useMoveDealToStage();
  const remove = useDeleteDeal();
  const [confirming, setConfirming] = useState(false);
  const open = !deal.closed_at;
  const close = deal.expected_close ? closeLabel(deal.expected_close) : null;

  return (
    <div
      ref={ref}
      style={style}
      data-deal={deal.id}
      aria-label={`${deal.title}, ${deal.contact_name}`}
      className={`group relative rounded-[10px] border border-hairline p-2.5 text-left ${
        overlay ? "cursor-grabbing bg-[var(--float-solid)] shadow-soft" : "cursor-grab bg-control hover:bg-control-hover"
      } ${ghost ? "opacity-30" : ""} ${className}`}
      {...rest}
    >
      <div className="flex items-start gap-2">
        {/*
          The card drags from anywhere, title included. A drag only begins after the
          pointer has moved a little, so a plain click here still opens the deal.
        */}
        <button
          onClick={() => openForm({ dealId: deal.id })}
          className="min-w-0 flex-1 text-left text-base font-medium leading-5 hover:underline"
        >
          {deal.title}
        </button>
        {!overlay && (
          <div
            className="-mr-1 -mt-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100"
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Menu
              trigger={
                <button
                  aria-label={`Options for ${deal.title}`}
                  className="flex h-6 w-6 items-center justify-center rounded-[8px] text-muted hover:bg-control-hover hover:text-fg"
                >
                  <MoreHorizontal size={15} strokeWidth={1.5} />
                </button>
              }
            >
              <MenuItem onSelect={() => openForm({ dealId: deal.id })}>Edit</MenuItem>
              <MenuSeparator />
              <MenuLabel>Move to</MenuLabel>
              {stages
                .filter((stage) => stage.id !== deal.stage_id)
                .map((stage) => (
                  <MenuItem key={stage.id} onSelect={() => move.mutate({ id: deal.id, stageId: stage.id })}>
                    {stage.name}
                  </MenuItem>
                ))}
              <MenuSeparator />
              <MenuItem danger onSelect={() => setConfirming(true)}>
                Delete
              </MenuItem>
            </Menu>
          </div>
        )}
      </div>

      <Link
        to={`/people/${deal.contact_id}`}
        draggable={false}
        className="mt-0.5 block truncate text-sm text-muted hover:text-fg hover:underline"
      >
        {deal.contact_name}
      </Link>

      {(deal.value != null || close) && (
        <div className="mt-2 flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">{deal.value != null ? formatMoney(deal.value, deal.currency, true) : ""}</span>
          {close && (
            <span
              className={`inline-flex items-center gap-1 ${open && close.late ? "font-medium text-fg" : "text-subtle"}`}
              title={open && close.late ? "Past its expected close date" : "Expected to close"}
            >
              <CalendarDays size={12} strokeWidth={1.5} /> {close.text}
            </span>
          )}
        </div>
      )}

      {!overlay && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="Delete this deal?"
          description={`“${deal.title}” with ${deal.contact_name} will be removed. This cannot be undone.`}
          confirmLabel="Delete"
          busy={remove.isPending}
          onConfirm={() => remove.mutate(deal.id, { onSuccess: () => setConfirming(false) })}
        />
      )}
    </div>
  );
});

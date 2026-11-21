import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { CollisionDetection, DragEndEvent, DragOverEvent, DragStartEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Columns3, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/Page";
import { useContactCount, useDeals, useDropDeal, useStages } from "@/data/hooks";
import type { DealWithContact, Stage } from "@/data/types";
import { useUI } from "@/store/ui";
import { columnTotals, findStage, formatMoney, moveOnBoard, positionAt, toBoard, type Board } from "./board";
import { DealCard } from "./DealCard";

/** The pipeline: one column per stage, deals as cards you drag between them. */
export function PipelinePage() {
  const { data: stages = [] } = useStages();
  const { data: deals, isPending } = useDeals();
  const { data: businessPeople = 0 } = useContactCount("business");
  const drop = useDropDeal();
  const openDealForm = useUI((s) => s.openDealForm);
  const openContactForm = useUI((s) => s.openContactForm);

  const saved = useMemo(() => toBoard(stages, deals ?? []), [stages, deals]);
  // While a card is in the air, the board shows where it would land.
  const [dragging, setDragging] = useState<{ id: string; board: Board } | null>(null);
  const board = dragging?.board ?? saved;
  const activeDeal = dragging ? (deals ?? []).find((d) => d.id === dragging.id) : null;

  const sensors = useSensors(
    // A small move is needed before a drag starts, so clicks on a card still work.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Which column, and which place in it, the pointer is over. `overId` is a deal or a column. */
  const target = (current: Board, overId: string): { stageId: string; index: number } | null => {
    if (overId in current) return { stageId: overId, index: current[overId]!.length };
    const stageId = findStage(current, overId);
    if (!stageId) return null;
    return { stageId, index: current[stageId]!.findIndex((d) => d.id === overId) };
  };

  /**
   * Where a dragged card is "over". The usual nearest-card rule goes wrong on a board: a
   * card held over a big empty column is nearer, corner to corner, to a card in the column
   * next door. So this works in two steps: first which column the pointer is in, then the
   * nearest card inside that column (or the column itself when it has none).
   */
  const collisions: CollisionDetection = (args) => {
    const columns = args.droppableContainers.filter((c) => String(c.id) in board);
    const underPointer = pointerWithin({ ...args, droppableContainers: columns });
    const hit = underPointer.length ? underPointer : rectIntersection({ ...args, droppableContainers: columns });
    const columnId = hit[0]?.id;
    if (columnId == null) return [];

    const inColumn = new Set((board[String(columnId)] ?? []).map((d) => d.id));
    const cards = args.droppableContainers.filter((c) => inColumn.has(String(c.id)));
    const nearest = cards.length ? closestCenter({ ...args, droppableContainers: cards }) : [];
    return nearest.length ? nearest : [{ id: columnId }];
  };

  const onDragStart = ({ active }: DragStartEvent) => setDragging({ id: String(active.id), board: saved });

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !dragging) return;
    const id = String(active.id);
    const to = target(dragging.board, String(over.id));
    const from = findStage(dragging.board, id);
    // Within one column the sortable list reorders itself. Only crossing columns needs help.
    if (!to || !from || from === to.stageId) return;
    // Coming into a column over one of its cards: go after that card when held below its middle.
    const held = active.rect.current.translated;
    const below = !!held && !(String(over.id) in dragging.board) && held.top + held.height / 2 > over.rect.top + over.rect.height / 2;
    setDragging({ id, board: moveOnBoard(dragging.board, id, to.stageId, to.index + (below ? 1 : 0)) });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const current = dragging;
    setDragging(null);
    if (!current || !over) return;
    const id = String(active.id);
    const to = target(current.board, String(over.id));
    if (!to) return;

    const settled = moveOnBoard(current.board, id, to.stageId, to.index);
    const column = settled[to.stageId]!;
    const index = column.findIndex((d) => d.id === id);
    const before = (deals ?? []).find((d) => d.id === id);
    const unchanged =
      before?.stage_id === to.stageId && saved[to.stageId]!.findIndex((d) => d.id === id) === index;
    if (unchanged) return;

    const { position, needsRenumber } = positionAt(column, index);
    const next = Object.values(settled)
      .flat()
      .map((d) => (d.id === id ? { ...d, position } : d));
    drop.mutate({ id, stageId: to.stageId, position, needsRenumber, next });
  };

  const total = deals?.length ?? 0;
  const open = (deals ?? []).filter((d) => !d.closed_at).length;

  return (
    // Narrower side padding than other pages: five columns have to fit the default window.
    <div className="flex h-full flex-col px-6 pb-5 pt-9">
      <PageHeader
        title="Pipeline"
        subtitle={total > 0 ? `${open} open ${open === 1 ? "deal" : "deals"}` : undefined}
        actions={
          <Button variant="primary" onClick={() => openDealForm()} disabled={businessPeople === 0}>
            <Plus size={15} strokeWidth={1.5} /> Add deal
          </Button>
        }
      />

      {!isPending && businessPeople === 0 ? (
        <EmptyState
          icon={Columns3}
          title="A deal is always with someone. Add your first lead or client, then come back."
          action={
            <Button variant="primary" onClick={() => openContactForm()}>
              Add person
            </Button>
          }
        />
      ) : !isPending && total === 0 ? (
        <EmptyState
          icon={Columns3}
          title="No deals yet. Add the first one and drag it along as it moves forward."
          action={
            <Button variant="primary" onClick={() => openDealForm()}>
              Add deal
            </Button>
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisions}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <div className="-mx-2 flex min-h-0 flex-1 gap-2.5 overflow-x-auto px-2 pb-2">
            {stages.map((stage) => (
              <Column key={stage.id} stage={stage} stages={stages} deals={board[stage.id] ?? []} draggingId={dragging?.id ?? null} />
            ))}
          </div>
          {/*
            The card that follows the pointer is placed relative to the window. The glass
            panel around the board blurs what is behind it, and that makes anything inside
            it measure "the window" from the panel's corner instead. So the floating card
            is rendered at the top of the page, outside the panel.
          */}
          {createPortal(
            <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
              {activeDeal ? <DealCard deal={activeDeal} stages={stages} overlay /> : null}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      )}
    </div>
  );
}

function Column({
  stage,
  stages,
  deals,
  draggingId,
}: {
  stage: Stage;
  stages: Stage[];
  deals: DealWithContact[];
  draggingId: string | null;
}) {
  const openDealForm = useUI((s) => s.openDealForm);
  // The column itself is a drop target, so a deal can land in an empty one.
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const totals = columnTotals(deals);

  return (
    <section
      // The whole column is the drop target, header included.
      ref={setNodeRef}
      aria-label={stage.name}
      className={`glass flex min-w-[168px] flex-1 basis-0 flex-col p-2 transition-colors duration-200 ${
        isOver ? "!bg-glass-hover" : ""
      }`}
    >
      <header className="mb-2 flex items-center gap-2 px-1.5 pt-0.5">
        <h2 className="text-sm font-medium tracking-normal">{stage.name}</h2>
        <span className="text-sm text-subtle">{deals.length}</span>
        <button
          aria-label={`Add a deal in ${stage.name}`}
          onClick={() => openDealForm({ stageId: stage.id })}
          className="-mr-1 ml-auto flex h-6 w-6 items-center justify-center rounded-[8px] text-muted hover:bg-control hover:text-fg"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
      </header>
      <p className="mb-2 min-h-[18px] px-1.5 text-sm text-muted">
        {totals.map((t) => formatMoney(t.total, t.currency, true)).join(" · ")}
      </p>

      <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <ul className="-mr-1 flex min-h-[72px] flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {deals.map((deal) => (
            <SortableDeal key={deal.id} deal={deal} stages={stages} ghost={deal.id === draggingId} />
          ))}
          {deals.length === 0 && (
            <li className="flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-hairline px-2 text-center text-xs text-subtle">
              {stage.outcome ? `Drop a deal here when it is ${stage.outcome}` : "Nothing here"}
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}

function SortableDeal({ deal, stages, ghost }: { deal: DealWithContact; stages: Stage[]; ghost: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: deal.id });
  return (
    <li>
      <DealCard
        ref={setNodeRef}
        deal={deal}
        stages={stages}
        ghost={ghost}
        style={{ transform: CSS.Translate.toString(transform), transition }}
        {...attributes}
        {...listeners}
      />
    </li>
  );
}

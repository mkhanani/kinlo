import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Lock, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { MAX_OPEN_STAGES } from "@/data/deals";
import {
  useCreateStage,
  useDeleteStage,
  useRenameStage,
  useReorderStages,
  useStageCounts,
  useStages,
} from "@/data/hooks";
import type { Stage } from "@/data/types";
import { useUI } from "@/store/ui";

const iconButton =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-muted transition-colors duration-150 hover:bg-control-hover hover:text-fg disabled:pointer-events-none disabled:opacity-30";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Rename, add, reorder and remove the stages a deal moves through. Won and Lost are
 * shown but locked: they are what closes a deal.
 */
export function StagesDialog() {
  const open = useUI((s) => s.stagesOpen);
  const setOpen = useUI((s) => s.setStagesOpen);
  const { data: stages = [] } = useStages();
  const { data: counts = {} } = useStageCounts();
  const create = useCreateStage();
  const rename = useRenameStage();
  const reorder = useReorderStages();
  const remove = useDeleteStage();
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState("");

  useEffect(() => {
    if (open) {
      setProblem(null);
      setAdding("");
    }
  }, [open]);

  const openStages = stages.filter((stage) => stage.outcome === null);
  const closing = stages.filter((stage) => stage.outcome !== null);
  const handlers = { onSuccess: () => setProblem(null), onError: (error: unknown) => setProblem(message(error)) };

  const move = (index: number, by: -1 | 1) => {
    const ids = openStages.map((stage) => stage.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids, handlers);
  };

  const add = () => {
    if (!adding.trim()) return;
    create.mutate(adding, { onSuccess: () => (setProblem(null), setAdding("")), onError: handlers.onError });
  };

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Pipeline stages"
      description="The steps a deal goes through. Won and Lost always come last."
      width={460}
      footer={<Button onClick={() => setOpen(false)}>Done</Button>}
    >
      <ul className="flex flex-col gap-1.5" aria-label="Stages">
        {openStages.map((stage, index) => {
          const deals = counts[stage.id] ?? 0;
          const last = openStages.length <= 1;
          return (
            <li key={stage.id} className="flex items-center gap-1.5">
              <button
                aria-label={`Move ${stage.name} up`}
                className={iconButton}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ChevronUp size={15} strokeWidth={1.5} />
              </button>
              <button
                aria-label={`Move ${stage.name} down`}
                className={iconButton}
                disabled={index === openStages.length - 1}
                onClick={() => move(index, 1)}
              >
                <ChevronDown size={15} strokeWidth={1.5} />
              </button>
              <StageName stage={stage} onRename={(name) => rename.mutate({ id: stage.id, name }, handlers)} />
              <span className="w-[62px] shrink-0 text-right text-sm text-subtle">
                {deals === 0 ? "" : `${deals} ${deals === 1 ? "deal" : "deals"}`}
              </span>
              <button
                aria-label={`Remove ${stage.name}`}
                title={
                  deals > 0
                    ? "Move its deals to another stage first."
                    : last
                      ? "A pipeline needs at least one stage."
                      : undefined
                }
                className={iconButton}
                disabled={deals > 0 || last}
                onClick={() => remove.mutate(stage.id, handlers)}
              >
                <Trash2 size={14} strokeWidth={1.5} />
              </button>
            </li>
          );
        })}
        {closing.map((stage) => (
          <li key={stage.id} className="flex h-8 items-center gap-1.5 pl-[66px] text-base text-muted">
            <span className="flex-1 px-2.5">{stage.name}</span>
            <Lock size={13} strokeWidth={1.5} className="mr-2 text-subtle" aria-label="Cannot be changed" />
          </li>
        ))}
      </ul>

      {openStages.length < MAX_OPEN_STAGES && (
        <form
          className="mt-4 flex items-center gap-2 pl-[66px]"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            aria-label="New stage"
            value={adding}
            maxLength={40}
            onChange={(e) => setAdding(e.target.value)}
            placeholder="New stage"
          />
          <Button type="submit" disabled={!adding.trim() || create.isPending}>
            <Plus size={15} strokeWidth={1.5} /> Add
          </Button>
        </form>
      )}

      {problem && (
        <p role="alert" className="mt-3 pl-[66px] text-sm">
          {problem}
        </p>
      )}
    </Modal>
  );
}

/** A stage's name, saved when you leave the box or press Enter. */
function StageName({ stage, onRename }: { stage: Stage; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState(stage.name);
  useEffect(() => setDraft(stage.name), [stage.name]);
  const commit = () => {
    const name = draft.trim();
    if (!name) setDraft(stage.name);
    else if (name !== stage.name) onRename(name);
  };
  return (
    <Input
      aria-label={`Name of ${stage.name}`}
      value={draft}
      maxLength={40}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
      className="min-w-0 flex-1"
    />
  );
}

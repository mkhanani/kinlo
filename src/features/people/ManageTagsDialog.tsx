import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { useDeleteTag, useRenameTag, useTags } from "@/data/hooks";
import type { TagWithCount } from "@/data/types";
import { useUI } from "@/store/ui";

/** Rename or delete tags. Deleting a tag takes it off people; it never deletes the people. */
export function ManageTagsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: tags = [] } = useTags();
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Tags"
      description="Renaming or deleting a tag changes it for everyone who has it."
      width={440}
    >
      {tags.length === 0 ? (
        <p className="py-4 text-base text-subtle">No tags yet. Add them when editing a person.</p>
      ) : (
        <ul className="-mx-2 flex flex-col" aria-label="Tags">
          {tags.map((tag) => (
            <TagRow key={tag.id} tag={tag} />
          ))}
        </ul>
      )}
    </Modal>
  );
}

const iconButton =
  "flex h-7 w-7 items-center justify-center rounded-[8px] text-muted transition-colors duration-150 hover:bg-control hover:text-fg";

function TagRow({ tag }: { tag: TagWithCount }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const rename = useRenameTag();
  const remove = useDeleteTag();
  const peopleFilter = useUI((s) => s.peopleFilter);
  const setPeopleFilter = useUI((s) => s.setPeopleFilter);

  const save = () => {
    if (name.trim() === tag.name) return setEditing(false);
    rename.mutate(
      { id: tag.id, name },
      {
        onSuccess: () => {
          setEditing(false);
          setError(null);
        },
        onError: (cause) => setError(cause instanceof Error ? cause.message : "That did not save."),
      },
    );
  };

  const cancel = () => {
    setName(tag.name);
    setError(null);
    setEditing(false);
  };

  const people = `${tag.contact_count} ${tag.contact_count === 1 ? "person" : "people"}`;

  return (
    <li className="rounded-[10px] px-2 py-1 hover:bg-control">
      <div className="flex h-8 items-center gap-2">
        {editing ? (
          <>
            <Input
              autoFocus
              aria-label={`New name for ${tag.name}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") {
                  e.stopPropagation();
                  cancel();
                }
              }}
              className="!h-7 flex-1"
            />
            <button aria-label="Save name" className={iconButton} onClick={save}>
              <Check size={15} strokeWidth={1.5} />
            </button>
            <button aria-label="Cancel" className={iconButton} onClick={cancel}>
              <X size={15} strokeWidth={1.5} />
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-base">{tag.name}</span>
            <span className="shrink-0 text-sm text-subtle">{people}</span>
            <button aria-label={`Rename ${tag.name}`} className={iconButton} onClick={() => setEditing(true)}>
              <Pencil size={14} strokeWidth={1.5} />
            </button>
            <button aria-label={`Delete ${tag.name}`} className={iconButton} onClick={() => setConfirming(true)}>
              <Trash2 size={14} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>
      {error && <p className="pb-1 text-xs text-danger">{error}</p>}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete the tag “${tag.name}”?`}
        description={
          tag.contact_count > 0
            ? `It will be taken off ${people}. The people themselves stay.`
            : "Nobody has this tag at the moment."
        }
        confirmLabel="Delete tag"
        busy={remove.isPending}
        onConfirm={() =>
          remove.mutate(tag.id, {
            onSuccess: () => {
              setConfirming(false);
              // Do not leave the list filtered by a tag that no longer exists.
              if (peopleFilter.tagId === tag.id) setPeopleFilter({ tagId: null });
            },
          })
        }
      />
    </li>
  );
}

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FileUp } from "lucide-react";
import { settingsKey, useSettings, useSide } from "@/app/settings";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Segmented } from "@/components/ui/Segmented";
import { countDuplicates, importContacts, readContactsCsv, type ImportRow } from "@/data";
import type { BusinessKind, Side } from "@/data";
import { pickTextFile } from "@/lib/files";
import { useUI } from "@/store/ui";

type Stage =
  | { step: "pick"; problem: string | null }
  | { step: "preview"; file: string; rows: ImportRow[]; unnamed: number; duplicates: number }
  | { step: "working"; done: number; total: number }
  | { step: "done"; added: number; skipped: number };

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** Reads a chosen CSV file into people. Shared with the welcome setup. */
export async function chooseContactsFile(): Promise<
  { file: string; rows: ImportRow[]; unnamed: number } | { problem: string } | null
> {
  let picked;
  try {
    picked = await pickTextFile(["csv", "txt"]);
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error) };
  }
  if (!picked) return null;
  const preview = readContactsCsv(picked.contents);
  if (!preview.recognized) {
    return { problem: "That file does not look like a list of contacts. It needs a column for names." };
  }
  if (!preview.rows.length) return { problem: "There is nobody in that file." };
  return { file: picked.name, rows: preview.rows, unnamed: preview.unnamed };
}

/**
 * Import people from a CSV file: choose it, see what was found, then add. Nobody already
 * in kinlo is changed, and nothing is added before the last button is pressed.
 */
export function ImportDialog() {
  const open = useUI((s) => s.importOpen);
  const setOpen = useUI((s) => s.setImportOpen);
  const { sides } = useSettings();
  const current = useSide();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>({ step: "pick", problem: null });
  const [side, setSide] = useState<Side>(current);
  const [kind, setKind] = useState<BusinessKind>("lead");

  useEffect(() => {
    if (!open) return;
    setStage({ step: "pick", problem: null });
    setSide(current);
    setKind("lead");
  }, [open, current]);

  const choose = async () => {
    const result = await chooseContactsFile();
    if (!result) return;
    if ("problem" in result) {
      setStage({ step: "pick", problem: result.problem });
      return;
    }
    setStage({ step: "preview", ...result, duplicates: await countDuplicates(result.rows) });
  };

  const run = async (rows: ImportRow[]) => {
    setStage({ step: "working", done: 0, total: rows.length });
    const result = await importContacts(rows, {
      side,
      kind,
      onProgress: (done, total) => setStage({ step: "working", done, total }),
    });
    await client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== settingsKey[0] });
    setStage({ step: "done", ...result });
  };

  const footer =
    stage.step === "preview" ? (
      <>
        <Button onClick={() => void choose()}>Choose another file</Button>
        <Button
          variant="primary"
          disabled={stage.rows.length === stage.duplicates}
          onClick={() => void run(stage.rows)}
        >
          Add {people(stage.rows.length - stage.duplicates)}
        </Button>
      </>
    ) : stage.step === "done" ? (
      <>
        <Button onClick={() => setOpen(false)}>Close</Button>
        {stage.added > 0 && (
          <Button
            variant="primary"
            onClick={() => {
              setOpen(false);
              navigate("/people");
            }}
          >
            See people
          </Button>
        )}
      </>
    ) : undefined;

  return (
    <Modal
      open={open}
      // Closing halfway through would leave some people added and no word about it.
      onOpenChange={(next) => stage.step !== "working" && setOpen(next)}
      title="Import people"
      footer={footer}
      width={480}
    >
      {stage.step === "pick" && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-base text-muted">
            Choose a CSV file of contacts. Exports from Google Contacts, Outlook and most address books work, and so does
            a file exported from kinlo.
          </p>
          {stage.problem && (
            <p role="alert" className="text-base">
              {stage.problem}
            </p>
          )}
          <Button variant="primary" onClick={() => void choose()}>
            <FileUp size={15} strokeWidth={1.5} /> Choose a file
          </Button>
        </div>
      )}

      {stage.step === "preview" && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-base">
              {people(stage.rows.length)} found in <span className="select-text font-medium">{stage.file}</span>.
            </p>
            {stage.duplicates > 0 && (
              <p className="mt-1 text-sm text-muted">
                {stage.duplicates === stage.rows.length
                  ? "All of them are already in kinlo, so there is nothing to add."
                  : `${stage.duplicates} ${stage.duplicates === 1 ? "is" : "are"} already in kinlo and will be left as ${
                      stage.duplicates === 1 ? "it is" : "they are"
                    }.`}
              </p>
            )}
            {stage.unnamed > 0 && (
              <p className="mt-1 text-sm text-muted">
                {stage.unnamed} {stage.unnamed === 1 ? "row has" : "rows have"} no name and will be skipped.
              </p>
            )}
          </div>
          <ul className="flex flex-col gap-1 rounded-[10px] border border-hairline bg-control px-3 py-2 text-sm">
            {stage.rows.slice(0, 5).map((row, index) => (
              <li key={index} className="flex gap-2">
                <span className="truncate font-medium">{row.name}</span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  {[row.company, row.emails[0], row.phones[0]].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
            {stage.rows.length > 5 && <li className="text-subtle">and {stage.rows.length - 5} more</li>}
          </ul>
          {sides === "both" && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-muted">Add them to</span>
              <Segmented<Side>
                label="Add them to"
                value={side}
                onChange={setSide}
                options={[
                  { value: "personal", label: "Personal" },
                  { value: "business", label: "Business" },
                ]}
              />
            </div>
          )}
          {side === "business" && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-muted">As</span>
              <Segmented<BusinessKind>
                label="As"
                value={kind}
                onChange={setKind}
                options={[
                  { value: "lead", label: "Leads" },
                  { value: "client", label: "Clients" },
                  { value: "other", label: "Other" },
                ]}
              />
            </div>
          )}
        </div>
      )}

      {stage.step === "working" && (
        <div className="flex flex-col gap-3" role="status">
          <p className="text-base">
            Adding {stage.done} of {stage.total}
          </p>
          <div className="h-1 overflow-hidden rounded-full bg-control">
            <div
              className="h-full bg-fg transition-[width] duration-200"
              style={{ width: `${stage.total ? (stage.done / stage.total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {stage.step === "done" && (
        <p className="text-base" role="status">
          {stage.added > 0 ? `Added ${people(stage.added)}.` : "Nobody was added."}
          {stage.skipped > 0 && ` ${stage.skipped} ${stage.skipped === 1 ? "was" : "were"} already here.`}
        </p>
      )}
    </Modal>
  );
}

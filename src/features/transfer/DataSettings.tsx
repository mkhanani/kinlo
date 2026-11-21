import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SettingRow as Row } from "@/components/ui/SettingRow";
import { exportAll, exportContactsCsv } from "@/data";
import { dataLocation, fileDate, openDataFolder, saveTextFile } from "@/lib/files";
import { useUI } from "@/store/ui";

type Note = { about: "json" | "csv"; text: string; failed: boolean } | null;

/** Where the data is, and the ways in and out of it. */
export function DataSettings() {
  const openImport = useUI((s) => s.setImportOpen);
  const [location, setLocation] = useState<string | null>(null);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void dataLocation()
      .then(setLocation)
      .catch(() => setLocation(null));
  }, []);

  const save = async (about: "json" | "csv", build: () => Promise<{ name: string; contents: string; mime: string }>) => {
    setBusy(true);
    setNote(null);
    try {
      const file = await build();
      const saved = await saveTextFile(file.name, file.contents, file.mime);
      setNote(saved ? { about, text: "Saved.", failed: false } : null);
    } catch (error) {
      setNote({ about, text: error instanceof Error ? error.message : String(error), failed: true });
    } finally {
      setBusy(false);
    }
  };

  const hint = (about: "json" | "csv", normal: string) =>
    note?.about === about ? <span className={note.failed ? "text-danger" : undefined}>{note.text}</span> : normal;

  return (
    <section aria-label="Your data">
      <h2 className="mb-2 mt-8 px-1 text-sm font-medium tracking-normal text-muted">Your data</h2>
      <div className="glass divide-y divide-hairline">
        <Row
          label="Where it is kept"
          hint={
            location ? (
              <span className="select-text break-all">{location}</span>
            ) : (
              "One file on this computer. Copying that file is a complete backup."
            )
          }
        >
          {location && <Button onClick={() => void openDataFolder()}>Open folder</Button>}
        </Row>
        <Row
          label="Export everything"
          hint={hint("json", "One JSON file with all your people, conversations, reminders, deals and settings. API keys are not in it.")}
        >
          <Button
            disabled={busy}
            onClick={() =>
              void save("json", async () => ({
                name: `kinlo-${fileDate()}.json`,
                contents: JSON.stringify(await exportAll(), null, 2),
                mime: "application/json",
              }))
            }
          >
            Export JSON
          </Button>
        </Row>
        <Row label="Export people" hint={hint("csv", "A CSV file that opens in any spreadsheet or address book.")}>
          <Button
            disabled={busy}
            onClick={() =>
              void save("csv", async () => ({
                name: `kinlo-people-${fileDate()}.csv`,
                contents: (await exportContactsCsv()).csv,
                mime: "text/csv",
              }))
            }
          >
            Export CSV
          </Button>
        </Row>
        <Row
          label="Import people"
          hint="From a CSV file, such as an export from Google Contacts or Outlook. Nobody already in kinlo is changed."
        >
          <Button onClick={() => openImport(true)}>Import</Button>
        </Row>
      </div>
    </section>
  );
}

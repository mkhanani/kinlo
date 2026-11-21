import { LogoMark } from "@/components/Logo";

/** Shown when the database cannot be opened. Nothing else in the app can work without it. */
export function StartupError({ error }: { error: unknown }) {
  const detail = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center" data-tauri-drag-region>
      <LogoMark size={28} className="text-muted" />
      <h1 className="text-lg">kinlo could not open your data</h1>
      <p className="max-w-[420px] text-base text-muted">
        Nothing has been changed or deleted. Close kinlo and open it again. If this keeps happening, the details below
        will help when reporting it.
      </p>
      <pre className="control max-w-[560px] select-text whitespace-pre-wrap px-3 py-2 text-left text-xs text-muted">
        {detail}
      </pre>
    </div>
  );
}

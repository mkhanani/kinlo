import { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri, platform } from "@/lib/platform";

/**
 * Custom title bar. The whole strip is a drag region.
 * macOS keeps its real traffic lights (overlay title bar), so we only reserve space for them.
 * Windows and Linux get drawn controls that follow each platform's conventions.
 */
export function TitleBar() {
  return (
    <header
      data-tauri-drag-region
      className="relative z-30 flex h-10 shrink-0 items-center"
      onDoubleClick={(e) => {
        // Double click to maximize on Windows and Linux. macOS handles this natively.
        if (isTauri && platform !== "macos" && e.target === e.currentTarget) {
          void getCurrentWindow().toggleMaximize();
        }
      }}
    >
      {platform === "macos" && <div className="w-[78px]" data-tauri-drag-region />}
      <div className="flex-1 self-stretch" data-tauri-drag-region />
      {platform === "windows" && <WindowsControls />}
      {platform === "linux" && <LinuxControls />}
    </header>
  );
}

function useMaximized() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!isTauri) return;
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    void win.isMaximized().then(setMaximized);
    void win
      .onResized(() => {
        void win.isMaximized().then(setMaximized);
      })
      .then((fn) => (unlisten = fn));
    return () => unlisten?.();
  }, []);
  return maximized;
}

const win = () => getCurrentWindow();

function WindowsControls() {
  const maximized = useMaximized();
  const base =
    "flex h-10 w-[46px] items-center justify-center text-fg/80 transition-colors duration-150 hover:bg-control-hover";
  return (
    <div className="flex self-start">
      <button aria-label="Minimize" className={base} onClick={() => void win().minimize()}>
        <Minus size={15} strokeWidth={1.25} />
      </button>
      <button aria-label={maximized ? "Restore" : "Maximize"} className={base} onClick={() => void win().toggleMaximize()}>
        {maximized ? (
          <Copy size={12} strokeWidth={1.25} className="-scale-x-100" />
        ) : (
          <Square size={11} strokeWidth={1.25} />
        )}
      </button>
      <button
        aria-label="Close"
        className={`${base} hover:!bg-danger hover:text-white`}
        onClick={() => void win().close()}
      >
        <X size={16} strokeWidth={1.25} />
      </button>
    </div>
  );
}

function LinuxControls() {
  const maximized = useMaximized();
  const base =
    "flex h-6 w-6 items-center justify-center rounded-full bg-control text-fg/80 transition-colors duration-150 hover:bg-control-hover";
  return (
    <div className="flex items-center gap-2.5 pr-3">
      <button aria-label="Minimize" className={base} onClick={() => void win().minimize()}>
        <Minus size={13} strokeWidth={1.75} />
      </button>
      <button aria-label={maximized ? "Restore" : "Maximize"} className={base} onClick={() => void win().toggleMaximize()}>
        {maximized ? <Copy size={10} strokeWidth={1.75} /> : <Square size={9} strokeWidth={1.75} />}
      </button>
      <button aria-label="Close" className={base} onClick={() => void win().close()}>
        <X size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}

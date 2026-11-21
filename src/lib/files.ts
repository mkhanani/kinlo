import { isTauri } from "./platform";

/**
 * Saving and opening files the user picks. In the app, the system's own dialogs do the
 * choosing and kinlo never names a path. In a plain browser (development and tests) the
 * browser's download and file picker stand in.
 */

/** Asks where to save, then writes the text. False when the user backed out. */
export async function saveTextFile(suggestedName: string, contents: string, mime = "text/plain"): Promise<boolean> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<boolean>("save_text_file", { suggestedName, contents });
  }
  const url = URL.createObjectURL(new Blob([contents], { type: `${mime};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = suggestedName;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

export interface PickedFile {
  name: string;
  contents: string;
}

/** Asks which file to open and returns its text. Null when the user backed out. */
export async function pickTextFile(extensions: string[]): Promise<PickedFile | null> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke<PickedFile | null>("pick_text_file", { extensions })) ?? null;
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = extensions.map((extension) => `.${extension}`).join(",");
    input.addEventListener("cancel", () => resolve(null));
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) resolve(null);
      else void file.text().then((contents) => resolve({ name: file.name, contents: contents.replace(/^﻿/, "") }));
    });
    input.click();
  });
}

/** The full path of the database file. Null outside the app, where there is none. */
export async function dataLocation(): Promise<string | null> {
  if (!isTauri) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("data_location");
}

/** Shows the database file in the system's file manager. */
export async function openDataFolder(): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("open_data_folder");
}

/** Today's date for a file name: 2026-11-21. */
export function fileDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

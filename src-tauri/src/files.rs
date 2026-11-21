//! Getting the user's data in and out of kinlo, and showing where it lives.
//!
//! The web view never gets to name a path. To save an export it hands over the text and
//! a suggested file name, and the system's own "Save as" dialog decides where it goes.
//! To import, the system's "Open" dialog picks the file and only its text comes back.
//! So nothing here can be used to read or write a file the user did not choose.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::db;

/// Larger than any contacts file a person keeps by hand. Stops a wrong pick (a video,
/// say) from being read into memory.
const MAX_IMPORT_BYTES: u64 = 25 * 1024 * 1024;

/// A file name with nothing in it that could point outside the chosen folder.
pub fn safe_file_name(suggested: &str) -> String {
    let cleaned: String = suggested
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '.' | ' '))
        .collect();
    let cleaned = cleaned.trim().trim_start_matches('.').to_string();
    if cleaned.is_empty() {
        "kinlo-export.txt".to_string()
    } else {
        cleaned
    }
}

/// File text as UTF-8, without the marker some spreadsheet programs put at the start.
/// Text in an older Windows encoding is read as Latin-1 rather than refused, so names
/// with accents survive.
pub fn decode_text(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        Err(_) => bytes.iter().map(|&b| b as char).collect(),
    }
}

fn extension_of(name: &str) -> Option<String> {
    Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_lowercase)
}

/// Asks where to save, then writes the text there. `false` when the user cancelled.
#[tauri::command]
pub async fn save_text_file(
    app: AppHandle,
    suggested_name: String,
    contents: String,
) -> Result<bool, String> {
    let name = safe_file_name(&suggested_name);
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app.dialog().file().set_file_name(&name);
        if let Some(extension) = extension_of(&name) {
            dialog = dialog.add_filter(extension.to_uppercase(), &[extension.as_str()]);
        }
        let Some(chosen) = dialog.blocking_save_file() else {
            return Ok(false);
        };
        let path = chosen
            .into_path()
            .map_err(|_| "That is not a place kinlo can save to.".to_string())?;
        std::fs::write(&path, contents)
            .map_err(|_| "kinlo could not save the file there.".to_string())?;
        Ok(true)
    })
    .await
    .map_err(|_| "kinlo could not save the file.".to_string())?
}

#[derive(Serialize)]
pub struct PickedFile {
    pub name: String,
    pub contents: String,
}

/// Asks which file to open and returns its text. `None` when the user cancelled.
#[tauri::command]
pub async fn pick_text_file(
    app: AppHandle,
    extensions: Vec<String>,
) -> Result<Option<PickedFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let wanted: Vec<&str> = extensions
            .iter()
            .map(String::as_str)
            .filter(|e| !e.is_empty() && e.chars().all(char::is_alphanumeric))
            .collect();
        let mut dialog = app.dialog().file();
        if !wanted.is_empty() {
            dialog = dialog.add_filter("Files", &wanted);
        }
        let Some(chosen) = dialog.blocking_pick_file() else {
            return Ok(None);
        };
        let path: PathBuf = chosen
            .into_path()
            .map_err(|_| "kinlo could not open that file.".to_string())?;
        let size = std::fs::metadata(&path)
            .map_err(|_| "kinlo could not open that file.".to_string())?
            .len();
        if size > MAX_IMPORT_BYTES {
            return Err("That file is too large to be a list of contacts.".to_string());
        }
        let bytes =
            std::fs::read(&path).map_err(|_| "kinlo could not read that file.".to_string())?;
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();
        Ok(Some(PickedFile {
            name,
            contents: decode_text(&bytes),
        }))
    })
    .await
    .map_err(|_| "kinlo could not open that file.".to_string())?
}

fn database_file(app: &AppHandle) -> Result<PathBuf, String> {
    let folder = app
        .path()
        .app_config_dir()
        .map_err(|_| "kinlo could not find its data folder.".to_string())?;
    Ok(folder.join(db::DB_FILE))
}

/// Where the database file is, for showing in Settings.
#[tauri::command]
pub fn data_location(app: AppHandle) -> Result<String, String> {
    Ok(database_file(&app)?.to_string_lossy().into_owned())
}

/// Opens the folder that holds the database in the system's file manager, with the file
/// selected where the system supports that.
#[tauri::command]
pub fn open_data_folder(app: AppHandle) -> Result<(), String> {
    let file = database_file(&app)?;
    if file.exists() && app.opener().reveal_item_in_dir(&file).is_ok() {
        return Ok(());
    }
    let folder = file.parent().unwrap_or(&file);
    app.opener()
        .open_path(folder.to_string_lossy(), None::<&str>)
        .map_err(|_| "kinlo could not open the folder.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_names_cannot_leave_the_chosen_folder() {
        assert_eq!(
            safe_file_name("kinlo-2026-11-21.json"),
            "kinlo-2026-11-21.json"
        );
        assert_eq!(safe_file_name("../../etc/passwd"), "etcpasswd");
        assert_eq!(
            safe_file_name("C:\\Windows\\system.ini"),
            "CWindowssystem.ini"
        );
        assert_eq!(safe_file_name(".hidden"), "hidden");
        assert_eq!(safe_file_name("  "), "kinlo-export.txt");
        assert_eq!(safe_file_name("///"), "kinlo-export.txt");
    }

    #[test]
    fn imported_text_loses_its_byte_order_mark() {
        assert_eq!(decode_text(b"\xEF\xBB\xBFName,Email"), "Name,Email");
        assert_eq!(decode_text("Zoë".as_bytes()), "Zoë");
    }

    #[test]
    fn text_in_an_older_encoding_still_reads() {
        // "Zoë" as Windows-1252 / Latin-1: not valid UTF-8.
        assert_eq!(decode_text(b"Zo\xEB"), "Zoë");
    }

    #[test]
    fn finds_the_extension_for_the_save_dialog() {
        assert_eq!(extension_of("people.CSV"), Some("csv".into()));
        assert_eq!(extension_of("backup.json"), Some("json".into()));
        assert_eq!(extension_of("noextension"), None);
    }
}

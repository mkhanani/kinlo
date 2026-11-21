//! Updates, only when asked.
//!
//! kinlo never looks for a new version by itself. When the person presses "Check for
//! updates" in Settings, the app asks GitHub for the newest release. If there is one and
//! they press again, it is downloaded, checked against the public key built into the app,
//! and installed. A download that fails that check is thrown away, so only a release made
//! by this project's own release workflow can ever be installed.
//!
//! This is the one network call kinlo makes besides the AI provider the person chose.
//! Only the released app does it: a dev or staging build has nothing to update to.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::ipc::Channel as Progress;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Error, Update, UpdaterExt};

/// How long to wait for GitHub to answer the question "is there a new version".
const CHECK_TIMEOUT: Duration = Duration::from_secs(20);

pub struct Updates {
    /// Only the released app updates itself.
    enabled: bool,
    /// The update found by the last check, kept until it is installed.
    found: Mutex<Option<Update>>,
}

impl Updates {
    pub fn new(enabled: bool) -> Self {
        Self {
            enabled,
            found: Mutex::new(None),
        }
    }
}

/// What the web view is told about a new version.
#[derive(Debug, Serialize)]
pub struct Available {
    version: String,
}

/// Sent to the web view while an update is being installed.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "step", rename_all = "lowercase")]
pub enum Step {
    Downloading { received: u64, total: Option<u64> },
    Installing,
}

/// Says what went wrong in plain words. The technical reason goes to the terminal.
fn explain(error: &Error) -> String {
    eprintln!("kinlo: update failed: {error}");
    match error {
        Error::Reqwest(_) | Error::Network(_) | Error::ReleaseNotFound => {
            "Could not reach GitHub. Check your connection and try again."
        }
        Error::Minisign(_)
        | Error::Base64(_)
        | Error::SignatureUtf8(_)
        | Error::SignedVersionMismatch { .. }
        | Error::MissingSignedVersion => {
            "The download could not be verified, so it was not installed."
        }
        Error::TargetNotFound(_)
        | Error::TargetsNotFound(_)
        | Error::UnsupportedOs
        | Error::UnsupportedArch => "This release has no update for your system.",
        Error::AuthenticationFailed => {
            "Your system did not give permission to install the update. Nothing was changed."
        }
        _ => "The update could not be installed. Nothing was changed.",
    }
    .to_string()
}

const NOT_RELEASED: &str = "Only the released kinlo updates itself.";

/// Asks GitHub whether there is a newer version. Nothing is downloaded yet.
#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    updates: State<'_, Updates>,
) -> Result<Option<Available>, String> {
    if !updates.enabled {
        return Err(NOT_RELEASED.to_string());
    }
    let updater = app
        .updater_builder()
        .timeout(CHECK_TIMEOUT)
        .build()
        .map_err(|error| explain(&error))?;
    let mut found = updater.check().await.map_err(|error| explain(&error))?;
    if let Some(update) = found.as_mut() {
        // The short wait is for the question, not for the download that may follow.
        update.timeout = None;
    }
    let available = found.as_ref().map(|update| Available {
        version: update.version.clone(),
    });
    *updates
        .found
        .lock()
        .unwrap_or_else(|lock| lock.into_inner()) = found;
    Ok(available)
}

/// Downloads the update found by the last check, verifies it, installs it and starts the
/// new version. On Windows the installer takes over and reopens kinlo itself.
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    updates: State<'_, Updates>,
    progress: Progress<Step>,
) -> Result<(), String> {
    if !updates.enabled {
        return Err(NOT_RELEASED.to_string());
    }
    let update = updates
        .found
        .lock()
        .unwrap_or_else(|lock| lock.into_inner())
        .clone()
        .ok_or("Check for updates first.")?;

    let mut received: u64 = 0;
    let downloading = progress.clone();
    update
        .download_and_install(
            move |chunk, total| {
                received += chunk as u64;
                let _ = downloading.send(Step::Downloading { received, total });
            },
            move || {
                let _ = progress.send(Step::Installing);
            },
        )
        .await
        .map_err(|error| explain(&error))?;

    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_dropped_connection_is_explained_as_one() {
        assert_eq!(
            explain(&Error::ReleaseNotFound),
            "Could not reach GitHub. Check your connection and try again."
        );
        assert_eq!(
            explain(&Error::Network("503".into())),
            "Could not reach GitHub. Check your connection and try again."
        );
    }

    #[test]
    fn a_download_that_fails_the_check_says_it_was_not_installed() {
        for error in [
            Error::MissingSignedVersion,
            Error::SignedVersionMismatch {
                signed: "0.2.0".into(),
                announced: "9.9.9".into(),
            },
            Error::SignatureUtf8("?".into()),
        ] {
            assert_eq!(
                explain(&error),
                "The download could not be verified, so it was not installed."
            );
        }
    }

    #[test]
    fn other_failures_say_nothing_was_changed() {
        assert_eq!(
            explain(&Error::TargetsNotFound(vec!["linux-x86_64".into()])),
            "This release has no update for your system."
        );
        assert_eq!(
            explain(&Error::AuthenticationFailed),
            "Your system did not give permission to install the update. Nothing was changed."
        );
        assert_eq!(
            explain(&Error::InvalidUpdaterFormat),
            "The update could not be installed. Nothing was changed."
        );
    }

    #[test]
    fn progress_is_sent_in_a_shape_the_web_view_expects() {
        let downloading = serde_json::to_value(Step::Downloading {
            received: 5,
            total: Some(10),
        })
        .unwrap();
        assert_eq!(
            downloading,
            serde_json::json!({ "step": "downloading", "received": 5, "total": 10 })
        );
        assert_eq!(
            serde_json::to_value(Step::Installing).unwrap(),
            serde_json::json!({ "step": "installing" })
        );
    }
}

//! API keys for AI providers.
//!
//! A key lives in the operating system's keychain and nowhere else: Keychain on macOS,
//! Credential Manager on Windows, the Secret Service (GNOME Keyring, KWallet) on Linux.
//! It is never written to the database, to a file, or to a log, and no error message
//! built here contains one.
//!
//! The web view reaches the keychain through two commands only, [`set_key`] and
//! [`get_key`]. Each build channel uses its own keychain service name, so a staging
//! build can never read or replace the keys of the released app.

use std::sync::Arc;

use tauri::State;

/// Providers that can have a key. Anything else is refused, so the commands cannot be
/// used to read or write unrelated keychain entries.
pub const PROVIDERS: [&str; 4] = ["anthropic", "openai", "google", "ollama"];

/// A key longer than this is a paste mistake, not a key.
const MAX_KEY_LENGTH: usize = 4096;

/// Where secrets are kept. The real one is the system keychain; tests use memory.
pub trait SecretStore: Send + Sync {
    fn set(&self, account: &str, secret: &str) -> Result<(), String>;
    fn get(&self, account: &str) -> Result<Option<String>, String>;
    fn delete(&self, account: &str) -> Result<(), String>;
}

/// The operating system's keychain, under one service name.
pub struct SystemKeychain {
    service: &'static str,
}

impl SystemKeychain {
    pub fn new(service: &'static str) -> Self {
        Self { service }
    }

    fn entry(&self, account: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(self.service, account).map_err(describe)
    }
}

impl SecretStore for SystemKeychain {
    fn set(&self, account: &str, secret: &str) -> Result<(), String> {
        self.entry(account)?.set_password(secret).map_err(describe)
    }

    fn get(&self, account: &str) -> Result<Option<String>, String> {
        match self.entry(account)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(describe(error)),
        }
    }

    fn delete(&self, account: &str) -> Result<(), String> {
        match self.entry(account)?.delete_credential() {
            // Removing a key that is not there is not a failure.
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(describe(error)),
        }
    }
}

/// A message for the user. Built from the kind of failure only, never from its details,
/// so nothing a keychain backend puts in an error can end up on screen or in a log.
fn describe(error: keyring::Error) -> String {
    match error {
        keyring::Error::NoDefaultStore | keyring::Error::NoStorageAccess(_) => {
            "kinlo could not reach your system's keychain. On Linux this needs a keyring \
             service such as GNOME Keyring or KWallet to be running."
                .to_string()
        }
        _ => "Your system's keychain refused the request.".to_string(),
    }
}

/// The store the commands use. Managed by Tauri.
pub struct Keys(pub Arc<dyn SecretStore>);

fn check_provider(provider: &str) -> Result<(), String> {
    if PROVIDERS.contains(&provider) {
        Ok(())
    } else {
        Err("Unknown provider.".to_string())
    }
}

/// Saves a key, or removes it when `key` is empty or missing.
pub fn store_key(store: &dyn SecretStore, provider: &str, key: Option<&str>) -> Result<(), String> {
    check_provider(provider)?;
    let key = key.map(str::trim).unwrap_or_default();
    if key.is_empty() {
        return store.delete(provider);
    }
    if key.len() > MAX_KEY_LENGTH || key.chars().any(char::is_control) {
        return Err("That does not look like an API key.".to_string());
    }
    store.set(provider, key)
}

/// Reads a key. `None` when there is none saved.
pub fn read_key(store: &dyn SecretStore, provider: &str) -> Result<Option<String>, String> {
    check_provider(provider)?;
    store.get(provider)
}

/// Saves the API key for a provider in the system keychain. An empty key removes it.
#[tauri::command]
pub async fn set_key(
    keys: State<'_, Keys>,
    provider: String,
    key: Option<String>,
) -> Result<(), String> {
    // Keychain calls can block (on Linux they talk to another process), so they run on a
    // thread of their own, away from the window and the async runtime.
    let store = keys.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        store_key(store.as_ref(), &provider, key.as_deref())
    })
    .await
    .map_err(|_| "Your system's keychain refused the request.".to_string())?
}

/// Reads the API key for a provider from the system keychain.
#[tauri::command]
pub async fn get_key(keys: State<'_, Keys>, provider: String) -> Result<Option<String>, String> {
    let store = keys.0.clone();
    tauri::async_runtime::spawn_blocking(move || read_key(store.as_ref(), &provider))
        .await
        .map_err(|_| "Your system's keychain refused the request.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Memory(Mutex<HashMap<String, String>>);

    impl SecretStore for Memory {
        fn set(&self, account: &str, secret: &str) -> Result<(), String> {
            self.0.lock().unwrap().insert(account.into(), secret.into());
            Ok(())
        }
        fn get(&self, account: &str) -> Result<Option<String>, String> {
            Ok(self.0.lock().unwrap().get(account).cloned())
        }
        fn delete(&self, account: &str) -> Result<(), String> {
            self.0.lock().unwrap().remove(account);
            Ok(())
        }
    }

    #[test]
    fn a_saved_key_can_be_read_back() {
        let store = Memory::default();
        assert_eq!(read_key(&store, "anthropic"), Ok(None));
        store_key(&store, "anthropic", Some("sk-ant-example")).unwrap();
        assert_eq!(
            read_key(&store, "anthropic"),
            Ok(Some("sk-ant-example".into()))
        );
        // Each provider has its own entry.
        assert_eq!(read_key(&store, "openai"), Ok(None));
    }

    #[test]
    fn spaces_around_a_pasted_key_are_dropped() {
        let store = Memory::default();
        store_key(&store, "openai", Some("  sk-example\n")).unwrap();
        assert_eq!(read_key(&store, "openai"), Ok(Some("sk-example".into())));
    }

    #[test]
    fn an_empty_key_removes_what_was_saved() {
        let store = Memory::default();
        store_key(&store, "google", Some("abc")).unwrap();
        store_key(&store, "google", Some("   ")).unwrap();
        assert_eq!(read_key(&store, "google"), Ok(None));
        store_key(&store, "google", Some("abc")).unwrap();
        store_key(&store, "google", None).unwrap();
        assert_eq!(read_key(&store, "google"), Ok(None));
        // Removing again is fine.
        store_key(&store, "google", None).unwrap();
    }

    #[test]
    fn only_known_providers_are_allowed() {
        let store = Memory::default();
        assert!(store_key(&store, "github", Some("x")).is_err());
        assert!(read_key(&store, "").is_err());
        assert!(read_key(&store, "../anthropic").is_err());
        assert!(store.0.lock().unwrap().is_empty());
    }

    #[test]
    fn a_refused_key_is_not_repeated_in_the_error() {
        let store = Memory::default();
        let long = "k".repeat(MAX_KEY_LENGTH + 1);
        let error = store_key(&store, "openai", Some(&long)).unwrap_err();
        assert!(!error.contains("kkkk"));
        let error = store_key(&store, "openai", Some("sk-secret\u{7}value")).unwrap_err();
        assert!(!error.contains("sk-secret"));
        assert_eq!(read_key(&store, "openai"), Ok(None));
    }

    /// Talks to the real keychain of the machine it runs on, so it is not part of the
    /// normal test run. The Desktop smoke workflow runs it on Windows and macOS.
    #[test]
    #[ignore = "uses the real system keychain"]
    fn the_real_keychain_keeps_a_key() {
        let store = SystemKeychain::new("app.kinlo.desktop.selftest");
        store_key(&store, "anthropic", Some("kinlo-self-test")).unwrap();
        assert_eq!(
            read_key(&store, "anthropic"),
            Ok(Some("kinlo-self-test".into()))
        );
        store_key(&store, "anthropic", None).unwrap();
        assert_eq!(read_key(&store, "anthropic"), Ok(None));
    }
}

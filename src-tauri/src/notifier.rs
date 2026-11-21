//! Desktop notifications for reminders.
//!
//! The frontend owns the data. Whenever reminders change it sends the list of what is
//! still to come, and this module keeps that list and shows a notification when each
//! one's time arrives. The timing lives here, in a plain thread, because timers inside a
//! hidden or minimized web view are slowed down or paused by every operating system.
//!
//! Nothing here touches the database, and nothing is sent anywhere: a notification is
//! handed to the operating system on this computer and that is all.

use std::collections::HashSet;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_notification::NotificationExt;

/// How often the schedule is checked. A reminder shows within this long of its time.
const TICK: Duration = Duration::from_secs(5);

/// More than this many at once (after the computer wakes from sleep, say) are shown as
/// one summary instead of a burst.
const MAX_AT_ONCE: usize = 3;

#[derive(Clone, Debug, Deserialize, PartialEq)]
pub struct Scheduled {
    pub id: String,
    pub title: String,
    pub body: String,
    /// When to show it, in milliseconds since 1970.
    pub at_ms: i64,
}

impl Scheduled {
    /// A reminder that is snoozed or re-timed gets a new key, so it can notify again.
    fn key(&self) -> String {
        format!("{}@{}", self.id, self.at_ms)
    }
}

#[derive(Default)]
pub struct Schedule {
    items: Mutex<Vec<Scheduled>>,
    fired: Mutex<HashSet<String>>,
}

/// Picks out what is due and has not been shown yet, and marks it as shown.
pub fn take_due(items: &[Scheduled], fired: &mut HashSet<String>, now_ms: i64) -> Vec<Scheduled> {
    let mut due: Vec<Scheduled> = items
        .iter()
        .filter(|item| item.at_ms <= now_ms && fired.insert(item.key()))
        .cloned()
        .collect();
    due.sort_by_key(|item| item.at_ms);
    due
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn show(app: &AppHandle, title: &str, body: &str) {
    let mut builder = app.notification().builder().title(title);
    if !body.is_empty() {
        builder = builder.body(body);
    }
    if let Err(error) = builder.show() {
        eprintln!("kinlo: could not show a notification: {error}");
    }
}

/// Starts the thread that watches the schedule for as long as the app runs.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(TICK);
        let schedule = app.state::<Schedule>();
        let due = {
            let items = schedule.items.lock().unwrap_or_else(|e| e.into_inner());
            let mut fired = schedule.fired.lock().unwrap_or_else(|e| e.into_inner());
            take_due(&items, &mut fired, now_ms())
        };
        if due.len() > MAX_AT_ONCE {
            let names: Vec<&str> = due
                .iter()
                .take(MAX_AT_ONCE)
                .map(|d| d.title.as_str())
                .collect();
            show(
                &app,
                &format!("{} reminders are due", due.len()),
                &format!("{}, and more", names.join(", ")),
            );
        } else {
            for item in &due {
                show(&app, &item.title, &item.body);
            }
        }
    });
}

/// Replaces the schedule with what the frontend says is still to come.
#[tauri::command]
pub fn schedule_notifications(schedule: State<'_, Schedule>, items: Vec<Scheduled>) {
    let keys: HashSet<String> = items.iter().map(Scheduled::key).collect();
    // Forget what was shown for reminders that are gone, so the set stays small.
    schedule
        .fired
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .retain(|key| keys.contains(key));
    *schedule.items.lock().unwrap_or_else(|e| e.into_inner()) = items;
}

/// Shows a notification straight away. Used for the test button in Settings and for the
/// summary of what came due while the app was closed.
#[tauri::command]
pub fn notify_now(app: AppHandle, title: String, body: String) {
    show(&app, &title, &body);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str, at_ms: i64) -> Scheduled {
        Scheduled {
            id: id.into(),
            title: id.into(),
            body: String::new(),
            at_ms,
        }
    }

    #[test]
    fn shows_what_is_due_and_leaves_the_rest() {
        let items = [
            item("later", 2_000),
            item("now", 1_000),
            item("earlier", 500),
        ];
        let mut fired = HashSet::new();
        let due = take_due(&items, &mut fired, 1_000);
        // Oldest first, and nothing from the future.
        assert_eq!(
            due.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(),
            ["earlier", "now"]
        );
    }

    #[test]
    fn never_shows_the_same_reminder_twice() {
        let items = [item("a", 1_000)];
        let mut fired = HashSet::new();
        assert_eq!(take_due(&items, &mut fired, 1_000).len(), 1);
        assert!(take_due(&items, &mut fired, 5_000).is_empty());
        assert!(take_due(&items, &mut fired, 9_000).is_empty());
    }

    #[test]
    fn a_snoozed_reminder_notifies_again_at_its_new_time() {
        let mut fired = HashSet::new();
        assert_eq!(take_due(&[item("a", 1_000)], &mut fired, 1_000).len(), 1);
        // Same reminder, new time.
        let snoozed = [item("a", 4_000)];
        assert!(take_due(&snoozed, &mut fired, 2_000).is_empty());
        assert_eq!(take_due(&snoozed, &mut fired, 4_000).len(), 1);
    }
}

//! Running in the background.
//!
//! A reminder can only notify while the app is running. So when "keep running in the
//! background" is on, closing the window hides it instead of quitting, and kinlo stays
//! in the system tray (the menu bar on macOS). Opening kinlo again, or clicking the tray
//! icon, brings the window back.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, State, Window, WindowEvent};

/// Passed when the app is started by the system at login, so it starts in the tray.
pub const HIDDEN_ARG: &str = "--hidden";

#[derive(Default)]
pub struct Background {
    /// The user's setting, sent by the frontend once it has loaded.
    run_in_background: AtomicBool,
    /// Whether the tray icon could be created. Without one, hiding the window would leave
    /// no way back, so the window is only ever hidden when this is true.
    tray_ready: AtomicBool,
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn build_tray(app: &AppHandle, tooltip: &str) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open kinlo", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit kinlo", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip(tooltip)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    // macOS menu bar icons are single-colour templates the system tints itself.
    #[cfg(target_os = "macos")]
    {
        let mark = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-template.png"))?;
        tray = tray.icon(mark).icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.build(app)?;
    Ok(())
}

/// Creates the tray icon and shows the window, unless the app was started at login.
pub fn setup(app: &AppHandle, tooltip: &str) {
    let state = app.state::<Background>();
    match build_tray(app, tooltip) {
        Ok(()) => state.tray_ready.store(true, Ordering::Relaxed),
        Err(error) => {
            eprintln!("kinlo: no tray icon, so the window will not hide on close: {error}")
        }
    }

    let started_at_login = std::env::args().any(|arg| arg == HIDDEN_ARG);
    if !(started_at_login && state.tray_ready.load(Ordering::Relaxed)) {
        show_main_window(app);
    }
}

/// Closing the window hides it when the app is meant to keep running.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        let state = window.state::<Background>();
        if window.label() == "main"
            && state.run_in_background.load(Ordering::Relaxed)
            && state.tray_ready.load(Ordering::Relaxed)
        {
            api.prevent_close();
            let _ = window.hide();
        }
    }
}

#[allow(unused_variables)]
pub fn on_run_event(app: &AppHandle, event: RunEvent) {
    // Clicking the Dock icon while the window is hidden.
    #[cfg(target_os = "macos")]
    if let RunEvent::Reopen { .. } = event {
        show_main_window(app);
    }
}

#[tauri::command]
pub fn set_run_in_background(state: State<'_, Background>, enabled: bool) {
    state.run_in_background.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

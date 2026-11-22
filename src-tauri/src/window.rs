//! Native window materials.
//! Windows 11: Mica. Windows 10: Acrylic. macOS: vibrancy. Linux: none (the frontend draws a solid backdrop).

#[allow(unused_variables)]
pub fn apply_effects(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::{apply_acrylic, apply_mica};
        // Mica is Windows 11 only and returns an error elsewhere, so fall back to Acrylic.
        if apply_mica(window, None).is_err() {
            let _ = apply_acrylic(window, Some((18, 18, 20, 120)));
        }
    }

    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};
        let _ = apply_vibrancy(
            window,
            NSVisualEffectMaterial::Sidebar,
            Some(NSVisualEffectState::FollowsWindowActiveState),
            None,
        );
    }
}

/// On Windows the web view keeps a browser's own shortcuts: Ctrl+J for its downloads list,
/// Ctrl+R and F5 to reload, Ctrl+P to print, Ctrl+F to find. kinlo is not a browser, and
/// Ctrl+J is how the assistant is opened, so they are turned off. Copy, paste, undo,
/// select all and moving around in text are not affected. Other systems have none of these.
#[allow(unused_variables)]
pub fn disable_browser_shortcuts(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        let _ = window.with_webview(|webview| {
            use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
            use windows_core::Interface;
            // SAFETY: plain calls on the web view this window owns, made on its own thread.
            unsafe {
                let Ok(core) = webview.controller().CoreWebView2() else {
                    return;
                };
                let Ok(settings) = core.Settings() else {
                    return;
                };
                if let Ok(settings) = settings.cast::<ICoreWebView2Settings3>() {
                    let _ = settings.SetAreBrowserAcceleratorKeysEnabled(false);
                }
            }
        });
    }
}

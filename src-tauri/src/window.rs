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

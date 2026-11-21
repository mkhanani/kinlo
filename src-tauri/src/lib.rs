mod channel;
mod db;
mod window;

use channel::Channel;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    let channel = Channel::from_identifier(&context.config().identifier);

    // Tell the webview which channel it is before any app code runs.
    let channel_plugin = tauri::plugin::Builder::<tauri::Wry>::new("kinlo-channel")
        .js_init_script(format!(
            "Object.defineProperty(window, '__KINLO_CHANNEL__', {{ value: '{}' }});",
            channel.as_str()
        ))
        .build();

    tauri::Builder::default()
        .plugin(channel_plugin)
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(db::DB_URL, db::migrations())
                .build(),
        )
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_title(channel.window_title());
                window::apply_effects(&main);
            }
            Ok(())
        })
        .run(context)
        .expect("error while running kinlo");
}

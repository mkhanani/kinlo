mod background;
mod channel;
mod db;
mod files;
mod keychain;
mod notifier;
mod updates;
mod window;

use std::sync::Arc;

use channel::Channel;
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;

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
        // First, so a second launch hands over to the app already running and exits. Only
        // one copy may own the database, and this is also how the window comes back when
        // it has been hidden to the tray.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            background::show_main_window(app);
        }))
        .plugin(channel_plugin)
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(db::DB_URL, db::migrations())
                .build(),
        )
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        // Used only from `updates`: nothing is checked or downloaded until the person asks.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec![background::HIDDEN_ARG]),
        ))
        .manage(notifier::Schedule::default())
        .manage(background::Background::default())
        .manage(keychain::Keys(Arc::new(keychain::SystemKeychain::new(
            channel.keychain_service(),
        ))))
        .manage(updates::Updates::new(channel == Channel::Production))
        .invoke_handler(tauri::generate_handler![
            notifier::schedule_notifications,
            notifier::notify_now,
            background::set_run_in_background,
            background::quit_app,
            keychain::set_key,
            keychain::get_key,
            files::save_text_file,
            files::pick_text_file,
            files::data_location,
            files::open_data_folder,
            updates::check_for_update,
            updates::install_update,
        ])
        .setup(move |app| {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_title(channel.window_title());
                window::apply_effects(&main);
            }
            // The window starts hidden in the config and is shown here, unless the app
            // was started at login and should wait quietly in the tray.
            background::setup(app.handle(), channel.window_title());
            notifier::start(app.handle().clone());
            Ok(())
        })
        .on_window_event(background::on_window_event)
        .build(context)
        .expect("error while building kinlo")
        .run(background::on_run_event);
}

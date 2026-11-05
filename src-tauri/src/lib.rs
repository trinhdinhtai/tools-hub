use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, WindowEvent, Wry};
use tauri_plugin_updater::{Update, UpdaterExt};

/// Passed by the OS when it launches the app at login: start in the tray, without showing the window.
const HIDDEN_ARG: &str = "--hidden";

/// The "quit on close" Preference. Off (the default), the close button hides the window to the tray.
struct QuitOnClose(AtomicBool);

/// The tray menu's items, kept to relabel them when the interface language changes.
struct TrayItems {
    open: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

/// Brings the main window back from the tray, the taskbar or behind other windows.
fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
fn set_quit_on_close(quit: bool, state: State<QuitOnClose>) {
    state.0.store(quit, Ordering::Relaxed);
}

#[tauri::command]
fn set_tray_labels(open: String, quit: String, items: State<TrayItems>) -> Result<(), String> {
    items.open.set_text(open).map_err(|e| e.to_string())?;
    items.quit.set_text(quit).map_err(|e| e.to_string())
}

/// The update the last check found, kept so installing it never checks again.
#[derive(Default)]
struct PendingUpdate(Mutex<Option<Update>>);

/// What the Settings show about a newer version.
#[derive(serde::Serialize)]
struct AvailableUpdate {
    version: String,
    /// The release notes, i.e. the changelog.
    notes: Option<String>,
}

/// Asks the release server for a newer version. The only network access the app makes, and only ever called when the
/// user presses "Check for updates": there is no check at startup or in the background (ADR-0001).
#[tauri::command]
async fn check_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<Option<AvailableUpdate>, String> {
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let found = update.as_ref().map(|update| AvailableUpdate {
        version: update.version.clone(),
        notes: update.body.clone(),
    });
    *pending.0.lock().unwrap() = update;
    Ok(found)
}

/// Downloads the update the last check found, verifies its signature against the public key in tauri.conf.json, and
/// installs it, then restarts. A download whose signature does not match is refused and nothing is installed.
#[tauri::command]
async fn install_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<(), String> {
    let update = pending.0.lock().unwrap().take().ok_or("No update to install: check for updates first")?;
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    app.restart()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // First, so a second launch hands over to the running app before anything else starts.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![HIDDEN_ARG]),
        ))
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(QuitOnClose(AtomicBool::new(false)))
        .manage(PendingUpdate::default())
        .setup(|app| {
            // English until the interface sends its own labels (set_tray_labels).
            let open = MenuItem::with_id(app, "open", "Open Tools Hub", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("Tools Hub")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            app.manage(TrayItems { open, quit });

            // The window is created hidden (tauri.conf.json), so a launch at login never flashes it.
            if !std::env::args().any(|arg| arg == HIDDEN_ARG) {
                show_main(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if !window.state::<QuitOnClose>().0.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_quit_on_close,
            set_tray_labels,
            check_update,
            install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tools Hub");
}

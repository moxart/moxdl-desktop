//! The floating drop target, as IDM has: a small pomegranate that stays above other windows.
//! Links dragged onto it go to the add dialog; a click brings Mox up; it can be dragged anywhere,
//! and keeps its place for next time. The page it shows is the app's own, with ?dropzone.
//!
//! Wayland lets no window place itself or stay on top, so there it is an ordinary small window.

use std::path::PathBuf;

use tauri::{AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent};

pub const LABEL: &str = "dropzone";
const SIZE: f64 = 64.0;
const MARGIN: i32 = 48; // from the corner of the screen, the first time

#[tauri::command]
pub fn set_dropzone(on: bool, app: AppHandle) -> Result<(), String> {
    let existing = app.get_webview_window(LABEL);
    match (on, existing) {
        (false, Some(window)) => window.destroy().map_err(|e| e.to_string()),
        (true, None) => open(&app),
        _ => Ok(()),
    }
}

fn place_file(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_local_data_dir()
        .ok()
        .map(|dir| dir.join("dropzone-place"))
}

fn open(app: &AppHandle) -> Result<(), String> {
    let builder =
        WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html?dropzone".into()))
            .title("Mox")
            .inner_size(SIZE, SIZE)
            .resizable(false)
            .decorations(false)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible_on_all_workspaces(true)
            .focused(false)
            // The page takes drops itself, as the main window does, to read the dragged links.
            .disable_drag_drop_handler();
    // Round on Windows and Linux; macOS needs a private API for that, so there it is a square.
    #[cfg(not(target_os = "macos"))]
    let builder = builder.transparent(true);
    let window = builder.build().map_err(|e| e.to_string())?;

    let saved = place_file(app)
        .and_then(|file| std::fs::read_to_string(file).ok())
        .and_then(|text| {
            let (x, y) = text.trim().split_once(',')?;
            Some(PhysicalPosition::new(
                x.parse::<i32>().ok()?,
                y.parse::<i32>().ok()?,
            ))
        });
    let corner = || {
        let monitor = window.primary_monitor().ok().flatten()?;
        let (size, origin, scale) = (monitor.size(), monitor.position(), monitor.scale_factor());
        let side = (SIZE * scale) as i32;
        let margin = (f64::from(MARGIN) * scale) as i32;
        Some(PhysicalPosition::new(
            origin.x + size.width as i32 - side - margin,
            origin.y + size.height as i32 - side - margin * 2,
        ))
    };
    if let Some(place) = saved.or_else(corner) {
        let _ = window.set_position(place);
    }

    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Moved(place) = event
            && let Some(file) = place_file(&handle)
        {
            let _ = std::fs::write(file, format!("{},{}", place.x, place.y));
        }
    });
    Ok(())
}

/// Links dropped on it: to the add dialog, as links from the browser go.
#[tauri::command]
pub fn dropped_links(text: String, app: AppHandle) {
    let urls = crate::urls_in_text(&text);
    if !urls.is_empty() {
        crate::queue_links(&app, urls);
    }
}

#[tauri::command]
pub fn show_main(app: AppHandle) {
    crate::show_window(&app);
}

//! A key that works in any program: Ctrl+Shift+M (Cmd+Shift+M on a Mac) hands the links on the
//! clipboard to Mox at once, without bringing its window up. A notification says what happened.
//!
//! Global keys work on Windows, macOS and X11. Wayland lets no program take one, so there the
//! key is registered but never arrives; Settings says so.

use serde_json::json;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;

pub const KEY: &str = "CommandOrControl+Shift+M";

#[tauri::command]
pub fn set_hotkey(on: bool, app: AppHandle) -> Result<(), String> {
    let shortcuts = app.global_shortcut();
    if shortcuts.is_registered(KEY) {
        shortcuts.unregister(KEY).map_err(|e| e.to_string())?;
    }
    if on {
        shortcuts
            .on_shortcut(KEY, |app, _, event| {
                if event.state == ShortcutState::Pressed {
                    from_clipboard(app);
                }
            })
            .map_err(|e| format!("Ctrl+Shift+M is taken by another program: {e}"))?;
    }
    Ok(())
}

fn from_clipboard(app: &AppHandle) {
    let text = app.clipboard().read_text().unwrap_or_default();
    let count = crate::urls_in_text(&text).len();
    let fa = crate::persian(app);
    let said = if count == 0 {
        if fa {
            "لینکی در کلیپ‌بورد نیست".to_owned()
        } else {
            "No links on the clipboard".to_owned()
        }
    } else {
        let added = json!({ "cmd": "add", "text": text, "skip_known": true });
        match crate::send_to_engine(app, &added.to_string()) {
            Ok(()) if fa => crate::digits(&format!("{count} لینک به Mox داده شد")),
            Ok(()) if count == 1 => "A link went to Mox".to_owned(),
            Ok(()) => format!("{count} links went to Mox"),
            Err(e) => e,
        }
    };
    let _ = app.notification().builder().title("Mox").body(said).show();
}

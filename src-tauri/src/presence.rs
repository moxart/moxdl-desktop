//! Showing that Mox is downloading when its window is not in front, where people look anyway:
//! - the icon by the clock: a crimson arrow while downloading, grey with a pause sign while the
//!   rest only waits, a green check for a few seconds once everything is done;
//! - the taskbar or dock icon fills with the progress of everything (Windows, macOS, and Linux
//!   docks that read libunity, such as Ubuntu's and Dash to Dock);
//! - the window's title says it too, for Alt+Tab: "42% · 3.1 MB/s — Mox";
//! - the floating drop target, when it is on, draws a ring of the same progress.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use tauri::image::Image;
use tauri::window::{ProgressBarState, ProgressBarStatus};
use tauri::{AppHandle, Emitter, Manager};

/// How long the green check stays once everything is done.
const DONE_FOR: Duration = Duration::from_secs(8);
/// How often the title may change while downloading: the speed changes four times a second.
const TITLE_EVERY: Duration = Duration::from_secs(2);

#[derive(Clone, Copy, PartialEq, Debug)]
enum Look {
    Idle,
    Busy,
    Paused,
    Done,
}

struct Shown {
    look: Look,
    bar: Option<(u8, u64)>, // what the taskbar shows: a status code and a percentage
    title: String,
    title_at: Instant,
    ring: Option<(Look, u64)>, // what the drop target was last told
    done_until: Option<Instant>,
}

pub struct Presence(Mutex<Shown>);

impl Presence {
    pub fn new() -> Self {
        Presence(Mutex::new(Shown {
            look: Look::Idle,
            bar: None,
            title: "Mox".into(),
            title_at: Instant::now(),
            ring: None,
            done_until: None,
        }))
    }
}

/// The drop target has just opened: tell it how things stand with the next state.
pub fn forget_ring(app: &AppHandle) {
    app.state::<Presence>().0.lock().unwrap().ring = None;
}

/// Follow one state from the engine. ran_dry: the last download has just finished.
pub fn follow(app: &AppHandle, state: &Value, ran_dry: bool) {
    let downloads = state["downloads"].as_array().cloned().unwrap_or_default();
    let status = |d: &Value| d["status"].as_str().unwrap_or("").to_owned();
    let running = downloads
        .iter()
        .filter(|d| ["connecting", "downloading", "verifying"].contains(&status(d).as_str()))
        .count();
    let unfinished: Vec<&Value> = downloads
        .iter()
        .filter(|d| !["done", "error"].contains(&status(d).as_str()))
        .collect();
    // Of everything still to come, by the sizes known.
    let (done, total) = unfinished
        .iter()
        .filter_map(|d| {
            Some((
                d["done"].as_f64()?,
                d["total"].as_f64().filter(|t| *t > 0.0)?,
            ))
        })
        .fold((0.0, 0.0), |(a, b), (d, t)| (a + d, b + t));
    let percent = (total > 0.0).then(|| ((100.0 * done / total).floor() as u64).min(99));

    let shown = app.state::<Presence>();
    let mut shown = shown.0.lock().unwrap();
    if ran_dry {
        shown.done_until = Some(Instant::now() + DONE_FOR);
    }
    let look = if running > 0 {
        Look::Busy
    } else if shown.done_until.is_some_and(|until| Instant::now() < until) {
        Look::Done
    } else if !unfinished.is_empty() {
        Look::Paused
    } else {
        Look::Idle
    };

    if look != shown.look {
        set_tray_icon(app, look);
    }

    let bar = match look {
        Look::Busy => Some(percent.map_or((2, 0), |p| (1, p))), // 2: no size known yet
        Look::Paused => percent.map(|p| (3, p)),
        Look::Done | Look::Idle => None,
    };
    if bar != shown.bar {
        set_taskbar(app, bar);
        shown.bar = bar;
    }

    let title = if look == Look::Busy {
        let speed = crate::human_size(state["speed"].as_f64().unwrap_or(0.0));
        let text = match percent {
            Some(p) => format!("{p}% · {speed}/s — Mox"),
            None => format!("{speed}/s — Mox"),
        };
        if crate::persian(app) {
            crate::digits(&text)
        } else {
            text
        }
    } else {
        "Mox".to_owned()
    };
    if title != shown.title && (look != shown.look || shown.title_at.elapsed() >= TITLE_EVERY) {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_title(&title);
        }
        shown.title = title;
        shown.title_at = Instant::now();
    }

    let ring = (look, percent.unwrap_or(0));
    if shown.ring != Some(ring) && app.get_webview_window(crate::dropzone::LABEL).is_some() {
        let progress = percent.map(|p| p as f64 / 100.0);
        let _ = app.emit_to(
            crate::dropzone::LABEL,
            "overall",
            json!({ "busy": look == Look::Busy, "progress": progress }),
        );
        shown.ring = Some(ring);
    }
    shown.look = look;
}

fn set_tray_icon(app: &AppHandle, look: Look) {
    let Some(tray) = app.tray_by_id("mox") else {
        return;
    };
    let icon = match look {
        Look::Busy => Some(tauri::include_image!("icons/tray/busy.png")),
        Look::Paused => Some(tauri::include_image!("icons/tray/paused.png")),
        Look::Done => Some(tauri::include_image!("icons/tray/done.png")),
        Look::Idle => app.default_window_icon().cloned().map(Image::to_owned),
    };
    if icon.is_some() {
        let _ = tray.set_icon(icon);
    }
}

fn set_taskbar(app: &AppHandle, bar: Option<(u8, u64)>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let (status, progress) = match bar {
        Some((1, p)) => (ProgressBarStatus::Normal, Some(p)),
        Some((2, _)) => (ProgressBarStatus::Indeterminate, None),
        Some((_, p)) => (ProgressBarStatus::Paused, Some(p)),
        None => (ProgressBarStatus::None, None),
    };
    let _ = window.set_progress_bar(ProgressBarState {
        status: Some(status),
        progress,
    });
}

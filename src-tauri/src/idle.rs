//! The polite mode: while someone uses the computer, downloads keep to a lower speed, so a video
//! call or a web page is not starved; once nobody has touched it for a while, they go at full
//! speed again. The app asks the system how long since the last key press or mouse move, and
//! tells the engine the limit with `set polite`.

#[cfg(not(windows))]
use std::process::Command;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Manager};

/// How often to look.
const LOOK_EVERY: Duration = Duration::from_secs(5);
/// Away this long counts as nobody there: shorter, and reading a page would count as away.
const AWAY_AFTER: u64 = 120;

pub struct Polite {
    /// The limit while someone is there, bytes a second; None when the mode is off.
    limit: Mutex<Option<u64>>,
    /// What the engine was last told, so it is told only of changes.
    told: Mutex<Option<Option<u64>>>,
}

impl Polite {
    pub fn new() -> Self {
        Polite {
            limit: Mutex::new(None),
            told: Mutex::new(None),
        }
    }
}

/// Switch the polite mode on with a limit, or off with null. Returns whether this system can
/// tell when someone is there: where it cannot, the limit holds all the time.
#[tauri::command]
pub fn set_polite(limit: Option<u64>, app: AppHandle) -> bool {
    *app.state::<Polite>().limit.lock().unwrap() = limit;
    if let Some(tray) = app.try_state::<crate::Tray>() {
        let _ = tray.polite.set_checked(limit.is_some());
    }
    *app.state::<Polite>().told.lock().unwrap() = None; // tell the engine afresh
    tick(&app);
    idle_seconds().is_some()
}

pub fn start(app: &AppHandle) {
    let app = app.clone();
    thread::spawn(move || {
        loop {
            thread::sleep(LOOK_EVERY);
            tick(&app);
        }
    });
}

fn tick(app: &AppHandle) {
    let state = app.state::<Polite>();
    let limit = *state.limit.lock().unwrap();
    let wanted = match limit {
        None => None,
        Some(limit) => match idle_seconds() {
            Some(idle) if idle >= AWAY_AFTER => None, // nobody there: full speed
            _ => Some(limit),
        },
    };
    let mut told = state.told.lock().unwrap();
    if *told != Some(wanted)
        && crate::send_to_engine(app, &json!({ "cmd": "set", "polite": wanted }).to_string())
            .is_ok()
    {
        *told = Some(wanted);
    }
}

/// Seconds since the last key press or mouse move, or None where that cannot be found out.
pub fn idle_seconds() -> Option<u64> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::System::SystemInformation::GetTickCount;
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
        let mut info = LASTINPUTINFO {
            cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
            dwTime: 0,
        };
        // SAFETY: info is a valid LASTINPUTINFO with cbSize set, as the call requires.
        if unsafe { GetLastInputInfo(&mut info) } == 0 {
            return None;
        }
        // SAFETY: GetTickCount takes nothing and cannot fail.
        let now = unsafe { GetTickCount() };
        Some(u64::from(now.wrapping_sub(info.dwTime)) / 1000)
    }
    #[cfg(target_os = "macos")]
    {
        // "HIDIdleTime" = nanoseconds since the last input
        let out = Command::new("ioreg")
            .args(["-c", "IOHIDSystem", "-d", "4"])
            .output()
            .ok()?;
        let text = String::from_utf8_lossy(&out.stdout);
        let line = text.lines().find(|l| l.contains("\"HIDIdleTime\""))?;
        let nanos: u64 = line.rsplit('=').next()?.trim().parse().ok()?;
        Some(nanos / 1_000_000_000)
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        linux_idle_seconds()
    }
}

/// GNOME answers on its own bus, KDE and others on the freedesktop screensaver one, and plain
/// X11 through xprintidle where it is installed. Wayland gives no other way.
#[cfg(all(unix, not(target_os = "macos")))]
fn linux_idle_seconds() -> Option<u64> {
    let ask = |args: &[&str]| -> Option<String> {
        let out = Command::new(args[0]).args(&args[1..]).output().ok()?;
        out.status
            .success()
            .then(|| String::from_utf8_lossy(&out.stdout).into_owned())
    };
    // "(uint64 12345,)": milliseconds, the last number in the answer
    let number = |text: String| -> Option<u64> {
        text.split(|c: char| !c.is_ascii_digit())
            .rfind(|part| !part.is_empty())
            .and_then(|part| part.parse().ok())
    };
    if let Some(ms) = ask(&[
        "gdbus",
        "call",
        "--session",
        "--dest",
        "org.gnome.Mutter.IdleMonitor",
        "--object-path",
        "/org/gnome/Mutter/IdleMonitor/Core",
        "--method",
        "org.gnome.Mutter.IdleMonitor.GetIdletime",
    ])
    .and_then(number)
    {
        return Some(ms / 1000);
    }
    if let Some(ms) = ask(&[
        "gdbus",
        "call",
        "--session",
        "--dest",
        "org.freedesktop.ScreenSaver",
        "--object-path",
        "/org/freedesktop/ScreenSaver",
        "--method",
        "org.freedesktop.ScreenSaver.GetSessionIdleTime",
    ])
    .and_then(number)
    {
        return Some(ms / 1000);
    }
    ask(&["xprintidle"])
        .and_then(|t| t.trim().parse::<u64>().ok())
        .map(|ms| ms / 1000)
}

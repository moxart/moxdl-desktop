//! The desktop shell around mox. It does no downloading itself: it starts `mox engine`, passes
//! the UI's commands to it as JSON lines on its stdin, and hands every line the engine prints to
//! the UI as an "engine" event. The protocol is documented on `Engine` in mox.py.
//!
//! It also reads those events itself, for what has to work with the window closed: the icon by
//! the clock, with the speed and pause/resume for everything, and a notification per download.

use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent, Wry};
use tauri_plugin_notification::NotificationExt;

/// How long quitting waits for mox to save the progress of every download.
const QUIT_GRACE: Duration = Duration::from_secs(8);
/// How often the speed in the tray menu changes. Rebuilding the menu four times a second, as
/// often as the engine reports, is wasted work on Linux.
const TRAY_EVERY: Duration = Duration::from_secs(2);

struct Engine {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    /// Something is downloading or waiting its turn, so closing the window only hides it.
    busy: AtomicBool,
    /// The "still downloading in the background" notice has been shown once.
    told_hidden: AtomicBool,
}

struct Tray {
    status: MenuItem<Wry>,
}

/// The command that starts the engine, first match wins:
/// 1. MOX_ENGINE, a whole command line, e.g. `python3 /path/to/mox.py`;
/// 2. in a debug build, the mox checkout next to this repo (`../moxdl/mox.py`), so changes to
///    mox show up without rebuilding anything;
/// 3. `mox-engine` next to the app, mox built into one executable that the installers carry
///    (scripts/build-engine.sh), so an installed app needs no Python;
/// 4. `mox` on the PATH, as pipx installs it.
fn engine_command() -> Command {
    if let Ok(line) = std::env::var("MOX_ENGINE") {
        let mut parts = line.split_whitespace();
        if let Some(program) = parts.next() {
            let mut command = Command::new(program);
            command.args(parts);
            return command;
        }
    }
    let checkout = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../moxdl/mox.py");
    if cfg!(debug_assertions) && checkout.exists() {
        let python = if cfg!(windows) { "python" } else { "python3" };
        let mut command = Command::new(python);
        command.arg(checkout);
        return command;
    }
    let bundled = std::env::current_exe().ok().and_then(|exe| {
        exe.parent().map(|dir| {
            dir.join(if cfg!(windows) {
                "mox-engine.exe"
            } else {
                "mox-engine"
            })
        })
    });
    if let Some(engine) = bundled.filter(|path| path.exists()) {
        return Command::new(engine);
    }
    Command::new("mox")
}

fn start_engine(app: &AppHandle) -> Result<(), String> {
    let mut command = engine_command();
    command
        .arg("engine")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // The list of downloads lives here between runs, so it is back after a restart.
    if let Ok(folder) = app.path().app_local_data_dir() {
        command.arg("--state").arg(folder.join("downloads.json"));
    }
    // mox saves to its working folder unless a dir is set. That was wherever the app started:
    // src-tauri in development, which put a test download in the repository, and possibly a
    // folder no one can write to when started from a desktop menu. Downloads is what people expect.
    if let Ok(folder) = app.path().download_dir().or_else(|_| app.path().home_dir()) {
        command.current_dir(folder);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: no console flashing up
    }
    let mut child = command.spawn().map_err(|e| {
        format!("could not start mox: {e}. Install it with pipx install moxdl, or set MOX_ENGINE.")
    })?;

    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let state = app.state::<Engine>();
    *state.stdin.lock().unwrap() = child.stdin.take();
    *state.child.lock().unwrap() = Some(child);

    let events = app.clone();
    thread::spawn(move || {
        let mut tray_text = String::new();
        let mut tray_changed = Instant::now() - TRAY_EVERY;
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(event) = serde_json::from_str::<Value>(&line) {
                match event["type"].as_str() {
                    Some("state") => {
                        let text = follow_state(&events, &event);
                        if text != tray_text && tray_changed.elapsed() >= TRAY_EVERY {
                            set_tray_status(&events, &text);
                            tray_text = text;
                            tray_changed = Instant::now();
                        }
                    }
                    Some("finished") => notify_finished(&events, &event),
                    _ => {}
                }
            }
            let _ = events.emit("engine", line);
        }
        events
            .state::<Engine>()
            .busy
            .store(false, Ordering::Relaxed);
        set_tray_status(&events, "mox stopped");
        let _ = events.emit("engine-exit", ());
    });
    let logs = app.clone();
    thread::spawn(move || {
        // mox writes warnings, such as a bad saved setting, to stderr.
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let _ = logs.emit("engine-log", line);
        }
    });
    Ok(())
}

/// Note whether anything is busy, and say what is going on, for the tray menu.
fn follow_state(app: &AppHandle, state: &Value) -> String {
    let downloads = state["downloads"].as_array().cloned().unwrap_or_default();
    let status = |d: &Value| d["status"].as_str().unwrap_or("").to_owned();
    let running = downloads
        .iter()
        .filter(|d| ["connecting", "downloading", "verifying"].contains(&status(d).as_str()))
        .count();
    let waiting = downloads.iter().filter(|d| status(d) == "waiting").count();
    app.state::<Engine>()
        .busy
        .store(running + waiting > 0, Ordering::Relaxed);
    if running == 0 {
        return if waiting > 0 {
            format!("{waiting} waiting")
        } else {
            "Nothing downloading".into()
        };
    }
    let speed = state["speed"].as_f64().unwrap_or(0.0);
    format!("{}/s · {running} downloading", human_size(speed))
}

/// The same units as mox prints.
fn human_size(bytes: f64) -> String {
    let mut n = bytes;
    for unit in ["B", "KB", "MB", "GB"] {
        if n < 1024.0 {
            return if unit == "B" {
                format!("{n:.0} B")
            } else {
                format!("{n:.1} {unit}")
            };
        }
        n /= 1024.0;
    }
    format!("{n:.1} TB")
}

fn set_tray_status(app: &AppHandle, text: &str) {
    if let Some(tray) = app.try_state::<Tray>() {
        let _ = tray.status.set_text(text);
    }
}

/// A desktop notification for a finished or failed download, unless the window is in front:
/// there the list already shows it.
fn notify_finished(app: &AppHandle, event: &Value) {
    let watching = app
        .get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
        .unwrap_or(false);
    if watching {
        return;
    }
    let name = event["name"].as_str().unwrap_or("A download");
    let (title, body) = if event["status"] == "done" {
        ("Download finished".to_owned(), name.to_owned())
    } else {
        let message = event["message"].as_str().unwrap_or("");
        ("Download failed".to_owned(), format!("{name}: {message}"))
    };
    let _ = app.notification().builder().title(title).body(body).show();
}

fn send_to_engine(app: &AppHandle, line: &str) -> Result<(), String> {
    let state = app.state::<Engine>();
    let mut stdin = state.stdin.lock().unwrap();
    let pipe = stdin.as_mut().ok_or("mox is not running")?;
    writeln!(pipe, "{}", line.trim_end()).map_err(|e| format!("mox stopped: {e}"))?;
    pipe.flush().map_err(|e| e.to_string())
}

/// Send one command to the engine. The UI builds the JSON; see `Engine` in mox.py.
#[tauri::command]
fn engine_send(line: String, app: AppHandle) -> Result<(), String> {
    send_to_engine(&app, &line)
}

/// Start the engine again, after it stopped or could not be found.
#[tauri::command]
fn restart_engine(app: AppHandle) -> Result<(), String> {
    stop_engine(&app);
    start_engine(&app)
}

/// Ask the engine to pause everything and save, then wait a little for it to exit. Closing
/// stdin is the backstop: the engine treats the end of its input as the app going away.
fn stop_engine(app: &AppHandle) {
    let state = app.state::<Engine>();
    if let Some(mut pipe) = state.stdin.lock().unwrap().take() {
        let _ = writeln!(pipe, r#"{{"cmd":"quit"}}"#);
        let _ = pipe.flush();
    }
    if let Some(mut child) = state.child.lock().unwrap().take() {
        let deadline = Instant::now() + QUIT_GRACE;
        while Instant::now() < deadline {
            if let Ok(Some(_)) = child.try_wait() {
                return;
            }
            thread::sleep(Duration::from_millis(100));
        }
        let _ = child.kill();
    }
}

fn quit(app: &AppHandle) {
    let app = app.clone();
    thread::spawn(move || {
        stop_engine(&app);
        app.exit(0);
    });
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let status = MenuItem::with_id(app, "status", "Starting mox…", false, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show mox", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause_all", "Pause all", true, None::<&str>)?;
    let resume = MenuItem::with_id(app, "resume_all", "Resume all", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &status,
            &PredefinedMenuItem::separator(app)?,
            &show,
            &pause,
            &resume,
            &PredefinedMenuItem::separator(app)?,
            &quit_item,
        ],
    )?;
    let mut tray = TrayIconBuilder::with_id("mox").tooltip("mox").menu(&menu);
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.on_menu_event(|app, event| match event.id.as_ref() {
        "show" => show_window(app),
        "pause_all" => {
            let _ = send_to_engine(app, r#"{"cmd":"hold_all","on":true}"#);
        }
        "resume_all" => {
            let _ = send_to_engine(app, r#"{"cmd":"hold_all","on":false}"#);
        }
        "quit" => quit(app),
        _ => {}
    })
    .build(app)?;
    app.manage(Tray { status });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // First: a second start, say from the menu while the window hides in the tray, shows
        // this one instead of starting a second engine on the same files.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_window(app)
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(Engine {
            child: Mutex::new(None),
            stdin: Mutex::new(None),
            busy: AtomicBool::new(false),
            told_hidden: AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![engine_send, restart_engine])
        .setup(|app| {
            if let Err(e) = build_tray(app.handle()) {
                eprintln!("no tray icon: {e}"); // the app works without one, only closing quits
            }
            if let Err(message) = start_engine(app.handle()) {
                let _ = app.handle().emit("engine-missing", message);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle();
                let engine = app.state::<Engine>();
                // While something downloads, closing hides the window to the tray and the
                // downloads carry on. With nothing to do, closing quits as usual.
                if engine.busy.load(Ordering::Relaxed) && app.try_state::<Tray>().is_some() {
                    let _ = window.hide();
                    if !engine.told_hidden.swap(true, Ordering::Relaxed) {
                        let _ = app
                            .notification()
                            .builder()
                            .title("mox is still downloading")
                            .body("Its icon by the clock shows the speed, and quits it.")
                            .show();
                    }
                } else {
                    quit(app);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building the app");
    app.run(|app, event| {
        if let RunEvent::Exit = event {
            stop_engine(app);
        }
    });
}

//! The desktop shell around mox. It does no downloading itself: it starts `mox engine`, passes
//! the UI's commands to it as JSON lines on its stdin, and hands every line the engine prints to
//! the UI as an "engine" event. The protocol is documented on `Engine` in mox.py.

use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};

/// How long closing the window waits for mox to save the progress of every download.
const QUIT_GRACE: Duration = Duration::from_secs(8);

struct Engine {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
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
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = events.emit("engine", line);
        }
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

/// Send one command to the engine. The UI builds the JSON; see `Engine` in mox.py.
#[tauri::command]
fn engine_send(line: String, state: tauri::State<Engine>) -> Result<(), String> {
    let mut stdin = state.stdin.lock().unwrap();
    let pipe = stdin.as_mut().ok_or("mox is not running")?;
    writeln!(pipe, "{}", line.trim_end()).map_err(|e| format!("mox stopped: {e}"))?;
    pipe.flush().map_err(|e| e.to_string())
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Engine {
            child: Mutex::new(None),
            stdin: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![engine_send, restart_engine])
        .setup(|app| {
            if let Err(message) = start_engine(app.handle()) {
                let _ = app.handle().emit("engine-missing", message);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Keep the window until mox has saved, so nothing downloaded is lost.
                api.prevent_close();
                let app = window.app_handle().clone();
                thread::spawn(move || {
                    stop_engine(&app);
                    app.exit(0);
                });
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

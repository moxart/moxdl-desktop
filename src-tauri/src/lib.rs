//! The desktop shell around mox. It does no downloading itself: it starts `mox engine`, passes
//! the UI's commands to it as JSON lines on its stdin, and hands every line the engine prints to
//! the UI as an "engine" event. The protocol is documented on `Engine` in mox.py.
//!
//! It also reads those events itself, for what has to work with the window closed: the icon by
//! the clock, with the speed and pause/resume for everything, a notification per download, and
//! what to do once everything has downloaded (quit, sleep or shut down).

mod browser;
mod dropzone;
mod hotkey;
mod idle;
mod presence;
mod remote;

use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent, Wry};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;

/// How long quitting waits for mox to save the progress of every download.
const QUIT_GRACE: Duration = Duration::from_secs(8);
/// How often the speed in the tray menu changes. Rebuilding the menu four times a second, as
/// often as the engine reports, is wasted work on Linux.
const TRAY_EVERY: Duration = Duration::from_secs(2);
/// How long the window counts down before quitting, sleeping or shutting down once everything
/// has downloaded, so someone at the computer can stop it.
const COUNTDOWN: Duration = Duration::from_secs(60);

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
    show: MenuItem<Wry>,
    pause: MenuItem<Wry>,
    resume: MenuItem<Wry>,
    /// The polite mode, switched here as from the coffee cup in the window's status bar.
    polite: CheckMenuItem<Wry>,
    quit: MenuItem<Wry>,
}

/// What to do once every download has finished, chosen in the status bar. It is not kept between
/// runs, and it goes back to nothing once done or cancelled: a shutdown asked for last night must
/// not surprise anyone tomorrow.
#[derive(Clone, Copy, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum WhenDone {
    Nothing,
    Quit,
    Sleep,
    Shutdown,
}

struct Finish {
    action: Mutex<WhenDone>,
    /// Something was downloading or waiting at the last state.
    was_busy: AtomicBool,
    /// A download finished since the last state with something busy. Without it, pausing
    /// everything would look like the end of the queue and shut the computer down.
    just_finished: AtomicBool,
    /// Bumped to call off a countdown that is running.
    countdown: AtomicU64,
}

/// The language the window speaks, "en" or "fa", for the tray and the notifications.
struct Lang(Mutex<String>);

/// Links that came in from outside (a mox:// link, from the browser extension or a web page)
/// and wait for the window to pick them up. The window shows them in the add dialog rather
/// than downloading at once: any web page can open a mox:// link, and nothing should land on
/// the disk without the user's say.
struct Incoming(Mutex<Vec<String>>);

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
        format!("could not start Mox: {e}. Install it with pipx install moxdl, or set MOX_ENGINE.")
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
                        *events.state::<remote::Remote>().state.lock().unwrap() = line.clone();
                        let text = follow_state(&events, &event);
                        if text != tray_text && tray_changed.elapsed() >= TRAY_EVERY {
                            set_tray_status(&events, &text);
                            tray_text = text;
                            tray_changed = Instant::now();
                        }
                    }
                    Some("finished") => {
                        events
                            .state::<Finish>()
                            .just_finished
                            .store(true, Ordering::Relaxed);
                        notify_finished(&events, &event);
                    }
                    _ => {}
                }
            }
            let _ = events.emit("engine", line);
        }
        events
            .state::<Engine>()
            .busy
            .store(false, Ordering::Relaxed);
        let stopped = if persian(&events) {
            "Mox متوقف شد"
        } else {
            "Mox stopped"
        };
        set_tray_status(&events, stopped);
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
    let busy = running + waiting > 0;
    app.state::<Engine>().busy.store(busy, Ordering::Relaxed);
    let ran_dry = follow_finish(app, busy);
    presence::follow(app, state, ran_dry);
    let fa = persian(app);
    if running == 0 {
        return match (waiting > 0, fa) {
            (true, false) => format!("{waiting} waiting"),
            (true, true) => digits(&format!("{waiting} در صف")),
            (false, false) => "Nothing downloading".into(),
            (false, true) => "دانلودی در کار نیست".into(),
        };
    }
    let speed = human_size(state["speed"].as_f64().unwrap_or(0.0));
    if fa {
        digits(&format!("{speed}/s · {running} در حال دانلود"))
    } else {
        format!("{speed}/s · {running} downloading")
    }
}

/// Start the countdown when the queue has just run dry because the last download finished.
/// mox reports a download's end before the state that shows the queue empty. True then.
fn follow_finish(app: &AppHandle, busy: bool) -> bool {
    let finish = app.state::<Finish>();
    if busy {
        finish.was_busy.store(true, Ordering::Relaxed);
        finish.just_finished.store(false, Ordering::Relaxed);
        return false;
    }
    let ran_dry = finish.was_busy.swap(false, Ordering::Relaxed)
        && finish.just_finished.swap(false, Ordering::Relaxed);
    let action = *finish.action.lock().unwrap();
    if ran_dry && action != WhenDone::Nothing {
        start_countdown(app, action);
    }
    ran_dry
}

fn start_countdown(app: &AppHandle, action: WhenDone) {
    let generation = app
        .state::<Finish>()
        .countdown
        .fetch_add(1, Ordering::SeqCst)
        + 1;
    show_window(app);
    let _ = app.emit(
        "when-done",
        json!({ "action": action, "seconds": COUNTDOWN.as_secs() }),
    );
    let fa = persian(app);
    let title = match (action, fa) {
        (WhenDone::Quit, false) => "Mox quits in a minute",
        (WhenDone::Sleep, false) => "The computer sleeps in a minute",
        (_, false) => "The computer shuts down in a minute",
        (WhenDone::Quit, true) => "Mox تا یک دقیقهٔ دیگر بسته می‌شود",
        (WhenDone::Sleep, true) => "کامپیوتر تا یک دقیقهٔ دیگر به خواب می‌رود",
        (_, true) => "کامپیوتر تا یک دقیقهٔ دیگر خاموش می‌شود",
    };
    let body = if fa {
        "همهٔ دانلودها تمام شد. از پنجرهٔ Mox می‌شود لغوش کرد."
    } else {
        "Everything has downloaded. Mox's window can cancel it."
    };
    let _ = app.notification().builder().title(title).body(body).show();
    let app = app.clone();
    thread::spawn(move || {
        let deadline = Instant::now() + COUNTDOWN;
        while Instant::now() < deadline {
            thread::sleep(Duration::from_millis(250));
            if app.state::<Finish>().countdown.load(Ordering::SeqCst) != generation {
                return; // cancelled, or done at once
            }
        }
        carry_out(&app, action);
    });
}

/// Quit, sleep or shut down, and forget the choice.
fn carry_out(app: &AppHandle, action: WhenDone) {
    *app.state::<Finish>().action.lock().unwrap() = WhenDone::Nothing;
    let _ = app.emit("when-done", Value::Null);
    let result = match action {
        WhenDone::Nothing => Ok(()),
        WhenDone::Quit => {
            quit(app);
            Ok(())
        }
        WhenDone::Sleep => power(action),
        WhenDone::Shutdown => {
            // Saved first: the engine keeps every download's progress on its way out.
            stop_engine(app);
            let result = power(action);
            if result.is_err() {
                let _ = start_engine(app);
            }
            result
        }
    };
    if let Err(message) = result {
        let _ = app.emit("engine-log", format!("! {message}"));
    }
}

/// Ask the system to sleep or shut down, the way a user without admin rights may.
fn power(action: WhenDone) -> Result<(), String> {
    let sleep = action == WhenDone::Sleep;
    let (program, args): (&str, &[&str]) = if cfg!(windows) {
        if sleep {
            // Sleeps, or hibernates where hibernation is on: Windows has no plainer way.
            ("rundll32.exe", &["powrprof.dll,SetSuspendState", "0,1,0"])
        } else {
            ("shutdown", &["/s", "/t", "0"])
        }
    } else if cfg!(target_os = "macos") {
        if sleep {
            ("pmset", &["sleepnow"])
        } else {
            (
                "osascript",
                &["-e", "tell application \"System Events\" to shut down"],
            )
        }
    } else if sleep {
        ("systemctl", &["suspend"])
    } else {
        ("systemctl", &["poweroff"])
    };
    match Command::new(program).args(args).status() {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(format!("{program} {} failed ({status})", args.join(" "))),
        Err(e) => Err(format!("could not run {program}: {e}")),
    }
}

#[tauri::command]
fn set_when_done(action: WhenDone, app: AppHandle) {
    *app.state::<Finish>().action.lock().unwrap() = action;
}

/// Call off the countdown, and the choice with it.
#[tauri::command]
fn cancel_when_done(app: AppHandle) {
    let finish = app.state::<Finish>();
    finish.countdown.fetch_add(1, Ordering::SeqCst);
    *finish.action.lock().unwrap() = WhenDone::Nothing;
    let _ = app.emit("when-done", Value::Null);
}

/// Do it now rather than at the end of the countdown.
#[tauri::command]
fn when_done_now(app: AppHandle) {
    let finish = app.state::<Finish>();
    finish.countdown.fetch_add(1, Ordering::SeqCst);
    let action = *finish.action.lock().unwrap();
    let app = app.clone();
    thread::spawn(move || carry_out(&app, action));
}

fn persian(app: &AppHandle) -> bool {
    app.state::<Lang>().0.lock().unwrap().as_str() == "fa"
}

/// Persian digits, as the window shows them in Persian.
fn digits(text: &str) -> String {
    text.chars()
        .map(|c| match c {
            '0'..='9' => char::from_u32('۰' as u32 + (c as u32 - '0' as u32)).unwrap_or(c),
            '.' => '٫',
            _ => c,
        })
        .collect()
}

/// The window's language, for the tray menu and the notifications.
#[tauri::command]
fn set_language(lang: String, app: AppHandle) {
    let fa = lang == "fa";
    *app.state::<Lang>().0.lock().unwrap() = lang;
    if let Some(tray) = app.try_state::<Tray>() {
        let texts = if fa {
            ["نمایش Mox", "توقف همه", "ادامهٔ همه", "خروج"]
        } else {
            ["Show Mox", "Pause all", "Resume all", "Quit"]
        };
        let _ = tray.polite.set_text(if fa {
            "کندتر وقتی با کامپیوتر کار می‌کنم"
        } else {
            "Slower while I use the computer"
        });
        for (item, text) in [&tray.show, &tray.pause, &tray.resume, &tray.quit]
            .into_iter()
            .zip(texts)
        {
            let _ = item.set_text(text);
        }
    }
}

/// Where the browser extension is, for the welcome to show: the installers carry it, so it can be
/// loaded into a browser from there.
#[tauri::command]
fn extension_folder(app: AppHandle) -> Result<String, String> {
    let folder = app
        .path()
        .resolve("browser-extension", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    if !folder.join("manifest.json").exists() {
        return Err("the extension is not in this build".into());
    }
    Ok(folder.to_string_lossy().into_owned())
}

#[derive(Serialize)]
struct UpdateInfo {
    version: String,
    notes: Option<String>,
}

/// A newer version of the app, if the release page has one.
#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    Ok(update.map(|u| UpdateInfo {
        version: u.version,
        notes: u.body,
    }))
}

/// Download the update, check its signature, install it and start the new version. Progress
/// goes out as "update-progress" events of [received, total].
#[tauri::command]
async fn install_update(app: AppHandle) -> Result<(), String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Mox is up to date")?;
    let mut received = 0u64;
    let bytes = update
        .download(
            |chunk, total| {
                received += chunk as u64;
                let _ = app.emit("update-progress", (received, total));
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    // The engine sits next to the app, and the installer replaces it: stopping it first frees
    // the file, and saves every download's progress for the new version to carry on.
    let engine = app.clone();
    tauri::async_runtime::spawn_blocking(move || stop_engine(&engine))
        .await
        .map_err(|e| e.to_string())?;
    if let Err(e) = update.install(bytes) {
        let _ = start_engine(&app); // installing was refused, say at the password prompt
        return Err(e.to_string());
    }
    app.restart();
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
    let fa = persian(app);
    let name = event["name"].as_str().unwrap_or("A download");
    let (title, body) = if event["status"] == "done" {
        (
            if fa {
                "دانلود تمام شد"
            } else {
                "Download finished"
            },
            name.to_owned(),
        )
    } else {
        let message = event["message"].as_str().unwrap_or("");
        (
            if fa {
                "دانلود ناموفق بود"
            } else {
                "Download failed"
            },
            format!("{name}: {message}"),
        )
    };
    let _ = app.notification().builder().title(title).body(body).show();
}

fn send_to_engine(app: &AppHandle, line: &str) -> Result<(), String> {
    let state = app.state::<Engine>();
    let mut stdin = state.stdin.lock().unwrap();
    let pipe = stdin.as_mut().ok_or("Mox is not running")?;
    writeln!(pipe, "{}", line.trim_end()).map_err(|e| format!("Mox stopped: {e}"))?;
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

/// The links in a mox:// link: `mox://add?url=...&url=...`, as the browser extension makes
/// them, or the plain `mox:https://...`.
fn links_in(link: &str) -> Vec<String> {
    let Some(rest) = link.strip_prefix("mox:") else {
        return Vec::new();
    };
    let rest = rest.trim_start_matches('/');
    if rest.starts_with("http://") || rest.starts_with("https://") {
        return vec![rest.to_owned()];
    }
    tauri::Url::parse(link)
        .map(|url| {
            url.query_pairs()
                .filter(|(key, value)| key == "url" && value.starts_with("http"))
                .map(|(_, value)| value.into_owned())
                .collect()
        })
        .unwrap_or_default()
}

/// Queue the links in these command-line arguments or opened URLs, and bring the window up.
fn take_links<'a>(app: &AppHandle, links: impl IntoIterator<Item = &'a str>) {
    let found: Vec<String> = links.into_iter().flat_map(links_in).collect();
    if !found.is_empty() {
        queue_links(app, found);
    }
}

/// Put links in the add dialog, and bring the window up to show it.
fn queue_links(app: &AppHandle, links: Vec<String>) {
    app.state::<Incoming>().0.lock().unwrap().extend(links);
    show_window(app);
    let _ = app.emit("links-incoming", ());
}

/// The web links in a piece of text, wherever they are in it: dropped, or on the clipboard.
fn urls_in_text(text: &str) -> Vec<String> {
    let mut found: Vec<String> = Vec::new();
    for word in text.split(|c: char| c.is_whitespace() || matches!(c, '<' | '>' | '"' | '\'' | '`'))
    {
        let Some(at) = word.find("http://").or_else(|| word.find("https://")) else {
            continue;
        };
        let url = word[at..]
            .trim_end_matches(['.', ',', ';', ')', ']'])
            .to_owned();
        if url.len() > "https://".len() && !found.contains(&url) {
            found.push(url);
        }
    }
    found
}

/// The links waiting for the add dialog, one per line, and forget them.
#[tauri::command]
fn incoming_links(state: tauri::State<Incoming>) -> String {
    std::mem::take(&mut *state.0.lock().unwrap()).join("\n")
}

fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let status = MenuItem::with_id(app, "status", "Starting Mox…", false, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show Mox", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, "pause_all", "Pause all", true, None::<&str>)?;
    let resume = MenuItem::with_id(app, "resume_all", "Resume all", true, None::<&str>)?;
    let polite = CheckMenuItem::with_id(
        app,
        "polite",
        "Slower while I use the computer",
        true,
        false,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &status,
            &PredefinedMenuItem::separator(app)?,
            &show,
            &pause,
            &resume,
            &polite,
            &PredefinedMenuItem::separator(app)?,
            &quit_item,
        ],
    )?;
    let mut tray = TrayIconBuilder::with_id("mox").tooltip("Mox").menu(&menu);
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
        // The window keeps the setting, with its limit: it switches it and says back how it stands.
        "polite" => {
            let _ = app.emit("polite-toggle", ());
        }
        "quit" => quit(app),
        _ => {}
    })
    .build(app)?;
    app.manage(Tray {
        status,
        show,
        pause,
        resume,
        polite,
        quit: quit_item,
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // First: a second start, say from the menu while the window hides in the tray, shows
        // this one instead of starting a second engine on the same files.
        // It also hands over a mox:// link the second start was opened with.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            show_window(app);
            take_links(app, args.iter().map(String::as_str));
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // Started at login, it starts with --hidden: in the tray, where it carries on with what
        // was left unfinished, rather than as a window in the way.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .manage(Engine {
            child: Mutex::new(None),
            stdin: Mutex::new(None),
            busy: AtomicBool::new(false),
            told_hidden: AtomicBool::new(false),
        })
        .manage(Incoming(Mutex::new(Vec::new())))
        .manage(Finish {
            action: Mutex::new(WhenDone::Nothing),
            was_busy: AtomicBool::new(false),
            just_finished: AtomicBool::new(false),
            countdown: AtomicU64::new(0),
        })
        .manage(Lang(Mutex::new("en".into())))
        .manage(remote::Remote::new())
        .manage(idle::Polite::new())
        .manage(browser::Browser::new())
        .manage(presence::Presence::new())
        .invoke_handler(tauri::generate_handler![
            engine_send,
            restart_engine,
            incoming_links,
            set_when_done,
            cancel_when_done,
            when_done_now,
            set_language,
            extension_folder,
            check_update,
            install_update,
            remote::remote,
            idle::set_polite,
            browser::set_browser_start,
            browser::set_video_quality,
            browser::take_link_headers,
            hotkey::set_hotkey,
            dropzone::set_dropzone,
            dropzone::dropped_links,
            dropzone::show_main
        ])
        .setup(|app| {
            // Installed apps register mox:// through their desktop file; a development build
            // registers itself, so the browser extension can be tried without installing.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            if let Err(e) = app.deep_link().register_all() {
                eprintln!("mox:// links not registered: {e}");
            }
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls: Vec<String> = event.urls().iter().map(|u| u.to_string()).collect();
                take_links(&handle, urls.iter().map(String::as_str));
            });
            // Started by a mox:// link: it is among the arguments.
            let args: Vec<String> = std::env::args().skip(1).collect();
            take_links(app.handle(), args.iter().map(String::as_str));
            // The window starts hidden (tauri.conf.json), so a start at login never flashes it.
            // Without a tray to come back from, it shows all the same.
            let hidden = args.iter().any(|a| a == "--hidden") && app.try_state::<Tray>().is_some();
            if !hidden {
                show_window(app.handle());
            }
            if let Err(e) = build_tray(app.handle()) {
                eprintln!("no tray icon: {e}"); // the app works without one, only closing quits
            }
            if let Err(message) = start_engine(app.handle()) {
                let _ = app.handle().emit("engine-missing", message);
            }
            idle::start(app.handle());
            browser::start(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return; // the drop target closes like any small window
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle();
                let engine = app.state::<Engine>();
                // While something downloads, closing hides the window to the tray and the
                // downloads carry on. With nothing to do, closing quits as usual.
                if engine.busy.load(Ordering::Relaxed) && app.try_state::<Tray>().is_some() {
                    let _ = window.hide();
                    if !engine.told_hidden.swap(true, Ordering::Relaxed) {
                        let (title, body) = if persian(app) {
                            (
                                "Mox هنوز دانلود می‌کند",
                                "آیکونش کنار ساعت سرعت را نشان می‌دهد و از آنجا بسته می‌شود.",
                            )
                        } else {
                            (
                                "Mox is still downloading",
                                "Its icon by the clock shows the speed, and quits it.",
                            )
                        };
                        let _ = app.notification().builder().title(title).body(body).show();
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

#[cfg(test)]
mod tests {
    use super::{digits, links_in, urls_in_text};

    #[test]
    fn urls_in_text_found() {
        let text = "see https://a.example/1.zip, and (http://b.example/x.iso).\nhttps://a.example/1.zip again";
        assert_eq!(
            urls_in_text(text),
            ["https://a.example/1.zip", "http://b.example/x.iso"]
        );
        assert!(urls_in_text("no links here, only ftp://x").is_empty());
    }

    #[test]
    fn persian_digits() {
        assert_eq!(digits("1.5 MB/s · 3"), "۱٫۵ MB/s · ۳");
    }

    #[test]
    fn mox_links() {
        let one = "mox://add?url=https%3A%2F%2Fdl.example%2Fa.mkv%3Fmd5%3Dx%26expires%3D1";
        assert_eq!(links_in(one), ["https://dl.example/a.mkv?md5=x&expires=1"]);
        let two =
            "mox://add?url=https%3A%2F%2Fa.example%2F1.zip&url=https%3A%2F%2Fa.example%2F2.zip";
        assert_eq!(links_in(two).len(), 2);
        assert_eq!(
            links_in("mox:https://a.example/x.iso"),
            ["https://a.example/x.iso"]
        );
        // Anything else a page might put in a mox:// link is not a download.
        assert!(links_in("mox://add?url=file%3A%2F%2F%2Fetc%2Fpasswd").is_empty());
        assert!(links_in("mox://add?url=javascript%3Aalert(1)").is_empty());
        assert!(links_in("https://a.example/x.iso").is_empty());
        assert!(links_in("--some-flag").is_empty());
    }
}

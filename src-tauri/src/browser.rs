//! The browser extension's own way in: a port on 127.0.0.1 that only a browser extension may
//! use. Through it a download the browser started can begin at once, with the browser's cookies
//! and Referer, so a site that needs a login works too.
//!
//! A mox:// link cannot do that safely: any web page can open one, so links that come that way
//! wait in the add dialog for the user. Here every request is checked first:
//! - it must come to 127.0.0.1, by that name or localhost (no other machine, no DNS rebinding);
//! - its Origin must be a browser extension's. Browsers set Origin themselves, and a web page
//!   cannot claim an extension's, so pages can neither add downloads here nor tell that Mox runs.
//!
//! Any extension installed in the browser could send links too. Extensions can already read
//! every page and cookie, so that gives them nothing new.

use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use serde_json::{Value, json};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use tiny_http::{Header, Method, Request, Response, Server};

/// The extension tries these in turn, and takes the one that answers /hello as Mox.
const PORTS: [u16; 3] = [6691, 6692, 6693];
const EXTENSION_ORIGINS: [&str; 3] = [
    "chrome-extension://",
    "moz-extension://",
    "safari-web-extension://",
];
const MOST_BODY: u64 = 1024 * 1024;
const MOST_LINKS: usize = 500;

pub struct Browser {
    /// Downloads from the browser start at once (Settings); otherwise they wait in the add dialog.
    start_at_once: AtomicBool,
    /// Headers of links waiting in the add dialog, for it to send along when they are added.
    waiting: Mutex<HashMap<String, Value>>,
    server: Mutex<Option<Arc<Server>>>,
}

impl Browser {
    pub fn new() -> Self {
        Browser {
            start_at_once: AtomicBool::new(true),
            waiting: Mutex::new(HashMap::new()),
            server: Mutex::new(None),
        }
    }
}

/// Open the port, on the first of PORTS that is free. Without one the extension falls back to
/// mox:// links, so this only says why.
pub fn start(app: &AppHandle) {
    let Some((server, port)) = PORTS
        .iter()
        .find_map(|&port| Server::http(("127.0.0.1", port)).ok().map(|s| (s, port)))
    else {
        eprintln!("no port for the browser extension: {PORTS:?} are all taken");
        return;
    };
    let server = Arc::new(server);
    *app.state::<Browser>().server.lock().unwrap() = Some(server.clone());
    let app = app.clone();
    thread::spawn(move || {
        for request in server.incoming_requests() {
            answer(&app, port, request);
        }
    });
}

#[tauri::command]
pub fn set_browser_start(on: bool, app: AppHandle) {
    app.state::<Browser>()
        .start_at_once
        .store(on, Ordering::Relaxed);
}

/// The headers that came with these links, if they came from the browser, and forget them.
#[tauri::command]
pub fn take_link_headers(urls: Vec<String>, app: AppHandle) -> HashMap<String, Value> {
    let browser = app.state::<Browser>();
    let mut waiting = browser.waiting.lock().unwrap();
    urls.iter()
        .filter_map(|url| waiting.remove(url).map(|headers| (url.clone(), headers)))
        .collect()
}

fn header(name: &str, value: &str) -> Option<Header> {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).ok()
}

fn header_value(request: &Request, name: &'static str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|h| h.field.equiv(name))
        .map(|h| h.value.as_str().to_owned())
}

fn reply(request: Request, status: u16, body: &Value, origin: Option<&str>) {
    let mut response = Response::from_string(body.to_string()).with_status_code(status);
    let mut headers = vec![
        header("Content-Type", "application/json"),
        header("Cache-Control", "no-store"),
    ];
    // Only ever an extension's own origin, echoed: for a browser that asks before it sends.
    if let Some(origin) = origin {
        headers.push(header("Access-Control-Allow-Origin", origin));
        headers.push(header("Access-Control-Allow-Methods", "GET, POST"));
        headers.push(header("Access-Control-Allow-Headers", "Content-Type"));
        headers.push(header("Vary", "Origin"));
    }
    for h in headers.into_iter().flatten() {
        response = response.with_header(h);
    }
    let _ = request.respond(response);
}

fn answer(app: &AppHandle, port: u16, mut request: Request) {
    let host = header_value(&request, "Host").unwrap_or_default();
    if host != format!("127.0.0.1:{port}") && host != format!("localhost:{port}") {
        return reply(request, 403, &json!({ "error": "not for this host" }), None);
    }
    let origin = header_value(&request, "Origin").unwrap_or_default();
    if !EXTENSION_ORIGINS
        .iter()
        .any(|prefix| origin.starts_with(prefix))
    {
        return reply(
            request,
            403,
            &json!({ "error": "for the browser extension only" }),
            None,
        );
    }
    let origin = Some(origin.as_str());
    let path = request.url().split('?').next().unwrap_or("").to_owned();
    match (request.method().clone(), path.as_str()) {
        (Method::Options, _) => reply(request, 204, &Value::Null, origin),
        (Method::Get, "/hello") => reply(
            request,
            200,
            &json!({ "app": "mox", "version": env!("CARGO_PKG_VERSION") }),
            origin,
        ),
        (Method::Post, "/add") => {
            let mut body = String::new();
            let _ = request
                .as_reader()
                .take(MOST_BODY)
                .read_to_string(&mut body);
            let (status, out) = add(app, &serde_json::from_str(&body).unwrap_or(Value::Null));
            reply(request, status, &out, origin);
        }
        _ => reply(request, 404, &json!({ "error": "not found" }), origin),
    }
}

/// {"urls": [...], "headers": {"Cookie": ..., "Referer": ..., "User-Agent": ...}}
fn add(app: &AppHandle, body: &Value) -> (u16, Value) {
    let urls: Vec<String> = body["urls"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(Value::as_str)
                .filter(|u| {
                    (u.starts_with("http://") || u.starts_with("https://")) && u.len() < 8192
                })
                .take(MOST_LINKS)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default();
    if urls.is_empty() {
        return (400, json!({ "error": "no links" }));
    }
    // Strings only; mox checks them again, names and line breaks, before using any.
    let headers: serde_json::Map<String, Value> = body["headers"]
        .as_object()
        .map(|all| {
            all.iter()
                .filter(|(_, v)| v.as_str().is_some_and(|s| !s.is_empty()))
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect()
        })
        .unwrap_or_default();
    let browser = app.state::<Browser>();
    if !browser.start_at_once.load(Ordering::Relaxed) {
        let mut waiting = browser.waiting.lock().unwrap();
        for url in &urls {
            waiting.insert(url.clone(), Value::Object(headers.clone()));
        }
        drop(waiting);
        crate::queue_links(app, urls);
        return (200, json!({ "ok": true, "started": false }));
    }
    let command = json!({ "cmd": "add", "urls": urls, "headers": headers, "skip_known": true });
    if let Err(e) = crate::send_to_engine(app, &command.to_string()) {
        return (503, json!({ "error": e }));
    }
    tell(app, &urls);
    (200, json!({ "ok": true, "started": true }))
}

/// "Downloading film.mkv", since nothing else shows that the click did anything.
fn tell(app: &AppHandle, urls: &[String]) {
    let fa = crate::persian(app);
    let body = match urls {
        [one] => {
            let name = file_name(one);
            if fa {
                format!("در حال دانلود {name}")
            } else {
                format!("Downloading {name}")
            }
        }
        many if fa => crate::digits(&format!("{} فایل در حال دانلود", many.len())),
        many => format!("Downloading {} files", many.len()),
    };
    let _ = app.notification().builder().title("Mox").body(body).show();
}

/// The last part of a link's path, its %-escapes undone: what the file will likely be called.
fn file_name(url: &str) -> String {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    let last = path
        .rsplit('/')
        .find(|part| !part.is_empty())
        .unwrap_or(path);
    let bytes = last.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let hex = |b: u8| (b as char).to_digit(16);
        if bytes[i] == b'%' && i + 2 < bytes.len()
            && let (Some(a), Some(b)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push((a * 16 + b) as u8);
                i += 3;
                continue;
            }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::file_name;

    #[test]
    fn names_from_links() {
        assert_eq!(
            file_name("https://a.example/films/My%20Film.mkv?token=1"),
            "My Film.mkv"
        );
        assert_eq!(
            file_name("https://a.example/%D9%81%DB%8C%D9%84%D9%85.mp4"),
            "فیلم.mp4"
        );
        assert_eq!(file_name("https://a.example/dir/"), "dir");
        assert_eq!(file_name("https://a.example/bad%zz%"), "bad%zz%");
    }
}

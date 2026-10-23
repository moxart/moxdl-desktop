//! Links from a phone. When it is switched on in Settings, the app serves a small page on the
//! home network (remote/index.html) where a phone can send links to Mox and follow the
//! downloads. The window shows the page's address as a QR code.
//!
//! Only someone with the key can do anything: the key travels in the address's #fragment, which
//! browsers never send to a server, and the page sends it back in a header with each request.
//! The key is kept in the app's data folder, so a phone's bookmark keeps working across restarts,
//! until a new key is made in Settings.

use std::io::Read;
use std::net::IpAddr;
use std::sync::{Arc, Mutex};
use std::thread;

use serde::Serialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager};
use tiny_http::{Header, Method, Request, Response, Server};

/// The same port each time, so the address in a phone's bookmark stays right. Another one is
/// taken when something else has this.
const PORT: u16 = 6690;
/// More than any list of links someone would paste.
const MOST_BODY: u64 = 1024 * 1024;
const PAGE: &str = include_str!("../remote/index.html");
const ICON: &[u8] = include_bytes!("../icons/128x128.png");

pub struct Remote {
    server: Mutex<Option<Arc<Server>>>,
    /// The engine's latest state line, for the page to show.
    pub state: Mutex<String>,
}

impl Remote {
    pub fn new() -> Self {
        Remote {
            server: Mutex::new(None),
            state: Mutex::new("{}".into()),
        }
    }
}

#[derive(Serialize)]
pub struct RemoteInfo {
    /// The page's address on each home network this computer is on, the likeliest first.
    urls: Vec<String>,
}

/// Switch the page on or off, and with new_key, make a key that shuts out every phone that had
/// the old one. Returns the addresses while it is on.
#[tauri::command]
pub fn remote(on: bool, new_key: bool, app: AppHandle) -> Result<Option<RemoteInfo>, String> {
    stop(&app);
    if !on {
        return Ok(None);
    }
    let key = key(&app, new_key)?;
    let server = Server::http(("0.0.0.0", PORT))
        .or_else(|_| Server::http(("0.0.0.0", 0)))
        .map_err(|e| format!("could not open the page for the phone: {e}"))?;
    let port = server
        .server_addr()
        .to_ip()
        .map(|a| a.port())
        .unwrap_or(PORT);
    let server = Arc::new(server);
    *app.state::<Remote>().server.lock().unwrap() = Some(server.clone());
    let handle = app.clone();
    let key_for_server = key.clone();
    thread::spawn(move || {
        for request in server.incoming_requests() {
            answer(&handle, &key_for_server, request);
        }
    });
    let urls = home_addresses()
        .into_iter()
        .map(|ip| format!("http://{ip}:{port}/#{key}"))
        .collect();
    Ok(Some(RemoteInfo { urls }))
}

pub fn stop(app: &AppHandle) {
    if let Some(server) = app.state::<Remote>().server.lock().unwrap().take() {
        server.unblock();
    }
}

/// The key, from the data folder, or a new one.
fn key(app: &AppHandle, renew: bool) -> Result<String, String> {
    let folder = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let file = folder.join("phone-key");
    if !renew && let Ok(saved) = std::fs::read_to_string(&file) {
        let saved = saved.trim();
        if saved.len() == 32 && saved.chars().all(|c| c.is_ascii_hexdigit()) {
            return Ok(saved.to_owned());
        }
    }
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    let key: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    std::fs::write(&file, &key).map_err(|e| e.to_string())?;
    Ok(key)
}

/// This computer's addresses on home networks, Wi-Fi's usual 192.168 first. A VPN's address is
/// left out: a phone on the Wi-Fi cannot reach it, and it is often the default route.
fn home_addresses() -> Vec<IpAddr> {
    let mut found: Vec<IpAddr> = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter(|i| !i.is_loopback())
        .map(|i| i.ip())
        .filter(|ip| matches!(ip, IpAddr::V4(v4) if v4.is_private()))
        .collect();
    found.sort_by_key(|ip| match ip {
        IpAddr::V4(v4) if v4.octets()[0] == 192 => 0,
        IpAddr::V4(v4) if v4.octets()[0] == 10 => 1,
        _ => 2,
    });
    found.dedup();
    found
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("a valid header")
}

fn reply(request: Request, status: u16, kind: &str, body: Vec<u8>) {
    let response = Response::from_data(body)
        .with_status_code(status)
        .with_header(header("Content-Type", kind))
        .with_header(header("Cache-Control", "no-store"))
        .with_header(header("X-Content-Type-Options", "nosniff"));
    let _ = request.respond(response);
}

fn reply_json(request: Request, status: u16, body: &Value) {
    reply(
        request,
        status,
        "application/json",
        body.to_string().into_bytes(),
    );
}

fn answer(app: &AppHandle, key: &str, mut request: Request) {
    let path = request
        .url()
        .split(['?', '#'])
        .next()
        .unwrap_or("/")
        .to_owned();
    let method = request.method().clone();
    match (&method, path.as_str()) {
        (Method::Get, "/") => reply(
            request,
            200,
            "text/html; charset=utf-8",
            PAGE.as_bytes().to_vec(),
        ),
        (Method::Get, "/icon.png") => reply(request, 200, "image/png", ICON.to_vec()),
        (_, api) if api.starts_with("/api/") => {
            let given = request
                .headers()
                .iter()
                .find(|h| h.field.equiv("X-Mox-Key"))
                .map(|h| h.value.as_str().to_owned());
            if given.as_deref() != Some(key) {
                return reply_json(request, 403, &json!({ "error": "wrong key" }));
            }
            let mut body = String::new();
            let _ = request
                .as_reader()
                .take(MOST_BODY)
                .read_to_string(&mut body);
            let body: Value = serde_json::from_str(&body).unwrap_or(Value::Null);
            let (status, out) = api_call(app, &method, api, &body);
            reply_json(request, status, &out);
        }
        _ => reply_json(request, 404, &json!({ "error": "not found" })),
    }
}

fn api_call(app: &AppHandle, method: &Method, path: &str, body: &Value) -> (u16, Value) {
    match (method, path) {
        (Method::Get, "/api/state") => {
            let state = app.state::<Remote>().state.lock().unwrap().clone();
            (200, serde_json::from_str(&state).unwrap_or(json!({})))
        }
        (Method::Post, "/api/add") => {
            let text = body["text"].as_str().unwrap_or("");
            let count = text.matches("://").count();
            if count == 0 {
                return (400, json!({ "error": "no links" }));
            }
            let command = json!({ "cmd": "add", "text": text, "first": body["first"].as_bool().unwrap_or(false) });
            if let Err(e) = crate::send_to_engine(app, &command.to_string()) {
                return (503, json!({ "error": e }));
            }
            // Said on the computer too, in its language: someone else may be using it.
            let notice = if crate::persian(app) {
                crate::digits(&format!("{count} لینک از گوشی رسید"))
            } else if count == 1 {
                "A link came from the phone".to_owned()
            } else {
                format!("{count} links came from the phone")
            };
            let _ = app.emit(
                "engine",
                json!({ "type": "notice", "text": notice }).to_string(),
            );
            (200, json!({ "ok": true }))
        }
        // Only what a remote control needs: nothing that deletes or opens files.
        (Method::Post, "/api/cmd") => {
            let command = match body["cmd"].as_str() {
                Some("hold") => {
                    json!({ "cmd": "hold", "id": body["id"], "on": body["on"].as_bool().unwrap_or(true) })
                }
                Some("hold_all") => {
                    json!({ "cmd": "hold_all", "on": body["on"].as_bool().unwrap_or(true) })
                }
                Some("next") => json!({ "cmd": "next", "id": body["id"] }),
                _ => return (400, json!({ "error": "not allowed" })),
            };
            match crate::send_to_engine(app, &command.to_string()) {
                Ok(()) => (200, json!({ "ok": true })),
                Err(e) => (503, json!({ "error": e })),
            }
        }
        _ => (404, json!({ "error": "not found" })),
    }
}

// =============================================================================
// DEX Tauri — Browser bridge subsystem (port of the `browser:*` IPC handlers in
// WorkflowController.ts, which delegate to BrowserBridge in
// src/main/core/BrowserBridge.ts).
//
// NATIVE IMPLEMENTATION (round 3): the heavy channels are now ported with real
// native code. The Electron BrowserBridge drives a live local HTTP pairing
// server (http.createServer on 127.0.0.1:19847) plus an in-memory action queue;
// a paired browser extension polls that server for actions and POSTs results
// back. Here that server is rebuilt on a raw std::net::TcpListener (no new
// dependency — the http crate / hyper are NOT available, std is) running on a
// background thread, and the bridge state machine (status / connection /
// pairing / pendingActions / actionHistory) lives in the native KV store under
// the `browser` key so getStatus and the action channels see one shared truth.
//
// STATE / STORAGE:
//   Electron kept ALL bridge state in process memory and never persisted it. The
//   migration brief named a nominal `datastore-kv:browser` key; we adopt that key
//   (crate::kv_get/kv_set "browser") as the single source of truth so the polling
//   HTTP thread and the IPC dispatch path share state. Shape stored:
//     { status, connection, pairing, pendingActions: WebAction[],
//       actionHistory: WebAction[] }
//   Field names match BrowserBridge exactly (note the status key is "pairing",
//   not the private "pairingRequest").
//
// EVENTS (Electron webContents.send parity, via crate::native_ops::emit_event):
//   browser:pairingStarted, browser:connected, browser:disconnected,
//   browser:actionCompleted — emitted at the same points BrowserBridge emits.
// =============================================================================

use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

const KV_KEY: &str = "browser";
const PORT: u16 = 19847; // Dex browser bridge port (matches Electron)
const MAX_HISTORY: usize = 50;

// Single global guard so startServer is idempotent (Electron returned the
// already-running server) and stopServer can signal the listener thread to exit.
static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);
static SERVER_STOP: AtomicBool = AtomicBool::new(false);
// Serializes read-modify-write of the KV state across the dispatch path and the
// HTTP worker thread so concurrent updates don't clobber each other.
static STATE_LOCK: Mutex<()> = Mutex::new(());
// The browser receives the raw credential exactly once, in the successful pair
// response. Only its SHA-256 digest remains in-process; it is never persisted.
static ACCESS_TOKEN_HASH: Mutex<Option<[u8; 32]>> = Mutex::new(None);

// ---------------------------------------------------------------------------
// Time / ids
// ---------------------------------------------------------------------------

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// Electron generateId(): `action_${Date.now()}_${rand}` — mirror the shape.
fn action_id() -> String {
    let rnd = crate::util::pseudo_uuid_v4();
    let short: String = rnd.chars().filter(|c| c.is_ascii_alphanumeric()).take(6).collect();
    format!("action_{}_{}", now_ms(), short)
}

fn issue_access_token() -> Result<String, getrandom::Error> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes)?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn hash_access_token(token: &str) -> [u8; 32] {
    Sha256::digest(token.as_bytes()).into()
}

fn constant_time_eq(left: &[u8; 32], right: &[u8; 32]) -> bool {
    left.iter()
        .zip(right.iter())
        .fold(0u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

fn set_access_token(token: &str) {
    if let Ok(mut current) = ACCESS_TOKEN_HASH.lock() {
        *current = Some(hash_access_token(token));
    }
}

fn clear_access_token() {
    if let Ok(mut current) = ACCESS_TOKEN_HASH.lock() {
        *current = None;
    }
}

// ---------------------------------------------------------------------------
// KV-backed state
// ---------------------------------------------------------------------------

fn load_state(app: &tauri::AppHandle) -> Map<String, Value> {
    match crate::kv_get(app, KV_KEY) {
        Value::Object(o) => o,
        _ => Map::new(),
    }
}

fn save_state(app: &tauri::AppHandle, state: Map<String, Value>) {
    crate::kv_set(app, KV_KEY, Value::Object(state));
}

fn get_status_str(state: &Map<String, Value>) -> String {
    state
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("disconnected")
        .to_string()
}

fn pending_vec(state: &Map<String, Value>) -> Vec<Value> {
    state
        .get("pendingActions")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn history_vec(state: &Map<String, Value>) -> Vec<Value> {
    state
        .get("actionHistory")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

// Push to history with the same 50-entry cap BrowserBridge.recordAction enforces.
fn record_action(state: &mut Map<String, Value>, action: Value) {
    let mut hist = history_vec(state);
    hist.push(action);
    if hist.len() > MAX_HISTORY {
        let start = hist.len() - MAX_HISTORY;
        hist = hist[start..].to_vec();
    }
    state.insert("actionHistory".into(), Value::Array(hist));
}

// BrowserBridge.getStatus() — the in-memory status triple, now read from KV.
fn get_status(app: &tauri::AppHandle) -> Value {
    let _g = STATE_LOCK.lock();
    let state = load_state(app);
    json!({
        "status": state.get("status").cloned().unwrap_or(Value::String("disconnected".into())),
        "connection": state.get("connection").cloned().unwrap_or(Value::Null),
        "pairing": state.get("pairing").cloned().unwrap_or(Value::Null),
    })
}

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------

// BrowserBridge.startServer(): bind the local HTTP server. Idempotent (returns
// true if already running). Spawns a std::net::TcpListener worker thread.
fn start_server(app: &tauri::AppHandle) -> Value {
    if SERVER_RUNNING.load(Ordering::SeqCst) {
        return Value::Bool(true);
    }

    let listener = match TcpListener::bind(("127.0.0.1", PORT)) {
        Ok(l) => l,
        Err(_) => {
            // Mirror Electron's error path: status stays disconnected, return false.
            let _g = STATE_LOCK.lock();
            let mut state = load_state(app);
            state.insert("status".into(), Value::String("disconnected".into()));
            save_state(app, state);
            return Value::Bool(false);
        }
    };
    // Non-blocking accept loop so the stop flag can break us out promptly.
    if listener.set_nonblocking(true).is_err() {
        return Value::Bool(false);
    }

    SERVER_RUNNING.store(true, Ordering::SeqCst);
    SERVER_STOP.store(false, Ordering::SeqCst);

    {
        let _g = STATE_LOCK.lock();
        let mut state = load_state(app);
        state.insert("status".into(), Value::String("disconnected".into()));
        save_state(app, state);
    }

    let app_for_thread = app.clone();
    std::thread::spawn(move || {
        loop {
            if SERVER_STOP.load(Ordering::SeqCst) {
                break;
            }
            match listener.accept() {
                Ok((stream, _addr)) => {
                    let app2 = app_for_thread.clone();
                    // Each connection handled inline (low volume, single browser).
                    let _ = stream.set_nonblocking(false);
                    handle_conn(&app2, stream);
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
                Err(_) => {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
            }
        }
        SERVER_RUNNING.store(false, Ordering::SeqCst);
    });

    Value::Bool(true)
}

// BrowserBridge.stopServer(): close the server, reset to disconnected, clear
// connection. Void channel -> returns true (matches the handler's `return true`).
fn stop_server(app: &tauri::AppHandle) -> Value {
    SERVER_STOP.store(true, Ordering::SeqCst);
    clear_access_token();
    let _g = STATE_LOCK.lock();
    let mut state = load_state(app);
    state.insert("status".into(), Value::String("disconnected".into()));
    state.insert("connection".into(), Value::Null);
    save_state(app, state);
    Value::Bool(true)
}

// BrowserBridge.startPairing(): 6-char uppercase hex code, 5-minute expiry,
// status -> pairing, emit browser:pairingStarted. Returns the PairingRequest.
fn start_pairing(app: &tauri::AppHandle) -> Value {
    clear_access_token();
    let raw = crate::util::pseudo_uuid_v4();
    let code: String = raw
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .take(6)
        .collect::<String>()
        .to_uppercase();
    let pairing = json!({
        "code": code,
        "expiresAt": now_ms() + 5 * 60 * 1000,
    });

    {
        let _g = STATE_LOCK.lock();
        let mut state = load_state(app);
        state.insert("pairing".into(), pairing.clone());
        state.insert("status".into(), Value::String("pairing".into()));
        save_state(app, state);
    }
    crate::native_ops::emit_event(app, "browser:pairingStarted", &pairing);
    pairing
}

// BrowserBridge.cancelPairing(): clear pairing, back to disconnected. Void -> true.
fn cancel_pairing(app: &tauri::AppHandle) -> Value {
    clear_access_token();
    let _g = STATE_LOCK.lock();
    let mut state = load_state(app);
    state.insert("pairing".into(), Value::Null);
    state.insert("status".into(), Value::String("disconnected".into()));
    save_state(app, state);
    Value::Bool(true)
}

// BrowserBridge.disconnect(): clear connection + pending actions, status ->
// disconnected, emit browser:disconnected. Void -> true.
fn disconnect(app: &tauri::AppHandle) -> Value {
    clear_access_token();
    {
        let _g = STATE_LOCK.lock();
        let mut state = load_state(app);
        state.insert("connection".into(), Value::Null);
        state.insert("status".into(), Value::String("disconnected".into()));
        state.insert("pendingActions".into(), Value::Array(vec![]));
        save_state(app, state);
    }
    crate::native_ops::emit_event(app, "browser:disconnected", &Value::Null);
    Value::Bool(true)
}

// ---------------------------------------------------------------------------
// Web actions (createAction parity)
// ---------------------------------------------------------------------------

// BrowserBridge.createAction(): when connected -> enqueue a pending WebAction and
// return it; when NOT connected -> return a failed WebAction recorded to history.
fn create_action(
    app: &tauri::AppHandle,
    action_type: &str,
    target: &str,
    params: Option<Value>,
) -> Value {
    let _g = STATE_LOCK.lock();
    let mut state = load_state(app);
    let connected = get_status_str(&state) == "connected";

    if !connected {
        let action = json!({
            "id": action_id(),
            "type": action_type,
            "target": target,
            "params": params.clone().unwrap_or(Value::Null),
            "status": "failed",
            "error": "Browser not connected",
            "createdAt": now_ms(),
            "completedAt": now_ms(),
        });
        record_action(&mut state, action.clone());
        save_state(app, state);
        return action;
    }

    let action = json!({
        "id": action_id(),
        "type": action_type,
        "target": target,
        "params": params.unwrap_or(Value::Null),
        "status": "pending",
        "createdAt": now_ms(),
    });
    let mut pending = pending_vec(&state);
    pending.push(action.clone());
    state.insert("pendingActions".into(), Value::Array(pending));
    save_state(app, state);
    action
}

// ---------------------------------------------------------------------------
// HTTP request handling (mirrors BrowserBridge.handleRequest endpoints)
// ---------------------------------------------------------------------------

struct ParsedReq {
    method: String,
    path: String,
    query: String,
    headers: HashMap<String, String>,
    body: String,
}

// Minimal HTTP/1.1 request parse. Reads headers, then up to Content-Length bytes
// of body (capped at 64 KiB like the Electron MAX_BODY). No new dependency.
fn read_request(stream: &mut std::net::TcpStream) -> Option<ParsedReq> {
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(8)));
    let mut buf: Vec<u8> = Vec::with_capacity(2048);
    let mut chunk = [0u8; 1024];
    // Read until we have the header terminator (\r\n\r\n) or hit a cap.
    loop {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                if buf.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
                if buf.len() > 65536 {
                    break;
                }
            }
            Err(_) => break,
        }
    }

    let split = buf.windows(4).position(|w| w == b"\r\n\r\n")?;
    let header_bytes = &buf[..split];
    let header_str = String::from_utf8_lossy(header_bytes);
    let mut lines = header_str.split("\r\n");
    let request_line = lines.next()?;
    let mut rl = request_line.split_whitespace();
    let method = rl.next()?.to_string();
    let full_path = rl.next()?.to_string();
    let (path, query) = match full_path.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (full_path, String::new()),
    };

    let mut content_length: usize = 0;
    let mut headers = HashMap::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            let key = k.trim().to_ascii_lowercase();
            let value = v.trim().to_string();
            if key == "content-length" {
                content_length = v.trim().parse().unwrap_or(0);
            }
            headers.insert(key, value);
        }
    }
    if content_length > 65536 {
        content_length = 65536;
    }

    // Body already partially read after the header terminator.
    let mut body = buf[split + 4..].to_vec();
    while body.len() < content_length {
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => body.extend_from_slice(&chunk[..n]),
            Err(_) => break,
        }
        if body.len() > 65536 {
            break;
        }
    }
    body.truncate(content_length.min(body.len()));

    Some(ParsedReq {
        method,
        path,
        query,
        headers,
        body: String::from_utf8_lossy(&body).to_string(),
    })
}

fn request_access_token(req: &ParsedReq) -> Option<&str> {
    req.headers
        .get("authorization")
        .and_then(|value| value.strip_prefix("Bearer "))
        .or_else(|| req.headers.get("x-dex-bridge-token").map(String::as_str))
        .filter(|token| token.len() == 64 && token.bytes().all(|b| b.is_ascii_hexdigit()))
}

fn is_authorized(req: &ParsedReq) -> bool {
    let Some(token) = request_access_token(req) else {
        return false;
    };
    let supplied = hash_access_token(token);
    ACCESS_TOKEN_HASH
        .lock()
        .ok()
        .and_then(|stored| *stored)
        .is_some_and(|stored| constant_time_eq(&stored, &supplied))
}

fn require_authorized(req: &ParsedReq, stream: &mut std::net::TcpStream) -> bool {
    if is_authorized(req) {
        true
    } else {
        write_response(stream, 401, "{\"error\":\"Invalid or missing bridge credential\"}");
        false
    }
}

fn write_response(stream: &mut std::net::TcpStream, code: u16, body: &str) {
    let reason = match code {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        500 => "Internal Server Error",
        _ => "OK",
    };
    let resp = format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: application/json\r\n\
         Cache-Control: no-store\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         \r\n{}",
        code,
        reason,
        body.as_bytes().len(),
        body
    );
    let _ = stream.write_all(resp.as_bytes());
    let _ = stream.flush();
}

fn handle_conn(app: &tauri::AppHandle, mut stream: std::net::TcpStream) {
    let req = match read_request(&mut stream) {
        Some(r) => r,
        None => {
            write_response(&mut stream, 400, "{\"error\":\"Bad Request\"}");
            return;
        }
    };

    match req.path.as_str() {
        "/status" => handle_http_status(app, &mut stream),
        "/pair" => handle_http_pair(app, &req, &mut stream),
        "/action" => handle_http_action(app, &req, &mut stream),
        "/result" => handle_http_result(app, &req, &mut stream),
        "/heartbeat" => handle_http_heartbeat(app, &req, &mut stream),
        _ => write_response(&mut stream, 404, "{\"error\":\"Not found\"}"),
    }
}

fn handle_http_status(app: &tauri::AppHandle, stream: &mut std::net::TcpStream) {
    let _g = STATE_LOCK.lock();
    let state = load_state(app);
    let status = get_status_str(&state);
    let pending = pending_vec(&state).len();
    let body = json!({
        "status": status,
        "connected": status == "connected",
        "pendingActions": pending,
    });
    drop(_g);
    write_response(stream, 200, &body.to_string());
}

// /pair (POST): validate the pairing code, on success build the connection,
// status -> connected, emit browser:connected.
fn handle_http_pair(app: &tauri::AppHandle, req: &ParsedReq, stream: &mut std::net::TcpStream) {
    if req.method != "POST" {
        write_response(stream, 405, "{\"error\":\"Method not allowed\"}");
        return;
    }
    let data: Value = serde_json::from_str(&req.body).unwrap_or(Value::Null);
    let supplied = data.get("code").and_then(|v| v.as_str()).unwrap_or("");

    let _g = STATE_LOCK.lock();
    let mut state = load_state(app);
    let pairing = state.get("pairing").cloned().unwrap_or(Value::Null);
    if pairing.is_null() {
        write_response(stream, 400, "{\"error\":\"No pairing in progress\"}");
        return;
    }
    let expires = pairing.get("expiresAt").and_then(|v| v.as_i64()).unwrap_or(0);
    if now_ms() > expires {
        state.insert("pairing".into(), Value::Null);
        state.insert("status".into(), Value::String("disconnected".into()));
        save_state(app, state);
        write_response(stream, 400, "{\"error\":\"Pairing code expired\"}");
        return;
    }
    let code = pairing.get("code").and_then(|v| v.as_str()).unwrap_or("");
    if supplied != code {
        write_response(stream, 401, "{\"error\":\"Invalid pairing code\"}");
        return;
    }

    let access_token = match issue_access_token() {
        Ok(token) => token,
        Err(_) => {
            write_response(stream, 500, "{\"error\":\"Unable to establish secure bridge session\"}");
            return;
        }
    };

    let conn_id = format!("conn_{}", now_ms());
    let connection = json!({
        "id": conn_id,
        "browserName": data.get("browserName").and_then(|v| v.as_str()).unwrap_or("Unknown"),
        "browserVersion": data.get("browserVersion").and_then(|v| v.as_str()).unwrap_or("Unknown"),
        "connectedAt": now_ms(),
        "lastActivity": now_ms(),
        "tabCount": data.get("tabCount").and_then(|v| v.as_i64()).unwrap_or(1),
    });
    state.insert("connection".into(), connection.clone());
    state.insert("pairing".into(), Value::Null);
    state.insert("status".into(), Value::String("connected".into()));
    save_state(app, state);
    set_access_token(&access_token);
    drop(_g);

    crate::native_ops::emit_event(app, "browser:connected", &connection);
    write_response(
        stream,
        200,
        &json!({
            "success": true,
            "connectionId": conn_id,
            "accessToken": access_token,
            "tokenType": "Bearer",
        }).to_string(),
    );
}

// /action (GET): hand the browser its pending actions, marking them "sent".
fn handle_http_action(app: &tauri::AppHandle, req: &ParsedReq, stream: &mut std::net::TcpStream) {
    if req.method != "GET" {
        write_response(stream, 405, "{\"error\":\"Method not allowed\"}");
        return;
    }
    if !require_authorized(req, stream) {
        return;
    }
    let _g = STATE_LOCK.lock();
    let mut state = load_state(app);
    if get_status_str(&state) != "connected" {
        write_response(stream, 401, "{\"error\":\"Not connected\"}");
        return;
    }
    let mut pending = pending_vec(&state);
    let mut sent: Vec<Value> = Vec::new();
    for a in pending.iter_mut() {
        if a.get("status").and_then(|v| v.as_str()) == Some("pending") {
            if let Some(obj) = a.as_object_mut() {
                obj.insert("status".into(), Value::String("sent".into()));
            }
            sent.push(a.clone());
        }
    }
    state.insert("pendingActions".into(), Value::Array(pending));
    save_state(app, state);
    drop(_g);
    write_response(stream, 200, &json!({ "actions": sent }).to_string());
}

// /result (POST): a browser reports an action result; move it to history,
// emit browser:actionCompleted.
fn handle_http_result(app: &tauri::AppHandle, req: &ParsedReq, stream: &mut std::net::TcpStream) {
    if req.method != "POST" {
        write_response(stream, 405, "{\"error\":\"Method not allowed\"}");
        return;
    }
    if !require_authorized(req, stream) {
        return;
    }
    let _g = STATE_LOCK.lock();
    let mut state = load_state(app);
    if get_status_str(&state) != "connected" {
        write_response(stream, 401, "{\"error\":\"Not connected\"}");
        return;
    }
    let data: Value = serde_json::from_str(&req.body).unwrap_or(Value::Null);
    let action_id = data.get("actionId").and_then(|v| v.as_str()).unwrap_or("");

    let mut pending = pending_vec(&state);
    let idx = pending
        .iter()
        .position(|a| a.get("id").and_then(|v| v.as_str()) == Some(action_id));
    let mut action = match idx {
        Some(i) => pending.remove(i),
        None => {
            write_response(stream, 404, "{\"error\":\"Action not found\"}");
            return;
        }
    };
    let success = data.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
    if let Some(obj) = action.as_object_mut() {
        obj.insert(
            "status".into(),
            Value::String(if success { "completed" } else { "failed" }.into()),
        );
        obj.insert("result".into(), data.get("result").cloned().unwrap_or(Value::Null));
        obj.insert("error".into(), data.get("error").cloned().unwrap_or(Value::Null));
        obj.insert("completedAt".into(), json!(now_ms()));
    }
    state.insert("pendingActions".into(), Value::Array(pending));
    record_action(&mut state, action.clone());

    // Bump connection lastActivity, mirroring the Electron handler.
    if let Some(conn) = state.get_mut("connection").and_then(|v| v.as_object_mut()) {
        conn.insert("lastActivity".into(), json!(now_ms()));
    }
    save_state(app, state);
    drop(_g);

    crate::native_ops::emit_event(app, "browser:actionCompleted", &action);
    write_response(stream, 200, "{\"success\":true}");
}

// /heartbeat: refresh lastActivity and optional tabCount.
fn handle_http_heartbeat(app: &tauri::AppHandle, req: &ParsedReq, stream: &mut std::net::TcpStream) {
    if req.method != "GET" && req.method != "POST" {
        write_response(stream, 405, "{\"error\":\"Method not allowed\"}");
        return;
    }
    if !require_authorized(req, stream) {
        return;
    }
    let _g = STATE_LOCK.lock();
    let mut state = load_state(app);
    if get_status_str(&state) == "connected" {
        // Parse tabCount from the query string (tabCount=N).
        let tab_count = req
            .query
            .split('&')
            .find_map(|kv| kv.strip_prefix("tabCount="))
            .and_then(|v| v.parse::<i64>().ok());
        if let Some(conn) = state.get_mut("connection").and_then(|v| v.as_object_mut()) {
            conn.insert("lastActivity".into(), json!(now_ms()));
            if let Some(tc) = tab_count {
                conn.insert("tabCount".into(), json!(if tc == 0 { 1 } else { tc }));
            }
        }
        save_state(app, state);
    }
    drop(_g);
    write_response(stream, 200, "{\"ok\":true}");
}

#[cfg(test)]
mod tests {
    use super::{constant_time_eq, hash_access_token, issue_access_token};

    #[test]
    fn bridge_tokens_are_high_entropy_hex_credentials() {
        let first = issue_access_token().expect("OS random source");
        let second = issue_access_token().expect("OS random source");
        assert_eq!(first.len(), 64);
        assert!(first.bytes().all(|b| b.is_ascii_hexdigit()));
        assert_ne!(first, second);
    }

    #[test]
    fn bridge_token_digests_compare_without_early_exit() {
        let expected = hash_access_token(&"a".repeat(64));
        let matching = hash_access_token(&"a".repeat(64));
        let different = hash_access_token(&"b".repeat(64));
        assert!(constant_time_eq(&expected, &matching));
        assert!(!constant_time_eq(&expected, &different));
    }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/// Route a `browser:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let arg = |i: usize| args.get(i).cloned().unwrap_or(Value::Null);
    let arg_str = |i: usize| args.get(i).and_then(|v| v.as_str()).map(String::from).unwrap_or_default();

    match channel {
        "browser:getStatus" => get_status(app),
        "browser:startServer" => start_server(app),
        "browser:stopServer" => stop_server(app),
        "browser:startPairing" => start_pairing(app),
        "browser:cancelPairing" => cancel_pairing(app),
        "browser:disconnect" => disconnect(app),
        "browser:navigate" => create_action(app, "navigate", &arg_str(0), None),
        // readPage: optional target url, defaults to "current" (Electron parity).
        "browser:readPage" => {
            let target = args
                .get(0)
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or("current")
                .to_string();
            create_action(app, "read", &target, None)
        }
        // fillField: Electron decrypts a sealed value via IPCCrypto.open before
        // building a `fill` action with { value }. There is no native counterpart
        // to that renderer-side seal, so we take the provided value directly.
        "browser:fillField" => {
            let selector = arg_str(0);
            let value = arg(1);
            create_action(app, "fill", &selector, Some(json!({ "value": value })))
        }
        // fillFormField: alias of fillField with a plain (selector, value) pair —
        // no sealed envelope. Produces the same `fill` WebAction shape.
        "browser:fillFormField" => {
            let selector = arg_str(0);
            let value = arg(1);
            create_action(app, "fill", &selector, Some(json!({ "value": value })))
        }
        "browser:click" => create_action(app, "click", &arg_str(0), None),
        _ => Value::Null,
    }
}

//! DEX-to-DEX file transfer: the live engine behind `dtp:startServer`, `dtp:sendFiles`,
//! `dtp:approveDevice` / `dtp:denyDevice` and the cancel channels. The wire protocol
//! (X25519 key exchange, AES-256-GCM frames, SHA-256 per file, safe file names) lives in
//! `core/dex-dtp`; this file owns threads, approval prompts, events and history.
//!
//! Events (all through `dex.on`):
//!   * `dtp:device-pending`   someone wants to send: deviceId, deviceName, code, files, totalBytes
//!   * `dtp:send-progress`    outgoing DTPProgress (status `connecting`/`awaiting-approval`/`sending`)
//!   * `dtp:send-complete` / `dtp:send-error`
//!   * `dtp:transfer-progress` / `dtp:transfer-complete` / `dtp:transfer-error` (incoming)
//!
//! Incoming offers are never accepted silently by the native side: the renderer decides
//! (prompt, trusted device or auto-accept) and answers with approve/deny; no answer in
//! 90 s is a "no".

use crate::util::LockSafe;
use dex_dtp::{Decision, Identity, Offer, ReceiveHooks, SendHooks};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::Manager;

const APPROVAL_TIMEOUT: Duration = Duration::from_secs(90);
/// Sender waits a little longer than the receiver's own approval timeout.
const DECISION_TIMEOUT: Duration = Duration::from_secs(100);
const PROGRESS_EVERY: Duration = Duration::from_millis(150);
const HISTORY_CAP: usize = 200;
const CHUNK_SIZE: u64 = 256 * 1024;

struct Server {
    port: u16,
    stop: Arc<AtomicBool>,
    dest: Arc<Mutex<Option<PathBuf>>>,
}

fn server() -> &'static Mutex<Option<Server>> {
    static S: OnceLock<Mutex<Option<Server>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

/// deviceId -> the waiting receive thread's answer slot.
fn pending() -> &'static Mutex<HashMap<String, mpsc::Sender<Decision>>> {
    static P: OnceLock<Mutex<HashMap<String, mpsc::Sender<Decision>>>> = OnceLock::new();
    P.get_or_init(|| Mutex::new(HashMap::new()))
}

/// transferId -> cancel flag (both directions).
fn cancels() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    static C: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register_cancel(id: &str) -> Arc<AtomicBool> {
    let flag = Arc::new(AtomicBool::new(false));
    { let mut m = cancels().lock_safe();
        m.insert(id.to_string(), flag.clone());
    }
    flag
}

fn drop_cancel(id: &str) {
    { let mut m = cancels().lock_safe();
        m.remove(id);
    }
}

fn me() -> Identity {
    Identity {
        device_id: super::dtp_ctl::machine_id(),
        device_name: super::dtp_ctl::hostname(),
        device_type: super::dtp_ctl::device_type().to_string(),
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn new_id(prefix: &str) -> String {
    format!("{prefix}-{}", crate::util::pseudo_uuid_v4())
}

fn emit(app: &tauri::AppHandle, channel: &str, payload: Value) {
    crate::native_ops::emit_event(app, channel, &payload);
}

fn fail(msg: impl Into<String>) -> Value {
    json!({ "success": false, "error": msg.into() })
}

/// Same shape as the renderer's DTPProgress.
fn progress_json(id: &str, peer: &str, done: u64, total: u64, started: Instant, status: &str) -> Value {
    let secs = started.elapsed().as_secs_f64().max(0.001);
    let speed = done as f64 / secs;
    let left = total.saturating_sub(done) as f64;
    let pct = if total == 0 { if status == "complete" { 100.0 } else { 0.0 } } else { done as f64 * 100.0 / total as f64 };
    json!({
        "transferId": id,
        "deviceName": peer,
        "totalBytes": total,
        "sentBytes": done,
        "speed": speed,
        "progress": pct,
        "timeRemainingMs": if speed > 0.0 { (left / speed * 1000.0) as u64 } else { 0 },
        "streamCount": 1,
        "chunkSize": CHUNK_SIZE,
        "status": status,
    })
}

fn record_history(app: &tauri::AppHandle, id: &str, peer: &str, direction: &str, total: u64, files: usize, started: Instant) {
    let secs = started.elapsed().as_secs_f64().max(0.001);
    let mut list = super::dtp_ctl::load_history(app);
    list.insert(
        0,
        json!({
            "id": id,
            "deviceName": peer,
            "direction": direction,
            "totalBytes": total,
            "fileCount": files,
            "averageSpeed": total as f64 / secs,
            "completedAt": now_ms(),
        }),
    );
    list.truncate(HISTORY_CAP);
    let _ = crate::kv_set(app, super::dtp_ctl::KEY_HISTORY, Value::Array(list));
}

// ---------------------------------------------------------------------------
// Receive side
// ---------------------------------------------------------------------------

struct Incoming {
    app: tauri::AppHandle,
    id: String,
    cancel: Arc<AtomicBool>,
    last: Mutex<Instant>,
    started: Mutex<Instant>,
}

impl ReceiveHooks for Incoming {
    fn decide(&self, offer: &Offer) -> Decision {
        let (tx, rx) = mpsc::channel();
        {
            let mut map = pending().lock_safe();
            if map.contains_key(&offer.peer.device_id) {
                return Decision::Deny("Another request from this device is waiting.".into());
            }
            map.insert(offer.peer.device_id.clone(), tx);
        }
        let shown: Vec<Value> = offer.files.iter().take(20).map(|f| json!({ "name": f.name, "size": f.size })).collect();
        emit(
            &self.app,
            "dtp:device-pending",
            json!({
                "transferId": self.id,
                "deviceId": offer.peer.device_id,
                "deviceName": offer.peer.device_name,
                "deviceType": offer.peer.device_type,
                "address": offer.peer_addr,
                "code": offer.code,
                "files": shown,
                "fileCount": offer.files.len(),
                "totalBytes": offer.total_bytes,
            }),
        );
        let answer = rx.recv_timeout(APPROVAL_TIMEOUT).unwrap_or_else(|_| Decision::Deny("No answer on the other device.".into()));
        { let mut map = pending().lock_safe();
            map.remove(&offer.peer.device_id);
        }
        if matches!(answer, Decision::Accept) {
            { let mut s = self.started.lock_safe();
                *s = Instant::now();
            }
        } else {
            emit(&self.app, "dtp:device-pending-cleared", json!({ "deviceId": offer.peer.device_id }));
        }
        answer
    }

    fn progress(&self, offer: &Offer, received: u64) {
        let mut last = self.last.lock_safe();
        if last.elapsed() < PROGRESS_EVERY && received < offer.total_bytes {
            return;
        }
        *last = Instant::now();
        let started = self.started.lock().map(|s| *s).unwrap_or_else(|_| Instant::now());
        let mut p = progress_json(&self.id, &offer.peer.device_name, received, offer.total_bytes, started, "receiving");
        p["direction"] = json!("receive");
        p["code"] = json!(offer.code);
        emit(&self.app, "dtp:transfer-progress", p);
    }

    fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }
}

/// Receives in progress at once. Each one is a thread; without a cap, anything
/// on the network that opened connection after connection made DEX start a
/// thread per connection until it ran out of memory.
const MAX_ACTIVE_RECEIVES: usize = 8;
static ACTIVE_RECEIVES: AtomicUsize = AtomicUsize::new(0);

/// Holds one receive slot; frees it however the receive ends (even a panic).
struct ReceiveSlot;
impl ReceiveSlot {
    fn try_take() -> Option<Self> {
        ACTIVE_RECEIVES
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |n| (n < MAX_ACTIVE_RECEIVES).then_some(n + 1))
            .ok()
            .map(|_| ReceiveSlot)
    }
}
impl Drop for ReceiveSlot {
    fn drop(&mut self) {
        ACTIVE_RECEIVES.fetch_sub(1, Ordering::SeqCst);
    }
}

fn handle_connection(app: tauri::AppHandle, stream: TcpStream, dest: PathBuf) {
    let id = new_id("rx");
    let hooks = Incoming {
        app: app.clone(),
        id: id.clone(),
        cancel: register_cancel(&id),
        last: Mutex::new(Instant::now() - PROGRESS_EVERY),
        started: Mutex::new(Instant::now()),
    };
    let result = dex_dtp::receive(stream, &me(), &dest, &hooks);
    drop_cancel(&id);
    let started = hooks.started.lock().map(|s| *s).unwrap_or_else(|_| Instant::now());
    match result {
        Ok(r) => {
            record_history(&app, &id, &r.peer.device_name, "receive", r.total_bytes, r.files.len(), started);
            let files: Vec<String> = r.files.iter().map(|p| p.to_string_lossy().into_owned()).collect();
            let mut p = progress_json(&id, &r.peer.device_name, r.total_bytes, r.total_bytes, started, "complete");
            p["direction"] = json!("receive");
            p["files"] = json!(files);
            p["folder"] = json!(dest.to_string_lossy());
            emit(&app, "dtp:transfer-complete", p);
        }
        // Declined offers are the user's own choice; nothing to report.
        Err(dex_dtp::DtpError::Denied(_)) => {}
        Err(e) => emit(&app, "dtp:transfer-error", json!({ "transferId": id, "direction": "receive", "error": e.to_string() })),
    }
}

fn default_dest(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().download_dir().ok()
}

fn dest_from(app: &tauri::AppHandle, opts: &Value) -> Option<PathBuf> {
    opts.get("downloadDir")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .or_else(|| default_dest(app))
}

pub fn start_server(app: &tauri::AppHandle, args: &Value) -> Value {
    let opts = args.get(0).cloned().unwrap_or(Value::Null);
    let Some(dest) = dest_from(app, &opts) else { return fail("Couldn't find the Downloads folder.") };
    let mut guard = server().lock_safe();
    if let Some(s) = guard.as_ref() {
        { let mut d = s.dest.lock_safe();
            *d = Some(dest);
        }
        return json!({ "success": true, "port": s.port, "running": true });
    }
    let port = super::dtp_ctl::DTP_PORT;
    let listener = match TcpListener::bind(("0.0.0.0", port)) {
        Ok(l) => l,
        Err(e) => return fail(format!("Couldn't listen on port {port}: {e}")),
    };
    let stop = Arc::new(AtomicBool::new(false));
    let dest = Arc::new(Mutex::new(Some(dest)));
    let (app2, stop2, dest2) = (app.clone(), stop.clone(), dest.clone());
    let spawned = std::thread::Builder::new().name("dtp-server".into()).spawn(move || {
        for conn in listener.incoming() {
            if stop2.load(Ordering::SeqCst) {
                break;
            }
            let Ok(stream) = conn else { continue };
            let Some(folder) = dest2.lock_safe().clone() else { continue };
            let Some(slot) = ReceiveSlot::try_take() else {
                // Busy: refuse instead of queueing another thread.
                let _ = stream.shutdown(Shutdown::Both);
                continue;
            };
            let app3 = app2.clone();
            let _ = std::thread::Builder::new()
                .name("dtp-receive".into())
                .spawn(move || {
                    let _slot = slot;
                    handle_connection(app3, stream, folder)
                });
        }
    });
    if let Err(e) = spawned {
        return fail(format!("Couldn't start the receiver: {e}"));
    }
    *guard = Some(Server { port, stop, dest });
    json!({ "success": true, "port": port, "running": true })
}

pub fn stop_server() -> Value {
    let mut guard = server().lock_safe();
    if let Some(s) = guard.take() {
        s.stop.store(true, Ordering::SeqCst);
        // Wake the blocking accept so the thread sees the flag and exits.
        if let Ok(c) = TcpStream::connect_timeout(&([127, 0, 0, 1], s.port).into(), Duration::from_millis(300)) {
            let _ = c.shutdown(Shutdown::Both);
        }
    }
    json!({ "success": true })
}

pub fn server_running() -> bool {
    server().lock().map(|s| s.is_some()).unwrap_or(false)
}

fn answer(args: &Value, decision: Decision) -> Value {
    let device_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let tx = pending().lock().ok().and_then(|mut m| m.remove(device_id));
    match tx {
        Some(tx) if tx.send(decision).is_ok() => json!({ "success": true }),
        _ => fail("That request is no longer waiting."),
    }
}

pub fn approve(args: &Value) -> Value {
    answer(args, Decision::Accept)
}

pub fn deny(args: &Value) -> Value {
    answer(args, Decision::Deny("The other device declined.".into()))
}

pub fn cancel(args: &Value) -> Value {
    let id = args
        .get(0)
        .and_then(|v| v.as_str().map(str::to_string).or_else(|| v.get("transferId").and_then(|t| t.as_str()).map(str::to_string)))
        .unwrap_or_default();
    match cancels().lock().ok().and_then(|m| m.get(&id).cloned()) {
        Some(flag) => {
            flag.store(true, Ordering::SeqCst);
            json!({ "success": true })
        }
        None => fail("That transfer isn't running."),
    }
}

pub fn pause_unsupported() -> Value {
    fail("Pausing isn't supported for DEX-to-DEX transfers. Cancel and send again.")
}

// ---------------------------------------------------------------------------
// Send side
// ---------------------------------------------------------------------------

struct Outgoing {
    app: tauri::AppHandle,
    id: String,
    peer_name: Mutex<String>,
    cancel: Arc<AtomicBool>,
    last: Mutex<Instant>,
    started: Mutex<Instant>,
    total: u64,
}

impl Outgoing {
    fn peer(&self) -> String {
        self.peer_name.lock().map(|s| s.clone()).unwrap_or_default()
    }
}

impl SendHooks for Outgoing {
    fn handshake(&self, peer: &Identity, code: &str) {
        { let mut n = self.peer_name.lock_safe();
            *n = peer.device_name.clone();
        }
        let mut p = progress_json(&self.id, &peer.device_name, 0, self.total, Instant::now(), "awaiting-approval");
        p["code"] = json!(code);
        emit(&self.app, "dtp:send-progress", p);
    }

    fn progress(&self, sent: u64, total: u64) {
        let mut last = self.last.lock_safe();
        let first = sent > 0 && sent <= CHUNK_SIZE;
        if first {
            { let mut s = self.started.lock_safe();
                *s = Instant::now();
            }
        }
        if !first && last.elapsed() < PROGRESS_EVERY && sent < total {
            return;
        }
        *last = Instant::now();
        let started = self.started.lock().map(|s| *s).unwrap_or_else(|_| Instant::now());
        emit(&self.app, "dtp:send-progress", progress_json(&self.id, &self.peer(), sent, total, started, "sending"));
    }

    fn cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }
}

pub fn send_files(app: &tauri::AppHandle, args: &Value) -> Value {
    let opts = args.get(0).cloned().unwrap_or(Value::Null);
    let files: Vec<PathBuf> = opts
        .get("files")
        .and_then(|f| f.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_str()).map(PathBuf::from).collect())
        .unwrap_or_default();
    if files.is_empty() {
        return fail("No files to send.");
    }
    let Some(address) = opts.get("targetAddress").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) else {
        return fail("No device address.");
    };
    let port = opts.get("targetPort").and_then(|v| v.as_u64()).filter(|p| *p > 0 && *p < 65536).unwrap_or(super::dtp_ctl::DTP_PORT as u64);
    let mut total = 0u64;
    for f in &files {
        match std::fs::metadata(f) {
            Ok(m) if m.is_file() => total += m.len(),
            Ok(_) => return fail(format!("{} is a folder; pick files.", f.display())),
            Err(e) => return fail(format!("Can't read {}: {e}", f.display())),
        }
    }
    let addr = if address.contains(':') && !address.starts_with('[') { format!("[{address}]:{port}") } else { format!("{address}:{port}") };
    let id = new_id("tx");
    let hooks = Outgoing {
        app: app.clone(),
        id: id.clone(),
        peer_name: Mutex::new(opts.get("deviceName").and_then(|v| v.as_str()).unwrap_or(address).to_string()),
        cancel: register_cancel(&id),
        last: Mutex::new(Instant::now() - PROGRESS_EVERY),
        started: Mutex::new(Instant::now()),
        total,
    };
    emit(app, "dtp:send-progress", progress_json(&id, &hooks.peer(), 0, total, Instant::now(), "connecting"));
    let app2 = app.clone();
    let id2 = id.clone();
    let spawned = std::thread::Builder::new().name("dtp-send".into()).spawn(move || {
        let result = dex_dtp::send(&addr, &me(), &files, &hooks, DECISION_TIMEOUT);
        drop_cancel(&id2);
        let started = hooks.started.lock().map(|s| *s).unwrap_or_else(|_| Instant::now());
        match result {
            Ok(s) => {
                record_history(&app2, &id2, &s.peer.device_name, "send", s.total_bytes, s.file_count, started);
                emit(&app2, "dtp:send-progress", progress_json(&id2, &s.peer.device_name, s.total_bytes, s.total_bytes, started, "complete"));
                emit(&app2, "dtp:send-complete", json!({ "transferId": id2, "deviceName": s.peer.device_name, "fileCount": s.file_count, "totalBytes": s.total_bytes }));
            }
            Err(e) => {
                let declined = matches!(e, dex_dtp::DtpError::Denied(_));
                emit(
                    &app2,
                    "dtp:send-error",
                    json!({ "transferId": id2, "error": e.to_string(), "declined": declined, "cancelled": matches!(e, dex_dtp::DtpError::Cancelled) }),
                );
            }
        }
    });
    if let Err(e) = spawned {
        drop_cancel(&id);
        return fail(format!("Couldn't start the transfer: {e}"));
    }
    json!({ "success": true, "transferId": id })
}

#[cfg(test)]
mod receive_slot_tests {
    use super::{ReceiveSlot, MAX_ACTIVE_RECEIVES};

    #[test]
    fn receive_slots_are_capped_and_freed_on_drop() {
        let held: Vec<_> = (0..MAX_ACTIVE_RECEIVES).filter_map(|_| ReceiveSlot::try_take()).collect();
        assert_eq!(held.len(), MAX_ACTIVE_RECEIVES);
        assert!(ReceiveSlot::try_take().is_none(), "past the cap a connection is refused");
        drop(held);
        assert!(ReceiveSlot::try_take().is_some(), "slots come back when receives end");
    }
}

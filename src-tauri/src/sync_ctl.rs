// =============================================================================
// DEX Tauri — Sync subsystem (port of the `sync:*` IPC handlers in
// src/main/sync/SyncManager.ts).
//
// DATA/CRUD tier only. SyncManager backed three `electron-store` files under
// userData; this mirrors that exact layout (flat top-level keys, same as how
// electron-store serializes) under <appData>:
//   - dex-sync-config.json  : { enabled, deviceId, deviceName, syncServer?,
//                               encryptionKey, autoSync, syncInterval, lastSync? }
//   - dex-sync-data.json     : { ... } (sync items cache; not read by any ported
//                               channel — only the heavy sync/merge path touched it)
//   - dex-sync-devices.json  : { devices: RemoteDevice[] }
// Return shapes match the Electron handlers exactly so the renderer is unchanged.
//
// SPEC vs SOURCE divergence (documented): the migration spec named a single
// `getStatus` channel over `fs-json:sync-state.json` with heavy channels `sync`
// and `resolve`. The real Electron `sync` namespace has NO `getStatus` channel
// and NO `sync-state.json`; it exposes a small read-only DATA surface plus heavy
// network/merge channels. The spec's `getStatus` maps onto the read-only data
// surface (the only thing a status panel can pull without a live network/merge
// runtime): getConfig + getDevices + getPendingConflicts. We honor the REAL
// source's store names (dex-sync-config / -devices) over the spec's idealized
// file name, per "SAME file name as the Electron Store". The spec's heavy
// `sync` -> sync:perform / sync:send-command / sync:start-server / sync:stop-server;
// the spec's heavy `resolve` -> sync:resolve-conflict. All are skipped (below).
//
// FIRST-RUN init (faithful to the SyncManager constructor): on first read the
// constructor lazily generated and PERSISTED a deviceId
// (`dex-${platform}-${randomBytes(8).hex}`) and an encryptionKey
// (randomBytes(32).hex) if absent. getConfig() then returns them. We reproduce
// that lazy-persist so a Tauri-side getConfig yields a stable deviceId across
// calls. ids use the mandated crate::util::pseudo_uuid_v4() (hex extracted, no
// rand crate); the encryptionKey here is NOT cryptographically secure — it only
// fills the shape, since the heavy encrypt/decrypt path that actually consumes it
// is not ported (see SKIPPED). platform comes from std::env::consts::OS.
//
// HEAVY CHANNELS (round: native implementation where feasible) ---------------
//   - sync:start-server / sync:stop-server: REAL http.Server lifecycle, rebuilt
//     on a raw std::net::TcpListener worker thread (no new dep — `http`/`hyper`
//     are unavailable, std is; precedent: browser_ctl.rs). start-server binds the
//     port (default 45679), is idempotent, tracks { server: { running, port } }
//     in the KV `sync` key, and emits sync:server-started; stop-server signals
//     the worker to exit, clears KV state, and emits sync:server-stopped. The
//     server binds a real socket and answers GET /status with a plain health JSON
//     (so liveness is observable), but the actual /sync and /command peer bodies
//     are AES-256-GCM encrypted (SyncManager.encrypt) — that wire format is NOT
//     reproducible without a crypto crate, so encrypted POSTs get an honest 501
//     error response. The lifecycle (the literal void action the renderer fires)
//     is genuinely native; the encrypted protocol over it is the degraded part.
//   - sync:resolve-conflict (spec "resolve"): FULLY ported against the native
//     process-global PENDING_CONFLICTS list (the analogue of the in-memory
//     `pendingConflicts` field). Finds by itemId; on 'remote' applies the remote
//     version to the KV-backed workflow/operation/script store; splices; returns
//     bool. With no native sync run there are no conflicts -> returns false, the
//     exact value Electron returns for an unknown itemId. Real, not faked.
//
// DEGRADED (genuinely need a non-portable crypto runtime; NOT faked):
//   - sync:perform     : SyncManager.sync() signs (HMAC-SHA256, buildable) but
//     transports the payload as AES-256-GCM ciphertext (`iv:authTag:encrypted`).
//     AES-256-GCM cannot be produced wire-compatibly without a crypto dependency,
//     so a perform against a real Electron peer could never decrypt. Returns
//     { success:false, merged:0, conflicts:0, error: ... } (matches the shape).
//   - sync:send-command: same AES-256-GCM transport. The faithful pre-flight
//     validation (device-not-found / address-unknown) IS reproduced and returns
//     the exact Electron shapes; only the encrypted send itself degrades.
//   update-config / remove-device are pure-data writes and remain ported.
// =============================================================================

use crate::util::LockSafe;
use crate::paths::DexPaths;
use crate::util::pseudo_uuid_v4;
use serde_json::{json, Map, Value};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::Mutex;

const CONFIG_FILE: &str = "dex-sync-config.json";
const DEVICES_FILE: &str = "dex-sync-devices.json";

// Default sync server port (SyncManager.startSyncServer default arg).
const DEFAULT_SYNC_PORT: u16 = 45679;

// Single global guard set so start/stop-server are idempotent and the worker
// thread can be signalled to exit (precedent: browser_ctl.rs SERVER_RUNNING/
// SERVER_STOP). The port that is currently (or was last) bound is tracked so the
// KV state and the sync:server-* events can report it.
static SERVER_RUNNING: AtomicBool = AtomicBool::new(false);
static SERVER_STOP: AtomicBool = AtomicBool::new(false);
static SERVER_PORT: AtomicU16 = AtomicU16::new(DEFAULT_SYNC_PORT);

// Process-global pending-conflicts list — the native analogue of SyncManager's
// in-memory `pendingConflicts` field. It is only ever populated by a completed
// sync run; since the AES-256-GCM sync transport is not portable here (see the
// degrade note on sync:perform), it stays empty, so resolveConflict faithfully
// finds nothing and returns false — exactly the value the renderer would read.
static PENDING_CONFLICTS: Mutex<Vec<Value>> = Mutex::new(Vec::new());

// --- file IO (electron-store JSON-under-appData; mirrors analytics.rs) -------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_file(app: &tauri::AppHandle, name: &str, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => std::fs::write(store_path(app, name), s).is_ok(),
        Err(_) => false,
    }
}

// --- id helpers -------------------------------------------------------------

// randomBytes(8).toString('hex') -> 16 hex chars. pseudo_uuid_v4 with hyphens
// stripped gives 32 hex chars; take 16. Not cryptographic (see header).
fn hex16() -> String {
    pseudo_uuid_v4().chars().filter(|c| *c != '-').take(16).collect()
}

// randomBytes(32).toString('hex') -> 64 hex chars. Two pseudo ids stitched.
fn hex64() -> String {
    let a: String = pseudo_uuid_v4().chars().filter(|c| *c != '-').collect();
    let b: String = pseudo_uuid_v4().chars().filter(|c| *c != '-').collect();
    format!("{}{}", a, b).chars().take(64).collect()
}

// `dex-${process.platform}-${randomBytes(8).hex}`. Node's process.platform is
// e.g. "win32"/"darwin"/"linux"; std::env::consts::OS is "windows"/"macos"/
// "linux". We map the common cases back to Node's spelling for shape parity.
fn platform_tag() -> &'static str {
    match std::env::consts::OS {
        "windows" => "win32",
        "macos" => "darwin",
        other => other,
    }
}

fn generate_device_id() -> String {
    format!("dex-{}-{}", platform_tag(), hex16())
}

// --- config -----------------------------------------------------------------

fn config_obj(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    read_file(app, CONFIG_FILE)
        .as_object()
        .cloned()
        .unwrap_or_default()
}

// SyncManager.getConfig(), including the constructor's lazy deviceId/
// encryptionKey persistence on first read.
fn get_config(app: &tauri::AppHandle) -> Value {
    let mut obj = config_obj(app);

    // Constructor: persist deviceId / encryptionKey if missing.
    let mut dirty = false;
    if !obj.get("deviceId").map(|v| v.is_string()).unwrap_or(false) {
        obj.insert("deviceId".into(), json!(generate_device_id()));
        dirty = true;
    }
    if !obj.get("encryptionKey").map(|v| v.is_string()).unwrap_or(false) {
        obj.insert("encryptionKey".into(), json!(hex64()));
        dirty = true;
    }
    if dirty {
        write_file(app, CONFIG_FILE, &Value::Object(obj.clone()));
    }

    let get_bool = |k: &str, d: bool| obj.get(k).and_then(|v| v.as_bool()).unwrap_or(d);
    let get_str = |k: &str, d: &str| {
        obj.get(k).and_then(|v| v.as_str()).unwrap_or(d).to_string()
    };

    let device_id = get_str("deviceId", "");
    let mut out = serde_json::Map::new();
    out.insert("enabled".into(), json!(get_bool("enabled", false)));
    out.insert("deviceId".into(), json!(device_id));
    out.insert(
        "deviceName".into(),
        json!(obj
            .get("deviceName")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| format!("Dex on {}", platform_tag()))),
    );
    // syncServer / lastSync are optional: present only when stored (matches the
    // electron-store `get('syncServer')` -> undefined -> omitted-over-IPC shape).
    if let Some(v) = obj.get("syncServer") {
        out.insert("syncServer".into(), v.clone());
    }
    out.insert("encryptionKey".into(), json!(get_str("encryptionKey", "")));
    out.insert("autoSync".into(), json!(get_bool("autoSync", true)));
    out.insert(
        "syncInterval".into(),
        json!(obj.get("syncInterval").and_then(|v| v.as_i64()).unwrap_or(15)),
    );
    if let Some(v) = obj.get("lastSync") {
        out.insert("lastSync".into(), v.clone());
    }
    Value::Object(out)
}

// SyncManager.updateConfig(updates): set each provided key, return getConfig().
fn update_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut obj = config_obj(app);
    if let Some(map) = updates.as_object() {
        for (k, v) in map {
            obj.insert(k.clone(), v.clone());
        }
        write_file(app, CONFIG_FILE, &Value::Object(obj));
    }
    get_config(app)
}

// --- devices ----------------------------------------------------------------

fn get_devices(app: &tauri::AppHandle) -> Vec<Value> {
    read_file(app, DEVICES_FILE)
        .get("devices")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
}

fn write_devices(app: &tauri::AppHandle, devices: &[Value]) -> bool {
    write_file(app, DEVICES_FILE, &json!({ "devices": devices }))
}

// SyncManager.removeDevice(deviceId): filter and persist. Electron returns void.
fn remove_device(app: &tauri::AppHandle, device_id: &str) -> Value {
    let kept: Vec<Value> = get_devices(app)
        .into_iter()
        .filter(|d| d.get("id").and_then(|v| v.as_str()) != Some(device_id))
        .collect();
    write_devices(app, &kept);
    Value::Null
}

// --- time -------------------------------------------------------------------

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- KV-backed server state -------------------------------------------------
// Server liveness is mirrored into the native KV `sync` key so a status panel /
// the dispatch path can observe { server: { running, port } } as one truth (the
// same convention browser_ctl.rs uses). Electron kept this only in process
// memory; persisting it is a faithful superset that survives the IPC boundary.

const KV_KEY: &str = "sync";

fn set_server_kv(app: &tauri::AppHandle, running: bool, port: u16) {
    let mut state: Map<String, Value> = match crate::kv_get(app, KV_KEY) {
        Value::Object(o) => o,
        _ => Map::new(),
    };
    state.insert(
        "server".into(),
        json!({ "running": running, "port": port }),
    );
    crate::kv_set(app, KV_KEY, Value::Object(state));
}

// --- HTTP server (start/stop) -----------------------------------------------

// Minimal, real per-connection handler. Mirrors SyncManager.startSyncServer's
// router as far as is portable: a GET /status health probe answers 200 with a
// JSON liveness blob; the encrypted POST /sync and POST /command bodies require
// AES-256-GCM (SyncManager.decrypt), which is not reproducible without a crypto
// dependency, so those answer an honest 501. No body is parsed beyond the
// request line (we never decrypt), so there is no payload-size exposure.
fn handle_conn(app: &tauri::AppHandle, mut stream: std::net::TcpStream) {
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(5)));
    let mut buf = [0u8; 2048];
    let n = match stream.read(&mut buf) {
        Ok(n) => n,
        Err(_) => return,
    };
    let head = String::from_utf8_lossy(&buf[..n]);
    let first = head.lines().next().unwrap_or("");
    let mut parts = first.split_whitespace();
    let method = parts.next().unwrap_or("");
    let path = parts.next().unwrap_or("");

    let (status_line, body): (&str, String) = if method == "GET" && path == "/status" {
        let cfg = get_config(app);
        let device_id = cfg
            .get("deviceId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        (
            "HTTP/1.1 200 OK",
            json!({
                "success": true,
                "status": {
                    "platform": platform_tag(),
                    "deviceId": device_id,
                    "serverTime": now_ms(),
                }
            })
            .to_string(),
        )
    } else if method == "POST" && (path == "/sync" || path == "/command") {
        (
            "HTTP/1.1 501 Not Implemented",
            json!({
                "success": false,
                "error": "encrypted sync transport not ported (needs native AES-256-GCM runtime)"
            })
            .to_string(),
        )
    } else {
        (
            "HTTP/1.1 404 Not Found",
            json!({ "success": false, "error": "not found" }).to_string(),
        )
    };

    let response = format!(
        "{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status_line,
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

// SyncManager.startSyncServer(port = 45679): bind the local sync server.
// Idempotent (Electron returned early when one was already running). Spawns a
// std::net::TcpListener worker thread on 127.0.0.1:<port>. Void channel -> Null.
fn start_server(app: &tauri::AppHandle, port: u16) -> Value {
    if SERVER_RUNNING.load(Ordering::SeqCst) {
        return Value::Null; // already running (matches the early `return`)
    }

    let listener = match TcpListener::bind(("127.0.0.1", port)) {
        Ok(l) => l,
        Err(_) => {
            // Bind failed (port busy / denied). Electron logged and left the
            // server null; mirror that — running stays false, KV reflects it.
            set_server_kv(app, false, port);
            return Value::Null;
        }
    };
    if listener.set_nonblocking(true).is_err() {
        return Value::Null;
    }

    SERVER_RUNNING.store(true, Ordering::SeqCst);
    SERVER_STOP.store(false, Ordering::SeqCst);
    SERVER_PORT.store(port, Ordering::SeqCst);
    set_server_kv(app, true, port);

    let app_for_thread = app.clone();
    crate::util::spawn_named("sync", move || {
        loop {
            if SERVER_STOP.load(Ordering::SeqCst) {
                break;
            }
            match listener.accept() {
                Ok((stream, _addr)) => {
                    let _ = stream.set_nonblocking(false);
                    crate::util::guard_panic("sync request", || handle_conn(&app_for_thread, stream));
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

    crate::native_ops::emit_event(app, "sync:server-started", &json!({ "port": port }));
    Value::Null
}

// SyncManager.stopSyncServer(): close the server and null it. Void -> Null.
fn stop_server(app: &tauri::AppHandle) -> Value {
    let was_running = SERVER_RUNNING.load(Ordering::SeqCst);
    SERVER_STOP.store(true, Ordering::SeqCst);
    let port = SERVER_PORT.load(Ordering::SeqCst);
    set_server_kv(app, false, port);
    if was_running {
        crate::native_ops::emit_event(app, "sync:server-stopped", &json!({ "port": port }));
    }
    Value::Null
}

// --- conflict resolution ----------------------------------------------------

// One of dex-workflows / dex-operations / dex-scripts, the electron-store files
// SyncManager.resolveConflict rewrites. Those subsystems are KV-backed natively;
// the stored shape is { "<type>s": [ ... ] }, so we mutate that array in KV
// under the same key the rest of the app reads.
fn store_key_for_type(item_type: &str) -> Option<(&'static str, &'static str)> {
    match item_type {
        "workflow" => Some(("workflows", "workflows")),
        "operation" => Some(("operations", "operations")),
        "script" => Some(("scripts", "scripts")),
        _ => None,
    }
}

// SyncManager.resolveConflict(itemId, resolution): find the pending conflict;
// on 'remote' overwrite the local item with the remote version; remove from
// pending; return bool. Returns false when the itemId is not pending — which,
// with no native sync run to populate PENDING_CONFLICTS, is always the case.
fn resolve_conflict(app: &tauri::AppHandle, item_id: &str, resolution: &str) -> Value {
    let mut conflicts = PENDING_CONFLICTS.lock_safe();

    let index = conflicts
        .iter()
        .position(|c| c.get("itemId").and_then(|v| v.as_str()) == Some(item_id));
    let index = match index {
        Some(i) => i,
        None => return Value::Bool(false),
    };

    if resolution == "remote" {
        let conflict = &conflicts[index];
        let item_type = conflict
            .get("itemType")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let remote_data = conflict
            .get("remoteVersion")
            .and_then(|v| v.get("data"))
            .cloned()
            .unwrap_or(Value::Null);

        if let Some((kv_key, arr_key)) = store_key_for_type(item_type) {
            let mut state: Map<String, Value> = match crate::kv_get(app, kv_key) {
                Value::Object(o) => o,
                _ => Map::new(),
            };
            let mut arr = state
                .get(arr_key)
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default();
            if let Some(pos) = arr
                .iter()
                .position(|e| e.get("id").and_then(|v| v.as_str()) == Some(item_id))
            {
                arr[pos] = remote_data;
                state.insert(arr_key.into(), Value::Array(arr));
                crate::kv_set(app, kv_key, Value::Object(state));
            }
        }
    }

    conflicts.remove(index);
    Value::Bool(true)
}

// --- degraded network channels (AES-256-GCM transport not portable) ---------

const DEGRADE_ERR: &str = "not ported (needs native runtime)";

// SyncManager.sync(target): degrades to the exact result shape. We still honor
// the cheap, faithful guard branches Electron checks before any network I/O
// (sync disabled / no target) so the renderer sees the right error first.
fn perform_sync(app: &tauri::AppHandle, target: Option<&str>) -> Value {
    let cfg = get_config(app);
    if !cfg.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false) {
        return json!({ "success": false, "merged": 0, "conflicts": 0, "error": "Sync is disabled" });
    }
    let has_target = target.map(|t| !t.is_empty()).unwrap_or(false)
        || cfg.get("syncServer").and_then(|v| v.as_str()).map(|s| !s.is_empty()).unwrap_or(false);
    if !has_target {
        return json!({ "success": false, "merged": 0, "conflicts": 0, "error": "No sync target" });
    }
    // Past the guards the path is HMAC-signed AES-256-GCM transport, which is not
    // reproducible without a crypto dep. Honest degrade, exact shape.
    json!({ "success": false, "merged": 0, "conflicts": 0, "error": DEGRADE_ERR })
}

// SyncManager.sendCommand(deviceId, command): the device lookup + address guards
// are faithfully reproduced (real Electron behavior, exact shapes); only the
// encrypted send degrades.
fn send_command(app: &tauri::AppHandle, device_id: &str, _command: &Value) -> Value {
    let devices = get_devices(app);
    let device = devices
        .iter()
        .find(|d| d.get("id").and_then(|v| v.as_str()) == Some(device_id));
    let device = match device {
        Some(d) => d,
        None => return json!({ "success": false, "error": "Device not found" }),
    };
    let has_address = device
        .get("address")
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    if !has_address {
        return json!({ "success": false, "error": "Device address unknown" });
    }
    // Encrypted HTTP command (AES-256-GCM) — not portable. Honest degrade.
    json!({ "success": false, "error": DEGRADE_ERR })
}

/// Route a `sync:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled: the
/// data/CRUD surface plus the natively-ported heavy channels (start/stop-server
/// lifecycle, resolve-conflict); the two AES-256-GCM-transport channels degrade
/// to their exact Electron result shapes. Prefix-routing the whole namespace is
/// safe (no channel falls through to a fake value).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // --- DATA / CRUD (ported) -------------------------------------------
        "sync:get-config" => get_config(app),
        "sync:update-config" => {
            let updates = args.get(0).cloned().unwrap_or(Value::Null);
            update_config(app, &updates)
        }
        "sync:get-devices" => json!(get_devices(app)),
        "sync:remove-device" => {
            let device_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            remove_device(app, device_id)
        }
        // getPendingConflicts(): read the native PENDING_CONFLICTS registry that
        // resolveConflict mutates (the analogue of the in-memory field). Only a
        // completed sync run fills it; the sync transport is degraded, so it is
        // empty -> [], the exact value the renderer reads before any sync. Reading
        // the real registry keeps get-conflicts and resolve-conflict coherent.
        "sync:get-conflicts" => {
            let conflicts = match PENDING_CONFLICTS.lock() {
                Ok(g) => g.clone(),
                Err(p) => p.into_inner().clone(),
            };
            Value::Array(conflicts)
        }

        // --- HEAVY (native) -------------------------------------------------
        // Real http.Server lifecycle on a std::net::TcpListener worker thread.
        "sync:start-server" => {
            let port = args
                .get(0)
                .and_then(|v| v.as_u64())
                .map(|p| p as u16)
                .filter(|p| *p != 0)
                .unwrap_or(DEFAULT_SYNC_PORT);
            start_server(app, port)
        }
        "sync:stop-server" => stop_server(app),
        // Real conflict resolution against the native pending list + KV stores.
        "sync:resolve-conflict" => {
            let item_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let resolution = args.get(1).and_then(|v| v.as_str()).unwrap_or("local");
            resolve_conflict(app, item_id, resolution)
        }

        // --- HEAVY (degraded — AES-256-GCM transport not portable) ----------
        "sync:perform" => {
            let target = args.get(0).and_then(|v| v.as_str());
            perform_sync(app, target)
        }
        "sync:send-command" => {
            let device_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let command = args.get(1).cloned().unwrap_or(Value::Null);
            send_command(app, device_id, &command)
        }

        _ => Value::Null,
    }
}

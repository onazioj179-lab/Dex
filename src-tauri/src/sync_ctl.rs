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
// SKIPPED (heavy — need a native network/merge runtime; NOT implemented/faked):
//   - sync:perform        (spec "sync"): HTTPS payload sign + POST + merge.
//   - sync:send-command   (spec "sync"): encrypted HTTP command to a peer.
//   - sync:start-server / sync:stop-server (spec "sync"): http.Server lifecycle.
//   - sync:resolve-conflict (spec "resolve"): mutates the LIVE in-memory
//     pendingConflicts list (never persisted) and rewrites workflow/op/script
//     stores. With no live sync run there are no pending conflicts to resolve.
//   All of the above route to Value::Null (matching the void/unreachable result
//   the renderer would see), so prefix-routing the whole `sync:` namespace here
//   is safe. update-config / remove-device are pure-data writes and ARE ported.
// =============================================================================

use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const CONFIG_FILE: &str = "dex-sync-config.json";
const DEVICES_FILE: &str = "dex-sync-devices.json";

// --- file IO (electron-store JSON-under-appData; mirrors analytics.rs) -------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
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

/// Route a `sync:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled; the
/// heavy network/merge ones return Value::Null (honest degrade, matching the
/// void/unreachable Electron result), so prefix-routing the whole namespace is
/// safe.
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
        // getPendingConflicts(): pendingConflicts is a live in-memory field, only
        // populated by a sync run (not ported). It starts empty -> [] here, which
        // is the exact value the renderer reads before any sync. Honest, not fake.
        "sync:get-conflicts" => json!([]),

        // --- HEAVY (skipped — need native network/merge runtime; NOT faked) ---
        // spec "sync":
        "sync:perform"
        | "sync:send-command"
        | "sync:start-server"
        | "sync:stop-server"
        // spec "resolve":
        | "sync:resolve-conflict" => Value::Null,

        _ => Value::Null,
    }
}

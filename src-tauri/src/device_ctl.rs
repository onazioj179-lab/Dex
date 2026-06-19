// =============================================================================
// DEX Tauri — Device subsystem (data tier of DeviceController.ts).
//
// Pure-data, JSON-backed tier. Electron kept device state in a single
// `electron-store` whose persisted keys (devices / pairings / sessions /
// discoveryEnabled / thisDeviceId / thisDeviceName) live under one file. This
// mirrors that under <appData> using the same file name and the same top-level
// key wrappers:
//   - devices.json : { devices: Device[], thisDeviceId, thisDeviceName, ... }
// Only the read-only DATA getters are ported here; the renderer return shapes
// match the Electron handlers exactly so it stays unchanged.
//
// Channels & shapes (from DeviceController.registerHandlers):
//   - device:getThisDevice -> Device   (the synthesized self-device object)
//   - device:getAll        -> Device[] (store.get('devices'), [] if unset)
//
// A Device is:
//   { id, name, type, platform, hostname, ip, port, capabilities, status,
//     lastSeen, trusted, paired, pairingCode? }
// capabilities is:
//   { canSendFiles, canReceiveFiles, canStream, canRemoteControl,
//     maxTransferSize?, supportedTypes[] }
//
// DIVERGENCES (documented):
//   - thisDevice id: Electron generated `dex_${randomBytes(8).hex}` (16 hex
//     chars) and PERSISTED it (store.set) on first run. We mirror the exact
//     shape ("dex_" + 16 hex) using the mandated crate::util::pseudo_uuid_v4()
//     — no rand crate — and likewise persist it so the id is stable across
//     calls, just as initializeThisDevice() did.
//   - thisDevice name: Electron defaulted to os.hostname() and persisted it.
//     Same here (COMPUTERNAME/HOSTNAME env, mirroring http_transfer.rs).
//   - platform string: Electron used `${os.platform()} ${os.release()}` (e.g.
//     "win32 10.0.26200"). We compose node_platform() + sysinfo os_version()
//     (the kernel/OS release), matching that "platform release" format.
//   - type detection: detectDeviceType() returns "desktop" for win32/darwin/
//     linux and "unknown" otherwise. Reproduced exactly.
//   - lastSeen / status / trusted / paired / capabilities are the same literal
//     defaults the constructor assigned to thisDevice.
//   - Local IP: same strategy as http_transfer.rs (UDP-connect probe), falling
//     back to 127.0.0.1, matching getLocalIP()'s intent (first non-internal
//     IPv4, 127.0.0.1 fallback).
// =============================================================================

use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};
use std::net::UdpSocket;
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "devices.json";
const DISCOVERY_PORT: i64 = 41234;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- file IO (mirrors analytics.rs store_path/read_file/write_file) ----------

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(STORE_FILE)
}

fn read_store(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn write_store(app: &tauri::AppHandle, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => std::fs::write(store_path(app), s).is_ok(),
        Err(_) => false,
    }
}

// os.hostname(). Mirrors http_transfer.rs::hostname (no dependency).
fn hostname() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "DEX".to_string())
}

// process.platform values (same table as user_profile.rs::node_platform).
fn node_platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    }
}

// `${os.platform()} ${os.release()}` — node platform + kernel/OS release.
fn platform_string() -> String {
    let release = sysinfo::System::os_version().unwrap_or_default();
    if release.is_empty() {
        node_platform().to_string()
    } else {
        format!("{} {}", node_platform(), release)
    }
}

// detectDeviceType(): "desktop" for the three desktop OSes, else "unknown".
fn detect_device_type() -> &'static str {
    match node_platform() {
        "win32" | "darwin" | "linux" => "desktop",
        _ => "unknown",
    }
}

// getLocalIP(): first non-internal IPv4, else 127.0.0.1. Mirrors the
// UDP-connect probe used in http_transfer.rs (no extra dependency).
fn local_ip() -> String {
    UdpSocket::bind("0.0.0.0:0")
        .and_then(|s| {
            s.connect("8.8.8.8:80")?;
            s.local_addr()
        })
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string())
}

// initializeThisDevice(): read-or-generate id/name (persisting on first run),
// then build the self-Device with the constructor's literal defaults.
fn get_this_device(app: &tauri::AppHandle) -> Value {
    let mut store = read_store(app);
    if !store.is_object() {
        store = json!({});
    }
    let obj = store.as_object_mut().unwrap();

    // thisDeviceId: `dex_${randomBytes(8).hex}` (16 hex), persisted on first run.
    let device_id = match obj.get("thisDeviceId").and_then(|v| v.as_str()) {
        Some(id) if !id.is_empty() => id.to_string(),
        _ => {
            let hex: String = pseudo_uuid_v4()
                .chars()
                .filter(|c| *c != '-')
                .take(16)
                .collect();
            let id = format!("dex_{}", hex);
            obj.insert("thisDeviceId".into(), json!(id));
            id
        }
    };

    // thisDeviceName: os.hostname(), persisted on first run.
    let device_name = match obj.get("thisDeviceName").and_then(|v| v.as_str()) {
        Some(n) if !n.is_empty() => n.to_string(),
        _ => {
            let n = hostname();
            obj.insert("thisDeviceName".into(), json!(n));
            n
        }
    };

    write_store(app, &store);

    json!({
        "id": device_id,
        "name": device_name,
        "type": detect_device_type(),
        "platform": platform_string(),
        "hostname": hostname(),
        "ip": local_ip(),
        "port": DISCOVERY_PORT,
        "capabilities": {
            "canSendFiles": true,
            "canReceiveFiles": true,
            "canStream": false,
            "canRemoteControl": false,
            "supportedTypes": ["file", "folder", "media", "text"]
        },
        "status": "online",
        "lastSeen": now_ms(),
        "trusted": true,
        "paired": true
    })
}

// store.get('devices') with the [] default.
fn get_all(app: &tauri::AppHandle) -> Value {
    match read_store(app).get("devices") {
        Some(Value::Array(a)) => json!(a),
        _ => json!([]),
    }
}

/// Route a `device:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the read-only data getters are ported; every
/// other channel in the namespace (discovery, manual add, pairing, sessions,
/// mutations, and the trusted/online filtered getters) returns Value::Null —
/// so this dispatch is NOT a safe catch-all for the whole `device:` prefix.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "device:getThisDevice" => get_this_device(app),
        "device:getAll" => get_all(app),
        _ => Value::Null,
    }
}

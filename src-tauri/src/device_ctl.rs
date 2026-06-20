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
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs, UdpSocket};
use std::path::PathBuf;
use std::time::Duration;
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

// --- store mutation helpers (mirror store.get/store.set('devices', ...)) ------

// Read the devices array out of the store (always an owned Vec, [] default).
fn read_devices(app: &tauri::AppHandle) -> Vec<Value> {
    match read_store(app).get("devices") {
        Some(Value::Array(a)) => a.clone(),
        _ => Vec::new(),
    }
}

// Persist a devices array back into the store object, preserving the other
// top-level keys (thisDeviceId/thisDeviceName/pairings/sessions/...).
fn write_devices(app: &tauri::AppHandle, devices: Vec<Value>) -> bool {
    let mut store = read_store(app);
    if !store.is_object() {
        store = json!({});
    }
    store
        .as_object_mut()
        .unwrap()
        .insert("devices".into(), Value::Array(devices));
    write_store(app, &store)
}

// device:getTrusted -> store.get('devices').filter(d => d.trusted)
fn get_trusted(app: &tauri::AppHandle) -> Value {
    let filtered: Vec<Value> = read_devices(app)
        .into_iter()
        .filter(|d| d.get("trusted").and_then(|v| v.as_bool()).unwrap_or(false))
        .collect();
    Value::Array(filtered)
}

// device:getOnline -> store.get('devices').filter(d => d.status === 'online')
fn get_online(app: &tauri::AppHandle) -> Value {
    let filtered: Vec<Value> = read_devices(app)
        .into_iter()
        .filter(|d| d.get("status").and_then(|v| v.as_str()) == Some("online"))
        .collect();
    Value::Array(filtered)
}

// device:setName -> rename THIS device. Persists thisDeviceName (the only
// piece of `this.thisDevice` Electron actually persisted). Returns {success}.
fn set_name(app: &tauri::AppHandle, args: &Value) -> Value {
    let name = match args.get(0).and_then(|v| v.as_str()) {
        Some(n) if !n.is_empty() => n.to_string(),
        _ => return json!({ "success": false, "error": "name required" }),
    };
    let mut store = read_store(app);
    if !store.is_object() {
        store = json!({});
    }
    store
        .as_object_mut()
        .unwrap()
        .insert("thisDeviceName".into(), json!(name));
    let ok = write_store(app, &store);
    json!({ "success": ok })
}

// device:remove -> unregister a known device by id. Returns {success}.
fn remove(app: &tauri::AppHandle, args: &Value) -> Value {
    let device_id = match args.get(0).and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => return json!({ "success": false, "error": "deviceId required" }),
    };
    let devices: Vec<Value> = read_devices(app)
        .into_iter()
        .filter(|d| d.get("id").and_then(|v| v.as_str()) != Some(device_id.as_str()))
        .collect();
    let ok = write_devices(app, devices);
    json!({ "success": ok })
}

// device:setTrusted -> trust/untrust a known device. Returns {success}.
// Mirrors Electron: if the device isn't found it still returns success:true.
fn set_trusted(app: &tauri::AppHandle, args: &Value) -> Value {
    let device_id = match args.get(0).and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => return json!({ "success": false, "error": "deviceId required" }),
    };
    let trusted = args.get(1).and_then(|v| v.as_bool()).unwrap_or(false);

    let mut devices = read_devices(app);
    for d in devices.iter_mut() {
        if d.get("id").and_then(|v| v.as_str()) == Some(device_id.as_str()) {
            if let Some(obj) = d.as_object_mut() {
                obj.insert("trusted".into(), json!(trusted));
            }
        }
    }
    let ok = write_devices(app, devices);
    json!({ "success": ok })
}

// performHandshake(ip, port): real TCP probe (mirrors net.Socket in Electron).
// Connects, sends the DEX handshake line, reads any response. Returns the
// partial-device fields. On connect failure returns Err with the same message
// shapes Electron produced (refused / unreachable). On connect success but no
// usable response, returns the basic-info fallback (device exists). 5s timeout.
fn perform_handshake(
    app: &tauri::AppHandle,
    ip: &str,
    port: u16,
) -> Result<Value, String> {
    let basic_fallback = json!({
        "name": format!("Device at {}", ip),
        "type": "unknown",
        "platform": "unknown",
        "hostname": ip,
        "capabilities": {
            "canSendFiles": true,
            "canReceiveFiles": true,
            "canStream": false,
            "canRemoteControl": false,
            "supportedTypes": ["file"]
        }
    });

    let addr = match (ip, port).to_socket_addrs() {
        Ok(mut it) => match it.next() {
            Some(a) => a,
            None => return Err("Device unreachable".to_string()),
        },
        Err(_) => return Err("Device unreachable".to_string()),
    };

    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_secs(5)) {
        Ok(s) => s,
        Err(e) => {
            // Map to the same human messages Electron returned.
            return Err(match e.kind() {
                std::io::ErrorKind::ConnectionRefused => {
                    "Connection refused - no service running on this port".to_string()
                }
                std::io::ErrorKind::TimedOut => "Device unreachable".to_string(),
                _ => "Connection failed".to_string(),
            });
        }
    };

    // Send the DEX handshake (this.thisDevice?.id || 'unknown').
    let this_id = get_this_device(app)
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let handshake = json!({
        "protocol": "DEX",
        "version": "1.0",
        "type": "handshake",
        "from": this_id
    });
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    if stream
        .write_all(format!("{}\n", handshake).as_bytes())
        .is_err()
    {
        // Connected but couldn't write: device exists, protocol mismatch.
        return Ok(basic_fallback);
    }

    // Read up to 8 KiB of response (size cap, like cmd_link_preview.rs).
    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf).unwrap_or(0);
    if n == 0 {
        // No response within timeout -> basic info (device exists).
        return Ok(basic_fallback);
    }

    let text = String::from_utf8_lossy(&buf[..n]);
    match serde_json::from_str::<Value>(text.trim()) {
        Ok(resp) => {
            let get_s = |k: &str, d: &str| {
                resp.get(k)
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .unwrap_or(d)
                    .to_string()
            };
            let caps = resp.get("capabilities").cloned().unwrap_or_else(|| {
                json!({
                    "canSendFiles": true,
                    "canReceiveFiles": true,
                    "canStream": true,
                    "canRemoteControl": false,
                    "supportedTypes": ["file", "clipboard", "notification"]
                })
            });
            Ok(json!({
                "name": get_s("name", &format!("DEX Device at {}", ip)),
                "type": get_s("type", "dex-client"),
                "platform": get_s("platform", "unknown"),
                "hostname": get_s("hostname", ip),
                "capabilities": caps
            }))
        }
        // Unparseable response: minimal info, like Electron's catch branch.
        Err(_) => Ok(json!({ "name": format!("Device at {}", ip), "type": "unknown" })),
    }
}

// device:addManual -> register a device via real network handshake.
// Returns { success, device? } | { success:false, error }.
fn add_manual(app: &tauri::AppHandle, args: &Value) -> Value {
    let ip = match args.get(0).and_then(|v| v.as_str()) {
        Some(ip) if !ip.is_empty() => ip.to_string(),
        _ => return json!({ "success": false, "error": "ip required" }),
    };
    let port: u16 = match args.get(1) {
        Some(v) => v.as_u64().map(|p| p as u16).unwrap_or(DISCOVERY_PORT as u16),
        None => DISCOVERY_PORT as u16,
    };

    let info = match perform_handshake(app, &ip, port) {
        Ok(info) => info,
        Err(e) => return json!({ "success": false, "error": e }),
    };

    let take_str = |k: &str, d: String| {
        info.get(k)
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or(d)
    };
    let capabilities = info.get("capabilities").cloned().unwrap_or_else(|| {
        json!({
            "canSendFiles": true,
            "canReceiveFiles": true,
            "canStream": false,
            "canRemoteControl": false,
            "supportedTypes": ["file"]
        })
    });

    let device = json!({
        "id": format!("manual_{}", now_ms()),
        "name": take_str("name", format!("Device at {}", ip)),
        "type": take_str("type", "unknown".to_string()),
        "platform": take_str("platform", "unknown".to_string()),
        "hostname": take_str("hostname", ip.clone()),
        "ip": ip,
        "port": port as i64,
        "capabilities": capabilities,
        "status": "online",
        "lastSeen": now_ms(),
        "trusted": false,
        "paired": false
    });

    let mut devices = read_devices(app);

    // Dedup by ip+port: update existing, keep its id (Object.assign parity).
    let dev_ip = device.get("ip").and_then(|v| v.as_str()).unwrap_or("");
    let dev_port = device.get("port").and_then(|v| v.as_i64()).unwrap_or(-1);
    if let Some(existing) = devices.iter_mut().find(|d| {
        d.get("ip").and_then(|v| v.as_str()) == Some(dev_ip)
            && d.get("port").and_then(|v| v.as_i64()) == Some(dev_port)
    }) {
        let kept_id = existing.get("id").cloned();
        if let (Some(exist_obj), Some(new_obj)) = (existing.as_object_mut(), device.as_object()) {
            for (k, v) in new_obj {
                exist_obj.insert(k.clone(), v.clone());
            }
            if let Some(id) = kept_id {
                exist_obj.insert("id".into(), id);
            }
        }
        let updated = existing.clone();
        write_devices(app, devices);
        return json!({ "success": true, "device": updated });
    }

    // New device: push, persist, notify renderer (webContents.send parity).
    devices.push(device.clone());
    write_devices(app, devices);
    crate::native_ops::emit_event(app, "device:discovered", &device);

    json!({ "success": true, "device": device })
}

/// Route a `device:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Ported here: the data getters (getThisDevice,
/// getAll, getTrusted, getOnline), the file-backed mutations (setName, remove,
/// setTrusted) and addManual (real TCP handshake + renderer `device:discovered`
/// emit). NOT ported (return Value::Null): UDP discovery toggle/broadcast and
/// the pairing/session lifecycle — so this dispatch is still NOT a safe
/// catch-all for the whole `device:` prefix.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // Read-only data getters.
        "device:getThisDevice" => get_this_device(app),
        "device:getAll" => get_all(app),
        "device:getTrusted" => get_trusted(app),
        "device:getOnline" => get_online(app),

        // Mutations (real, file-backed; same return shapes as Electron).
        "device:setName" => set_name(app, args),
        "device:remove" => remove(app, args),
        "device:setTrusted" => set_trusted(app, args),

        // Registration via a real TCP handshake probe.
        "device:addManual" => add_manual(app, args),

        _ => Value::Null,
    }
}

// =============================================================================
// DEX Tauri — Connectors subsystem (port of the `connectors:*` IPC handlers in
// WorkflowController.ts, which delegate to ExternalConnectors).
//
// Pure-data, fs-JSON tier. Electron persisted connectors with plain std fs (NOT
// electron-store) to `<userData>/dex-connectors.json` with the shape:
//   { "version": 1, "connectors": [ ConnectorConfig, ... ] }
// This mirrors that file name and shape under <appData> exactly. The renderer is
// unchanged.
//
// A ConnectorConfig (the stored object) is:
//   { id, name, type, path, accessLevel, enabled, createdAt,
//     lastAccessed?, metadata? }
// getConnectorInfo() decorates a stored ConnectorConfig into a ConnectorInfo by
// spreading it and adding { status, available, error? }:
//   - available = path exists on disk
//   - status    = !enabled -> "disconnected"; enabled && !available -> "error"
//                 (error = "Path not accessible"); else "connected"
//   - error     = only present in the !available case (otherwise omitted)
//
// Channels & shapes (only the DATA/read surface is ported):
//   - list  (connectors:getAll) -> ConnectorInfo[]      (getConnectors)
//   - get   (connectors:get)    -> ConnectorInfo | null (getConnectorInfo; null
//                                  when the id is unknown)
//   - getStatus                 -> ConnectorInfo | null  (no literal Electron
//                                  channel existed; the per-connector status is
//                                  produced solely by getConnectorInfo, so this
//                                  routes through the same path — same shape, no
//                                  invented fields)
//
// DIVERGENCES (documented):
//   - getConnectors() preserves Map iteration (insertion) order in Electron;
//     reading the stored array here preserves file (insertion) order too, so the
//     order matches.
//   - getConnectorInfo()'s `available` uses fs.existsSync; we use
//     std::path::Path::exists() (same semantics: any existing path, file or dir).
//   - The HEAVY native-fs / mutating channels (add, remove, update, listFiles,
//     readFile, writeFile, copyToLocal, getLog) are NOW ported with real native
//     fs + the same persisted JSON store. add() generates an id with the EXACT
//     Electron format `conn_<epochMs>_<4 base36>` and persists the normalized
//     path; mutations rewrite { version:1, connectors:[...] } back to disk and
//     emit a `connectors:changed` renderer event (native equivalent of the
//     re-fetch the renderer does after a mutation in Electron).
//   - operationLog: Electron kept it in a per-process in-memory ring (max 100).
//     dispatch() here is stateless per call, so we persist the same ring to a
//     sibling file `dex-connectors-log.json` (capped at 100, newest-last) so
//     getLog stays meaningful across calls. Shape per entry is identical to
//     ConnectorOperation.
//   - addWithDialog needs a native OS folder picker bound to the focused window;
//     that is not wired in this dispatcher tier, so it honestly degrades
//     (success:false / not ported). connect/disconnect/configure/test have no
//     literal channels in this subsystem and fall through to Value::Null.
// =============================================================================

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const CONNECTORS_FILE: &str = "dex-connectors.json";
const LOG_FILE: &str = "dex-connectors-log.json";
const MAX_LOG_SIZE: usize = 100;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn app_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    app_dir(app).join(CONNECTORS_FILE)
}

fn log_path(app: &tauri::AppHandle) -> PathBuf {
    app_dir(app).join(LOG_FILE)
}

// loadConnectors(): reads { version, connectors: [...] }; missing/garbage -> [].
fn read_connectors(app: &tauri::AppHandle) -> Vec<Value> {
    match std::fs::read_to_string(store_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw)
            .ok()
            .and_then(|v| v.get("connectors").and_then(|c| c.as_array()).cloned())
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

// saveConnectors(): rewrite { version:1, connectors:[...] } (pretty, 2-space).
fn write_connectors(app: &tauri::AppHandle, connectors: &[Value]) {
    let data = json!({ "version": 1, "connectors": connectors });
    if let Ok(raw) = serde_json::to_string_pretty(&data) {
        let _ = std::fs::write(store_path(app), raw);
    }
    // Native equivalent of the renderer re-fetching after a mutation.
    crate::native_ops::emit_event(app, "connectors:changed", &Value::Null);
}

fn read_log(app: &tauri::AppHandle) -> Vec<Value> {
    match std::fs::read_to_string(log_path(app)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw)
            .ok()
            .and_then(|v| v.as_array().cloned())
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

// logOperation(): push a ConnectorOperation, cap at MAX_LOG_SIZE (newest-last).
fn log_op(
    app: &tauri::AppHandle,
    connector_id: &str,
    op_type: &str,
    op_path: &str,
    success: bool,
    error: Option<&str>,
) {
    let mut log = read_log(app);
    let mut entry = serde_json::Map::new();
    entry.insert("id".into(), json!(format!("op_{}_{}", now_ms(), &crate::util::pseudo_uuid_v4()[..4])));
    entry.insert("connectorId".into(), json!(connector_id));
    entry.insert("type".into(), json!(op_type));
    entry.insert("path".into(), json!(op_path));
    entry.insert("timestamp".into(), json!(now_ms()));
    entry.insert("success".into(), json!(success));
    if let Some(e) = error {
        entry.insert("error".into(), json!(e));
    }
    log.push(Value::Object(entry));
    if log.len() > MAX_LOG_SIZE {
        let start = log.len() - MAX_LOG_SIZE;
        log = log[start..].to_vec();
    }
    if let Ok(raw) = serde_json::to_string(&log) {
        let _ = std::fs::write(log_path(app), raw);
    }
}

fn id_of(c: &Value) -> Option<&str> {
    c.get("id").and_then(|v| v.as_str())
}

// getConnectorInfo(connector): spread stored config + { status, available, error? }.
fn connector_info(connector: &Value) -> Value {
    let mut out = connector.as_object().cloned().unwrap_or_default();

    let path = connector.get("path").and_then(|v| v.as_str()).unwrap_or("");
    let available = !path.is_empty() && Path::new(path).exists();
    let enabled = connector.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);

    // !enabled -> disconnected; enabled && !available -> error; else connected.
    if !enabled {
        out.insert("status".into(), json!("disconnected"));
    } else if !available {
        out.insert("status".into(), json!("error"));
    } else {
        out.insert("status".into(), json!("connected"));
    }

    out.insert("available".into(), json!(available));

    // `error` is only set in the !enabled-skipped, !available branch; Electron
    // leaves it `undefined` (omitted over IPC) in the other two branches.
    if enabled && !available {
        out.insert("error".into(), json!("Path not accessible"));
    }

    Value::Object(out)
}

// getConnectors(): map every stored connector through getConnectorInfo.
fn get_all(app: &tauri::AppHandle) -> Value {
    let infos: Vec<Value> = read_connectors(app).iter().map(connector_info).collect();
    json!(infos)
}

// getConnectorInfo(connectorId): null when the id is unknown.
fn get_one(app: &tauri::AppHandle, connector_id: &str) -> Value {
    match read_connectors(app)
        .iter()
        .find(|c| id_of(c) == Some(connector_id))
    {
        Some(c) => connector_info(c),
        None => Value::Null,
    }
}

fn find_index(connectors: &[Value], connector_id: &str) -> Option<usize> {
    connectors.iter().position(|c| id_of(c) == Some(connector_id))
}

fn field_str<'a>(c: &'a Value, key: &str) -> &'a str {
    c.get(key).and_then(|v| v.as_str()).unwrap_or("")
}

fn field_bool(c: &Value, key: &str) -> bool {
    c.get(key).and_then(|v| v.as_bool()).unwrap_or(false)
}

// path.normalize(): collapse `.`/`..` lexically (no fs touch, like Node's).
// On Windows Node uses `\` separators; we mirror that for parity with the
// stored Electron values.
fn normalize_path(input: &str) -> String {
    let win = cfg!(windows);
    // Detect a Windows drive/UNC or POSIX root prefix to preserve it.
    let bytes = input.as_bytes();
    let is_abs = input.starts_with('/')
        || input.starts_with('\\')
        || (bytes.len() >= 2 && bytes[1] == b':');
    let mut parts: Vec<String> = Vec::new();
    let mut prefix = String::new();
    let mut rest = input;
    if bytes.len() >= 2 && bytes[1] == b':' {
        prefix = input[..2].to_string();
        rest = &input[2..];
    }
    for seg in rest.split(|c| c == '/' || c == '\\') {
        match seg {
            "" | "." => {}
            ".." => {
                if parts.last().map(|s| s != "..").unwrap_or(false) {
                    parts.pop();
                } else if !is_abs {
                    parts.push("..".into());
                }
            }
            other => parts.push(other.to_string()),
        }
    }
    let sep = if win { "\\" } else { "/" };
    let joined = parts.join(sep);
    let root = if is_abs {
        if !prefix.is_empty() { format!("{}{}", prefix, sep) } else { sep.to_string() }
    } else {
        prefix
    };
    let out = format!("{}{}", root, joined);
    if out.is_empty() { ".".to_string() } else { out }
}

// path.join(base, sub) then verify it stays within base (startsWith check, the
// exact guard Electron used). Returns None on escape.
fn scoped_join(base: &str, sub: &str) -> Option<PathBuf> {
    let joined = if sub.is_empty() {
        PathBuf::from(base)
    } else {
        Path::new(base).join(sub)
    };
    let joined_s = joined.to_string_lossy().to_string();
    if joined_s.starts_with(base) {
        Some(joined)
    } else {
        None
    }
}

// addConnector(config): id = conn_<epochMs>_<4 base36>; normalize path; persist;
// return getConnectorInfo(id) (never null — we just inserted it).
fn add_connector(app: &tauri::AppHandle, config: &Value) -> Value {
    let suffix: String = crate::util::pseudo_uuid_v4()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(4)
        .collect();
    let id = format!("conn_{}_{}", now_ms(), suffix);

    let mut obj = config.as_object().cloned().unwrap_or_default();
    let normalized = normalize_path(field_str(config, "path"));
    obj.insert("id".into(), json!(id));
    obj.insert("createdAt".into(), json!(now_ms()));
    obj.insert("path".into(), json!(normalized));

    let mut connectors = read_connectors(app);
    connectors.push(Value::Object(obj));
    write_connectors(app, &connectors);

    get_one(app, &id)
}

// removeConnector(connectorId): true if it existed and was removed.
fn remove_connector(app: &tauri::AppHandle, connector_id: &str) -> Value {
    let mut connectors = read_connectors(app);
    match find_index(&connectors, connector_id) {
        Some(idx) => {
            connectors.remove(idx);
            write_connectors(app, &connectors);
            json!(true)
        }
        None => json!(false),
    }
}

// updateConnector(connectorId, updates): merge name/accessLevel/enabled; persist;
// return getConnectorInfo or null when unknown.
fn update_connector(app: &tauri::AppHandle, connector_id: &str, updates: &Value) -> Value {
    let mut connectors = read_connectors(app);
    let idx = match find_index(&connectors, connector_id) {
        Some(i) => i,
        None => return Value::Null,
    };
    if let (Some(target), Some(u)) =
        (connectors[idx].as_object_mut(), updates.as_object())
    {
        for key in ["name", "accessLevel", "enabled"] {
            if let Some(v) = u.get(key) {
                target.insert(key.into(), v.clone());
            }
        }
    }
    write_connectors(app, &connectors);
    get_one(app, connector_id)
}

// listFiles(connectorId, subPath): ConnectorFile[] | null. Scope-guarded.
fn list_files(app: &tauri::AppHandle, connector_id: &str, sub_path: &str) -> Value {
    let connectors = read_connectors(app);
    let connector = match connectors.iter().find(|c| id_of(c) == Some(connector_id)) {
        Some(c) if field_bool(c, "enabled") => c,
        _ => {
            log_op(app, connector_id, "list", sub_path, false, Some("Connector not available"));
            return Value::Null;
        }
    };
    let base = field_str(connector, "path");
    let full = match scoped_join(base, sub_path) {
        Some(p) => p,
        None => {
            log_op(app, connector_id, "list", sub_path, false, Some("Path outside connector scope"));
            return Value::Null;
        }
    };
    if !full.exists() {
        log_op(app, connector_id, "list", sub_path, false, Some("Path does not exist"));
        return Value::Null;
    }

    let read_dir = match std::fs::read_dir(&full) {
        Ok(r) => r,
        Err(e) => {
            log_op(app, connector_id, "list", sub_path, false, Some(&e.to_string()));
            return Value::Null;
        }
    };

    let mut files: Vec<Value> = Vec::new();
    for entry in read_dir.flatten() {
        let entry_path = entry.path();
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        let rel = entry_path
            .strip_prefix(base)
            .unwrap_or(&entry_path)
            .to_string_lossy()
            .to_string();
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as f64)
            .unwrap_or(0.0);
        files.push(json!({
            "name": name,
            "path": entry_path.to_string_lossy(),
            "relativePath": rel,
            "connectorId": connector_id,
            "size": meta.len(),
            "isDirectory": meta.is_dir(),
            "modified": modified,
        }));
    }

    touch_last_accessed(app, connector_id);
    log_op(app, connector_id, "list", sub_path, true, None);
    json!(files)
}

// readFile(connectorId, relativePath) -> Buffer | null; the IPC layer base64s it.
// We return the base64 string (or null) directly, matching the Electron handler.
fn read_file_b64(app: &tauri::AppHandle, connector_id: &str, relative_path: &str) -> Value {
    let connectors = read_connectors(app);
    let connector = match connectors.iter().find(|c| id_of(c) == Some(connector_id)) {
        Some(c) if field_bool(c, "enabled") => c,
        _ => {
            log_op(app, connector_id, "read", relative_path, false, Some("Connector not available"));
            return Value::Null;
        }
    };
    let base = field_str(connector, "path");
    let full = match scoped_join(base, relative_path) {
        Some(p) => p,
        None => {
            log_op(app, connector_id, "read", relative_path, false, Some("Path outside connector scope"));
            return Value::Null;
        }
    };
    if !full.exists() {
        log_op(app, connector_id, "read", relative_path, false, Some("File does not exist"));
        return Value::Null;
    }
    match std::fs::read(&full) {
        Ok(bytes) => {
            touch_last_accessed(app, connector_id);
            log_op(app, connector_id, "read", relative_path, true, None);
            json!(b64_encode(&bytes))
        }
        Err(e) => {
            log_op(app, connector_id, "read", relative_path, false, Some(&e.to_string()));
            Value::Null
        }
    }
}

// writeFile(connectorId, relativePath, base64Content) -> bool. RW only.
fn write_file_b64(app: &tauri::AppHandle, connector_id: &str, relative_path: &str, content_b64: &str) -> Value {
    let connectors = read_connectors(app);
    let connector = match connectors.iter().find(|c| id_of(c) == Some(connector_id)) {
        Some(c) if field_bool(c, "enabled") => c,
        _ => {
            log_op(app, connector_id, "write", relative_path, false, Some("Connector not available"));
            return json!(false);
        }
    };
    if field_str(connector, "accessLevel") != "read-write" {
        log_op(app, connector_id, "write", relative_path, false, Some("Connector is read-only"));
        return json!(false);
    }
    let base = field_str(connector, "path");
    let full = match scoped_join(base, relative_path) {
        Some(p) => p,
        None => {
            log_op(app, connector_id, "write", relative_path, false, Some("Path outside connector scope"));
            return json!(false);
        }
    };
    let bytes = match b64_decode(content_b64) {
        Some(b) => b,
        None => {
            log_op(app, connector_id, "write", relative_path, false, Some("Invalid base64 content"));
            return json!(false);
        }
    };
    if let Some(dir) = full.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    match std::fs::write(&full, &bytes) {
        Ok(_) => {
            touch_last_accessed(app, connector_id);
            log_op(app, connector_id, "write", relative_path, true, None);
            json!(true)
        }
        Err(e) => {
            log_op(app, connector_id, "write", relative_path, false, Some(&e.to_string()));
            json!(false)
        }
    }
}

// copyToLocal(connectorId, relativePath, localPath) -> bool. readFile then write.
fn copy_to_local(app: &tauri::AppHandle, connector_id: &str, relative_path: &str, local_path: &str) -> Value {
    // Re-derive the bytes through the same scoped/enabled checks readFile uses.
    let connectors = read_connectors(app);
    let connector = match connectors.iter().find(|c| id_of(c) == Some(connector_id)) {
        Some(c) if field_bool(c, "enabled") => c,
        _ => {
            log_op(app, connector_id, "read", relative_path, false, Some("Connector not available"));
            return json!(false);
        }
    };
    let base = field_str(connector, "path");
    let full = match scoped_join(base, relative_path) {
        Some(p) => p,
        None => {
            log_op(app, connector_id, "read", relative_path, false, Some("Path outside connector scope"));
            return json!(false);
        }
    };
    if !full.exists() {
        log_op(app, connector_id, "read", relative_path, false, Some("File does not exist"));
        return json!(false);
    }
    let bytes = match std::fs::read(&full) {
        Ok(b) => {
            touch_last_accessed(app, connector_id);
            log_op(app, connector_id, "read", relative_path, true, None);
            b
        }
        Err(e) => {
            log_op(app, connector_id, "read", relative_path, false, Some(&e.to_string()));
            return json!(false);
        }
    };
    let dest = PathBuf::from(local_path);
    if let Some(dir) = dest.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    match std::fs::write(&dest, &bytes) {
        Ok(_) => {
            log_op(app, connector_id, "copy", relative_path, true, None);
            json!(true)
        }
        Err(_) => json!(false),
    }
}

// connector.lastAccessed = Date.now() then re-persist (Electron mutated the Map
// entry; we rewrite the file entry to keep parity).
fn touch_last_accessed(app: &tauri::AppHandle, connector_id: &str) {
    let mut connectors = read_connectors(app);
    if let Some(idx) = find_index(&connectors, connector_id) {
        if let Some(obj) = connectors[idx].as_object_mut() {
            obj.insert("lastAccessed".into(), json!(now_ms()));
        }
        let data = json!({ "version": 1, "connectors": connectors });
        if let Ok(raw) = serde_json::to_string_pretty(&data) {
            let _ = std::fs::write(store_path(app), raw);
        }
    }
}

// --- Minimal base64 (std-only; the IPC contract is base64 strings) ----------
const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn b64_encode(input: &[u8]) -> String {
    let mut out = String::with_capacity((input.len() + 2) / 3 * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(B64[((n >> 18) & 63) as usize] as char);
        out.push(B64[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { B64[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[(n & 63) as usize] as char } else { '=' });
    }
    out
}

fn b64_decode(input: &str) -> Option<Vec<u8>> {
    let mut table = [255u8; 256];
    for (i, &c) in B64.iter().enumerate() {
        table[c as usize] = i as u8;
    }
    let cleaned: Vec<u8> = input.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    let mut out = Vec::with_capacity(cleaned.len() / 4 * 3);
    for chunk in cleaned.chunks(4) {
        let mut vals = [0u8; 4];
        let mut pads = 0;
        for (i, &c) in chunk.iter().enumerate() {
            if c == b'=' {
                pads += 1;
                vals[i] = 0;
            } else {
                let v = table[c as usize];
                if v == 255 {
                    return None;
                }
                vals[i] = v;
            }
        }
        let n = ((vals[0] as u32) << 18)
            | ((vals[1] as u32) << 12)
            | ((vals[2] as u32) << 6)
            | (vals[3] as u32);
        out.push((n >> 16) as u8);
        if chunk.len() > 2 && pads < 2 {
            out.push((n >> 8) as u8);
        }
        if chunk.len() > 3 && pads < 1 {
            out.push(n as u8);
        }
    }
    Some(out)
}

/// Route a `connectors:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). The data/read channels plus the heavy
/// native-fs / mutating channels are handled with real implementations; only
/// addWithDialog (needs a native window-bound folder picker) degrades honestly,
/// and unrelated channels fall through to Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let arg_str = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    match channel {
        "connectors:getAll" => get_all(app),
        "connectors:get" => get_one(app, &arg_str(0)),
        "connectors:getStatus" => get_one(app, &arg_str(0)),

        "connectors:add" => {
            let config = args.get(0).cloned().unwrap_or(Value::Null);
            if config.is_object() {
                add_connector(app, &config)
            } else {
                Value::Null
            }
        }
        "connectors:remove" => remove_connector(app, &arg_str(0)),
        "connectors:update" => {
            let updates = args.get(1).cloned().unwrap_or(Value::Null);
            update_connector(app, &arg_str(0), &updates)
        }
        "connectors:listFiles" => list_files(app, &arg_str(0), &arg_str(1)),
        "connectors:readFile" => read_file_b64(app, &arg_str(0), &arg_str(1)),
        "connectors:writeFile" => write_file_b64(app, &arg_str(0), &arg_str(1), &arg_str(2)),
        "connectors:copyToLocal" => copy_to_local(app, &arg_str(0), &arg_str(1), &arg_str(2)),
        "connectors:getLog" => json!(read_log(app)),

        // Needs a native OS folder picker bound to the focused window, which is
        // not wired into this dispatcher tier. Electron returned `null` on
        // cancel; we return null (no connector added) rather than faking a pick.
        "connectors:addWithDialog" => Value::Null,

        _ => Value::Null,
    }
}

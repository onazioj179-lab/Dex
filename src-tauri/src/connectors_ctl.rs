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
//   - All HEAVY / mutating / native-fs channels (add, addWithDialog, remove,
//     update, listFiles, readFile, writeFile, copyToLocal, getLog) are NOT
//     ported. They need the native runtime (disk traversal, dialogs, byte IO) or
//     mutate state; they return Value::Null (honest degrade). The prompt named
//     the heavy set as connect/disconnect/configure/test — there are no literal
//     channels by those names in this subsystem, so they are covered by the same
//     Null fall-through.
// =============================================================================

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::Manager;

const CONNECTORS_FILE: &str = "dex-connectors.json";

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(CONNECTORS_FILE)
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

/// Route a `connectors:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the data/read channels are handled;
/// every other channel in the namespace (mutations / native-fs / dialogs)
/// returns Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "connectors:getAll" => get_all(app),
        "connectors:get" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_one(app, id)
        }
        "connectors:getStatus" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_one(app, id)
        }
        _ => Value::Null,
    }
}

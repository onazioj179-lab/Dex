// =============================================================================
// DEX Tauri — Extensions subsystem (port of the read/data IPC handlers in
// src/main/core/ExtensionFramework.ts).
//
// Pure-data, JSON-backed tier (same pattern as analytics.rs). Electron used a
// single `electron-store` named `dex-extensions` under userData; this mirrors
// that file verbatim under <appData>:
//   - dex-extensions.json : {
//       extensions:          { [id]: InstalledExtension },
//       grantedPermissions:  { [id]: ExtensionPermission[] },
//       enabled:             bool   // master switch, default true
//     }
// Return shapes match the Electron handlers exactly so the renderer is
// unchanged. Only the READ surface is ported here; the framework is described in
// the source as "a foundation for future extensibility, not actively shipped",
// so its mutating/runtime handlers stay native-only (see SKIPPED below).
//
// Channels & shapes:
//   - list  (extensions:getAll)    -> ExtensionStatus[]
//   - get   (extensions:getStatus) -> ExtensionStatus | null
//   - getStatus (extensions:getStatus) -> ExtensionStatus | null  (alias)
// Plus the pure-read master switch that lives in the same namespace:
//   - extensions:isEnabled         -> bool   (so prefix routing is total)
//
// ExtensionStatus is:
//   { id, name, version, enabled, verified, permissions: string[],
//     permissionsGranted: bool }
// where the first six fields come from InstalledExtension.manifest / flags and
// permissionsGranted is `(grantedPermissions[id] ?? []).length > 0`.
//
// DIVERGENCES (documented):
//   - Object.values(extensions) iteration order: Electron relied on JS object
//     insertion order. serde_json preserves object key order only with the
//     `preserve_order` feature; absent that, getAll's array order may differ
//     from Electron's. The set of entries and every field value is identical —
//     only ordering can vary. getStatus is keyed by id and unaffected.
//   - The heavy/mutating handlers (install via DeveloperPlatform, uninstall,
//     enable, disable, execute, enable/disableSystem, grant/revokePermissions)
//     are NOT ported: they drive sandbox dirs, the live loadedExtensions map,
//     and native execution. They are omitted; the prefix route returns
//     Value::Null for them (honest degrade) rather than a faked success.
// =============================================================================

use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "dex-extensions.json";

// --- file IO (mirrors analytics.rs) -----------------------------------------

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

// --- store accessors --------------------------------------------------------

fn extensions_map(app: &tauri::AppHandle) -> Map<String, Value> {
    read_file(app, STORE_FILE)
        .get("extensions")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

fn granted_map(app: &tauri::AppHandle) -> Map<String, Value> {
    read_file(app, STORE_FILE)
        .get("grantedPermissions")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default()
}

// `enabled` defaults to true (store default), matching the electron-store schema.
fn is_enabled(app: &tauri::AppHandle) -> bool {
    read_file(app, STORE_FILE)
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true)
}

// `(grantedPermissions[id] ?? []).length > 0`.
fn permissions_granted(granted: &Map<String, Value>, id: &str) -> bool {
    granted
        .get(id)
        .and_then(|v| v.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false)
}

// Build an ExtensionStatus from an InstalledExtension entry + granted map.
// Mirrors the object literal returned by getAllExtensions/getExtensionStatus.
fn to_status(ext: &Value, granted: &Map<String, Value>) -> Value {
    let manifest = ext.get("manifest").cloned().unwrap_or(Value::Null);
    let mstr = |k: &str| manifest.get(k).cloned().unwrap_or(Value::Null);
    // Electron reads ext.manifest.id for the granted lookup (not the map key).
    let id = manifest.get("id").and_then(|v| v.as_str()).unwrap_or("");
    json!({
        "id": mstr("id"),
        "name": mstr("name"),
        "version": mstr("version"),
        "enabled": ext.get("enabled").cloned().unwrap_or(Value::Null),
        "verified": ext.get("verified").cloned().unwrap_or(Value::Null),
        "permissions": manifest.get("permissions").cloned().unwrap_or_else(|| json!([])),
        "permissionsGranted": permissions_granted(granted, id),
    })
}

// getAllExtensions(): Object.values(extensions).map(toStatus).
fn get_all(app: &tauri::AppHandle) -> Value {
    let extensions = extensions_map(app);
    let granted = granted_map(app);
    let list: Vec<Value> = extensions
        .values()
        .map(|ext| to_status(ext, &granted))
        .collect();
    Value::Array(list)
}

// getExtensionStatus(id): extensions[id] -> ExtensionStatus | null.
fn get_status(app: &tauri::AppHandle, id: &str) -> Value {
    let extensions = extensions_map(app);
    match extensions.get(id) {
        Some(ext) => to_status(ext, &granted_map(app)),
        None => Value::Null,
    }
}

/// Route an `extensions:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// handled: the ported read channels return their shaped value; the heavy /
/// mutating ones return Value::Null (honest degrade, not a faked success).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "extensions:getAll" => get_all(app),
        "extensions:getStatus" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_status(app, id)
        }
        "extensions:isEnabled" => json!(is_enabled(app)),
        _ => Value::Null,
    }
}

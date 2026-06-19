// =============================================================================
// DEX Tauri — Data Export subsystem (port of the read-only `export:*` query
// handlers in controllers/DataExportController.ts).
//
// Pure-data, JSON-backed tier. The Electron controller read its counts straight
// off the two raw electron-store files under userData (dex-data.json and
// dex-sessions.json — NOT via DataStore-KV); this mirrors that exactly by
// reading the SAME file names under <appData> (the Tauri analog of userData).
// Return shapes match the Electron handlers field-for-field so the renderer
// (preload exposes getSummary / getLocations) is unchanged.
//
// PORTED (read-only data channels):
//   - export:getSummary   -> DataSummary
//       { actions, modes, rules, sessions, operations: number,
//         totalSize: string, encryptedItems: number, lastModified: number }
//   - export:getLocations -> Record<string,string>
//       { userData, mainData, sessions, encryption, permissions, logs, backups }
//
// SKIPPED (heavy / need native runtime — NOT implemented, NOT faked):
//   - export:data           save dialog + write export file (+ optional AES-GCM)
//   - export:dataToPath     PathValidator + arbitrary fs write (+ encryption)
//   - export:import         open dialog + merge into the live data store
//   - export:importFromPath PathValidator + decrypt prompt + merge/write
//   - export:openDataFolder shell.openPath side-effect
//   These all require dialogs, the EncryptionService, PathValidator, and/or
//   shell — none of which exist in this pure-data tier — so the prefix route
//   returns Value::Null for them (honest degrade).
//
// DIVERGENCES (documented):
//   - lastModified: Electron used fs.statSync(...).mtimeMs (file modify time).
//     std::fs Metadata::modified() gives the same instant; we convert to epoch
//     millis (f64, matching the JS number). If mtime is unavailable the field
//     stays 0, exactly as the Electron try/catch default.
//   - totalSize: byte->string formatting reproduces the Electron thresholds
//     exactly: `<1024` -> "{n} B"; `<1MiB` -> "{round(n/1024)} KB";
//     else -> "{(n/1MiB) with 1 decimal} MB" (toFixed(1)).
//   - encryptedItems: the Electron summary never populated this; it is always 0.
//     Mirrored verbatim (constant 0).
//   - getLocations: Electron returned absolute paths under app.getPath('userData')
//     and a sibling `logs` / `backups` directory. We root every path at
//     app_data_dir() (the Tauri analog) using the SAME relative file names.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const MAIN_DATA_FILE: &str = "dex-data.json";
const SESSIONS_FILE: &str = "dex-sessions.json";

// userData analog: app_data_dir(). Created on demand so reads of a fresh
// profile behave like Electron's "file does not exist yet" path.
fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn read_json(path: &PathBuf) -> Option<Value> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str::<Value>(&raw).ok()
}

// Length of an array field on an object, mirroring `data.x?.length ?? 0`.
fn arr_len(v: &Value, key: &str) -> i64 {
    v.get(key).and_then(|x| x.as_array()).map(|a| a.len() as i64).unwrap_or(0)
}

// fs Metadata::modified() -> epoch millis as f64 (mirrors statSync().mtimeMs).
fn mtime_ms(meta: &std::fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

// Reproduce the Electron byte->human string formatting exactly.
fn format_size(total_bytes: u64) -> String {
    if total_bytes < 1024 {
        format!("{} B", total_bytes)
    } else if total_bytes < 1024 * 1024 {
        // Math.round(totalBytes / 1024)
        let kb = (total_bytes as f64 / 1024.0).round() as i64;
        format!("{} KB", kb)
    } else {
        // (totalBytes / 1024 / 1024).toFixed(1)
        let mb = total_bytes as f64 / 1024.0 / 1024.0;
        format!("{:.1} MB", mb)
    }
}

// getDataSummary(): counts off the raw data/sessions files + total size + mtime.
fn get_summary(app: &tauri::AppHandle) -> Value {
    let dir = data_dir(app);
    let mut total_bytes: u64 = 0;
    let mut last_modified: f64 = 0.0;
    let mut actions = 0i64;
    let mut modes = 0i64;
    let mut rules = 0i64;
    let mut operations = 0i64;
    let mut sessions = 0i64;

    // Main data
    let data_path = dir.join(MAIN_DATA_FILE);
    if let Ok(meta) = std::fs::metadata(&data_path) {
        total_bytes += meta.len();
        last_modified = last_modified.max(mtime_ms(&meta));
        if let Some(data) = read_json(&data_path) {
            actions = arr_len(&data, "actions");
            modes = arr_len(&data, "modes");
            rules = arr_len(&data, "rules");
            operations = arr_len(&data, "operations");
        }
    }

    // Sessions
    let sessions_path = dir.join(SESSIONS_FILE);
    if let Ok(meta) = std::fs::metadata(&sessions_path) {
        total_bytes += meta.len();
        last_modified = last_modified.max(mtime_ms(&meta));
        if let Some(data) = read_json(&sessions_path) {
            sessions = arr_len(&data, "sessions");
        }
    }

    json!({
        "actions": actions,
        "modes": modes,
        "rules": rules,
        "sessions": sessions,
        "operations": operations,
        "totalSize": format_size(total_bytes),
        "encryptedItems": 0,
        "lastModified": last_modified,
    })
}

// getDataLocations(): string map of canonical storage paths under userData.
fn get_locations(app: &tauri::AppHandle) -> Value {
    let dir = data_dir(app);
    let p = |name: &str| dir.join(name).to_string_lossy().to_string();
    json!({
        "userData": dir.to_string_lossy().to_string(),
        "mainData": p(MAIN_DATA_FILE),
        "sessions": p(SESSIONS_FILE),
        "encryption": p("dex-encryption.json"),
        "permissions": p("dex-permissions.json"),
        "logs": p("logs"),
        "backups": p("backups"),
    })
}

/// Route an `export:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the read-only data channels are handled; the
/// heavy channels (export/import/openDataFolder) and any unknown channel return
/// Value::Null (honest degrade — they need the native runtime).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "export:getSummary" => get_summary(app),
        "export:getLocations" => get_locations(app),
        _ => Value::Null,
    }
}

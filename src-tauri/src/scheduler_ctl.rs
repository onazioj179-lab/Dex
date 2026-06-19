// =============================================================================
// DEX Tauri — Scheduler subsystem (port of the data/read surface of
// SchedulerController.ts).
//
// Pure-data, JSON-backed tier (same pattern as analytics.rs). Electron used a
// single `electron-store` named `dex-scheduler` under userData; this mirrors that
// file verbatim under <appData>:
//   - dex-scheduler.json : {
//         triggers:     { "<id>": ScheduledTrigger, ... }   // a keyed map
//         executionLog: TriggerExecutionLog[]
//         settings:     { enabled, maxLogEntries, defaultCooldown }
//     }
// Only the read/data channels are ported. Return shapes match the Electron
// handlers exactly so the renderer is unchanged.
//
// Channels & shapes:
//   - scheduler:get-triggers -> ScheduledTrigger[]   (Object.values of the
//     `triggers` map; [] when the store / key is unset). Insertion order of a
//     plain JS object is preserved by serde_json's "preserve_order"-shaped Map
//     here we read it back as-stored, mirroring V8 object key order for the
//     string (non-integer) ids the creator emits (`trigger-<ts>-<rand>`).
//
// DIVERGENCES (documented):
//   - `scheduler:get-all` was requested for porting but has NO corresponding
//     Electron IPC handler in SchedulerController.ts (the only read-all channel
//     is `scheduler:get-triggers`). Inventing a shape for it would violate the
//     "never invent fields" rule, so it is intentionally NOT implemented; the
//     prefix route returns Value::Null for it (honest degrade). See
//     channelsSkipped.
//   - The heavy CRUD/runtime channels (create-trigger, delete-trigger,
//     execute-trigger, and the live timer/watcher engine) require a native
//     runtime (setTimeout/setInterval, fs.watch, powerMonitor, BrowserWindow
//     IPC) and are NOT ported here; the prefix route returns Value::Null for
//     them.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "dex-scheduler.json";

// --- file IO (identical helpers to analytics.rs) ----------------------------

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

// --- read surface -----------------------------------------------------------

// scheduler:get-triggers -> Object.values(schedulerStore.get('triggers'))
fn get_triggers(app: &tauri::AppHandle) -> Value {
    let triggers = read_file(app, STORE_FILE)
        .get("triggers")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let values: Vec<Value> = triggers.into_iter().map(|(_, v)| v).collect();
    json!(values)
}

/// Route a `scheduler:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the read/data surface is handled;
/// every other channel in the namespace (heavy CRUD/runtime, and the unsourced
/// get-all) returns Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "scheduler:get-triggers" => get_triggers(app),
        _ => Value::Null,
    }
}

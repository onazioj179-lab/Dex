// =============================================================================
// DEX Tauri - Maintenance subsystem (port of the `maintenance:*` data surface
// of src/main/controllers/FeatureFlagsController.ts).
//
// Pure-data, electron-store-JSON tier. The Electron controller created an
// UNNAMED `electron-store` (`new Store({ defaults: {...} })`), which electron-
// store materializes as `config.json` at the ROOT of userData. The maintenance
// state lives under that store's top-level `maintenance` key, defaulting to
// `{ enabled: false, disabledFeatures: [] }`. We mirror the SAME file name
// (config.json under <appData>) and the SAME top-level key wrapper so the
// renderer is unchanged.
//
// Channels & shapes:
//   - maintenance:getState -> MaintenanceState
//         { enabled: boolean,
//           reason?: string,            // present only once enable() set it
//           startedAt?: string,         // ISO string, present only after enable()
//           scheduledEnd?: string,      // present only after enable()
//           disabledFeatures: string[] }
//     On a fresh store this is exactly `{ enabled: false, disabledFeatures: [] }`
//     (the electron-store default), with no reason/startedAt/scheduledEnd keys -
//     matching what `store.get('maintenance')` returns before any enable().
//
// HEAVY channels intentionally NOT ported (mutating, runtime side-effects that
// flip live feature gating; not a pure-data read):
//   - maintenance:enable, maintenance:disable
// Both are omitted; the prefix route returns Value::Null for them. They are
// listed in channelsSkipped. Since enable/disable are fire-and-act calls whose
// renderer use does not depend on a shaped object, returning null (no-op) is the
// honest degrade rather than fabricating a `{ success }` result.
//
// DIVERGENCES (documented):
//   - File name: the Electron Store had no explicit `name`, so its on-disk file
//     is the electron-store default `config.json`. This same file also backs
//     featureFlags / apiVersion / lastMigration; we touch ONLY the `maintenance`
//     key and never rewrite the file (getState is read-only), so no other key is
//     disturbed.
//   - If config.json is absent or the `maintenance` key is unset, we return the
//     electron-store default `{ enabled: false, disabledFeatures: [] }` verbatim
//     rather than null, mirroring electron-store's defaults behavior.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "config.json";
const MAINTENANCE_KEY: &str = "maintenance";

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

// electron-store default for the `maintenance` key.
fn default_state() -> Value {
    json!({ "enabled": false, "disabledFeatures": [] })
}

// store.get('maintenance') -> MaintenanceState. Returns the persisted object if
// present; otherwise the electron-store default.
fn get_state(app: &tauri::AppHandle) -> Value {
    match read_store(app).get(MAINTENANCE_KEY) {
        Some(v) if v.is_object() => v.clone(),
        _ => default_state(),
    }
}

/// Route a `maintenance:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// accounted for; the ported data channel returns its shaped value and the heavy
/// (mutating) channels return Value::Null (honest no-op degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "maintenance:getState" => get_state(app),
        // Heavy / mutating - not ported (need live feature-gating runtime).
        "maintenance:enable" | "maintenance:disable" => Value::Null,
        _ => Value::Null,
    }
}

// =============================================================================
// DEX Tauri — System Advisory subsystem (port of the data surface of
// core/SystemAdvisoryService.ts).
//
// Pure-data, JSON-backed tier (same precedent as analytics.rs). Electron used a
// single `electron-store` named `system-advisory` (-> `system-advisory.json`
// under userData) holding four top-level keys: { config, activeAdvisories,
// dismissedIds, stats }. This mirrors the file name and the `config` wrapper
// exactly so the renderer is unchanged; ONLY the read-only `getConfig` data
// channel is ported.
//
// electron-store semantics: a store opened with `defaults` returns the default
// value for any key that has never been written. So on a cold/partial store,
// `advisoryStore.get('config')` yields the full default AdvisoryConfig, and on a
// populated store it yields whatever was persisted. We reproduce both: read the
// file's `config` object if present, otherwise return the documented defaults,
// and fill any missing field from the defaults so the shape is always complete
// (matches electron-store, which merges defaults at the key granularity).
//
// PORTED:
//   - advisory:getConfig -> AdvisoryConfig (exact field names/types below)
//
// AdvisoryConfig shape (from the TS interface, field order preserved):
//   { enabled, showPerformance, showMemory, showBattery, showStorage,
//     showMaintenance, showUsagePatterns, showFeatureTips, maxActiveAdvisories,
//     quietHoursStart: number|null, quietHoursEnd: number|null,
//     minPriority: 'low'|'medium'|'high' }
//
// SKIPPED (heavy / live-runtime side effects, NOT faked):
//   - advisory:getActive   : reads + mutates activeAdvisories (cleanExpired)
//                            and is driven by the live suggest() pipeline.
//   - advisory:dismiss      : mutates active/dismissed lists + stats.
//   - advisory:act          : runs registered native action handlers, then
//                            dismiss; depends on the in-process engine.
//   - advisory:updateConfig : mutates config; coupled to the live service.
//   These return Value::Null (prefix route -> null) per the brief.
//
// DIVERGENCES (documented):
//   - Only getConfig is implemented; the four write/active channels are skipped
//     on purpose (they need the native runtime / live engine), so dispatch is a
//     read-only slice of the namespace. prefixRouteSafe is still true: every
//     advisory:* channel is handled here, skipped ones returning Value::Null.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "system-advisory.json";

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

// electron-store `config` defaults (verbatim from the TS store `defaults`).
fn default_config() -> Value {
    json!({
        "enabled": true,
        "showPerformance": true,
        "showMemory": true,
        "showBattery": true,
        "showStorage": true,
        "showMaintenance": true,
        "showUsagePatterns": false,
        "showFeatureTips": true,
        "maxActiveAdvisories": 3,
        "quietHoursStart": Value::Null,
        "quietHoursEnd": Value::Null,
        "minPriority": "low"
    })
}

// advisoryStore.get('config') — persisted config if present, else defaults.
// Missing individual fields fall back to their default (electron-store merges
// defaults per top-level key; we keep the returned object shape complete).
fn get_config(app: &tauri::AppHandle) -> Value {
    let defaults = default_config();
    let stored = read_file(app, STORE_FILE);
    let cfg = stored.get("config");
    match cfg.and_then(|v| v.as_object()) {
        Some(obj) => {
            let mut out = defaults.as_object().cloned().unwrap_or_default();
            for (k, v) in obj {
                out.insert(k.clone(), v.clone());
            }
            Value::Object(out)
        }
        None => defaults,
    }
}

/// Route an `advisory:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// handled; the heavy (live-runtime) channels return Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "advisory:getConfig" => get_config(app),
        // Heavy / live-runtime channels — not ported, honest null degrade.
        "advisory:getActive"
        | "advisory:dismiss"
        | "advisory:act"
        | "advisory:updateConfig" => Value::Null,
        _ => Value::Null,
    }
}

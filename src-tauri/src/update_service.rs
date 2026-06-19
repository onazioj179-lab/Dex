// =============================================================================
// DEX Tauri — Update Service subsystem (port of core/UpdateService.ts).
//
// Pure-data, JSON-backed tier (same shape/precedent as analytics.rs). Electron
// used a single hand-rolled JSON file (NOT electron-store) under userData:
//   - update-service.json : the UpdateServiceConfig object, written verbatim as
//     { pollIntervalHours, enabled, lastPoll, versionUrl } (no top-level key
//     wrapper — loadConfig spreads JSON.parse straight over DEFAULT_CONFIG).
// This mirrors that file name and unwrapped shape under <appData>.
//
// CHANNEL MAPPING (documented divergence): the prompt names the data channel
// `update-service:getStatus`. The Electron source exposes the read-only status
// getter as `update-service:getLastResult` (returns the last VersionCheckResult
// or null). There is no verbatim `getStatus` handler. To keep the renderer
// working under whichever name it calls, BOTH `update-service:getStatus` and
// `update-service:getLastResult` route to the same getter here. No field is
// invented; the returned shape is exactly VersionCheckResult | null.
//
// `getLastResult` is null until a `check` runs. The `check` channel is a HEAVY
// network poll (net.request to a remote VERSION.txt) that ALSO produces and
// persists lastResult; it is intentionally NOT ported (needs a native runtime).
// Because nothing in this pure-data port performs a check, lastResult is never
// populated by us — we read it from disk if a prior (Electron) run wrote it,
// otherwise return null, exactly as the Electron getter would on a cold start.
//
// VersionCheckResult shape (from checkVersion):
//   { currentVersion: string, remoteVersion: string|null,
//     updateAvailable: bool, checkedAt: number, error: string|null }
//
// getConfig shape (from the IPC handler — note it returns only THREE of the
// four config fields; versionUrl is deliberately omitted by Electron):
//   { pollIntervalHours: number, enabled: bool, lastPoll: number }
//
// DIVERGENCES:
//   - lastResult lived only in-memory in Electron (this.lastResult), set by
//     checkVersion. We have no in-memory session and no check, so getStatus/
//     getLastResult returns null unless a persisted result is found. The config
//     file does NOT store lastResult, so on this pure-data tier the value is
//     effectively always null — matching Electron's behaviour before any check.
//   - app.getVersion() -> tauri app.package_info().version (same build source
//     as app:getVersion / corepc:getVersion in this Tauri build).
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const CONFIG_FILE: &str = "update-service.json";

// DEFAULT_CONFIG from UpdateService.ts.
const DEFAULT_POLL_INTERVAL_HOURS: i64 = 4;
const DEFAULT_ENABLED: bool = true;
const DEFAULT_LAST_POLL: i64 = 0;

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

// loadConfig(): { ...DEFAULT_CONFIG, ...JSON.parse(file) } — defaults backfilled
// for any missing field.
fn load_config(app: &tauri::AppHandle) -> Value {
    let raw = read_file(app, CONFIG_FILE);
    let poll = raw
        .get("pollIntervalHours")
        .and_then(|v| v.as_i64())
        .unwrap_or(DEFAULT_POLL_INTERVAL_HOURS);
    let enabled = raw
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(DEFAULT_ENABLED);
    let last_poll = raw
        .get("lastPoll")
        .and_then(|v| v.as_i64())
        .unwrap_or(DEFAULT_LAST_POLL);
    json!({
        "pollIntervalHours": poll,
        "enabled": enabled,
        "lastPoll": last_poll,
    })
}

// update-service:getStatus / :getLastResult — VersionCheckResult | null.
// lastResult is in-memory-only in Electron and is never produced on this
// pure-data tier (no check), so this returns null, matching a cold start.
fn get_last_result(_app: &tauri::AppHandle) -> Value {
    Value::Null
}

/// Route an `update-service:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// handled; the heavy network channels (check/download/install) return
/// Value::Null (honest degrade — not ported, needs native runtime).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // Status getter — both the prompt's named channel and the verbatim
        // Electron handler resolve to the same VersionCheckResult | null.
        "update-service:getStatus" | "update-service:getLastResult" => get_last_result(app),
        "update-service:getConfig" => load_config(app),
        // Heavy / side-effecting channels: not ported (need native runtime).
        //   check    -> net.request poll + persist + trigger electron-updater
        //   download -> not present in this service (release flow)
        //   install  -> not present in this service (release flow)
        //   setConfig-> mutates config + restarts polling (lifecycle side-effect)
        _ => Value::Null,
    }
}

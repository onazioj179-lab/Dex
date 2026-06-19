// =============================================================================
// DEX Tauri — Update subsystem data surface (port of the read-only `update:*` /
// `updates:*` IPC handlers in core/ReleaseManager.ts).
//
// SCOPE: only the two pure-data channels were ported:
//   - update:getStatus  -> ReleaseManager.getStatus()  (UpdateStatus)
//   - updates:getInfo    -> ReleaseManager.getInfo()    (info object)
// The heavy lifecycle channels (check/download/install, plus the rest of the
// `update:*`/`updates:*` surface) need the live electron-updater runtime and a
// network feed, so they are intentionally NOT ported here (see channelsSkipped).
//
// STORAGE: ReleaseManager does NOT use electron-store or DataStore-KV for these
// reads. It persists `UpdateConfig` to a plain JSON file `update-config.json`
// under userData (fs.writeFileSync of the bare config object — no top-level key
// wrapper), and reads the feed URL from `update-server.json` ({ url }). This
// port mirrors both files verbatim under <appData>, the Tauri analog of
// userData (same pattern as analytics.rs):
//   - update-config.json : { autoCheck, autoDownload, autoInstall, checkInterval,
//                            lastCheck, skipVersion, channel, remindLaterUntil }
//   - update-server.json : { url }
//
// IN-MEMORY STATUS (documented divergence): `this.status` (UpdateStatus) and the
// live `updateInfo` are runtime-only — they are NEVER persisted by Electron and
// only mutate while an electron-updater check/download is in flight. A freshly
// constructed ReleaseManager (which is exactly the state a stateless Tauri
// dispatch reproduces, with no native updater running) returns the default
// status: everything false/0/null. So getStatus() returns that default object,
// and getInfo() reports updateAvailable=false / isDownloading=false /
// downloadProgress=0 / no latestVersion|releaseNotes. This matches the Electron
// return shape exactly at boot; only a mid-check live value would differ, and
// that path is the heavy (unported) runtime.
//
// VERSION: app.getVersion() -> env!("CARGO_PKG_VERSION") (the house pattern used
// by `app:getVersion` in main.rs). No Date crate, no rand: timestamps would come
// from std SystemTime, but neither ported channel mints ids or timestamps.
//
// Field names/types match the Electron handlers exactly so the renderer (which
// invokes `update:getStatus` and `updates:getInfo`, see preload.ts) is unchanged.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const CONFIG_FILE: &str = "update-config.json";
const UPDATE_SERVER_CONFIG_FILE: &str = "update-server.json";

// --- file IO (same shape as analytics.rs) -----------------------------------

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

// --- config ------------------------------------------------------------------

// ReleaseManager.loadConfig(): merge persisted JSON over DEFAULT_CONFIG, then
// pin autoDownload/autoInstall to the current policy defaults regardless of the
// persisted value. We only need lastCheck / skipVersion / remindLaterUntil for
// getInfo, but mirror the full merge so the shape stays faithful.
fn get_config(app: &tauri::AppHandle) -> Value {
    let raw = read_file(app, CONFIG_FILE);
    let get_bool = |k: &str, d: bool| raw.get(k).and_then(|v| v.as_bool()).unwrap_or(d);
    let auto_check = get_bool("autoCheck", true);
    let check_interval = raw
        .get("checkInterval")
        .and_then(|v| v.as_i64())
        .unwrap_or(4);
    let last_check = raw.get("lastCheck").and_then(|v| v.as_i64()).unwrap_or(0);
    // skipVersion: null unless a real string is persisted.
    let skip_version = match raw.get("skipVersion") {
        Some(Value::String(s)) => json!(s),
        _ => Value::Null,
    };
    let channel = match raw.get("channel").and_then(|v| v.as_str()) {
        Some("beta") => "beta",
        _ => "stable",
    };
    let remind_later = raw
        .get("remindLaterUntil")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    json!({
        "autoCheck": auto_check,
        // DEFAULT_CONFIG policy pins (loadConfig overrides any persisted value).
        "autoDownload": true,
        "autoInstall": true,
        "checkInterval": check_interval,
        "lastCheck": last_check,
        "skipVersion": skip_version,
        "channel": channel,
        "remindLaterUntil": remind_later,
    })
}

// ReleaseManager.loadUpdateServerUrl(): read { url } from update-server.json,
// falling back to "". (Electron lazily writes the file on first read; we do not
// reproduce that write side-effect — a missing/invalid file yields the same "".)
fn load_update_server_url(app: &tauri::AppHandle) -> String {
    read_file(app, UPDATE_SERVER_CONFIG_FILE)
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

// The default (boot-state) UpdateStatus — never persisted, see header.
fn default_status() -> Value {
    json!({
        "checking": false,
        "available": false,
        "downloading": false,
        "downloaded": false,
        "progress": 0,
        "error": Value::Null,
        "updateInfo": Value::Null,
    })
}

// ReleaseManager.getStatus(): { ...this.status }.
fn get_status() -> Value {
    default_status()
}

// ReleaseManager.getInfo(): derive from current version + config + (default)
// status. With no live status, updateAvailable/isDownloading/progress are their
// zero values and latestVersion/releaseNotes are absent (updateInfo is null).
// In Electron those two optional keys are simply `undefined` when updateInfo is
// null, which serializes to a missing key over IPC — so we omit them, matching
// JSON.stringify of the object literal exactly.
fn get_info(app: &tauri::AppHandle) -> Value {
    let cfg = get_config(app);
    let last_check = cfg.get("lastCheck").cloned().unwrap_or_else(|| json!(0));
    let skip_version = cfg.get("skipVersion").cloned().unwrap_or(Value::Null);
    let remind_later = cfg
        .get("remindLaterUntil")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    json!({
        "currentVersion": env!("CARGO_PKG_VERSION"),
        "updateAvailable": false,
        // latestVersion / releaseNotes omitted: updateInfo is null at boot, so
        // both are `undefined` in Electron (dropped by JSON.stringify).
        "lastCheck": last_check,
        "skippedVersion": skip_version,
        "isDownloading": false,
        "downloadProgress": 0,
        // `remindLaterUntil || 0` — 0/absent both yield 0.
        "remindLaterUntil": remind_later,
        "updateServerUrl": load_update_server_url(app),
    })
}

/// Route the update data channels. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the two ported read channels return
/// a value; everything else (including the heavy/unported `update:*` and
/// `updates:*` channels) returns Value::Null so a stray route degrades honestly.
///
/// NOTE: this handles BOTH the `update:getStatus` (singular) and
/// `updates:getInfo` (plural) channels exactly as the renderer invokes them.
/// Because neither the `update:` nor the `updates:` namespace is fully ported,
/// the caller must route these two specific channels here — a blanket
/// `starts_with("update")` prefix route is NOT safe (it would swallow the
/// unported channels and the plural alias is a different prefix).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "update:getStatus" => get_status(),
        "updates:getInfo" => get_info(app),
        _ => Value::Null,
    }
}

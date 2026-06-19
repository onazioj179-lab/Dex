// =============================================================================
// DEX Tauri — Updates subsystem (data/read surface of the `updates:*` IPC tier).
//
// NAMING / SOURCE-OF-TRUTH NOTE (read first):
//   The task named UpdateController.ts + electron-store key "updates" + a data
//   channel `updates:getAvailable`. In the live repo that controller is FULLY
//   DEPRECATED — it throws in its constructor and registers no IPC. The real
//   `updates:*` handlers live in src/main/core/ReleaseManager.ts, and there is
//   NO `updates:getAvailable` channel anywhere in the codebase (preload, no
//   renderer caller, no handler). The renderer reads "what update is available"
//   via `updates:getInfo` (UpdateManagerSection in Settings.tsx). So porting a
//   literal `getAvailable` would mean inventing a shape, which the rules forbid.
//
//   Storage is NOT electron-store either: ReleaseManager persists with raw
//   fs.writeFileSync to `<userData>/update-config.json` — a FLAT JSON object
//   (no top-level key wrapper). We mirror that exact file name + flat shape
//   under <appData>.
//
// WHAT IS PORTED (the genuinely data-pure reads, all backed by update-config.json):
//   - updates:getInfo        -> the getInfo() object (see ReleaseManager.getInfo)
//   - updates:getPreferences -> getPreferences() projection of the config
//   - update:getConfig       -> the full UpdateConfig (the `update:` sibling read
//                               the preload's updates.getConfig() invokes)
//
// HEAVY / NATIVE channels NOT ported (electron-updater network + quitAndInstall +
// dialogs + app.relaunch — none are pure data and must not be faked):
//   updates:check, updates:download, updates:install, updates:skip,
//   updates:remindLater, updates:downgrade, updates:openReleaseNotes,
//   updates:pruneCache, updates:setPreferences (writes that drive native policy),
//   updates:getChangelog / getReleaseNotesForVersion (read live status / on-disk
//   CHANGELOG.md, not persisted store data).
//
// DIVERGENCES (documented):
//   - currentVersion: Electron uses app.getVersion() (the running app's version).
//     Tauri exposes that via tauri::AppHandle::package_info().version; we emit it
//     as a string to match the Electron field exactly.
//   - latestVersion / releaseNotes / updateAvailable / isDownloading /
//     downloadProgress: in Electron these reflect the LIVE in-memory `status`
//     populated by electron-updater events. With no native updater running, no
//     check has happened, so these are their fresh-status defaults
//     (updateAvailable=false, isDownloading=false, downloadProgress=0,
//     latestVersion/releaseNotes absent/undefined). This matches what the
//     renderer sees on a cold start before any check resolves.
//   - updateServerUrl: read from <appData>/update-server.json (same file name as
//     Electron's UPDATE_SERVER_CONFIG_FILE); "" when absent. We do NOT create the
//     file on read (Electron created it lazily in loadUpdateServerUrl; that is a
//     native-side bootstrap, not part of the read shape).
//   - autoDownload/autoInstall are pinned to the current policy defaults on load,
//     exactly as ReleaseManager.loadConfig() does (persisted values are stale).
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const CONFIG_FILE: &str = "update-config.json";
const UPDATE_SERVER_CONFIG_FILE: &str = "update-server.json";

// DEFAULT_CONFIG (ReleaseManager.ts). autoDownload/autoInstall are policy-pinned.
const DEFAULT_AUTO_CHECK: bool = true;
const DEFAULT_AUTO_DOWNLOAD: bool = true;
const DEFAULT_AUTO_INSTALL: bool = true;
const DEFAULT_CHECK_INTERVAL: i64 = 4;
const DEFAULT_CHANNEL: &str = "stable";

// --- file IO ----------------------------------------------------------------

fn data_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_json(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(data_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn current_version(app: &tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

// ReleaseManager.loadConfig(): DEFAULT_CONFIG spread over persisted JSON, then
// autoDownload/autoInstall force-pinned to the current policy defaults. Returns
// a UpdateConfig with every field present (flat object).
fn load_config(app: &tauri::AppHandle) -> Value {
    let raw = read_json(app, CONFIG_FILE);
    let g = |k: &str| raw.get(k);

    let auto_check = g("autoCheck").and_then(|v| v.as_bool()).unwrap_or(DEFAULT_AUTO_CHECK);
    let check_interval = g("checkInterval").and_then(|v| v.as_i64()).unwrap_or(DEFAULT_CHECK_INTERVAL);
    let last_check = g("lastCheck").and_then(|v| v.as_i64()).unwrap_or(0);
    let skip_version = g("skipVersion").cloned().unwrap_or(Value::Null);
    // skipVersion is string | null; coerce any non-string to null to match the type.
    let skip_version = if skip_version.is_string() { skip_version } else { Value::Null };
    let channel = g("channel").and_then(|v| v.as_str()).unwrap_or(DEFAULT_CHANNEL).to_string();
    let remind_later_until = g("remindLaterUntil").and_then(|v| v.as_i64()).unwrap_or(0);

    json!({
        "autoCheck": auto_check,
        "autoDownload": DEFAULT_AUTO_DOWNLOAD, // policy-pinned (see loadConfig)
        "autoInstall": DEFAULT_AUTO_INSTALL,   // policy-pinned (see loadConfig)
        "checkInterval": check_interval,
        "lastCheck": last_check,
        "skipVersion": skip_version,
        "channel": channel,
        "remindLaterUntil": remind_later_until,
    })
}

// loadUpdateServerUrl(): parsed.url || "" — read-only; we do not write the file.
fn update_server_url(app: &tauri::AppHandle) -> String {
    read_json(app, UPDATE_SERVER_CONFIG_FILE)
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

// ReleaseManager.getInfo(). status fields are at their cold/fresh defaults
// (no native updater has run) — see header divergence note.
fn get_info(app: &tauri::AppHandle) -> Value {
    let cfg = load_config(app);
    json!({
        "currentVersion": current_version(app),
        "updateAvailable": false,
        // latestVersion / releaseNotes are status.updateInfo?.x in Electron:
        // undefined with no available update. Omit them to mirror `undefined`.
        "lastCheck": cfg.get("lastCheck").cloned().unwrap_or(json!(0)),
        "skippedVersion": cfg.get("skipVersion").cloned().unwrap_or(Value::Null),
        "isDownloading": false,
        "downloadProgress": 0,
        "remindLaterUntil": cfg.get("remindLaterUntil").and_then(|v| v.as_i64()).unwrap_or(0),
        "updateServerUrl": update_server_url(app),
    })
}

// ReleaseManager.getPreferences().
fn get_preferences(app: &tauri::AppHandle) -> Value {
    let cfg = load_config(app);
    json!({
        "autoCheck": cfg.get("autoCheck").and_then(|v| v.as_bool()).unwrap_or(DEFAULT_AUTO_CHECK),
        "checkInterval": cfg.get("checkInterval").and_then(|v| v.as_i64()).unwrap_or(DEFAULT_CHECK_INTERVAL),
        "lastCheck": cfg.get("lastCheck").and_then(|v| v.as_i64()).unwrap_or(0),
        "skippedVersion": cfg.get("skipVersion").cloned().unwrap_or(Value::Null),
        "showChangelog": true,
    })
}

/// Route an `updates:*` (and the sibling `update:getConfig`) channel. Args are
/// the positional JSON array the renderer sent (see tauriCompat.ts).
///
/// Only the data-pure reads are served. Heavy/native channels are NOT handled
/// here and fall through to Value::Null — meaning this dispatch is NOT safe to
/// blanket-route by `channel.starts_with("updates:")`; the caller must route the
/// specific channels below (prefixRouteSafe = false). See the header for why.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "updates:getInfo" => get_info(app),
        "updates:getPreferences" => get_preferences(app),
        "update:getConfig" => load_config(app),
        _ => Value::Null,
    }
}

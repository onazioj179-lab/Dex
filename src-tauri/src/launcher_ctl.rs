// =============================================================================
// DEX Tauri - App Launcher subsystem (port of the data surface of
// src/main/core/AppLauncherSwitcher.ts, the `launcher:*` IPC handlers).
//
// Pure-data, fs-JSON tier. The Electron launcher did NOT use electron-store; it
// persisted to two raw JSON files inside a `launcher` subdirectory of userData:
//   - <userData>/launcher/apps.json   : InstalledApp[]   (a bare JSON array)
//   - <userData>/launcher/config.json : Partial<LauncherConfig>
// We mirror the SAME relative paths under <appData> (Tauri's app_data_dir) and
// the SAME on-disk shapes (apps.json is a bare array, NOT key-wrapped).
//
// Only the read-only DATA channel is ported here:
//   - launcher:apps -> InstalledApp[]   (AppLauncherSwitcher.getAllApps())
//       Returns every stored app that is not hidden (unless config.showHiddenApps
//       is true), sorted by displayName via case-sensitive comparison that mirrors
//       String.localeCompare for ASCII. Fields are passed through unchanged from
//       the persisted record so the shape matches InstalledApp exactly:
//         { id, name, displayName, path, icon?, iconPath?, category, description?,
//           version?, lastUsed?, useCount, favorite, hidden }
//
// HEAVY channels are intentionally NOT ported (they need OS process control,
// filesystem scanning of Program Files / .app bundles, shell.openPath, spawn,
// tasklist/ps, window activation, etc. - none of which is a pure-data port):
//   launcher:launch, launcher:launchPath, launcher:close, launcher:switchTo,
//   launcher:scan, launcher:running, launcher:quick, launcher:search,
//   launcher:recent, launcher:favorites, launcher:byCategory, launcher:favorite,
//   launcher:hide, launcher:config, launcher:setConfig.
// The prompt's three named heavy channels (launch, close, focus) map to
// launcher:launch / launcher:close / launcher:switchTo; all return Value::Null
// (the renderer treats absent launcher results as a no-op in the web/native
// fallback path).
//
// DIVERGENCES (documented):
//   - Channel name: the data channel is `launcher:apps` in Electron (there is no
//     `launcher:getApps`). The dispatch accepts both `launcher:apps` and
//     `launcher:getApps` so either renderer spelling resolves to getAllApps().
//   - Sorting: Electron used a.displayName.localeCompare(b.displayName). We use a
//     plain Unicode-codepoint comparison, which matches localeCompare for the
//     ASCII app names produced by the scanner; full ICU collation is not
//     reproducible without a collation crate (no new deps allowed).
//   - Because no native scan runs under Tauri, apps.json may be empty/absent;
//     getAllApps() then correctly returns []. Nothing is fabricated.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const SUBDIR: &str = "launcher";
const APPS_FILE: &str = "apps.json";
const CONFIG_FILE: &str = "config.json";

// --- file IO ----------------------------------------------------------------

fn launcher_dir(app: &tauri::AppHandle) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(SUBDIR);
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn read_json(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(launcher_dir(app).join(name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// LauncherConfig.showHiddenApps (default false).
fn show_hidden(app: &tauri::AppHandle) -> bool {
    read_json(app, CONFIG_FILE)
        .get("showHiddenApps")
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

fn is_hidden(a: &Value) -> bool {
    a.get("hidden").and_then(|v| v.as_bool()).unwrap_or(false)
}

fn display_name(a: &Value) -> &str {
    a.get("displayName").and_then(|v| v.as_str()).unwrap_or("")
}

// AppLauncherSwitcher.getAllApps(): filter !hidden (unless showHiddenApps),
// sorted by displayName.
fn get_all_apps(app: &tauri::AppHandle) -> Value {
    let apps = match read_json(app, APPS_FILE) {
        Value::Array(a) => a,
        _ => Vec::new(),
    };
    let show = show_hidden(app);
    let mut out: Vec<Value> = apps
        .into_iter()
        .filter(|a| !is_hidden(a) || show)
        .collect();
    out.sort_by(|a, b| display_name(a).cmp(display_name(b)));
    Value::Array(out)
}

/// Route a `launcher:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the read-only data channel is served; every
/// other channel in the namespace (all heavy/native) returns Value::Null so a
/// prefix route over `launcher:` degrades honestly.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "launcher:apps" | "launcher:getApps" => get_all_apps(app),
        // Heavy/native channels: not ported (see header). Honest null.
        _ => Value::Null,
    }
}

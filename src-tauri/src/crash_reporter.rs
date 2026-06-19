// =============================================================================
// DEX Tauri — Crash Reporter subsystem (port of core/CrashReporter.ts).
//
// Pure-data, JSON-backed READ tier. Electron persisted crashes as a RAW JSON
// ARRAY (no electron-store, no top-level key wrapper) written with
// fs.writeFileSync to `<userData>/crash-log.json`; this mirrors that file under
// <appData>/crash-log.json and reads the SAME flat-array shape.
//
// Only the two data-read channels are ported, at the EXACT Electron return
// shapes so the renderer is unchanged:
//   - crash-reporter:getRecent(limit?) -> CrashRecord[]   (last `limit||20`)
//   - crash-reporter:getStats()        -> CrashStats      (see shape below)
//
// CrashRecord: { id, timestamp, type, version, platform, arch, uptime,
//                message, stack? }   (records are read verbatim from disk)
// CrashStats:  { totalCrashes, crashesThisSession, crashesSinceUpdate,
//                lastCrash, recentCrashes: CrashRecord[], rollbackRecommended }
//
// DIVERGENCES (documented):
//   - FILE NAME: the task brief hinted `crash-reports.json`, but the Electron
//     constant is `CRASH_LOG_FILE = 'crash-log.json'` (CrashReporter.ts:46).
//     The real file name wins so existing on-disk logs are read; we use
//     `crash-log.json`.
//   - SESSION STATE: `crashesThisSession` and the constructor's `startTime`
//     live only in the long-lived Electron singleton. A stateless dispatch has
//     no session counter, so `crashesThisSession` is reported as 0. (Recording
//     crashes — which is what increments it — is a heavy/native channel that is
//     intentionally NOT ported here, so 0 is the faithful read-only value.)
//   - VERSION: `crashesSinceUpdate` / `rollbackRecommended` compare each record's
//     stored `version` against the running app version. Electron used
//     app.getVersion(); we use tauri's app.package_info().version (same source:
//     the bundle/package version).
//   - LOAD TRIM: Electron slices the loaded array to the last MAX_STORED_CRASHES
//     (200). We mirror that on read so totals match a freshly-loaded singleton.
//
// HEAVY/native channels are NOT ported and NOT faked (see dispatch + the
// channelsSkipped report): reportRendererError (records a crash via the native
// crashReporter + process handlers), clear (mutating delete), and upload (no
// such channel exists; the Electron reporter is local-only, uploadToServer:false).
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const CRASH_LOG_FILE: &str = "crash-log.json";
const MAX_STORED_CRASHES: usize = 200;
const ROLLBACK_THRESHOLD: i64 = 5; // crashes since update triggers rollback suggestion
const RECENT_WINDOW_MS: i64 = 24 * 60 * 60 * 1000; // 24 hours

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(CRASH_LOG_FILE)
}

// Mirror loadCrashLog(): raw JSON array; non-array / empty / parse-fail -> [];
// then slice to the last MAX_STORED_CRASHES.
fn load_crashes(app: &tauri::AppHandle) -> Vec<Value> {
    let raw = match std::fs::read_to_string(store_path(app)) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    if raw.trim().is_empty() {
        return Vec::new();
    }
    let mut crashes = match serde_json::from_str::<Value>(&raw) {
        Ok(Value::Array(a)) => a,
        _ => return Vec::new(),
    };
    if crashes.len() > MAX_STORED_CRASHES {
        crashes = crashes.split_off(crashes.len() - MAX_STORED_CRASHES);
    }
    crashes
}

fn current_version(app: &tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

fn timestamp(r: &Value) -> i64 {
    r.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0)
}

// crash-reporter:getRecent — this.crashes.slice(-(limit || 20)).
fn get_recent(app: &tauri::AppHandle, limit: Option<i64>) -> Value {
    let crashes = load_crashes(app);
    // `limit || 20`: 0 / absent fall back to 20 (mirrors JS falsy default).
    let n = match limit {
        Some(l) if l != 0 => l,
        _ => 20,
    };
    if n <= 0 {
        return json!([]);
    }
    let n = n as usize;
    let start = crashes.len().saturating_sub(n);
    json!(crashes[start..].to_vec())
}

// crash-reporter:getStats — see CrashStats shape.
fn get_stats(app: &tauri::AppHandle) -> Value {
    let crashes = load_crashes(app);
    let now = now_ms();
    let recent_cutoff = now - RECENT_WINDOW_MS;
    let version = current_version(app);

    let recent: Vec<Value> = crashes
        .iter()
        .filter(|c| timestamp(c) > recent_cutoff)
        .cloned()
        .collect();
    let crashes_since_update = crashes
        .iter()
        .filter(|c| c.get("version").and_then(|v| v.as_str()) == Some(version.as_str()))
        .count() as i64;

    let last_crash = if crashes.is_empty() {
        0
    } else {
        timestamp(&crashes[crashes.len() - 1])
    };

    // recentCrashes.slice(-10)
    let recent_tail: Vec<Value> = {
        let start = recent.len().saturating_sub(10);
        recent[start..].to_vec()
    };

    json!({
        "totalCrashes": crashes.len(),
        // Session-only counter is unavailable in a stateless dispatch (see header).
        "crashesThisSession": 0,
        "crashesSinceUpdate": crashes_since_update,
        "lastCrash": last_crash,
        "recentCrashes": recent_tail,
        "rollbackRecommended": crashes_since_update >= ROLLBACK_THRESHOLD,
    })
}

/// Route a `crash-reporter:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Heavy/native channels return Value::Null
/// (honest degrade) rather than fabricating a result.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "crash-reporter:getStats" => get_stats(app),
        "crash-reporter:getRecent" => {
            let limit = args.get(0).and_then(|v| v.as_i64());
            get_recent(app, limit)
        }
        // Heavy/native — intentionally not ported, not faked.
        //   crash-reporter:reportRendererError, crash-reporter:clear
        // and any other channel in the namespace -> null.
        _ => Value::Null,
    }
}

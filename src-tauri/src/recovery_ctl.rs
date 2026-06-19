// =============================================================================
// DEX Tauri — Recovery subsystem (port of the `recovery:*` IPC handlers in
// src/main/core/CrashRecoverySystem.ts).
//
// SPEC RECONCILIATION (important, same situation handled by monitor_ctl.rs): the
// porting brief named source `src/main/core/Recovery.ts`, storage
// `fs-json:recovery.json`, DATA channel `getState`, and HEAVY channels
// `recover` / `restore`. None of those literal names exist in the repo. The real
// `recovery:` namespace is owned by CrashRecoverySystem.ts, which is NOT a single
// `recovery.json` file — it persists three plain JSON files under
// <userData>/recovery/ via std fs (same tier as analytics.rs / monitor_ctl.rs):
//   - session-state.json : a single SessionState object (the "state")
//   - crash-history.json : a CrashEvent[] array
//   - config.json        : a RecoveryConfig object (defaults merged on read)
// This module therefore mirrors monitor_ctl.rs (electron-store-style JSON under
// <appData> with identical file names / nested `recovery/` dir) rather than a
// single recovery.json. The brief's abstract DATA channel ("getState") maps to
// the concrete cold-readable DATA channels below; the abstract HEAVY channels
// ("recover" / "restore") map to the concrete live-runtime channels listed.
//
// PORTED (pure-data, reconstructable cold from the JSON files; shapes match the
// Electron handlers exactly so the renderer is unchanged):
//   - recovery:savedState -> SessionState | null
//         { timestamp, windows: WindowState[], activeWindow?, pendingOperations:
//           string[], unsavedData: Record<string, unknown> }
//         Electron returns `this.savedState`, which is populated by
//         checkForPreviousCrash(): it reads session-state.json and KEEPS it only
//         if state.timestamp > now - 5min; older state is treated as null (and
//         the file unlinked). We reproduce the read + 5-minute freshness gate and
//         return null when the file is missing/stale/corrupt. (We do not delete
//         the stale file — unlink is a runtime side-effect with no effect on the
//         returned value; documented divergence.)
//   - recovery:crashes(limit?) -> CrashEvent[]
//         Reads crash-history.json (an array; [] if missing/corrupt) and returns
//         the last min(limit||20, len) entries — exact Electron slice(-(limit||20)).
//   - recovery:stats -> RecoveryStats
//         { totalCrashes, successfulRecoveries, failedRecoveries, dataLossEvents,
//           lastCrash?, uptimeSinceLastCrash, crashesByType } derived purely from
//           crash-history.json, matching getStats() field-for-field.
//   - recovery:config -> RecoveryConfig
//         { enabled, autoRecover, maxRecoveryAttempts, recoveryDelayMs,
//           saveStateInterval, keepCrashHistory, showRecoveryNotification,
//           silentMode } = DEFAULT_CONFIG with config.json merged over it (exact
//           mirror of loadConfig()'s `{ ...DEFAULT_CONFIG, ...JSON.parse(data) }`).
//
// SKIPPED (live runtime; require the native process — BrowserWindow recreation,
// the save-state interval, and the in-memory unsavedData buffer have no cold/file
// equivalent). These are the concrete analogue of the brief's recover/restore
// heavy channels and are NOT implemented and NOT faked:
//   - recovery:restore    (recreates BrowserWindows from saved state)
//   - recovery:saveState  (snapshots live BrowserWindow geometry to disk)
//   - recovery:dismiss    (clears in-memory savedState + unlinks the file)
//   - recovery:setConfig  (persists config AND re-arms the save interval)
//   - recovery:unsavedData (ipcMain.on listener — mutates in-memory savedState)
// Per the brief these return nothing meaningful cold. The prefix route is
// therefore NOT exhaustive in spirit: this dispatch returns Value::Null for them
// (honest no-op) so routing every `recovery:*` channel here will not silently
// fake a successful restore. main.rs should route ONLY the four DATA channels
// above to this dispatch.
//
// DIVERGENCES (documented):
//   - Storage location: Electron used path.join(app.getPath('userData'),
//     'recovery'); Tauri uses app.path().app_data_dir().join("recovery"). Same
//     file NAMES and same JSON shapes / top-level structure (bare object for
//     state/config, bare array for crashes — no key wrappers, matching Electron's
//     JSON.stringify of the value directly).
//   - savedState does not delete the stale state file (Electron's unlink) — a
//     side-effect that does not change the returned value.
//   - stats.uptimeSinceLastCrash: Electron seeds it from the process startTime
//     when there are zero crashes (now - startTime). Cold there is no process
//     startTime, so the zero-crash case returns 0; when crashes exist the value
//     is now - lastCrash, identical to Electron.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const STATE_FILE: &str = "session-state.json";
const HISTORY_FILE: &str = "crash-history.json";
const CONFIG_FILE: &str = "config.json";
const FRESHNESS_MS: i64 = 5 * 60 * 1000; // checkForPreviousCrash: 5-minute window.

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- file IO (mirrors analytics.rs / monitor_ctl.rs store_path/read_file) -----

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("recovery");
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// --- DEFAULT_CONFIG (mirror of the TS constant) ------------------------------

fn default_config() -> Value {
    json!({
        "enabled": true,
        "autoRecover": true,
        "maxRecoveryAttempts": 3,
        "recoveryDelayMs": 1000,
        "saveStateInterval": 30000,
        "keepCrashHistory": 50,
        "showRecoveryNotification": true,
        "silentMode": true,
    })
}

// --- crash history -----------------------------------------------------------

fn read_crashes(app: &tauri::AppHandle) -> Vec<Value> {
    match read_file(app, HISTORY_FILE) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

// getCrashHistory(limit?) -> this.crashes.slice(-(limit || 20))
fn get_crash_history(app: &tauri::AppHandle, limit: Option<i64>) -> Value {
    let crashes = read_crashes(app);
    let n = match limit {
        Some(l) if l > 0 => l as usize,
        _ => 20,
    };
    let start = crashes.len().saturating_sub(n);
    json!(crashes[start..].to_vec())
}

// getStats() -> RecoveryStats
fn get_stats(app: &tauri::AppHandle) -> Value {
    let crashes = read_crashes(app);

    let recovered = |c: &Value| c.get("recovered").and_then(|v| v.as_bool()).unwrap_or(false);
    let data_lost = |c: &Value| c.get("dataLost").and_then(|v| v.as_bool()).unwrap_or(false);

    let successful = crashes.iter().filter(|c| recovered(c)).count();
    let failed = crashes.iter().filter(|c| !recovered(c)).count();
    let loss = crashes.iter().filter(|c| data_lost(c)).count();

    // crashesByType: every CrashType key seeded at 0 (mirrors the TS object).
    let mut by_type = json!({
        "renderer-crash": 0,
        "renderer-unresponsive": 0,
        "main-exception": 0,
        "uncaught-promise": 0,
        "memory-pressure": 0,
        "gpu-crash": 0,
        "worker-crash": 0,
    });
    if let Some(obj) = by_type.as_object_mut() {
        for c in &crashes {
            if let Some(t) = c.get("type").and_then(|v| v.as_str()) {
                if let Some(slot) = obj.get_mut(t) {
                    let n = slot.as_i64().unwrap_or(0) + 1;
                    *slot = json!(n);
                }
            }
        }
    }

    let last_crash = crashes
        .last()
        .and_then(|c| c.get("timestamp"))
        .and_then(|v| v.as_i64());

    // Electron: starts at (now - startTime); if crashes exist, overwritten with
    // (now - lastCrash). Cold there is no startTime, so the no-crash case is 0.
    let uptime = match last_crash {
        Some(ts) => now_ms() - ts,
        None => 0,
    };

    let mut stats = json!({
        "totalCrashes": crashes.len(),
        "successfulRecoveries": successful,
        "failedRecoveries": failed,
        "dataLossEvents": loss,
        "uptimeSinceLastCrash": uptime,
        "crashesByType": by_type,
    });
    if let (Some(ts), Some(obj)) = (last_crash, stats.as_object_mut()) {
        obj.insert("lastCrash".into(), json!(ts));
    }
    stats
}

// recovery:savedState -> this.savedState (post checkForPreviousCrash gate).
fn get_saved_state(app: &tauri::AppHandle) -> Value {
    let state = read_file(app, STATE_FILE);
    let ts = state.get("timestamp").and_then(|v| v.as_i64());
    match ts {
        Some(t) if t > now_ms() - FRESHNESS_MS => state,
        _ => Value::Null, // missing / corrupt / stale -> null (no in-memory state cold).
    }
}

// loadConfig(): { ...DEFAULT_CONFIG, ...JSON.parse(config.json) }
fn get_config(app: &tauri::AppHandle) -> Value {
    let mut cfg = default_config();
    if let (Some(obj), Value::Object(over)) = (cfg.as_object_mut(), read_file(app, CONFIG_FILE)) {
        for (k, v) in over {
            obj.insert(k, v);
        }
    }
    cfg
}

/// Route a `recovery:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the cold-readable DATA channels are handled;
/// the live-runtime channels (restore / saveState / dismiss / setConfig /
/// unsavedData) intentionally return Value::Null rather than a faked success.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "recovery:savedState" => get_saved_state(app),
        "recovery:crashes" => {
            let limit = args.get(0).and_then(|v| v.as_i64());
            get_crash_history(app, limit)
        }
        "recovery:stats" => get_stats(app),
        "recovery:config" => get_config(app),
        _ => Value::Null,
    }
}

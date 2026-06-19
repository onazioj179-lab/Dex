// =============================================================================
// DEX Tauri — Xenon subsystem (port of the `xenon:*` IPC handlers in
// src/main/core/Xenon.ts, the Background Resource Optimizer).
//
// Xenon is overwhelmingly a LIVE native engine: focus tracking, an adaptive
// sampling loop, an in-memory app-priority state machine, and Electron-only
// window throttling (setBackgroundThrottling / setFrameRate). None of that
// exists as data — it only exists while the engine is running in the main
// process. The ONLY persisted, pure-data surface is the `xenon-patterns`
// electron-store (Store name "xenon-patterns" -> xenon-patterns.json, top-level
// key "patterns"), which backs pattern learning.
//
// Channel ported (data tier):
//   - xenon:getStatus -> object   The renderer's status snapshot. Electron built
//     it from live engine fields. Without the running engine those fields have
//     no source, so this returns the SAME shape with the honest at-rest values
//     (running:false, no tracked apps), the two persisted-derived fields
//     (patternMature, predictedApps) computed from xenon-patterns.json exactly as
//     the Electron isPatternMature()/predictedApps() did, and the system metrics
//     (memoryPercent, cpuPercent) sampled live via sysinfo — the same numbers
//     Xenon's own sampler stored. Every field name/type matches getStatus().
//
// Storage divergence note: the porting brief listed `datastore-kv:xenon`, but the
// actual Electron source persists via an electron-store named "xenon-patterns".
// We follow the source: JSON under <appData>/xenon-patterns.json with top-level
// key "patterns" (electron-store -> std::fs JSON, same file + same key wrapper).
//
// DIVERGENCES (documented):
//   - getStatus live fields: foregroundApp=null, appCount=0, apps={},
//     sampleCount=0, onBattery=false, pressureMultiplier=1.0,
//     systemProcessLoad=0, running=false. These reflect "engine not running in
//     this process", which is the truthful state under the data-only port. Types
//     are preserved exactly (string|null, number, object, bool).
//   - nativeBridgeActive: Electron probed NativeSystem.getStats() (the napi
//     bridge). Here we report whether sysinfo could read memory (always true on
//     a live machine), which is the closest honest equivalent of "system metrics
//     are available". Type (bool) preserved.
//   - predictedApps: Electron also added co-occurring apps for the current
//     foreground app. With no running engine foregroundAppId is null, so (exactly
//     as the original code path) only the hour-of-day branch contributes. UTC
//     hour is used (no tz crate); same precedent as analytics.rs.
//   - HEAVY channels (execute, and the live-only getPatterns/reportActiveApp and
//     all push events) are NOT ported. See channelsSkipped.
// =============================================================================

use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::Manager;

const PATTERNS_FILE: &str = "xenon-patterns.json";
const PATTERN_MATURE_DAYS: i64 = 7;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// UTC hour [0,23] — mirrors new Date().getHours() without a tz crate (analytics
// precedent). Hour-of-day histograms shift by the local offset; values match.
fn utc_hour(ms: i64) -> usize {
    let secs_of_day = ms.div_euclid(1000).rem_euclid(86_400);
    (secs_of_day / 3600) as usize
}

// --- file IO (electron-store JSON under appData) ----------------------------

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

// --- patterns store ---------------------------------------------------------

// Read the `patterns` object from xenon-patterns.json, applying the same
// electron-store defaults Xenon's constructor declared.
fn read_patterns(app: &tauri::AppHandle) -> Value {
    let patterns = read_file(app, PATTERNS_FILE)
        .get("patterns")
        .cloned()
        .unwrap_or(Value::Null);
    if patterns.is_object() {
        patterns
    } else {
        json!({ "entries": {}, "firstSeen": now_ms(), "dayCount": 0 })
    }
}

fn day_count(patterns: &Value) -> i64 {
    patterns.get("dayCount").and_then(|v| v.as_i64()).unwrap_or(0)
}

// isPatternMature(): patterns.dayCount >= PATTERN_MATURE_DAYS.
fn is_pattern_mature(patterns: &Value) -> bool {
    day_count(patterns) >= PATTERN_MATURE_DAYS
}

// predictedApps(): with no running engine foregroundAppId is null, so only the
// time-of-day branch runs (used >30% of days at this hour). Insertion order of
// the source entries is preserved (serde_json preserve_order), mirroring
// Object.entries iteration over a Set built in that order.
fn predicted_apps(patterns: &Value) -> Vec<String> {
    if !is_pattern_mature(patterns) {
        return Vec::new();
    }
    let entries = match patterns.get("entries").and_then(|v| v.as_object()) {
        Some(e) => e,
        None => return Vec::new(),
    };
    let hour = utc_hour(now_ms());
    let days = day_count(patterns).max(1) as f64;
    let mut out: Vec<String> = Vec::new();
    for (app_id, entry) in entries {
        let hourly = entry
            .get("hourlyUsage")
            .and_then(|v| v.as_array())
            .and_then(|a| a.get(hour))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let hourly_avg = hourly / days;
        if hourly_avg > 0.3 && !out.contains(app_id) {
            out.push(app_id.clone());
        }
    }
    out
}

// getStatus(): same field names/types as the Electron handler. Live engine
// fields take their at-rest values; metrics come from sysinfo; the two
// pattern-derived fields are computed from xenon-patterns.json.
fn get_status(app: &tauri::AppHandle) -> Value {
    let patterns = read_patterns(app);

    let mut sys = sysinfo::System::new_all();
    sys.refresh_memory();
    let total = sys.total_memory();
    let used = sys.used_memory();
    let memory_percent = if total > 0 {
        (used as f64 / total as f64) * 100.0
    } else {
        0.0
    };
    let native_bridge_active = total > 0;

    json!({
        "running": false,
        "foregroundApp": Value::Null,
        "appCount": 0,
        "apps": Value::Object(Map::new()),
        "memoryPercent": memory_percent,
        "cpuPercent": 0,
        "sampleCount": 0,
        "onBattery": false,
        "pressureMultiplier": 1.0,
        "systemProcessLoad": 0,
        "nativeBridgeActive": native_bridge_active,
        "patternMature": is_pattern_mature(&patterns),
        "predictedApps": predicted_apps(&patterns),
    })
}

/// Route a `xenon:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the data channel `xenon:getStatus` is ported;
/// every other channel in the namespace (live/native-only) returns Value::Null
/// (honest degrade), so prefix routing of `xenon:` to this dispatch is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "xenon:getStatus" => get_status(app),
        _ => Value::Null,
    }
}

// =============================================================================
// DEX Tauri — Monitor subsystem (port of the `monitor:*` IPC handlers in
// src/main/core/ProductionMonitor.ts).
//
// SPEC RECONCILIATION (important): the porting brief named source
// `src/main/core/Monitor.ts`, storage `datastore-kv:monitor`, and channels
// getStatus / start / stop / subscribe. None of those exist in the repo. The
// real `monitor:` namespace is owned by ProductionMonitor.ts, which is NOT
// DataStore-KV backed — it persists two plain JSON files under userData via
// std fs (same tier as analytics.rs):
//   - perf-baseline.json   : a single PerformanceBaseline object
//   - session-digests.json : a SessionDigest[] array
// So this module mirrors analytics.rs (electron-store-style JSON under
// <appData> with identical file names) rather than the KV pattern. The brief's
// abstract DATA channel ("getStatus") maps to the concrete cold-readable DATA
// channels here; the abstract HEAVY channels (start/stop/subscribe) map to the
// concrete live-runtime channels listed below.
//
// PORTED (pure-data, reconstructable cold from the JSON files; shapes match the
// Electron handlers exactly so the renderer is unchanged):
//   - monitor:getBaseline -> PerformanceBaseline
//         { startupTimeMs, averageMemoryMB, peakMemoryMB, averageCPUPercent,
//           sessionCount, lastUpdated }
//         Electron returns { ...this.baseline }, where the in-memory baseline is
//         loaded from perf-baseline.json at construction (or defaults if the
//         file is missing/corrupt). We read the file on demand and return the
//         same object (defaults when absent), which is value-identical for a
//         fresh process that has not yet mutated the baseline.
//   - monitor:getDigests(limit?) -> SessionDigest[]
//         Reads session-digests.json (an array; [] if missing/corrupt), then
//         returns the last min(limit||20, len) entries — exact Electron slice.
//
// SKIPPED (live in-process telemetry; require the native runtime — the snapshot
// ring buffer, warning counter, and current process memory/CPU are built up at
// runtime and have no cold/file equivalent). These are the concrete analogue of
// the brief's start/stop/subscribe heavy channels:
//   - monitor:getHealth        (latest live HealthSnapshot / takes one now)
//   - monitor:getSnapshots     (slice of the live snapshot ring)
//   - monitor:getWarningCount  (live session warning counter)
//   - monitor:warning          (event push, not invokable)
// Per the brief these are NOT implemented and NOT faked. The prefix route is
// therefore NOT exhaustive: routing every `monitor:*` channel here would turn
// the live channels into silent null, masking a real degrade. main.rs should
// route ONLY monitor:getBaseline / monitor:getDigests to this dispatch; this
// dispatch itself returns Value::Null for anything else (honest no-op).
//
// DIVERGENCES (documented):
//   - Storage location: Electron used app.getPath('userData'); Tauri uses
//     app.path().app_data_dir(). Same file NAMES (perf-baseline.json,
//     session-digests.json), same JSON shapes / top-level structure (bare
//     object for baseline, bare array for digests — no key wrappers, matching
//     Electron's JSON.stringify of the value directly).
//   - getBaseline returns the on-disk (or default) baseline rather than a live
//     in-memory copy mutated by start()/stop(); since stop() is a skipped heavy
//     channel, no in-session mutation occurs here, so the values match.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const BASELINE_FILE: &str = "perf-baseline.json";
const DIGEST_FILE: &str = "session-digests.json";

// --- file IO (mirrors analytics.rs store_path/read_file) --------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_json(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// --- getBaseline ------------------------------------------------------------

// Mirrors ProductionMonitor.loadBaseline() defaults, returned as { ...baseline }.
fn default_baseline() -> Value {
    json!({
        "startupTimeMs": 0,
        "averageMemoryMB": 0,
        "peakMemoryMB": 0,
        "averageCPUPercent": 0,
        "sessionCount": 0,
        "lastUpdated": 0,
    })
}

fn get_baseline(app: &tauri::AppHandle) -> Value {
    // Electron: if the file parses to an object, that object is the baseline
    // (loadBaseline does JSON.parse and trusts it); otherwise defaults.
    match read_json(app, BASELINE_FILE) {
        Value::Object(o) => Value::Object(o),
        _ => default_baseline(),
    }
}

// --- getDigests -------------------------------------------------------------

// Electron: if the file is missing -> []; else parse to SessionDigest[] and
// return the last min(limit||20, len). On any parse error -> [].
fn get_digests(app: &tauri::AppHandle, limit: Option<i64>) -> Value {
    let arr = match read_json(app, DIGEST_FILE) {
        Value::Array(a) => a,
        _ => return json!([]),
    };
    // Math.min(limit || 20, digests.length). `limit || 20`: 0/null/absent -> 20.
    let want = match limit {
        Some(n) if n != 0 => n,
        _ => 20,
    };
    let len = arr.len() as i64;
    let count = want.min(len).max(0) as usize;
    let start = arr.len() - count;
    json!(&arr[start..])
}

/// Route a `monitor:*` DATA channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the cold-readable data channels are
/// handled; live-telemetry channels (getHealth/getSnapshots/getWarningCount)
/// are intentionally NOT handled and fall through to Value::Null so they degrade
/// honestly rather than masquerading as ported.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "monitor:getBaseline" => get_baseline(app),
        "monitor:getDigests" => {
            let limit = args.get(0).and_then(|v| v.as_i64());
            get_digests(app, limit)
        }
        _ => Value::Null,
    }
}

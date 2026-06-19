// =============================================================================
// DEX Tauri — Longevity Guardian subsystem (port of the `longevity:*` IPC
// handlers in src/main/core/LongevityGuardian.ts).
//
// Pure-data, JSON-backed tier (same precedent as analytics.rs). Electron used a
// single `electron-store` named `longevity-guardian` under userData; this mirrors
// that file verbatim under <appData>:
//   - longevity-guardian.json : {
//       config:   LongevityConfig,
//       baseline: ResourceBaseline | null,
//       stats:    LongevityStats,
//       lastCheck: number
//     }
// Top-level keys and defaults match the electron-store schema exactly, so the
// renderer is unchanged for the channels that are ported.
//
// PORTED (deterministic, store-backed or empty-by-construction):
//   - longevity:getConfig    -> LongevityConfig
//   - longevity:updateConfig -> LongevityConfig (merged + persisted)
//   - longevity:getStats     -> LongevityStats  (uptimeMs from process uptime)
//   - longevity:getOrphanedTasks    -> OrphanedTask[]  (always [] — see below)
//   - longevity:cleanupOrphanedTasks -> number          (always 0 — see below)
//
// SKIPPED (need the live native/V8 runtime; not faked):
//   - longevity:getDriftReport / captureBaseline — both read
//     `process.memoryUsage().heapUsed`, i.e. the live V8 JS heap. There is no
//     V8 heap in the Rust shell, so a faithful current-heap value cannot be
//     produced. getDriftReport already returns null when no baseline exists, so
//     returning null here is honest (not a fabricated report); captureBaseline
//     would have to invent a heap figure, so it is left to the prefix route to
//     return Value::Null.
//   - longevity:runCompaction — runs registered JS cache-compactors and
//     `global.gc()`; a native-runtime side-effect with a runtime-dependent
//     return. Not reproducible in the data tier.
//
// NAMING NOTE (task vs. reality): the porting ticket nominally listed a data
// channel `getScore`, a heavy channel `optimize`, and storage `longevity.json`.
// The authoritative Electron source (LongevityGuardian.ts) exposes neither of
// those channels and uses the store name `longevity-guardian`. Per the "read the
// Electron source for the EXACT shapes / file names" rule, the real channels and
// the real file name are ported; `getScore`/`optimize` do not exist and so are
// reported as skipped (no such channel).
//
// DIVERGENCES (documented):
//   - getStats.uptimeMs: Electron computed `Date.now() - this.startTime` where
//     startTime is when the guardian initialized. The Rust shell has no such
//     in-process anchor, so uptimeMs is taken from the host process uptime via
//     sysinfo (already a dependency). Same units (ms), same intent (how long the
//     app has been running); the absolute value differs only by guardian-init
//     latency. The persisted `stats` object is otherwise returned verbatim.
//   - getOrphanedTasks / cleanupOrphanedTasks: these walk an in-memory
//     `trackedTasks` map that is populated only by live trackTask() calls made
//     elsewhere in the running Electron main process. That live tracking is not
//     part of the data tier and has no persisted backing, so the map is empty by
//     construction here. Electron returns `[]` / `0` in exactly that state, so
//     these results are faithful, not stubbed.
// =============================================================================

use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "longevity-guardian.json";

// --- file IO (electron-store JSON under appData) -----------------------------

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

fn write_store(app: &tauri::AppHandle, data: &Value) -> bool {
    match serde_json::to_string_pretty(data) {
        Ok(s) => std::fs::write(store_path(app), s).is_ok(),
        Err(_) => false,
    }
}

// --- defaults (mirror the electron-store `defaults` block exactly) -----------

fn default_config() -> Value {
    json!({
        "enabled": true,
        "checkDuringIdleOnly": true,
        "memoryDriftThresholdMB": 100,
        "orphanedTaskTimeoutMs": 5 * 60 * 1000,      // 5 minutes
        "cacheCompactionIntervalMs": 30 * 60 * 1000, // 30 minutes
        "maxIdleWorkers": 2,
    })
}

fn default_stats() -> Value {
    json!({
        "uptimeMs": 0,
        "checksPerformed": 0,
        "compactionsRun": 0,
        "orphansCleanedUp": 0,
        "memoryRecoveredMB": 0,
        "lastDriftReport": Value::Null,
    })
}

// Host process uptime in ms (stand-in for `Date.now() - startTime`; see header).
fn uptime_ms() -> i64 {
    use sysinfo::{Pid, System};
    let mut sys = System::new();
    sys.refresh_processes();
    let pid = Pid::from_u32(std::process::id());
    match sys.process(pid) {
        // process.run_time() is whole seconds since the process started.
        Some(p) => (p.run_time() as i64) * 1000,
        None => 0,
    }
}

// --- ported channels ---------------------------------------------------------

// LongevityGuardian.getConfig()
fn get_config(app: &tauri::AppHandle) -> Value {
    read_store(app)
        .get("config")
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or_else(default_config)
}

// LongevityGuardian.updateConfig(updates): { ...config, ...updates } persisted.
fn update_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut merged: Map<String, Value> = match get_config(app) {
        Value::Object(o) => o,
        _ => Map::new(),
    };
    if let Some(upd) = updates.as_object() {
        for (k, v) in upd {
            merged.insert(k.clone(), v.clone());
        }
    }
    let merged = Value::Object(merged);

    // Persist back into the store object, preserving sibling keys.
    let mut root: Map<String, Value> = match read_store(app) {
        Value::Object(o) => o,
        _ => Map::new(),
    };
    root.insert("config".into(), merged.clone());
    write_store(app, &Value::Object(root));
    merged
}

// LongevityGuardian.getStats(): persisted stats with uptimeMs refreshed.
fn get_stats(app: &tauri::AppHandle) -> Value {
    let mut stats: Map<String, Value> = match read_store(app).get("stats") {
        Some(Value::Object(o)) => o.clone(),
        _ => match default_stats() {
            Value::Object(o) => o,
            _ => Map::new(),
        },
    };
    stats.insert("uptimeMs".into(), json!(uptime_ms()));
    Value::Object(stats)
}

/// Route a `longevity:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// handled; skipped/heavy and unknown channels return Value::Null (honest
/// degrade) so the prefix route is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "longevity:getConfig" => get_config(app),
        "longevity:updateConfig" => {
            let updates = args.get(0).cloned().unwrap_or(Value::Null);
            update_config(app, &updates)
        }
        "longevity:getStats" => get_stats(app),
        // In-memory task map is empty by construction in the data tier; Electron
        // returns [] / 0 in that exact state (see header).
        "longevity:getOrphanedTasks" => json!([]),
        "longevity:cleanupOrphanedTasks" => json!(0),
        // Heavy / native-runtime channels — not faked (see header):
        //   longevity:getDriftReport, longevity:captureBaseline,
        //   longevity:runCompaction
        _ => Value::Null,
    }
}

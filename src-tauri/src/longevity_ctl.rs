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
// NOW PORTED NATIVELY (memory-drift tier — uses process RSS, not V8 heap):
//   - longevity:captureBaseline -> ResourceBaseline (persists `baseline`)
//   - longevity:getDriftReport  -> DriftReport | null
//   - longevity:runCompaction   -> number (MB recovered)
//
//   The Electron implementations read `process.memoryUsage().heapUsed`, i.e. the
//   live V8 JS heap, purely to detect MEMORY DRIFT OVER TIME. The Rust shell has
//   no V8 heap, but the faithful, established native analog of "this process's
//   memory footprint" is its resident set size (sysinfo `process.memory()` ->
//   bytes -> MB) — the exact substitution already used by healing_ctl.rs
//   ("memory" check) and contract_ctl.rs (snapshot memory_mb). Baseline and
//   current readings are both RSS, so the DRIFT (baseline vs. now) — which is the
//   entire point of the report — is measured correctly. The `heapUsedMB` field
//   therefore carries RSS-in-MB; this is documented as a divergence below, not a
//   fabricated heap figure. `externalMB`/`handleCount`/`activeTimers` keep
//   Electron's own placeholder values (external from RSS-vs-WSS is not portably
//   separable no-dep; handleCount/activeTimers were already hardcoded 0 in
//   Electron with the comment "Would need OS-specific code").
//
//   runCompaction in Electron ran registered JS cache-compactors and
//   `global.gc()`. There are no native cache-compactors registered in the Rust
//   shell and no portable no-dep GC trigger (contract_ctl/healing_ctl both note
//   this: native GC recovery is not available). Electron's own return in that
//   exact state (no compactors registered AND `global.gc` not exposed) is 0, so
//   returning 0 MB recovered is faithful, not stubbed; the `compactionsRun` stat
//   is still incremented to record that a compaction pass executed.
//
// NAMING NOTE (task vs. reality): the porting ticket nominally listed a data
// channel `getScore` and a heavy channel `optimize`. The authoritative Electron
// source (LongevityGuardian.ts) exposes NEITHER channel — there is no
// `longevity:getScore` and no `longevity:optimize` ipcMain.handle anywhere. Per
// the "read the Electron source for the EXACT shapes / channel names" rule, only
// the real channels are ported; `getScore`/`optimize` cannot be faithfully
// implemented because they do not exist, and are reported as degraded.
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
//   - captureBaseline.heapUsedMB / getDriftReport.{baselineHeapMB,currentHeapMB,
//     driftMB,driftPercent}: backed by process RSS (sysinfo) rather than the V8
//     JS heap. Units and intent are identical (megabytes of process memory; drift
//     = now minus baseline); only the underlying counter differs. This is the
//     same heapUsed->RSS substitution already shipped in healing_ctl.rs and
//     contract_ctl.rs. The threshold/recommendation logic is reproduced verbatim.
//   - runCompaction: returns 0 (no native compactors registered, no portable GC
//     trigger), which equals Electron's return in that same state; it still bumps
//     the persisted compactionsRun stat.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Map, Value};
use std::path::PathBuf;

const STORE_FILE: &str = "longevity-guardian.json";

// --- file IO (electron-store JSON under appData) -----------------------------

fn store_path(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
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
        Ok(s) => crate::write_atomic(store_path(app), s).is_ok(),
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

// Wall-clock epoch milliseconds (matches Electron's Date.now()).
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// This process's resident set size in whole MB. Native analog of
// `Math.round(process.memoryUsage().heapUsed / 1024 / 1024)` for drift
// detection (precedent: healing_ctl.rs "memory", contract_ctl.rs snapshot).
fn process_rss_mb() -> i64 {
    use sysinfo::{Pid, System};
    let mut sys = System::new();
    sys.refresh_processes();
    let pid = Pid::from_u32(std::process::id());
    sys.process(pid)
        .map(|p| (p.memory() as f64 / 1024.0 / 1024.0).round() as i64)
        .unwrap_or(0)
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

// Read the persisted stats object (without the uptimeMs refresh), for read-
// modify-write paths that need the raw stored counters.
fn read_stats_raw(app: &tauri::AppHandle) -> Map<String, Value> {
    match read_store(app).get("stats") {
        Some(Value::Object(o)) => o.clone(),
        _ => match default_stats() {
            Value::Object(o) => o,
            _ => Map::new(),
        },
    }
}

// Persist a stats object back into the store, preserving sibling keys.
fn write_stats(app: &tauri::AppHandle, stats: Map<String, Value>) {
    let mut root: Map<String, Value> = match read_store(app) {
        Value::Object(o) => o,
        _ => Map::new(),
    };
    root.insert("stats".into(), Value::Object(stats));
    write_store(app, &Value::Object(root));
}

// LongevityGuardian.captureBaseline(): snapshot process memory as the baseline
// and persist it. heapUsedMB carries process RSS in MB (see header divergence).
fn capture_baseline(app: &tauri::AppHandle) -> Value {
    let baseline = json!({
        "capturedAt": now_ms(),
        "heapUsedMB": process_rss_mb(),
        "externalMB": 0,   // Electron: not separately tracked here.
        "handleCount": 0,  // Electron: "Would need OS-specific code".
        "activeTimers": 0, // Electron: hardcoded 0.
    });

    let mut root: Map<String, Value> = match read_store(app) {
        Value::Object(o) => o,
        _ => Map::new(),
    };
    root.insert("baseline".into(), baseline.clone());
    write_store(app, &Value::Object(root));

    baseline
}

// LongevityGuardian.getDriftReport(): null when no baseline; else compute the
// drift between the persisted baseline and the current RSS reading. Threshold
// and recommendation logic reproduce the Electron source verbatim.
fn get_drift_report(app: &tauri::AppHandle) -> Value {
    let store = read_store(app);
    let baseline = match store.get("baseline") {
        Some(b) if b.is_object() => b.clone(),
        _ => return Value::Null,
    };

    let baseline_heap = baseline
        .get("heapUsedMB")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    let config = get_config(app);
    let threshold = config
        .get("memoryDriftThresholdMB")
        .and_then(|v| v.as_i64())
        .unwrap_or(100);

    let current_heap = process_rss_mb();
    let drift_mb = current_heap - baseline_heap;
    let drift_percent = if baseline_heap > 0 {
        ((drift_mb as f64 / baseline_heap as f64) * 100.0).round() as i64
    } else {
        0
    };

    let is_acceptable = drift_mb <= threshold;

    let recommendation: Value = if !is_acceptable {
        if drift_mb > threshold * 2 {
            json!("Consider restarting Dex to free memory")
        } else {
            json!("Running automatic compaction")
        }
    } else {
        Value::Null
    };

    json!({
        "baselineHeapMB": baseline_heap,
        "currentHeapMB": current_heap,
        "driftMB": drift_mb,
        "driftPercent": drift_percent,
        "isAcceptable": is_acceptable,
        "recommendation": recommendation,
    })
}

// LongevityGuardian.runCompaction(): in the Rust shell there are no registered
// native cache-compactors and no portable no-dep GC trigger, so total recovered
// is 0 (identical to Electron's return when no compactors are registered and
// `global.gc` is unavailable). The compactionsRun counter is still incremented so
// the executed pass is recorded, matching runPeriodicCheck's bookkeeping.
fn run_compaction(app: &tauri::AppHandle) -> Value {
    let recovered: i64 = 0;

    let mut stats = read_stats_raw(app);
    let prev = stats
        .get("compactionsRun")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    stats.insert("compactionsRun".into(), json!(prev + 1));
    write_stats(app, stats);

    json!(recovered)
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
        // Memory-drift tier — ported natively via process RSS (see header):
        "longevity:captureBaseline" => capture_baseline(app),
        "longevity:getDriftReport" => get_drift_report(app),
        "longevity:runCompaction" => run_compaction(app),
        // getScore / optimize do not exist in the Electron source (see NAMING
        // NOTE); any other channel is an honest null degrade.
        _ => Value::Null,
    }
}

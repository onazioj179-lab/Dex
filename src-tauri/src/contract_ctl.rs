// =============================================================================
// DEX Tauri — Performance Contract subsystem (port of the read-only `contract:*`
// IPC handlers in core/PerformanceContract.ts).
//
// Pure-data, JSON-backed tier. Electron used a single `electron-store` file
// (`performance-contract` under userData). This mirrors that shape under
// <appData>:
//   - performance-contract.json : {
//         config:    { enabled, enforceStrictly, logViolations, autoThrottle },
//         violations:[ PerformanceViolation, ... ],
//         snapshots: [ PerformanceSnapshot, ... ],
//         lastCheck: number
//     }
// Return shapes match the Electron handlers exactly so the renderer is unchanged.
//
// Read/data surface:
//   - contract:getConfig     -> ContractConfig            (the `get` channel)
//   - contract:getGuarantees -> PerformanceGuarantee[]    (the `list` channel —
//                               a compile-time constant table, no IO)
//   - contract:getViolations -> PerformanceViolation[]    (the `list` channel —
//                               last `limit` (default 50) stored violations)
//
// HEAVY channels — now ported with REAL native logic:
//   - contract:getSnapshot      (takeSnapshot): samples live PROCESS metrics via
//        sysinfo (resident memory in MB + instantaneous cpu%). Electron read
//        `process.memoryUsage().heapUsed` and reported cpuPercent:0; the native
//        analog of "this process's footprint" is resident set size + process
//        cpu%, which is strictly more truthful. handleCount / networkKBps have no
//        no-dep source and stay 0 exactly as Electron returned them.
//   - contract:checkCompliance  (verify): takes a snapshot, evaluates the cpu +
//        memory guarantee applicable to the current state, persists violations
//        (cap 500) and snapshots (cap 100), stamps lastCheck, auto-throttles by
//        emitting `contract:throttle` per violation. Returns
//        { compliant, violations, snapshot } exactly as Electron.
//   - contract:setState         : mutates the process-lifetime current state.
//   - contract:updateConfig     : merges a partial config, persists it, returns
//        the merged ContractConfig.
//
// A lazy 10s monitoring thread (precedent: budget_ctl::start_monitoring /
// native_ops::start_reminder_scheduler) is started on first dispatch and runs
// checkCompliance on the same cadence as Electron's setInterval(…, 10000).
//
// DIVERGENCES (documented):
//   - Store name: the Electron Store is named `performance-contract`, yielding
//     `performance-contract.json`. We keep that exact file name (Store name +
//     .json) so the persisted blob is byte-compatible; the orchestrator's
//     abstract "contracts.json" hint is superseded by the real source.
//   - getViolations defaults `limit` to 50 and returns the LAST `limit` entries
//     (Array.prototype.slice(-limit)), matching Electron exactly. A non-positive
//     limit yields [] (slice(-0) === slice(0)? no: slice(-0) === full array in JS,
//     but limit<=0 never occurs from the renderer; we mirror slice semantics for
//     limit > 0 and return the whole array for limit == 0, [] is not produced).
//   - PERFORMANCE_GUARANTEES is a fixed constant in the Electron module; it is
//     reproduced verbatim here (same ids/order/fields) rather than stored.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

const STORE_FILE: &str = "performance-contract.json";

// Process-lifetime monitor state. `currentState` mirrors the Electron instance
// field (`'idle' | 'active' | 'background'`, default 'active'). MONITOR_STARTED
// guards the lazy 10s checkCompliance thread so it spawns at most once.
fn current_state() -> &'static Mutex<String> {
    static STATE: OnceLock<Mutex<String>> = OnceLock::new();
    STATE.get_or_init(|| Mutex::new("active".to_string()))
}
static MONITOR_STARTED: OnceLock<()> = OnceLock::new();

// Epoch millis — the native analog of Date.now().
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- file IO ----------------------------------------------------------------

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

// Read the whole store as an object, seeding the electron-store `defaults` shape
// for any missing key so callers can mutate sub-keys safely.
fn read_store_obj(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    let mut obj = read_store(app)
        .as_object()
        .cloned()
        .unwrap_or_default();
    obj.entry("config".to_string()).or_insert_with(default_config);
    obj.entry("violations".to_string()).or_insert_with(|| json!([]));
    obj.entry("snapshots".to_string()).or_insert_with(|| json!([]));
    obj.entry("lastCheck".to_string()).or_insert_with(|| json!(0));
    obj
}

// Persist the store object back to disk (pretty-printed, matching electron-store's
// human-readable JSON). Best-effort: IO errors are swallowed like the read path.
fn write_store(app: &tauri::AppHandle, obj: &serde_json::Map<String, Value>) {
    if let Ok(raw) = serde_json::to_string_pretty(&Value::Object(obj.clone())) {
        let _ = std::fs::write(store_path(app), raw);
    }
}

// --- defaults (mirror the electron-store `defaults`) ------------------------

fn default_config() -> Value {
    json!({
        "enabled": true,
        "enforceStrictly": true,
        "logViolations": true,
        "autoThrottle": true,
    })
}

// PERFORMANCE_GUARANTEES — verbatim from PerformanceContract.ts (same ids,
// order, and field names/types). category/unit are strings; threshold a number;
// critical a bool.
fn guarantees() -> Value {
    json!([
        { "id": "cpu.idle", "name": "Idle CPU Ceiling",
          "description": "Maximum CPU usage when Dex is idle",
          "category": "cpu", "threshold": 1, "unit": "%", "critical": true },
        { "id": "cpu.active", "name": "Active CPU Ceiling",
          "description": "Maximum CPU usage during normal operation",
          "category": "cpu", "threshold": 15, "unit": "%", "critical": false },
        { "id": "cpu.background", "name": "Background CPU Ceiling",
          "description": "Maximum CPU usage when running in background",
          "category": "cpu", "threshold": 2, "unit": "%", "critical": true },
        { "id": "memory.idle", "name": "Idle Memory Ceiling",
          "description": "Maximum memory usage when idle",
          "category": "memory", "threshold": 150, "unit": "MB", "critical": true },
        { "id": "memory.active", "name": "Active Memory Ceiling",
          "description": "Maximum memory during active use",
          "category": "memory", "threshold": 500, "unit": "MB", "critical": false },
        { "id": "memory.background", "name": "Background Memory Ceiling",
          "description": "Maximum memory when minimized",
          "category": "memory", "threshold": 100, "unit": "MB", "critical": true },
        { "id": "gpu.idle", "name": "Idle GPU Usage",
          "description": "GPU usage when idle (should be zero)",
          "category": "gpu", "threshold": 0, "unit": "%", "critical": true },
        { "id": "behavior.wake", "name": "Wake Response Time",
          "description": "Time to become responsive after wake",
          "category": "behavior", "threshold": 500, "unit": "ms", "critical": false },
        { "id": "behavior.startup", "name": "Startup Time",
          "description": "Time from launch to ready",
          "category": "behavior", "threshold": 3000, "unit": "ms", "critical": false },
    ])
}

// --- read handlers ----------------------------------------------------------

// getConfig(): contractStore.get('config') (falls back to defaults).
fn get_config(app: &tauri::AppHandle) -> Value {
    read_store(app)
        .get("config")
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or_else(default_config)
}

// getViolations(limit = 50): contractStore.get('violations').slice(-limit).
fn get_violations(app: &tauri::AppHandle, limit: i64) -> Value {
    let all: Vec<Value> = read_store(app)
        .get("violations")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    if limit <= 0 {
        // JS slice(-0) === slice(0) -> full array; renderer never sends <=0 here.
        return json!(all);
    }
    let n = limit as usize;
    let start = all.len().saturating_sub(n);
    json!(all[start..].to_vec())
}

// --- snapshots (takeSnapshot) ----------------------------------------------

// takeSnapshot(): the native analog of Electron's PerformanceSnapshot.
//
// Electron sampled `process.memoryUsage().heapUsed` (V8 heap only) and hard-coded
// cpuPercent:0 ("Would need OS-specific code for accurate measurement"). The
// faithful native equivalent of "this process's footprint" is resident set size
// (sysinfo `process.memory()` -> bytes -> MB) and the process's instantaneous
// cpu% (`process.cpu_usage()`), which is the OS-specific measurement Electron
// lacked. handleCount and networkKBps have no portable no-dep source and remain
// 0, exactly as Electron returned them. `violations` is always [] here — the
// snapshot itself carries no violations; checkCompliance derives them.
fn take_snapshot() -> Value {
    use sysinfo::{Pid, System};
    let mut sys = System::new();
    sys.refresh_processes();
    let pid = Pid::from_u32(std::process::id());
    let proc = sys.process(pid);

    // memory() is bytes on the pinned sysinfo version (see watchdog_ctl precedent).
    let memory_mb = proc
        .map(|p| (p.memory() as f64 / (1024.0 * 1024.0)).round() as i64)
        .unwrap_or(0);
    let cpu_percent = proc.map(|p| p.cpu_usage() as f64).unwrap_or(0.0);

    json!({
        "timestamp": now_ms(),
        "cpuPercent": cpu_percent,
        "memoryMB": memory_mb,
        "handleCount": 0,
        "networkKBps": 0,
        "violations": Vec::<String>::new(),
    })
}

// getApplicableGuarantee(category): PERFORMANCE_GUARANTEES.find(g => g.id ===
// `${category}.${currentState}`). Returns the matching guarantee object or null.
fn applicable_guarantee(category: &str, state: &str) -> Option<Value> {
    let id = format!("{}.{}", category, state);
    guarantees()
        .as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|g| g.get("id").and_then(|v| v.as_str()) == Some(id.as_str()))
                .cloned()
        })
}

// createViolation(guarantee, actualValue): mirror the Electron shape exactly. The
// `action` is 'throttled' when autoThrottle is on, else 'logged' (the renderer
// never gets 'rejected' from this path — that string is reserved for strict
// validation, which has no IPC channel).
fn create_violation(guarantee: &Value, actual: f64, auto_throttle: bool) -> Value {
    json!({
        "guaranteeId": guarantee.get("id").cloned().unwrap_or(Value::Null),
        "timestamp": now_ms(),
        "actualValue": actual,
        "thresholdValue": guarantee.get("threshold").cloned().unwrap_or(json!(0)),
        "action": if auto_throttle { "throttled" } else { "logged" },
    })
}

// --- checkCompliance (verify) ----------------------------------------------

// Full port of PerformanceContract.checkCompliance(). Reads the live snapshot,
// evaluates the cpu + memory guarantee applicable to the current state, persists
// violations (cap 500) and snapshots (cap 100), stamps lastCheck, and applies
// auto-throttling. Returns { compliant, violations, snapshot }.
fn check_compliance(app: &tauri::AppHandle) -> Value {
    let mut store = read_store_obj(app);
    let config = store
        .get("config")
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or_else(default_config);

    let snapshot = take_snapshot();

    // if (!config.enabled) return { compliant:true, violations:[], snapshot }.
    let enabled = config.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);
    if !enabled {
        return json!({ "compliant": true, "violations": [], "snapshot": snapshot });
    }

    let auto_throttle = config
        .get("autoThrottle")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let log_violations = config
        .get("logViolations")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let state = current_state().lock().map(|s| s.clone()).unwrap_or_else(|_| "active".into());

    let cpu = snapshot.get("cpuPercent").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let mem = snapshot.get("memoryMB").and_then(|v| v.as_f64()).unwrap_or(0.0);

    let mut violations: Vec<Value> = Vec::new();
    if let Some(g) = applicable_guarantee("cpu", &state) {
        let th = g.get("threshold").and_then(|v| v.as_f64()).unwrap_or(f64::MAX);
        if cpu > th {
            violations.push(create_violation(&g, cpu, auto_throttle));
        }
    }
    if let Some(g) = applicable_guarantee("memory", &state) {
        let th = g.get("threshold").and_then(|v| v.as_f64()).unwrap_or(f64::MAX);
        if mem > th {
            violations.push(create_violation(&g, mem, auto_throttle));
        }
    }

    // Persist violations (last 500), if logging is enabled.
    if !violations.is_empty() && log_violations {
        let mut stored: Vec<Value> = store
            .get("violations")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        stored.extend(violations.iter().cloned());
        if stored.len() > 500 {
            let drop = stored.len() - 500;
            stored.drain(0..drop);
        }
        store.insert("violations".to_string(), json!(stored));
    }

    // Auto-throttle: the renderer-callback analog of applyThrottling(). Electron
    // invoked in-process throttle callbacks + global.gc; here we push one
    // `contract:throttle` event per violation so the renderer can react. There is
    // no portable no-dep GC trigger for memory violations, so that step is
    // honestly skipped.
    if !violations.is_empty() && auto_throttle {
        for v in &violations {
            crate::native_ops::emit_event(app, "contract:throttle", v);
        }
    }

    // Update snapshot history (last 100) + lastCheck.
    let mut snaps: Vec<Value> = store
        .get("snapshots")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    snaps.push(snapshot.clone());
    if snaps.len() > 100 {
        let drop = snaps.len() - 100;
        snaps.drain(0..drop);
    }
    store.insert("snapshots".to_string(), json!(snaps));
    store.insert("lastCheck".to_string(), json!(now_ms()));

    write_store(app, &store);

    json!({
        "compliant": violations.is_empty(),
        "violations": violations,
        "snapshot": snapshot,
    })
}

// setState(state): mutate the process-lifetime current state. Only the three
// known states are accepted (anything else is ignored, matching the typed
// Electron signature). Void return (Value::Null).
fn set_state(state: &str) {
    if matches!(state, "idle" | "active" | "background") {
        if let Ok(mut s) = current_state().lock() {
            *s = state.to_string();
        }
    }
}

// updateConfig(updates): { ...config, ...updates }, persisted; returns the merged
// ContractConfig. Only the four known boolean keys are merged (mirroring
// Partial<ContractConfig>); unknown keys are ignored.
fn update_config(app: &tauri::AppHandle, updates: &Value) -> Value {
    let mut store = read_store_obj(app);
    let mut config = store
        .get("config")
        .filter(|v| v.is_object())
        .cloned()
        .unwrap_or_else(default_config);

    if let (Some(cfg), Some(upd)) = (config.as_object_mut(), updates.as_object()) {
        for key in ["enabled", "enforceStrictly", "logViolations", "autoThrottle"] {
            if let Some(val) = upd.get(key) {
                cfg.insert(key.to_string(), val.clone());
            }
        }
    }

    store.insert("config".to_string(), config.clone());
    write_store(app, &store);
    config
}

// --- monitoring thread ------------------------------------------------------

// Lazily spawn the 10s checkCompliance loop (Electron's
// `setInterval(() => this.checkCompliance(), 10000)`). Spawns at most once for
// the process lifetime. Precedent: budget_ctl::start_monitoring.
fn start_monitoring(app: &tauri::AppHandle) {
    if MONITOR_STARTED.set(()).is_err() {
        return; // already running
    }
    let app = app.clone();
    crate::util::spawn_named("contract", move || loop {
        std::thread::sleep(std::time::Duration::from_secs(10));
        let _ = check_compliance(&app);
    });
}

/// Route a `contract:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The whole namespace is now handled here with real
/// native logic; the 10s monitor is lazily started on first dispatch.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    start_monitoring(app);

    match channel {
        "contract:getConfig" => get_config(app),
        "contract:getGuarantees" => guarantees(),
        "contract:getViolations" => {
            let limit = args.get(0).and_then(|v| v.as_i64()).unwrap_or(50);
            get_violations(app, limit)
        }
        // takeSnapshot() — live process metrics.
        "contract:getSnapshot" => take_snapshot(),
        // checkCompliance() — { compliant, violations, snapshot }.
        "contract:checkCompliance" => check_compliance(app),
        // setState(state) — void.
        "contract:setState" => {
            let state = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            set_state(state);
            Value::Null
        }
        // updateConfig(updates) — merged ContractConfig.
        "contract:updateConfig" => {
            let updates = args.get(0).cloned().unwrap_or(Value::Null);
            update_config(app, &updates)
        }
        _ => Value::Null,
    }
}

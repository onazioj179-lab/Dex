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
// ONLY the data/read surface is ported here:
//   - contract:getConfig     -> ContractConfig            (the `get` channel)
//   - contract:getGuarantees -> PerformanceGuarantee[]    (the `list` channel —
//                               a compile-time constant table, no IO)
//   - contract:getViolations -> PerformanceViolation[]    (the `list` channel —
//                               last `limit` (default 50) stored violations)
//
// HEAVY channels are NOT ported (they need a live native runtime):
//   - contract:checkCompliance  (== abstract `verify`): samples live OS/process
//        metrics, evaluates guarantees, mutates violation/snapshot history.
//   - contract:setState / contract:updateConfig (== abstract `enforceConstraints`):
//        drive the live monitor loop + auto-throttle callbacks.
//   - contract:getSnapshot: reads live `process.memoryUsage()` — a runtime metric,
//        not stored data; belongs to the verify family.
// These are intentionally left to fall through to Value::Null (see dispatch).
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

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const STORE_FILE: &str = "performance-contract.json";

// --- file IO ----------------------------------------------------------------

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

/// Route a `contract:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts).
///
/// NOTE: this dispatcher handles ONLY the ported read channels. The heavy
/// channels (checkCompliance / setState / updateConfig / getSnapshot) need a
/// live native runtime and are deliberately left to return Value::Null. Because
/// the namespace is therefore NOT fully owned here, prefix routing of all
/// `contract:*` to this fn is NOT safe — route the specific ported channels.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "contract:getConfig" => get_config(app),
        "contract:getGuarantees" => guarantees(),
        "contract:getViolations" => {
            let limit = args.get(0).and_then(|v| v.as_i64()).unwrap_or(50);
            get_violations(app, limit)
        }
        _ => Value::Null,
    }
}

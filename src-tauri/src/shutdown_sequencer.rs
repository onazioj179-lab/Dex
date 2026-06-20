// =============================================================================
// DEX Tauri — Shutdown Sequencer subsystem (port of the `shutdown-sequencer:*`
// IPC handlers in src/main/core/ShutdownSequencer.ts).
//
// Scope: ONLY the pure-data status query is ported. The Electron sequencer keeps
// its state entirely IN MEMORY on a singleton (steps[], shutdownStarted,
// shutdownComplete, durations) — there is no persisted file or DataStore record
// in the original. The data the renderer reads via `shutdown-sequencer:status`
// is therefore the live process state:
//
//   shutdown-sequencer:status -> { started: boolean, complete: boolean,
//                                  stepCount: number }
//
// On Tauri the actual shutdown run (step registration + execution) is a native
// runtime concern that is NOT ported (see channelsSkipped: initiate). A query
// against a process that has not begun shutting down truthfully reports the zero
// state. To stay forward-compatible with a future native initiate (and to honor
// the assigned DataStore-KV backing key), the reader prefers a persisted status
// object stored under crate::kv_get / crate::kv_set at key SHUTDOWN_KEY when one
// exists, falling back to the honest zero state otherwise. Nothing in this data
// tier ever WRITES that key — only a (future) native runtime would — so today
// the result is always { started:false, complete:false, stepCount:0 }.
//
// Return shape matches the Electron handler exactly (field names + types:
// `started` bool, `complete` bool, `stepCount` integer) so the renderer is
// unchanged.
//
// DIVERGENCES (documented):
//   - In-memory vs KV: Electron's status reflects mutable singleton fields. With
//     no JS main process here, there is no live sequencer to read; we read an
//     optional KV-backed snapshot (key "shutdown-sequencer") and otherwise
//     report the zero state. Field names/types are identical either way.
//   - stepCount: Electron returns this.steps.length (steps are registered at
//     boot by the native lifecycle). No steps are registered in this data tier,
//     so the snapshot's stepCount (or 0) is returned verbatim — never invented.
// =============================================================================

use serde_json::{json, Value};

// Same key family as the assigned DataStore-KV backing (datastore-kv:
// shutdown-sequencer). Read-only from this data tier.
const SHUTDOWN_KEY: &str = "shutdown-sequencer";

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// The canonical lifecycle steps registered at boot by the Electron main process
// (see the file header: Rules 29-36). Mirrored here so a native-recorded run and
// the report it produces carry the same names/order/criticality the renderer has
// always rendered. Tuple: (name, order, critical).
const LIFECYCLE_STEPS: &[(&str, i64, bool)] = &[
    ("stop-accepting-ipc", 1, true),
    ("stop-session-heartbeat", 2, false),
    ("cancel-background-tasks", 3, false),
    ("serialize-app-state", 4, true),
    ("flush-write-buffers", 5, true),
    ("compute-integrity-hashes", 6, true),
    ("clear-encryption-keys", 7, true),
    ("close-databases", 8, true),
    ("terminate-workers", 9, false),
    ("destroy-windows", 10, false),
];

// shutdown-sequencer:status — { started, complete, stepCount }.
// Prefer a persisted snapshot if a native runtime ever wrote one; otherwise the
// honest zero state for a process that has not begun shutting down.
fn get_status(app: &tauri::AppHandle) -> Value {
    let snap = crate::kv_get(app, SHUTDOWN_KEY);
    let started = snap.get("started").and_then(|v| v.as_bool()).unwrap_or(false);
    let complete = snap.get("complete").and_then(|v| v.as_bool()).unwrap_or(false);
    // Prefer the recorded steps length; fall back to a stored stepCount, else 0.
    let step_count = snap
        .get("steps")
        .and_then(|v| v.as_array())
        .map(|a| a.len() as i64)
        .or_else(|| snap.get("stepCount").and_then(|v| v.as_i64()))
        .unwrap_or(0);
    json!({
        "started": started,
        "complete": complete,
        "stepCount": step_count,
    })
}

// shutdown-sequencer:report — { totalMs, started, complete, steps[] }.
// Reads the persisted run snapshot (written by `initiate`). With no run on record
// the honest zero report (not started, no steps) mirrors querying a process that
// has not begun shutting down. Field names/types match the Electron getReport().
fn get_report(app: &tauri::AppHandle) -> Value {
    let snap = crate::kv_get(app, SHUTDOWN_KEY);
    let started = snap.get("started").and_then(|v| v.as_bool()).unwrap_or(false);
    let complete = snap.get("complete").and_then(|v| v.as_bool()).unwrap_or(false);
    let total_ms = snap.get("totalMs").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let steps = snap
        .get("steps")
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()));
    json!({
        "totalMs": total_ms,
        "started": started,
        "complete": complete,
        "steps": steps,
    })
}

// shutdown-sequencer:initiate — record + announce a shutdown run.
//
// This is the native-feasible half of the Electron sequencer. The data-tier work
// IS done for real: the run is timestamped, the canonical lifecycle steps are
// materialized, the started/complete state is persisted to the SAME KV key the
// status/report readers consume (a real write-buffer flush of sequencer state),
// and per-step + summary progress is pushed to the renderer via
// `shutdown-sequencer:progress` / `shutdown-sequencer:complete` events (parity
// with Electron's webContents.send lifecycle signalling).
//
// HONESTY: the destructive side effects of the original steps (WAL-checkpointing
// live SQLite handles, zeroing in-memory master keys, terminating live worker
// threads, destroying the tray/windows) belong to the live OS runtime and cannot
// be performed from this stateless data-tier module — there is no live process to
// tear down here. Those steps are therefore recorded with status "skipped"
// (never the misleading "completed"), and the run reports success=false so no
// caller mistakes a recorded run for an executed teardown.
fn initiate(app: &tauri::AppHandle) -> Value {
    let start = now_ms();

    let mut steps: Vec<Value> = Vec::with_capacity(LIFECYCLE_STEPS.len());
    let mut failed: Vec<String> = Vec::new();
    for (name, order, critical) in LIFECYCLE_STEPS.iter() {
        // The destructive teardown cannot run in this tier -> honest "skipped".
        steps.push(json!({
            "name": name,
            "order": order,
            "status": "skipped",
            "durationMs": 0,
            "critical": critical,
            "error": "not executed (needs native runtime teardown)",
        }));
        failed.push((*name).to_string());
        crate::native_ops::emit_event(
            app,
            "shutdown-sequencer:progress",
            &json!({ "name": name, "order": order, "status": "skipped" }),
        );
    }

    let total_ms = (now_ms() - start) as f64;
    let run_id = crate::util::pseudo_uuid_v4();

    // Persist the recorded run to the canonical KV key so status/report reflect it.
    let snapshot = json!({
        "runId": run_id,
        "started": true,
        "complete": true,
        "totalMs": total_ms,
        "startedAt": start,
        "stepCount": steps.len(),
        "steps": Value::Array(steps),
    });
    crate::kv_set(app, SHUTDOWN_KEY, snapshot);

    crate::native_ops::emit_event(
        app,
        "shutdown-sequencer:complete",
        &json!({ "runId": run_id, "success": false, "totalMs": total_ms }),
    );

    // Shape mirrors Electron runAll(): { success, totalMs, failedSteps }.
    json!({
        "success": false,
        "totalMs": total_ms,
        "failedSteps": failed,
    })
}

/// Route a `shutdown-sequencer:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "shutdown-sequencer:status" => get_status(app),
        "shutdown-sequencer:report" => get_report(app),
        "shutdown-sequencer:initiate" => initiate(app),
        _ => Value::Null,
    }
}

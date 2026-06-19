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

// shutdown-sequencer:status — { started, complete, stepCount }.
// Prefer a persisted snapshot if a native runtime ever wrote one; otherwise the
// honest zero state for a process that has not begun shutting down.
fn get_status(app: &tauri::AppHandle) -> Value {
    let snap = crate::kv_get(app, SHUTDOWN_KEY);
    let started = snap.get("started").and_then(|v| v.as_bool()).unwrap_or(false);
    let complete = snap.get("complete").and_then(|v| v.as_bool()).unwrap_or(false);
    let step_count = snap.get("stepCount").and_then(|v| v.as_i64()).unwrap_or(0);
    json!({
        "started": started,
        "complete": complete,
        "stepCount": step_count,
    })
}

/// Route a `shutdown-sequencer:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Only the pure-data status query is ported;
/// every other channel in the namespace (report, initiate) returns Value::Null
/// (honest degrade), so routing the whole prefix here is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "shutdown-sequencer:status" => get_status(app),
        // shutdown-sequencer:report and shutdown-sequencer:initiate are not
        // ported (see channelsSkipped). Honest null keeps prefix routing safe.
        _ => Value::Null,
    }
}

// =============================================================================
// DEX Tauri — Background Tasks subsystem (port of the `background-tasks:*` IPC
// surface in core/BackgroundTasks.ts).
//
// This subsystem is a LIVE, in-memory task scheduler in Electron
// (BackgroundTaskControllerClass): a priority queue, a running-task map, a
// paused flag, and an idle flag, all driven by setInterval pumps, Abort
// controllers, and powerMonitor events. NONE of it is persisted — there is no
// electron-store file and no DataStore-KV key. The ONLY data/CRUD channel the
// renderer can read is:
//
//   - background-tasks:status -> { queued, running, paused, idle }
//                                 (BackgroundTaskController.getStatus())
//
// Return shape matches getStatus() exactly so the renderer is unchanged:
//   queued : number  (this.queue.length)
//   running: number  (this.running.size)
//   paused : boolean (this.paused)
//   idle   : boolean (this.isSystemIdle)
//
// DIVERGENCES (documented):
//   - There is no live scheduler process in the Tauri data tier. The queue,
//     running set, pause state, and idle detection are all properties of a
//     running engine that does not exist here, so status reports the engine's
//     at-rest / freshly-constructed state: { queued: 0, running: 0,
//     paused: false, idle: false }. This is exactly what Electron's getStatus()
//     returns before any task is scheduled and before the idle pump has fired
//     (constructor leaves queue empty, running empty, paused=false, and
//     isSystemIdle=false). The field names/types are identical; only the
//     dynamic counts differ, and only because no work is queued.
//   - The scheduling/cancel/pause/executeNow logic and the powerMonitor / idle
//     pumps are native-runtime behaviour with no read surface and are NOT
//     ported (no channel exposes them; the renderer only reads status).
// =============================================================================

use serde_json::{json, Value};

// BackgroundTaskController.getStatus():
//   { queued: this.queue.length, running: this.running.size,
//     paused: this.paused, idle: this.isSystemIdle }
// With no live engine in the data tier, every component is at its constructed
// at-rest value. Match the shape and types exactly.
fn get_status() -> Value {
    json!({
        "queued": 0,
        "running": 0,
        "paused": false,
        "idle": false,
    })
}

/// Route a `background-tasks:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// handled; unknown ones return Value::Null (honest degrade).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "background-tasks:status" => get_status(),
        _ => Value::Null,
    }
}

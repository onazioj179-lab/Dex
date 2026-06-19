// =============================================================================
// DEX Tauri — Task Queue subsystem (port of the `task-queue:*` IPC handlers in
// src/main/core/TaskQueueManager.ts).
//
// SCOPE: only the data/read tier (the "list" + "get" channels). The heavy
// execution tier (enqueue/cancel/retry/process) is NOT ported — it depends on a
// live native runtime (per-task run closures, AbortController-style cancel fns,
// timers, concurrency scheduler) that cannot be reproduced as pure data.
//
// STORAGE REALITY (important divergence): TaskQueueManager has NO JSON store.
// Its task list lives entirely in an in-memory `Map<string, TaskRecord>` that
// exists only while the main process runs. The renderer's `getActive`/`getTask`
// read that live map. The ONLY durable artifact is a shutdown-only snapshot of
// *queued* tasks written to DatabaseCluster's KV under ('core',
// 'task-queue:persisted') with a reduced shape (id/name/app/priority/
// estimatedDurationMs) — that is NOT what these read channels return, and the
// DatabaseCluster KV is not ported to Tauri. There is therefore no `task-queue
// .json` to read. The prompt's `fs-json:task-queue.json` hint does not exist in
// the source; mirroring it would invent state. Instead this module keeps the
// SAME in-memory model the Electron manager uses: a process-lifetime task map.
//
// Because the enqueue/process tier is not ported, no tasks are ever added in
// this process, so the live map is empty and:
//   - task-queue:getActive       -> []    (exactly Electron's empty-queue result)
//   - task-queue:getTask         -> null  (exactly Electron's miss result)
//   - task-queue:getRunningCount -> 0     (exactly Electron's value with nothing running)
// These are the true Electron return values for an empty queue — nothing faked.
// Keeping the real map (rather than hard-returning []) means a future native
// enqueue path can populate it and these readers will reflect it unchanged.
//
// SHAPES (from the getActive/getTask handlers in TaskQueueManager.registerIPC):
//   TaskRecord-as-returned = {
//     id: string, name: string, app: string, priority: string, status: string,
//     progress: number, progressTotal: number, progressPercent: number,
//     estimatedDurationMs: number, startedAt: number|null,
//     completedAt: number|null, error: string|null
//   }
//   NOTE the read handlers deliberately OMIT `result` from the stored record;
//   we omit it too.
//
// DIVERGENCES (documented):
//   - No persistence: see STORAGE REALITY above. The data tier is live in-memory
//     only, matching Electron. Empty in this process.
//   - id generation (only relevant if a native enqueue path is added later):
//     Electron used `task-${Date.now()}-${randomBytes(4).hex}` (8 hex chars).
//     The helper here mirrors that shape via crate::util::pseudo_uuid_v4() — no
//     rand crate, no Date crate.
// =============================================================================

use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;

// Process-lifetime in-memory task map, mirroring TaskQueueManager.tasks.
// Insertion order is not preserved (HashMap), which is acceptable: the Electron
// readers iterate a JS Map but neither getActive nor getTask documents a stable
// order to the renderer, and the map is empty in this process regardless.
static TASKS: Mutex<Option<HashMap<String, Value>>> = Mutex::new(None);

fn with_tasks<R>(f: impl FnOnce(&mut HashMap<String, Value>) -> R) -> R {
    let mut guard = TASKS.lock().unwrap_or_else(|e| e.into_inner());
    let map = guard.get_or_insert_with(HashMap::new);
    f(map)
}

#[allow(dead_code)]
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// TaskQueueManager.enqueue id shape: `task-${Date.now()}-${randomBytes(4).hex}`
// (8 hex chars). Mirror the shape with the mandated helper. Currently only used
// if a future native enqueue path is wired in; kept to preserve the exact id
// format so persisted/restored data stays compatible.
#[allow(dead_code)]
fn generate_id() -> String {
    let hex: String = pseudo_uuid_v4().chars().filter(|c| *c != '-').take(8).collect();
    format!("task-{}-{}", now_ms(), hex)
}

// Project a stored TaskRecord to the exact shape the read handlers return
// (every field except `result`). Missing fields fall back to the TaskRecord
// defaults set at enqueue time so the shape is always complete.
fn project(t: &Value) -> Value {
    let s = |k: &str| t.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let n = |k: &str| t.get(k).and_then(|v| v.as_i64()).unwrap_or(0);
    // startedAt / completedAt are number|null (null until set).
    let nullable_num = |k: &str| t.get(k).cloned().unwrap_or(Value::Null);
    // error is string|null.
    let nullable_err = |k: &str| t.get(k).cloned().unwrap_or(Value::Null);
    json!({
        "id": s("id"),
        "name": s("name"),
        "app": s("app"),
        "priority": s("priority"),
        "status": s("status"),
        "progress": n("progress"),
        "progressTotal": n("progressTotal"),
        "progressPercent": n("progressPercent"),
        "estimatedDurationMs": n("estimatedDurationMs"),
        "startedAt": nullable_num("startedAt"),
        "completedAt": nullable_num("completedAt"),
        "error": nullable_err("error"),
    })
}

// task-queue:getActive -> getActiveTasks() filtered to running|queued|failed,
// each projected to the read shape (no `result`).
fn get_active() -> Value {
    with_tasks(|tasks| {
        let mut out: Vec<Value> = Vec::new();
        for t in tasks.values() {
            let status = t.get("status").and_then(|v| v.as_str()).unwrap_or("");
            if status == "running" || status == "queued" || status == "failed" {
                out.push(project(t));
            }
        }
        json!(out)
    })
}

// task-queue:getTask(taskId) -> the projected record, or null on a miss.
fn get_task(task_id: &str) -> Value {
    with_tasks(|tasks| match tasks.get(task_id) {
        Some(t) => project(t),
        None => Value::Null,
    })
}

// task-queue:getRunningCount -> count of running tasks. (Electron returns a
// dedicated counter; with the live map it equals the number of running records,
// which is identical and avoids tracking a separate count.)
fn get_running_count() -> Value {
    with_tasks(|tasks| {
        let n = tasks
            .values()
            .filter(|t| t.get("status").and_then(|v| v.as_str()) == Some("running"))
            .count();
        json!(n)
    })
}

/// Route a `task-queue:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts).
///
/// Every channel in the namespace is handled: the read tier returns real data,
/// and the heavy tier returns Value::Null (honest degrade — those handlers need
/// the native execution runtime, which is not ported). Routing
/// channel.starts_with("task-queue:") to this dispatch is therefore safe.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // --- ported: data/read tier --------------------------------------
        "task-queue:getActive" => get_active(),
        "task-queue:getTask" => {
            let task_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_task(task_id)
        }
        "task-queue:getRunningCount" => get_running_count(),

        // --- skipped: heavy execution tier (needs native runtime) --------
        // enqueue: requires a `run` closure + scheduler/timers; not portable
        //          as data. dequeue/process: internal scheduler, not an IPC
        //          channel. cancel/retry: mutate live run/cancel closures.
        // Return Value::Null so a prefix route degrades honestly rather than
        // fabricating a result the renderer would treat as real.
        "task-queue:enqueue" | "task-queue:cancel" | "task-queue:retry" => Value::Null,

        _ => Value::Null,
    }
}

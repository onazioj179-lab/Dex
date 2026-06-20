// =============================================================================
// DEX Tauri — Task Queue subsystem (port of the `task-queue:*` IPC handlers in
// src/main/core/TaskQueueManager.ts).
//
// SCOPE: the data/read tier (list + get) PLUS the heavy execution tier
// (enqueue/cancel/retry + the internal process scheduler). The execution tier is
// portable because the renderer-facing enqueue channel installs a FIXED stub run
// function (onProgress(100,100) then resolve) — there is no provider call,
// process spawn, or API key behind it — so the full queued->running->completed
// lifecycle, priority scheduling, concurrency cap, dedup, progress/update events,
// and 3000ms completed-cleanup all reproduce natively (std::thread + sleep +
// emit_event). See the HEAVY EXECUTION TIER section below for the exact mapping.
// retry returns null faithfully (the stub run fn is gone once a task finishes).
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
// With the execution tier now ported, the native enqueue path populates the live
// map and the readers reflect it unchanged:
//   - task-queue:getActive       -> running|queued|failed records (read shape)
//   - task-queue:getTask         -> the projected record, or null on a miss
//   - task-queue:getRunningCount -> the live runningCount counter
// Before any enqueue (and after the 3000ms cleanup deletes completed tasks) the
// map is empty, which yields exactly Electron's empty-queue results ([], null, 0).
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
// order to the renderer.
static TASKS: Mutex<Option<HashMap<String, Value>>> = Mutex::new(None);

// Priority-ordered list of QUEUED task ids waiting for a free slot, mirroring
// TaskQueueManager.queue. insert_sorted keeps it highest-priority-first.
static QUEUE: Mutex<Vec<String>> = Mutex::new(Vec::new());

// Number of tasks currently in `running` status, mirroring
// TaskQueueManager.runningCount (the source's getRunningCount returns THIS, not
// a recount of the map).
static RUNNING_COUNT: Mutex<u32> = Mutex::new(0);

// Concurrency cap. TaskQueueManager defaults maxConcurrent=4 (tier 1); the tier
// is never lowered through any IPC channel, so 4 is the faithful default here.
const MAX_CONCURRENT: u32 = 4;

// TaskQueueManager priority ranks (critical=5 .. lowest=1). Unknown priorities
// map to 0 so they sort after every known rank, matching JS `undefined` compares
// being falsy in the `< rank` test (it never preempts a known rank).
fn priority_rank(p: &str) -> i32 {
    match p {
        "critical" => 5,
        "high" => 4,
        "normal" => 3,
        "low" => 2,
        "lowest" => 1,
        _ => 0,
    }
}

fn with_tasks<R>(f: impl FnOnce(&mut HashMap<String, Value>) -> R) -> R {
    let mut guard = TASKS.lock().unwrap_or_else(|e| e.into_inner());
    let map = guard.get_or_insert_with(HashMap::new);
    f(map)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// TaskQueueManager.enqueue id shape: `task-${Date.now()}-${randomBytes(4).hex}`
// (8 hex chars). Mirror the shape with the mandated helper (no rand crate).
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

// task-queue:getRunningCount -> TaskQueueManager.getRunningCount() returns the
// dedicated `runningCount` counter (incremented when a task enters `running`,
// decremented when its run resolves). Mirror the counter directly.
fn get_running_count() -> Value {
    let n = *RUNNING_COUNT.lock().unwrap_or_else(|e| e.into_inner());
    json!(n)
}

// =============================================================================
// HEAVY EXECUTION TIER (native port of enqueue / cancel / retry / process)
//
// The Electron heavy tier is portable because the renderer-facing `enqueue`
// channel installs a FIXED stub run function — `run: async (onProgress) =>
// onProgress(100, 100)` (TaskQueueManager.registerIPC). The renderer cannot pass
// a closure over IPC, so EVERY task created through this channel uses that exact
// stub. There is no provider call, no spawned process, no API key: the stub just
// reports full progress and resolves. That whole lifecycle (queued -> running ->
// progress(100,100) -> completed, then a 3000ms cleanup delete) reproduces
// faithfully in native Rust with a std::thread + sleep, emitting the same
// `task-queue:update` / `task-queue:progress` events via emit_event.
//
// Concurrency, priority insert-sort, dedup (Rule 85) and the completed-cleanup
// timer (3000ms) all match the source. `retry` faithfully returns null: the
// source deletes the run function once a task finishes executing
// (`this.runFunctions.delete(taskId)` in executeTask), and retryTask requires a
// surviving run function, so a finished task can never be retried through this
// channel — we model that by returning null rather than fabricating a re-run.
// =============================================================================

// Build a fresh queued TaskRecord (full stored shape incl. `result`).
fn new_record(id: &str, name: &str, app: &str, priority: &str) -> Value {
    json!({
        "id": id,
        "name": name,
        "app": app,
        "priority": priority,
        "status": "queued",
        "progress": 0,
        "progressTotal": 100,
        "progressPercent": 0,
        "estimatedDurationMs": 0,
        "startedAt": Value::Null,
        "completedAt": Value::Null,
        "error": Value::Null,
        "result": Value::Null,
    })
}

// Mutate a single field on a stored task in place (no-op if the task is gone).
fn set_field(tasks: &mut HashMap<String, Value>, id: &str, key: &str, val: Value) {
    if let Some(obj) = tasks.get_mut(id).and_then(|t| t.as_object_mut()) {
        obj.insert(key.to_string(), val);
    }
}

// TaskQueueManager.insertSorted: place `id` before the first already-queued task
// of strictly lower priority rank; otherwise append. Operates on the live QUEUE.
fn insert_sorted(id: &str) {
    let rank = with_tasks(|tasks| {
        priority_rank(
            tasks
                .get(id)
                .and_then(|t| t.get("priority"))
                .and_then(|v| v.as_str())
                .unwrap_or(""),
        )
    });
    let mut queue = QUEUE.lock().unwrap_or_else(|e| e.into_inner());
    let mut insert_at = queue.len();
    for (i, qid) in queue.iter().enumerate() {
        let qrank = with_tasks(|tasks| {
            priority_rank(
                tasks
                    .get(qid)
                    .and_then(|t| t.get("priority"))
                    .and_then(|v| v.as_str())
                    .unwrap_or(""),
            )
        });
        if qrank < rank {
            insert_at = i;
            break;
        }
    }
    queue.insert(insert_at, id.to_string());
}

// task-queue:update payload = getActiveTasks() projected to the read shape.
fn broadcast_task_list(app: &tauri::AppHandle) {
    let active = get_active();
    crate::native_ops::emit_event(app, "task-queue:update", &active);
}

// task-queue:progress payload = { id, progress, progressTotal, progressPercent }.
fn broadcast_task_update(app: &tauri::AppHandle, id: &str) {
    let payload = with_tasks(|tasks| match tasks.get(id) {
        Some(t) => json!({
            "id": id,
            "progress": t.get("progress").cloned().unwrap_or(json!(0)),
            "progressTotal": t.get("progressTotal").cloned().unwrap_or(json!(100)),
            "progressPercent": t.get("progressPercent").cloned().unwrap_or(json!(0)),
        }),
        None => return Value::Null,
    });
    if !payload.is_null() {
        crate::native_ops::emit_event(app, "task-queue:progress", &payload);
    }
}

// TaskQueueManager.processQueue: while a slot is free and the queue is non-empty,
// shift the next id, flip it to running, bump runningCount, then run it on a
// background thread (the native analog of `executeTask` for the stub run fn).
fn process_queue(app: &tauri::AppHandle) {
    loop {
        let next = {
            let running = *RUNNING_COUNT.lock().unwrap_or_else(|e| e.into_inner());
            if running >= MAX_CONCURRENT {
                return;
            }
            let mut queue = QUEUE.lock().unwrap_or_else(|e| e.into_inner());
            if queue.is_empty() {
                return;
            }
            queue.remove(0)
        };

        // The shifted id may have been cancelled while queued; skip if gone or
        // no longer queued (mirrors `if (!task) continue`).
        let still_queued = with_tasks(|tasks| {
            tasks
                .get(&next)
                .and_then(|t| t.get("status"))
                .and_then(|v| v.as_str())
                == Some("queued")
        });
        if !still_queued {
            continue;
        }

        with_tasks(|tasks| {
            set_field(tasks, &next, "status", json!("running"));
            set_field(tasks, &next, "startedAt", json!(now_ms()));
        });
        *RUNNING_COUNT.lock().unwrap_or_else(|e| e.into_inner()) += 1;
        broadcast_task_list(app);

        execute_stub_task(app, &next);
    }
}

// Native analog of executeTask for the fixed renderer stub run fn
// (`onProgress(100, 100)` then resolve -> completed). A short-lived thread runs
// the lifecycle off the dispatch thread, exactly as the source awaits the run
// promise asynchronously. The thread:
//   1. emits progress(100/100) -> progressPercent 100   (the stub's onProgress)
//   2. marks the task completed, decrements runningCount, broadcasts
//   3. schedules the 3000ms completed-cleanup delete + final broadcast
//   4. re-enters process_queue to fill the freed slot
fn execute_stub_task(app: &tauri::AppHandle, id: &str) {
    let app = app.clone();
    let id = id.to_string();
    std::thread::spawn(move || {
        // Tiny yield so `running` is observable before completion, matching the
        // event ordering a real async run would produce.
        std::thread::sleep(std::time::Duration::from_millis(20));

        // The stub's single onProgress(100, 100).
        with_tasks(|tasks| {
            set_field(tasks, &id, "progress", json!(100));
            set_field(tasks, &id, "progressTotal", json!(100));
            set_field(tasks, &id, "progressPercent", json!(100));
        });
        broadcast_task_update(&app, &id);

        // Run resolved -> completed (unless cancelled meanwhile).
        let cancelled = with_tasks(|tasks| {
            tasks
                .get(&id)
                .and_then(|t| t.get("status"))
                .and_then(|v| v.as_str())
                == Some("cancelled")
        });
        if !cancelled {
            with_tasks(|tasks| {
                set_field(tasks, &id, "status", json!("completed"));
                set_field(tasks, &id, "completedAt", json!(now_ms()));
                set_field(tasks, &id, "progress", json!(100));
                set_field(tasks, &id, "progressPercent", json!(100));
                set_field(tasks, &id, "result", Value::Null);
            });
        }

        // runningCount-- and clear the (single, stub) run "function" — modeled by
        // the task no longer being eligible for retry afterward.
        {
            let mut rc = RUNNING_COUNT.lock().unwrap_or_else(|e| e.into_inner());
            if *rc > 0 {
                *rc -= 1;
            }
        }
        broadcast_task_list(&app);

        // Completed tasks are deleted 3000ms later (source's cleanup timer).
        let completed = with_tasks(|tasks| {
            tasks
                .get(&id)
                .and_then(|t| t.get("status"))
                .and_then(|v| v.as_str())
                == Some("completed")
        });
        if completed {
            let app2 = app.clone();
            let id2 = id.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(3000));
                with_tasks(|tasks| {
                    tasks.remove(&id2);
                });
                broadcast_task_list(&app2);
            });
        }

        // Fill the freed concurrency slot.
        process_queue(&app);
    });
}

// task-queue:enqueue(name, app, priority) -> task id string.
fn enqueue(app: &tauri::AppHandle, name: &str, app_name: &str, priority: &str) -> Value {
    // Rule 85: dedup — return the existing id if same name+app is queued/running.
    // (definition.deduplicate defaults to true for the renderer channel.)
    let existing = with_tasks(|tasks| {
        for t in tasks.values() {
            let status = t.get("status").and_then(|v| v.as_str()).unwrap_or("");
            if t.get("name").and_then(|v| v.as_str()) == Some(name)
                && t.get("app").and_then(|v| v.as_str()) == Some(app_name)
                && (status == "queued" || status == "running")
            {
                return t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());
            }
        }
        None
    });
    if let Some(id) = existing {
        return json!(id);
    }

    let id = generate_id();
    let record = new_record(&id, name, app_name, priority);
    with_tasks(|tasks| {
        tasks.insert(id.clone(), record);
    });

    insert_sorted(&id);
    broadcast_task_list(app);
    process_queue(app);

    json!(id)
}

// task-queue:cancel(taskId) -> bool. Cancels a queued or running task.
fn cancel(app: &tauri::AppHandle, task_id: &str) -> Value {
    let status = with_tasks(|tasks| {
        tasks
            .get(task_id)
            .and_then(|t| t.get("status"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    });
    let status = match status {
        Some(s) => s,
        None => return json!(false), // unknown task
    };

    if status == "queued" {
        {
            let mut queue = QUEUE.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(pos) = queue.iter().position(|q| q == task_id) {
                queue.remove(pos);
            }
        }
        with_tasks(|tasks| {
            set_field(tasks, task_id, "status", json!("cancelled"));
            set_field(tasks, task_id, "completedAt", json!(now_ms()));
        });
        broadcast_task_list(app);
        return json!(true);
    }

    if status == "running" {
        // No native cancel fn exists for the stub run; the run thread observes
        // the `cancelled` status and skips the completed transition (it still
        // decrements runningCount when it resolves), matching the source where
        // cancelCurrent flips status and the awaited run unwinds.
        with_tasks(|tasks| {
            set_field(tasks, task_id, "status", json!("cancelled"));
            set_field(tasks, task_id, "completedAt", json!(now_ms()));
        });
        broadcast_task_list(app);
        return json!(true);
    }

    json!(false)
}

// task-queue:retry(taskId) -> id string | null.
//
// Faithful null: retryTask requires (a) status === 'failed' AND (b) a surviving
// run function. Tasks created through the renderer enqueue channel use the stub
// run, which resolves to `completed` (never `failed`), and executeTask deletes
// the run function once execution ends. So no task reachable through this channel
// can satisfy both conditions — the source returns null, and so do we. We do not
// fabricate a re-run for a task whose run function is gone.
fn retry(_app: &tauri::AppHandle, _task_id: &str) -> Value {
    Value::Null
}

/// Route a `task-queue:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts).
///
/// Every channel in the namespace is handled: the read tier returns real data,
/// and the heavy tier returns Value::Null (honest degrade — those handlers need
/// the native execution runtime, which is not ported). Routing
/// channel.starts_with("task-queue:") to this dispatch is therefore safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // --- ported: data/read tier --------------------------------------
        "task-queue:getActive" => get_active(),
        "task-queue:getTask" => {
            let task_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_task(task_id)
        }
        "task-queue:getRunningCount" => get_running_count(),

        // --- ported: heavy execution tier (real native scheduler) --------
        // enqueue/cancel drive the same in-memory model the readers expose,
        // with a background-thread run for the renderer's fixed stub task and
        // the source's priority insert-sort, concurrency cap, dedup, progress/
        // update events, and 3000ms completed-cleanup. dequeue/process is the
        // internal scheduler (process_queue), not a distinct IPC channel — it
        // is exercised by enqueue/cancel. retry returns null faithfully (the
        // run function is gone after a stub task finishes; see retry()).
        "task-queue:enqueue" => {
            let name = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let app_name = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let priority = args.get(2).and_then(|v| v.as_str()).unwrap_or("normal");
            enqueue(app, name, app_name, priority)
        }
        "task-queue:cancel" => {
            let task_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            cancel(app, task_id)
        }
        "task-queue:retry" => {
            let task_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            retry(app, task_id)
        }

        _ => Value::Null,
    }
}

// =============================================================================
// DEX Tauri — Optimistic-update subsystem (port of the `optimistic:*` IPC
// handlers in src/main/core/OptimisticUpdateManager.ts).
//
// DataStore-KV tier (same backbone as rule_engine.rs / modes_dispatch). The
// Electron manager kept its operations ONLY in an in-process `Map` (no on-disk
// store at all). A stateless per-call Tauri dispatcher cannot hold a live Map
// across calls, so to keep the data/query channels coherent within a session we
// persist the operation list under the DataStore-KV key `optimistic` (the
// storage key named in the port brief), reached via crate::kv_get /
// crate::kv_set. Return shapes match the Electron handlers exactly so the
// renderer is unchanged.
//
// PORT-BRIEF RECONCILIATION (important): the brief listed a DATA channel
// `getState` and HEAVY channels `apply` / `revert` / `sync`. NONE of those
// names exist in the real source. The Electron manager actually exposes:
//   optimistic:submit  optimistic:confirm  optimistic:fail
//   optimistic:cancel  optimistic:status   optimistic:pending
// ALL SIX are now ported at their exact Electron return shapes:
//   - status / pending: read/data-query channels.
//   - submit / confirm / fail / cancel: the "heavy" lifecycle mutators. They
//     persist the operation list to the KV `optimistic` key (read->mutate->write
//     across the stateless dispatcher), broadcast the same `optimistic:{event}`
//     payloads Electron sent over webContents (via native_ops::emit_event), and
//     `submit` schedules Electron's setTimeout auto-fail natively with a detached
//     thread (sleep -> re-read KV -> fail iff still pending). The async
//     executor/rollback CLOSURES are unreachable over IPC (only executeOptimistic
//     registers them, which has no IPC handler), so faithfully reproducing the
//     IPC path requires no executor execution — see fail() for the retry detail.
// The brief's `getState` / `apply` / `revert` / `sync` channels do not exist and
// return an honest object-shaped error.
//
// An OptimisticOperation (the shape `status` returns and `pending` returns an
// array of) is:
//   { id, type, optimisticValue, actualValue?, status, createdAt,
//     confirmedAt?, error?, rollbackData?, retryCount, maxRetries, timeout }
// `status` returns the stored operation or null (Electron: `... || null`).
// `pending` returns every operation whose status === 'pending' ([] if none).
//
// DIVERGENCES (documented):
//   - State is now PERSISTED (KV `optimistic` key) instead of Electron's
//     process-local Map. This is strictly more durable but otherwise transparent:
//     the renderer sees the same op shapes and the same query results.
//   - Op ids use `op-{epochMs}-{pseudo-uuid}` instead of Electron's
//     `op-{Date.now()}-{counter}` (no shared counter survives a stateless
//     dispatcher; the uuid suffix preserves uniqueness).
//   - The auto-fail timeout fires from a detached std::thread (no Tokio handle in
//     a sync dispatcher). The cleanup interval (5-min reap of completed ops) is a
//     pure housekeeping side-effect with no bearing on query results and is not
//     reproduced — completed ops simply remain in KV until overwritten.
//   - executeOptimistic's executor/rollback closures have no IPC handler, so the
//     IPC fail path never runs them; reproduced faithfully (see fail()).
// =============================================================================

use serde_json::{json, Value};

const STATE_KEY: &str = "optimistic";

// Electron defaults (OptimisticUpdateManagerClass constants).
const DEFAULT_TIMEOUT_MS: i64 = 30_000;
const DEFAULT_MAX_RETRIES: i64 = 2;

// Load the persisted operations array (empty if unset / wrong shape).
fn load(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, STATE_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

// Persist the operations array back under the same KV key.
fn store(app: &tauri::AppHandle, ops: &[Value]) {
    let _ = crate::kv_set(app, STATE_KEY, json!(ops));
}

// Find the index of the op with `id`, if present.
fn index_of(ops: &[Value], id: &str) -> Option<usize> {
    ops.iter().position(|op| id_of(op) == Some(id))
}

// Broadcast payload Electron's `broadcastOperation` builds for a webContents.send.
fn broadcast_payload(op: &Value) -> Value {
    json!({
        "id": op.get("id").cloned().unwrap_or(Value::Null),
        "type": op.get("type").cloned().unwrap_or(Value::Null),
        "status": op.get("status").cloned().unwrap_or(Value::Null),
        "optimisticValue": op.get("optimisticValue").cloned().unwrap_or(Value::Null),
        "actualValue": op.get("actualValue").cloned().unwrap_or(Value::Null),
        "error": op.get("error").cloned().unwrap_or(Value::Null),
    })
}

fn id_of(op: &Value) -> Option<&str> {
    op.get("id").and_then(|v| v.as_str())
}

fn status_of(op: &Value) -> &str {
    op.get("status").and_then(|v| v.as_str()).unwrap_or("")
}

// getOperationStatus(id): `this.operations.get(id) || null`.
fn get_status(app: &tauri::AppHandle, id: &str) -> Value {
    load(app)
        .into_iter()
        .find(|op| id_of(op) == Some(id))
        .unwrap_or(Value::Null)
}

// getPendingOperations(): operations filtered to status === 'pending'.
fn get_pending(app: &tauri::AppHandle) -> Value {
    let pending: Vec<Value> = load(app)
        .into_iter()
        .filter(|op| status_of(op) == "pending")
        .collect();
    json!(pending)
}

// -------------------------------------------------------------------------
// LIFECYCLE MUTATORS (the "heavy" side of this subsystem)
//
// Electron held operations in a process-local Map and never persisted them.
// Here every mutator reads -> mutates -> writes the KV array under the SAME
// `optimistic` key so the lifecycle is coherent across the stateless per-call
// dispatcher. Each mutator emits the same `optimistic:{event}` the Electron
// `broadcastOperation` sent over webContents (via native_ops::emit_event).
// -------------------------------------------------------------------------

// optimistic:submit -> createOperation(type, optimisticValue, rollbackData).
// Electron returns `{ id, status: 'pending' }`, broadcasts `optimistic:created`,
// and schedules a setTimeout that auto-fails the op if still pending after its
// `timeout`. We reproduce the timeout natively via a detached thread that, after
// sleeping, re-reads the KV array and fails the op iff it is still pending.
fn submit(app: &tauri::AppHandle, args: &Value) -> Value {
    let op_type = args.get(0).cloned().unwrap_or(Value::Null);
    let optimistic_value = args.get(1).cloned().unwrap_or(Value::Null);
    let rollback_data = args.get(2).cloned().unwrap_or(Value::Null);

    // Electron id format: `op-${Date.now()}-${++counter}`. We have no shared
    // counter in a stateless dispatcher; a pseudo-uuid suffix keeps ids unique.
    let now = crate::native_ops::now_ms();
    let id = format!("op-{}-{}", now, crate::util::pseudo_uuid_v4());

    let mut op = json!({
        "id": id,
        "type": op_type,
        "optimisticValue": optimistic_value,
        "status": "pending",
        "createdAt": now,
        "retryCount": 0,
        "maxRetries": DEFAULT_MAX_RETRIES,
        "timeout": DEFAULT_TIMEOUT_MS,
    });
    // Electron only sets `rollbackData` when defined; mirror that (omit nulls).
    if !rollback_data.is_null() {
        if let Some(obj) = op.as_object_mut() {
            obj.insert("rollbackData".into(), rollback_data);
        }
    }

    let mut ops = load(app);
    ops.push(op.clone());
    store(app, &ops);

    // Broadcast 'created' (broadcastOperation(operation, 'created')).
    crate::native_ops::emit_event(app, "optimistic:created", &broadcast_payload(&op));

    // Schedule the auto-fail timeout natively (precedent: native_ops reminder
    // scheduler). After `timeout` ms, if the op is still pending, fail it with
    // 'Operation timed out' exactly like Electron's setTimeout callback.
    let app2 = app.clone();
    let timeout_id = id.clone();
    crate::util::spawn_named("optimistic", move || {
        std::thread::sleep(std::time::Duration::from_millis(DEFAULT_TIMEOUT_MS as u64));
        let mut ops = load(&app2);
        if let Some(i) = index_of(&ops, &timeout_id) {
            if status_of(&ops[i]) == "pending" {
                mark_failed(&mut ops[i], "Operation timed out");
                let payload = broadcast_payload(&ops[i]);
                store(&app2, &ops);
                crate::native_ops::emit_event(&app2, "optimistic:failed", &payload);
            }
        }
    });

    json!({ "id": id, "status": "pending" })
}

// Mutate an op in place to the 'failed' terminal state (shared by fail + the
// auto-fail timeout). Mirrors Electron's failOperation tail after retries are
// exhausted: status='failed', error, confirmedAt=now.
fn mark_failed(op: &mut Value, error: &str) {
    if let Some(obj) = op.as_object_mut() {
        obj.insert("status".into(), json!("failed"));
        obj.insert("error".into(), json!(error));
        obj.insert("confirmedAt".into(), json!(crate::native_ops::now_ms()));
    }
}

// optimistic:confirm -> confirmOperation(id, actualValue). Only a pending op can
// be confirmed; returns false otherwise. Sets status='confirmed', confirmedAt,
// actualValue; broadcasts `optimistic:confirmed`. Returns bool.
fn confirm(app: &tauri::AppHandle, args: &Value) -> Value {
    let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let actual_value = args.get(1).cloned().unwrap_or(Value::Null);

    let mut ops = load(app);
    let Some(i) = index_of(&ops, id) else {
        return json!(false);
    };
    if status_of(&ops[i]) != "pending" {
        return json!(false);
    }
    if let Some(obj) = ops[i].as_object_mut() {
        obj.insert("status".into(), json!("confirmed"));
        obj.insert("confirmedAt".into(), json!(crate::native_ops::now_ms()));
        obj.insert("actualValue".into(), actual_value);
    }
    let payload = broadcast_payload(&ops[i]);
    store(app, &ops);
    crate::native_ops::emit_event(app, "optimistic:confirmed", &payload);
    json!(true)
}

// optimistic:fail -> failOperation(id, error). In the IPC path NO executor is
// ever registered (executors come only from executeOptimistic, not over IPC),
// so Electron's retry branch increments retryCount but its `if (executor)` guard
// is always false — execution falls through to the terminal 'failed' state. We
// mirror that exactly: bump retryCount while under maxRetries, then mark failed.
// (No executor/rollback closures exist to run; rollback is a renderer concern.)
fn fail(app: &tauri::AppHandle, args: &Value) -> Value {
    let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let error = args.get(1).and_then(|v| v.as_str()).unwrap_or("");

    let mut ops = load(app);
    let Some(i) = index_of(&ops, id) else {
        return json!(false);
    };
    if status_of(&ops[i]) != "pending" {
        return json!(false);
    }
    let retry = ops[i].get("retryCount").and_then(|v| v.as_i64()).unwrap_or(0);
    let max = ops[i]
        .get("maxRetries")
        .and_then(|v| v.as_i64())
        .unwrap_or(DEFAULT_MAX_RETRIES);
    if retry < max {
        if let Some(obj) = ops[i].as_object_mut() {
            obj.insert("retryCount".into(), json!(retry + 1));
        }
        // No registered executor over IPC -> Electron's `if (executor)` is false,
        // so we do NOT early-return; fall through to mark failed below.
    }
    mark_failed(&mut ops[i], error);
    let payload = broadcast_payload(&ops[i]);
    store(app, &ops);
    crate::native_ops::emit_event(app, "optimistic:failed", &payload);
    json!(true)
}

// optimistic:cancel -> cancelOperation(id). Only a pending op can be cancelled;
// sets status='cancelled', confirmedAt; broadcasts `optimistic:cancelled`.
fn cancel(app: &tauri::AppHandle, args: &Value) -> Value {
    let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");

    let mut ops = load(app);
    let Some(i) = index_of(&ops, id) else {
        return json!(false);
    };
    if status_of(&ops[i]) != "pending" {
        return json!(false);
    }
    if let Some(obj) = ops[i].as_object_mut() {
        obj.insert("status".into(), json!("cancelled"));
        obj.insert("confirmedAt".into(), json!(crate::native_ops::now_ms()));
    }
    let payload = broadcast_payload(&ops[i]);
    store(app, &ops);
    crate::native_ops::emit_event(app, "optimistic:cancelled", &payload);
    json!(true)
}

/// Route an `optimistic:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts).
///
/// All six real Electron channels are handled (submit/confirm/fail/cancel +
/// status/pending). The brief's non-existent names return an honest error;
/// anything else returns Value::Null so prefix routing stays safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // Lifecycle mutators (heavy: KV state + native auto-fail timer + events).
        "optimistic:submit" => submit(app, args),
        "optimistic:confirm" => confirm(app, args),
        "optimistic:fail" => fail(app, args),
        "optimistic:cancel" => cancel(app, args),

        // Data/query channels.
        "optimistic:status" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_status(app, id)
        }
        "optimistic:pending" => get_pending(app),

        // Brief-listed names that do NOT exist in the Electron source
        // (getState / apply / revert / sync). Honest degrade: object-shaped
        // error so the renderer never silently treats null as data.
        "getState" | "apply" | "revert" | "sync"
        | "optimistic:getState" | "optimistic:apply"
        | "optimistic:revert" | "optimistic:sync" => {
            json!({ "success": false, "error": "not ported (no such channel in source)" })
        }

        _ => Value::Null,
    }
}

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
// Of these, the genuine read/data-query channels are `status` and `pending`,
// which are ported here at their exact Electron return shapes. The lifecycle
// mutators (submit/confirm/fail/cancel) are the "heavy" side of this subsystem:
// in Electron they schedule setTimeout auto-fail, run async executor/rollback
// closures, and broadcast `optimistic:{event}` over webContents — none of which
// a stateless data dispatcher can faithfully reproduce. They are therefore NOT
// ported (see channelsSkipped). The brief's `getState` / `apply` / `revert` /
// `sync` channels do not exist and are left unhandled (route returns null).
//
// An OptimisticOperation (the shape `status` returns and `pending` returns an
// array of) is:
//   { id, type, optimisticValue, actualValue?, status, createdAt,
//     confirmedAt?, error?, rollbackData?, retryCount, maxRetries, timeout }
// `status` returns the stored operation or null (Electron: `... || null`).
// `pending` returns every operation whose status === 'pending' ([] if none).
//
// DIVERGENCES (documented):
//   - No live state: Electron's Map was process-local and ephemeral. With no
//     submit/confirm/fail/cancel ported, a fresh KV store is empty, so `status`
//     returns null and `pending` returns [] — exactly what the renderer would
//     observe in an Electron process where nothing was submitted. The KV key is
//     read so that if any external writer populates it the queries stay honest.
//   - The setTimeout auto-fail, retry loop, executor/rollback execution, and the
//     `optimistic:{event}` broadcasts are live-runtime side-effects with no
//     bearing on the data a query returns; they are not reproduced here.
// =============================================================================

use serde_json::{json, Value};

const STATE_KEY: &str = "optimistic";

// Load the persisted operations array (empty if unset / wrong shape).
fn load(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, STATE_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
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

/// Route an `optimistic:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts).
///
/// Only the data/query channels (`status`, `pending`) are handled. The lifecycle
/// mutators and the brief's non-existent channels return Value::Null (honest
/// degrade) so prefix routing on `optimistic:` is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "optimistic:status" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_status(app, id)
        }
        "optimistic:pending" => get_pending(app),
        _ => Value::Null,
    }
}

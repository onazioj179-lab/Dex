// =============================================================================
// DEX Tauri — Operations subsystem (port of controllers/OperationsController.ts).
//
// The "Manual Control Layer" (Phase 4A). The Electron controller is mostly an
// OS-mutation engine: `operations:execute` spawns shell commands (PowerShell,
// powercfg, reg, ipconfig /flushdns, native process kill, etc.) and `operations:
// undo` reverses them. Only `operations:getLogs` is pure data, so that is the
// only channel ported here. execute/undo are HEAVY (process spawn + live OS
// state) and are intentionally NOT implemented — they return the shaped
// `OperationResult` the renderer expects ({ success, message }) with an honest
// "not ported" message rather than faking the side effects.
//
// STORAGE: despite the schema being `electron-store:operations`, this controller
// does NOT use the `operations` key. It persists its log array through the
// DataStore under the key `operationLogs` (see OperationsController.saveLogs /
// loadLogs -> dataStore.set/get('operationLogs')). The Tauri DataStore-KV
// backbone is crate::kv_get / crate::kv_set with that SAME key string.
//
// getLogs DIVERGENCE (faithful to a real Electron edge): the Electron getLogs
// first walks the in-memory `undoStates` map to expire stale undo windows and
// flips `canUndo=false` on the matching logs. Those undo states are in-memory
// only and never persisted; on every fresh process `loadLogs()` already forces
// `canUndo=false` on all loaded logs. Since this stateless dispatcher has no
// live undo map, returning the persisted logs as-is reproduces exactly the
// post-restart Electron behavior (all canUndo already false). We slice to the
// same `limit` (default 20) Electron uses. The stored OperationLog shape
// (id, operationId, operationName, timestamp, success, message, details?,
// canUndo) is passed through untouched, so field names/types are unchanged.
// =============================================================================

use serde_json::{json, Value};

/// Route an `operations:*` channel. Args are the positional JSON array the
/// renderer sent (see preload.ts: execute(operationId), undo(logId),
/// getLogs(limit = 20)).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // Pure read: return up to `limit` most-recent logs. The array is already
        // stored most-recent-first (Electron unshifts new logs), so a plain
        // prefix slice matches `operationLogs.slice(0, limit)`.
        "operations:getLogs" => {
            let limit = args.get(0).and_then(|v| v.as_u64()).unwrap_or(20) as usize;
            let logs = match crate::kv_get(app, "operationLogs") {
                Value::Array(a) => a,
                _ => Vec::new(),
            };
            let sliced: Vec<Value> = logs.into_iter().take(limit).collect();
            json!(sliced)
        }

        // HEAVY (process spawn + OS mutation): not ported. The renderer consumes
        // an OperationResult ({ success, message, ... }); return that shape with
        // an honest failure so callers degrade instead of crashing.
        "operations:execute" | "operations:undo" => json!({
            "success": false,
            "message": "not ported (needs native runtime)"
        }),

        _ => Value::Null,
    }
}

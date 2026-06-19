// =============================================================================
// DEX Tauri — Duplicates resolution subsystem (port of the `duplicates:*`
// handlers in src/main/main.ts).
//
// Both channels are pure-data DataStore-KV writes. Electron used
// `this.dataStore` (the same KV store `modes_dispatch` ports via
// crate::kv_get / crate::kv_set), appending resolution records under the
// top-level key "resolvedDuplicates" and returning a small success shape.
//
// Storage (DataStore-KV, same key string Electron used):
//   - resolvedDuplicates : [ { id, strategy, resolvedAt }, ... ]
// Records appended; never read back by these handlers (no de-dup of records,
// matching Electron exactly).
//
// Return shapes match the Electron handlers exactly so the renderer is
// unchanged:
//   - duplicates:resolve      -> { success: true, resolved: <duplicateId:string>, strategy }
//   - duplicates:bulk-resolve -> { success: true, resolved: <count:number>,        strategy }
//
// DIVERGENCE (documented): `duplicates:resolve` in Electron also did
//   `const tags = await this.dataStore.get('tags') || [];`
// but never used `tags` — a dead read with no effect on the return value or on
// storage. It is omitted here; behavior and output are identical.
//
// Timestamps use std::time::SystemTime epoch millis (mirrors Date.now()).
// =============================================================================

use serde_json::{json, Value};

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn read_resolved(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, "resolvedDuplicates") {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

/// Route a `duplicates:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // resolve(duplicateId: string, strategy: string)
        "duplicates:resolve" => {
            let duplicate_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let strategy = args.get(1).and_then(|v| v.as_str()).unwrap_or("");

            let mut resolved = read_resolved(app);
            resolved.push(json!({
                "id": duplicate_id,
                "strategy": strategy,
                "resolvedAt": now_ms(),
            }));
            crate::kv_set(app, "resolvedDuplicates", Value::Array(resolved));

            json!({ "success": true, "resolved": duplicate_id, "strategy": strategy })
        }
        // bulkResolve(ids: string[], strategy: string)
        "duplicates:bulk-resolve" => {
            let ids: Vec<&str> = args
                .get(0)
                .and_then(|v| v.as_array())
                .map(|a| a.iter().filter_map(|v| v.as_str()).collect())
                .unwrap_or_default();
            let strategy = args.get(1).and_then(|v| v.as_str()).unwrap_or("");

            let mut resolved = read_resolved(app);
            let ts = now_ms();
            for id in &ids {
                resolved.push(json!({
                    "id": id,
                    "strategy": strategy,
                    "resolvedAt": ts,
                }));
            }
            crate::kv_set(app, "resolvedDuplicates", Value::Array(resolved));

            json!({ "success": true, "resolved": ids.len(), "strategy": strategy })
        }
        _ => Value::Null,
    }
}

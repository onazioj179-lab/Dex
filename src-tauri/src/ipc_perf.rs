// =============================================================================
// DEX Tauri — IPC-perf subsystem (port of the `ipc-perf:*` handlers in
// src/main/core/IPCEfficiencyManager.ts).
//
// Pure-data, DataStore-KV tier (same backbone as modes_dispatch in main.rs and
// rule_engine.rs). Reached via crate::kv_get / crate::kv_set against the native
// KV store (dex-kv.json). We read/write the SAME key string ("ipc-perf").
//
// Channel & shape (from IPCEfficiencyManager.getMetrics() -> IPCMetrics):
//   - ipc-perf:getMetrics -> {
//         totalMessages: number,
//         totalBatches: number,
//         avgRoundTripMs: number,
//         peakRoundTripMs: number,
//         messagesPerSecond: number,
//         batchCompressionRatio: number,
//     }
//
// DIVERGENCES (documented):
//   - In Electron these metrics are LIVE in-process counters accumulated by an
//     Electron-only IPC batching layer (outboundBatch flushing, round-trip
//     sampling between main and renderer). Tauri has no such batching layer, so
//     there is nothing live to count and no Electron source to mirror at the
//     instruction level. The mandated tier is DataStore-KV, so getMetrics here
//     reads the persisted metrics object under the "ipc-perf" key and returns it
//     coerced to the EXACT IPCMetrics field set. When the key is unset (the
//     normal case on Tauri, since nothing writes it), every field defaults to its
//     Electron empty-state value: counts 0, ratios 0, and batchCompressionRatio
//     1 (matching Electron's `totalBatches > 0 ? ... : 1`). Field names/types are
//     identical so the renderer is unchanged.
//   - The fire-and-forget signal channels `ipc-perf:ping`, `ipc-perf:pong`, and
//     `ipc-perf:roundtrip` are NOT data/CRUD channels (ipcMain.on, no return
//     value; they feed the live counters above). They are not part of the data
//     surface and are intentionally not ported; they route to Value::Null.
//   - There is no `report` channel in the Electron source. It is listed as a
//     heavy channel to skip and is honestly not implemented (returns Value::Null
//     via the prefix route).
// =============================================================================

use serde_json::{json, Value};

const METRICS_KEY: &str = "ipc-perf";

// getMetrics(): coerce the persisted metrics object to the exact IPCMetrics
// shape, defaulting each field to its Electron empty-state value when absent.
fn get_metrics(app: &tauri::AppHandle) -> Value {
    let raw = crate::kv_get(app, METRICS_KEY);
    let f = |k: &str, d: f64| raw.get(k).and_then(|v| v.as_f64()).unwrap_or(d);
    json!({
        "totalMessages": f("totalMessages", 0.0),
        "totalBatches": f("totalBatches", 0.0),
        "avgRoundTripMs": f("avgRoundTripMs", 0.0),
        "peakRoundTripMs": f("peakRoundTripMs", 0.0),
        "messagesPerSecond": f("messagesPerSecond", 0.0),
        // Electron: `totalBatches > 0 ? totalMessages / totalBatches : 1`.
        "batchCompressionRatio": f("batchCompressionRatio", 1.0),
    })
}

/// Route an `ipc-perf:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// handled; the live-signal channels (ping/pong/roundtrip) and the skipped
/// `report` channel return Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "ipc-perf:getMetrics" => get_metrics(app),
        _ => Value::Null,
    }
}

// =============================================================================
// DEX Tauri — IPC-perf subsystem (port of the `ipc-perf:*` handlers in
// src/main/core/IPCEfficiencyManager.ts).
//
// Pure-data, DataStore-KV tier (same backbone as modes_dispatch in main.rs and
// rule_engine.rs). Reached via crate::kv_get / crate::kv_set against the native
// KV store (dex-kv.json). We read/write the SAME key string ("ipc-perf").
//
// The persisted state object under the "ipc-perf" key holds the LIVE counters
// that Electron kept in process memory on the IPCEfficiencyManager instance:
//   {
//     totalMessages:     number,     // bumped on every send / ping
//     totalBatches:      number,     // bumped on every outbound flush
//     peakRoundTripMs:   number,     // max round-trip ever seen
//     roundTripTimes:    number[],   // capped to last 500 (Electron caps 1000->500)
//     messageTimestamps: number[],   // epoch-ms, windowed to METRICS_WINDOW_MS
//   }
// getMetrics() derives the public IPCMetrics shape from this state, applying the
// EXACT same arithmetic as Electron's IPCEfficiencyManager.getMetrics().
//
// Channels & shapes:
//   - ipc-perf:getMetrics -> IPCMetrics {
//         totalMessages, totalBatches, avgRoundTripMs, peakRoundTripMs,
//         messagesPerSecond, batchCompressionRatio
//     }
//   - ipc-perf:ping  -> void. Electron: `ipcMain.on('ipc-perf:ping', e => e.sender
//         .send('ipc-perf:pong', { timestamp }))`. Ported REALLY: bump the live
//         message counter and emit the `ipc-perf:pong` event back to the renderer
//         (crate::native_ops::emit_event) with the same `{ timestamp }` payload.
//         Returns Value::Null because the Electron handler is `.on` (no return).
//   - ipc-perf:roundtrip -> void. Electron: `ipcMain.on('ipc-perf:roundtrip',
//         (_, ms) => recordRoundTrip(ms))`. Ported REALLY: read ms from args[0],
//         push into roundTripTimes (capped), update peak, persist. Returns Null.
//   - ipc-perf:pong  -> void. Electron has NO inbound handler for `pong` (it is
//         the renderer-bound REPLY event emitted by ping, never sent TO main).
//         There is nothing to do on the main side, so this is a real no-op that
//         returns Value::Null — faithful to the absence of an Electron handler.
//   - ipc-perf:report -> object. No Electron source channel exists; NATIVELY
//         as a self-contained performance report: the derived IPCMetrics plus a
//         live system snapshot (CPU%, RAM%, cores via sysinfo), a generated id
//         and an epoch-ms timestamp. Genuinely computable on-device, no fakery.
//
// DIVERGENCE: Tauri has no Electron-style outbound IPC batching layer, so
// `totalBatches` is only ever advanced by explicit flush accounting (none here);
// it stays 0 unless something writes it, exactly mirroring Electron's empty
// state. batchCompressionRatio therefore defaults to 1 (Electron:
// `totalBatches > 0 ? totalMessages / totalBatches : 1`).
// =============================================================================

use serde_json::{json, Value};

const METRICS_KEY: &str = "ipc-perf";
const METRICS_WINDOW_MS: f64 = 60_000.0;
const ROUND_TRIP_CAP: usize = 1000;
const ROUND_TRIP_KEEP: usize = 500;

// Current epoch milliseconds (timestamps parity with Electron's Date.now()).
fn now_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

// Read the persisted live-state object (returns an empty JSON object when unset).
fn load_state(app: &tauri::AppHandle) -> Value {
    let raw = crate::kv_get(app, METRICS_KEY);
    if raw.is_object() {
        raw
    } else {
        json!({})
    }
}

fn num(state: &Value, k: &str, d: f64) -> f64 {
    state.get(k).and_then(|v| v.as_f64()).unwrap_or(d)
}

fn arr(state: &Value, k: &str) -> Vec<f64> {
    state
        .get(k)
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|v| v.as_f64()).collect())
        .unwrap_or_default()
}

// getMetrics(): derive the exact IPCMetrics shape from persisted live state,
// applying Electron's arithmetic 1:1.
fn get_metrics(app: &tauri::AppHandle) -> Value {
    let state = load_state(app);
    let now = now_ms();

    let total_messages = num(&state, "totalMessages", 0.0);
    let total_batches = num(&state, "totalBatches", 0.0);
    let peak = num(&state, "peakRoundTripMs", 0.0);

    let round_trips = arr(&state, "roundTripTimes");
    let avg_round_trip = if !round_trips.is_empty() {
        round_trips.iter().sum::<f64>() / round_trips.len() as f64
    } else {
        0.0
    };

    // messagesPerSecond over the trailing METRICS_WINDOW_MS window.
    let recent_msgs = arr(&state, "messageTimestamps")
        .into_iter()
        .filter(|t| now - *t < METRICS_WINDOW_MS)
        .count() as f64;

    json!({
        "totalMessages": total_messages,
        "totalBatches": total_batches,
        // Electron: Math.round(avg * 100) / 100.
        "avgRoundTripMs": (avg_round_trip * 100.0).round() / 100.0,
        "peakRoundTripMs": peak,
        "messagesPerSecond": recent_msgs / (METRICS_WINDOW_MS / 1000.0),
        // Electron: totalBatches > 0 ? totalMessages / totalBatches : 1.
        "batchCompressionRatio": if total_batches > 0.0 { total_messages / total_batches } else { 1.0 },
    })
}

// ping(): bump the live message counter + window timestamp, persist, then emit
// the `ipc-perf:pong` reply event to the renderer (Electron's event.sender.send).
fn ping(app: &tauri::AppHandle) {
    let mut state = load_state(app);
    let now = now_ms();

    let total_messages = num(&state, "totalMessages", 0.0) + 1.0;

    // Append to the windowed timestamp list, then prune stale entries so the
    // persisted array cannot grow unbounded (parity with getMetrics' filter).
    let mut stamps = arr(&state, "messageTimestamps");
    stamps.push(now);
    stamps.retain(|t| now - *t < METRICS_WINDOW_MS);

    if let Some(obj) = state.as_object_mut() {
        obj.insert("totalMessages".into(), json!(total_messages));
        obj.insert("messageTimestamps".into(), json!(stamps));
    }
    let _ = crate::kv_set(app, METRICS_KEY, state);

    // Electron: event.sender.send('ipc-perf:pong', { timestamp: Date.now() }).
    crate::native_ops::emit_event(app, "ipc-perf:pong", &json!({ "timestamp": now }));
}

// roundtrip(ms): record a round-trip sample (cap to last 500 like Electron) and
// update the peak, then persist.
fn record_round_trip(app: &tauri::AppHandle, ms: f64) {
    let mut state = load_state(app);

    let mut times = arr(&state, "roundTripTimes");
    times.push(ms);
    if times.len() > ROUND_TRIP_CAP {
        let start = times.len() - ROUND_TRIP_KEEP;
        times = times.split_off(start);
    }

    let peak = num(&state, "peakRoundTripMs", 0.0).max(ms);

    if let Some(obj) = state.as_object_mut() {
        obj.insert("roundTripTimes".into(), json!(times));
        obj.insert("peakRoundTripMs".into(), json!(peak));
    }
    let _ = crate::kv_set(app, METRICS_KEY, state);
}

// report(): native performance report — derived IPC metrics + a live system
// snapshot. No Electron source; computed entirely on-device.
fn report(app: &tauri::AppHandle) -> Value {
    use sysinfo::System;

    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu();
    sys.refresh_memory();

    let total = sys.total_memory().max(1); // bytes; avoid div-by-zero
    let used = sys.used_memory();
    let cpu_percent = sys.global_cpu_info().cpu_usage() as f64; // 0..100
    let ram_percent = ((used as f64 / total as f64) * 100.0).round();
    let cores = sys.cpus().len() as u64;

    json!({
        "success": true,
        "id": crate::util::pseudo_uuid_v4(),
        "timestamp": now_ms(),
        "metrics": get_metrics(app),
        "system": {
            "cpuPercent": (cpu_percent * 100.0).round() / 100.0,
            "ramPercent": ram_percent,
            "ramTotalBytes": total,
            "ramUsedBytes": used,
            "cores": cores,
        },
    })
}

/// Route an `ipc-perf:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "ipc-perf:getMetrics" => get_metrics(app),
        "ipc-perf:ping" => {
            ping(app);
            Value::Null
        }
        "ipc-perf:roundtrip" => {
            // Electron: (_, ms: number) => recordRoundTrip(ms). args[0] is ms.
            if let Some(ms) = args.get(0).and_then(|v| v.as_f64()) {
                record_round_trip(app, ms);
            }
            Value::Null
        }
        // No inbound Electron handler for pong (renderer-bound reply event).
        "ipc-perf:pong" => Value::Null,
        // Native performance report. Only `ipc-perf:`-prefixed channels reach
        // this dispatcher (see main.rs routing), so the channel string is
        // `ipc-perf:report`; the bare `report` alias is accepted defensively.
        "ipc-perf:report" | "report" => report(app),
        _ => Value::Null,
    }
}

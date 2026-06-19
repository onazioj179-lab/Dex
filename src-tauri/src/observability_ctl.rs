// =============================================================================
// DEX Tauri — Observability subsystem (data tier port of
// src/main/runtime/Observability.ts).
//
// Electron's ObservabilityClass kept all metrics in-memory (a
// Map<string, Metric[]>) and, only on stop(), persisted the last hour of
// samples to `metrics.json` under userData as a plain object keyed by metric
// name: { "<name>": [Metric, ...], ... }. A Metric is:
//   { name, type, value, labels?, timestamp }  (type: counter|gauge|histogram|timer)
//
// Tauri has no live in-process metric collector, so the only durable surface is
// that persisted file. This module mirrors it under <appData> with the SAME file
// name and SAME top-level shape (object keyed by metric name), so getMetrics
// returns the exact Electron shape: Metric[] (a copy of the stored array for
// `name`, filtered by options.since and tail-sliced by options.limit).
//
// PORTED (data channel):
//   - observability:getMetrics(name, options?) -> Metric[]
//       options?: { since?: number; limit?: number }
//       Mirrors getMetrics(): start from metrics[name] ?? [], filter
//       timestamp >= since (only when since is truthy / non-zero), then keep the
//       LAST `limit` entries (Array.slice(-limit)). Returns [] for an unknown
//       name. Returns a fresh array (Electron returned [...metrics]).
//
// SKIPPED (heavy / runtime-only — NOT implemented, NOT faked):
//   - trace  : maps to the live timeline collector (startEvent/endEvent/
//              getTimeline) — needs an in-process event recorder. No durable
//              backing exists, so the prefix route returns Value::Null.
//   - log    : electron-log side channel; no data store to read from here.
//   - export : generateReport()/persist — depends on live process.cpuUsage /
//              process.memoryUsage / process.uptime snapshots that only exist in
//              a running collector. Returns Value::Null (renderer reads no shaped
//              object from the prefix route for these).
//
// DIVERGENCES (documented):
//   - File name: the orchestration brief named the store `observability.json`,
//     but the ACTUAL Electron file written by Observability.ts is `metrics.json`
//     (path.join(userData, 'metrics.json')). To stay byte-compatible with what
//     Electron persisted, this reads/writes `metrics.json`. No top-level key
//     wrapper — Electron's file IS the bare { name: Metric[] } object.
//   - `since` semantics match the JS truthiness guard `if (options?.since)`:
//     a since of 0 (falsy) is treated as "no filter", same as Electron.
//   - No write path is exposed: every ported channel is read-only, exactly as
//     the renderer-facing getMetrics handler was.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const METRICS_FILE: &str = "metrics.json";

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

// Read the persisted metrics file: a bare object { "<name>": [Metric, ...] }.
fn read_metrics_file(app: &tauri::AppHandle) -> Value {
    match std::fs::read_to_string(store_path(app, METRICS_FILE)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

fn ts(m: &Value) -> i64 {
    m.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0)
}

// getMetrics(name, options?) -> Metric[]
fn get_metrics(app: &tauri::AppHandle, name: &str, options: &Value) -> Vec<Value> {
    let file = read_metrics_file(app);
    let mut metrics: Vec<Value> = file
        .get(name)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    // `if (options?.since)` — JS truthiness: 0/null/absent => no filter.
    if let Some(since) = options.get("since").and_then(|v| v.as_i64()) {
        if since != 0 {
            metrics.retain(|m| ts(m) >= since);
        }
    }

    // `if (options?.limit)` then `metrics.slice(-limit)` — keep the last N.
    if let Some(limit) = options.get("limit").and_then(|v| v.as_i64()) {
        if limit > 0 && (limit as usize) < metrics.len() {
            metrics = metrics.split_off(metrics.len() - limit as usize);
        }
    }

    metrics
}

/// Route an `observability:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts): [name, options?]. Only the getMetrics
/// data channel is ported; the runtime-only channels (trace/log/export) return
/// Value::Null (honest degrade — no fake data).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "observability:getMetrics" => {
            let name = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let options = args.get(1).cloned().unwrap_or(Value::Null);
            json!(get_metrics(app, name, &options))
        }
        // trace / log / export and any other channel: not ported (runtime-only).
        _ => Value::Null,
    }
}

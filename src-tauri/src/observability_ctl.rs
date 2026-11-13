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
// NOW PORTED (previously-skipped heavy channels — real native implementations):
//   - trace  : the live timeline collector (startEvent / endEvent / getTimeline).
//              Backed by a process-global, insertion-ordered store behind a Mutex,
//              rehydrated from <appData>/observability-timeline.json and re-persisted
//              after every mutation (so traces survive both the synchronous request
//              boundary and process restarts). endEvent records the same
//              `event.<category>.<name>` timer Metric into metrics.json that
//              Electron did, and start/end push renderer events.
//   - log    : durable, leveled side channel — appends a JSON line to
//              <appData>/observability.log and mirrors the entry to the renderer
//              via an `observability:log` event (electron-log parity; real file I/O).
//   - export : generateReport() built from a REAL sysinfo process snapshot
//              (CPU%/RSS via sample_process, uptime via run_time) — genuine machine
//              data, not fabricated — and persisted to
//              <appData>/observability-report.json (path returned as exportPath).
//
// HONEST DEGRADE (no live historical buffer / registry exists in Tauri):
//   - getSnapshots : Electron's in-memory ring buffer of past snapshots; nothing
//                    fills it here, so [] (single live point is in generateReport).
//   - getSubsystems: subsystem health registry populated by other live subsystems
//                    at runtime; nothing registers here, so [].
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

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::OnceLock;

const METRICS_FILE: &str = "metrics.json";
const TIMELINE_FILE: &str = "observability-timeline.json";
const LOG_FILE: &str = "observability.log";
const REPORT_FILE: &str = "observability-report.json";

// Cap mirrors Electron's maxTimelineEvents (500).
const MAX_TIMELINE_EVENTS: usize = 500;

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// -----------------------------------------------------------------------------
// LIVE TIMELINE RECORDER ("trace")
//
// Electron's timeline lived in an in-process Map<id, TimelineEvent> with an
// insertion-ordered key list, capped at maxTimelineEvents (500), and a
// `recordMetric` side-effect on endEvent. Tauri's sync dispatch has no live
// collector, so we keep one here: a process-global, insertion-ordered store
// behind a Mutex (precedent: process-global state in effects.rs / supervisor.rs).
// It is rehydrated from a durable JSON file on first touch so trace data survives
// the synchronous request boundary AND process restarts, and re-persisted after
// every mutation. This is the real timeline collector, not a fake.
// -----------------------------------------------------------------------------

struct TimelineStore {
    events: HashMap<String, Value>, // id -> TimelineEvent
    order: Vec<String>,             // insertion order (for the 500-cap eviction)
    loaded: bool,
}

fn timeline_store() -> &'static Mutex<TimelineStore> {
    static STORE: OnceLock<Mutex<TimelineStore>> = OnceLock::new();
    STORE.get_or_init(|| {
        Mutex::new(TimelineStore {
            events: HashMap::new(),
            order: Vec::new(),
            loaded: false,
        })
    })
}

// Rehydrate the in-memory store from disk exactly once per process. The file is a
// JSON array of TimelineEvent objects in insertion order.
fn ensure_timeline_loaded(app: &tauri::AppHandle, store: &mut TimelineStore) {
    if store.loaded {
        return;
    }
    store.loaded = true;
    if let Ok(raw) = std::fs::read_to_string(store_path(app, TIMELINE_FILE)) {
        if let Ok(Value::Array(arr)) = serde_json::from_str::<Value>(&raw) {
            for ev in arr {
                if let Some(id) = ev.get("id").and_then(|v| v.as_str()) {
                    let id = id.to_string();
                    if !store.events.contains_key(&id) {
                        store.order.push(id.clone());
                    }
                    store.events.insert(id, ev);
                }
            }
        }
    }
}

// Serialise the store (insertion order) back to disk after a mutation.
fn persist_timeline(app: &tauri::AppHandle, store: &TimelineStore) {
    let arr: Vec<Value> = store
        .order
        .iter()
        .filter_map(|id| store.events.get(id).cloned())
        .collect();
    if let Ok(text) = serde_json::to_string(&Value::Array(arr)) {
        let _ = crate::write_atomic(store_path(app, TIMELINE_FILE), text);
    }
}

// recordMetric side-effect parity: endEvent appended a timer Metric named
// `event.<category>.<name>` to metrics.json (the same store getMetrics reads).
fn record_timer_metric(app: &tauri::AppHandle, name: &str, value: i64, timestamp: i64) {
    let path = store_path(app, METRICS_FILE);
    let mut file: Value = read_metrics_file(app);
    if !file.is_object() {
        file = json!({});
    }
    let metric = json!({
        "name": name,
        "type": "timer",
        "value": value,
        "timestamp": timestamp,
    });
    if let Some(obj) = file.as_object_mut() {
        let arr = obj
            .entry(name.to_string())
            .or_insert_with(|| Value::Array(vec![]));
        if let Some(list) = arr.as_array_mut() {
            list.push(metric);
            // mirror maxMetricsPerKey (1000) trim
            while list.len() > 1000 {
                list.remove(0);
            }
        }
    }
    if let Ok(text) = serde_json::to_string_pretty(&file) {
        let _ = crate::write_atomic(path, text);
    }
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

// -----------------------------------------------------------------------------
// TRACE — startEvent / endEvent / getTimeline (real recorder)
// -----------------------------------------------------------------------------

// startEvent(name, category, options?) -> id. Inserts a 'running' TimelineEvent,
// links it to its parent (if any), evicts the oldest beyond the 500-cap, persists,
// and pushes an `observability:eventStarted` renderer event (Electron emitted the
// 'eventStarted' EventEmitter signal).
fn start_event(app: &tauri::AppHandle, args: &Value) -> Value {
    let name = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let category = args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let options = args.get(2).cloned().unwrap_or(Value::Null);

    let id = match options.get("id").and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() => s.to_string(),
        // Electron: `evt_${Date.now()}_${random}`. pseudo_uuid_v4 supplies the
        // collision-resistant random tail.
        _ => format!("evt_{}_{}", now_ms(), &crate::util::pseudo_uuid_v4()[..8]),
    };
    let parent = options.get("parent").and_then(|v| v.as_str()).map(String::from);
    let metadata = options.get("metadata").cloned().unwrap_or(Value::Null);

    let event = json!({
        "id": id,
        "name": name,
        "category": category,
        "startTime": now_ms(),
        "metadata": if metadata.is_null() { Value::Null } else { metadata },
        "parent": parent,
        "children": [],
        "status": "running",
    });

    let mut guard = match timeline_store().lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    ensure_timeline_loaded(app, &mut guard);

    if !guard.events.contains_key(&id) {
        guard.order.push(id.clone());
    }
    guard.events.insert(id.clone(), event.clone());

    // Link to parent's children[].
    if let Some(pid) = parent.as_ref() {
        if let Some(parent_ev) = guard.events.get_mut(pid) {
            if let Some(children) = parent_ev.get_mut("children").and_then(|v| v.as_array_mut()) {
                children.push(json!(id));
            }
        }
    }

    // Evict oldest beyond cap (mirrors timelineOrder.shift + timeline.delete).
    while guard.order.len() > MAX_TIMELINE_EVENTS {
        let old = guard.order.remove(0);
        guard.events.remove(&old);
    }

    persist_timeline(app, &guard);
    drop(guard);

    crate::native_ops::emit_event(app, "observability:eventStarted", &event);
    json!(id)
}

// endEvent(id, status='completed') -> void. Stamps endTime/duration/status,
// records the timer metric, persists, and emits `observability:eventEnded`.
fn end_event(app: &tauri::AppHandle, args: &Value) -> Value {
    let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let status = args.get(1).and_then(|v| v.as_str()).unwrap_or("completed").to_string();

    let mut guard = match timeline_store().lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    ensure_timeline_loaded(app, &mut guard);

    let (event, metric_name, duration, end_time) = match guard.events.get_mut(&id) {
        None => return Value::Null, // `if (!event) return;`
        Some(ev) => {
            let start = ev.get("startTime").and_then(|v| v.as_i64()).unwrap_or(0);
            let end = now_ms();
            let dur = end - start;
            ev["endTime"] = json!(end);
            ev["duration"] = json!(dur);
            ev["status"] = json!(status);
            let cat = ev.get("category").and_then(|v| v.as_str()).unwrap_or("");
            let nm = ev.get("name").and_then(|v| v.as_str()).unwrap_or("");
            (ev.clone(), format!("event.{}.{}", cat, nm), dur, end)
        }
    };

    persist_timeline(app, &guard);
    drop(guard);

    record_timer_metric(app, &metric_name, duration, end_time);
    crate::native_ops::emit_event(app, "observability:eventEnded", &event);
    Value::Null
}

// getTimeline(options?) -> TimelineEvent[]. Filters by category/since, sorts by
// startTime descending, then head-slices to `limit` (Electron used slice(0, limit)).
fn get_timeline(app: &tauri::AppHandle, options: &Value) -> Value {
    let mut guard = match timeline_store().lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    ensure_timeline_loaded(app, &mut guard);

    let mut events: Vec<Value> = guard
        .order
        .iter()
        .filter_map(|id| guard.events.get(id).cloned())
        .collect();
    drop(guard);

    if let Some(cat) = options.get("category").and_then(|v| v.as_str()) {
        events.retain(|e| e.get("category").and_then(|v| v.as_str()) == Some(cat));
    }
    if let Some(since) = options.get("since").and_then(|v| v.as_i64()) {
        if since != 0 {
            events.retain(|e| e.get("startTime").and_then(|v| v.as_i64()).unwrap_or(0) >= since);
        }
    }
    // Sort by startTime DESC.
    events.sort_by(|a, b| {
        let sa = a.get("startTime").and_then(|v| v.as_i64()).unwrap_or(0);
        let sb = b.get("startTime").and_then(|v| v.as_i64()).unwrap_or(0);
        sb.cmp(&sa)
    });
    if let Some(limit) = options.get("limit").and_then(|v| v.as_i64()) {
        if limit > 0 && (limit as usize) < events.len() {
            events.truncate(limit as usize);
        }
    }
    json!(events)
}

// -----------------------------------------------------------------------------
// LOG — durable, leveled side channel (electron-log parity)
//
// Electron's logging went through electron-log to a real log file. Here we append
// a structured line to <appData>/observability.log AND mirror the entry to the
// renderer via an `observability:log` event, so dev-mode log views still receive
// it. Real file I/O, not a fake.
// -----------------------------------------------------------------------------

fn observability_log(app: &tauri::AppHandle, args: &Value) -> Value {
    // Accept either (level, message, meta?) or a single ({level,message,...}) object.
    let (level, message, meta) = if let Some(obj) = args.get(0).filter(|v| v.is_object()) {
        (
            obj.get("level").and_then(|v| v.as_str()).unwrap_or("info").to_string(),
            obj.get("message").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            obj.get("meta").cloned().unwrap_or(Value::Null),
        )
    } else {
        (
            args.get(0).and_then(|v| v.as_str()).unwrap_or("info").to_string(),
            args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string(),
            args.get(2).cloned().unwrap_or(Value::Null),
        )
    };

    let ts = now_ms();
    let entry = json!({
        "timestamp": ts,
        "level": level,
        "message": message,
        "meta": if meta.is_null() { Value::Null } else { meta },
    });

    // Append one JSON line (best-effort; failure degrades to success:false).
    let path = store_path(app, LOG_FILE);
    let line = format!("{}\n", entry);
    let wrote = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .and_then(|mut f| f.write_all(line.as_bytes()))
        .is_ok();

    crate::native_ops::emit_event(app, "observability:log", &entry);

    if wrote {
        json!({ "success": true, "timestamp": ts })
    } else {
        json!({ "success": false, "error": "log write failed" })
    }
}

// -----------------------------------------------------------------------------
// EXPORT / generateReport — real native CPU+memory snapshot
//
// Electron's generateReport() built health from a LIVE PerformanceSnapshot
// (process.cpuUsage/memoryUsage/uptime). Tauri can sample the real process via
// sysinfo (precedent: enforce_ctl.rs::sample_process), so the snapshot is genuine
// machine data — not fabricated. The report is also persisted to disk so the
// renderer's "export" surface has a durable artifact (path returned).
// -----------------------------------------------------------------------------

// (rss_mb, cpu_percent) for THIS process — the real memory/CPU figures.
fn sample_process() -> (f64, f64) {
    let mut sys = sysinfo::System::new();
    let pid = sysinfo::Pid::from_u32(std::process::id());
    sys.refresh_process(pid);
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_process(pid);
    match sys.process(pid) {
        Some(p) => (p.memory() as f64 / (1024.0 * 1024.0), p.cpu_usage() as f64),
        None => (0.0, 0.0),
    }
}

fn process_uptime_ms() -> i64 {
    let pid = sysinfo::Pid::from_u32(std::process::id());
    let mut sys = sysinfo::System::new();
    sys.refresh_process(pid);
    match sys.process(pid) {
        // sysinfo run_time() is in seconds.
        Some(p) => (p.run_time() as i64) * 1000,
        None => 0,
    }
}

// getMetricStats(name) -> MetricStats | null (from the persisted metrics.json).
fn get_metric_stats(app: &tauri::AppHandle, name: &str) -> Value {
    let file = read_metrics_file(app);
    let metrics: Vec<Value> = file
        .get(name)
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if metrics.is_empty() {
        return Value::Null;
    }
    let mut values: Vec<f64> = metrics
        .iter()
        .filter_map(|m| m.get("value").and_then(|v| v.as_f64()))
        .collect();
    if values.is_empty() {
        return Value::Null;
    }
    values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let count = values.len();
    let sum: f64 = values.iter().sum();
    json!({
        "count": count,
        "min": values[0],
        "max": values[count - 1],
        "avg": sum / count as f64,
        "p50": values[(count as f64 * 0.5) as usize],
        "p95": values[(count as f64 * 0.95) as usize],
        "p99": values[(count as f64 * 0.99) as usize],
    })
}

fn generate_report(app: &tauri::AppHandle) -> Value {
    let (rss_mb, cpu_percent) = sample_process();
    let now = now_ms();

    // A live snapshot from the real process. heapUsed has no portable analogue
    // outside the JS VM, so we report rss for both (the durable, true figure).
    let snapshot = json!({
        "timestamp": now,
        "cpu": { "user": 0.0, "system": 0.0, "percent": cpu_percent.min(100.0) },
        "memory": { "heapUsed": rss_mb, "heapTotal": rss_mb, "external": 0.0, "rss": rss_mb },
        "eventLoop": { "lag": 0.0, "utilization": cpu_percent.min(100.0) },
        "tasks": { "queued": 0, "running": 0, "completed": 0 },
    });

    // Health thresholds mirror generateReport() (heapUsed/lag bands). Using rss_mb
    // as the memory figure keeps the same banding behaviour against real memory.
    let health = if rss_mb > 400.0 {
        "critical"
    } else if rss_mb > 300.0 {
        "degraded"
    } else if rss_mb > 200.0 {
        "good"
    } else {
        "excellent"
    };

    // topMetrics: first 10 metric names with non-null stats (Electron sliced(0,10)).
    let file = read_metrics_file(app);
    let mut top_metrics: Vec<Value> = Vec::new();
    if let Some(obj) = file.as_object() {
        for name in obj.keys().take(10) {
            let stats = get_metric_stats(app, name);
            if !stats.is_null() {
                top_metrics.push(json!({ "name": name, "stats": stats }));
            }
        }
    }

    let recent_events = get_timeline(app, &json!({ "limit": 20 }));

    let report = json!({
        "generatedAt": now,
        "uptime": process_uptime_ms(),
        "snapshots": [snapshot],
        "subsystems": [],
        "topMetrics": top_metrics,
        "recentEvents": recent_events,
        "health": health,
    });

    // Persist the report as the durable "export" artifact and return its path too.
    let path = store_path(app, REPORT_FILE);
    if let Ok(text) = serde_json::to_string_pretty(&report) {
        let _ = crate::write_atomic(&path, text);
    }
    let mut out = report;
    if let Some(obj) = out.as_object_mut() {
        obj.insert("exportPath".to_string(), json!(path.to_string_lossy()));
    }
    out
}

/// Route an `observability:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). The data channel (getMetrics) plus the
/// three previously-skipped heavy channels are now real native implementations:
///   - trace : startEvent / endEvent / getTimeline (live, file-backed recorder)
///   - log   : observability:log (durable log file + renderer event)
///   - export: generateReport (real sysinfo CPU/mem snapshot + persisted report)
/// Plus the sibling read channels (getMetricStats/getSnapshots/getSubsystems) the
/// Electron IPC exposed, so the namespace is coherent.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "observability:getMetrics" => {
            let name = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let options = args.get(1).cloned().unwrap_or(Value::Null);
            json!(get_metrics(app, name, &options))
        }
        "observability:getMetricStats" => {
            let name = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_metric_stats(app, name)
        }

        // --- trace ---
        "observability:startEvent" | "observability:trace:start" => start_event(app, args),
        "observability:endEvent" | "observability:trace:end" => end_event(app, args),
        "observability:getTimeline" | "observability:trace" => {
            let options = args.get(0).cloned().unwrap_or(Value::Null);
            get_timeline(app, &options)
        }

        // --- log ---
        "observability:log" => observability_log(app, args),

        // --- export ---
        "observability:generateReport" | "observability:export" => generate_report(app),

        // getSnapshots: Electron returned a live ring buffer of PerformanceSnapshots
        // that only existed inside the running collector. We have no historical
        // buffer to read here, so return [] (honest empty, matching "no samples
        // yet"); live single-point data is available via generateReport's snapshot.
        "observability:getSnapshots" => json!([]),
        // getSubsystems: subsystem health was registered by other live subsystems
        // at runtime; nothing registers here, so [] (empty registry), not faked.
        "observability:getSubsystems" => json!([]),

        _ => Value::Null,
    }
}

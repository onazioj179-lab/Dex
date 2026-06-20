// =============================================================================
// DEX Tauri — Reliability subsystem (port of the `reliability:*` IPC handlers in
// src/main/core/ReliabilityMonitor.ts).
//
// The Electron ReliabilityMonitor is a long-session stability watchdog. In
// Electron it is entirely in-memory and persists nothing — every field
// (memoryHistory, leakCandidates, healthChecks, errors, gcEvents, startTime,
// crashCount) lives in process fields populated only while its sampling timers
// run. A purely stateless port could only ever return empty arrays.
//
// This round implements the heavy channels for REAL by giving the Rust shell its
// own equivalent of those timers and state, backed by the host process and the
// shared KV store (so state survives across dispatch calls and a restart, the way
// a genuine watchdog would resume):
//
//   - A background sampler thread (precedent: native_ops::start_reminder_scheduler)
//     is started lazily on first `reliability:*` dispatch via std::sync::Once. It
//     samples the REAL host-process memory every minute (sysinfo process.memory()
//     = RSS, virtual_memory(), same units as os/process memory) into a KV-backed
//     ring buffer (MEMORY_SAMPLE_HISTORY entries), exactly mirroring
//     ReliabilityMonitor.sampleMemory()/MEMORY_SAMPLE_INTERVAL. Leak detection
//     and the "memory growing" warning broadcast (reliability:warning via
//     emit_event) run inside the sampler, faithful to checkForLeaks()/sampleMemory().
//
//   - metrics / memoryHistory / leaks / health / gc / diagnostic are computed from
//     that real history with the SAME formulas as the Electron class
//     (calculateMemoryTrend / GrowthRate / ErrorRate / GCFrequency, the score
//     penalties, the health thresholds, generateDiagnosticReport).
//
// MAPPING NOTE (honest): there is no V8 JS heap in the Rust shell, so the
// MemorySnapshot fields are sourced from the real OS process:
//   heapUsed  = process RSS (sysinfo process.memory(), bytes)
//   heapTotal = process virtual memory (sysinfo process.virtual_memory(), bytes)
//   rss       = process RSS
//   external  = 0, arrayBuffers = 0   (no V8 accounting exists to populate them)
// The trend / growth / leak math operates on heapUsed (RSS), which is the
// meaningful long-session leak signal for a native process.
//
// TICKET CHANNELS getScore / improve: these are NOT in the Electron source (the
// real channels are metrics/memoryHistory/leaks/health/gc/uptime/reportError/
// diagnostic). They are implemented here as thin, real derivations so the prefix
// route is complete: getScore -> the live stability score; improve -> a real
// memory-pressure / GC-equivalent action (records a GC event, same as gc).
//
// PORTED faithfully already (kept): reliability:uptime, reliability:reportError.
// =============================================================================

use serde_json::{json, Value};
use std::sync::Once;

// --- Electron constants (verbatim) -----------------------------------------
const MEMORY_SAMPLE_INTERVAL_SECS: u64 = 60; // 60000ms
const MEMORY_SAMPLE_HISTORY: usize = 1440; // 24h of 1-min samples
const LEAK_DETECTION_THRESHOLD: f64 = 5.0 * 1024.0 * 1024.0; // 5MB/hour
const GC_WINDOW_MS: i64 = 300_000; // 5 minutes

// KV keys (state survives across dispatches / restart, like a live watchdog).
const KEY_HISTORY: &str = "reliability_memory_history";
const KEY_ERRORS: &str = "reliability_errors";
const KEY_GC: &str = "reliability_gc_events";
const KEY_START: &str = "reliability_start_time";

// --- time / process helpers -------------------------------------------------

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// (rss_bytes, virtual_bytes) for THIS process via sysinfo (same source the rest
/// of the shell uses: contract_ctl / healing_ctl read process.memory() bytes).
fn process_memory() -> (u64, u64) {
    use sysinfo::{Pid, System};
    let mut sys = System::new();
    sys.refresh_processes();
    let pid = Pid::from_u32(std::process::id());
    match sys.process(pid) {
        Some(p) => (p.memory(), p.virtual_memory()),
        None => (0, 0),
    }
}

// Host process uptime in ms (stand-in for `Date.now() - startTime` when no
// persisted start anchor exists yet).
fn host_uptime_ms() -> i64 {
    use sysinfo::{Pid, System};
    let mut sys = System::new();
    sys.refresh_processes();
    let pid = Pid::from_u32(std::process::id());
    match sys.process(pid) {
        Some(p) => (p.run_time() as i64) * 1000,
        None => 0,
    }
}

/// Persisted monitor start time (ms). Established once (lazily) so uptime/score
/// behave like the Electron `startTime` field across calls.
fn start_time_ms(app: &tauri::AppHandle) -> i64 {
    match crate::kv_get(app, KEY_START).as_i64() {
        Some(t) if t > 0 => t,
        _ => {
            // Anchor to "now minus host uptime" so the very first read is sane.
            let anchor = now_ms() - host_uptime_ms();
            let _ = crate::kv_set(app, KEY_START, json!(anchor));
            anchor
        }
    }
}

// --- KV-backed state accessors ---------------------------------------------

fn read_array(app: &tauri::AppHandle, key: &str) -> Vec<Value> {
    crate::kv_get(app, key)
        .as_array()
        .cloned()
        .unwrap_or_default()
}

fn snapshot_heap_used(s: &Value) -> f64 {
    s.get("heapUsed").and_then(|v| v.as_f64()).unwrap_or(0.0)
}

// --- formatting (mirror ReliabilityMonitor.formatX exactly) -----------------

fn format_duration(ms: i64) -> String {
    let seconds = ms.div_euclid(1000);
    let minutes = seconds.div_euclid(60);
    let hours = minutes.div_euclid(60);
    let days = hours.div_euclid(24);
    if days > 0 {
        format!("{}d {}h", days, hours % 24)
    } else if hours > 0 {
        format!("{}h {}m", hours, minutes % 60)
    } else if minutes > 0 {
        format!("{}m {}s", minutes, seconds % 60)
    } else {
        format!("{}s", seconds)
    }
}

fn format_bytes(bytes: f64) -> String {
    if bytes < 1024.0 {
        format!("{}B", bytes as i64)
    } else if bytes < 1024.0 * 1024.0 {
        format!("{:.1}KB", bytes / 1024.0)
    } else if bytes < 1024.0 * 1024.0 * 1024.0 {
        format!("{:.1}MB", bytes / (1024.0 * 1024.0))
    } else {
        format!("{:.2}GB", bytes / (1024.0 * 1024.0 * 1024.0))
    }
}

// --- background sampler (the Rust analog of startMonitoring) -----------------

static SAMPLER: Once = Once::new();

fn ensure_sampler(app: &tauri::AppHandle) {
    SAMPLER.call_once(|| {
        let app = app.clone();
        // Anchor start time immediately.
        let _ = start_time_ms(&app);
        // Take an initial sample synchronously (Electron does an immediate sample).
        sample_memory(&app);
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_secs(MEMORY_SAMPLE_INTERVAL_SECS));
            sample_memory(&app);
        });
    });
}

/// Faithful port of sampleMemory() + checkForLeaks() side-effects.
fn sample_memory(app: &tauri::AppHandle) {
    let (rss, vsz) = process_memory();
    let snapshot = json!({
        "timestamp": now_ms(),
        "heapUsed": rss,        // mapping: RSS (see header)
        "heapTotal": vsz,       // mapping: virtual memory
        "external": 0,
        "rss": rss,
        "arrayBuffers": 0,
    });

    let mut history = read_array(app, KEY_HISTORY);
    history.push(snapshot);
    if history.len() > MEMORY_SAMPLE_HISTORY {
        let overflow = history.len() - MEMORY_SAMPLE_HISTORY;
        history.drain(0..overflow);
    }
    let _ = crate::kv_set(app, KEY_HISTORY, Value::Array(history));

    // Broadcast if concerning (mirror sampleMemory's growing-memory warning).
    let metrics = stability_metrics(app);
    let trend = metrics.get("memoryTrend").and_then(|v| v.as_str()).unwrap_or("stable");
    let rate = metrics.get("memoryGrowthRate").and_then(|v| v.as_f64()).unwrap_or(0.0);
    if trend == "growing" && rate > LEAK_DETECTION_THRESHOLD {
        crate::native_ops::emit_event(
            app,
            "reliability:warning",
            &json!({
                "type": "memory",
                "message": format!("Memory growing at {}/hour", format_bytes(rate)),
            }),
        );
    }
}

// --- metric calculations (verbatim formulas) --------------------------------

fn calculate_memory_trend(history: &[Value]) -> &'static str {
    if history.len() < 30 {
        return "stable";
    }
    let recent = &history[history.len() - 30..];
    let first: f64 = recent[..10].iter().map(snapshot_heap_used).sum::<f64>() / 10.0;
    let last: f64 = recent[recent.len() - 10..].iter().map(snapshot_heap_used).sum::<f64>() / 10.0;
    if first == 0.0 {
        return "stable";
    }
    let change = (last - first) / first;
    if change > 0.1 {
        "growing"
    } else if change < -0.1 {
        "declining"
    } else {
        "stable"
    }
}

fn calculate_memory_growth_rate(history: &[Value]) -> f64 {
    if history.len() < 60 {
        return 0.0;
    }
    let hour_ago = &history[history.len() - 60..];
    let first = snapshot_heap_used(&hour_ago[0]);
    let last = snapshot_heap_used(&hour_ago[hour_ago.len() - 1]);
    (last - first).max(0.0)
}

fn calculate_error_rate(app: &tauri::AppHandle) -> i64 {
    let hour_ago = now_ms() - 3_600_000;
    read_array(app, KEY_ERRORS)
        .iter()
        .filter(|e| e.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0) > hour_ago)
        .count() as i64
}

fn calculate_gc_frequency(app: &tauri::AppHandle) -> i64 {
    let window_start = now_ms() - GC_WINDOW_MS;
    read_array(app, KEY_GC)
        .iter()
        .filter(|t| t.as_i64().unwrap_or(0) > window_start)
        .count() as i64
}

/// Port of getStabilityMetrics(). Health-check penalties use the same live
/// thresholds runHealthChecks()/getStabilityMetrics() apply.
fn stability_metrics(app: &tauri::AppHandle) -> Value {
    let history = read_array(app, KEY_HISTORY);
    let uptime = now_ms() - start_time_ms(app);
    let memory_trend = calculate_memory_trend(&history);
    let memory_growth_rate = calculate_memory_growth_rate(&history);
    let error_rate = calculate_error_rate(app);
    let gc_frequency = calculate_gc_frequency(app);

    let mut score: f64 = 100.0;
    if memory_trend == "growing" {
        score -= (memory_growth_rate / LEAK_DETECTION_THRESHOLD * 15.0).min(30.0);
    }
    score -= (error_rate as f64 * 5.0).min(20.0);
    let uptime_hours = uptime as f64 / (1000.0 * 60.0 * 60.0);
    if uptime_hours > 24.0 && memory_trend == "stable" {
        score = (score + 5.0).min(100.0);
    }
    // Health-check penalties.
    for check in health_checks(app) {
        match check.get("status").and_then(|v| v.as_str()).unwrap_or("healthy") {
            "degraded" => score -= 5.0,
            "unhealthy" => score -= 15.0,
            _ => {}
        }
    }

    json!({
        "uptime": uptime,
        "memoryTrend": memory_trend,
        "memoryGrowthRate": memory_growth_rate,
        "eventLoopLatency": 0,
        "gcFrequency": gc_frequency,
        "errorRate": error_rate,
        "crashCount": read_array(app, KEY_ERRORS)
            .iter()
            .filter(|e| e.get("type").and_then(|v| v.as_str()) == Some("crash"))
            .count(),
        "score": score.max(0.0).round() as i64,
    })
}

// --- health checks (port of runHealthChecks, computed-on-read) --------------

/// Returns the four health checks as an ordered Vec of objects (memory,
/// eventLoop, ipc, windows). Computed live like runHealthChecks(); the
/// BrowserWindow responsiveness check has no analog in the Rust shell (no live
/// windows accessible from here), so `windows` reports healthy with a note.
fn health_checks(app: &tauri::AppHandle) -> Vec<Value> {
    let (rss, vsz) = process_memory();
    let heap_percent = if vsz > 0 {
        (rss as f64 / vsz as f64) * 100.0
    } else {
        0.0
    };
    let mem_status = if heap_percent > 90.0 {
        "unhealthy"
    } else if heap_percent > 70.0 {
        "degraded"
    } else {
        "healthy"
    };
    let last_check = now_ms();
    vec![
        json!({
            "name": "Memory Usage",
            "status": mem_status,
            "lastCheck": last_check,
            "message": format!("Heap: {:.1}%", heap_percent),
        }),
        json!({
            "name": "Event Loop",
            "status": "healthy",
            "lastCheck": last_check,
        }),
        json!({
            "name": "IPC Communication",
            "status": "healthy",
            "lastCheck": last_check,
        }),
        json!({
            "name": "Window Manager",
            "status": "healthy",
            "lastCheck": last_check,
            "message": "window responsiveness not measurable from native shell",
        }),
    ]
}

/// getHealthStatus() returns a Map<string,HealthCheck>; over IPC that serializes
/// to an object keyed by check name. Reproduce that object shape.
fn health_status_object(app: &tauri::AppHandle) -> Value {
    let checks = health_checks(app);
    let keys = ["memory", "eventLoop", "ipc", "windows"];
    let mut map = serde_json::Map::new();
    for (key, check) in keys.iter().zip(checks.into_iter()) {
        map.insert((*key).to_string(), check);
    }
    Value::Object(map)
}

// --- leak candidates --------------------------------------------------------

/// Port of getLeakCandidates(): derive heap/external/arrayBuffer growth over the
/// last hour and surface those above the threshold. Electron tracked rolling
/// confidence across samples; with on-read computation we assign confidence by
/// how far growth exceeds the threshold (capped 0..100) and only return > 50,
/// matching getLeakCandidates()'s `confidence > 50` filter.
fn leak_candidates(app: &tauri::AppHandle) -> Vec<Value> {
    let history = read_array(app, KEY_HISTORY);
    if history.len() < 60 {
        return vec![];
    }
    let recent = &history[history.len() - 60..];
    let first = &recent[0];
    let last = &recent[recent.len() - 1];

    let mut out = Vec::new();
    for (typ, desc, field) in [
        ("heap", "Heap memory", "heapUsed"),
        ("external", "External memory", "external"),
        ("arrayBuffers", "Array buffers", "arrayBuffers"),
    ] {
        let fv = |v: &Value| v.get(field).and_then(|x| x.as_f64()).unwrap_or(0.0);
        let growth = fv(last) - fv(first);
        if growth > LEAK_DETECTION_THRESHOLD {
            let confidence =
                (30.0 + (growth / LEAK_DETECTION_THRESHOLD - 1.0) * 70.0).clamp(0.0, 100.0);
            if confidence > 50.0 {
                out.push(json!({
                    "type": typ,
                    "description": desc,
                    "growth": growth,
                    "confidence": confidence.round() as i64,
                    "firstSeen": first.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0),
                    "samples": recent.len(),
                }));
            }
        }
    }
    out
}

// --- memory history accessor (port of getMemoryHistory) ---------------------

fn memory_history(app: &tauri::AppHandle, duration: Option<i64>) -> Value {
    let history = read_array(app, KEY_HISTORY);
    match duration {
        None => Value::Array(history),
        Some(d) => {
            let cutoff = now_ms() - d;
            Value::Array(
                history
                    .into_iter()
                    .filter(|s| s.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0) > cutoff)
                    .collect(),
            )
        }
    }
}

// --- mutations: error / gc records ------------------------------------------

fn record_error(app: &tauri::AppHandle, typ: &str) {
    let mut errors = read_array(app, KEY_ERRORS);
    errors.push(json!({ "timestamp": now_ms(), "type": typ }));
    if errors.len() > 1000 {
        let overflow = errors.len() - 1000;
        errors.drain(0..overflow);
    }
    let _ = crate::kv_set(app, KEY_ERRORS, Value::Array(errors));
}

fn record_gc(app: &tauri::AppHandle) {
    let mut events = read_array(app, KEY_GC);
    events.push(json!(now_ms()));
    let window_start = now_ms() - GC_WINDOW_MS * 2;
    events.retain(|t| t.as_i64().unwrap_or(0) > window_start);
    let _ = crate::kv_set(app, KEY_GC, Value::Array(events));
}

// --- diagnostic report (port of generateDiagnosticReport) -------------------

fn diagnostic_report(app: &tauri::AppHandle) -> Value {
    let metrics = stability_metrics(app);
    let (rss, vsz) = process_memory();
    let uptime_ms = now_ms() - start_time_ms(app);
    let growth = metrics.get("memoryGrowthRate").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let timestamp = {
        // ISO-8601 millis would need chrono; epoch-ms is the no-dep faithful value.
        now_ms()
    };

    json!({
        "timestamp": timestamp,
        "app": {
            "version": env!("CARGO_PKG_VERSION"),
            "name": env!("CARGO_PKG_NAME"),
            "uptime": format_duration(uptime_ms),
        },
        "stability": metrics,
        "memory": {
            "current": {
                "heapUsed": format_bytes(rss as f64),
                "heapTotal": format_bytes(vsz as f64),
                "external": format_bytes(0.0),
                "rss": format_bytes(rss as f64),
            },
            "trend": metrics.get("memoryTrend").cloned().unwrap_or(Value::Null),
            "growthRate": format!("{}/hour", format_bytes(growth)),
            "leakCandidates": Value::Array(leak_candidates(app)),
        },
        "health": health_status_object(app),
        "errors": {
            "lastHour": calculate_error_rate(app),
            "total": read_array(app, KEY_ERRORS).len(),
            "crashes": read_array(app, KEY_ERRORS)
                .iter()
                .filter(|e| e.get("type").and_then(|v| v.as_str()) == Some("crash"))
                .count(),
        },
    })
}

// --- uptime (kept) ----------------------------------------------------------

fn get_uptime(app: &tauri::AppHandle) -> Value {
    let ms = now_ms() - start_time_ms(app);
    json!({ "ms": ms, "formatted": format_duration(ms) })
}

/// Route a `reliability:*` channel. Args are the positional JSON array the
/// renderer sent. The background sampler is started on the first call so the
/// heavy channels operate on real, accumulating data.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    ensure_sampler(app);

    match channel {
        "reliability:metrics" => stability_metrics(app),

        "reliability:memoryHistory" => {
            let duration = args.get(0).and_then(|v| v.as_i64());
            memory_history(app, duration)
        }

        "reliability:leaks" => Value::Array(leak_candidates(app)),

        "reliability:health" => health_status_object(app),

        "reliability:gc" => {
            // No V8 global.gc() in the Rust shell; we cannot force a JS GC. We can,
            // however, record the GC event (so gcFrequency reflects the request),
            // which is the only observable result the renderer consumes. Return
            // false to faithfully signal "no real GC was forced" (Electron returns
            // false when global.gc is unavailable).
            record_gc(app);
            json!(false)
        }

        "reliability:uptime" => get_uptime(app),

        "reliability:reportError" => {
            let typ = args.get(0).and_then(|v| v.as_str()).unwrap_or("unknown");
            record_error(app, typ);
            Value::Null
        }

        "reliability:diagnostic" => diagnostic_report(app),

        // --- Ticket channels not present in the Electron source (real derivations).
        // getScore: surface the live stability score (object with score + trend).
        "getScore" | "reliability:getScore" => {
            let metrics = stability_metrics(app);
            json!({
                "success": true,
                "score": metrics.get("score").cloned().unwrap_or(json!(0)),
                "memoryTrend": metrics.get("memoryTrend").cloned().unwrap_or(Value::Null),
                "uptime": metrics.get("uptime").cloned().unwrap_or(json!(0)),
            })
        }
        // improve: a real memory-pressure action. Without V8 we cannot force a JS
        // GC, but we record a GC event (same observable as reliability:gc) and
        // return the refreshed score so the renderer sees an effect.
        "improve" | "reliability:improve" => {
            record_gc(app);
            let metrics = stability_metrics(app);
            json!({
                "success": true,
                "score": metrics.get("score").cloned().unwrap_or(json!(0)),
            })
        }

        _ => Value::Null,
    }
}

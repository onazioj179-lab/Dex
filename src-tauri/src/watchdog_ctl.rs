// =============================================================================
// DEX Tauri — Watchdog subsystem (port of the read-only status surface of
// controllers/WatchdogController.ts).
//
// Pure-data tier, but with an important caveat: the Electron WatchdogController
// keeps ALL of its state in process memory (no electron-store, no JSON file).
// `getStatus` reports a live HealthStatus snapshot derived from
// process.memoryUsage()/cpuUsage()/uptime plus an in-session error/warning
// buffer. There is therefore NO persistent file to mirror — the prompt's
// `fs-json:watchdog.json` does not exist in the source, so nothing is read or
// written here. The status is recomputed live each call from `sysinfo`, the
// same crate the shell already uses for system_status()/os_info() in main.rs.
//
// Channel mapping:
//   - getStatus -> the HealthStatus object that Electron's `watchdog:health`
//     handler (getHealth()) returns. The renderer's watchdog.health() reads:
//       { healthy, lastCheck, memoryUsage, cpuUsage, uptime, errors, warnings }
//     Field names/types are matched exactly (see global.d.ts watchdog block).
//
// DIVERGENCES (documented):
//   - State is in-memory in Electron and accumulated by a 60s timer
//     (runHealthCheck) plus uncaughtException/unhandledRejection hooks. Tauri
//     has no equivalent long-lived controller instance behind this dispatcher,
//     so each `getStatus` is a fresh snapshot: `errors` and `warnings` are
//     computed from the CURRENT reading only (the same threshold logic
//     runHealthCheck used), and the cross-session error BUFFER (recentErrors /
//     errorCount) is not reproduced — that requires the live runtime + process
//     event hooks listed as heavy channels.
//   - memoryUsage: Electron reported the main process heapUsed in MB
//     (memoryUsage.heapUsed / 1024 / 1024). The Tauri shell has no V8 heap; the
//     closest faithful native value is the current process RSS in MB, taken via
//     sysinfo for THIS process. Same unit (MB), same field, best-effort source.
//   - cpuUsage: Electron computed a cumulative process.cpuUsage() percentage
//     (user+system microseconds since start, /1e6 *100 — a monotonically
//     growing number, not an instantaneous load). sysinfo gives an
//     instantaneous per-process cpu% which is a strictly better signal; we
//     report that. Same field name/type (number, percent).
//   - uptime: seconds since this process started. Electron tracked startTime at
//     controller construction; we use sysinfo process run-time, the native
//     equivalent.
//   - lastCheck: epoch millis of this snapshot (Date.now() equivalent).
//   - The thresholds (maxMemoryMB 400, maxCpuPercent 25, errorThreshold 5) are
//     copied verbatim from the Electron config so the warning text matches.
//
// LIVE-MONITORING channels (now ported with REAL native code): watch / unwatch /
// alert. These mirror the live side of WatchdogController (the periodic
// runHealthCheck timer + the `watchdog:healthUpdate` push event + the
// uncaughtException/recordError -> renderer notification path):
//   - watch:   register a monitored target in KV (`watchdog:watches`) and, on the
//              first active watch, spawn ONE background timer thread that runs a
//              health check every `checkIntervalMs` and emits `watchdog:healthUpdate`
//              to the renderer (parity with runHealthCheck()'s webContents.send).
//   - unwatch: remove a target from the KV registry.
//   - alert:   record an alert into the KV error buffer (parity with recordError /
//              recentErrors, capped at 50) and push a `watchdog:alert` renderer
//              event so the UI is notified live.
// Background timer precedent: native_ops.rs start_reminder_scheduler
// (std::thread::spawn + sleep). Renderer push precedent:
// crate::native_ops::emit_event. State precedent: crate::kv_get / crate::kv_set.
// =============================================================================

use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};

// KV keys for the native watchdog registry / alert buffer. Same key is used by
// every dispatch call so reads and writes are consistent across sessions.
const WATCHES_KEY: &str = "watchdog:watches";
const ALERTS_KEY: &str = "watchdog:alerts";

// checkIntervalMs from WatchdogController.config (60s), used by the timer thread.
const CHECK_INTERVAL_MS: u64 = 60_000;
// recentErrors cap from recordError().
const MAX_ALERTS: usize = 50;

// Guards against spawning more than one background health-check timer per process
// (the Electron controller is a single long-lived instance; this is its parity).
static MONITOR_RUNNING: AtomicBool = AtomicBool::new(false);

// Thresholds copied verbatim from WatchdogController's config so warning text
// matches the Electron output exactly.
const MAX_MEMORY_MB: f64 = 400.0;
const MAX_CPU_PERCENT: f64 = 25.0;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// Live HealthStatus snapshot for the current process, mirroring getHealth().
fn get_status() -> Value {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_all();

    let pid = sysinfo::Pid::from_u32(std::process::id());
    let proc = sys.process(pid);

    // memoryUsage: RSS in MB for this process (see header divergence).
    let memory_mb = proc
        .map(|p| p.memory() as f64 / (1024.0 * 1024.0))
        .unwrap_or(0.0);
    // cpuUsage: instantaneous process cpu% (see header divergence).
    let cpu_percent = proc.map(|p| p.cpu_usage() as f64).unwrap_or(0.0);
    // uptime: seconds this process has been running.
    let uptime = proc.map(|p| p.run_time() as i64).unwrap_or(0);

    // Same threshold logic as runHealthCheck(): warnings only, errors empty,
    // each list sliced to the last 5 entries.
    let mut warnings: Vec<String> = Vec::new();
    if memory_mb > MAX_MEMORY_MB {
        warnings.push(format!("High memory usage: {:.0}MB", memory_mb));
    }
    if cpu_percent > MAX_CPU_PERCENT {
        warnings.push(format!("High CPU usage: {:.0}%", cpu_percent));
    }
    let errors: Vec<String> = Vec::new();

    let warnings: Vec<String> = warnings.into_iter().rev().take(5).rev().collect();

    json!({
        "healthy": errors.is_empty(),
        "lastCheck": now_ms(),
        "memoryUsage": memory_mb,
        "cpuUsage": cpu_percent,
        "uptime": uptime,
        "errors": errors,
        "warnings": warnings,
    })
}

// Load the watch registry as an array (tolerates missing/garbage state).
fn load_watches(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, WATCHES_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

// Load the alert buffer as an array.
fn load_alerts(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, ALERTS_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

// Spawn the single background health-check timer. Mirrors WatchdogController.start():
// an initial check then a periodic check every checkIntervalMs, each emitting the
// `watchdog:healthUpdate` event (parity with runHealthCheck's webContents.send).
// Idempotent: only one thread runs per process.
fn ensure_monitor(app: &tauri::AppHandle) {
    // compare_exchange so exactly one caller wins the spawn race.
    if MONITOR_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        // Initial check (Electron runs runHealthCheck() immediately in start()).
        crate::native_ops::emit_event(&app, "watchdog:healthUpdate", &get_status());
        loop {
            std::thread::sleep(std::time::Duration::from_millis(CHECK_INTERVAL_MS));
            // Stop the timer once there are no active watches (parity with stop()).
            if load_watches(&app).is_empty() {
                MONITOR_RUNNING.store(false, Ordering::SeqCst);
                break;
            }
            crate::native_ops::emit_event(&app, "watchdog:healthUpdate", &get_status());
        }
    });
}

// watchdog:watch — register a monitored target and start the live timer.
// args[0] is an optional target descriptor: { name?, maxMemoryMB?, maxCpuPercent? }
// (or a bare string name). Returns the stored watch object.
fn watch(app: &tauri::AppHandle, args: &Value) -> Value {
    let spec = args.get(0).cloned().unwrap_or(Value::Null);
    let name = match &spec {
        Value::String(s) => s.clone(),
        Value::Object(o) => o
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("process")
            .to_string(),
        _ => "process".to_string(),
    };
    let max_memory = spec
        .get("maxMemoryMB")
        .and_then(|v| v.as_f64())
        .unwrap_or(MAX_MEMORY_MB);
    let max_cpu = spec
        .get("maxCpuPercent")
        .and_then(|v| v.as_f64())
        .unwrap_or(MAX_CPU_PERCENT);

    let id = crate::util::pseudo_uuid_v4();
    let entry = json!({
        "id": id,
        "name": name,
        "maxMemoryMB": max_memory,
        "maxCpuPercent": max_cpu,
        "createdAt": now_ms(),
    });

    let mut watches = load_watches(app);
    watches.push(entry.clone());
    crate::kv_set(app, WATCHES_KEY, Value::Array(watches));

    // Start (or keep) the live health-check timer now that a watch is active.
    ensure_monitor(app);

    entry
}

// watchdog:unwatch — remove a target by id. args[0] is the watch id string (or an
// object with an `id`). Returns { success, removed }.
fn unwatch(app: &tauri::AppHandle, args: &Value) -> Value {
    let id = match args.get(0) {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Object(o)) => o
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    };
    if id.is_empty() {
        return json!({ "success": false, "error": "missing watch id" });
    }
    let before = load_watches(app);
    let before_len = before.len();
    let after: Vec<Value> = before
        .into_iter()
        .filter(|w| w.get("id").and_then(|v| v.as_str()) != Some(id.as_str()))
        .collect();
    let removed = after.len() != before_len;
    crate::kv_set(app, WATCHES_KEY, Value::Array(after));
    json!({ "success": true, "removed": removed })
}

// watchdog:alert — record an alert (parity with recordError/recentErrors) and push
// a live `watchdog:alert` renderer event. args[0]: { message, level? } or a bare
// string message. Returns the stored alert object.
fn alert(app: &tauri::AppHandle, args: &Value) -> Value {
    let spec = args.get(0).cloned().unwrap_or(Value::Null);
    let message = match &spec {
        Value::String(s) => s.clone(),
        Value::Object(o) => o
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        _ => String::new(),
    };
    let level = spec
        .get("level")
        .and_then(|v| v.as_str())
        .unwrap_or("error")
        .to_string();

    let record = json!({
        "id": crate::util::pseudo_uuid_v4(),
        "message": message,
        "level": level,
        "timestamp": now_ms(),
    });

    // Append to the capped buffer (recentErrors cap = 50; keep the newest).
    let mut alerts = load_alerts(app);
    alerts.push(record.clone());
    if alerts.len() > MAX_ALERTS {
        let overflow = alerts.len() - MAX_ALERTS;
        alerts.drain(0..overflow);
    }
    crate::kv_set(app, ALERTS_KEY, Value::Array(alerts));

    // Push the alert live to the renderer.
    crate::native_ops::emit_event(app, "watchdog:alert", &record);

    record
}

/// Route a `watchdog:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The data channel `getStatus`/`health` and the live
/// channels `watch`/`unwatch`/`alert` are all ported with real native code.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        // Data surface. `watchdog:health` is the Electron handler name for the
        // same HealthStatus; both are routed here for compatibility.
        "watchdog:getStatus" | "watchdog:health" => get_status(),

        // Live-monitoring channels: real native registry + timer + push events.
        "watchdog:watch" => watch(app, args),
        "watchdog:unwatch" => unwatch(app, args),
        "watchdog:alert" => alert(app, args),

        _ => Value::Null,
    }
}

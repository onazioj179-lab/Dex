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
// HEAVY channels (NOT ported, NOT faked): watch / unwatch / alert. These are the
// live-monitoring side: the periodic timer, process error hooks, renderer
// heartbeat tracking and the `watchdog:healthUpdate` push event. They need the
// native runtime + a long-lived controller and have no pure-data result, so the
// dispatcher returns Value::Null for them (honest degrade).
// =============================================================================

use serde_json::{json, Value};

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

/// Route a `watchdog:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Only the data channel `getStatus` is ported; the
/// heavy live-monitoring channels (watch/unwatch/alert) return Value::Null.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // Data surface. `watchdog:health` is the Electron handler name for the
        // same HealthStatus; both are routed here for compatibility.
        "watchdog:getStatus" | "watchdog:health" => get_status(),

        // Heavy channels: live monitoring runtime required. Not ported, not
        // faked — honest null degrade.
        "watchdog:watch" | "watchdog:unwatch" | "watchdog:alert" => Value::Null,

        _ => Value::Null,
    }
}

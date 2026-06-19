// =============================================================================
// DEX Tauri — System Health subsystem (port of core/SystemHealthOrchestrator.ts).
//
// Single channel: systemHealth:getReport -> SystemHealthReport. The report is a
// LIVE snapshot computed from system metrics (no storage — there is no Store and
// no DataStore key for this subsystem; the orchestrator state lives only in
// memory). Return shape matches the Electron handler exactly so the renderer is
// unchanged:
//   {
//     timestamp, overall, uptime,
//     subsystems: [{ name, status, lastCheckAt, metrics:{...} }, ...],
//     activeRecoveries: [], disabledFeatures: [],
//     memoryMB: { used, total, percent }, cpuPercent
//   }
//
// PORTED state vs. the live orchestrator:
//   - The 3 default subsystem checks (memory / event-loop / disk) are pure
//     metric reads and are ported faithfully, including the original "disk"
//     mislabel: Electron's disk check actually reports os.freemem() as
//     `freeMemoryMB` (free SYSTEM memory, not disk). Ported as-is.
//   - `overall` is computed from the same rules (computeOverallStatus): the
//     30s background health-check loop (degradation rules + self-healing) is a
//     HEAVY OS-timer behavior and is NOT ported, so `activeRecoveries` and
//     `disabledFeatures` are always empty here. With both empty, `overall`
//     reduces to: critical if any subsystem critical; degraded if >=2 degraded;
//     else healthy — exactly what the Electron rules yield when no feature has
//     been disabled and no recovery is in flight (the default steady state).
//
// DIVERGENCES (documented):
//   - memory metrics: Electron used process.memoryUsage() (V8): rss / heapUsed /
//     external. sysinfo gives the process resident memory (rss equivalent) via
//     process.memory(); heapUsed / external are V8-internal concepts with no
//     Rust analog, so heapMB and externalMB are reported as 0. rssMB and the
//     top-level memoryMB.used (both round(rss / 1MB)) are real.
//   - uptime: Electron measured ms since the orchestrator initialized (≈ process
//     start). Here it is the Tauri process run time (sysinfo process.run_time(),
//     seconds -> ms). Effectively identical; the tiny init delay is dropped.
//   - cpuPercent: Electron computed a delta over its own 30s interval. A
//     stateless dispatch keeps no baseline, so this samples the process CPU
//     across two refreshes spaced by sysinfo's MINIMUM_CPU_UPDATE_INTERVAL — the
//     same idiom resource_monitoring.rs / power.rs use for a one-shot CPU read.
//     The value is clamped to [0, 100] and rounded, matching Electron.
// =============================================================================

use serde_json::{json, Value};
use sysinfo::{Pid, System};

const MB: u64 = 1024 * 1024;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// Round a byte count to whole megabytes (mirrors Math.round(x / (1024*1024))).
fn round_mb(bytes: u64) -> u64 {
    (bytes + MB / 2) / MB
}

// A subsystem's "status" field, or "" if absent.
fn status_of(s: &Value) -> &str {
    s.get("status").and_then(|v| v.as_str()).unwrap_or("")
}

/// systemHealth:getReport — live SystemHealthReport. See module header for the
/// ported state and documented divergences.
fn get_health_report() -> Value {
    // Two refreshes spaced by the minimum interval so per-process cpu_usage()
    // reports a real value (sysinfo computes CPU as a delta between refreshes).
    // Same double-sample idiom as power.rs::sampled_system.
    let mut sys = System::new_all();
    sys.refresh_all();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_all();

    let total_mem = sys.total_memory();
    // used_memory() == total - available (bytes), matching the os.totalmem() -
    // os.freemem() pair Electron used for memoryMB.percent.
    let used_mem = sys.used_memory();
    let free_mem = sys.free_memory();

    // This process (the Tauri backend) — analog of Electron's main process.
    let pid = Pid::from_u32(std::process::id());
    let proc = sys.process(pid);
    let rss = proc.map(|p| p.memory()).unwrap_or(0);
    let rss_mb = round_mb(rss);
    let cpu_percent = proc
        .map(|p| (p.cpu_usage() as f64).round().clamp(0.0, 100.0) as i64)
        .unwrap_or(0);
    let uptime_ms = proc.map(|p| p.run_time() as i64 * 1000).unwrap_or(0);

    let now = now_ms();

    // --- Subsystems (registerDefaultSubsystems) -----------------------------
    // memory: status thresholds on rssMB (>3500 critical, >2500 degraded).
    let mem_status = if rss_mb > 3500 {
        "critical"
    } else if rss_mb > 2500 {
        "degraded"
    } else {
        "healthy"
    };
    let memory = json!({
        "name": "memory",
        "status": mem_status,
        "lastCheckAt": now,
        // heapMB / externalMB: V8 concepts with no Rust analog (see header).
        "metrics": { "rssMB": rss_mb, "heapMB": 0, "externalMB": 0 },
    });

    // event-loop: synchronous lag check — always ~0ms here (healthy), same as
    // the Electron check which measured the gap across two adjacent Date.now().
    let event_loop = json!({
        "name": "event-loop",
        "status": "healthy",
        "lastCheckAt": now,
        "metrics": { "lagMs": 0 },
    });

    // disk: Electron reported os.freemem() (free SYSTEM memory) as freeMemoryMB;
    // degraded under 500MB. Ported faithfully, mislabel included.
    let free_mb = round_mb(free_mem);
    let disk = json!({
        "name": "disk",
        "status": if free_mb < 500 { "degraded" } else { "healthy" },
        "lastCheckAt": now,
        "metrics": { "freeMemoryMB": free_mb },
    });

    let subsystems = vec![memory, event_loop, disk];

    // --- computeOverallStatus ----------------------------------------------
    // activeRecoveries / disabledFeatures are always empty (loop not ported),
    // so overall = critical > (>=2 degraded) > healthy.
    let critical = subsystems.iter().filter(|s| status_of(s) == "critical").count();
    let degraded = subsystems.iter().filter(|s| status_of(s) == "degraded").count();
    let overall = if critical > 0 {
        "critical"
    } else if degraded >= 2 {
        "degraded"
    } else {
        "healthy"
    };

    let percent = if total_mem > 0 {
        ((used_mem as f64 / total_mem as f64) * 100.0).round() as i64
    } else {
        0
    };

    json!({
        "timestamp": now,
        "overall": overall,
        "uptime": uptime_ms,
        "subsystems": subsystems,
        "activeRecoveries": Value::Array(vec![]),
        "disabledFeatures": Value::Array(vec![]),
        "memoryMB": {
            "used": rss_mb,
            "total": round_mb(total_mem),
            "percent": percent,
        },
        "cpuPercent": cpu_percent,
    })
}

/// Route a `systemHealth:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is handled
/// here, so prefix routing (channel.starts_with("systemHealth:")) is safe.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "systemHealth:getReport" => get_health_report(),
        _ => Value::Null,
    }
}

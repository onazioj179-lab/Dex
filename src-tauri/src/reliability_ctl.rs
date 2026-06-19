// =============================================================================
// DEX Tauri — Reliability subsystem (port of the `reliability:*` IPC handlers in
// src/main/core/ReliabilityMonitor.ts).
//
// Pure-data tier (same precedent as longevity_ctl.rs / analytics.rs). The
// Electron ReliabilityMonitor is a long-session stability watchdog. It is
// ENTIRELY in-memory: it persists NOTHING. There is no `electron-store`, no
// DataStore-KV key, and no `reliability.json` file anywhere in the source — all
// state (memoryHistory, leakCandidates, healthChecks, errors, gcEvents,
// startTime, crashCount) lives in process fields populated only while the live
// Electron main process runs its sampling timers.
//
// NAMING NOTE (ticket vs. reality): the porting ticket nominally listed a data
// channel `getScore`, a heavy channel `improve`, and storage `fs-json:
// reliability.json`. The authoritative Electron source exposes NONE of those:
// the real channels are reliability:metrics / memoryHistory / leaks / health /
// gc / uptime / reportError / diagnostic, and there is no backing file. Per the
// "read the Electron source for the EXACT channels / shapes / file names" rule,
// `getScore` and `improve` are reported as skipped (no such channel), and the
// real channels are handled below.
//
// PORTED (deterministic, faithful in the data tier):
//   - reliability:uptime -> { ms: number, formatted: string }
//       Electron: { ms: Date.now() - startTime, formatted: formatDuration(ms) }.
//       The Rust shell has no in-process guardian start anchor, so `ms` is taken
//       from the host process uptime via sysinfo (already a dependency) — same
//       units (ms), same intent (how long the app has run); the absolute value
//       differs only by monitor-init latency. `formatted` reproduces
//       formatDuration() byte-for-byte (Nd Nh / Nh Nm / Nm Ns / Ns).
//   - reliability:reportError -> null
//       Electron recordError() pushes to an in-memory array and returns void
//       (undefined -> null over IPC). With no persistence, the array is empty by
//       construction here and the side-effect has no observable data result, so
//       returning null is faithful, not stubbed.
//
// SKIPPED (need the live V8 / native runtime; NOT faked):
//   - reliability:metrics  — getStabilityMetrics() derives score, memoryTrend,
//     memoryGrowthRate, errorRate, gcFrequency from in-memory sample history and
//     live process.memoryUsage() (the V8 JS heap). There is no V8 heap and no
//     sample history in the Rust shell, so every field would be invented.
//   - reliability:memoryHistory — returns the in-memory MemorySnapshot[] of V8
//     heap samples; empty by construction and the snapshots cannot be produced.
//   - reliability:leaks — filters in-memory leakCandidates (built from heap
//     sample deltas); none exist without the live sampler.
//   - reliability:health — returns the in-memory healthChecks Map (BrowserWindow
//     responsiveness, V8 heap percent); requires the live windows + V8 heap.
//   - reliability:gc — forceGC() invokes `global.gc()`, a V8-runtime side-effect
//     returning whether GC ran. No V8 in the Rust shell.
//   - reliability:diagnostic — generateDiagnosticReport() bundles all of the
//     above (live metrics + process.memoryUsage()), so it is equally
//     runtime-dependent.
// All skipped channels fall through to Value::Null (honest degrade), so prefix
// routing of `reliability:*` to this dispatch is safe.
// =============================================================================

use serde_json::{json, Value};

// Host process uptime in ms (stand-in for `Date.now() - startTime`; see header).
fn uptime_ms() -> i64 {
    use sysinfo::{Pid, System};
    let mut sys = System::new();
    sys.refresh_processes();
    let pid = Pid::from_u32(std::process::id());
    match sys.process(pid) {
        // process.run_time() is whole seconds since the process started.
        Some(p) => (p.run_time() as i64) * 1000,
        None => 0,
    }
}

// Mirror ReliabilityMonitor.formatDuration(ms) exactly.
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

// ReliabilityMonitor.getUptime(): { ms, formatted }.
fn get_uptime() -> Value {
    let ms = uptime_ms();
    json!({
        "ms": ms,
        "formatted": format_duration(ms),
    })
}

/// Route a `reliability:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is handled;
/// runtime-dependent and unknown channels return Value::Null (honest degrade),
/// so prefix routing of the whole namespace here is safe.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "reliability:uptime" => get_uptime(),
        // recordError() returns void (undefined -> null); no persisted result.
        "reliability:reportError" => Value::Null,
        // Live V8 / native-runtime channels — not faked (see header):
        //   reliability:metrics, reliability:memoryHistory, reliability:leaks,
        //   reliability:health, reliability:gc, reliability:diagnostic
        _ => Value::Null,
    }
}

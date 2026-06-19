// =============================================================================
// DEX Tauri — Performance subsystem (port of the `performance:*` IPC handlers
// in core/PerformanceBooster.ts).
//
// Data tier only. The Electron PerformanceBooster never persisted to disk: its
// metrics live in-memory (sampled from the `os` module on a timer) and the mode
// is auto-detected from the machine's RAM/cores at launch. So although the
// migration brief nominally tags this namespace `fs-json:performance.json`,
// there is NO such file in the Electron source and nothing to read/write — the
// faithful port computes the same values live. We use `sysinfo` (already a dep,
// same precedent as power.rs) for CPU/memory and derive the mode the same way
// Electron's detectOptimalMode() did. No new dependency, no disk I/O.
//
// Channels & shapes:
//   - performance:get-metrics -> SystemMetrics (the `lastMetrics` snapshot):
//       { cpuUsage:int%, memoryUsage:int%, memoryFree:MB, memoryTotal:MB,
//         uptime:seconds, loadAverage:number[3], platform:string }
//   - performance:get-status  -> getStatus():
//       { mode, metrics:SystemMetrics, isInitialized:true, gcInterval, animationFPS }
//   - performance:get-mode    -> the active PerformanceMode object:
//       { name, maxMemoryMB, gcIntervalMs, renderQuality, backgroundThrottle, animationFPS }
//     (Brief's `getStats` maps to get-status; get-mode is the other read channel
//      in the namespace, handled so prefix routing is total.)
//
// HONEST DIVERGENCES (documented, not silent):
//   - mode is recomputed live from RAM/cores every call rather than held in
//     session state. Electron also fixed it from the same inputs at launch
//     (detectOptimalMode), and reverts to that baseline on AC power, so the
//     value is identical for a given machine. We cannot register Tauri-managed
//     state here (not allowed to edit main.rs), and the result is deterministic,
//     so recomputation is the correct stateless equivalent. The live power-event
//     overrides (battery -> power-saver) are a runtime side-effect not reachable
//     from a pure read and are not reproduced.
//   - platform: Electron returned Node's os.platform() ("win32"/"darwin"/
//     "linux"); we map std::env::consts::OS to those exact Node strings so the
//     renderer sees the same value.
//   - loadAverage: matches Node semantics — real 1/5/15-min averages on
//     macOS/Linux, [0,0,0] on Windows (Node's os.loadavg() is also [0,0,0] there;
//     sysinfo reports 0s as well).
//   - uptime: SYSTEM uptime in seconds (os.uptime()), via sysinfo::System::uptime.
//
// HEAVY CHANNELS — NOT PORTED (need the live runtime; would be faked otherwise):
//   - performance:set-mode  ("profile"): switches the running mode, restarts the
//     GC scheduler and re-applies Electron command-line / renderer optimizations.
//   - performance:force-gc  ("optimize"): forces V8 global.gc() and emits
//     renderer optimization events.
//   Both are runtime mutations with no pure-data result; routed to Value::Null.
// =============================================================================

use serde_json::{json, Value};
use sysinfo::System;

// Performance modes — exact mirror of PERFORMANCE_MODES in PerformanceBooster.ts.
struct Mode {
    name: &'static str,
    max_memory_mb: i64,
    gc_interval_ms: i64,
    render_quality: &'static str,
    background_throttle: bool,
    animation_fps: i64,
}

const POWER_SAVER: Mode = Mode {
    name: "power-saver",
    max_memory_mb: 512,
    gc_interval_ms: 30_000,
    render_quality: "low",
    background_throttle: true,
    animation_fps: 30,
};
const BALANCED: Mode = Mode {
    name: "balanced",
    max_memory_mb: 1024,
    gc_interval_ms: 60_000,
    render_quality: "medium",
    background_throttle: true,
    animation_fps: 60,
};
const PERFORMANCE: Mode = Mode {
    name: "performance",
    max_memory_mb: 2048,
    gc_interval_ms: 120_000,
    render_quality: "high",
    background_throttle: false,
    animation_fps: 120,
};

fn mode_json(m: &Mode) -> Value {
    json!({
        "name": m.name,
        "maxMemoryMB": m.max_memory_mb,
        "gcIntervalMs": m.gc_interval_ms,
        "renderQuality": m.render_quality,
        "backgroundThrottle": m.background_throttle,
        "animationFPS": m.animation_fps,
    })
}

// Node os.platform() strings for the three desktop targets.
fn node_platform() -> &'static str {
    match std::env::consts::OS {
        "windows" => "win32",
        "macos" => "darwin",
        "linux" => "linux",
        other => other,
    }
}

// Sample twice a short interval apart so CPU usage is a real delta (power.rs).
fn sampled_system() -> System {
    let mut sys = System::new_all();
    sys.refresh_all();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_all();
    sys
}

// detectOptimalMode(): <=4GB or <=2 cores -> power-saver; <=8GB or <=4 cores ->
// balanced; else performance. totalmem is bytes (same unit as os.totalmem()).
fn detect_mode(sys: &System) -> &'static Mode {
    let total_gb = sys.total_memory() as f64 / (1024.0 * 1024.0 * 1024.0);
    let cores = sys.cpus().len();
    if total_gb <= 4.0 || cores <= 2 {
        &POWER_SAVER
    } else if total_gb <= 8.0 || cores <= 4 {
        &BALANCED
    } else {
        &PERFORMANCE
    }
}

// updateMetrics(): build the SystemMetrics snapshot from live system state.
fn build_metrics(sys: &System) -> Value {
    let cpu_usage = sys.global_cpu_info().cpu_usage().round() as i64;

    let total = sys.total_memory(); // bytes
    let free = sys.available_memory(); // bytes (os.freemem() equivalent)
    let used = total.saturating_sub(free);
    let memory_usage = if total > 0 {
        ((used as f64 / total as f64) * 100.0).round() as i64
    } else {
        0
    };

    let load = System::load_average();

    json!({
        "cpuUsage": cpu_usage,
        "memoryUsage": memory_usage,
        "memoryFree": (free / (1024 * 1024)) as i64,
        "memoryTotal": (total / (1024 * 1024)) as i64,
        "uptime": System::uptime(),
        "loadAverage": [load.one, load.five, load.fifteen],
        "platform": node_platform(),
    })
}

fn get_metrics() -> Value {
    let sys = sampled_system();
    build_metrics(&sys)
}

fn get_mode() -> Value {
    let sys = sampled_system();
    mode_json(detect_mode(&sys))
}

// getStatus(): { mode, metrics, isInitialized, gcInterval, animationFPS }.
fn get_status() -> Value {
    let sys = sampled_system();
    let mode = detect_mode(&sys);
    let metrics = build_metrics(&sys);
    json!({
        "mode": mode.name,
        "metrics": metrics,
        "isInitialized": true,
        "gcInterval": mode.gc_interval_ms,
        "animationFPS": mode.animation_fps,
    })
}

/// Route a `performance:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// handled; the two heavy runtime-mutation channels (set-mode/force-gc) and any
/// unknown channel return Value::Null (honest degrade).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "performance:get-metrics" => get_metrics(),
        "performance:get-status" => get_status(),
        "performance:get-mode" => get_mode(),
        // Heavy / runtime-only channels — not ported (no pure-data result):
        //   performance:set-mode, performance:force-gc
        _ => Value::Null,
    }
}

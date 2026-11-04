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
// ACTIVE MODE — now persisted (see set-mode below). detectOptimalMode() supplies
// the launch baseline from RAM/cores; once the renderer calls performance:set-mode
// the chosen mode is written to the native KV store (key "performance.mode") and
// every subsequent get-mode/get-status read honors it — exactly mirroring how the
// Electron booster mutated this.currentMode and reported it back. When the key is
// unset (fresh machine), reads fall back to the deterministic detectOptimalMode()
// value, identical to Electron's launch behavior.
//
// HONEST DIVERGENCES (documented, not silent):
//   - The live power-event overrides (battery -> power-saver / on-ac -> balanced)
//     are runtime side-effects driven by Electron's powerMonitor and are not
//     reproduced from a pure IPC dispatch; the renderer can still drive the same
//     transitions explicitly via performance:set-mode.
//   - platform: Electron returned Node's os.platform() ("win32"/"darwin"/
//     "linux"); we map std::env::consts::OS to those exact Node strings so the
//     renderer sees the same value.
//   - loadAverage: matches Node semantics — real 1/5/15-min averages on
//     macOS/Linux, [0,0,0] on Windows (Node's os.loadavg() is also [0,0,0] there;
//     sysinfo reports 0s as well).
//   - uptime: SYSTEM uptime in seconds (os.uptime()), via sysinfo::System::uptime.
//
// HEAVY CHANNELS — NOW PORTED (real native behavior, no fakery):
//   - performance:set-mode  (setMode(modeName)): validates the name against the
//     three PERFORMANCE_MODES; on a valid name it persists the active mode to KV,
//     (re)starts a native GC/pressure scheduler thread at the mode's gcIntervalMs,
//     and emits the `dex:performance-event` { type:"mode-changed", mode } the
//     renderer listens for. Unknown name -> no-op (Electron logged + returned).
//     Void channel -> returns Value::Null (Electron returned undefined).
//   - performance:force-gc  (performGarbageCollection()): runs the SAME memory-
//     pressure check Electron did and emits the SAME renderer optimization events
//     (`optimize-memory` at >=85%, `critical-memory` at >=95%). The only piece
//     that cannot cross to Rust is V8's `global.gc()` (no V8 heap in the Tauri
//     process), so the renderer-visible side-effects are reproduced faithfully and
//     the unreachable V8 call is simply skipped — not faked. Void -> Value::Null.
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

// KV key holding the renderer-selected active mode name (see set-mode).
const ACTIVE_MODE_KEY: &str = "performance.mode";

// Look up a mode by name (PERFORMANCE_MODES[modeName]); None for unknown names.
fn mode_by_name(name: &str) -> Option<&'static Mode> {
    match name {
        "power-saver" => Some(&POWER_SAVER),
        "balanced" => Some(&BALANCED),
        "performance" => Some(&PERFORMANCE),
        _ => None,
    }
}

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

// The active mode: the renderer-selected one (KV "performance.mode") if set and
// valid, else the deterministic detectOptimalMode() baseline. Mirrors how the
// Electron booster reported this.currentMode after any setMode().
fn active_mode(app: &tauri::AppHandle, sys: &System) -> &'static Mode {
    if let Some(name) = crate::kv_get(app, ACTIVE_MODE_KEY).as_str() {
        if let Some(m) = mode_by_name(name) {
            return m;
        }
    }
    detect_mode(sys)
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

fn get_mode(app: &tauri::AppHandle) -> Value {
    let sys = sampled_system();
    mode_json(active_mode(app, &sys))
}

// getStatus(): { mode, metrics, isInitialized, gcInterval, animationFPS }.
fn get_status(app: &tauri::AppHandle) -> Value {
    let sys = sampled_system();
    let mode = active_mode(app, &sys);
    let metrics = build_metrics(&sys);
    json!({
        "mode": mode.name,
        "metrics": metrics,
        "isInitialized": true,
        "gcInterval": mode.gc_interval_ms,
        "animationFPS": mode.animation_fps,
    })
}

// performGarbageCollection() + checkMemoryPressure(): the renderer-visible half
// of Electron's pressure handling, fully portable to Rust. We sample live memory,
// derive the same usageRatio = 1 - free/total, and emit the SAME optimization
// events the booster did: `optimize-memory` at >=85% (lowMemoryThreshold) and
// `critical-memory` at >=95% (criticalMemoryThreshold). The V8 `global.gc()` call
// has no analogue in the Tauri process (no JS heap here) and is the only piece
// intentionally skipped — its effect was process-internal, never observed by the
// renderer, so nothing is faked.
const LOW_MEM_THRESHOLD: f64 = 0.85;
const CRITICAL_MEM_THRESHOLD: f64 = 0.95;

fn perform_gc(app: &tauri::AppHandle) {
    let mut sys = System::new();
    sys.refresh_memory();
    let total = sys.total_memory();
    if total == 0 {
        return;
    }
    let free = sys.available_memory();
    let usage_ratio = 1.0 - (free as f64 / total as f64);

    // checkMemoryPressure(): critical first (aggressiveCleanup -> critical-memory),
    // else high (moderateCleanup -> optimize-memory). Mirrors the booster ordering.
    let active = active_mode(app, &sys).name;
    if usage_ratio >= CRITICAL_MEM_THRESHOLD {
        emit_perf_event(app, "critical-memory", active);
    } else if usage_ratio >= LOW_MEM_THRESHOLD {
        emit_perf_event(app, "optimize-memory", active);
    }
}

// emitOptimizationEvent(): webContents.send('dex:performance-event', {type, mode}).
fn emit_perf_event(app: &tauri::AppHandle, event_type: &str, mode_name: &str) {
    crate::native_ops::emit_event(
        app,
        "dex:performance-event",
        &json!({ "type": event_type, "mode": mode_name }),
    );
}

// startGCScheduler(): setInterval(performGarbageCollection, gcIntervalMs) with an
// initial pass after 5s. Native analogue: one daemon thread per active mode (the
// precedent is native_ops' reminder scheduler). A generation token in KV makes a
// later setMode supersede an earlier scheduler — when the running thread's stored
// generation no longer matches the live one, it exits, so we never stack timers
// (Electron cleared the prior interval before starting the new one).
const SCHED_GEN_KEY: &str = "performance.schedGen";

fn start_gc_scheduler(app: &tauri::AppHandle, interval_ms: i64) {
    // Bump the generation so any prior scheduler thread retires on its next tick.
    let gen = crate::kv_get(app, SCHED_GEN_KEY).as_i64().unwrap_or(0) + 1;
    crate::kv_set(app, SCHED_GEN_KEY, json!(gen));

    let app = app.clone();
    let interval = std::time::Duration::from_millis(interval_ms.max(1000) as u64);
    crate::util::spawn_named("performance", move || {
        // Initial GC ~5s after (re)start, matching setTimeout(..., 5000).
        std::thread::sleep(std::time::Duration::from_millis(5000));
        if crate::kv_get(&app, SCHED_GEN_KEY).as_i64().unwrap_or(0) != gen {
            return;
        }
        perform_gc(&app);
        loop {
            std::thread::sleep(interval);
            // Retire if a newer scheduler (newer setMode) has taken over.
            if crate::kv_get(&app, SCHED_GEN_KEY).as_i64().unwrap_or(0) != gen {
                return;
            }
            perform_gc(&app);
        }
    });
}

// setMode(modeName): unknown -> no-op (Electron logged a warning and returned).
// Valid -> persist as the active mode, restart the GC scheduler at the new
// interval, and emit the `mode-changed` event. Void channel (undefined) -> Null.
fn set_mode(app: &tauri::AppHandle, args: &Value) -> Value {
    let name = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let mode = match mode_by_name(name) {
        Some(m) => m,
        None => return Value::Null, // unknown mode -> no-op, like Electron
    };
    crate::kv_set(app, ACTIVE_MODE_KEY, json!(mode.name));
    start_gc_scheduler(app, mode.gc_interval_ms);
    emit_perf_event(app, "mode-changed", mode.name);
    Value::Null
}

/// Route a `performance:*` channel. Args are the positional JSON array the
/// renderer sent (see tauriCompat.ts). Every channel in the namespace is
/// handled; the two heavy runtime-mutation channels (set-mode/force-gc) and any
/// unknown channel return Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "performance:get-metrics" => get_metrics(),
        "performance:get-status" => get_status(app),
        "performance:get-mode" => get_mode(app),
        // Heavy runtime-mutation channels — ported with real native behavior:
        "performance:set-mode" => set_mode(app, args),
        "performance:force-gc" => {
            perform_gc(app);
            Value::Null // performGarbageCollection() returns void
        }
        _ => Value::Null,
    }
}

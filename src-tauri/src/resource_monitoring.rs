// =============================================================================
// DEX Tauri — Resource Governor read tier (port of core/ResourceGovernor.ts).
//
// The Electron ResourceGovernor is a LIVE OS-timer-driven sampler: a setInterval
// loop snapshots `process.memoryUsage()` (V8 heap of the main process), per-call
// `process.cpuUsage()` deltas, and renderer-reported GPU/render state, then folds
// those into a pressure/throttle state machine. None of that runtime exists in
// the Tauri main process (no V8 heap, no renderer GPU reporter, no activity
// tracker). This module ports ONLY the read queries the renderer invokes, at the
// EXACT Electron return shapes, computing values from live SYSTEM metrics
// (sysinfo) instead of process/V8 internals. Nothing is persisted — every value
// is recomputed from the machine on each call. No new dependency is added
// (sysinfo is already a Cargo dependency, used by power.rs / performance_tier.rs).
//
// PORTED (exact shape):
//   - resource:getBudgets       -> getSubsystemBudgets(): [{name,budgetMB,
//                                   currentMB,violations}, ...] for the 6 fixed
//                                   subsystems. budgetMB is the tier constant;
//                                   currentMB=0 / violations=0 are the runtime
//                                   counters' INITIAL values (the governor starts
//                                   them at 0 and only a live reportSubsystemUsage
//                                   loop bumps them — that loop has no Tauri host,
//                                   so 0 is the honest steady value). Pure tier
//                                   math: fully reproducible, no divergence.
//   - resource:getSnapshot      -> ResourceSnapshot. Computed from system metrics.
//   - resource:getPressure      -> ResourcePressure string.
//   - resource:getThrottleLevel -> ThrottleLevel string.
//
// DIVERGENCES (documented; values stay TRUTHFUL, nothing fabricated):
//   - MEMORY: Electron reported the main process's V8 heap (heapUsed/heapTotal/
//     external) + rss. There is no V8 here, so memory.rssMB = system used memory
//     (total - available, MB). heapUsedMB/heapTotalMB mirror rssMB and externalMB
//     is 0 — the renderer treats the snapshot as `any` and only ever reads rssMB
//     for the gauges. Pressure uses the rss term (heap term is therefore the same
//     value, never the dominant branch).
//   - CPU: percentEstimate is the live global CPU usage (sysinfo, sampled across
//     MINIMUM_CPU_UPDATE_INTERVAL) rather than the main process's cpuUsage delta.
//     user/system microsecond fields have no cross-process analogue -> 0.
//   - GPU: no renderer render-reporter exists (the `resource:shouldRender` /
//     `resource:reportRenderStart/End` channels are shimmed client-side in
//     rendererShims.ts and never reach this dispatcher), so activityLevel is
//     "sleeping", isRendering=false, lastRenderTime=0 — the same "GPU asleep"
//     default the governor boots with.
//   - isIdle: no user-activity tracker on this side -> false (treat as active,
//     which selects the ACTIVE CPU pressure limit, the conservative choice).
//   - THROTTLE: the Electron level depends on `consecutiveHighPressure` history,
//     which a stateless read cannot have. We map the INSTANTANEOUS pressure:
//     nominal->none, elevated->light, high->moderate, critical->aggressive. The
//     history-gated escalations (high+2 -> aggressive, critical+3 -> emergency)
//     cannot occur without a sampler loop, so this read never returns
//     "aggressive"-via-high or "emergency". getSnapshot embeds the same value.
//
// SKIPPED: none in this namespace reach dispatch — the other resource:* channels
// (shouldRender / reportRenderStart / reportRenderEnd / recordActivity) are all
// handled inside the renderer (rendererShims.ts) and never hit the bridge. Any
// future unrouted resource:* channel falls to `_ => Value::Null` (honest degrade).
// =============================================================================

use serde_json::{json, Value};
use sysinfo::System;

// --- hardware tier detection (mirror of detectHardwareTier) -----------------

#[derive(Clone, Copy, PartialEq, Eq)]
enum Tier {
    Low,
    Mid,
    High,
}

/// detectHardwareTier(): cpuCores + totalRAMMB -> tier.
///   low : <=4 cores OR <=4096 MB
///   mid : <=8 cores AND <=8192 MB
///   high: otherwise
fn detect_tier() -> Tier {
    let mut sys = System::new();
    sys.refresh_cpu();
    sys.refresh_memory();
    let cpu_cores = sys.cpus().len() as u64;
    // total_memory() is bytes; Electron used Math.round(totalmem/1024/1024).
    let total_ram_mb = ((sys.total_memory() as f64) / 1024.0 / 1024.0).round() as u64;

    if cpu_cores <= 4 || total_ram_mb <= 4096 {
        Tier::Low
    } else if cpu_cores <= 8 && total_ram_mb <= 8192 {
        Tier::Mid
    } else {
        Tier::High
    }
}

// Tier-aware limits used by pressure/budget math (subset of limitsForTier that
// the ported reads actually consume).
struct Limits {
    max_total_memory_mb: f64,
    max_heap_memory_mb: f64,
    #[allow(dead_code)] // tier idle budget; stateless read always uses the active limit
    max_idle_cpu_percent: f64,
    max_active_cpu_percent: f64,
    budget_ui: i64,
    budget_workflows: i64,
    budget_storage: i64,
    budget_indexing: i64,
    budget_cache: i64,
    budget_python: i64,
}

fn limits_for(tier: Tier) -> Limits {
    match tier {
        Tier::Low => Limits {
            max_total_memory_mb: 1024.0,
            max_heap_memory_mb: 512.0,
            max_idle_cpu_percent: 30.0,
            max_active_cpu_percent: 70.0,
            budget_ui: 192,
            budget_workflows: 96,
            budget_storage: 96,
            budget_indexing: 48,
            budget_cache: 64,
            budget_python: 128,
        },
        Tier::Mid => Limits {
            max_total_memory_mb: 2048.0,
            max_heap_memory_mb: 1024.0,
            max_idle_cpu_percent: 60.0,
            max_active_cpu_percent: 90.0,
            budget_ui: 256,
            budget_workflows: 128,
            budget_storage: 128,
            budget_indexing: 64,
            budget_cache: 128,
            budget_python: 256,
        },
        Tier::High => Limits {
            max_total_memory_mb: 4096.0,
            max_heap_memory_mb: 2048.0,
            max_idle_cpu_percent: 90.0,
            max_active_cpu_percent: 100.0,
            budget_ui: 512,
            budget_workflows: 256,
            budget_storage: 256,
            budget_indexing: 128,
            budget_cache: 256,
            budget_python: 512,
        },
    }
}

// --- live system metrics ----------------------------------------------------

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Sample memory + CPU. CPU needs two refreshes a short interval apart to yield a
/// real delta (same idiom as power.rs::sampled_system).
struct Metrics {
    rss_mb: i64,
    cpu_percent: f64,
}

fn sample_metrics() -> Metrics {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu();
    sys.refresh_memory();

    let _total = sys.total_memory();
    let used = sys.used_memory(); // bytes; total - available
    let rss_mb = ((used as f64) / 1024.0 / 1024.0).round() as i64;
    let cpu_percent = sys.global_cpu_info().cpu_usage() as f64; // 0..100
    Metrics { rss_mb, cpu_percent }
}

// --- pressure / throttle (mirror of calculatePressure / calculateThrottleLevel)

/// calculatePressure(snapshot) with the documented memory/cpu divergence: heap
/// term equals the rss term (no separate V8 heap), idle assumed false so the
/// ACTIVE cpu limit applies.
fn calculate_pressure(limits: &Limits, rss_mb: i64, cpu_percent: f64) -> &'static str {
    let mem_percent = (rss_mb as f64 / limits.max_total_memory_mb) * 100.0;
    let heap_percent = (rss_mb as f64 / limits.max_heap_memory_mb) * 100.0;
    let cpu_limit = limits.max_active_cpu_percent; // isIdle = false (see header)
    let cpu_ratio = (cpu_percent / cpu_limit) * 100.0;

    if mem_percent >= 98.0 || heap_percent >= 98.0 || cpu_ratio >= 300.0 {
        "critical"
    } else if mem_percent >= 95.0 || heap_percent >= 95.0 || cpu_ratio >= 250.0 {
        "high"
    } else if mem_percent >= 85.0 || heap_percent >= 85.0 || cpu_ratio >= 200.0 {
        "elevated"
    } else {
        "nominal"
    }
}

/// History-free throttle mapping (see header THROTTLE divergence). With no
/// consecutiveHighPressure counter, the escalations gated on it cannot fire.
fn throttle_for(pressure: &str) -> &'static str {
    match pressure {
        "critical" => "aggressive",
        "high" => "moderate",
        "elevated" => "light",
        _ => "none",
    }
}

// --- channel implementations ------------------------------------------------

/// getSubsystemBudgets(): one row per initialized subsystem, in insertion order.
fn get_budgets(limits: &Limits) -> Value {
    json!([
        { "name": "UI",        "budgetMB": limits.budget_ui,        "currentMB": 0, "violations": 0 },
        { "name": "Workflows", "budgetMB": limits.budget_workflows, "currentMB": 0, "violations": 0 },
        { "name": "Storage",   "budgetMB": limits.budget_storage,   "currentMB": 0, "violations": 0 },
        { "name": "Indexing",  "budgetMB": limits.budget_indexing,  "currentMB": 0, "violations": 0 },
        { "name": "Cache",     "budgetMB": limits.budget_cache,     "currentMB": 0, "violations": 0 },
        { "name": "Python",    "budgetMB": limits.budget_python,    "currentMB": 0, "violations": 0 },
    ])
}

/// takeSnapshot() at the ResourceSnapshot shape (see header for field mapping).
fn get_snapshot(limits: &Limits) -> Value {
    let m = sample_metrics();
    let pressure = calculate_pressure(limits, m.rss_mb, m.cpu_percent);
    let throttle = throttle_for(pressure);
    json!({
        "timestamp": now_ms(),
        "memory": {
            "heapUsedMB": m.rss_mb,
            "heapTotalMB": m.rss_mb,
            "rssMB": m.rss_mb,
            "externalMB": 0,
        },
        "cpu": {
            "user": 0,
            "system": 0,
            "percentEstimate": m.cpu_percent,
        },
        "gpu": {
            "activityLevel": "sleeping",
            "isRendering": false,
            "lastRenderTime": 0,
        },
        "pressure": pressure,
        "throttleLevel": throttle,
        "isIdle": false,
    })
}

/// Route a `resource:*` channel. Args are the positional JSON array the renderer
/// sent; these four queries take no arguments.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    let tier = detect_tier();
    let limits = limits_for(tier);
    match channel {
        "resource:getBudgets" => get_budgets(&limits),
        "resource:getSnapshot" => get_snapshot(&limits),
        "resource:getPressure" => {
            let m = sample_metrics();
            json!(calculate_pressure(&limits, m.rss_mb, m.cpu_percent))
        }
        "resource:getThrottleLevel" => {
            let m = sample_metrics();
            let pressure = calculate_pressure(&limits, m.rss_mb, m.cpu_percent);
            json!(throttle_for(pressure))
        }
        _ => Value::Null,
    }
}

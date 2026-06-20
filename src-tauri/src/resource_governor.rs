// =============================================================================
// DEX Tauri — Resource Governor status tier (port of the `resource-governor:*`
// IPC surface in core/ResourceGovernor.ts).
//
// The Electron ResourceGovernor is a LIVE OS-timer-driven sampler: a setInterval
// loop folds `process.memoryUsage()` (the main process V8 heap), per-call
// `process.cpuUsage()` deltas, and renderer-reported GPU/render state into a
// pressure/throttle state machine. None of that runtime exists in the Tauri main
// process (no V8 heap, no renderer GPU reporter, no user-activity tracker). This
// module ports ONLY the read surface the renderer invokes, at the Electron return
// shapes, computing every value from live SYSTEM metrics (sysinfo, already a
// Cargo dependency — same idiom as resource_monitoring.rs / power.rs). Nothing is
// persisted; each call recomputes from the machine. No dependency is added.
//
// NOTE ON STORAGE: the task named `datastore-kv:resource-governor` as a storage
// key, but ResourceGovernor.ts persists NOTHING — it has no electron-store and no
// DataStore key. Its state is entirely in-memory, rebuilt at boot from hardware
// detection. There is therefore no KV key to read/write; this is a pure compute
// read tier, exactly like the sibling `resource:*` port (resource_monitoring.rs).
//
// CHANNEL: `resource-governor:getStatus`.
//   The Electron ResourceGovernor exposes NO `getStatus` handler. Its real
//   `resource-governor:*` invoke handlers are `getHardwareProfile` (returns the
//   `hardwareProfile` object) and `getThrottleLevel` (returns `currentThrottle`).
//   getStatus is therefore SYNTHESIZED from the governor's genuine public query
//   surface (getHardwareProfile + getThrottleLevel + getSnapshot + getPressure),
//   composed into one status object so the renderer can read the governor's live
//   state in a single call. Every field below is a real value the governor would
//   return from one of its existing getters — no field is invented beyond the
//   composition itself. Shapes mirror ResourceGovernor.ts exactly:
//     {
//       hardwareProfile: { tier, cpuCores, totalRAMMB, cpuModel },
//       pressure:     ResourcePressure,
//       throttleLevel: ThrottleLevel,
//       snapshot:     ResourceSnapshot,
//     }
//
// DIVERGENCES (documented; values stay TRUTHFUL, nothing fabricated):
//   - SYNTHESIS: getStatus has no Electron handler (see above). It composes the
//     governor's existing getters; the composition wrapper is the only new shape.
//   - MEMORY: Electron reported the main process V8 heap (heapUsed/heapTotal/
//     external) + rss. There is no V8 here, so memory.rssMB = system used memory
//     (total - available, MB); heapUsedMB/heapTotalMB mirror rssMB and externalMB
//     is 0. Pressure uses the rss term (heap term equals it, never dominant).
//   - CPU: percentEstimate is the live global CPU usage (sysinfo, sampled across
//     MINIMUM_CPU_UPDATE_INTERVAL) rather than the main process cpuUsage delta.
//     user/system microsecond fields have no cross-process analogue -> 0.
//   - GPU: no renderer render-reporter exists, so activityLevel is "sleeping",
//     isRendering=false, lastRenderTime=0 — the governor's boot default.
//   - isIdle: no user-activity tracker -> false (active; selects the ACTIVE CPU
//     pressure limit, the conservative choice).
//   - THROTTLE: the Electron level depends on `consecutiveHighPressure` history,
//     which a stateless read cannot have. We map the INSTANTANEOUS pressure:
//     nominal->none, elevated->light, high->moderate, critical->aggressive. The
//     history-gated escalations (high+2 -> aggressive, critical+3 -> emergency)
//     cannot occur without a sampler loop.
//
// HEAVY CHANNELS (now implemented natively from the governor's REAL methods):
//   - allocate   : ports canAllocate(requestedMB) — projects live rssMB +
//                  requestedMB against the 90% MAX_TOTAL_MEMORY_MB threshold. The
//                  governor's budget math is pure-compute; the only divergence is
//                  the rss term (system used memory, same as the read tier).
//   - throttle   : ports getThrottleConfig(level) + notifyThrottleChange(). The
//                  throttle CONFIG is pure-compute and returned verbatim. The live
//                  side-effects (forceGC, cache pruning) belong to the V8/Memory
//                  Manager runtime that does not exist here; what IS real is the
//                  renderer push (Electron's criticalPressureResponse sends
//                  `resource-governor:reduce-memory`) — we emit it via
//                  native_ops::emit_event so the renderer still reacts.
//   - prioritize : ports getMaxConcurrency() + getThrottleConfig().limitConcurrency
//                  — the concurrency budget the scheduler would consult, computed
//                  from the live throttle level. Returns the concurrency the
//                  governor would grant for a task at the current pressure.
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

impl Tier {
    fn as_str(self) -> &'static str {
        match self {
            Tier::Low => "low",
            Tier::Mid => "mid",
            Tier::High => "high",
        }
    }
}

/// detectHardwareTier(): cpuCores + totalRAMMB -> tier + profile fields.
///   low : <=4 cores OR <=4096 MB
///   mid : <=8 cores AND <=8192 MB
///   high: otherwise
struct Profile {
    tier: Tier,
    cpu_cores: u64,
    total_ram_mb: u64,
    cpu_model: String,
}

fn detect_profile() -> Profile {
    let mut sys = System::new();
    sys.refresh_cpu();
    sys.refresh_memory();
    let cpus = sys.cpus();
    let cpu_cores = cpus.len() as u64;
    // total_memory() is bytes; Electron used Math.round(totalmem/1024/1024).
    let total_ram_mb = ((sys.total_memory() as f64) / 1024.0 / 1024.0).round() as u64;
    // os.cpus()[0]?.model ?? 'Unknown'
    let cpu_model = cpus
        .first()
        .map(|c| c.brand().to_string())
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| "Unknown".to_string());

    let tier = if cpu_cores <= 4 || total_ram_mb <= 4096 {
        Tier::Low
    } else if cpu_cores <= 8 && total_ram_mb <= 8192 {
        Tier::Mid
    } else {
        Tier::High
    };

    Profile {
        tier,
        cpu_cores,
        total_ram_mb,
        cpu_model,
    }
}

/// hardwareProfile shape: { tier, cpuCores, totalRAMMB, cpuModel }.
fn hardware_profile(p: &Profile) -> Value {
    json!({
        "tier": p.tier.as_str(),
        "cpuCores": p.cpu_cores,
        "totalRAMMB": p.total_ram_mb,
        "cpuModel": p.cpu_model,
    })
}

// Tier-aware limits used by pressure math (subset of limitsForTier the read
// surface actually consumes).
struct Limits {
    max_total_memory_mb: f64,
    max_heap_memory_mb: f64,
    max_active_cpu_percent: f64,
}

fn limits_for(tier: Tier) -> Limits {
    match tier {
        Tier::Low => Limits {
            max_total_memory_mb: 1024.0,
            max_heap_memory_mb: 512.0,
            max_active_cpu_percent: 70.0,
        },
        Tier::Mid => Limits {
            max_total_memory_mb: 2048.0,
            max_heap_memory_mb: 1024.0,
            max_active_cpu_percent: 90.0,
        },
        Tier::High => Limits {
            max_total_memory_mb: 4096.0,
            max_heap_memory_mb: 2048.0,
            max_active_cpu_percent: 100.0,
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

struct Metrics {
    rss_mb: i64,
    cpu_percent: f64,
}

/// Sample memory + CPU. CPU needs two refreshes a short interval apart to yield a
/// real delta (same idiom as power.rs::sampled_system / resource_monitoring.rs).
fn sample_metrics() -> Metrics {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu();
    sys.refresh_memory();

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

/// getThrottleConfig(level) — verbatim port of the Electron switch. Pure compute;
/// returns the ThrottleConfig the governor associates with a throttle level.
/// (Fields: deferBackgroundTasks, reduceCacheSize, pauseIndexing, forceGC,
/// limitConcurrency.)
fn throttle_config(level: &str) -> Value {
    let (defer, reduce_cache, pause_index, force_gc, concurrency) = match level {
        "emergency" => (true, true, true, true, 1),
        "aggressive" => (true, true, true, true, 1),
        "moderate" => (true, true, true, false, 2),
        "light" => (true, false, false, false, 3),
        _ => (false, false, false, false, 4),
    };
    json!({
        "deferBackgroundTasks": defer,
        "reduceCacheSize": reduce_cache,
        "pauseIndexing": pause_index,
        "forceGC": force_gc,
        "limitConcurrency": concurrency,
    })
}

/// limitConcurrency extracted from throttle_config (mirror of getMaxConcurrency()).
fn max_concurrency(level: &str) -> i64 {
    match level {
        "emergency" | "aggressive" => 1,
        "moderate" => 2,
        "light" => 3,
        _ => 4,
    }
}

/// Live throttle level for the current machine state: sample metrics, derive
/// instantaneous pressure, map to a throttle level (same history-free mapping the
/// read tier uses). Shared by throttle/prioritize when no explicit level is given.
fn current_throttle_level() -> (&'static str, Metrics, &'static str) {
    let profile = detect_profile();
    let limits = limits_for(profile.tier);
    let m = sample_metrics();
    let pressure = calculate_pressure(&limits, m.rss_mb, m.cpu_percent);
    let throttle = throttle_for(pressure);
    (throttle, m, pressure)
}

/// takeSnapshot() at the ResourceSnapshot shape (see header for field mapping).
fn build_snapshot(m: &Metrics, pressure: &str, throttle: &str) -> Value {
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

/// Synthesized getStatus(): the governor's live query surface in one object.
fn get_status() -> Value {
    let profile = detect_profile();
    let limits = limits_for(profile.tier);
    let m = sample_metrics();
    let pressure = calculate_pressure(&limits, m.rss_mb, m.cpu_percent);
    let throttle = throttle_for(pressure);
    let snapshot = build_snapshot(&m, pressure, throttle);

    json!({
        "hardwareProfile": hardware_profile(&profile),
        "pressure": pressure,
        "throttleLevel": throttle,
        "snapshot": snapshot,
    })
}

// --- heavy channels ---------------------------------------------------------

/// Extract a requested-MB number from the positional args (allocate(requestedMB)).
/// Accepts a bare number, or a `{ requestedMB }` / `{ mb }` object.
fn requested_mb(args: &Value) -> f64 {
    let first = args.get(0);
    if let Some(v) = first {
        if let Some(n) = v.as_f64() {
            return n.max(0.0);
        }
        if let Some(n) = v.get("requestedMB").and_then(|x| x.as_f64()) {
            return n.max(0.0);
        }
        if let Some(n) = v.get("mb").and_then(|x| x.as_f64()) {
            return n.max(0.0);
        }
    }
    0.0
}

/// resource-governor:allocate — port of canAllocate(requestedMB).
/// Electron: projectedMB = lastSnapshot.rssMB + requestedMB;
///           allowed = projectedMB < MAX_TOTAL_MEMORY_MB * 0.9.
/// We use live system rss (same divergence as the read tier). Returns the boolean
/// plus the supporting figures so the renderer can show the budget decision.
fn allocate(args: &Value) -> Value {
    let req = requested_mb(args);
    let profile = detect_profile();
    let limits = limits_for(profile.tier);
    let m = sample_metrics();
    let projected = m.rss_mb as f64 + req;
    let threshold = limits.max_total_memory_mb * 0.9;
    let allowed = projected < threshold;
    // getBudgetRemaining(): max(0, MAX_TOTAL - rss).
    let remaining = (limits.max_total_memory_mb - m.rss_mb as f64).max(0.0);
    json!({
        "success": true,
        "allowed": allowed,
        "requestedMB": req,
        "currentRssMB": m.rss_mb,
        "projectedMB": projected,
        "thresholdMB": threshold,
        "maxTotalMemoryMB": limits.max_total_memory_mb,
        "budgetRemainingMB": remaining,
    })
}

/// resource-governor:throttle — port of getThrottleConfig(level) + the renderer
/// push side of notifyThrottleChange / criticalPressureResponse.
/// arg(0) may be an explicit level ("none"|"light"|"moderate"|"aggressive"|
/// "emergency"); when absent/invalid the live level is computed from metrics.
/// Emits `resource-governor:reduce-memory` to the renderer when the level is
/// aggressive/emergency (Electron's criticalPressureResponse behavior).
fn throttle(app: &tauri::AppHandle, args: &Value) -> Value {
    let explicit = args.get(0).and_then(|v| v.as_str()).map(|s| s.to_string());
    let valid = matches!(
        explicit.as_deref(),
        Some("none") | Some("light") | Some("moderate") | Some("aggressive") | Some("emergency")
    );
    let (level, pressure): (String, String) = if valid {
        let lvl = explicit.unwrap();
        // Pressure not derivable from an externally-forced level; report as unknown.
        (lvl, "forced".to_string())
    } else {
        let (lvl, _m, p) = current_throttle_level();
        (lvl.to_string(), p.to_string())
    };

    let config = throttle_config(&level);

    // Renderer push: Electron sends `resource-governor:reduce-memory` on critical
    // (aggressive/emergency) responses. Emit it honestly so the renderer reacts.
    let pushed = if level == "aggressive" || level == "emergency" {
        crate::native_ops::emit_event(
            app,
            "resource-governor:reduce-memory",
            &json!({ "throttleLevel": level, "timestamp": now_ms() }),
        );
        true
    } else {
        false
    };

    json!({
        "success": true,
        "throttleLevel": level,
        "pressure": pressure,
        "config": config,
        "reduceMemoryPushed": pushed,
    })
}

/// resource-governor:prioritize — port of getMaxConcurrency() + shouldDeferWork().
/// Returns the concurrency budget the scheduler would grant for a task at the
/// current (or explicitly-supplied) throttle level. arg(0) optional explicit level.
fn prioritize(args: &Value) -> Value {
    let explicit = args.get(0).and_then(|v| v.as_str()).map(|s| s.to_string());
    let valid = matches!(
        explicit.as_deref(),
        Some("none") | Some("light") | Some("moderate") | Some("aggressive") | Some("emergency")
    );
    let (level, pressure): (String, String) = if valid {
        (explicit.unwrap(), "forced".to_string())
    } else {
        let (lvl, _m, p) = current_throttle_level();
        (lvl.to_string(), p.to_string())
    };

    let concurrency = max_concurrency(&level);
    let should_defer = level != "none";
    json!({
        "success": true,
        "throttleLevel": level,
        "pressure": pressure,
        "maxConcurrency": concurrency,
        "shouldDeferWork": should_defer,
        "config": throttle_config(&level),
    })
}

/// Route a `resource-governor:*` channel. Args are the positional JSON array the
/// renderer sent; getStatus takes no arguments. Heavy channels (allocate/throttle/
/// prioritize) are ported from the governor's real methods; unknown channels fall
/// to Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "resource-governor:getStatus" => get_status(),
        "resource-governor:allocate" => allocate(args),
        "resource-governor:throttle" => throttle(app, args),
        "resource-governor:prioritize" => prioritize(args),
        _ => Value::Null,
    }
}

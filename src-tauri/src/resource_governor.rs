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
// SKIPPED (heavy / live-runtime channels — NOT implemented, NOT faked):
//   - allocate   : memory allocation/budget mutation needs the live governor's
//                  rss snapshot + subsystem budget counters (canAllocate); a
//                  stateless read cannot reserve or mutate memory.
//   - throttle   : forcing a throttle level drives renderer callbacks / GC / cache
//                  pruning side-effects in the live process — no Tauri host.
//   - prioritize : task prioritization acts on the live concurrency/throttle
//                  config; no scheduler exists in this read tier.
//   These fall to `_ => Value::Null` (honest degrade); the renderer never reads a
//   shaped object back from them.
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

/// Route a `resource-governor:*` channel. Args are the positional JSON array the
/// renderer sent; getStatus takes no arguments. Heavy channels (allocate/throttle/
/// prioritize) and any unknown channel fall to Value::Null (honest degrade).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "resource-governor:getStatus" => get_status(),
        _ => Value::Null,
    }
}

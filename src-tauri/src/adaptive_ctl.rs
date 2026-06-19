// =============================================================================
// DEX Tauri — Adaptive Rendering read tier (port of core/AdaptiveRenderingEngine.ts,
// the `adaptive:*` IPC handlers).
//
// The Electron AdaptiveRenderingEngine is a LIVE engine: a 10s monitor loop folds
// real-time CPU/battery samples into a tier demotion/promotion state machine, and
// the renderer pushes activity (setRenderActive / setExportActive / setFocusedApp)
// that mutates that state and re-broadcasts the policy. None of that runtime exists
// on the Tauri main side (no monitor loop, no renderer activity reporter, no
// SystemProfiler instance holding `currentState`). This module ports ONLY the three
// read queries the renderer invokes, at the EXACT Electron return shapes, computing
// the underlying tier/load LIVE from system metrics (sysinfo + std) — the same
// approach as performance_tier.rs and resource_monitoring.rs. Nothing is persisted;
// every value is recomputed on each call. No new dependency is added.
//
// Storage note: the contract names `datastore-kv:adaptive`, but the Electron engine
// never reads or writes any store of its own — its policy is DERIVED from
// SystemProfiler (which persists `dex-system-profile`, not an `adaptive` key) and
// from in-memory activity flags. These three read channels therefore have NO
// persisted read-path state; there is nothing to fetch from kv:adaptive, so we
// compute live rather than invent a store. (kv_get/kv_set are intentionally unused.)
//
// PORTED (exact shape, matching registerIpcHandlers()):
//   - adaptive:getPolicy        -> RenderingPolicy (15 fields). The base tier is
//                                  SystemProfiler.getTier() (1|2|3); with no live
//                                  demotion state, effectiveTier == tier, exactly
//                                  what a freshly-constructed engine returns before
//                                  any setRenderActive/dynamicAdjustment runs.
//   - adaptive:getEffectiveTier -> number (policy.effectiveTier) = the base tier.
//   - adaptive:getSystemLoad    -> { cpuPercent, ramPercent, tier, onBattery,
//                                  renderActive, exportActive }.
//
// Tier computation mirrors SystemProfiler.calculateTier() exactly (the same scoring
// AdaptiveRenderingEngine's constructor consumes via systemProfiler.getTier()),
// fed by the natively-available metrics. policyForTier() is reproduced verbatim.
//
// DIVERGENCES (documented; values stay TRUTHFUL, nothing fabricated):
//   - calculateTier inputs without a native source default to the SAME values the
//     Tauri host actually has, mirroring sibling ports:
//       * gpu.isDedicated  = false  (no main-side GPU probe; identical to
//                                     performance_tier.rs's hasDiscreteGpu=false).
//       * storage.type     = "unknown" (no storage benchmark on this side; scores
//                             +10, the calculateTier 'unknown' branch).
//       * battery          = plugged in (sysinfo has no battery API and we add no
//                             crate — same stance as power.rs getStats; isPluggedIn
//                             true, so the battery -10 penalty does not apply and
//                             onBattery is false).
//       * backgroundProcessCount = -1 (the value SystemProfiler.updateSystemState
//                             itself uses on the monitoring path, where the
//                             expensive process count is skipped; < 200, no penalty).
//     RAM%/CPU% (the dynamic terms) ARE sampled live, so heavy-load tier
//     degradation is reproduced faithfully.
//   - getSystemLoad.onBattery is always false (see battery note). renderActive /
//     exportActive are always false: those flags are only ever set by the SKIPPED
//     setRenderActive / setExportActive channels, which have no host here, so the
//     engine's initial `false` is the steady, honest value.
//   - effectiveTier never diverges from tier: demotion/promotion is driven by the
//     monitor loop + activity flags (all SKIPPED / hostless), so the stateless read
//     always reports the base tier — the engine's pre-monitoring state.
//
// SKIPPED (heavy; not ported, not faked):
//   - adaptive:setRenderActive, adaptive:setExportActive, adaptive:setFocusedApp,
//     adaptive:shouldYieldCpu — all need the live in-memory engine (activity flags,
//     recalculatePolicy/broadcast, live cpuUsage gate). They mutate or read mutable
//     runtime state that does not exist on the Tauri main side. They fall through to
//     `_ => Value::Null` (honest degrade), so prefix-routing the whole namespace is
//     safe. None of the three PORTED channels depend on those flags' true values.
// =============================================================================

use serde_json::{json, Value};
use sysinfo::System;

// --- live system metrics ----------------------------------------------------

/// Sample CPU% and RAM% from live system metrics. CPU needs two refreshes a short
/// interval apart to yield a real delta (same idiom as resource_monitoring.rs /
/// power.rs). RAM% mirrors SystemProfiler: round(used / total * 100).
struct Load {
    cpu_percent: f64,
    ram_percent: i64,
    ram_gb: f64,
    cores: u64,
}

fn sample_load() -> Load {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu();
    sys.refresh_memory();

    let total = sys.total_memory().max(1); // bytes; avoid div-by-zero
    let used = sys.used_memory(); // bytes; total - available
    let cpu_percent = sys.global_cpu_info().cpu_usage() as f64; // 0..100
    let ram_percent = ((used as f64 / total as f64) * 100.0).round() as i64;
    // SystemProfiler: Math.round((totalmem / 1024^3) * 10) / 10.
    let ram_gb = ((total as f64 / (1024.0 * 1024.0 * 1024.0)) * 10.0).round() / 10.0;
    let cores = sys.cpus().len() as u64;

    Load { cpu_percent, ram_percent, ram_gb, cores }
}

// --- tier scoring (mirror of SystemProfiler.calculateTier) ------------------

/// calculateTier(hardware, state) from SystemProfiler.ts, fed by live metrics and
/// the documented native defaults for the inputs without a host source. Returns the
/// CapabilityTier 1|2|3 that AdaptiveRenderingEngine's constructor consumes.
fn calculate_tier(load: &Load) -> i64 {
    let mut score: i64 = 0;

    // RAM scoring (max 30).
    if load.ram_gb >= 16.0 {
        score += 30;
    } else if load.ram_gb >= 8.0 {
        score += 20;
    } else {
        score += 5;
    }

    // CPU scoring (max 30) — logicalThreads == os.cpus().length here.
    if load.cores >= 8 {
        score += 30;
    } else if load.cores >= 4 {
        score += 20;
    } else {
        score += 5;
    }

    // GPU scoring (max 20): isDedicated=false (no main-side probe) -> +8.
    score += 8;

    // Storage scoring (max 20): type="unknown" (no benchmark) -> +10.
    score += 10;

    // Dynamic adjustments from live state.
    if load.cpu_percent > 80.0 {
        score -= 15;
    } else if load.cpu_percent > 60.0 {
        score -= 8;
    }

    if load.ram_percent > 85 {
        score -= 10;
    } else if load.ram_percent > 70 {
        score -= 5;
    }

    // Battery: plugged in (no native battery source) -> no penalty.
    // backgroundProcessCount = -1 (monitoring-path default) -> not > 200, no penalty.

    if score >= 70 {
        1
    } else if score >= 40 {
        2
    } else {
        3
    }
}

// --- policy definitions (verbatim port of policyForTier) --------------------

/// policyForTier(tier): the full RenderingPolicy for a base tier. `maxFps:0` means
/// unlimited (Electron used 0). `timelineLongClipThresholdMin: Infinity` for tier 1
/// is emitted as a JSON number via f64::INFINITY -> serde renders it as null, which
/// is exactly how Electron's `Infinity` crosses IPC (JSON.stringify(Infinity)===null);
/// the renderer's `> threshold` comparisons treat that identically (never "long").
fn policy_for_tier(tier: i64) -> Value {
    match tier {
        1 => json!({
            "tier": 1,
            "effectiveTier": 1,
            "maxResolutionScale": 1.0,
            "maxPreviewResolution": 2160,
            "timelineAccuracy": "frame",
            "timelineLongClipThresholdMin": f64::INFINITY,
            "animationsEnabled": true,
            "maxFps": 0,
            "imagePreviewScale": 1.0,
            "imagePreviewDelayMs": 0,
            "gpuBudgetPercent": 80,
            "cpuMaxPercent": 90,
            "backgroundCpuMaxPercent": 70,
            "backgroundProcessCpuCapPercent": 15,
        }),
        3 => json!({
            "tier": 3,
            "effectiveTier": 3,
            "maxResolutionScale": 0.75,
            "maxPreviewResolution": 720,
            "timelineAccuracy": "keyframe",
            "timelineLongClipThresholdMin": 0,
            "animationsEnabled": false,
            "maxFps": 30,
            "imagePreviewScale": 0.5,
            "imagePreviewDelayMs": 0,
            "gpuBudgetPercent": 60,
            "cpuMaxPercent": 85,
            "backgroundCpuMaxPercent": 50,
            "backgroundProcessCpuCapPercent": 10,
        }),
        // Tier 2 is also the `default:` fallback in policyForTier (any non-1/3).
        _ => json!({
            "tier": 2,
            "effectiveTier": 2,
            "maxResolutionScale": 1.0,
            "maxPreviewResolution": 1080,
            "timelineAccuracy": "frame",
            "timelineLongClipThresholdMin": 30,
            "animationsEnabled": true,
            "maxFps": 60,
            "imagePreviewScale": 1.0,
            "imagePreviewDelayMs": 100,
            "gpuBudgetPercent": 80,
            "cpuMaxPercent": 90,
            "backgroundCpuMaxPercent": 70,
            "backgroundProcessCpuCapPercent": 15,
        }),
    }
}

// --- channel implementations ------------------------------------------------

/// adaptive:getPolicy — the current RenderingPolicy. With no demotion runtime,
/// this is policyForTier(baseTier), where effectiveTier == tier.
fn get_policy(load: &Load) -> Value {
    policy_for_tier(calculate_tier(load))
}

/// adaptive:getSystemLoad — { cpuPercent, ramPercent, tier, onBattery,
/// renderActive, exportActive }. tier here is policy.effectiveTier (== base tier).
fn get_system_load(load: &Load) -> Value {
    let tier = calculate_tier(load);
    json!({
        "cpuPercent": load.cpu_percent,
        "ramPercent": load.ram_percent,
        "tier": tier,
        "onBattery": false,
        "renderActive": false,
        "exportActive": false,
    })
}

/// Route an `adaptive:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts); these three reads take no arguments. Every channel in
/// the namespace is accounted for: the four heavy channels and any unknown one fall
/// to `_ => Value::Null` (honest degrade), so prefix-routing the namespace is safe.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "adaptive:getPolicy" => get_policy(&sample_load()),
        "adaptive:getEffectiveTier" => json!(calculate_tier(&sample_load())),
        "adaptive:getSystemLoad" => get_system_load(&sample_load()),
        // HEAVY (skipped): setRenderActive / setExportActive / setFocusedApp /
        // shouldYieldCpu — need the live in-memory engine; honest null.
        _ => Value::Null,
    }
}

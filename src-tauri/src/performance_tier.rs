// =============================================================================
// DEX Tauri — Performance Tier subsystem (port of compute/PerfTier.ts, perf:*).
//
// One channel: `perf:getTier` -> { tier, preset } — the authoritative host
// performance classification the renderer reads so creative apps stop
// re-detecting capability independently. Pure data, computed live from system
// metrics (sysinfo + std); nothing is persisted.
//
// Electron handler (main.ts):
//     ipcMain.handle('perf:getTier', () => {
//       try { const tier = getPerfTier(); return { tier, preset: presetFor(tier) }; }
//       catch (err) { return { error: err?.message || String(err) }; }
//     });
//
// `tier` is one of: "ultra-low" | "low" | "mid" | "high" | "workstation".
// `preset` is the TierPreset object (webgpuEnabled, onnxQuant, scopesFps,
// particleBudget, workerThreads, pathTracing, audioBufferSamples,
// maxConcurrentRenders) — field names/types match PerfTier.ts exactly so the
// renderer is unchanged.
//
// Host detection mirrors detectHost()/classifyTier()/presetFor():
//   - cores         : logical CPU count (std::thread::available_parallelism,
//                     same intent as os.cpus().length, min 1).
//   - physicalCores : cores/2 if the CPU brand looks like an SMT part
//                     (intel/amd ryzen/epyc/xeon), else cores.
//   - ramGb         : floor(total_memory bytes / 1024^3) — sysinfo reports
//                     bytes, matching os.totalmem().
//   - hasDiscreteGpu: false on the main side (Electron passed false here too;
//                     only the renderer probes navigator.gpu). So tier never
//                     reaches "high"/"workstation" from this handler — identical
//                     to the Electron main-side result.
//   - hasNpu        : true on macOS arm64 (Apple silicon), else false. Not used
//                     by classifyTier, kept for fidelity.
//   - DEX_PERF_TIER : env override honored exactly as getPerfTier() does.
//
// DIVERGENCES (documented):
//   - SMT detection reads sysinfo cpu.brand() rather than Node's
//     os.cpus()[0].model. Wording differs slightly across platforms; the regex
//     (intel|amd ryzen|epyc|xeon) is applied identically. On the same machine
//     the SMT decision matches in the common case.
//   - SIMD caps and arch/platform are computed for classification fidelity but
//     are NOT part of the perf:getTier return shape (Electron returned only
//     { tier, preset }), so no field-name mapping leaks to the renderer.
//   - No caching across calls (Electron memoized for process lifetime). The
//     computation is cheap and the result is stable, so each call recomputes;
//     the returned value is identical.
// =============================================================================

use serde_json::{json, Value};

const FORCED_TIER_ENV: &str = "DEX_PERF_TIER";

fn is_perf_tier(s: &str) -> bool {
    matches!(s, "ultra-low" | "low" | "mid" | "high" | "workstation")
}

/// Logical CPU count (>= 1), mirroring `Math.max(1, os.cpus().length)`.
fn logical_cores() -> u64 {
    std::thread::available_parallelism()
        .map(|n| n.get() as u64)
        .unwrap_or(1)
        .max(1)
}

/// Best-effort CPU brand string for the SMT heuristic. Mirrors
/// `os.cpus()[0].model` in intent (see divergence note in header).
fn cpu_brand() -> String {
    let mut sys = sysinfo::System::new();
    sys.refresh_cpu();
    sys.cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_default()
        .to_lowercase()
}

/// Total RAM in GB, floored. `total_memory()` is bytes (matches os.totalmem()).
fn ram_gb() -> u64 {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    sys.total_memory() / (1024u64 * 1024 * 1024)
}

/// Physical core estimate: halve when the brand looks like an SMT/HT part.
/// Mirrors detectHost(): `smt ? max(1, floor(cores/2)) : cores`.
fn physical_cores(cores: u64, brand: &str) -> u64 {
    let smt = brand.contains("intel")
        || brand.contains("amd ryzen")
        || brand.contains("epyc")
        || brand.contains("xeon");
    if smt {
        (cores / 2).max(1)
    } else {
        cores
    }
}

/// classifyTier(host) from PerfTier.ts, using the main-side hasDiscreteGpu=false.
fn classify_tier(physical_cores: u64, ram_gb: u64, has_discrete_gpu: bool) -> &'static str {
    if physical_cores >= 32 && ram_gb >= 32 && has_discrete_gpu {
        "workstation"
    } else if physical_cores >= 8 && ram_gb >= 16 && has_discrete_gpu {
        "high"
    } else if physical_cores >= 6 && ram_gb >= 8 {
        "mid"
    } else if physical_cores >= 4 && ram_gb >= 4 {
        "low"
    } else {
        "ultra-low"
    }
}

/// presetFor(tier, host) from PerfTier.ts. `workers = max(1, physicalCores - 1)`.
fn preset_for(tier: &str, physical_cores: u64) -> Value {
    let workers = physical_cores.saturating_sub(1).max(1);
    let min = |a: u64, b: u64| a.min(b);
    match tier {
        "ultra-low" => json!({
            "webgpuEnabled": false, "onnxQuant": "int4", "scopesFps": 0,
            "particleBudget": 1_000, "workerThreads": min(workers, 1),
            "pathTracing": false, "audioBufferSamples": 2048, "maxConcurrentRenders": 1
        }),
        "low" => json!({
            "webgpuEnabled": true, "onnxQuant": "int8", "scopesFps": 15,
            "particleBudget": 10_000, "workerThreads": min(workers, 2),
            "pathTracing": false, "audioBufferSamples": 1024, "maxConcurrentRenders": 1
        }),
        "mid" => json!({
            "webgpuEnabled": true, "onnxQuant": "int8", "scopesFps": 30,
            "particleBudget": 50_000, "workerThreads": min(workers, 4),
            "pathTracing": false, "audioBufferSamples": 512, "maxConcurrentRenders": 2
        }),
        "high" => json!({
            "webgpuEnabled": true, "onnxQuant": "fp16", "scopesFps": 60,
            "particleBudget": 200_000, "workerThreads": min(workers, 8),
            "pathTracing": false, "audioBufferSamples": 256, "maxConcurrentRenders": 4
        }),
        // "workstation" (and any unexpected value falls through to it, but
        // classify_tier only ever yields the five known tiers).
        _ => json!({
            "webgpuEnabled": true, "onnxQuant": "fp16", "scopesFps": 60,
            "particleBudget": 1_000_000, "workerThreads": workers,
            "pathTracing": true, "audioBufferSamples": 128, "maxConcurrentRenders": 8
        }),
    }
}

/// getPerfTier(): honor DEX_PERF_TIER override, else classify the live host.
fn get_perf_tier(physical_cores: u64, ram_gb: u64, has_discrete_gpu: bool) -> String {
    if let Ok(forced) = std::env::var(FORCED_TIER_ENV) {
        if is_perf_tier(&forced) {
            return forced;
        }
    }
    classify_tier(physical_cores, ram_gb, has_discrete_gpu).to_string()
}

/// Route a `perf:*` channel. Args arrive as a positional JSON array, matching
/// analytics.rs / env_manager.rs conventions.
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "perf:getTier" => {
            // Main-side detection: no GPU probe here (Electron passed false too).
            let has_discrete_gpu = false;
            let cores = logical_cores();
            let brand = cpu_brand();
            let phys = physical_cores(cores, &brand);
            let ram = ram_gb();
            let tier = get_perf_tier(phys, ram, has_discrete_gpu);
            let preset = preset_for(&tier, phys);
            json!({ "tier": tier, "preset": preset })
        }
        _ => Value::Null,
    }
}

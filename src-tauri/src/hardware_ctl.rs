// =============================================================================
// DEX Tauri — Hardware subsystem (data tier of the hardware abstraction layer).
//
// Pure-data tier. The hardware namespace exposes two read-only DATA channels:
//   - hardware:getCapabilities -> HardwareCapabilityProfile
//   - hardware:getState        -> live system info snapshot
// and two HEAVY channels (control, query) that need a live native runtime and
// are NOT ported here (see channelsSkipped / dispatch).
//
// STORAGE (per the port contract): DataStore-KV, key "hardware". Capabilities
// are read from / written to the native KV store (dex-kv.json) via
// crate::kv_get(app, "hardware") / crate::kv_set(app, "hardware", value), the
// SAME backbone used by rule_engine.rs and modes_dispatch. On first read with no
// cached value we compute the data-tier-derivable profile from live host metrics
// (sysinfo + std, exactly as HardwareDetector.detect() does) and persist it under
// the "hardware" key, mirroring HardwareDetector's saveCache() behaviour.
//
// SHAPES (match the Electron source exactly; no invented fields):
//   getCapabilities -> HardwareCapabilityProfile from HardwareDetector.ts:
//     { cpu: CpuProfile, ram: RamProfile, storage: StorageProfile,
//       gpu: GpuProfile, battery: BatteryProfile, display: DisplayProfile,
//       thermal: ThermalProfile, tier, tierNumeric, timestamp }
//     CpuProfile     = { logicalCores, physicalCores, clockSpeedGHz,
//                        architecture, vendor, model, hasHyperthreading,
//                        hasEfficiencyCores, efficiencyCoreIndices[],
//                        performanceCoreIndices[], cpuScore }
//     RamProfile     = { totalBytes, totalMB, availableBytes, availableMB,
//                        usableMB, tier }
//     StorageProfile = { readMBps, writeMBps, storageClass }
//     GpuProfile     = { gpuClass, renderer, vendor, estimatedVRAM_MB,
//                        gpuScore, webgl2Supported }
//     BatteryProfile = { hasBattery, isCharging, percent, batteryClass,
//                        powerState }
//     DisplayProfile = { primaryRefreshRate, primaryDPI, displayCount,
//                        primaryWidth, primaryHeight }
//     ThermalProfile = { baselineTemp, currentTemp, thermalState, cpuUsageProxy }
//   getState -> getSystemInfo() (the `hardware:get-info` handler in
//     HardwareOptimization.ts):
//     { platform, arch, release, hostname, cpus: { model, cores, speed },
//       memory: { total, free }, uptime, loadavg: number[] }
//
// DIVERGENCES (documented):
//   - GPU detection in Electron came from a renderer-side WebGL probe
//     (detectGPUFromRenderer); with no renderer the detector seeds gpu='none'
//     with the literal zero/empty defaults from detect(). We reproduce that exact
//     seed (gpuClass:"none", renderer:"", vendor:"", estimatedVRAM_MB:0,
//     gpuScore:0, webgl2Supported:false). computeTier() therefore treats
//     hasDiscreteGPU=false, identical to the freshly-detected main-side profile.
//   - Storage: the real detect() runs a 16MB write/read benchmark (native I/O,
//     not a data op). We do not benchmark; we use detectStorage()'s OWN fallback
//     defaults (readMBps:200, writeMBps:150 => storageClass "fast-hdd"), the
//     value detect() yields when the benchmark cannot run. isSSD=false, matching
//     that fallback path's tier inputs.
//   - Battery: detectBattery() used the optional `systeminformation` module;
//     when absent it returns the `noBattery` literal. sysinfo has no battery API
//     and we add no crate (same precedent as power.rs / adaptive_ctl.rs), so we
//     emit that exact noBattery shape (hasBattery:false, isCharging:false,
//     percent:100, batteryClass:"desktop", powerState:"ac").
//   - Display: detectDisplay() read Electron's `screen` API (unavailable in a
//     pure-data port). We emit detectDisplay()'s OWN catch-branch defaults
//     (primaryRefreshRate:60, primaryDPI:1, displayCount:1, primaryWidth:1920,
//     primaryHeight:1080) — the documented no-screen fallback.
//   - Thermal: detect() seeds thermal with all-zero/"cool" defaults; updateThermal
//     is a live monitoring side-effect (native temp feed) with no data input
//     here, so the seed shape is what a fresh profile carries. Reproduced exactly.
//   - efficiencyCore split: sysinfo exposes no reliable per-core min/max speed
//     across platforms, so we take detectCPU()'s NON-efficiency-core path
//     (hasEfficiencyCores:false, efficiencyCoreIndices:[], performanceCoreIndices
//     = [0..logical), physicalCores = ceil(logical/2)). Same simplification as
//     db_perf_ctl.rs::physical_cores.
//   - architecture: detectCPU() used process.arch (e.g. "x64"); we map
//     std::env::consts::ARCH to Node's arch table (x86_64 -> "x64").
//   - timestamp: Date.now() -> SystemTime epoch millis. No Date crate.
//   - getState.loadavg: os.loadavg() returns three values; on Windows Node
//     reports [0,0,0]. sysinfo's load_average() is [0,0,0] on Windows too, so we
//     emit it directly (one/five/fifteen), matching Node's per-platform output.
// =============================================================================

use serde_json::{json, Value};

const KV_KEY: &str = "hardware";
const CPU_SCORE_REFERENCE: f64 = 8.0 * 4.0; // 8 cores * 4.0 GHz, from HardwareDetector

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// os.hostname(). Mirrors device_ctl.rs / http_transfer.rs (no dependency).
fn hostname() -> String {
    sysinfo::System::host_name()
        .or_else(|| std::env::var("COMPUTERNAME").ok())
        .or_else(|| std::env::var("HOSTNAME").ok())
        .unwrap_or_else(|| "DEX".to_string())
}

// process.platform values (same table as device_ctl.rs::node_platform).
fn node_platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    }
}

// process.arch -> Node arch strings (detectCPU().architecture).
fn node_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "x86" => "ia32",
        "aarch64" => "arm64",
        other => other,
    }
}

// --- detectCPU() ------------------------------------------------------------

fn detect_cpu() -> Value {
    let mut sys = sysinfo::System::new();
    sys.refresh_cpu();
    let cpus = sys.cpus();
    let logical_cores = cpus.len().max(1) as i64;

    let speeds: Vec<f64> = cpus.iter().map(|c| c.frequency() as f64).collect();
    let avg_speed = if speeds.is_empty() {
        0.0
    } else {
        speeds.iter().sum::<f64>() / speeds.len() as f64
    };

    // NON-efficiency-core path (see header divergence): no detected E/P split.
    let has_efficiency_cores = false;
    let efficiency_core_indices: Vec<i64> = Vec::new();
    let performance_core_indices: Vec<i64> = (0..logical_cores).collect();

    let physical_cores = ((logical_cores as f64) / 2.0).ceil() as i64;
    let has_hyperthreading = logical_cores > physical_cores;

    let model = cpus.first().map(|c| c.brand().to_string()).unwrap_or_default();
    let model_lower = model.to_lowercase();
    let vendor = if model_lower.contains("intel") || model_lower.contains("core") {
        "intel"
    } else if model_lower.contains("amd")
        || model_lower.contains("ryzen")
        || model_lower.contains("athlon")
    {
        "amd"
    } else if model_lower.contains("apple") {
        "apple"
    } else if model_lower.contains("qualcomm") || model_lower.contains("snapdragon") {
        "qualcomm"
    } else {
        "unknown"
    };

    let clock_ghz = avg_speed / 1000.0;
    let raw_score = physical_cores as f64 * clock_ghz;
    let cpu_score = ((raw_score / CPU_SCORE_REFERENCE) * 100.0).round().min(100.0).max(0.0) as i64;

    json!({
        "logicalCores": logical_cores,
        "physicalCores": physical_cores,
        "clockSpeedGHz": (clock_ghz * 100.0).round() / 100.0,
        "architecture": node_arch(),
        "vendor": vendor,
        "model": model,
        "hasHyperthreading": has_hyperthreading,
        "hasEfficiencyCores": has_efficiency_cores,
        "efficiencyCoreIndices": efficiency_core_indices,
        "performanceCoreIndices": performance_core_indices,
        "cpuScore": cpu_score,
    })
}

// --- detectRAM() ------------------------------------------------------------

fn detect_ram() -> Value {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    let total_bytes = sys.total_memory() as i64; // bytes (matches os.totalmem())
    let available_bytes = sys.free_memory() as i64; // bytes (matches os.freemem())
    let total_mb = ((total_bytes as f64) / (1024.0 * 1024.0)).round() as i64;
    let available_mb = ((available_bytes as f64) / (1024.0 * 1024.0)).round() as i64;
    let usable_mb = (total_mb - 512).max(((total_mb as f64) * 0.5).round() as i64);

    let tier = if total_mb < 4096 {
        "critical"
    } else if total_mb < 8192 {
        "low"
    } else if total_mb < 16384 {
        "medium"
    } else if total_mb < 32768 {
        "high"
    } else {
        "abundant"
    };

    json!({
        "totalBytes": total_bytes,
        "totalMB": total_mb,
        "availableBytes": available_bytes,
        "availableMB": available_mb,
        "usableMB": usable_mb,
        "tier": tier,
    })
}

// --- detectStorage() fallback (no benchmark — see header) -------------------

fn detect_storage() -> Value {
    // detectStorage()'s own defaults when the benchmark cannot run.
    let read_mbps = 200;
    let write_mbps = 150;
    let storage_class = if read_mbps < 150 {
        "slow-hdd"
    } else if read_mbps < 400 {
        "fast-hdd"
    } else if read_mbps < 550 {
        "sata-ssd"
    } else {
        "nvme-ssd"
    };
    json!({
        "readMBps": read_mbps,
        "writeMBps": write_mbps,
        "storageClass": storage_class,
    })
}

// --- gpu / battery / display / thermal seeds (detect() literals) ------------

fn seed_gpu() -> Value {
    json!({
        "gpuClass": "none",
        "renderer": "",
        "vendor": "",
        "estimatedVRAM_MB": 0,
        "gpuScore": 0,
        "webgl2Supported": false,
    })
}

fn no_battery() -> Value {
    json!({
        "hasBattery": false,
        "isCharging": false,
        "percent": 100,
        "batteryClass": "desktop",
        "powerState": "ac",
    })
}

fn default_display() -> Value {
    json!({
        "primaryRefreshRate": 60,
        "primaryDPI": 1,
        "displayCount": 1,
        "primaryWidth": 1920,
        "primaryHeight": 1080,
    })
}

fn seed_thermal() -> Value {
    json!({
        "baselineTemp": 0,
        "currentTemp": 0,
        "thermalState": "cool",
        "cpuUsageProxy": 0,
    })
}

// --- computeTier(cpu, ram, storage, gpu) ------------------------------------

fn compute_tier(cpu: &Value, ram: &Value, storage: &Value, gpu: &Value) -> &'static str {
    let cpu_score = cpu.get("cpuScore").and_then(|v| v.as_i64()).unwrap_or(0);
    let ram_tier = ram.get("tier").and_then(|v| v.as_str()).unwrap_or("");
    if cpu_score <= 15 || ram_tier == "critical" {
        return "tier-3-critical";
    }
    let storage_class = storage.get("storageClass").and_then(|v| v.as_str()).unwrap_or("");
    let is_nvme = storage_class == "nvme-ssd";
    let is_ssd = storage_class == "sata-ssd" || is_nvme;
    let gpu_class = gpu.get("gpuClass").and_then(|v| v.as_str()).unwrap_or("");
    let has_discrete_gpu = gpu_class.starts_with("discrete-") || gpu_class == "apple-silicon";
    let ram_high_plus = ram_tier == "high" || ram_tier == "abundant";
    let ram_med_plus = ram_high_plus || ram_tier == "medium";

    if cpu_score > 70 && ram_high_plus && is_nvme && has_discrete_gpu {
        "tier-1-premium"
    } else if cpu_score > 50 && ram_med_plus && is_ssd {
        "tier-1"
    } else if cpu_score > 30 {
        "tier-2"
    } else {
        "tier-3-standard"
    }
}

fn tier_to_numeric(tier: &str) -> i64 {
    match tier {
        "tier-1-premium" => 0,
        "tier-1" => 1,
        "tier-2" => 2,
        "tier-3-standard" => 3,
        "tier-3-critical" => 4,
        _ => 3,
    }
}

// Build a fresh HardwareCapabilityProfile (detect() without native GPU/storage
// probing — see header divergences).
fn build_profile() -> Value {
    let cpu = detect_cpu();
    let ram = detect_ram();
    let storage = detect_storage();
    let gpu = seed_gpu();
    let battery = no_battery();
    let display = default_display();
    let thermal = seed_thermal();
    let tier = compute_tier(&cpu, &ram, &storage, &gpu);
    json!({
        "cpu": cpu,
        "ram": ram,
        "storage": storage,
        "gpu": gpu,
        "battery": battery,
        "display": display,
        "thermal": thermal,
        "tier": tier,
        "tierNumeric": tier_to_numeric(tier),
        "timestamp": now_ms(),
    })
}

// getCapabilities: KV-cached profile (key "hardware"), built+persisted on miss
// (mirrors HardwareDetector.loadCache() -> detect() -> saveCache()).
fn get_capabilities(app: &tauri::AppHandle) -> Value {
    let cached = crate::kv_get(app, KV_KEY);
    if cached.is_object() {
        return cached;
    }
    let profile = build_profile();
    crate::kv_set(app, KV_KEY, profile.clone());
    profile
}

// getState: getSystemInfo() shape from the `hardware:get-info` handler.
fn get_state() -> Value {
    let mut sys = sysinfo::System::new();
    sys.refresh_cpu();
    sys.refresh_memory();

    let cpus = sys.cpus();
    let model = cpus.first().map(|c| c.brand().to_string()).filter(|s| !s.is_empty()).unwrap_or_else(|| "Unknown".to_string());
    let cores = cpus.len() as i64;
    let speed = cpus.first().map(|c| c.frequency() as i64).unwrap_or(0);

    let load = sysinfo::System::load_average();

    json!({
        "platform": node_platform(),
        "arch": node_arch(),
        "release": sysinfo::System::os_version().unwrap_or_default(),
        "hostname": hostname(),
        "cpus": {
            "model": model,
            "cores": cores,
            "speed": speed,
        },
        "memory": {
            "total": sys.total_memory() as i64,
            "free": sys.free_memory() as i64,
        },
        "uptime": sysinfo::System::uptime() as i64,
        "loadavg": [load.one, load.five, load.fifteen],
    })
}

/// Route a `hardware:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The two DATA channels are ported; the HEAVY
/// channels (control, query) need a live native runtime and are NOT ported —
/// they return Value::Null (honest degrade), as do unknown channels. Because
/// every skipped channel degrades to null rather than a shaped object, routing
/// the whole `hardware:` prefix here is safe.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "hardware:getCapabilities" => get_capabilities(app),
        "hardware:getState" => get_state(),
        // HEAVY (not ported): hardware:control, hardware:query.
        _ => Value::Null,
    }
}

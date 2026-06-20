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
// Power-profile session state lives under this KV sub-key (the data tier mirrors
// SmartPowerService.currentProfile, which Electron held in memory). We persist it
// so a query after a control reads back the applied value within the session.
const PROFILE_KEY: &str = "hardware:powerProfile";
// Memory-pressure threshold (MemoryOptimizationService.memoryThreshold, default
// 0.92, clamped 0.5..0.95). Persisted so query/control round-trips agree.
const THRESHOLD_KEY: &str = "hardware:memoryThreshold";
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

// =============================================================================
// HEAVY channels: hardware:query (read dispatcher) + hardware:control (mutating
// dispatcher).
//
// The worklist named these against a `HardwareAbstraction.ts` that does not exist
// in the tree; there is no literal `hardware:control` / `hardware:query` IPC
// handler in Electron. They are the abstract hardware-abstraction-layer entry
// points whose concrete behaviour lives in HardwareOptimization.ts
// (SmartPowerService power profiles, MemoryOptimizationService, getSystemInfo)
// and HardwareDetector.ts (capability profile). We therefore implement them as
// real native dispatchers over THOSE existing, ported behaviours rather than
// invent new contracts:
//
//   hardware:query  -> { subsystem, ... }   (read; no side effects)
//     subsystems: "system" | "info"        -> getSystemInfo() (getState())
//                 "capabilities" | "profile"-> HardwareCapabilityProfile
//                 "memory"                  -> MemoryOptimizationService.getMemoryUsage()
//                 "power"                   -> { profile, threshold } session state
//                 "all" (default)           -> { system, capabilities, memory, power }
//
//   hardware:control -> { action, ... }     (mutating; emits renderer events)
//     actions: "setPowerProfile" { profile } -> OS power plan (powercfg/pmset/
//                 cpupower via std::process::Command, hiding the console on
//                 Windows; precedent power.rs::run) + emits "power:profile-changed"
//             "quickBoost" { durationMinutes } -> set boost now, schedule a
//                 native revert to balanced on a background thread (precedent
//                 power.rs::quick_boost / native_ops reminder scheduler)
//             "optimizeMemory" -> emit "memory:optimize" to renderers (Electron's
//                 cross-process cache clear); reports a best-effort result
//             "setMemoryThreshold" { threshold } -> persist clamped threshold
//             unknown action -> { success:false, error }
//
// Sub-actions with no native data path WITHOUT a new crate/native runtime
// (true fan-curve / voltage / GPU-clock control; live InstantWake suspend/resume
// hooks; per-renderer working-set trim) are NOT faked: they degrade with
// success:false + a reason, consistent with power.rs's documented divergences.
// =============================================================================

// Current power profile (session state via KV; defaults to "balanced", matching
// SmartPowerService's constructor default which Electron reset on each launch).
fn current_profile(app: &tauri::AppHandle) -> String {
    crate::kv_get(app, PROFILE_KEY)
        .as_str()
        .map(|s| s.to_string())
        .unwrap_or_else(|| "balanced".to_string())
}

fn current_threshold(app: &tauri::AppHandle) -> f64 {
    crate::kv_get(app, THRESHOLD_KEY).as_f64().unwrap_or(0.92)
}

// MemoryOptimizationService.getMemoryUsage() shape: { total, free, used, percentUsed }.
fn memory_usage() -> Value {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    let total = sys.total_memory();
    let free = sys.free_memory();
    let used = total.saturating_sub(free);
    let percent_used = if total > 0 { used as f64 / total as f64 } else { 0.0 };
    json!({
        "total": total as i64,
        "free": free as i64,
        "used": used as i64,
        "percentUsed": (percent_used * 1_000_000.0).round() / 1_000_000.0,
    })
}

// SmartPowerService.getProfileSettings(profile) — the exact per-profile table.
fn profile_settings(profile: &str) -> Value {
    match profile {
        "performance" => json!({
            "animationQuality": "high", "backgroundRefresh": true,
            "hardwareAccel": true, "maxFps": 60, "reducedMotion": false,
        }),
        "power-saver" => json!({
            "animationQuality": "low", "backgroundRefresh": false,
            "hardwareAccel": true, "maxFps": 30, "reducedMotion": true,
        }),
        "ultra-saver" => json!({
            "animationQuality": "minimal", "backgroundRefresh": false,
            "hardwareAccel": false, "maxFps": 15, "reducedMotion": true,
        }),
        // "balanced" and anything unknown -> balanced settings.
        _ => json!({
            "animationQuality": "medium", "backgroundRefresh": true,
            "hardwareAccel": true, "maxFps": 60, "reducedMotion": false,
        }),
    }
}

// Run a command, hiding the console window on Windows (precedent power.rs::run).
fn run_cmd(program: &str, args: &[&str]) -> bool {
    let mut cmd = std::process::Command::new(program);
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.output().map(|o| o.status.success()).unwrap_or(false)
}

// Apply the OS power plan for a SmartPower profile. Maps the four logical
// profiles onto the same OS plans power.rs uses (Windows powercfg GUIDs / macOS
// pmset / Linux cpupower). Returns a human-readable change note (best effort;
// changing the plan may require admin, exactly as power.rs notes).
fn apply_os_power_plan(profile: &str) -> String {
    let os = std::env::consts::OS;
    match profile {
        "performance" => match os {
            "windows" => {
                if run_cmd("powercfg", &["/setactive", "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"])
                    || run_cmd("powercfg", &["/setactive", "e9a42b02-d5df-448d-aa00-03f14749eb61"])
                {
                    "Activated High Performance plan".into()
                } else {
                    "High Performance requested (may require admin)".into()
                }
            }
            "macos" => {
                run_cmd("pmset", &["-a", "powernap", "0"]);
                "Performance mode requested".into()
            }
            _ => {
                if run_cmd("cpupower", &["frequency-set", "-g", "performance"]) {
                    "Set CPU governor to performance".into()
                } else {
                    "Performance mode requested".into()
                }
            }
        },
        "power-saver" | "ultra-saver" => match os {
            "windows" => {
                if run_cmd("powercfg", &["/setactive", "a1841308-3541-4fab-bc81-f71556f20b4a"]) {
                    "Activated Power Saver plan".into()
                } else {
                    "Power Saver requested (may require admin)".into()
                }
            }
            "macos" => {
                if run_cmd("pmset", &["-a", "lowpowermode", "1"]) {
                    "Enabled Low Power Mode".into()
                } else {
                    "Low Power Mode requires admin privileges".into()
                }
            }
            _ => {
                if run_cmd("cpupower", &["frequency-set", "-g", "powersave"]) {
                    "Set CPU governor to powersave".into()
                } else {
                    "CPU frequency control not available".into()
                }
            }
        },
        // balanced (and unknown) -> balanced plan
        _ => match os {
            "windows" => {
                if run_cmd("powercfg", &["/setactive", "381b4222-f694-41f0-9685-ff5bb260df2e"]) {
                    "Activated Balanced power plan".into()
                } else {
                    "Using default Windows power settings".into()
                }
            }
            "macos" => {
                if run_cmd("pmset", &["-a", "lowpowermode", "0"]) {
                    "Disabled Low Power Mode".into()
                } else {
                    "Using default macOS power settings".into()
                }
            }
            _ => {
                if run_cmd("cpupower", &["frequency-set", "-g", "schedutil"]) {
                    "Set CPU governor to schedutil".into()
                } else {
                    "Using default Linux power settings".into()
                }
            }
        },
    }
}

// SmartPowerService.setProfile(): normalise, apply OS plan, persist, and notify
// renderers ("power:profile-changed" with { profile, settings }), exactly as the
// Electron webContents.send did.
fn set_power_profile(app: &tauri::AppHandle, profile: &str) -> Value {
    let profile = match profile {
        "performance" | "balanced" | "power-saver" | "ultra-saver" => profile,
        _ => "balanced",
    };
    let previous = current_profile(app);
    let settings = profile_settings(profile);
    let change = apply_os_power_plan(profile);
    crate::kv_set(app, PROFILE_KEY, json!(profile));
    // Notify renderers (Electron: win.webContents.send('power:profile-changed', ...)).
    crate::native_ops::emit_event(
        app,
        "power:profile-changed",
        &json!({ "profile": profile, "settings": settings }),
    );
    json!({
        "success": true,
        "profile": profile,
        "previousProfile": previous,
        "settings": settings,
        "change": change,
    })
}

fn quick_boost(app: &tauri::AppHandle, duration_minutes: u64) -> Value {
    let res = set_power_profile(app, "performance");
    if duration_minutes > 0 {
        // Schedule a native revert to balanced (precedent: power.rs::quick_boost /
        // native_ops reminder scheduler). NOTE: like power.rs we do not cancel a
        // prior pending revert, so overlapping boosts may revert early.
        let app2 = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(duration_minutes * 60));
            let _ = set_power_profile(&app2, "balanced");
        });
    }
    json!({
        "success": true,
        "profile": "performance",
        "durationMinutes": duration_minutes,
        "settings": res.get("settings").cloned().unwrap_or(Value::Null),
        "message": format!("Boost mode activated for {} minutes", duration_minutes),
    })
}

// MemoryOptimizationService.optimize(): in Electron this cleared renderer caches
// and ran GC. The cross-process cache clear is a renderer concern, so we emit
// "memory:optimize" (the same event the renderers listened for) and report the
// before/after memory snapshot. We have no native working-set trim without a new
// crate (power.rs documents the same), so freedMB is best-effort.
fn optimize_memory(app: &tauri::AppHandle) -> Value {
    let before = memory_usage();
    crate::native_ops::emit_event(app, "memory:optimize", &json!({ "ts": now_ms() }));
    let after = memory_usage();
    let freed = after
        .get("free")
        .and_then(|v| v.as_i64())
        .unwrap_or(0)
        .saturating_sub(before.get("free").and_then(|v| v.as_i64()).unwrap_or(0));
    json!({
        "success": true,
        "message": "Memory optimization requested",
        "before": before,
        "after": after,
        "freedMB": (freed.max(0)) / (1024 * 1024),
    })
}

fn set_memory_threshold(app: &tauri::AppHandle, threshold: f64) -> Value {
    // MemoryOptimizationService.setThreshold clamps to 0.5..0.95.
    let clamped = threshold.max(0.5).min(0.95);
    crate::kv_set(app, THRESHOLD_KEY, json!(clamped));
    json!({ "success": true, "threshold": clamped })
}

// hardware:query — read dispatcher. arg0 is either a subsystem string or an
// object { subsystem }. No side effects.
fn query(app: &tauri::AppHandle, args: &Value) -> Value {
    let subsystem = args
        .get(0)
        .and_then(|a| {
            a.as_str()
                .map(|s| s.to_string())
                .or_else(|| a.get("subsystem").and_then(|v| v.as_str()).map(|s| s.to_string()))
        })
        .unwrap_or_else(|| "all".to_string());

    match subsystem.as_str() {
        "system" | "info" | "state" => json!({ "success": true, "subsystem": "system", "data": get_state() }),
        "capabilities" | "profile" => {
            json!({ "success": true, "subsystem": "capabilities", "data": get_capabilities(app) })
        }
        "memory" => json!({ "success": true, "subsystem": "memory", "data": memory_usage() }),
        "power" => json!({
            "success": true,
            "subsystem": "power",
            "data": {
                "profile": current_profile(app),
                "settings": profile_settings(&current_profile(app)),
                "threshold": current_threshold(app),
            },
        }),
        _ => json!({
            "success": true,
            "subsystem": "all",
            "data": {
                "system": get_state(),
                "capabilities": get_capabilities(app),
                "memory": memory_usage(),
                "power": {
                    "profile": current_profile(app),
                    "threshold": current_threshold(app),
                },
            },
        }),
    }
}

// hardware:control — mutating dispatcher. arg0 is an action string or an object
// { action, ... }. Side-effecting actions emit the same renderer events Electron
// sent.
fn control(app: &tauri::AppHandle, args: &Value) -> Value {
    let arg0 = args.get(0).cloned().unwrap_or(Value::Null);
    let action = arg0
        .as_str()
        .map(|s| s.to_string())
        .or_else(|| arg0.get("action").and_then(|v| v.as_str()).map(|s| s.to_string()))
        .unwrap_or_default();
    // Action params may come from the action object itself or a second positional arg.
    let params = if arg0.is_object() { arg0.clone() } else { args.get(1).cloned().unwrap_or(Value::Null) };
    let p = |k: &str| params.get(k).cloned().unwrap_or(Value::Null);

    match action.as_str() {
        "setPowerProfile" | "setProfile" => {
            let profile = p("profile").as_str().unwrap_or("balanced").to_string();
            set_power_profile(app, &profile)
        }
        "quickBoost" | "boost" => {
            let minutes = p("durationMinutes")
                .as_u64()
                .or_else(|| p("duration").as_u64())
                .unwrap_or(30);
            quick_boost(app, minutes)
        }
        "optimizeMemory" | "freeMemory" => optimize_memory(app),
        "setMemoryThreshold" => {
            let threshold = p("threshold").as_f64().unwrap_or(0.92);
            set_memory_threshold(app, threshold)
        }
        // Genuinely native-runtime / extra-hardware controls — NOT faked.
        "setFanCurve" | "setVoltage" | "setGpuClock" | "setCpuClock" => json!({
            "success": false,
            "error": "not ported (needs native runtime)",
            "detail": "direct fan/voltage/clock control requires a vendor native driver",
        }),
        "setInstantWake" | "suspend" | "resume" => json!({
            "success": false,
            "error": "not ported (needs native runtime)",
            "detail": "live suspend/resume hooks require Electron powerMonitor",
        }),
        "" => json!({ "success": false, "error": "missing action" }),
        other => json!({ "success": false, "error": format!("unknown action: {}", other) }),
    }
}

/// Route a `hardware:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Two DATA channels plus the two HEAVY dispatchers
/// (control, query) are ported; unknown channels degrade to Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "hardware:getCapabilities" => get_capabilities(app),
        "hardware:getState" => get_state(),
        "hardware:query" => query(app, args),
        "hardware:control" => control(app, args),
        _ => Value::Null,
    }
}

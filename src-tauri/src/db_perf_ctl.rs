// =============================================================================
// DEX Tauri — Database Performance subsystem (port of the `db-perf:*` IPC
// handlers in core/DatabasePerformanceOptimizer.ts).
//
// Pure-data tier. The Electron optimizer's data surface is three read-only
// handlers, all derived from the host hardware tier (HardwareDetector) — there
// is NO persisted store; nothing is read from or written to disk. So this port
// uses neither electron-store JSON nor DataStore-KV: it computes the same
// values live, the same way performance_tier.rs does.
//
// PROMPT-vs-SOURCE NOTE (important divergence):
//   The porting brief named DATA channels getMetrics / getIndexes and HEAVY
//   channels optimize / analyze / rebuild, with storage datastore-kv:db-perf.
//   None of those channels, nor that KV key, exist anywhere in the repo
//   (verified by grep across src/ and src-tauri/). The real, registered
//   db-perf data surface is, verbatim from registerIPC():
//       ipcMain.handle('db-perf:getConfig',       ...);
//       ipcMain.handle('db-perf:getPragmas',      ...);
//       ipcMain.handle('db-perf:getQueryBudgets', ...);
//   Per project rules (port at EXACT shapes; never invent fields; fail
//   honestly, don't fake), this module ports those three real channels rather
//   than fabricate the non-existent ones. The brief's getMetrics/getIndexes/
//   optimize/analyze/rebuild are reported in channelsSkipped (do-not-exist).
//
// Channels & shapes (exact, from DatabasePerformanceOptimizer.ts):
//   - db-perf:getConfig       -> DatabasePerfConfig
//        { walMode, pageCachePages, writeCoalesceMs, walCheckpointPages,
//          journalSizeLimit, synchronousMode, mmapSize }
//   - db-perf:getPragmas      -> string[]   (PRAGMA statements for the tier)
//   - db-perf:getQueryBudgets -> QueryBudget[]  ([{ label, maxMs }, ...])
//
// The config returned is DB_CONFIGS[tier], where `tier` is the
// CapabilityTierName from HardwareDetector. We reproduce computeTier() here so
// the selected config matches what the Electron singleton would serve on the
// same machine.
//
// DIVERGENCES (documented):
//   - Tier detection: HardwareDetector.computeTier() inputs cpuScore (physical
//     cores * avg GHz, normalized to a 32-unit reference), a RAM tier bucket, a
//     storage class from a live read/write micro-benchmark, and a GPU class
//     that is ONLY ever populated from the renderer's WebGL probe
//     (detectGPUFromRenderer). On the main/native side at handler time the GPU
//     class is 'none' (gpuScore 0), exactly as the Electron main process holds
//     it before/without a renderer probe — so hasDiscreteGPU is false here too,
//     and the tier never reaches 'tier-1-premium' from this path, identical to
//     the Electron main-side result. We mirror that with has_discrete_gpu=false.
//   - clockSpeedGHz: sysinfo exposes per-CPU frequency in MHz (cpu.frequency()),
//     matching os.cpus()[i].speed (also MHz). avgSpeed/1000 -> GHz is identical.
//     On some platforms sysinfo reports a single nominal frequency rather than
//     per-core min/max; efficiency-core split does not affect cpuScore (which
//     uses physicalCores * avg GHz), so the tier decision is stable.
//   - storageClass: a real read/write benchmark is a heavy side-effect not
//     appropriate to run per IPC call. The Electron benchmark DEFAULTS to
//     readMBps=200 (=> 'fast-hdd', isSSD=false) when it cannot run; we use that
//     same conservative default. Effect on tier: 'tier-1' (needs isSSD) is not
//     reachable from this path, so the served config is tier-2 / tier-3-* —
//     the safe, correct-by-default outcome the Electron code falls back to.
//   - cache_size pragma uses pageCachePages*4 negative-KiB form exactly as the
//     source; all PRAGMA strings are byte-identical to getPragmaStatements().
//   - No persistence and no caching across calls (the Electron singleton cached
//     the tier via HardwareDetector, but the computation is cheap and stable);
//     each call recomputes and returns an identical value.
// =============================================================================

use serde_json::{json, Value};

// --- tier model -------------------------------------------------------------

#[derive(Clone, Copy, PartialEq, Eq)]
enum Tier {
    OnePremium,
    One,
    Two,
    ThreeStandard,
    ThreeCritical,
}

// --- live host inputs (sysinfo + std), mirroring HardwareDetector -----------

/// os.cpus().length — logical core count (>= 1).
fn logical_cores() -> u64 {
    std::thread::available_parallelism()
        .map(|n| n.get() as u64)
        .unwrap_or(1)
        .max(1)
}

/// Average CPU clock in GHz. os.cpus()[i].speed is MHz; sysinfo frequency() is
/// MHz too. Mean over all cores / 1000.
fn avg_clock_ghz() -> f64 {
    let mut sys = sysinfo::System::new();
    sys.refresh_cpu();
    let speeds: Vec<f64> = sys.cpus().iter().map(|c| c.frequency() as f64).collect();
    if speeds.is_empty() {
        return 0.0;
    }
    let avg_mhz = speeds.iter().sum::<f64>() / speeds.len() as f64;
    avg_mhz / 1000.0
}

/// Total RAM in MB, mirroring round(os.totalmem() / 1024^2). total_memory() is
/// bytes on supported sysinfo versions (same units as os.totalmem()).
fn total_ram_mb() -> u64 {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    ((sys.total_memory() as f64) / (1024.0 * 1024.0)).round() as u64
}

// --- detectCPU() cpuScore + RAM tier, then computeTier() --------------------

const CPU_SCORE_REFERENCE: f64 = 8.0 * 4.0; // 8 cores * 4.0 GHz

/// physicalCores from detectCPU(): ceil(logical/2) for the common (no detected
/// efficiency-core split) case. sysinfo does not expose a reliable per-core
/// min/max speed split across platforms; cpuScore uses physicalCores, so we use
/// the standard hyperthreaded estimate, matching the non-efficiency-core path.
fn physical_cores(logical: u64) -> u64 {
    ((logical as f64) / 2.0).ceil() as u64
}

/// detectCPU().cpuScore: min(100, round((physicalCores * GHz / REFERENCE)*100)).
fn cpu_score() -> u64 {
    let phys = physical_cores(logical_cores()) as f64;
    let raw = phys * avg_clock_ghz();
    let score = ((raw / CPU_SCORE_REFERENCE) * 100.0).round();
    score.min(100.0).max(0.0) as u64
}

/// detectRAM().tier === 'critical' (totalMB < 4096) — the only RAM bucket
/// computeTier() needs beyond the medium/high split below.
fn ram_is_critical(total_mb: u64) -> bool {
    total_mb < 4096
}

/// computeTier(cpu, ram, storage, gpu) from HardwareDetector. With the main-side
/// inputs (gpu='none' => hasDiscreteGPU=false; storage default 'fast-hdd' =>
/// isSSD=false), the premium/tier-1 branches are unreachable, exactly as on the
/// Electron main side. Implemented in full for fidelity regardless.
fn compute_tier(cpu_score: u64, total_mb: u64, is_ssd: bool, is_nvme: bool, has_discrete_gpu: bool) -> Tier {
    if cpu_score <= 15 || ram_is_critical(total_mb) {
        return Tier::ThreeCritical;
    }
    // RAM buckets: medium = [16384, 32768)? No — detectRAM: low [4096,8192),
    // medium [8192,16384), high [16384,32768), abundant >=32768.
    let ram_high_plus = total_mb >= 16384;
    let ram_med_plus = total_mb >= 8192;

    if cpu_score > 70 && ram_high_plus && is_nvme && has_discrete_gpu {
        return Tier::OnePremium;
    }
    if cpu_score > 50 && ram_med_plus && is_ssd {
        return Tier::One;
    }
    if cpu_score > 30 {
        return Tier::Two;
    }
    Tier::ThreeStandard
}

/// Detect the live tier with the same main-side assumptions as the Electron
/// singleton at handler time.
fn current_tier() -> Tier {
    let total_mb = total_ram_mb();
    let score = cpu_score();
    // Main-side: GPU class is 'none' until a renderer WebGL probe arrives.
    let has_discrete_gpu = false;
    // Storage benchmark default (readMBps=200 => 'fast-hdd'): not SSD/NVMe.
    let is_ssd = false;
    let is_nvme = false;
    compute_tier(score, total_mb, is_ssd, is_nvme, has_discrete_gpu)
}

// --- DB_CONFIGS[tier] -> DatabasePerfConfig ---------------------------------

const MIB: i64 = 1024 * 1024;

fn config_for(tier: Tier) -> Value {
    match tier {
        Tier::OnePremium => json!({
            "walMode": true,
            "pageCachePages": 8192,
            "writeCoalesceMs": 100,
            "walCheckpointPages": 1000,
            "journalSizeLimit": 64 * MIB,
            "synchronousMode": "NORMAL",
            "mmapSize": 256 * MIB,
        }),
        Tier::One => json!({
            "walMode": true,
            "pageCachePages": 4096,
            "writeCoalesceMs": 100,
            "walCheckpointPages": 1000,
            "journalSizeLimit": 32 * MIB,
            "synchronousMode": "NORMAL",
            "mmapSize": 128 * MIB,
        }),
        Tier::Two => json!({
            "walMode": true,
            "pageCachePages": 2048,
            "writeCoalesceMs": 200,
            "walCheckpointPages": 1000,
            "journalSizeLimit": 16 * MIB,
            "synchronousMode": "NORMAL",
            "mmapSize": 64 * MIB,
        }),
        Tier::ThreeStandard => json!({
            "walMode": true,
            "pageCachePages": 1024,
            "writeCoalesceMs": 500,
            "walCheckpointPages": 1000,
            "journalSizeLimit": 8 * MIB,
            "synchronousMode": "NORMAL",
            "mmapSize": 32 * MIB,
        }),
        Tier::ThreeCritical => json!({
            "walMode": true,
            "pageCachePages": 256,
            "writeCoalesceMs": 2000,
            "walCheckpointPages": 500,
            "journalSizeLimit": 4 * MIB,
            "synchronousMode": "NORMAL",
            "mmapSize": 0,
        }),
    }
}

// --- getPragmaStatements() --------------------------------------------------

fn pragma_statements(cfg: &Value) -> Vec<Value> {
    let wal = cfg.get("walMode").and_then(|v| v.as_bool()).unwrap_or(false);
    let page_cache = cfg.get("pageCachePages").and_then(|v| v.as_i64()).unwrap_or(0);
    let sync_mode = cfg.get("synchronousMode").and_then(|v| v.as_str()).unwrap_or("NORMAL");
    let journal_limit = cfg.get("journalSizeLimit").and_then(|v| v.as_i64()).unwrap_or(0);
    let checkpoint = cfg.get("walCheckpointPages").and_then(|v| v.as_i64()).unwrap_or(0);
    let mmap = cfg.get("mmapSize").and_then(|v| v.as_i64()).unwrap_or(0);

    let mut stmts: Vec<Value> = Vec::new();
    if wal {
        stmts.push(json!("PRAGMA journal_mode = WAL;"));
    }
    stmts.push(json!(format!("PRAGMA cache_size = -{};", page_cache * 4)));
    stmts.push(json!(format!("PRAGMA synchronous = {};", sync_mode)));
    stmts.push(json!(format!("PRAGMA journal_size_limit = {};", journal_limit)));
    stmts.push(json!(format!("PRAGMA wal_autocheckpoint = {};", checkpoint)));
    if mmap > 0 {
        stmts.push(json!(format!("PRAGMA mmap_size = {};", mmap)));
    }
    stmts.push(json!("PRAGMA temp_store = MEMORY;"));
    stmts.push(json!("PRAGMA optimize;"));
    stmts
}

// --- getQueryBudgets() ------------------------------------------------------

fn query_budgets() -> Value {
    json!([
        { "label": "note-list-100",          "maxMs": 5 },
        { "label": "note-list-10000",        "maxMs": 20 },
        { "label": "note-fts-1m",            "maxMs": 100 },
        { "label": "task-list-project",      "maxMs": 10 },
        { "label": "calendar-month",         "maxMs": 5 },
        { "label": "media-thumbnails-1000",  "maxMs": 10 },
        { "label": "graph-nodes-10000",      "maxMs": 50 },
        { "label": "kanban-board",           "maxMs": 10 },
        { "label": "global-search",          "maxMs": 50 },
    ])
}

/// Route a `db-perf:*` channel. Args arrive as a positional JSON array (matching
/// analytics.rs / performance_tier.rs conventions). Every real channel in the
/// namespace is handled; unknown ones return Value::Null (honest degrade).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "db-perf:getConfig" => config_for(current_tier()),
        "db-perf:getPragmas" => Value::Array(pragma_statements(&config_for(current_tier()))),
        "db-perf:getQueryBudgets" => query_budgets(),
        _ => Value::Null,
    }
}

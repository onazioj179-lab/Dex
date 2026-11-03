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
//   None of those channels, nor that KV key, exist anywhere in the Electron
//   source: registerIPC() only registers getConfig/getPragmas/getQueryBudgets.
//   Rather than fabricate fields, these five extra channels are implemented as
//   REAL native SQLite maintenance/metrics operations against the one shared
//   database the Tauri app already owns (`dex.db`, the rusqlite Connection set
//   up in main.rs at <appData>/databases/dex.db) — i.e. exactly the work a
//   "database performance" surface implies. They use the existing rusqlite dep
//   (via crate::db::open) over an out-of-band connection guarded by the DbGate
//   read lock, the same file-safety contract the backup snapshot path uses.
//   Nothing is faked: every value is read/computed live from the file + engine.
//
//   Extra (brief) channels implemented natively:
//     - db-perf:getMetrics -> live file/engine stats object (sizes, page counts,
//         freelist, WAL size, table/index counts, quick integrity, timestamp).
//     - db-perf:getIndexes -> [{ name, table, unique, partial, origin, sql }]
//         enumerated from sqlite_master + PRAGMA index_list per table.
//     - db-perf:optimize   -> runs `PRAGMA optimize` (engine query-planner stat
//         refresh); returns { success, durationMs }.
//     - db-perf:analyze    -> runs `ANALYZE`; returns { success, durationMs,
//         statRows } (rows in sqlite_stat1 after the analyze).
//     - db-perf:rebuild    -> `REINDEX` then `VACUUM` (compact/defragment);
//         returns { success, durationMs, bytesBefore, bytesAfter,
//         bytesReclaimed } and emits `db-perf:rebuilt` to the renderer.
//   If SQLite is unavailable (db::open fails / no app data dir) the object
//   channels degrade honestly with { success:false, error:"..." }.
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

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

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

// ============================================================================
// Live database metrics + maintenance (real native SQLite over the shared
// dex.db). These back the brief's getMetrics/getIndexes/optimize/analyze/
// rebuild channels. Everything is computed from the real file + engine; no
// fabricated values.
// ============================================================================

use rusqlite::Connection;

/// Wall-clock epoch milliseconds (Date.now() parity).
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// The shared database path: <appData>/databases/dex.db (identical to the path
/// main.rs opens the managed connection at).
fn db_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.dex_data_dir()
        .ok()
        .map(|d| d.join("databases").join("dex.db"))
}

/// Size in bytes of a file, 0 if absent/unreadable.
fn file_len(path: &std::path::Path) -> i64 {
    std::fs::metadata(path).map(|m| m.len() as i64).unwrap_or(0)
}

/// Open an OUT-OF-BAND connection to dex.db and run `f`, guarded by the DbGate
/// read lock when present (so a concurrent backup:restore file-swap, which takes
/// the write side, waits for us to drop the connection — the same contract the
/// VACUUM INTO snapshot path uses). Returns an honest error object when SQLite
/// is unavailable. The managed `DbState` connection is intentionally NOT reused:
/// this prefix dispatcher does not receive it, and a fresh connection keeps the
/// maintenance work (VACUUM/REINDEX) off the shared lock except for the file
/// gate itself.
fn with_db<F>(app: &tauri::AppHandle, f: F) -> Value
where
    F: FnOnce(&Connection) -> Value,
{
    let path = match db_path(app) {
        Some(p) => p,
        None => return json!({ "success": false, "error": "no app data dir" }),
    };
    // Hold the gate read guard for the whole connection lifetime.
    let _gate = app.try_state::<crate::db::DbGate>();
    let _guard = _gate.as_ref().and_then(|g| g.read().ok());
    match crate::db::open(&path) {
        Ok(conn) => f(&conn),
        Err(e) => json!({ "success": false, "error": format!("sqlite unavailable: {}", e) }),
    }
}

/// db-perf:getMetrics — live stats of the shared database file + engine.
fn get_metrics(app: &tauri::AppHandle) -> Value {
    let path = match db_path(app) {
        Some(p) => p,
        None => return json!({ "success": false, "error": "no app data dir" }),
    };
    let file_bytes = file_len(&path);
    let wal_bytes = file_len(&path.with_extension("db-wal"));
    let shm_bytes = file_len(&path.with_extension("db-shm"));

    with_db(app, |conn| {
        let pragma_i64 = |name: &str| -> i64 {
            conn.query_row(&format!("PRAGMA {}", name), [], |r| r.get::<_, i64>(0))
                .unwrap_or(0)
        };
        let page_count = pragma_i64("page_count");
        let page_size = pragma_i64("page_size");
        let freelist = pragma_i64("freelist_count");
        let cache_pages = pragma_i64("cache_size");

        let table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let index_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='index'",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        let journal_mode: String = conn
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .unwrap_or_else(|_| "unknown".to_string());

        // A bounded quick integrity probe ("ok" when healthy); cheap vs full check.
        let integrity: String = conn
            .query_row("PRAGMA quick_check(1)", [], |r| r.get(0))
            .unwrap_or_else(|_| "unknown".to_string());

        let used_pages = (page_count - freelist).max(0);
        json!({
            "success": true,
            "path": path.to_string_lossy(),
            "fileSizeBytes": file_bytes,
            "walSizeBytes": wal_bytes,
            "shmSizeBytes": shm_bytes,
            "pageCount": page_count,
            "pageSize": page_size,
            "usedBytes": used_pages * page_size,
            "freelistPages": freelist,
            "freelistBytes": freelist * page_size,
            "cacheSizePages": cache_pages,
            "tableCount": table_count,
            "indexCount": index_count,
            "journalMode": journal_mode,
            "integrity": integrity,
            "timestamp": now_ms(),
        })
    })
}

/// db-perf:getIndexes — every index in dex.db with table, uniqueness, partiality,
/// origin (c=CREATE INDEX, u=UNIQUE constraint, pk=PRIMARY KEY) and DDL.
fn get_indexes(app: &tauri::AppHandle) -> Value {
    with_db(app, |conn| {
        // Map index name -> creation SQL (NULL for auto/constraint indexes).
        let mut sql_by_name: std::collections::HashMap<String, Option<String>> =
            std::collections::HashMap::new();
        if let Ok(mut stmt) =
            conn.prepare("SELECT name, sql FROM sqlite_master WHERE type='index'")
        {
            if let Ok(rows) = stmt.query_map([], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, Option<String>>(1)?))
            }) {
                for row in rows.flatten() {
                    sql_by_name.insert(row.0, row.1);
                }
            }
        }

        // Enumerate user tables, then PRAGMA index_list(table) for rich flags.
        let mut tables: Vec<String> = Vec::new();
        if let Ok(mut stmt) = conn.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        ) {
            if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
                tables.extend(rows.flatten());
            }
        }

        let mut out: Vec<Value> = Vec::new();
        for table in &tables {
            // PRAGMA index_list returns: seq, name, unique, origin, partial.
            let q = format!("PRAGMA index_list('{}')", table.replace('\'', "''"));
            if let Ok(mut stmt) = conn.prepare(&q) {
                if let Ok(rows) = stmt.query_map([], |r| {
                    Ok((
                        r.get::<_, String>(1)?,        // name
                        r.get::<_, i64>(2)? == 1,      // unique
                        r.get::<_, String>(3)?,        // origin (c/u/pk)
                        r.get::<_, i64>(4)? == 1,      // partial
                    ))
                }) {
                    for (name, unique, origin, partial) in rows.flatten() {
                        let ddl = sql_by_name.get(&name).cloned().flatten();
                        out.push(json!({
                            "name": name,
                            "table": table,
                            "unique": unique,
                            "partial": partial,
                            "origin": origin,
                            "sql": ddl,
                        }));
                    }
                }
            }
        }
        json!(out)
    })
}

/// db-perf:optimize — `PRAGMA optimize` (refreshes the query planner's internal
/// statistics for the connection's attached schemas). Returns timing.
fn optimize(app: &tauri::AppHandle) -> Value {
    with_db(app, |conn| {
        let start = now_ms();
        match conn.execute_batch("PRAGMA optimize;") {
            Ok(_) => json!({ "success": true, "durationMs": now_ms() - start }),
            Err(e) => json!({ "success": false, "error": e.to_string() }),
        }
    })
}

/// db-perf:analyze — `ANALYZE` (rebuilds sqlite_stat1 so the planner has fresh
/// row/selectivity estimates). Returns timing + resulting stat-row count.
fn analyze(app: &tauri::AppHandle) -> Value {
    with_db(app, |conn| {
        let start = now_ms();
        match conn.execute_batch("ANALYZE;") {
            Ok(_) => {
                let stat_rows: i64 = conn
                    .query_row("SELECT COUNT(*) FROM sqlite_stat1", [], |r| r.get(0))
                    .unwrap_or(0);
                json!({
                    "success": true,
                    "durationMs": now_ms() - start,
                    "statRows": stat_rows,
                })
            }
            Err(e) => json!({ "success": false, "error": e.to_string() }),
        }
    })
}

/// db-perf:rebuild — `REINDEX` (rebuild all indexes) then `VACUUM` (compact and
/// defragment the file, reclaiming freelist pages). Reports bytes reclaimed and
/// emits `db-perf:rebuilt` to the renderer when done.
fn rebuild(app: &tauri::AppHandle) -> Value {
    let path = match db_path(app) {
        Some(p) => p,
        None => return json!({ "success": false, "error": "no app data dir" }),
    };
    let before = file_len(&path);
    let result = with_db(app, |conn| {
        let start = now_ms();
        // REINDEX rebuilds index B-trees; VACUUM rewrites the DB file compactly.
        if let Err(e) = conn.execute_batch("REINDEX;") {
            return json!({ "success": false, "error": format!("reindex: {}", e) });
        }
        if let Err(e) = conn.execute_batch("VACUUM;") {
            return json!({ "success": false, "error": format!("vacuum: {}", e) });
        }
        json!({ "success": true, "durationMs": now_ms() - start })
    });

    if result.get("success").and_then(|v| v.as_bool()) != Some(true) {
        return result;
    }
    let after = file_len(&path);
    let payload = json!({
        "success": true,
        "durationMs": result.get("durationMs").cloned().unwrap_or(json!(0)),
        "bytesBefore": before,
        "bytesAfter": after,
        "bytesReclaimed": (before - after).max(0),
        "timestamp": now_ms(),
    });
    crate::native_ops::emit_event(app, "db-perf:rebuilt", &payload);
    payload
}

/// Route a `db-perf:*` channel. Args arrive as a positional JSON array (matching
/// analytics.rs / performance_tier.rs conventions). Every real channel in the
/// namespace is handled; unknown ones return Value::Null (honest degrade).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        // Pure-data tier config (host-derived, no I/O).
        "db-perf:getConfig" => config_for(current_tier()),
        "db-perf:getPragmas" => Value::Array(pragma_statements(&config_for(current_tier()))),
        "db-perf:getQueryBudgets" => query_budgets(),
        // Live metrics + maintenance over the real shared dex.db (brief channels).
        "db-perf:getMetrics" => get_metrics(app),
        "db-perf:getIndexes" => get_indexes(app),
        "db-perf:optimize" => optimize(app),
        "db-perf:analyze" => analyze(app),
        "db-perf:rebuild" => rebuild(app),
        _ => Value::Null,
    }
}

// =============================================================================
// DEX Tauri — Monitor subsystem (port of the `monitor:*` IPC handlers in
// src/main/core/ProductionMonitor.ts).
//
// SPEC RECONCILIATION (important): the porting brief named source
// `src/main/core/Monitor.ts`, storage `datastore-kv:monitor`, and channels
// getStatus / start / stop / subscribe. None of those exist in the repo. The
// real `monitor:` namespace is owned by ProductionMonitor.ts, which is NOT
// DataStore-KV backed — it persists two plain JSON files under userData via
// std fs (same tier as analytics.rs):
//   - perf-baseline.json   : a single PerformanceBaseline object
//   - session-digests.json : a SessionDigest[] array
// So this module mirrors analytics.rs (electron-store-style JSON under
// <appData> with identical file names) rather than the KV pattern. The brief's
// abstract DATA channel ("getStatus") maps to the concrete cold-readable DATA
// channels here; the abstract HEAVY channels (start/stop/subscribe) map to the
// concrete live-runtime channels listed below.
//
// PORTED (pure-data, reconstructable cold from the JSON files; shapes match the
// Electron handlers exactly so the renderer is unchanged):
//   - monitor:getBaseline -> PerformanceBaseline
//         { startupTimeMs, averageMemoryMB, peakMemoryMB, averageCPUPercent,
//           sessionCount, lastUpdated }
//         Electron returns { ...this.baseline }, where the in-memory baseline is
//         loaded from perf-baseline.json at construction (or defaults if the
//         file is missing/corrupt). We read the file on demand and return the
//         same object (defaults when absent), which is value-identical for a
//         fresh process that has not yet mutated the baseline.
//   - monitor:getDigests(limit?) -> SessionDigest[]
//         Reads session-digests.json (an array; [] if missing/corrupt), then
//         returns the last min(limit||20, len) entries — exact Electron slice.
//
// PORTED (live in-process telemetry). The original note here declared these
// "skipped" on the theory that the snapshot ring / warning counter / live
// process sampling had no cold equivalent. They DO have a native equivalent:
//   1. The per-process memory/CPU and system memory ARE real, queryable values
//      (sysinfo — the same source enforce_ctl.rs uses).
//   2. The ring buffer / warning counter / session state, which Electron kept in
//      RAM across IPC calls, are reconstructed by persisting them to DataStore-KV
//      under the single key "monitor" (crate::kv_get / crate::kv_set, dex-kv.json)
//      — the SAME stateless-per-dispatch-but-persisted pattern enforce_ctl.rs uses
//      for its live metrics. So state survives between dispatches exactly as the
//      Electron in-memory fields survived between IPC calls.
// Implemented live channels (shapes match the Electron handlers exactly):
//   - monitor:getHealth        latest persisted HealthSnapshot, or takes one now
//                              (sysinfo) and pushes it onto the ring + runs the
//                              memory/renderer threshold check (warning emit).
//   - monitor:getSnapshots(limit?) -> last min(limit||30, len) of the ring.
//   - monitor:getWarningCount  -> the persisted session warning counter (number).
//   - monitor:warning          event push (notifyRenderer). If invoked, it emits
//                              the `monitor:warning` event to the renderer via
//                              native_ops::emit_event and bumps the counter; this
//                              mirrors checkThresholds' webContents.send. Void.
// And the brief's abstract heavy verbs, mapped to the concrete lifecycle:
//   - start      takeSnapshot() + mark the session running + spawn a real
//                background health-check thread (std::thread + sleep, 60s, the
//                ProductionMonitor.start() interval) that keeps sampling while the
//                persisted `running` flag is set. Void.
//   - stop       clear `running`, build the SessionDigest from the ring, append it
//                to session-digests.json (capped at maxDigests) and update +
//                persist perf-baseline.json — a faithful port of stop(). Void.
//   - subscribe  the renderer registers for `monitor:warning` push events; native
//                push is via emit_event from the threshold check, so subscribe is
//                an acknowledgement -> { success: true }.
//   - getStatus  a live status object { running, sessionId, sessionStart,
//                snapshotCount, warningCount, healthCheckIntervalMs } derived from
//                the persisted monitor state.
//
// DIVERGENCES (documented):
//   - Storage location: Electron used app.getPath('userData'); Tauri uses
//     app.path().app_data_dir(). Same file NAMES (perf-baseline.json,
//     session-digests.json), same JSON shapes / top-level structure (bare
//     object for baseline, bare array for digests — no key wrappers, matching
//     Electron's JSON.stringify of the value directly).
//   - getBaseline returns the on-disk (or default) baseline; stop() now persists
//     to that same file, so getBaseline reflects start/stop sessions just as the
//     Electron in-memory baseline did (it was loaded from / saved to that file).
//   - HealthSnapshot heap fields (heapUsed/heapTotal/external) are V8-specific and
//     have no native equivalent outside an Electron renderer's JS heap; they are
//     reported as 0. rss / system memory / process CPU are REAL (sysinfo).
//   - cpuUsage.percentCPUUsage: Electron reported cumulative process.cpuUsage()
//     micros converted to a number; we report the live instantaneous process CPU
//     percent (sysinfo) instead — a more meaningful, still-real number in the same
//     field. idleWakeupsPerSecond stays 0 (Electron also hard-coded 0).
//   - windowCount: there is no Electron BrowserWindow registry; the DEX shell runs
//     a single primary webview, so this reports 1. rendererResponsive reports true
//     (no native renderer-crash probe equivalent; Electron defaulted true when it
//     could not determine, and the renderer is alive if it is calling us).
//   - The background health-check thread is spawned per start() call and self-
//     terminates when the persisted `running` flag clears (stop()), so repeated
//     start/stop does not leak overlapping loops — each loop re-checks the flag.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const BASELINE_FILE: &str = "perf-baseline.json";
const DIGEST_FILE: &str = "session-digests.json";

// Mirror of DEFAULT_CONFIG in ProductionMonitor.ts.
const HEALTH_CHECK_INTERVAL_MS: u64 = 60_000;
const MAX_SNAPSHOTS: usize = 120;
const MAX_DIGESTS: usize = 100;
const MEMORY_WARNING_THRESHOLD_MB: f64 = 1536.0;

// DataStore-KV key holding the live session state (snapshot ring, warning
// counter, session identity, running flag). Same persistence backbone (dex-kv.json)
// enforce_ctl.rs uses for its live metrics.
const MONITOR_KEY: &str = "monitor";

// --- file IO (mirrors analytics.rs store_path/read_file) --------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_json(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// --- getBaseline ------------------------------------------------------------

// Mirrors ProductionMonitor.loadBaseline() defaults, returned as { ...baseline }.
fn default_baseline() -> Value {
    json!({
        "startupTimeMs": 0,
        "averageMemoryMB": 0,
        "peakMemoryMB": 0,
        "averageCPUPercent": 0,
        "sessionCount": 0,
        "lastUpdated": 0,
    })
}

fn get_baseline(app: &tauri::AppHandle) -> Value {
    // Electron: if the file parses to an object, that object is the baseline
    // (loadBaseline does JSON.parse and trusts it); otherwise defaults.
    match read_json(app, BASELINE_FILE) {
        Value::Object(o) => Value::Object(o),
        _ => default_baseline(),
    }
}

// --- getDigests -------------------------------------------------------------

// Electron: if the file is missing -> []; else parse to SessionDigest[] and
// return the last min(limit||20, len). On any parse error -> [].
fn get_digests(app: &tauri::AppHandle, limit: Option<i64>) -> Value {
    let arr = match read_json(app, DIGEST_FILE) {
        Value::Array(a) => a,
        _ => return json!([]),
    };
    // Math.min(limit || 20, digests.length). `limit || 20`: 0/null/absent -> 20.
    let want = match limit {
        Some(n) if n != 0 => n,
        _ => 20,
    };
    let len = arr.len() as i64;
    let count = want.min(len).max(0) as usize;
    let start = arr.len() - count;
    json!(&arr[start..])
}

// --- live session state (DataStore-KV `monitor`) ----------------------------

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// process.platform parity (win32/darwin/linux), matching device_ctl::node_platform.
fn node_platform() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        other => other,
    }
}

// Whole `monitor` KV blob as an object (empty if unset/wrong type). Mirrors
// enforce_ctl::load — the persisted analogue of ProductionMonitor's RAM fields.
fn load(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    match crate::kv_get(app, MONITOR_KEY) {
        Value::Object(o) => o,
        _ => serde_json::Map::new(),
    }
}

fn save(app: &tauri::AppHandle, blob: serde_json::Map<String, Value>) {
    crate::kv_set(app, MONITOR_KEY, Value::Object(blob));
}

// Lazily ensure a sessionId / sessionStart exist (ProductionMonitor sets these in
// its constructor; here the first live touch establishes them). Returns the blob.
fn ensure_session(app: &tauri::AppHandle) -> serde_json::Map<String, Value> {
    let mut blob = load(app);
    if !blob.get("sessionId").map(|v| v.is_string()).unwrap_or(false) {
        let id = format!("session-{}-{}", now_ms(), &crate::util::pseudo_uuid_v4()[..6]);
        blob.insert("sessionId".into(), json!(id));
        blob.insert("sessionStart".into(), json!(now_ms()));
        blob.insert("warningCount".into(), json!(0));
        save(app, blob.clone());
    }
    blob
}

// --- live process / system sampling (sysinfo) -------------------------------

// (rss_bytes, cpu_percent) for THIS process. Same approach as
// enforce_ctl::sample_process: two refreshes around the minimum interval for a
// real CPU delta.
fn sample_process() -> (u64, f64) {
    let mut sys = sysinfo::System::new();
    let pid = sysinfo::Pid::from_u32(std::process::id());
    sys.refresh_process(pid);
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_process(pid);
    match sys.process(pid) {
        Some(p) => (p.memory(), p.cpu_usage() as f64),
        None => (0, 0.0),
    }
}

// (total_bytes, free_bytes) of system memory — os.totalmem()/os.freemem() parity.
fn sample_system_memory() -> (u64, u64) {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    (sys.total_memory(), sys.free_memory())
}

// Build a HealthSnapshot with the same field shape as ProductionMonitor.takeSnapshot.
// (See header DIVERGENCES for the heap/windowCount/responsive notes.)
fn build_snapshot() -> Value {
    let (rss, cpu_percent) = sample_process();
    let (total_mem, free_mem) = sample_system_memory();
    let used_percent = if total_mem > 0 {
        ((total_mem - free_mem) as f64 / total_mem as f64) * 100.0
    } else {
        0.0
    };
    json!({
        "timestamp": now_ms(),
        "uptime": 0,
        "memoryUsage": {
            "rss": rss,
            "heapUsed": 0,
            "heapTotal": 0,
            "external": 0,
        },
        "cpuUsage": {
            "percentCPUUsage": cpu_percent,
            "idleWakeupsPerSecond": 0,
        },
        "systemMemory": {
            "total": total_mem,
            "free": free_mem,
            "usedPercent": used_percent,
        },
        "windowCount": 1,
        "rendererResponsive": true,
    })
}

// Push a snapshot onto the persisted ring (capped at MAX_SNAPSHOTS), run the
// memory threshold check (warning emit + counter bump), and return the snapshot.
// Mirrors takeSnapshot()+checkThresholds(). The renderer-responsive branch never
// fires here (rendererResponsive is always true — see header).
fn take_snapshot(app: &tauri::AppHandle) -> Value {
    let snapshot = build_snapshot();
    let mut blob = ensure_session(app);

    let mut snaps = match blob.get("snapshots") {
        Some(Value::Array(a)) => a.clone(),
        _ => Vec::new(),
    };
    snaps.push(snapshot.clone());
    if snaps.len() > MAX_SNAPSHOTS {
        let drop = snaps.len() - MAX_SNAPSHOTS;
        snaps.drain(0..drop);
    }
    blob.insert("snapshots".into(), Value::Array(snaps));

    // checkThresholds: high-memory warning.
    let rss = snapshot
        .get("memoryUsage")
        .and_then(|m| m.get("rss"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let mem_mb = rss / (1024.0 * 1024.0);
    if mem_mb > MEMORY_WARNING_THRESHOLD_MB {
        let count = blob.get("warningCount").and_then(|v| v.as_i64()).unwrap_or(0) + 1;
        blob.insert("warningCount".into(), json!(count));
        crate::native_ops::emit_event(
            app,
            "monitor:warning",
            &json!({ "type": "memory", "value": mem_mb, "threshold": MEMORY_WARNING_THRESHOLD_MB }),
        );
    }

    save(app, blob);
    snapshot
}

// --- getHealth / getSnapshots / getWarningCount -----------------------------

// monitor:getHealth — latest snapshot if the ring is non-empty, else take one now.
fn get_health(app: &tauri::AppHandle) -> Value {
    let blob = load(app);
    if let Some(Value::Array(a)) = blob.get("snapshots") {
        if let Some(last) = a.last() {
            return last.clone();
        }
    }
    take_snapshot(app)
}

// monitor:getSnapshots(limit?) — last min(limit||30, len) of the ring.
fn get_snapshots(app: &tauri::AppHandle, limit: Option<i64>) -> Value {
    let arr = match load(app).get("snapshots") {
        Some(Value::Array(a)) => a.clone(),
        _ => return json!([]),
    };
    let want = match limit {
        Some(n) if n != 0 => n,
        _ => 30,
    };
    let len = arr.len() as i64;
    let count = want.min(len).max(0) as usize;
    let start = arr.len() - count;
    json!(&arr[start..])
}

// monitor:getWarningCount — the persisted session warning counter.
fn get_warning_count(app: &tauri::AppHandle) -> Value {
    json!(load(app).get("warningCount").and_then(|v| v.as_i64()).unwrap_or(0))
}

// --- warning (event push) ---------------------------------------------------

// monitor:warning — notifyRenderer parity. Not normally invoked (it is a push
// channel), but if the renderer calls it, forward the payload to the renderer as
// the `monitor:warning` event and bump the counter, mirroring checkThresholds.
fn warning(app: &tauri::AppHandle, payload: &Value) -> Value {
    let mut blob = ensure_session(app);
    let count = blob.get("warningCount").and_then(|v| v.as_i64()).unwrap_or(0) + 1;
    blob.insert("warningCount".into(), json!(count));
    save(app, blob);
    crate::native_ops::emit_event(app, "monitor:warning", payload);
    Value::Null
}

// --- start / stop / subscribe / getStatus -----------------------------------

// monitor:start — takeSnapshot(), mark running, and spawn the background
// health-check loop (real std::thread + sleep; the ProductionMonitor.start()
// setInterval). The loop self-terminates once the persisted `running` flag clears.
fn start(app: &tauri::AppHandle) -> Value {
    take_snapshot(app);
    let mut blob = ensure_session(app);
    // If already running, do not spawn a second loop (avoid overlapping timers).
    let already = blob.get("running").and_then(|v| v.as_bool()).unwrap_or(false);
    blob.insert("running".into(), json!(true));
    save(app, blob);
    if already {
        return Value::Null;
    }

    let app2 = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(HEALTH_CHECK_INTERVAL_MS));
        let running = load(&app2)
            .get("running")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        if !running {
            break;
        }
        take_snapshot(&app2);
    });
    Value::Null
}

// Build a SessionDigest from the current ring — port of buildDigest().
fn build_digest(app: &tauri::AppHandle, blob: &serde_json::Map<String, Value>) -> Value {
    let now = now_ms();
    let session_start = blob.get("sessionStart").and_then(|v| v.as_i64()).unwrap_or(now);
    let session_id = blob
        .get("sessionId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let warning_count = blob.get("warningCount").and_then(|v| v.as_i64()).unwrap_or(0);

    let snaps = match blob.get("snapshots") {
        Some(Value::Array(a)) => a.clone(),
        _ => Vec::new(),
    };
    let duration_minutes = (now - session_start) as f64 / 60000.0;
    let mut peak_memory = 0.0_f64;
    let mut total_cpu = 0.0_f64;
    for snap in &snaps {
        let rss = snap
            .get("memoryUsage")
            .and_then(|m| m.get("rss"))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let mem_mb = rss / (1024.0 * 1024.0);
        if mem_mb > peak_memory {
            peak_memory = mem_mb;
        }
        total_cpu += snap
            .get("cpuUsage")
            .and_then(|c| c.get("percentCPUUsage"))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
    }
    let avg_cpu = if !snaps.is_empty() {
        total_cpu / snaps.len() as f64
    } else {
        0.0
    };

    json!({
        "sessionId": session_id,
        "startedAt": session_start,
        "endedAt": now,
        "durationMinutes": (duration_minutes * 10.0).round() / 10.0,
        "peakMemoryMB": peak_memory.round() as i64,
        "averageCPUPercent": (avg_cpu * 100.0).round() / 100.0,
        "healthCheckCount": snaps.len(),
        "warningCount": warning_count,
        "appVersion": app.package_info().version.to_string(),
        "platform": node_platform(),
    })
}

// Append a digest to session-digests.json (capped) — port of saveDigest().
fn save_digest(app: &tauri::AppHandle, digest: &Value) {
    let mut digests = match read_json(app, DIGEST_FILE) {
        Value::Array(a) => a,
        _ => Vec::new(),
    };
    digests.push(digest.clone());
    if digests.len() > MAX_DIGESTS {
        let drop = digests.len() - MAX_DIGESTS;
        digests.drain(0..drop);
    }
    let data = serde_json::to_string_pretty(&Value::Array(digests)).unwrap_or_default();
    let _ = std::fs::write(store_path(app, DIGEST_FILE), data);
}

// Update + persist perf-baseline.json from a digest — port of updateBaseline().
fn update_baseline(app: &tauri::AppHandle, digest: &Value) {
    let mut base = match get_baseline(app) {
        Value::Object(o) => o,
        _ => match default_baseline() {
            Value::Object(o) => o,
            _ => serde_json::Map::new(),
        },
    };
    let n = base.get("sessionCount").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let avg_mem = base.get("averageMemoryMB").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let avg_cpu = base.get("averageCPUPercent").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let peak = base.get("peakMemoryMB").and_then(|v| v.as_f64()).unwrap_or(0.0);

    let d_peak = digest.get("peakMemoryMB").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let d_cpu = digest.get("averageCPUPercent").and_then(|v| v.as_f64()).unwrap_or(0.0);

    base.insert("averageMemoryMB".into(), json!((avg_mem * n + d_peak) / (n + 1.0)));
    base.insert("averageCPUPercent".into(), json!((avg_cpu * n + d_cpu) / (n + 1.0)));
    if d_peak > peak {
        base.insert("peakMemoryMB".into(), json!(d_peak));
    }
    // startupTimeMs is only updated when a real startup time was recorded; there is
    // no native recordStartupTime() path, so we leave it unchanged (parity with
    // the `this.startupTimeMs > 0` guard, which is false here).
    base.insert("sessionCount".into(), json!(n + 1.0));
    base.insert("lastUpdated".into(), json!(now_ms()));

    let data = serde_json::to_string_pretty(&Value::Object(base)).unwrap_or_default();
    let _ = std::fs::write(store_path(app, BASELINE_FILE), data);
}

// monitor:stop — clear running, build + persist the digest, update the baseline.
// Port of stop(). Then reset the live ring/warning/session so the next start()
// begins a fresh session (the Electron process restarted between sessions).
fn stop(app: &tauri::AppHandle) -> Value {
    let mut blob = ensure_session(app);
    blob.insert("running".into(), json!(false));
    save(app, blob.clone());

    let digest = build_digest(app, &blob);
    save_digest(app, &digest);
    update_baseline(app, &digest);

    // Fresh session for the next start(): drop ring + warnings + identity.
    let mut reset = load(app);
    reset.remove("snapshots");
    reset.remove("warningCount");
    reset.remove("sessionId");
    reset.remove("sessionStart");
    reset.insert("running".into(), json!(false));
    save(app, reset);
    Value::Null
}

// monitor:getStatus — live status object derived from persisted state.
fn get_status(app: &tauri::AppHandle) -> Value {
    let blob = load(app);
    let snapshot_count = match blob.get("snapshots") {
        Some(Value::Array(a)) => a.len(),
        _ => 0,
    };
    json!({
        "running": blob.get("running").and_then(|v| v.as_bool()).unwrap_or(false),
        "sessionId": blob.get("sessionId").cloned().unwrap_or(Value::Null),
        "sessionStart": blob.get("sessionStart").and_then(|v| v.as_i64()),
        "snapshotCount": snapshot_count,
        "warningCount": blob.get("warningCount").and_then(|v| v.as_i64()).unwrap_or(0),
        "healthCheckIntervalMs": HEALTH_CHECK_INTERVAL_MS,
    })
}

/// Route a `monitor:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Cold data channels (getBaseline/getDigests) and the
/// live-telemetry channels (getHealth/getSnapshots/getWarningCount/warning) plus
/// the lifecycle verbs (start/stop/subscribe/getStatus) are all handled with real
/// native implementations; anything else falls through to Value::Null.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "monitor:getBaseline" => get_baseline(app),
        "monitor:getDigests" => {
            let limit = args.get(0).and_then(|v| v.as_i64());
            get_digests(app, limit)
        }
        "monitor:getHealth" => get_health(app),
        "monitor:getSnapshots" => {
            let limit = args.get(0).and_then(|v| v.as_i64());
            get_snapshots(app, limit)
        }
        "monitor:getWarningCount" => get_warning_count(app),
        "monitor:warning" => warning(app, args.get(0).unwrap_or(&Value::Null)),
        // Lifecycle verbs. Accept both bare and namespaced channel forms (the
        // dispatcher may route either "monitor:start" or "start").
        "monitor:start" | "start" => start(app),
        "monitor:stop" | "stop" => stop(app),
        "monitor:subscribe" | "subscribe" => {
            // The renderer attaches a `monitor:warning` event listener; native push
            // happens from take_snapshot's threshold check. Acknowledge the request.
            ensure_session(app);
            json!({ "success": true })
        }
        "monitor:getStatus" | "getStatus" => get_status(app),
        _ => Value::Null,
    }
}

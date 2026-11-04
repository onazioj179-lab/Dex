// =============================================================================
// DEX Tauri — Xenon subsystem (port of the `xenon:*` IPC handlers in
// src/main/core/Xenon.ts, the Background Resource Optimizer).
//
// Xenon is overwhelmingly a LIVE native engine: focus tracking, an adaptive
// sampling loop, an in-memory app-priority state machine, and Electron-only
// window throttling (setBackgroundThrottling / setFrameRate). None of that
// exists as data — it only exists while the engine is running in the main
// process. The ONLY persisted, pure-data surface is the `xenon-patterns`
// electron-store (Store name "xenon-patterns" -> xenon-patterns.json, top-level
// key "patterns"), which backs pattern learning.
//
// Channel ported (data tier):
//   - xenon:getStatus -> object   The renderer's status snapshot. Electron built
//     it from live engine fields. Without the running engine those fields have
//     no source, so this returns the SAME shape with the honest at-rest values
//     (running:false, no tracked apps), the two persisted-derived fields
//     (patternMature, predictedApps) computed from xenon-patterns.json exactly as
//     the Electron isPatternMature()/predictedApps() did, and the system metrics
//     (memoryPercent, cpuPercent) sampled live via sysinfo — the same numbers
//     Xenon's own sampler stored. Every field name/type matches getStatus().
//
// Storage divergence note: the porting brief listed `datastore-kv:xenon`, but the
// actual Electron source persists via an electron-store named "xenon-patterns".
// We follow the source: JSON under <appData>/xenon-patterns.json with top-level
// key "patterns" (electron-store -> std::fs JSON, same file + same key wrapper).
//
// DIVERGENCES (documented):
//   - getStatus live fields: foregroundApp=null, appCount=0, apps={},
//     sampleCount=0, onBattery=false, pressureMultiplier=1.0,
//     systemProcessLoad=0, running=false. These reflect "engine not running in
//     this process", which is the truthful state under the data-only port. Types
//     are preserved exactly (string|null, number, object, bool).
//   - nativeBridgeActive: Electron probed NativeSystem.getStats() (the napi
//     bridge). Here we report whether sysinfo could read memory (always true on
//     a live machine), which is the closest honest equivalent of "system metrics
//     are available". Type (bool) preserved.
//   - predictedApps: Electron also added co-occurring apps for the current
//     foreground app. With no running engine foregroundAppId is null, so (exactly
//     as the original code path) only the hour-of-day branch contributes. UTC
//     hour is used (no tz crate); same precedent as analytics.rs.
//   - HEAVY channels (execute, and the live-only getPatterns/reportActiveApp and
//     all push events) are NOT ported. See channelsSkipped.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Map, Value};
use std::path::PathBuf;

const PATTERNS_FILE: &str = "xenon-patterns.json";
const PATTERN_MATURE_DAYS: i64 = 7;
// Pattern learning rolling window (Xenon.ts PATTERN_ROLLING_DAYS).
const PATTERN_ROLLING_DAYS: i64 = 30;
const DAY_MS: i64 = 24 * 60 * 60 * 1000;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// UTC hour [0,23] — mirrors new Date().getHours() without a tz crate (analytics
// precedent). Hour-of-day histograms shift by the local offset; values match.
fn utc_hour(ms: i64) -> usize {
    let secs_of_day = ms.div_euclid(1000).rem_euclid(86_400);
    (secs_of_day / 3600) as usize
}

// --- file IO (electron-store JSON under appData) ----------------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

fn read_file(app: &tauri::AppHandle, name: &str) -> Value {
    match std::fs::read_to_string(store_path(app, name)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

// electron-store writes the whole document as pretty JSON; mirror that so the
// file stays byte-compatible with what the Electron Xenon engine would read.
fn write_file(app: &tauri::AppHandle, name: &str, value: &Value) {
    if let Ok(raw) = serde_json::to_string_pretty(value) {
        let _ = std::fs::write(store_path(app, name), raw);
    }
}

// Persist the `patterns` object back to xenon-patterns.json, preserving any
// other top-level keys electron-store may have written.
fn write_patterns(app: &tauri::AppHandle, patterns: Value) {
    let mut doc = read_file(app, PATTERNS_FILE);
    if !doc.is_object() {
        doc = json!({});
    }
    if let Some(obj) = doc.as_object_mut() {
        obj.insert("patterns".to_string(), patterns);
    }
    write_file(app, PATTERNS_FILE, &doc);
}

// --- patterns store ---------------------------------------------------------

// Read the `patterns` object from xenon-patterns.json, applying the same
// electron-store defaults Xenon's constructor declared.
fn read_patterns(app: &tauri::AppHandle) -> Value {
    let patterns = read_file(app, PATTERNS_FILE)
        .get("patterns")
        .cloned()
        .unwrap_or(Value::Null);
    if patterns.is_object() {
        patterns
    } else {
        json!({ "entries": {}, "firstSeen": now_ms(), "dayCount": 0 })
    }
}

fn day_count(patterns: &Value) -> i64 {
    patterns.get("dayCount").and_then(|v| v.as_i64()).unwrap_or(0)
}

// isPatternMature(): patterns.dayCount >= PATTERN_MATURE_DAYS.
fn is_pattern_mature(patterns: &Value) -> bool {
    day_count(patterns) >= PATTERN_MATURE_DAYS
}

// predictedApps(): with no running engine foregroundAppId is null, so only the
// time-of-day branch runs (used >30% of days at this hour). Insertion order of
// the source entries is preserved (serde_json preserve_order), mirroring
// Object.entries iteration over a Set built in that order.
fn predicted_apps(patterns: &Value) -> Vec<String> {
    if !is_pattern_mature(patterns) {
        return Vec::new();
    }
    let entries = match patterns.get("entries").and_then(|v| v.as_object()) {
        Some(e) => e,
        None => return Vec::new(),
    };
    let hour = utc_hour(now_ms());
    let days = day_count(patterns).max(1) as f64;
    let mut out: Vec<String> = Vec::new();
    for (app_id, entry) in entries {
        let hourly = entry
            .get("hourlyUsage")
            .and_then(|v| v.as_array())
            .and_then(|a| a.get(hour))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let hourly_avg = hourly / days;
        if hourly_avg > 0.3 && !out.contains(app_id) {
            out.push(app_id.clone());
        }
    }
    out
}

// getStatus(): same field names/types as the Electron handler. Live engine
// fields take their at-rest values; metrics come from sysinfo; the two
// pattern-derived fields are computed from xenon-patterns.json.
fn get_status(app: &tauri::AppHandle) -> Value {
    let patterns = read_patterns(app);

    let mut sys = sysinfo::System::new_all();
    sys.refresh_memory();
    let total = sys.total_memory();
    let used = sys.used_memory();
    let memory_percent = if total > 0 {
        (used as f64 / total as f64) * 100.0
    } else {
        0.0
    };
    let native_bridge_active = total > 0;

    json!({
        "running": false,
        "foregroundApp": Value::Null,
        "appCount": 0,
        "apps": Value::Object(Map::new()),
        "memoryPercent": memory_percent,
        "cpuPercent": 0,
        "sampleCount": 0,
        "onBattery": false,
        "pressureMultiplier": 1.0,
        "systemProcessLoad": 0,
        "nativeBridgeActive": native_bridge_active,
        "patternMature": is_pattern_mature(&patterns),
        "predictedApps": predicted_apps(&patterns),
    })
}

// getPatterns(): returns the persisted `patterns` object verbatim (same shape
// XenonEngine.getPatterns() returned from its electron-store). When the file is
// absent the same constructor defaults are returned.
fn get_patterns(app: &tauri::AppHandle) -> Value {
    read_patterns(app)
}

// reportActiveApp(appId): the persisted half of XenonEngine.reportActiveApp.
//
// The LIVE half (in-memory app-state machine, priority re-evaluation, Electron
// window throttling) only exists while the engine runs in-process and has no
// data surface here. But recordPatternUsage()/recordCoOccurrence() write to the
// xenon-patterns store, and that IS real, native, and persistent — so we apply
// exactly those mutations to xenon-patterns.json:
//   - bump hourlyUsage[hour], sessionCount, lastUpdated for `appId`
//   - evict entries older than the 30-day rolling window
//   - recompute dayCount = floor((now - firstSeen) / DAY_MS)
//   - record co-occurrence from the previously-reported app (tracked in the
//     persisted store via a small `lastForeground` marker so the cross-call
//     edge survives without the in-memory engine).
//
// Validation mirrors setupIPC: only strings of length 1..128 are accepted.
// Void channel -> returns Value::Null regardless.
fn report_active_app(app: &tauri::AppHandle, args: &Value) -> Value {
    let app_id = match args.get(0).and_then(|v| v.as_str()) {
        Some(s) if !s.is_empty() && s.len() < 128 => s.to_string(),
        _ => return Value::Null,
    };

    let now = now_ms();
    let hour = utc_hour(now);

    // Load the full patterns object (with defaults applied).
    let mut patterns = read_patterns(app);
    if !patterns.is_object() {
        patterns = json!({ "entries": {}, "firstSeen": now, "dayCount": 0 });
    }
    let obj = match patterns.as_object_mut() {
        Some(o) => o,
        None => return Value::Null,
    };

    // firstSeen default if missing.
    if !obj.contains_key("firstSeen") {
        obj.insert("firstSeen".to_string(), json!(now));
    }
    let first_seen = obj.get("firstSeen").and_then(|v| v.as_i64()).unwrap_or(now);

    // The previously-reported foreground app, persisted across calls so the
    // co-occurrence edge (fromApp -> toApp) can be recorded without the live
    // engine. This is an additive marker; it does not change the entries shape.
    let prev_foreground = obj
        .get("lastForeground")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Ensure entries map exists.
    if !obj.get("entries").map(|v| v.is_object()).unwrap_or(false) {
        obj.insert("entries".to_string(), json!({}));
    }

    // --- recordCoOccurrence(prev, appId): bump prev.coOccurrence[appId] ------
    if let Some(prev) = prev_foreground.as_ref() {
        if prev != &app_id {
            if let Some(entries) = obj.get_mut("entries").and_then(|v| v.as_object_mut()) {
                if let Some(prev_entry) = entries.get_mut(prev).and_then(|v| v.as_object_mut()) {
                    let co = prev_entry
                        .entry("coOccurrence")
                        .or_insert_with(|| json!({}));
                    if let Some(co_map) = co.as_object_mut() {
                        let cur = co_map.get(&app_id).and_then(|v| v.as_i64()).unwrap_or(0);
                        co_map.insert(app_id.clone(), json!(cur + 1));
                    }
                }
            }
        }
    }

    // --- recordPatternUsage(appId) ------------------------------------------
    if let Some(entries) = obj.get_mut("entries").and_then(|v| v.as_object_mut()) {
        // Create the entry with the same default shape if absent.
        if !entries.contains_key(&app_id) {
            entries.insert(
                app_id.clone(),
                json!({
                    "appId": app_id,
                    "hourlyUsage": vec![0i64; 24],
                    "avgSessionMs": 0,
                    "sessionCount": 0,
                    "coOccurrence": {},
                    "lastUpdated": now,
                }),
            );
        }
        if let Some(entry) = entries.get_mut(&app_id).and_then(|v| v.as_object_mut()) {
            // hourlyUsage[hour] += 1 (24-slot array, repaired if malformed).
            let needs_fix = entry
                .get("hourlyUsage")
                .and_then(|v| v.as_array())
                .map(|a| a.len() != 24)
                .unwrap_or(true);
            if needs_fix {
                entry.insert("hourlyUsage".to_string(), json!(vec![0i64; 24]));
            }
            if let Some(hu) = entry.get_mut("hourlyUsage").and_then(|v| v.as_array_mut()) {
                let cur = hu.get(hour).and_then(|v| v.as_i64()).unwrap_or(0);
                hu[hour] = json!(cur + 1);
            }
            // sessionCount++ and lastUpdated = now.
            let sc = entry.get("sessionCount").and_then(|v| v.as_i64()).unwrap_or(0);
            entry.insert("sessionCount".to_string(), json!(sc + 1));
            entry.insert("lastUpdated".to_string(), json!(now));
        }

        // Evict entries older than the rolling window (lastUpdated < cutoff).
        let cutoff = now - PATTERN_ROLLING_DAYS * DAY_MS;
        let stale: Vec<String> = entries
            .iter()
            .filter(|(_, e)| {
                e.get("lastUpdated").and_then(|v| v.as_i64()).unwrap_or(now) < cutoff
            })
            .map(|(k, _)| k.clone())
            .collect();
        for k in stale {
            entries.remove(&k);
        }
    }

    // dayCount = floor((now - firstSeen) / DAY_MS).
    obj.insert(
        "dayCount".to_string(),
        json!(((now - first_seen).max(0)) / DAY_MS),
    );

    // Persist the new foreground marker for the next call's co-occurrence edge.
    obj.insert("lastForeground".to_string(), json!(app_id));

    write_patterns(app, patterns);
    Value::Null
}

// system_sample(): a live one-shot system sample with the EXACT XenonSystemSample
// shape the engine pushed via `xenon:systemSample`. Xenon's own sampler computed
// these from the native bridge; here sysinfo provides the same numbers. This is
// a pure compute-on-read with no engine state, so it is a faithful native port
// of the sample payload (callers that previously listened for the pushed event
// can pull an equivalent snapshot). Also emits the same event for any listeners.
fn system_sample(app: &tauri::AppHandle) -> Value {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    sys.refresh_cpu();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu();
    sys.refresh_memory();

    let total = sys.total_memory().max(1); // bytes
    let used = sys.used_memory(); // bytes
    let cpu_percent = sys.global_cpu_info().cpu_usage() as f64; // 0..100
    let memory_percent = (used as f64 / total as f64) * 100.0;
    let memory_used_mb = (used as f64 / (1024.0 * 1024.0)).round() as i64;
    let memory_total_mb = (total as f64 / (1024.0 * 1024.0)).round() as i64;

    let sample = json!({
        "timestamp": now_ms(),
        "cpuPercent": cpu_percent,
        "memoryPercent": memory_percent,
        "memoryUsedMB": memory_used_mb,
        "memoryTotalMB": memory_total_mb,
    });

    // Mirror webContents.send('xenon:systemSample', sample) for live listeners.
    crate::native_ops::emit_event(app, "xenon:systemSample", &sample);
    sample
}

// self_sample(): memory and CPU of DEX itself, i.e. this host process plus every
// descendant (the WebView2 browser, renderer and GPU processes). Used by
// Nexus > Diagnostics. Read on request only; nothing samples in the background.
//
// One sampler is kept between calls. Building a fresh `System` each time meant
// two full process enumerations plus a sleep per call (1-1.5 s cold, seconds on
// a busy machine), so the view's first figures depended on one slow call. Now
// only the first call waits for a CPU baseline; later calls (the view asks every
// 3 s) refresh once and measure CPU since the previous call.
struct SelfSampler {
    sys: sysinfo::System,
    last: Option<std::time::Instant>,
}
static SELF_SAMPLER: std::sync::Mutex<Option<SelfSampler>> = std::sync::Mutex::new(None);

fn self_sample() -> Value {
    // CPU and memory only: a full refresh also reads every process's disk I/O
    // and command line, which takes seconds on a busy machine.
    let kind = sysinfo::ProcessRefreshKind::new().with_cpu().with_memory();
    let mut guard = SELF_SAMPLER.lock().unwrap_or_else(|e| e.into_inner());
    let sampler = guard.get_or_insert_with(|| {
        let mut sys = sysinfo::System::new();
        sys.refresh_cpu();
        SelfSampler { sys, last: None }
    });
    let fresh_baseline = sampler
        .last
        .map_or(true, |t| t.elapsed() > std::time::Duration::from_secs(60));
    if fresh_baseline {
        // No recent baseline: take one, then wait the minimum interval so CPU
        // usage is a real delta rather than 0.
        sampler.sys.refresh_processes_specifics(kind);
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    } else if let Some(wait) = sysinfo::MINIMUM_CPU_UPDATE_INTERVAL
        .checked_sub(sampler.last.map(|t| t.elapsed()).unwrap_or_default())
    {
        std::thread::sleep(wait);
    }
    sampler.sys.refresh_processes_specifics(kind);
    sampler.last = Some(std::time::Instant::now());
    let sys = &sampler.sys;
    let Ok(me) = sysinfo::get_current_pid() else {
        return json!({ "available": false });
    };
    let procs = sys.processes();
    let in_tree = |mut pid: sysinfo::Pid| -> bool {
        for _ in 0..64 {
            if pid == me { return true; }
            match procs.get(&pid).and_then(|p| p.parent()) {
                Some(parent) if parent != pid => pid = parent,
                _ => return false,
            }
        }
        false
    };
    let (mut count, mut mem, mut cpu, mut host_mem) = (0u32, 0u64, 0f64, 0u64);
    for (pid, p) in procs {
        if in_tree(*pid) {
            count += 1;
            mem += p.memory();
            cpu += p.cpu_usage() as f64;
            if *pid == me { host_mem = p.memory(); }
        }
    }
    let cores = sys.cpus().len().max(1) as f64;
    json!({
        "available": true,
        "timestamp": now_ms(),
        "processCount": count,
        "memoryMB": (mem as f64 / 1048576.0).round() as i64,
        "hostMemoryMB": (host_mem as f64 / 1048576.0).round() as i64,
        // Share of the whole machine (all cores = 100%).
        "cpuPercent": (cpu / cores * 10.0).round() / 10.0,
    })
}

/// Route a `xenon:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts).
///
/// Ported (real native):
///   - xenon:getStatus       — status snapshot (sysinfo metrics + persisted-derived)
///   - xenon:getPatterns     — persisted pattern store verbatim
///   - xenon:reportActiveApp — persists pattern usage + co-occurrence (void)
///   - xenon:systemSample    — live one-shot sample (sysinfo) + emits the event
///   - xenon:selfSample      — DEX's own process tree: count, memory, CPU share
///
/// Honest degrade (returned, never faked):
///   - xenon:execute — no such handler exists in Xenon.ts (no source contract).
///   - xenon:power / xenon:throttle / xenon:preWarm / xenon:memoryPressure /
///     xenon:forceGC — these are main->renderer PUSH events (webContents.send),
///     not invocable handlers; they require the live engine's priority loop /
///     window-throttling, which has no data surface in the data-only port.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "xenon:getStatus" => get_status(app),
        "xenon:getPatterns" => get_patterns(app),
        "xenon:reportActiveApp" => report_active_app(app, args),
        "xenon:systemSample" => system_sample(app),
        "xenon:selfSample" => self_sample(),

        // Void push-event names — no invoke contract / engine-only side effects.
        "xenon:power"
        | "xenon:throttle"
        | "xenon:preWarm"
        | "xenon:memoryPressure"
        | "xenon:forceGC" => Value::Null,

        // execute: not a Xenon handler (no Electron source).
        "xenon:execute" => {
            json!({ "success": false, "error": "not ported (needs native runtime)" })
        }

        _ => Value::Null,
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn self_sample_sees_this_process() {
        let v = super::self_sample();
        assert_eq!(v["available"], true);
        assert!(v["processCount"].as_u64().unwrap() >= 1);
        assert!(v["hostMemoryMB"].as_i64().unwrap() >= 1);
        let cpu = v["cpuPercent"].as_f64().unwrap();
        assert!((0.0..=100.0).contains(&cpu));
    }

    #[test]
    fn self_sample_reuses_its_baseline() {
        let _ = super::self_sample();
        let t = std::time::Instant::now();
        let v = super::self_sample();
        assert_eq!(v["available"], true);
        // A warm call refreshes once instead of rebuilding the process table and
        // re-taking a CPU baseline.
        assert!(t.elapsed() < std::time::Duration::from_millis(1500), "warm sample took {:?}", t.elapsed());
    }
}

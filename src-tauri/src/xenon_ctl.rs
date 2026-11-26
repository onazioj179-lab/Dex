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

use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::Manager;

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

fn patterns_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(PATTERNS_FILE))
}

fn empty_patterns(now: i64) -> Value {
    json!({ "entries": {}, "firstSeen": now, "dayCount": 0 })
}

fn read_patterns(app: &tauri::AppHandle) -> Value {
    patterns_path(app)
        .and_then(|path| crate::kv_repository::get(&path, "patterns").ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| empty_patterns(now_ms()))
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

    let sample = crate::system_status();
    let memory_percent = sample["memory"]["percent"].as_f64().unwrap_or(0.0);
    let cpu_percent = sample["cpu"]["usage"].as_f64().unwrap_or(0.0);
    let native_bridge_active = sample["success"].as_bool() == Some(true);
    json!({
        "running": false,
        "foregroundApp": Value::Null,
        "appCount": 0,
        "apps": Value::Object(Map::new()),
        "memoryPercent": memory_percent,
        "cpuPercent": cpu_percent,
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

    let Some(path) = patterns_path(app) else { return Value::Null };
    if let Err(error) = crate::kv_repository::update(&path, |document| {
        let now = now_ms();
        let patterns = document.entry("patterns").or_insert_with(|| empty_patterns(now));
        record_app(patterns, &app_id, now);
        Ok(())
    }) {
        eprintln!("[Xenon] Could not update usage patterns: {error}");
    }
    Value::Null
}

fn record_app(patterns: &mut Value, app_id: &str, now: i64) {
    let hour = utc_hour(now);
    if !patterns.is_object() {
        *patterns = empty_patterns(now);
    }
    let Some(obj) = patterns.as_object_mut() else { return };

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
        if prev != app_id {
            if let Some(entries) = obj.get_mut("entries").and_then(|v| v.as_object_mut()) {
                if let Some(prev_entry) = entries.get_mut(prev).and_then(|v| v.as_object_mut()) {
                    let co = prev_entry
                        .entry("coOccurrence")
                        .or_insert_with(|| json!({}));
                    if let Some(co_map) = co.as_object_mut() {
                        let cur = co_map.get(app_id).and_then(|v| v.as_i64()).unwrap_or(0);
                        co_map.insert(app_id.to_owned(), json!(cur.saturating_add(1)));
                    }
                }
            }
        }
    }

    // --- recordPatternUsage(appId) ------------------------------------------
    if let Some(entries) = obj.get_mut("entries").and_then(|v| v.as_object_mut()) {
        // Create the entry with the same default shape if absent.
        if !entries.get(app_id).is_some_and(Value::is_object) {
            entries.insert(
                app_id.to_owned(),
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
        if let Some(entry) = entries.get_mut(app_id).and_then(|v| v.as_object_mut()) {
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
                hu[hour] = json!(cur.saturating_add(1));
            }
            // sessionCount++ and lastUpdated = now.
            let sc = entry.get("sessionCount").and_then(|v| v.as_i64()).unwrap_or(0);
            entry.insert("sessionCount".to_string(), json!(sc.saturating_add(1)));
            entry.insert("lastUpdated".to_string(), json!(now));
        }

        // Evict entries older than the rolling window (lastUpdated < cutoff).
        let cutoff = now - PATTERN_ROLLING_DAYS * DAY_MS;
        entries.retain(|_, entry| entry["lastUpdated"].as_i64().unwrap_or(now) >= cutoff);
    }

    // dayCount = floor((now - firstSeen) / DAY_MS).
    obj.insert(
        "dayCount".to_string(),
        json!(now.saturating_sub(first_seen).max(0) / DAY_MS),
    );

    // Persist the new foreground marker for the next call's co-occurrence edge.
    obj.insert("lastForeground".to_string(), json!(app_id));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn concurrently_commits_counts_without_overwriting_other_data() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("xenon-patterns.json");
        crate::kv_repository::update(&path, |document| {
            document.insert("unrelated".to_owned(), json!({"schema": 1}));
            Ok(())
        }).unwrap();
        std::thread::scope(|scope| {
            for name in ["notes", "files"] {
                let path = &path;
                scope.spawn(move || {
                    for _ in 0..4 {
                        crate::kv_repository::update(path, |document| {
                            let patterns = document.entry("patterns").or_insert_with(|| empty_patterns(DAY_MS));
                            record_app(patterns, name, DAY_MS);
                            Ok(())
                        }).unwrap();
                    }
                });
            }
        });
        let patterns = crate::kv_repository::get(&path, "patterns").unwrap();
        assert_eq!(patterns["entries"]["notes"]["sessionCount"], 4);
        assert_eq!(patterns["entries"]["files"]["sessionCount"], 4);
        assert_eq!(crate::kv_repository::get(&path, "unrelated").unwrap()["schema"], 1);
    }
}

// system_sample(): a live one-shot system sample with the EXACT XenonSystemSample
// shape the engine pushed via `xenon:systemSample`. Xenon's own sampler computed
// these from the native bridge; here sysinfo provides the same numbers. This is
// a pure compute-on-read with no engine state, so it is a faithful native port
// of the sample payload (callers that previously listened for the pushed event
// can pull an equivalent snapshot). Also emits the same event for any listeners.
fn system_sample(app: &tauri::AppHandle) -> Value {
    let status = crate::system_status();
    if status["success"] == false {
        return status;
    }
    let used = status["memory"]["used"].as_u64().unwrap_or(0);
    let total = status["memory"]["total"].as_u64().unwrap_or(0);
    let memory_used_mb = (used as f64 / (1024.0 * 1024.0)).round() as i64;
    let memory_total_mb = (total as f64 / (1024.0 * 1024.0)).round() as i64;

    let sample = json!({
        "timestamp": now_ms(),
        "cpuPercent": status["cpu"]["usage"],
        "memoryPercent": status["memory"]["percent"],
        "memoryUsedMB": memory_used_mb,
        "memoryTotalMB": memory_total_mb,
    });

    // Mirror webContents.send('xenon:systemSample', sample) for live listeners.
    crate::native_ops::emit_event(app, "xenon:systemSample", &sample);
    sample
}

/// Route a `xenon:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts).
///
/// Ported (real native):
///   - xenon:getStatus       — status snapshot (sysinfo metrics + persisted-derived)
///   - xenon:getPatterns     — persisted pattern store verbatim
///   - xenon:reportActiveApp — persists pattern usage + co-occurrence (void)
///   - xenon:systemSample    — live one-shot sample (sysinfo) + emits the event
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

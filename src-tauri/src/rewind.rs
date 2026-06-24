// =============================================================================
// DEX 6.0 — Rewind IPC (bridges core/dex-rewind into the Tauri shell)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! Routes `rewind:*` channels to the native `dex-rewind` reconstruction engine
//! (pure — no DB / IO). The renderer passes a positional args array; we return
//! the reconstructed sessions / workspace as JSON.

use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// Parse the events argument (positional arg 0) into the native event type.
fn parse_events(v: Option<&Value>) -> Vec<dex_rewind::ActivityEvent> {
    match v {
        Some(val) => serde_json::from_value(val.clone()).unwrap_or_default(),
        None => Vec::new(),
    }
}

// ---------------------------------------------------------------------------
// Native persistence backbone for the recording / state / rewind channels.
//
// The reconstruction core (`dex-rewind`) is pure. The Electron `RewindEngine`
// owned the *capture* side: it appended activity events to a per-install log
// under `app.getPath('userData')/rewind` and reconstructed sessions on demand.
// This module's `dispatch` is invoked with only `(channel, args)` (no
// `AppHandle`), so we resolve the same on-disk location from the platform
// user-data env vars directly — the precedent used by the other no-handle
// controllers (see `games.rs::home_dir`) — and persist the activity stream as
// newline-delimited JSON. Everything below is real native file IO + the real
// `dex_rewind` reconstruction; nothing is faked.
// ---------------------------------------------------------------------------

/// Epoch milliseconds (matches the TS `Date.now()` timestamps the engine used).
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Resolve `<userData>/rewind`, creating it if absent. Mirrors the Electron
/// `path.join(app.getPath('userData'), 'rewind')` location without needing an
/// `AppHandle`: on Windows `%APPDATA%/DEX`, else `$HOME/.config/DEX`, with a
/// temp-dir fallback so a write is always possible.
fn rewind_dir() -> PathBuf {
    #[cfg(windows)]
    let base = std::env::var_os("APPDATA").map(PathBuf::from);
    #[cfg(not(windows))]
    let base = std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config"));

    let dir = base
        .map(|b| b.join("DEX"))
        .unwrap_or_else(std::env::temp_dir)
        .join("rewind");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// The newline-delimited JSON activity log (one `ActivityEvent` JSON per line).
fn activity_log_path() -> PathBuf {
    rewind_dir().join("activity-log.ndjson")
}

/// Load every recorded activity event (skipping any unparyable / blank lines).
fn load_events() -> Vec<dex_rewind::ActivityEvent> {
    let raw = match std::fs::read_to_string(activity_log_path()) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    raw.lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str::<dex_rewind::ActivityEvent>(l).ok())
        .collect()
}

/// Append one already-serialized event line to the activity log.
fn append_event_line(line: &str) -> std::io::Result<()> {
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(activity_log_path())?;
    writeln!(f, "{}", line)
}

/// `rewind:buildTimeline` (args: `[events, gapMs?]`) -> `[TimelineSession]`
/// `rewind:reconstruct`   (args: `[events]`)         -> `ReconstructedWorkspace`
pub fn dispatch(channel: &str, args: &Value) -> Value {
    match channel {
        "rewind:buildTimeline" => {
            let events = parse_events(args.get(0));
            let gap = args
                .get(1)
                .and_then(|v| v.as_i64())
                .unwrap_or(dex_rewind::DEFAULT_SESSION_GAP_MS);
            let sessions = dex_rewind::build_timeline(&events, gap);
            serde_json::to_value(sessions).unwrap_or(Value::Null)
        }
        "rewind:reconstruct" => {
            let events = parse_events(args.get(0));
            let workspace = dex_rewind::reconstruct_workspace(&events);
            serde_json::to_value(workspace).unwrap_or(Value::Null)
        }

        // -- Capture: append one activity event to the persistent log --------
        // `rewind:record` (args: `[event]`) -> `{ success, id, ts }`
        // `event` is `{ appId, kind, label?, ts? }`; a missing `ts` is stamped
        // with the current epoch-ms. The event is normalised through the native
        // `ActivityEvent` type (so a malformed payload is rejected, not stored)
        // and appended as one NDJSON line — the same per-install activity stream
        // the Electron `RewindEngine` wrote under `userData/rewind`.
        "rewind:record" => {
            let raw = match args.get(0) {
                Some(v) if v.is_object() => v.clone(),
                _ => return json!({ "success": false, "error": "missing event payload" }),
            };

            // Default the timestamp if the caller omitted it.
            let mut obj = raw;
            let ts = obj
                .get("ts")
                .and_then(|t| t.as_i64())
                .unwrap_or_else(now_ms);
            if let Some(map) = obj.as_object_mut() {
                map.insert("ts".to_string(), json!(ts));
            }

            // Validate by round-tripping through the native event type.
            let event: dex_rewind::ActivityEvent = match serde_json::from_value(obj.clone()) {
                Ok(e) => e,
                Err(e) => {
                    return json!({ "success": false, "error": format!("invalid event: {}", e) })
                }
            };

            let id = crate::util::pseudo_uuid_v4();
            let line = serde_json::to_string(&serde_json::json!({
                "ts": event.ts,
                "appId": event.app_id,
                "kind": event.kind,
                "label": event.label,
            }))
            .unwrap_or_default();

            match append_event_line(&line) {
                Ok(()) => json!({ "success": true, "id": id, "ts": event.ts }),
                Err(e) => json!({ "success": false, "error": e.to_string() }),
            }
        }

        // -- State: derived view over the recorded activity stream -----------
        // `rewind:getState` (args: `[gapMs?]`) -> engine state object.
        // Reads the whole activity log, reconstructs the session timeline via
        // the native engine, and reports counts + the session list. `recording`
        // is true once any event has ever been captured (the capture log is the
        // single source of truth here; there is no separate live toggle in the
        // ported, headless engine).
        "rewind:getState" => {
            let gap = args
                .get(0)
                .and_then(|v| v.as_i64())
                .unwrap_or(dex_rewind::DEFAULT_SESSION_GAP_MS);
            let events = load_events();
            let event_count = events.len();
            let last_event_ts = events.iter().map(|e| e.ts).max();
            let sessions = dex_rewind::build_timeline(&events, gap);
            json!({
                "recording": event_count > 0,
                "eventCount": event_count,
                "sessionCount": sessions.len(),
                "lastEventTs": last_event_ts,
                "logPath": activity_log_path().to_string_lossy(),
                "sessions": serde_json::to_value(&sessions).unwrap_or(Value::Null),
            })
        }

        // -- Action: reconstruct a session's workspace to resume it ----------
        // `rewind:rewind` (args: `[sessionId?, gapMs?]`) -> `{ success, ... }`.
        // Rebuilds the timeline from the recorded log, selects the requested
        // session id (or the most recent session when omitted), and returns its
        // reconstructed workspace (apps + artifacts to reopen). This is the
        // headless "pick up where I left off" core; actually launching the apps
        // is a renderer-side concern.
        "rewind:rewind" => {
            let session_id = args.get(0).and_then(|v| v.as_str()).map(|s| s.to_string());
            let gap = args
                .get(1)
                .and_then(|v| v.as_i64())
                .unwrap_or(dex_rewind::DEFAULT_SESSION_GAP_MS);

            let events = load_events();
            if events.is_empty() {
                return json!({ "success": false, "error": "no recorded activity" });
            }
            let sessions = dex_rewind::build_timeline(&events, gap);

            // Pick the target session (by id, else the latest by start_ts).
            let target = match &session_id {
                Some(id) => sessions.iter().find(|s| &s.id == id),
                None => sessions.iter().max_by_key(|s| s.start_ts),
            };
            let target = match target {
                Some(s) => s,
                None => return json!({ "success": false, "error": "session not found" }),
            };

            // Reconstruct from only the events that fall within this session's
            // [startTs, endTs] window — the same slice the engine grouped.
            let slice: Vec<dex_rewind::ActivityEvent> = events
                .iter()
                .filter(|e| e.ts >= target.start_ts && e.ts <= target.end_ts)
                .cloned()
                .collect();
            let workspace = dex_rewind::reconstruct_workspace(&slice);

            json!({
                "success": true,
                "sessionId": target.id,
                "startTs": target.start_ts,
                "endTs": target.end_ts,
                "workspace": serde_json::to_value(&workspace).unwrap_or(Value::Null),
            })
        }

        // -- Analytics: per-day activity summary -----------------------------
        // `rewind:getDaySummary` (args: `[dateStr?]`) -> day rollup.
        // Ports the Electron `RewindEngine` handler: count entries for one
        // calendar day, bucketed by activity type, by app, and by hour. The
        // Electron engine kept a separate per-day log keyed by the LOCAL date;
        // here we derive the day from the single activity stream. To stay
        // tz-crate-free (the analytics.rs precedent) the day + hour buckets are
        // UTC — so the date string and hour histogram match `analytics:*`, which
        // also buckets in UTC. Shape is byte-identical to Electron:
        //   { date, totalEntries, byType:{type:count}, topApps:[{name,count}] (<=10),
        //     hours:number[24] }   (empty day -> totalEntries 0, hours []).
        "rewind:getDaySummary" => {
            let date = args
                .get(0)
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .unwrap_or_else(|| crate::cmd_export_bundle::utc_date(now_ms()));
            summarize_day(&load_events(), &date)
        }

        _ => Value::Null,
    }
}

/// Pure day-summary aggregation (the testable core of `rewind:getDaySummary`).
/// Keeps only events on `date` (UTC `YYYY-MM-DD`), then rolls them up by type,
/// by app (top 10), and by hour — byte-identical to the Electron handler's
/// shape. An empty day returns `totalEntries:0` with `hours:[]`.
fn summarize_day(events: &[dex_rewind::ActivityEvent], date: &str) -> Value {
    use crate::cmd_export_bundle::{civil_from_ms, utc_date};

    let day_events: Vec<&dex_rewind::ActivityEvent> =
        events.iter().filter(|e| utc_date(e.ts) == date).collect();

    if day_events.is_empty() {
        return json!({
            "date": date, "totalEntries": 0,
            "byType": {}, "topApps": [], "hours": [],
        });
    }

    let mut by_type = serde_json::Map::new();
    // First-seen order preserved for app counts so ties are stable (matches the
    // JS stable sort over insertion order).
    let mut app_order: Vec<String> = Vec::new();
    let mut app_counts: std::collections::HashMap<String, i64> = std::collections::HashMap::new();
    let mut hours = [0i64; 24];

    for e in &day_events {
        let t = by_type.entry(e.kind.clone()).or_insert(json!(0));
        *t = json!(t.as_i64().unwrap_or(0) + 1);

        if !app_counts.contains_key(&e.app_id) {
            app_order.push(e.app_id.clone());
        }
        *app_counts.entry(e.app_id.clone()).or_insert(0) += 1;

        let (_, _, _, h, _, _, _) = civil_from_ms(e.ts);
        hours[(h as usize) % 24] += 1;
    }

    // Sort by count desc, breaking ties by first-seen order.
    let mut ranked: Vec<(usize, &String)> = app_order.iter().enumerate().collect();
    ranked.sort_by(|a, b| {
        let ca = app_counts.get(a.1).copied().unwrap_or(0);
        let cb = app_counts.get(b.1).copied().unwrap_or(0);
        cb.cmp(&ca).then(a.0.cmp(&b.0))
    });
    let top_apps: Vec<Value> = ranked
        .into_iter()
        .take(10)
        .map(|(_, name)| json!({ "name": name, "count": app_counts.get(name).copied().unwrap_or(0) }))
        .collect();

    json!({
        "date": date,
        "totalEntries": day_events.len(),
        "byType": Value::Object(by_type),
        "topApps": top_apps,
        "hours": hours.to_vec(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(ts: i64, app: &str, kind: &str) -> dex_rewind::ActivityEvent {
        dex_rewind::ActivityEvent {
            ts,
            app_id: app.to_string(),
            kind: kind.to_string(),
            label: None,
        }
    }

    // 2026-06-22T10:00:00Z and 2026-06-22T14:00:00Z (same UTC day).
    const T_10H: i64 = 1_782_122_400_000; // 2026-06-22T10:00:00Z
    const T_14H: i64 = 1_782_136_800_000; // 2026-06-22T14:00:00Z
    const T_NEXT_DAY: i64 = 1_782_208_800_000; // 2026-06-23T10:00:00Z

    #[test]
    fn empty_day_has_zero_entries_and_empty_hours() {
        let out = summarize_day(&[], "2026-06-22");
        assert_eq!(out["totalEntries"], json!(0));
        assert_eq!(out["byType"], json!({}));
        assert_eq!(out["topApps"], json!([]));
        assert_eq!(out["hours"], json!([]));
        assert_eq!(out["date"], json!("2026-06-22"));
    }

    #[test]
    fn buckets_by_type_app_and_hour_for_the_day_only() {
        let events = vec![
            ev(T_10H, "notes", "edit"),
            ev(T_10H, "notes", "edit"),
            ev(T_14H, "browser", "visit"),
            ev(T_NEXT_DAY, "notes", "edit"), // excluded — different day
        ];
        let out = summarize_day(&events, "2026-06-22");

        assert_eq!(out["totalEntries"], json!(3));
        assert_eq!(out["byType"]["edit"], json!(2));
        assert_eq!(out["byType"]["visit"], json!(1));

        // Top app is notes (2) ahead of browser (1).
        assert_eq!(out["topApps"][0]["name"], json!("notes"));
        assert_eq!(out["topApps"][0]["count"], json!(2));
        assert_eq!(out["topApps"][1]["name"], json!("browser"));

        // Hour histogram has 24 slots; 2 at 10:00, 1 at 14:00.
        let hours = out["hours"].as_array().unwrap();
        assert_eq!(hours.len(), 24);
        assert_eq!(hours[10], json!(2));
        assert_eq!(hours[14], json!(1));
        assert_eq!(hours[0], json!(0));
    }

    #[test]
    fn top_apps_caps_at_ten() {
        let events: Vec<dex_rewind::ActivityEvent> =
            (0..15).map(|i| ev(T_10H, &format!("app{}", i), "k")).collect();
        let out = summarize_day(&events, "2026-06-22");
        assert_eq!(out["topApps"].as_array().unwrap().len(), 10);
        assert_eq!(out["totalEntries"], json!(15));
    }
}

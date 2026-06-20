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

        _ => Value::Null,
    }
}

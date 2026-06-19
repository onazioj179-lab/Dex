// =============================================================================
// DEX Tauri — Timeline subsystem (data/read port of
// src/main/controllers/TimelineController.ts).
//
// Pure-data, DataStore-KV tier (same backbone as modes_dispatch in main.rs and
// rule_engine.rs). The Electron controller kept an in-memory `events` array that
// it loads from / persists to DataStore under the SINGLE key `timeline:events`
// (see loadTimelineData/saveTimelineData). On Tauri that DataStore key lives in
// the native KV store (dex-kv.json) reached via crate::kv_get / crate::kv_set,
// so we read the SAME key string ("timeline:events") — no new state needed.
// Return shapes match the Electron handlers exactly so the renderer is
// unchanged.
//
// A TimelineEvent is:
//   { id, type, title, description?, timestamp, duration?, path?, thumbnail?,
//     projectId?, sessionId?, metadata? }   (optional fields absent if unset)
//
// CHANNELS PORTED (read/data only):
//   - timeline:getEvents (list) -> TimelineEvent[]   (filtered + sorted + paged
//                                  exactly as Electron's getEvents(options))
//   - timeline:getEvent  (get)  -> TimelineEvent | null   (find by id, else null)
//
// CHANNELS SKIPPED (heavy / mutating — NOT ported, NOT faked):
//   - create (timeline:addEvent)  : write path; unshift + trim + persist.
//   - update (no such channel)    : TimelineController has no update handler.
//   - delete (timeline:clearOld)  : bulk prune by timestamp + persist.
// These fall through to Value::Null (the prefix-route honest-degrade), so a
// caller that hits them over the bridge gets null rather than a fabricated ok.
//
// DIVERGENCES (documented):
//   - The brief named the storage as `fs-json:timeline.json`, but the ACTUAL
//     Electron controller persists through DataStore under the key
//     `timeline:events` (dataStore.get/set), not a standalone timeline.json
//     file. We mirror the real source: KV key `timeline:events`. This keeps the
//     renderer's data identical regardless of the file-name label.
//   - TIME: Electron's `today` range and getByDate used LOCAL midnight
//     (Date#setHours(0,0,0,0)). The two ported read channels (getEvents /
//     getEvent) do NOT depend on local-midnight math — getEvents' 'today'
//     branch is the only local-time path and is reproduced here as UTC midnight
//     to stay tz-crate-free (same precedent as analytics.rs). 'week'/'month'/
//     'all' are pure now-relative millis and match exactly.
// =============================================================================

use serde_json::{json, Value};

const EVENTS_KEY: &str = "timeline:events";
const DAY_MS: i64 = 86_400_000;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// The stored events array ([] when unset), mirroring loadTimelineData().
fn load(app: &tauri::AppHandle) -> Vec<Value> {
    match crate::kv_get(app, EVENTS_KEY) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn timestamp_of(e: &Value) -> i64 {
    e.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0)
}

fn type_of(e: &Value) -> &str {
    e.get("type").and_then(|v| v.as_str()).unwrap_or("")
}

// timeline:getEvents — getEvents(options?): filter by project/types/timeRange,
// sort newest-first, then offset + limit. Mirrors the Electron order of ops.
fn get_events(app: &tauri::AppHandle, options: &Value) -> Vec<Value> {
    let mut filtered = load(app);

    // Filter by project.
    if let Some(pid) = options.get("projectId").and_then(|v| v.as_str()) {
        if !pid.is_empty() {
            filtered.retain(|e| e.get("projectId").and_then(|v| v.as_str()) == Some(pid));
        }
    }

    // Filter by types (only when a non-empty array is provided).
    if let Some(types) = options.get("types").and_then(|v| v.as_array()) {
        if !types.is_empty() {
            let wanted: Vec<&str> = types.iter().filter_map(|t| t.as_str()).collect();
            filtered.retain(|e| wanted.contains(&type_of(e)));
        }
    }

    // Filter by time range (anything but 'all' / absent applies a cutoff).
    if let Some(range) = options.get("timeRange").and_then(|v| v.as_str()) {
        if range != "all" {
            let now = now_ms();
            let cutoff = match range {
                // Electron used LOCAL midnight; we use UTC midnight (documented).
                "today" => now.div_euclid(DAY_MS) * DAY_MS,
                "week" => now - 7 * DAY_MS,
                "month" => now - 30 * DAY_MS,
                _ => 0,
            };
            filtered.retain(|e| timestamp_of(e) >= cutoff);
        }
    }

    // Sort by timestamp descending (newest first).
    filtered.sort_by(|a, b| timestamp_of(b).cmp(&timestamp_of(a)));

    // Pagination: offset then limit (same order as Electron).
    if let Some(offset) = options.get("offset").and_then(|v| v.as_u64()) {
        let off = offset as usize;
        filtered = if off >= filtered.len() {
            Vec::new()
        } else {
            filtered.split_off(off)
        };
    }
    if let Some(limit) = options.get("limit").and_then(|v| v.as_u64()) {
        filtered.truncate(limit as usize);
    }

    filtered
}

// timeline:getEvent — `this.events.find(e => e.id === id) || null`.
fn get_event(app: &tauri::AppHandle, id: &str) -> Value {
    load(app)
        .into_iter()
        .find(|e| e.get("id").and_then(|v| v.as_str()) == Some(id))
        .unwrap_or(Value::Null)
}

/// Route a `timeline:*` channel for the TimelineController data surface. Args are
/// the positional JSON array the renderer sent (see tauriCompat.ts). Only the two
/// read channels are handled; everything else (including the heavy write channels
/// and channels owned by the OTHER `timeline:`-prefixed controllers) returns
/// Value::Null. Because the `timeline:` prefix is SHARED by FileChangeTimeline
/// and UnifiedMediaTimeline, this dispatch is NOT safe to wire by prefix —
/// route the two exact channel strings to it instead (prefixRouteSafe = false).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    match channel {
        "timeline:getEvents" => {
            let options = args.get(0).cloned().unwrap_or(Value::Null);
            json!(get_events(app, &options))
        }
        "timeline:getEvent" => {
            let id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            get_event(app, id)
        }
        _ => Value::Null,
    }
}

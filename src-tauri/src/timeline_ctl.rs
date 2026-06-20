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
// CHANNELS PORTED (read + write, all native via the KV backbone):
//   - timeline:getEvents (list) -> TimelineEvent[]   (filtered + sorted + paged
//                                  exactly as Electron's getEvents(options))
//   - timeline:getEvent  (get)  -> TimelineEvent | null   (find by id, else null)
//   - timeline:addEvent  (create) -> TimelineEvent   (assign id + default ts,
//                                  unshift, trim to maxEvents, persist)
//   - timeline:clearOld  (delete) -> number   (prune events older than the
//                                  cutoff, persist, return count removed)
//
// CHANNELS NOT PORTED:
//   - update : TimelineController.ts has NO update handler / IPC channel. There
//     is nothing to port; events are immutable once added (only add + clearOld
//     mutate the store). Reported as degraded with that reason.
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
// Electron's TimelineController.maxEvents — keep last 10k events.
const MAX_EVENTS: usize = 10_000;

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

// Persist the events array under the SAME KV key, mirroring saveTimelineData().
fn save(app: &tauri::AppHandle, events: &[Value]) {
    crate::kv_set(app, EVENTS_KEY, Value::Array(events.to_vec()));
}

// timeline:addEvent — addEvent(eventData): spread the caller's fields, assign a
// fresh id, default the timestamp to now, unshift (prepend), trim to maxEvents,
// persist, and return the created event. Matches the Electron handler exactly,
// including the `event-<ts>-<rand>` id shape.
fn add_event(app: &tauri::AppHandle, event_data: &Value) -> Value {
    // Start from the caller's object (drop any caller-supplied id, like the
    // Electron Omit<TimelineEvent,'id'> contract). Non-object input -> {}.
    let mut event = match event_data {
        Value::Object(map) => map.clone(),
        _ => serde_json::Map::new(),
    };

    let now = now_ms();

    // id = `event-${Date.now()}-${rand}`. The random suffix mirrors Electron's
    // `Math.random().toString(36).substr(2, 9)` (9 base-36 chars); we reuse the
    // shared uuid helper for entropy and slice it to keep the same id length.
    let rand: String = crate::util::pseudo_uuid_v4()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(9)
        .collect();
    event.insert("id".to_string(), json!(format!("event-{}-{}", now, rand)));

    // timestamp = eventData.timestamp || Date.now(). Treat absent / null / 0 /
    // non-numeric as falsy, exactly like the JS `||`.
    let ts = event.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0);
    if ts == 0 {
        event.insert("timestamp".to_string(), json!(now));
    }

    let event_val = Value::Object(event);

    // unshift (prepend), then trim to the most-recent maxEvents.
    let mut events = load(app);
    events.insert(0, event_val.clone());
    if events.len() > MAX_EVENTS {
        events.truncate(MAX_EVENTS);
    }

    save(app, &events);
    event_val
}

// timeline:clearOld — clearOldEvents(olderThan): keep events with
// timestamp >= olderThan, persist, and return the count removed.
fn clear_old(app: &tauri::AppHandle, older_than: i64) -> Value {
    let mut events = load(app);
    let initial = events.len();
    events.retain(|e| timestamp_of(e) >= older_than);
    let removed = initial - events.len();
    save(app, &events);
    json!(removed)
}

/// Route a `timeline:*` channel for the TimelineController data surface. Args are
/// the positional JSON array the renderer sent (see tauriCompat.ts). The two read
/// channels plus addEvent/clearOld are handled; everything else (including
/// channels owned by the OTHER `timeline:`-prefixed controllers) returns
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
        "timeline:addEvent" => {
            let event_data = args.get(0).cloned().unwrap_or(Value::Null);
            add_event(app, &event_data)
        }
        "timeline:clearOld" => {
            // olderThan is an epoch-millis cutoff; absent -> 0 (clears nothing,
            // since every real event has timestamp >= 0).
            let older_than = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            clear_old(app, older_than)
        }
        _ => Value::Null,
    }
}

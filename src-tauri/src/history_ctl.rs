// =============================================================================
// DEX Tauri — Activity History subsystem (port of the DATA/read surface of
// core/ActivityHistoryTracker.ts).
//
// Pure-data, fs-JSON tier. Electron persisted the event log with raw
// `fs/promises` to a single bare-array file under userData:
//   - activity-history.json : HistoryEvent[]   (newest-first; NOT electron-store,
//                             no top-level key wrapper — just the array)
// This mirrors that exact file name and shape under <appData> so the renderer is
// unchanged. We only read it; the write/record/clear path stays in Electron (see
// SKIPPED below), so this module never mutates the file.
//
// A HistoryEvent is:
//   { id, type, timestamp, title, description?, target?, oldValue?, newValue?,
//     undoable, undoData?, metadata? }   — events are stored newest-first.
//
// Channels PORTED (read-only DATA surface), at EXACT Electron return shapes:
//   - history:list   (filter?: HistoryFilter) -> HistoryEvent[]
//   - history:get    (id: string)             -> HistoryEvent | null
//   - history:stats  ()                        -> HistoryStats
//   - history:recent (limit = 20)              -> HistoryEvent[]
//   - history:byType (type: string)           -> HistoryEvent[]
//
// Channels SKIPPED (heavy / stateful / not data-CRUD — left in Electron):
//   - history:record  : mutates the in-memory log + counter + debounced save +
//                       BrowserWindow broadcast. Not ported.
//   - history:undo    : emits 'undo:request' to native handlers + re-records.
//   - history:clear   : mutates + schedules save.
//   - history:export  : writes an arbitrary fs path.
//   For each, prefix routing returns Value::Null (renderer treats absent record
//   id / undefined as a no-op). We do NOT fake them.
//
// DIVERGENCES (documented):
//   - The Electron tracker holds events in MEMORY and only debounce-persists to
//     disk; on a fresh load it reads the file. This read-only port serves the
//     persisted file directly (the on-disk snapshot). The in-memory session
//     events that have not yet flushed (5s debounce) — notably the synthetic
//     'session:started' recorded at construction — are therefore not visible
//     here. Shapes of every returned event are identical.
//   - getStats(): oldestEvent/newestEvent are `number | undefined`. Electron
//     omits the key when the log is empty (reading [last]?.timestamp -> undefined
//     -> dropped over IPC). We mirror that by omitting the key when there are no
//     events, rather than emitting null.
// =============================================================================

use serde_json::{json, Map, Value};
use std::path::PathBuf;
use tauri::Manager;

const HISTORY_FILE: &str = "activity-history.json";
const DEFAULT_RECENT_LIMIT: usize = 20;

// --- file IO ----------------------------------------------------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir.join(name)
}

// Bare-array file: HistoryEvent[]. Missing/invalid -> [] (matches the Electron
// catch that starts fresh).
fn read_events(app: &tauri::AppHandle) -> Vec<Value> {
    match std::fs::read_to_string(store_path(app, HISTORY_FILE)) {
        Ok(raw) => serde_json::from_str::<Value>(&raw)
            .ok()
            .and_then(|v| v.as_array().cloned())
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

// --- event field accessors --------------------------------------------------

fn ev_id(e: &Value) -> &str {
    e.get("id").and_then(|v| v.as_str()).unwrap_or("")
}
fn ev_type(e: &Value) -> &str {
    e.get("type").and_then(|v| v.as_str()).unwrap_or("")
}
fn ev_timestamp(e: &Value) -> i64 {
    e.get("timestamp").and_then(|v| v.as_i64()).unwrap_or(0)
}
fn ev_undoable(e: &Value) -> bool {
    e.get("undoable").and_then(|v| v.as_bool()).unwrap_or(false)
}
fn ev_str(e: &Value, key: &str) -> Option<String> {
    e.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
}

// getEvents(filter?) — clone the (newest-first) log, then apply each filter
// clause in the exact Electron order. No filter -> the whole log.
fn get_events(events: &[Value], filter: &Value) -> Vec<Value> {
    let mut results: Vec<Value> = events.to_vec();
    if !filter.is_object() {
        return results;
    }

    // filter.types: string[] — keep events whose type is in the list (only when
    // the array is non-empty, mirroring `types && types.length > 0`).
    if let Some(types) = filter.get("types").and_then(|v| v.as_array()) {
        if !types.is_empty() {
            let wanted: Vec<&str> = types.iter().filter_map(|v| v.as_str()).collect();
            results.retain(|e| wanted.contains(&ev_type(e)));
        }
    }

    // filter.startTime / endTime — truthy guard (0 is falsy in JS, so 0 is
    // ignored exactly as `if (filter.startTime)`).
    if let Some(start) = filter.get("startTime").and_then(|v| v.as_i64()) {
        if start != 0 {
            results.retain(|e| ev_timestamp(e) >= start);
        }
    }
    if let Some(end) = filter.get("endTime").and_then(|v| v.as_i64()) {
        if end != 0 {
            results.retain(|e| ev_timestamp(e) <= end);
        }
    }

    // filter.search — case-insensitive substring over title|description|target.
    if let Some(search) = filter.get("search").and_then(|v| v.as_str()) {
        if !search.is_empty() {
            let needle = search.to_lowercase();
            results.retain(|e| {
                let hit = |k: &str| {
                    ev_str(e, k)
                        .map(|s| s.to_lowercase().contains(&needle))
                        .unwrap_or(false)
                };
                hit("title") || hit("description") || hit("target")
            });
        }
    }

    // filter.target — exact match.
    if let Some(target) = filter.get("target").and_then(|v| v.as_str()) {
        if !target.is_empty() {
            results.retain(|e| ev_str(e, "target").as_deref() == Some(target));
        }
    }

    // filter.undoableOnly.
    if filter.get("undoableOnly").and_then(|v| v.as_bool()) == Some(true) {
        results.retain(ev_undoable);
    }

    results
}

// getEvent(id) -> HistoryEvent | null
fn get_event(events: &[Value], id: &str) -> Value {
    events
        .iter()
        .find(|e| ev_id(e) == id)
        .cloned()
        .unwrap_or(Value::Null)
}

// getRecentEvents(limit = 20) -> events.slice(0, limit)
fn get_recent(events: &[Value], limit: usize) -> Vec<Value> {
    events.iter().take(limit).cloned().collect()
}

// getEventsByType(type) -> events.filter(e => e.type === type)
fn get_by_type(events: &[Value], kind: &str) -> Vec<Value> {
    events.iter().filter(|e| ev_type(e) == kind).cloned().collect()
}

// getStats() -> HistoryStats
fn get_stats(events: &[Value]) -> Value {
    let mut by_type: Map<String, Value> = Map::new();
    let mut undoable_count: i64 = 0;
    for e in events {
        let t = ev_type(e).to_string();
        let c = by_type.get(&t).and_then(|v| v.as_i64()).unwrap_or(0) + 1;
        by_type.insert(t, json!(c));
        if ev_undoable(e) {
            undoable_count += 1;
        }
    }

    let mut out = Map::new();
    out.insert("totalEvents".into(), json!(events.len()));
    out.insert("eventsByType".into(), Value::Object(by_type));
    // oldestEvent = events[last]?.timestamp ; newestEvent = events[0]?.timestamp
    // (newest-first). Omit the keys entirely when empty (undefined over IPC).
    if let Some(last) = events.last() {
        out.insert("oldestEvent".into(), json!(ev_timestamp(last)));
    }
    if let Some(first) = events.first() {
        out.insert("newestEvent".into(), json!(ev_timestamp(first)));
    }
    out.insert("undoableCount".into(), json!(undoable_count));
    Value::Object(out)
}

/// Route a `history:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is handled; the
/// heavy/stateful channels (record/undo/clear/export) and unknown ones return
/// Value::Null (honest degrade — they remain owned by the Electron tracker).
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a0 = args.get(0).cloned().unwrap_or(Value::Null);
    match channel {
        "history:list" => json!(get_events(&read_events(app), &a0)),
        "history:get" => {
            let id = a0.as_str().unwrap_or("");
            get_event(&read_events(app), id)
        }
        "history:stats" => get_stats(&read_events(app)),
        "history:recent" => {
            let limit = a0.as_u64().map(|n| n as usize).unwrap_or(DEFAULT_RECENT_LIMIT);
            json!(get_recent(&read_events(app), limit))
        }
        "history:byType" => {
            let kind = a0.as_str().unwrap_or("");
            json!(get_by_type(&read_events(app), kind))
        }
        // Heavy / stateful — NOT ported (owned by the Electron tracker).
        _ => Value::Null,
    }
}

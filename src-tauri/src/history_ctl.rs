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
// Channels PORTED (heavy / stateful WRITE surface) — round 3, REAL native impl
// against the SAME on-disk file (no Electron tracker required):
//   - history:record (data) -> id (string)
//       Builds a HistoryEvent with a fresh id + timestamp, unshifts it onto the
//       persisted array (newest-first), trims to maxEvents (1000), writes the
//       file synchronously (no 5s debounce — we persist immediately so the
//       read channels observe it at once), then broadcasts 'history:event' to
//       the renderer via emit_event (parity with the Electron webContents.send).
//   - history:undo (id) -> { success, error? }
//       Looks up the event; if not found / not undoable / no undoData, returns
//       the same failure shapes. Otherwise emits 'undo:request' with the event
//       so native/renderer handlers can perform the actual revert, records the
//       inverse "Undid: …" event, and returns { success: true }.
//   - history:clear (before?) -> { cleared }
//       Drops the whole log (or everything strictly older than `before`),
//       writes the file, returns the count removed.
//   - history:export (filePath) -> { success, error? }
//       Serializes the persisted events (pretty, 2-space — Electron used
//       JSON.stringify(events, null, 2)) and writes them to the caller's path.
//
// Persistence divergence vs Electron: the Electron tracker debounced saves by
// 5s and broadcast from memory; this port writes through on every mutation so a
// stateless dispatcher stays consistent across calls. Shapes are identical.
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

use crate::paths::DexPaths;
use serde_json::{json, Map, Value};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

const HISTORY_FILE: &str = "activity-history.json";
const DEFAULT_RECENT_LIMIT: usize = 20;
// DEFAULT_CONFIG.maxEvents in the Electron tracker — the log is trimmed to this.
const MAX_EVENTS: usize = 1000;

// Process-lifetime monotonic counter mirroring the Electron `++this.eventCounter`
// that disambiguates ids recorded inside the same millisecond. Starts at 0; the
// first recorded id therefore uses suffix 1, exactly like Electron.
static EVENT_COUNTER: AtomicU64 = AtomicU64::new(0);

// Epoch millis — the timestamp + id-time source (Electron used Date.now()).
fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- file IO ----------------------------------------------------------------

fn store_path(app: &tauri::AppHandle, name: &str) -> PathBuf {
    let dir = app.dex_data_dir().unwrap_or_else(|_| PathBuf::from("."));
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

// Persist the (newest-first) event array back to the bare-array file. Electron's
// saveHistory() wrote `JSON.stringify(events.slice(0, maxEvents))` (compact); we
// match that — compact, trimmed to MAX_EVENTS. Returns Err on IO failure.
fn write_events(app: &tauri::AppHandle, events: &[Value]) -> std::io::Result<()> {
    let trimmed: &[Value] = if events.len() > MAX_EVENTS {
        &events[..MAX_EVENTS]
    } else {
        events
    };
    let data = serde_json::to_string(&Value::Array(trimmed.to_vec())).unwrap_or_else(|_| "[]".into());
    crate::write_atomic(store_path(app, HISTORY_FILE), data)
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

// --- write surface ----------------------------------------------------------

// recordEvent(data) -> id. Mirrors the Electron path: build the full event from
// the caller's partial (everything except id/timestamp), unshift newest-first,
// trim, persist, broadcast. `data` is the first positional arg (an object); a
// non-object is treated as an empty object so we still mint a well-formed event.
fn record_event(app: &tauri::AppHandle, data: &Value) -> Value {
    let counter = EVENT_COUNTER.fetch_add(1, Ordering::SeqCst) + 1;
    let ts = now_millis();
    let id = format!("hist-{}-{}", ts, counter);

    // Start from the caller's fields, then overwrite id/timestamp (Electron spread
    // `{ ...data, id, timestamp }` — id/timestamp always win).
    let mut event: Map<String, Value> = data
        .as_object()
        .cloned()
        .unwrap_or_default();
    event.insert("id".into(), json!(id));
    event.insert("timestamp".into(), json!(ts));
    // `undoable` is required on the type; default false when the caller omits it
    // (Electron's convenience callers always set it, but raw record may not).
    event.entry("undoable").or_insert(json!(false));
    let event = Value::Object(event);

    let mut events = read_events(app);
    events.insert(0, event.clone());
    if events.len() > MAX_EVENTS {
        events.truncate(MAX_EVENTS);
    }
    let _ = write_events(app, &events);

    // webContents.send('history:event', event) — one payload, same channel.
    crate::native_ops::emit_event(app, "history:event", &event);

    json!(id)
}

// undoEvent(id) -> { success, error? }. Emits 'undo:request' for handlers, then
// records the inverse event. We do NOT perform the underlying revert here — in
// Electron the actual undo was done by whatever subscribed to 'undo:request';
// that contract is preserved by re-emitting the event for the renderer/native
// handlers to act on.
fn undo_event(app: &tauri::AppHandle, id: &str) -> Value {
    let events = read_events(app);
    let event = match events.iter().find(|e| ev_id(e) == id) {
        Some(e) => e.clone(),
        None => return json!({ "success": false, "error": "Event not found" }),
    };

    let has_undo_data = event.get("undoData").map(|v| !v.is_null()).unwrap_or(false);
    if !ev_undoable(&event) || !has_undo_data {
        return json!({ "success": false, "error": "Event cannot be undone" });
    }

    // Hand the event to whoever performs the actual revert.
    crate::native_ops::emit_event(app, "undo:request", &event);

    // Record the inverse action (swap old/new value), exactly as Electron did.
    let inverse = json!({
        "type": ev_type(&event),
        "title": format!("Undid: {}", event.get("title").and_then(|v| v.as_str()).unwrap_or("")),
        "target": event.get("target").cloned().unwrap_or(Value::Null),
        "oldValue": event.get("newValue").cloned().unwrap_or(Value::Null),
        "newValue": event.get("oldValue").cloned().unwrap_or(Value::Null),
        "undoable": false
    });
    let _ = record_event(app, &inverse);

    json!({ "success": true })
}

// clearHistory(before?) -> { cleared }. before truthy -> keep events at/after it;
// else drop everything. (Electron: `if (before)` — 0 is falsy, so a 0/absent
// `before` clears all.)
fn clear_history(app: &tauri::AppHandle, before: &Value) -> Value {
    let mut events = read_events(app);
    let initial = events.len();

    let cutoff = before.as_i64().unwrap_or(0);
    if cutoff != 0 {
        events.retain(|e| ev_timestamp(e) >= cutoff);
    } else {
        events.clear();
    }

    let cleared = initial - events.len();
    let _ = write_events(app, &events);
    json!({ "cleared": cleared })
}

// exportHistory(filePath) -> { success, error? }. Pretty (2-space) JSON of the
// full persisted log, written to the caller's path.
fn export_history(app: &tauri::AppHandle, file_path: &str) -> Value {
    if file_path.is_empty() {
        return json!({ "success": false, "error": "No file path provided" });
    }
    let events = read_events(app);
    let data = match serde_json::to_string_pretty(&Value::Array(events)) {
        Ok(d) => d,
        Err(e) => return json!({ "success": false, "error": e.to_string() }),
    };
    match crate::write_atomic(file_path, data) {
        Ok(()) => json!({ "success": true }),
        Err(e) => json!({ "success": false, "error": e.to_string() }),
    }
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
        // Heavy / stateful WRITE surface — REAL native impl over the same file.
        "history:record" => record_event(app, &a0),
        "history:undo" => {
            let id = a0.as_str().unwrap_or("");
            undo_event(app, id)
        }
        "history:clear" => clear_history(app, &a0),
        "history:export" => {
            let file_path = a0.as_str().unwrap_or("");
            export_history(app, file_path)
        }
        // Unknown channels in the namespace — honest degrade.
        _ => Value::Null,
    }
}

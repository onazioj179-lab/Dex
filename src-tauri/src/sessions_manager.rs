// =============================================================================
// DEX Tauri — Sessions subsystem (port of the `sessions:*` IPC handlers in
// src/main/main.ts, backed by SessionController.ts + DataStore.ts).
//
// The Electron `sessions:*` namespace is actually TWO unrelated channel families
// over THREE storage shapes. Both are mirrored here against the native KV store
// (crate::kv_get / crate::kv_set, file <appConfig>/dex-kv.json) using the SAME
// top-level keys Electron's DataStore used. This matches the modes_dispatch /
// projects_dispatch precedent (Electron electron-store get/set(key) -> native KV
// key string), so no on-disk schema is invented.
//
// FAMILY A — the live renderer API (window.dex.sessions.*, see preload.ts):
//   sessions:getCurrent | start | end | getHistory   -> KV key "sessions"
//       simple session rows: { id, startedAt, endedAt?, active }
//   sessions:getNotes | addNote | updateNote | deleteNote
//       -> currentSession.notes (KV key "currentSession")  [SessionController]
//   sessions:getTimers | createTimer | deleteTimer
//       -> currentSession.timers (KV key "currentSession") [SessionController]
//
// FAMILY B — legacy DataStore-direct CRUD (NOT exposed in preload; no renderer
// reaches it, but kept so the prefix route covers the whole namespace):
//   sessions:notes:get|add|update|delete   -> KV key "sessionNotes"
//   sessions:timers:get|create|start|pause|stop|delete -> KV key "sessionTimers"
//
// DIVERGENCES (documented):
//  - ID generation: Electron used template ids like `session-${Date.now()}`,
//    `note_${Date.now()}_${rand}`, `timer_${Date.now()}_${rand}`. To stay
//    rand/Math.random-free, the random suffix uses crate::util::pseudo_uuid_v4().
//    The `session-${now}` / `note-${now}` / `timer-${now}` prefixes + epoch-ms
//    are preserved; only the trailing random segment differs (id is opaque).
//  - SKIPPED (heavy, live runtime — NOT ported, NOT faked): sessions:startTimer,
//    sessions:pauseTimer, sessions:stopTimer drive a Node setInterval that counts
//    `elapsed` and auto-completes the timer; the durable effect is only a status
//    flip, but flipping status without the live tick is a fake (the timer would
//    never advance/complete). sessions:getRunningTasks / sessions:stopTask read
//    and cancel the in-memory workflow `executions` Map + live timers, which has
//    no persisted source of truth. All four return Value::Null (honest degrade;
//    renderer signatures are Promise<void> / array consumers tolerate null).
//  - SessionController.addNote/createTimer auto-create a session ("Quick Notes" /
//    "Timer Session") when none is active. That behavior IS pure-data and is
//    preserved here, persisting the new currentSession to KV.
// =============================================================================

use crate::util::pseudo_uuid_v4;
use serde_json::{json, Value};

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn rand_suffix() -> String {
    // Mirrors Math.random().toString(36).substr(2, 9) (a short opaque tail).
    pseudo_uuid_v4().replace('-', "").chars().take(9).collect()
}

// --- KV array helpers (mirror DataStore.get<any[]>(key) || []) ---------------

fn load_array(app: &tauri::AppHandle, key: &str) -> Vec<Value> {
    match crate::kv_get(app, key) {
        Value::Array(a) => a,
        _ => Vec::new(),
    }
}

fn save_array(app: &tauri::AppHandle, key: &str, arr: Vec<Value>) {
    crate::kv_set(app, key, Value::Array(arr));
}

// currentSession is a single object (or null) under KV key "currentSession".
fn load_current_session(app: &tauri::AppHandle) -> Option<serde_json::Map<String, Value>> {
    match crate::kv_get(app, "currentSession") {
        Value::Object(o) => Some(o),
        _ => None,
    }
}

fn save_current_session(app: &tauri::AppHandle, session: &serde_json::Map<String, Value>) {
    crate::kv_set(app, "currentSession", Value::Object(session.clone()));
}

// SessionController.startSession(name) — used by the addNote/createTimer
// auto-create paths. Returns a fresh in-memory session map.
fn new_session(name: &str) -> serde_json::Map<String, Value> {
    let mut s = serde_json::Map::new();
    s.insert("id".into(), json!(format!("session_{}_{}", now_ms(), rand_suffix())));
    s.insert("name".into(), json!(name));
    s.insert("startTime".into(), json!(now_ms()));
    s.insert("status".into(), json!("active"));
    s.insert("notes".into(), json!([]));
    s.insert("timers".into(), json!([]));
    s.insert("executedWorkflows".into(), json!([]));
    s.insert("activeOperations".into(), json!([]));
    s
}

// Read a named array field ("notes" / "timers") out of currentSession, or [].
fn session_field_array(app: &tauri::AppHandle, field: &str) -> Vec<Value> {
    load_current_session(app)
        .and_then(|s| s.get(field).and_then(|v| v.as_array()).cloned())
        .unwrap_or_default()
}

pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let a0 = args.get(0).cloned().unwrap_or(Value::Null);
    match channel {
        // ---------------------------------------------------------------------
        // FAMILY A — sessions (simple rows, KV key "sessions")
        // ---------------------------------------------------------------------
        "sessions:getCurrent" => {
            // sessions.find(s => s.active) || null
            load_array(app, "sessions")
                .into_iter()
                .find(|s| s.get("active").and_then(|v| v.as_bool()).unwrap_or(false))
                .unwrap_or(Value::Null)
        }
        "sessions:start" => {
            // End any active session, push a new one, return the new session.
            // (Electron ignores the `name` arg in this handler.)
            let mut sessions = load_array(app, "sessions");
            for s in sessions.iter_mut() {
                if s.get("active").and_then(|v| v.as_bool()).unwrap_or(false) {
                    if let Some(o) = s.as_object_mut() {
                        o.insert("active".into(), json!(false));
                        o.insert("endedAt".into(), json!(now_ms()));
                    }
                }
            }
            let new_session = json!({
                "id": format!("session-{}", now_ms()),
                "startedAt": now_ms(),
                "active": true,
            });
            sessions.push(new_session.clone());
            save_array(app, "sessions", sessions);
            new_session
        }
        "sessions:end" => {
            let mut sessions = load_array(app, "sessions");
            for s in sessions.iter_mut() {
                if s.get("active").and_then(|v| v.as_bool()).unwrap_or(false) {
                    if let Some(o) = s.as_object_mut() {
                        o.insert("active".into(), json!(false));
                        o.insert("endedAt".into(), json!(now_ms()));
                    }
                }
            }
            save_array(app, "sessions", sessions);
            json!({ "success": true })
        }
        "sessions:getHistory" => {
            // sessions.sort((a, b) => b.startedAt - a.startedAt)
            let mut sessions = load_array(app, "sessions");
            sessions.sort_by(|a, b| {
                let bs = b.get("startedAt").and_then(|v| v.as_i64()).unwrap_or(0);
                let as_ = a.get("startedAt").and_then(|v| v.as_i64()).unwrap_or(0);
                bs.cmp(&as_)
            });
            json!(sessions)
        }

        // ---------------------------------------------------------------------
        // FAMILY A — notes (SessionController, currentSession.notes)
        // ---------------------------------------------------------------------
        "sessions:getNotes" => json!(session_field_array(app, "notes")),
        "sessions:addNote" => {
            // addNote(noteData.content, noteData.linkedTo); auto-create session.
            let content = a0.get("content").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let linked_to = a0.get("linkedTo").cloned().unwrap_or(Value::Null);
            let mut session = load_current_session(app).unwrap_or_else(|| new_session("Quick Notes"));
            let mut note = serde_json::Map::new();
            note.insert("id".into(), json!(format!("note_{}_{}", now_ms(), rand_suffix())));
            note.insert("content".into(), json!(content));
            note.insert("createdAt".into(), json!(now_ms()));
            note.insert("updatedAt".into(), json!(now_ms()));
            note.insert("linkedTo".into(), linked_to);
            let note = Value::Object(note);
            let mut notes = session.get("notes").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            notes.push(note.clone());
            session.insert("notes".into(), json!(notes));
            save_current_session(app, &session);
            note
        }
        "sessions:updateNote" => {
            // updateNote(noteId, updates.content) -> note | null
            let note_id = a0.as_str().unwrap_or("");
            let content = args
                .get(1)
                .and_then(|u| u.get("content"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let mut session = match load_current_session(app) {
                Some(s) => s,
                None => return Value::Null,
            };
            let mut notes = session.get("notes").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            let mut found: Value = Value::Null;
            for n in notes.iter_mut() {
                if n.get("id").and_then(|v| v.as_str()) == Some(note_id) {
                    if let Some(o) = n.as_object_mut() {
                        o.insert("content".into(), json!(content));
                        o.insert("updatedAt".into(), json!(now_ms()));
                    }
                    found = n.clone();
                    break;
                }
            }
            if found.is_null() {
                // Electron: returns null and persists nothing when not found.
                return Value::Null;
            }
            session.insert("notes".into(), json!(notes));
            save_current_session(app, &session);
            found
        }
        "sessions:deleteNote" => {
            // deleteNote(noteId): void; persists only if a note was removed.
            let note_id = a0.as_str().unwrap_or("");
            if let Some(mut session) = load_current_session(app) {
                let mut notes = session.get("notes").and_then(|v| v.as_array()).cloned().unwrap_or_default();
                let before = notes.len();
                notes.retain(|n| n.get("id").and_then(|v| v.as_str()) != Some(note_id));
                if notes.len() != before {
                    session.insert("notes".into(), json!(notes));
                    save_current_session(app, &session);
                }
            }
            Value::Null
        }

        // ---------------------------------------------------------------------
        // FAMILY A — timers (SessionController, currentSession.timers)
        // ---------------------------------------------------------------------
        "sessions:getTimers" => json!(session_field_array(app, "timers")),
        "sessions:createTimer" => {
            // createTimer(timerData.name, timerData.duration); auto-create session.
            let name = a0.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let duration = a0.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0);
            let mut session = load_current_session(app).unwrap_or_else(|| new_session("Timer Session"));
            let timer = json!({
                "id": format!("timer_{}_{}", now_ms(), rand_suffix()),
                "name": name,
                "duration": duration,
                "elapsed": 0,
                "status": "idle",
            });
            let mut timers = session.get("timers").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            timers.push(timer.clone());
            session.insert("timers".into(), json!(timers));
            save_current_session(app, &session);
            timer
        }
        "sessions:deleteTimer" => {
            // deleteTimer(timerId): void; persists only if a timer was removed.
            let timer_id = a0.as_str().unwrap_or("");
            if let Some(mut session) = load_current_session(app) {
                let mut timers = session.get("timers").and_then(|v| v.as_array()).cloned().unwrap_or_default();
                let before = timers.len();
                timers.retain(|t| t.get("id").and_then(|v| v.as_str()) != Some(timer_id));
                if timers.len() != before {
                    session.insert("timers".into(), json!(timers));
                    save_current_session(app, &session);
                }
            }
            Value::Null
        }

        // ---------------------------------------------------------------------
        // FAMILY A — heavy / live runtime: NOT ported, NOT faked (honest null).
        // ---------------------------------------------------------------------
        "sessions:startTimer"
        | "sessions:pauseTimer"
        | "sessions:stopTimer"
        | "sessions:getRunningTasks"
        | "sessions:stopTask" => Value::Null,

        // ---------------------------------------------------------------------
        // FAMILY B — legacy DataStore-direct CRUD (not in preload). Pure-data.
        // sessionNotes (KV key "sessionNotes")
        // ---------------------------------------------------------------------
        "sessions:notes:get" => {
            let session_id = a0.as_str().unwrap_or("");
            let notes: Vec<Value> = load_array(app, "sessionNotes")
                .into_iter()
                .filter(|n| n.get("sessionId").and_then(|v| v.as_str()) == Some(session_id))
                .collect();
            json!(notes)
        }
        "sessions:notes:add" => {
            let session_id = a0.as_str().unwrap_or("");
            let content = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let note = json!({
                "id": format!("note-{}", now_ms()),
                "sessionId": session_id,
                "content": content,
                "createdAt": now_ms(),
            });
            let mut notes = load_array(app, "sessionNotes");
            notes.push(note.clone());
            save_array(app, "sessionNotes", notes);
            note
        }
        "sessions:notes:update" => {
            let note_id = a0.as_str().unwrap_or("");
            let content = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let mut notes = load_array(app, "sessionNotes");
            let mut changed = false;
            for n in notes.iter_mut() {
                if n.get("id").and_then(|v| v.as_str()) == Some(note_id) {
                    if let Some(o) = n.as_object_mut() {
                        o.insert("content".into(), json!(content));
                        o.insert("updatedAt".into(), json!(now_ms()));
                    }
                    changed = true;
                    break;
                }
            }
            if changed {
                save_array(app, "sessionNotes", notes);
            }
            json!({ "success": true })
        }
        "sessions:notes:delete" => {
            let note_id = a0.as_str().unwrap_or("");
            let notes: Vec<Value> = load_array(app, "sessionNotes")
                .into_iter()
                .filter(|n| n.get("id").and_then(|v| v.as_str()) != Some(note_id))
                .collect();
            save_array(app, "sessionNotes", notes);
            json!({ "success": true })
        }

        // ---------------------------------------------------------------------
        // FAMILY B — sessionTimers (KV key "sessionTimers"). All pure-data:
        // start/pause/stop here are plain status flips (no live interval).
        // ---------------------------------------------------------------------
        "sessions:timers:get" => json!(load_array(app, "sessionTimers")),
        "sessions:timers:create" => {
            let label = a0.as_str().unwrap_or("");
            let duration = args.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0);
            let timer = json!({
                "id": format!("timer-{}", now_ms()),
                "label": label,
                "duration": duration,
                "remaining": duration,
                "status": "idle",
                "createdAt": now_ms(),
            });
            let mut timers = load_array(app, "sessionTimers");
            timers.push(timer.clone());
            save_array(app, "sessionTimers", timers);
            timer
        }
        "sessions:timers:start" | "sessions:timers:pause" | "sessions:timers:stop" => {
            let timer_id = a0.as_str().unwrap_or("");
            let (status, zero_remaining) = match channel {
                "sessions:timers:start" => ("running", false),
                "sessions:timers:pause" => ("paused", false),
                _ => ("done", true), // stop
            };
            let mut timers = load_array(app, "sessionTimers");
            let mut changed = false;
            for t in timers.iter_mut() {
                if t.get("id").and_then(|v| v.as_str()) == Some(timer_id) {
                    if let Some(o) = t.as_object_mut() {
                        o.insert("status".into(), json!(status));
                        if zero_remaining {
                            o.insert("remaining".into(), json!(0));
                        }
                    }
                    changed = true;
                    break;
                }
            }
            if changed {
                save_array(app, "sessionTimers", timers);
            }
            json!({ "success": true })
        }
        "sessions:timers:delete" => {
            let timer_id = a0.as_str().unwrap_or("");
            let timers: Vec<Value> = load_array(app, "sessionTimers")
                .into_iter()
                .filter(|t| t.get("id").and_then(|v| v.as_str()) != Some(timer_id))
                .collect();
            save_array(app, "sessionTimers", timers);
            json!({ "success": true })
        }

        _ => Value::Null,
    }
}

// =============================================================================
// DEX Tauri — Session-migration subsystem (port of the `session:*` IPC handlers
// in src/main/core/MiscSystems.ts, class SessionMigrator / "Feature 70").
//
// Pure-data, JSON-backed tier. Electron did NOT use electron-store here: it kept
// one JSON file per session inside a `sessions/` directory under userData
// (`<userData>/sessions/<id>.json`), plus a single in-memory `currentSession`.
// This mirrors that exact layout under <appData>/sessions/ so `session:list`
// reads the same files the same way. The in-memory `currentSession` (which a
// stateless dispatch cannot hold across calls) is persisted to the well-known
// file `<appData>/sessions/current-session.json` — the honest native analog of
// Electron's process-lifetime singleton.
//
// Channels & shapes (Electron SessionMigrator surface):
//   - session:list -> Array<{ id: string, createdAt: number, windowCount: number }>
//                     read every "*.json" under sessions/ (skipping the reserved
//                     current-session.json), project the three fields, sort by
//                     createdAt descending (newest first).
//   - session:save -> string (the captured session id). Enumerates the live
//                     webview windows (real native capture via Manager::
//                     webview_windows()), records each window's bounds/url/title,
//                     writes <id>.json, returns the id.
//   - session:restore(sessionId) -> boolean. Reads <id>.json, applies the first
//                     window's saved bounds to the live first window, promotes
//                     the file to currentSession, emits `session:restored`
//                     { activePage, customState } to the renderer, returns true;
//                     false on missing/corrupt file (matches Electron).
//   - session:update-state({ key, value }) -> void (Null). Mutates the current
//                     session's customState[key] = value and persists it.
//
// Brief-named channels with NO Electron `session:*` handler — mapped to the
// SessionMigrator's sibling methods (createEmptySession / getCurrentSession /
// deleteSession) so the whole namespace is covered with real behavior rather
// than invented shapes:
//   - session:getActive -> the current SessionState (getCurrentSession()), or
//                     Null when none has been created yet.
//   - session:create -> a fresh empty SessionState (createEmptySession()),
//                     promoted to currentSession, returned.
//   - session:destroy(sessionId) -> boolean (deleteSession()): unlink the file,
//                     true if it existed.
//
// No new dependencies: serde_json + std + tauri (Manager) only.
// =============================================================================

use crate::paths::DexPaths;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

const SESSIONS_DIR: &str = "sessions";
const CURRENT_FILE: &str = "current-session.json";

// Wall-clock epoch millis — Electron's Date.now().
fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// Directory holding one <id>.json per captured session (mirrors the Electron
// `path.join(userData, 'sessions')`).
fn sessions_dir(app: &tauri::AppHandle) -> PathBuf {
    let base = app
        .dex_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let dir = base.join(SESSIONS_DIR);
    let _ = std::fs::create_dir_all(&dir);
    dir
}

// createEmptySession(): id `session-<ts>-<6hex>`, createdAt now, empty maps.
// (Electron used crypto.randomBytes(3).toString('hex') for the suffix; a short
// slice of the shared pseudo-uuid serves the same single-machine-uniqueness
// purpose without a new dependency.)
fn create_empty_session() -> Value {
    let suffix: String = crate::util::pseudo_uuid_v4()
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .take(6)
        .collect();
    json!({
        "id": format!("session-{}-{}", now_millis(), suffix),
        "createdAt": now_millis(),
        "windows": [],
        "activePage": "",
        "scrollPositions": {},
        "formData": {},
        "customState": {},
    })
}

// Path of the persisted in-memory `currentSession`.
fn current_path(app: &tauri::AppHandle) -> PathBuf {
    sessions_dir(app).join(CURRENT_FILE)
}

// Read the persisted currentSession, or create + persist a fresh empty one
// (Electron creates an empty session at initialize() time).
fn load_current(app: &tauri::AppHandle) -> Value {
    let path = current_path(app);
    if let Ok(raw) = std::fs::read_to_string(&path) {
        if let Ok(v) = serde_json::from_str::<Value>(&raw) {
            if v.is_object() {
                return v;
            }
        }
    }
    let fresh = create_empty_session();
    let _ = store_current(app, &fresh);
    fresh
}

fn store_current(app: &tauri::AppHandle, session: &Value) -> std::io::Result<()> {
    let path = current_path(app);
    let body = serde_json::to_string_pretty(session).unwrap_or_else(|_| "{}".into());
    std::fs::write(path, body)
}

// listSessions(): read every *.json (except the reserved current-session.json),
// project { id, createdAt, windowCount }, sort by createdAt descending.
// Malformed / unreadable files are skipped (Electron wraps each read in a
// try/catch and continues).
fn list_sessions(app: &tauri::AppHandle) -> Value {
    let dir = sessions_dir(app);
    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return json!([]),
    };

    let mut sessions: Vec<Value> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        // Electron filters with `file.endsWith('.json')`.
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        // The persisted currentSession is bookkeeping, not a saved session.
        if path.file_name().and_then(|n| n.to_str()) == Some(CURRENT_FILE) {
            continue;
        }
        let raw = match std::fs::read_to_string(&path) {
            Ok(r) => r,
            Err(_) => continue,
        };
        let data: Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => continue,
        };
        // data.id (string), data.createdAt (number), data.windows?.length || 0.
        let id = data.get("id").cloned().unwrap_or(Value::Null);
        let created_at = data.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0);
        let window_count = data
            .get("windows")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        sessions.push(json!({
            "id": id,
            "createdAt": created_at,
            "windowCount": window_count,
        }));
    }

    // sort((a, b) => b.createdAt - a.createdAt) — newest first.
    sessions.sort_by(|a, b| {
        let ca = a.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0);
        let cb = b.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0);
        cb.cmp(&ca)
    });

    Value::Array(sessions)
}

// captureCurrentSession(): enumerate the live webview windows, record each
// window's bounds/url/title (real native capture), write <id>.json, return the
// id. Electron returned the session id string.
fn capture_session(app: &tauri::AppHandle) -> Value {
    let mut session = load_current(app);

    // session.windows = [] then push one entry per live window.
    let mut windows: Vec<Value> = Vec::new();
    for (_label, win) in app.webview_windows() {
        // outer_position + inner_size approximate Electron's getBounds().
        let pos = win.outer_position();
        let size = win.inner_size();
        let (x, y) = match pos {
            Ok(p) => (p.x, p.y),
            Err(_) => (0, 0),
        };
        let (w, h) = match size {
            Ok(s) => (s.width as i32, s.height as i32),
            Err(_) => (0, 0),
        };
        let url = win
            .url()
            .map(|u| u.to_string())
            .unwrap_or_default();
        let title = win.title().unwrap_or_default();
        windows.push(json!({
            "bounds": { "x": x, "y": y, "width": w, "height": h },
            "url": url,
            "title": title,
            "state": {},
        }));
    }
    session["windows"] = Value::Array(windows);

    let id = session
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            let nid = format!("session-{}-x", now_millis());
            session["id"] = json!(nid.clone());
            nid
        });

    // Serialize to <sessionDir>/<id>.json (scrollPositions/formData already plain
    // objects in this persisted form).
    let file = sessions_dir(app).join(format!("{}.json", id));
    let body = serde_json::to_string_pretty(&session).unwrap_or_else(|_| "{}".into());
    let _ = std::fs::write(file, body);
    // Keep the captured snapshot as the live current session too.
    let _ = store_current(app, &session);

    json!(id)
}

// restoreSession(sessionId): read <id>.json, apply the first saved window's
// bounds to the live first window, promote to currentSession, emit
// `session:restored` { activePage, customState }, return true. false on
// missing/corrupt (matches Electron).
fn restore_session(app: &tauri::AppHandle, session_id: &str) -> Value {
    if session_id.is_empty() {
        return json!(false);
    }
    let file = sessions_dir(app).join(format!("{}.json", session_id));
    let raw = match std::fs::read_to_string(&file) {
        Ok(r) => r,
        Err(_) => return json!(false), // !fs.existsSync -> false
    };
    let data: Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(_) => return json!(false), // JSON.parse throw -> catch -> false
    };

    // Restore window bounds: Electron applied every saved window's bounds to the
    // same existingWindows[0]; the net effect is the LAST window's bounds. Apply
    // them to the live first window.
    if let Some(saved) = data.get("windows").and_then(|v| v.as_array()) {
        if let Some(last) = saved.last().and_then(|w| w.get("bounds")) {
            let x = last.get("x").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let y = last.get("y").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let w = last.get("width").and_then(|v| v.as_i64()).unwrap_or(0) as u32;
            let h = last.get("height").and_then(|v| v.as_i64()).unwrap_or(0) as u32;
            if let Some((_label, win)) = app.webview_windows().into_iter().next() {
                if w > 0 && h > 0 {
                    let _ = win.set_position(tauri::PhysicalPosition::new(x, y));
                    let _ = win.set_size(tauri::PhysicalSize::new(w, h));
                }
            }
        }
    }

    // Promote to currentSession.
    let _ = store_current(app, &data);

    // Notify renderers: webContents.send('session:restored', { activePage, customState }).
    let payload = json!({
        "activePage": data.get("activePage").cloned().unwrap_or(json!("")),
        "customState": data.get("customState").cloned().unwrap_or(json!({})),
    });
    crate::native_ops::emit_event(app, "session:restored", &payload);

    json!(true)
}

// update-state({ key, value }): mutate currentSession.customState[key] = value,
// persist. Electron returns void -> Null.
fn update_state(app: &tauri::AppHandle, args: &Value) -> Value {
    let data = args.get(0);
    let key = data.and_then(|d| d.get("key")).and_then(|v| v.as_str());
    let value = data.and_then(|d| d.get("value")).cloned();
    if let (Some(key), Some(value)) = (key, value) {
        let mut session = load_current(app);
        let cs = session
            .get_mut("customState")
            .and_then(|v| v.as_object_mut());
        match cs {
            Some(map) => {
                map.insert(key.to_string(), value);
            }
            None => {
                session["customState"] = json!({ key: value });
            }
        }
        let _ = store_current(app, &session);
    }
    Value::Null
}

// deleteSession(sessionId): unlink the file; true if it existed (Electron).
fn destroy_session(app: &tauri::AppHandle, session_id: &str) -> Value {
    if session_id.is_empty() {
        return json!(false);
    }
    let file = sessions_dir(app).join(format!("{}.json", session_id));
    if !file.exists() {
        return json!(false);
    }
    match std::fs::remove_file(&file) {
        Ok(_) => json!(true),
        Err(_) => json!(false),
    }
}

/// Route a `session:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). The full SessionMigrator surface is implemented
/// with real native behavior — window capture/restore use the live Tauri webview
/// windows, state mutations persist to <appData>/sessions/current-session.json,
/// and restore pushes the `session:restored` event to the renderer.
pub fn dispatch(app: &tauri::AppHandle, channel: &str, args: &Value) -> Value {
    let arg0_str = || {
        args.get(0)
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_default()
    };

    match channel {
        "session:list" => list_sessions(app),

        // Real native window capture + persisted current session -> id string.
        "session:save" => capture_session(app),

        // Read file, apply bounds to live window, emit event, return bool.
        "session:restore" => restore_session(app, &arg0_str()),

        // Mutate persisted currentSession.customState; void -> Null.
        "session:update-state" => update_state(app, args),

        // getCurrentSession(): the persisted current SessionState.
        "session:getActive" => load_current(app),

        // createEmptySession(), promoted to currentSession.
        "session:create" => {
            let fresh = create_empty_session();
            let _ = store_current(app, &fresh);
            fresh
        }

        // deleteSession(id) -> bool.
        "session:destroy" => destroy_session(app, &arg0_str()),

        _ => Value::Null,
    }
}

// =============================================================================
// DEX Tauri — Session-migration subsystem (port of the `session:*` IPC handlers
// in src/main/core/MiscSystems.ts, class SessionMigrator / "Feature 70").
//
// Pure-data, JSON-backed tier. Electron did NOT use electron-store here: it kept
// one JSON file per session inside a `sessions/` directory under userData
// (`<userData>/sessions/<id>.json`). This mirrors that exact layout under
// <appData>/sessions/ so `session:list` reads the same files the same way.
//
// Channels & shapes (only the data/read surface is ported):
//   - session:list -> Array<{ id: string, createdAt: number, windowCount: number }>
//                     read every "*.json" under sessions/, project the three
//                     fields, sort by createdAt descending (newest first).
//
// NAMING NOTE (documented divergence): the porting brief named the data channels
// `session:getActive` and `session:list`, and heavy channels `save/restore/
// create/destroy`. Inspecting the actual renderer surface (preload.ts) and the
// Electron handlers, the `session` namespace only ever registers:
//   session:save, session:restore, session:list, session:update-state.
// There is NO session:getActive / session:create / session:destroy channel in
// this codebase (every `getActive` in preload belongs to a different namespace —
// mode:, transfer:, workflow:, advisory:, projects:). So:
//   - `session:list` is ported at its exact Electron shape.
//   - `session:getActive` has no Electron handler and no shape to mirror; it is
//     routed (so prefix routing covers the whole namespace) but returns
//     Value::Null — an honest "not present" rather than an invented object.
//   - The real heavy channels (save / restore / update-state) capture or mutate
//     live BrowserWindow bounds / in-memory session state and need the native
//     runtime; they are NOT implemented and NOT faked (return Value::Null, which
//     matches Electron's void return for restore-failure / update-state).
//
// No new dependencies: serde_json + std + tauri (Manager) only.
// =============================================================================

use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

const SESSIONS_DIR: &str = "sessions";

// Directory holding one <id>.json per captured session (mirrors the Electron
// `path.join(userData, 'sessions')`).
fn sessions_dir(app: &tauri::AppHandle) -> PathBuf {
    let base = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let dir = base.join(SESSIONS_DIR);
    let _ = std::fs::create_dir_all(&dir);
    dir
}

// listSessions(): read every *.json, project { id, createdAt, windowCount },
// sort by createdAt descending. Malformed / unreadable files are skipped (the
// Electron loop wraps each read in try/catch and continues).
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

/// Route a `session:*` channel. Args are the positional JSON array the renderer
/// sent (see tauriCompat.ts). Every channel in the namespace is covered; the
/// data channel is served, heavy/absent channels return Value::Null (honest
/// degrade — matches Electron's void returns for the non-list handlers).
pub fn dispatch(_app: &tauri::AppHandle, channel: &str, _args: &Value) -> Value {
    match channel {
        "session:list" => list_sessions(_app),

        // No Electron handler / no shape to mirror — honest null (see header).
        "session:getActive" => Value::Null,

        // Heavy: live BrowserWindow capture / restore / in-memory state mutation.
        // Not ported, not faked; Electron's restore returns bool and
        // update-state returns void — Null is the safe honest degrade.
        "session:save" | "session:restore" | "session:update-state" => Value::Null,

        _ => Value::Null,
    }
}

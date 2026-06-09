// =============================================================================
// DEX 6.0 — Vinx Presentation (Tauri port of src/main/core/VinxPresentationManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed Vinx presentation registry (vinx-presentation:* channels),
//! reading/writing the shared `dex.db` `vinx_presentations` table with the
//! identical schema, queries, and return shapes as the Electron manager
//! (Feature 25). The renderer-facing surface is five handlers:
//!   register / list / launch / close / remove
//! The DB-backed CRUD (register, list, remove) is ported faithfully. `launch`
//! and `close` drive a full-screen Electron BrowserWindow on the primary
//! display (window/screen/fs OS capabilities that do not exist in this pure DB
//! layer), so they degrade honestly (see the handler comments). The Tauri
//! command layer should own the real presenter window and call into the DB to
//! resolve the entry + bump play stats.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Create the vinx_presentations table + index (matches createTables verbatim).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS vinx_presentations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL DEFAULT 'Vinx',
            project_id TEXT NOT NULL,
            project_name TEXT NOT NULL,
            video_path TEXT NOT NULL,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            last_played TEXT,
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_vinx_pres_project ON vinx_presentations(project_id);",
    );
}

/// One row -> the PresentationEntry shape (column order matches `SELECT *` on the
/// table definition above, exactly as Electron's better-sqlite3 returned it).
/// `last_played` is nullable; all other columns are non-null.
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "project_id": row.get::<_, String>(2)?,
        "project_name": row.get::<_, String>(3)?,
        "video_path": row.get::<_, String>(4)?,
        "duration_ms": row.get::<_, i64>(5)?,
        "last_played": row.get::<_, Option<String>>(6)?,
        "play_count": row.get::<_, i64>(7)?,
        "created_at": row.get::<_, String>(8)?,
    }))
}

const SELECT_ALL: &str = "SELECT id, app, project_id, project_name, video_path, duration_ms, \
     last_played, play_count, created_at FROM vinx_presentations";

fn query_list(conn: &Connection, sql: &str, p: Vec<SqlValue>) -> Value {
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(rusqlite::params_from_iter(p), row_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// Fetch a single presentation row by id -> row JSON or null.
fn fetch_one(conn: &Connection, id: i64) -> Value {
    let sql = format!("{} WHERE id = ?", SELECT_ALL);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return Value::Null,
    };
    match stmt.query_row(params![id], row_to_json) {
        Ok(v) => v,
        Err(_) => Value::Null,
    }
}

/// vinx-presentation:register -> registerPresentation(projectId, projectName,
/// videoPath, durationMs=0). Returns the PresentationEntry row, or null when the
/// video file is missing (mirrors the `fs.existsSync` guard) or the insert fails.
/// Upserts on (project_id, video_path): if a matching row exists, updates
/// project_name + duration_ms and returns it; otherwise inserts a new row.
fn register(conn: &Connection, args: &Value) -> Value {
    let project_id = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let project_name = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let video_path = args.get(2).and_then(|v| v.as_str()).unwrap_or("");
    // durationMs defaults to 0 when the renderer omits it (TS default param).
    let duration_ms = args.get(3).and_then(|v| v.as_i64()).unwrap_or(0);

    // `fs.existsSync(videoPath)` — a pure filesystem existence check available
    // in std, ported faithfully (no new crate). Missing file -> null.
    if !std::path::Path::new(video_path).exists() {
        return Value::Null;
    }

    // Look for an existing row with the same project_id + video_path.
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM vinx_presentations WHERE project_id = ? AND video_path = ?",
            params![project_id, video_path],
            |r| r.get::<_, i64>(0),
        )
        .ok();

    if let Some(id) = existing {
        let _ = conn.execute(
            "UPDATE vinx_presentations SET project_name = ?, duration_ms = ? WHERE id = ?",
            params![project_name, duration_ms, id],
        );
        return fetch_one(conn, id);
    }

    let inserted = conn.execute(
        "INSERT INTO vinx_presentations (project_id, project_name, video_path, duration_ms)
         VALUES (?, ?, ?, ?)",
        params![project_id, project_name, video_path, duration_ms],
    );
    if inserted.is_err() {
        return Value::Null;
    }
    let id = conn.last_insert_rowid();
    fetch_one(conn, id)
}

/// vinx-presentation:list -> getPresentations(projectId?). When projectId is
/// provided, returns rows for that project ordered by created_at DESC; otherwise
/// returns up to 200 rows ordered by last_played DESC NULLS LAST, created_at DESC.
fn list(conn: &Connection, args: &Value) -> Value {
    let project_id = args.get(0).and_then(|v| v.as_str()).filter(|s| !s.is_empty());
    match project_id {
        Some(pid) => query_list(
            conn,
            &format!(
                "{} WHERE project_id = ? ORDER BY created_at DESC",
                SELECT_ALL
            ),
            vec![SqlValue::Text(pid.to_string())],
        ),
        None => query_list(
            conn,
            &format!(
                "{} ORDER BY last_played DESC NULLS LAST, created_at DESC LIMIT 200",
                SELECT_ALL
            ),
            Vec::new(),
        ),
    }
}

/// vinx-presentation:remove -> removePresentation(id). Returns boolean. The TS
/// returns `true` whenever the DB is present (it runs the DELETE and returns
/// true unconditionally), so this mirrors that: true on a successful execute.
fn remove(conn: &Connection, args: &Value) -> Value {
    let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
    let ok = conn
        .execute("DELETE FROM vinx_presentations WHERE id = ?", params![id])
        .is_ok();
    json!(ok)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "vinx-presentation:register" => register(conn, args),
        "vinx-presentation:list" => list(conn, args),
        "vinx-presentation:remove" => remove(conn, args),

        // launchPresentation creates a frameless, full-screen Electron
        // BrowserWindow on the primary display, loads a generated data: URL
        // video player, and bumps last_played/play_count. The window + screen
        // (display sizing) capabilities live in the Tauri window layer, not in
        // these pure DB functions, so it degrades honestly. The Tauri command
        // layer should open the real presenter window; it can resolve the entry
        // and run the `UPDATE vinx_presentations SET last_played = datetime('now'),
        // play_count = play_count + 1 WHERE id = ?` stats bump itself.
        "vinx-presentation:launch" => json!({
            "success": false,
            "error": "presenter window/screen not available in DB layer (not ported)"
        }),

        // closePresentation closes the presenter BrowserWindow — a window
        // capability outside this DB layer. Void in Electron; degrade honestly.
        "vinx-presentation:close" => json!({
            "success": false,
            "error": "presenter window not available in DB layer (not ported)"
        }),

        _ => Value::Null,
    }
}

// =============================================================================
// DEX 6.0 — Project Lock (Tauri port of src/main/core/ProjectLockManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed project lock system (project-lock:* channels), reading/writing
//! the shared `dex.db` `project_locks` table with the identical schema, queries,
//! and return shapes as the Electron manager (Feature 35). Locks are entirely
//! DB-persisted (there is no in-memory lock state on the manager), so every
//! handler is ported faithfully. The `lock`/`unlock` handlers in Electron also
//! emit on the event bus and push a `project-lock:changed` event to the renderer
//! — those are Electron-internal side effects, not part of the IPC return value,
//! so the renderer-facing surface (the DB write + returned row/bool) is ported
//! here as-is.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Create the project_locks table + index (matches ProjectLockManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS project_locks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            project_id TEXT NOT NULL,
            project_name TEXT NOT NULL DEFAULT '',
            locked_by TEXT NOT NULL DEFAULT 'user',
            reason TEXT NOT NULL DEFAULT '',
            locked_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(app, project_id)
        );
        CREATE INDEX IF NOT EXISTS idx_project_locks_app ON project_locks(app);",
    );
}

/// One row -> the ProjectLock shape (snake_case keys, exactly as `SELECT *`
/// returned it under Electron's better-sqlite3, in table-definition order).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "project_id": row.get::<_, String>(2)?,
        "project_name": row.get::<_, String>(3)?,
        "locked_by": row.get::<_, String>(4)?,
        "reason": row.get::<_, String>(5)?,
        "locked_at": row.get::<_, String>(6)?,
    }))
}

const SELECT_ALL: &str =
    "SELECT id, app, project_id, project_name, locked_by, reason, locked_at FROM project_locks";

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

/// getLock(app, projectId) -> the ProjectLock row or null.
fn get_lock(conn: &Connection, app: &str, project_id: &str) -> Value {
    let sql = format!("{} WHERE app = ? AND project_id = ?", SELECT_ALL);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return Value::Null,
    };
    match stmt.query_row(params![app, project_id], row_to_json) {
        Ok(v) => v,
        Err(_) => Value::Null,
    }
}

/// isLocked(app, projectId) -> bool (existence check).
fn is_locked(conn: &Connection, app: &str, project_id: &str) -> bool {
    let exists: rusqlite::Result<i64> = conn.query_row(
        "SELECT id FROM project_locks WHERE app = ? AND project_id = ?",
        params![app, project_id],
        |r| r.get(0),
    );
    exists.is_ok()
}

/// lock(app, projectId, projectName, reason='', lockedBy='user') -> the stored
/// ProjectLock row or null. If already locked, returns the existing row (matches
/// the `if (existing) return existing` guard); the lockedBy default is 'user'.
fn lock(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let project_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let project_name = args.get(2).and_then(|v| v.as_str()).unwrap_or("");
    // reason defaults to '' when the renderer omits it (TS default param).
    let reason = args.get(3).and_then(|v| v.as_str()).unwrap_or("");
    // The IPC handler never passes lockedBy, so it always takes the 'user' default.
    let locked_by = "user";

    // already locked -> return existing row unchanged.
    let existing = get_lock(conn, app, project_id);
    if !existing.is_null() {
        return existing;
    }

    let inserted = conn.execute(
        "INSERT INTO project_locks (app, project_id, project_name, locked_by, reason)
         VALUES (?, ?, ?, ?, ?)",
        params![app, project_id, project_name, locked_by, reason],
    );
    if inserted.is_err() {
        return Value::Null;
    }

    let id = conn.last_insert_rowid();
    // Electron also emits on the event bus and pushes `project-lock:changed` to
    // the renderer here; those are internal side effects, not part of the IPC
    // return value, so they are intentionally not replicated (not ported).
    let sql = format!("{} WHERE id = ?", SELECT_ALL);
    conn.query_row(&sql, params![id], row_to_json)
        .unwrap_or(Value::Null)
}

/// unlock(app, projectId) -> bool (changes > 0).
fn unlock(conn: &Connection, app: &str, project_id: &str) -> bool {
    let changes = conn
        .execute(
            "DELETE FROM project_locks WHERE app = ? AND project_id = ?",
            params![app, project_id],
        )
        .unwrap_or(0);
    // The `project-lock:changed` push + event-bus emit are Electron-internal
    // side effects, not part of the return value (not ported).
    changes > 0
}

/// getLockedCount(app?) -> number. Per-app when `app` is provided, else global.
fn get_locked_count(conn: &Connection, app: Option<&str>) -> i64 {
    match app {
        Some(a) => conn
            .query_row(
                "SELECT COUNT(*) as cnt FROM project_locks WHERE app = ?",
                params![a],
                |r| r.get(0),
            )
            .unwrap_or(0),
        None => conn
            .query_row("SELECT COUNT(*) as cnt FROM project_locks", [], |r| {
                r.get(0)
            })
            .unwrap_or(0),
    }
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    match channel {
        "project-lock:lock" => lock(conn, args),
        "project-lock:unlock" => json!(unlock(conn, &s(0), &s(1))),
        "project-lock:isLocked" => json!(is_locked(conn, &s(0), &s(1))),
        "project-lock:getLock" => get_lock(conn, &s(0), &s(1)),
        // getAll takes an optional `app`; provided -> per-app DESC, else all DESC.
        "project-lock:getAll" => match args.get(0).and_then(|v| v.as_str()) {
            Some(a) => query_list(
                conn,
                &format!("{} WHERE app = ? ORDER BY locked_at DESC", SELECT_ALL),
                vec![SqlValue::Text(a.to_string())],
            ),
            None => query_list(
                conn,
                &format!("{} ORDER BY locked_at DESC", SELECT_ALL),
                Vec::new(),
            ),
        },
        // getCount takes an optional `app`; absent/non-string -> global count.
        "project-lock:getCount" => json!(get_locked_count(conn, args.get(0).and_then(|v| v.as_str()))),
        // toggle(app, projectId, projectName, reason='') -> bool. Unlocks if
        // currently locked, otherwise locks; returns the underlying op's bool
        // (lock() coerced via `!!` -> whether a row resulted).
        "project-lock:toggle" => {
            let app = s(0);
            let project_id = s(1);
            if is_locked(conn, &app, &project_id) {
                json!(unlock(conn, &app, &project_id))
            } else {
                let row = lock(conn, args);
                json!(!row.is_null())
            }
        }
        _ => Value::Null,
    }
}

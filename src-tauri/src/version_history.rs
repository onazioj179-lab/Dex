// =============================================================================
// DEX 6.0 — Version History (Tauri port of src/main/core/VersionHistoryManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed per-project version history (version-history:* channels),
//! reading/writing the shared `dex.db` `version_history` table with the
//! identical schema, queries, and return shapes as the Electron manager.
//!
//! Snapshot compression: the `snapshot` BLOB is the project state JSON run
//! through zlib deflate (and read back with inflate), via the shared
//! [`crate::zlib`] helpers — byte-compatible with the Electron manager's
//! `zlib.deflateSync`/`inflateSync`, so databases written by either shell
//! round-trip in the other. All channels (`save`, `getState`, `restore`,
//! `getVersions`, `delete`, `markDirty`, `getStats`) are ported faithfully.

use crate::zlib;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Max versions retained per (app, project_id) — matches MAX_VERSIONS_PER_PROJECT.
const MAX_VERSIONS_PER_PROJECT: i64 = 50;

/// Create the version_history table + indexes (matches DatabaseManager schema).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS version_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            project_id TEXT NOT NULL,
            project_name TEXT NOT NULL,
            snapshot BLOB NOT NULL,
            size INTEGER NOT NULL DEFAULT 0,
            timestamp INTEGER NOT NULL,
            auto_saved INTEGER DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_version_history_project ON version_history(app, project_id);
        CREATE INDEX IF NOT EXISTS idx_version_history_timestamp ON version_history(timestamp);",
    );
}

/// One row -> the VersionRecord shape (metadata only, no snapshot). Column order
/// matches the `getVersions` SELECT exactly, snake_case as Electron returned it.
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "project_id": row.get::<_, String>(2)?,
        "project_name": row.get::<_, String>(3)?,
        "size": row.get::<_, i64>(4)?,
        "timestamp": row.get::<_, i64>(5)?,
        "auto_saved": row.get::<_, i64>(6)?,
    }))
}

/// version-history:getVersions — getVersions(appName, projectId). Returns
/// VersionRecord[] (metadata, no snapshot) ordered by timestamp DESC.
fn get_versions(conn: &Connection, app: &str, project_id: &str) -> Value {
    let sql = "SELECT id, app, project_id, project_name, size, timestamp, auto_saved \
               FROM version_history WHERE app = ? AND project_id = ? \
               ORDER BY timestamp DESC";
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(params![app, project_id], row_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// version-history:save — saveVersion(appName, projectId, projectName, state,
/// autoSaved). Deflates the state JSON into the snapshot BLOB, inserts the row,
/// trims to MAX_VERSIONS_PER_PROJECT oldest-first, and returns the new row id
/// (Electron returns Number(lastInsertRowid); -1 on failure).
fn save_version(
    conn: &Connection,
    app: &str,
    project_id: &str,
    project_name: &str,
    state: &Value,
    auto_saved: bool,
) -> i64 {
    let json_str = state.to_string();
    let compressed = zlib::deflate(json_str.as_bytes());
    let size = compressed.len() as i64;
    let now = current_millis();
    let inserted = conn.execute(
        "INSERT INTO version_history (app, project_id, project_name, snapshot, size, timestamp, auto_saved) \
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        params![app, project_id, project_name, compressed, size, now, if auto_saved { 1 } else { 0 }],
    );
    if inserted.is_err() {
        return -1;
    }
    let id = conn.last_insert_rowid();
    enforce_version_limit(conn, app, project_id);
    id
}

/// Trim a project's history to MAX_VERSIONS_PER_PROJECT, deleting the oldest
/// rows first (matches enforceVersionLimit).
fn enforce_version_limit(conn: &Connection, app: &str, project_id: &str) {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM version_history WHERE app = ? AND project_id = ?",
            params![app, project_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if count > MAX_VERSIONS_PER_PROJECT {
        let excess = count - MAX_VERSIONS_PER_PROJECT;
        let _ = conn.execute(
            "DELETE FROM version_history WHERE id IN ( \
                SELECT id FROM version_history WHERE app = ? AND project_id = ? \
                ORDER BY timestamp ASC LIMIT ? \
            )",
            params![app, project_id, excess],
        );
    }
}

/// version-history:getState — getVersionState(versionId). Inflates the snapshot
/// BLOB back to the state object; null when the row is missing or the BLOB does
/// not decompress/parse (Electron logs and returns null on that path).
fn get_version_state(conn: &Connection, version_id: i64) -> Value {
    let blob: Option<Vec<u8>> = conn
        .query_row(
            "SELECT snapshot FROM version_history WHERE id = ?",
            params![version_id],
            |r| r.get(0),
        )
        .ok();
    let blob = match blob {
        Some(b) => b,
        None => return Value::Null,
    };
    match zlib::inflate(&blob) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    }
}

/// version-history:restore — restoreVersion(appName, projectId, versionId,
/// currentState). Backs up the current state as a new (manual) version, then
/// returns { restored, backupVersionId } with the decompressed snapshot — or
/// null when the version row is missing (matches the TS flow, including taking
/// the backup before attempting the decompress).
fn restore_version(
    conn: &Connection,
    app: &str,
    project_id: &str,
    version_id: i64,
    current_state: &Value,
) -> Value {
    let record: Option<(String, Vec<u8>)> = conn
        .query_row(
            "SELECT project_name, snapshot FROM version_history WHERE id = ?",
            params![version_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();
    let (project_name, snapshot) = match record {
        Some(r) => r,
        None => return Value::Null,
    };
    let backup_version_id = save_version(conn, app, project_id, &project_name, current_state, false);
    let restored = match zlib::inflate(&snapshot) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or(Value::Null),
        Err(_) => Value::Null,
    };
    json!({ "restored": restored, "backupVersionId": backup_version_id })
}

/// Wall-clock milliseconds since the Unix epoch (Date.now() equivalent).
fn current_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// version-history:delete — deleteVersion(versionId). Returns boolean. The TS
/// returns `true` unconditionally when a DB is present.
fn delete_version(conn: &Connection, version_id: i64) -> Value {
    let _ = conn.execute(
        "DELETE FROM version_history WHERE id = ?",
        params![version_id],
    );
    json!(true)
}

/// version-history:getStats — getProjectStats(appName, projectId). Returns the
/// remapped camelCase shape { count, totalSize, oldest, newest } with
/// oldest/newest nullable (MIN/MAX over an empty set yield NULL).
fn get_stats(conn: &Connection, app: &str, project_id: &str) -> Value {
    let sql = "SELECT COUNT(*) as c, COALESCE(SUM(size), 0) as s, \
               MIN(timestamp) as oldest, MAX(timestamp) as newest \
               FROM version_history WHERE app = ? AND project_id = ?";
    let row = conn.query_row(sql, params![app, project_id], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, i64>(1)?,
            r.get::<_, Option<i64>>(2)?,
            r.get::<_, Option<i64>>(3)?,
        ))
    });
    match row {
        Ok((count, total_size, oldest, newest)) => json!({
            "count": count,
            "totalSize": total_size,
            "oldest": oldest,
            "newest": newest,
        }),
        // Matches the TS no-db early return shape.
        Err(_) => json!({
            "count": 0,
            "totalSize": 0,
            "oldest": Value::Null,
            "newest": Value::Null,
        }),
    }
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    match channel {
        "version-history:getVersions" => get_versions(conn, &s(0), &s(1)),

        "version-history:delete" => {
            let version_id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            delete_version(conn, version_id)
        }

        // markDirty mutates an in-memory dirty-projects Set (no DB) and the TS
        // handler returns `true` unconditionally. The auto-save scheduling that
        // consumes that Set is Electron runtime state, not an IPC channel, so we
        // mirror the literal return value (no DB side effect to replicate).
        "version-history:markDirty" => json!(true),

        "version-history:getStats" => get_stats(conn, &s(0), &s(1)),

        // save(appName, projectId, projectName, state, autoSaved) -> number
        // (the new row id; -1 on failure), matching the Electron return.
        "version-history:save" => {
            let state = args.get(3).cloned().unwrap_or(Value::Null);
            let auto_saved = args.get(4).and_then(|v| v.as_bool()).unwrap_or(false);
            json!(save_version(conn, &s(0), &s(1), &s(2), &state, auto_saved))
        }

        // getState(versionId) -> the decompressed state object, or null.
        "version-history:getState" => {
            let version_id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            get_version_state(conn, version_id)
        }

        // restore(appName, projectId, versionId, currentState) ->
        // { restored, backupVersionId } or null.
        "version-history:restore" => {
            let version_id = args.get(2).and_then(|v| v.as_i64()).unwrap_or(0);
            let current_state = args.get(3).cloned().unwrap_or(Value::Null);
            restore_version(conn, &s(0), &s(1), version_id, &current_state)
        }

        _ => Value::Null,
    }
}

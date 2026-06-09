// =============================================================================
// DEX 6.0 — Project Archiver (Tauri port of src/main/core/ProjectArchiverManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed project archiver (project-archiver:* channels, Feature 11),
//! reading/writing the shared `dex.db` `project_archive` table with the identical
//! schema, queries, and return shapes as the Electron manager. The archive/
//! unarchive flows compress project JSON to a `.dex-archive` file under the
//! Electron userData `archive` dir (zlib deflate/inflate + fs read/write/unlink)
//! and getArchiveDir returns that native path — OS/filesystem capabilities that
//! live in the Tauri layer, not these pure DB functions — so they degrade
//! honestly. The pure DB read (getAll) and the pure in-memory eligibility filter
//! (getEligible) are ported faithfully.

use rusqlite::types::Value as SqlValue;
use rusqlite::{Connection, Row};
use serde_json::{json, Value};

/// Create the project_archive table + index (matches ProjectArchiverManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS project_archive (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            project_name TEXT NOT NULL,
            archive_path TEXT NOT NULL,
            original_data TEXT NOT NULL,
            archived_at INTEGER NOT NULL,
            size INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_project_archive_app ON project_archive(app);",
    );
}

/// One row -> the ArchiveRecord shape (snake_case keys, column order matches
/// `SELECT *` on the table definition above, exactly as Electron's better-sqlite3
/// returned it).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "project_name": row.get::<_, String>(2)?,
        "archive_path": row.get::<_, String>(3)?,
        "original_data": row.get::<_, String>(4)?,
        "archived_at": row.get::<_, i64>(5)?,
        "size": row.get::<_, i64>(6)?,
    }))
}

const SELECT_ALL: &str =
    "SELECT id, app, project_name, archive_path, original_data, archived_at, size FROM project_archive";

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

/// project-archiver:getAll -> getArchivedProjects(appFilter?): ArchiveRecord[].
/// Filters by app when a non-empty string is supplied, ordered by archived_at DESC.
fn get_all(conn: &Connection, app_filter: Option<&str>) -> Value {
    match app_filter {
        Some(app) => query_list(
            conn,
            &format!("{} WHERE app = ? ORDER BY archived_at DESC", SELECT_ALL),
            vec![SqlValue::Text(app.to_string())],
        ),
        None => query_list(
            conn,
            &format!("{} ORDER BY archived_at DESC", SELECT_ALL),
            Vec::new(),
        ),
    }
}

/// project-archiver:getEligible -> getEligibleProjects(appName, projects):
/// pure in-memory filter (no DB, no fs) returning [{ id, name }] for every
/// project last modified before the 90-day cutoff (matches the TS verbatim).
fn get_eligible(args: &Value) -> Value {
    let cutoff = current_millis() - (90 * 86_400_000_i64);
    let projects = match args.get(1).and_then(|v| v.as_array()) {
        Some(p) => p,
        None => return json!([]),
    };
    let out: Vec<Value> = projects
        .iter()
        .filter(|p| {
            p.get("lastModified")
                .and_then(|v| v.as_i64())
                .map(|lm| lm < cutoff)
                .unwrap_or(false)
        })
        .map(|p| {
            json!({
                "id": p.get("id").cloned().unwrap_or(Value::Null),
                "name": p.get("name").cloned().unwrap_or(Value::Null),
            })
        })
        .collect();
    json!(out)
}

/// Wall-clock milliseconds since the Unix epoch (Date.now() equivalent).
fn current_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        // archive opens the userData `archive` dir, zlib-deflates the project
        // JSON, and fs-writes a `.dex-archive` file before recording the row —
        // a compression + filesystem capability that lives in the Tauri layer,
        // not these pure DB functions. Degrade honestly rather than insert a
        // row pointing at a file that was never written.
        "project-archiver:archive" => json!({
            "success": false,
            "error": "zlib compression + archive file write not available in DB layer (not ported)"
        }),
        // unarchive fs-reads + inflates the `.dex-archive` file and unlinks it
        // before deleting the row — the same filesystem/decompression capability.
        // Degrade honestly rather than fabricate the restored project data.
        "project-archiver:unarchive" => json!({
            "success": false,
            "error": "archive file read + zlib decompression not available in DB layer (not ported)"
        }),
        "project-archiver:getAll" => {
            get_all(conn, args.get(0).and_then(|v| v.as_str()))
        }
        "project-archiver:getEligible" => get_eligible(args),
        // getArchiveDir returns the native Electron userData/archive path, which
        // is resolved by the OS shell rather than the DB layer. Degrade honestly.
        "project-archiver:getArchiveDir" => json!({
            "success": false,
            "error": "native archive directory path not available in DB layer (not ported)"
        }),
        _ => Value::Null,
    }
}

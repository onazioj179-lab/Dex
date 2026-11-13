// =============================================================================
// DEX 6.0 — Project Archiver (Tauri port of src/main/core/ProjectArchiverManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed project archiver (project-archiver:* channels, Feature 11),
//! reading/writing the shared `dex.db` `project_archive` table with the identical
//! schema, queries, and return shapes as the Electron manager. Fully ported:
//! archive/unarchive compress project JSON to a `.dex-archive` file under the
//! app data `archive` dir (the Tauri analog of Electron's userData) via the
//! shared [`crate::zlib`] helpers — files written by either shell round-trip in
//! the other — and getArchiveDir returns that native path. The dispatcher passes
//! the archive dir in alongside the shared connection.

use crate::zlib;
use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};
use std::path::Path;

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

/// project-archiver:archive -> archiveProject(appName, projectName, projectData):
/// deflate the project JSON to `<app>_<safeName>_<now>.dex-archive` under the
/// archive dir, record the row, and return the ArchiveRecord — or null on any
/// write/insert failure (the TS catch path).
fn archive_project(
    conn: &Connection,
    archive_dir: &Path,
    app: &str,
    project_name: &str,
    project_data: &Value,
) -> Value {
    let compressed = zlib::deflate(project_data.to_string().as_bytes());
    let safe_name: String = project_name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .take(50)
        .collect();
    let now = current_millis();
    let filename = format!("{}_{}_{}.dex-archive", app, safe_name, now);
    if std::fs::create_dir_all(archive_dir).is_err() {
        return Value::Null;
    }
    let archive_path = archive_dir.join(filename);
    if crate::write_atomic(&archive_path, &compressed).is_err() {
        return Value::Null;
    }
    let archive_path_str = archive_path.to_string_lossy().to_string();
    let size = compressed.len() as i64;
    let inserted = conn.execute(
        "INSERT INTO project_archive (app, project_name, archive_path, original_data, archived_at, size) \
         VALUES (?, ?, ?, ?, ?, ?)",
        params![app, project_name, archive_path_str, "compressed-file", now, size],
    );
    if inserted.is_err() {
        return Value::Null;
    }
    json!({
        "id": conn.last_insert_rowid(),
        "app": app,
        "project_name": project_name,
        "archive_path": archive_path_str,
        "original_data": "compressed-file",
        "archived_at": now,
        "size": size,
    })
}

/// project-archiver:unarchive -> unarchiveProject(archiveId): read + inflate the
/// `.dex-archive` file, unlink it, delete the row, and return
/// { app, projectName, data }. A row whose file is gone is cleaned up and yields
/// null; missing rows and read/inflate failures yield null (the TS catch path).
fn unarchive_project(conn: &Connection, archive_id: i64) -> Value {
    let record: Option<(String, String, String)> = conn
        .query_row(
            "SELECT app, project_name, archive_path FROM project_archive WHERE id = ?",
            params![archive_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();
    let (app, project_name, archive_path) = match record {
        Some(r) => r,
        None => return Value::Null,
    };
    let path = Path::new(&archive_path);
    if !path.exists() {
        let _ = conn.execute("DELETE FROM project_archive WHERE id = ?", params![archive_id]);
        return Value::Null;
    }
    let project_data = match std::fs::read(path)
        .ok()
        .and_then(|compressed| zlib::inflate(&compressed).ok())
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
    {
        Some(v) => v,
        None => return Value::Null,
    };
    let _ = std::fs::remove_file(path);
    let _ = conn.execute("DELETE FROM project_archive WHERE id = ?", params![archive_id]);
    json!({
        "app": app,
        "projectName": project_name,
        "data": project_data,
    })
}

pub fn dispatch(conn: &Connection, archive_dir: &Path, channel: &str, args: &Value) -> Value {
    match channel {
        "project-archiver:archive" => {
            let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let project_name = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let project_data = args.get(2).cloned().unwrap_or(Value::Null);
            archive_project(conn, archive_dir, app, project_name, &project_data)
        }
        "project-archiver:unarchive" => {
            let archive_id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            unarchive_project(conn, archive_id)
        }
        "project-archiver:getAll" => {
            get_all(conn, args.get(0).and_then(|v| v.as_str()))
        }
        "project-archiver:getEligible" => get_eligible(args),
        // getArchiveDir -> the native archive dir path (Electron: userData/archive;
        // Tauri: app_data_dir/archive).
        "project-archiver:getArchiveDir" => json!(archive_dir.to_string_lossy()),
        _ => Value::Null,
    }
}

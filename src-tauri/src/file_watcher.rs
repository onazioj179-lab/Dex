// =============================================================================
// DEX 6.0 — File Watcher (Tauri port of src/main/core/FileWatcherManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed watched-folder configuration (file-watcher:* channels),
//! reading/writing the shared `dex.db` `watched_folders` table with the
//! identical schema, queries, and return shapes as the Electron manager
//! (Feature 22).
//!
//! The Electron manager also runs a live `fs.watch` over each configured
//! folder, auto-imports/notifies on new media files, and selects the folder via
//! a native `dialog.showOpenDialog`. None of that filesystem/dialog machinery
//! is reachable from this pure DB layer:
//!   - `file-watcher:addFolder` takes its folder path exclusively from the OS
//!     directory picker (there is no path argument) and then starts a live
//!     watcher, so it degrades honestly rather than fabricating a path/watch.
//!   - `file-watcher:importFile` needs `fs.statSync` for the file size before
//!     inserting into `media_library`, so it degrades honestly.
//!
//! The DB-backed config reads (`getFolders`) and the persisted delete
//! (`removeFolder`) are ported faithfully; the live-watcher teardown that
//! `removeFolder` also performs is simply absent here (no watcher exists), which
//! is honest degradation of the side effect, not of the persisted return value.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Create the watched_folders table (CREATE TABLE copied verbatim from
/// FileWatcherManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS watched_folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_path TEXT NOT NULL UNIQUE,
            file_types TEXT NOT NULL DEFAULT 'all',
            import_behavior TEXT NOT NULL DEFAULT 'notify-only',
            created_at INTEGER NOT NULL
        );",
    );
}

/// One row -> the WatchedFolder shape (matches `SELECT *` column order/casing
/// under Electron; all columns non-null).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "folder_path": row.get::<_, String>(1)?,
        "file_types": row.get::<_, String>(2)?,
        "import_behavior": row.get::<_, String>(3)?,
        "created_at": row.get::<_, i64>(4)?,
    }))
}

const SELECT_ALL: &str =
    "SELECT id, folder_path, file_types, import_behavior, created_at FROM watched_folders";

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

/// getWatchedFolders() -> WatchedFolder[]. Pure DB.
fn get_folders(conn: &Connection) -> Value {
    let sql = format!("{} ORDER BY created_at DESC", SELECT_ALL);
    query_list(conn, &sql, Vec::new())
}

/// removeWatchedFolder(id) -> boolean. The live watcher teardown is a no-op here
/// (no watcher exists in this pure DB layer); the persisted DELETE and the
/// boolean return are ported faithfully.
fn remove_folder(conn: &Connection, id: i64) -> Value {
    let _ = conn.execute("DELETE FROM watched_folders WHERE id = ?", params![id]);
    json!(true)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        // getWatchedFolders() -> WatchedFolder[].
        "file-watcher:getFolders" => get_folders(conn),

        // removeWatchedFolder(id) -> boolean.
        "file-watcher:removeFolder" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            remove_folder(conn, id)
        }

        // addWatchedFolder(importBehavior?, fileTypes?) -> WatchedFolder | null.
        // The folder path comes exclusively from the native
        // `dialog.showOpenDialog` directory picker (there is no path argument),
        // and the manager then spins up a live `fs.watch`. Neither the dialog
        // nor the watcher is available from this pure DB layer, so we degrade
        // honestly rather than fabricating a watched path/folder row.
        "file-watcher:addFolder" => json!({
            "success": false,
            "error": "addFolder requires the native directory picker + live fs.watch (not ported)"
        }),

        // importFile(filepath, filename) -> void. Requires `fs.statSync` to read
        // the file size before inserting into media_library; the filesystem is
        // not reachable from this DB layer, so we degrade honestly.
        "file-watcher:importFile" => json!({
            "success": false,
            "error": "importFile requires filesystem stat of the source file (not ported)"
        }),

        _ => Value::Null,
    }
}

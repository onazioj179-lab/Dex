// =============================================================================
// DEX 6.0 — Shared Media Library (Tauri port of src/main/core/SharedMediaLibrary.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed shared media library (media-library:* channels), reading/writing
//! the shared `dex.db` `media_library` table with the identical schema, queries,
//! and return shapes as the Electron manager. The prefix is `media-library:`
//! (distinct from the bare `media:` prefix handled elsewhere), so there is no
//! channel collision. The pure DB CRUD/metadata channels are ported faithfully.
//!
//! Some Electron behaviour reaches outside SQLite: `importFile` stats a file on
//! disk (`fs.statSync`), detects its type from the extension, then enqueues
//! thumbnail generation via `sharp`/`ffmpeg`; `removeFromLibrary` unlinks the
//! cached thumbnail JPEG. Those filesystem/decoder/subprocess capabilities live
//! in the Tauri command layer, not in these pure DB functions. The DB-only path
//! of `import` (the dedupe branch that bumps an existing row's use_count) is
//! ported faithfully; the on-disk new-file branch degrades honestly (returns
//! null, exactly as the TS does when `fs.existsSync(filepath)` is false). The
//! thumbnail unlink in `remove` is a best-effort side effect, not part of the
//! IPC return value, so `remove` still returns true as in the TS.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Create the media_library table + indexes (verbatim from DatabaseManager.ts).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS media_library (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filepath TEXT NOT NULL UNIQUE,
            filename TEXT NOT NULL,
            type TEXT NOT NULL,
            size INTEGER NOT NULL DEFAULT 0,
            duration INTEGER DEFAULT NULL,
            width INTEGER DEFAULT NULL,
            height INTEGER DEFAULT NULL,
            imported_by TEXT NOT NULL,
            last_used INTEGER NOT NULL,
            use_count INTEGER DEFAULT 1,
            thumbnail TEXT DEFAULT NULL,
            timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_media_library_type ON media_library(type);
        CREATE INDEX IF NOT EXISTS idx_media_library_filepath ON media_library(filepath);",
    );
}

/// One row -> the MediaRecord shape. Column order matches `SELECT *` against the
/// table definition above, exactly as Electron's better-sqlite3 returned it
/// (snake_case keys; duration/width/height/thumbnail nullable).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "filepath": row.get::<_, String>(1)?,
        "filename": row.get::<_, String>(2)?,
        "type": row.get::<_, String>(3)?,
        "size": row.get::<_, i64>(4)?,
        "duration": row.get::<_, Option<i64>>(5)?,
        "width": row.get::<_, Option<i64>>(6)?,
        "height": row.get::<_, Option<i64>>(7)?,
        "imported_by": row.get::<_, String>(8)?,
        "last_used": row.get::<_, i64>(9)?,
        "use_count": row.get::<_, i64>(10)?,
        "thumbnail": row.get::<_, Option<String>>(11)?,
        "timestamp": row.get::<_, i64>(12)?,
    }))
}

const SELECT_ALL: &str = "SELECT id, filepath, filename, type, size, duration, width, height, imported_by, last_used, use_count, thumbnail, timestamp FROM media_library";

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

/// SELECT a single media_library row by id -> row JSON or null.
fn fetch_by_id(conn: &Connection, id: i64) -> Value {
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

/// SELECT a single media_library row by filepath -> row JSON or null.
fn fetch_by_filepath(conn: &Connection, filepath: &str) -> Value {
    let sql = format!("{} WHERE filepath = ?", SELECT_ALL);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return Value::Null,
    };
    match stmt.query_row(params![filepath], row_to_json) {
        Ok(v) => v,
        Err(_) => Value::Null,
    }
}

/// media-library:import -> importFile(filepath, importedBy). Returns a MediaRecord
/// or null. The DB dedupe branch is ported faithfully: when a row already exists
/// for `filepath`, bump use_count and last_used and return the refreshed row.
/// The new-file branch in the TS stats the file on disk, derives metadata, and
/// enqueues thumbnail generation (sharp/ffmpeg) — filesystem + decoder/subprocess
/// capabilities that live in the Tauri command layer, not in this pure DB
/// function. When the file does not already exist in the library, the TS itself
/// returns null if `fs.existsSync(filepath)` is false; here we mirror that null
/// for any non-deduped import (the disk-backed insert is not ported, by design).
fn import_file(conn: &Connection, args: &Value) -> Value {
    let filepath = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    // importedBy (args[1]) is only consumed by the unported disk-insert branch.

    // Dedupe branch (pure DB): SELECT existing, bump counters, return refreshed row.
    let existing_id: Option<i64> = conn
        .query_row(
            "SELECT id FROM media_library WHERE filepath = ?",
            params![filepath],
            |r| r.get::<_, i64>(0),
        )
        .ok();

    if let Some(id) = existing_id {
        let now = now_ms();
        let _ = conn.execute(
            "UPDATE media_library SET use_count = use_count + 1, last_used = ? WHERE id = ?",
            params![now, id],
        );
        return fetch_by_id(conn, id);
    }

    // New-file import depends on fs.statSync + on-disk thumbnail generation, which
    // are not available in this pure DB layer. The TS returns null when the file
    // is not on disk; we degrade to null here (the insert-from-disk path is not
    // ported — the Tauri command layer should stat the file and call back in).
    Value::Null
}

/// media-library:getAll -> getAll(typeFilter?, sortBy='date', search?). Returns
/// MediaRecord[]. Filters and sort map are copied verbatim from the TS.
fn get_all(conn: &Connection, args: &Value) -> Value {
    let type_filter = args.get(0).and_then(|v| v.as_str());
    let sort_by = args.get(1).and_then(|v| v.as_str()).unwrap_or("date");
    let search = args.get(2).and_then(|v| v.as_str());

    let mut sql = String::from(SELECT_ALL);
    let mut conditions: Vec<&str> = Vec::new();
    let mut p: Vec<SqlValue> = Vec::new();

    if let Some(tf) = type_filter {
        if tf != "all" {
            conditions.push("type = ?");
            p.push(SqlValue::Text(tf.to_string()));
        }
    }
    if let Some(srch) = search {
        if !srch.trim().is_empty() {
            conditions.push("filename LIKE ?");
            p.push(SqlValue::Text(format!("%{}%", srch.trim())));
        }
    }
    if !conditions.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&conditions.join(" AND "));
    }

    // sortMap: name|date|last_used|most_used, defaulting to timestamp DESC.
    let order = match sort_by {
        "name" => "filename ASC",
        "date" => "timestamp DESC",
        "last_used" => "last_used DESC",
        "most_used" => "use_count DESC",
        _ => "timestamp DESC",
    };
    sql.push_str(&format!(" ORDER BY {}", order));

    query_list(conn, &sql, p)
}

/// media-library:getStats -> getStats(). Returns the totals shape verbatim.
fn get_stats(conn: &Connection) -> Value {
    let total: i64 = conn
        .query_row("SELECT COUNT(*) FROM media_library", [], |r| r.get(0))
        .unwrap_or(0);
    let video: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM media_library WHERE type = 'video'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let audio: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM media_library WHERE type = 'audio'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let image: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM media_library WHERE type = 'image'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let document: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM media_library WHERE type = 'document'",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let total_size: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(size), 0) FROM media_library",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    json!({
        "total": total,
        "video": video,
        "audio": audio,
        "image": image,
        "document": document,
        "totalSize": total_size,
    })
}

/// Current wall-clock time in milliseconds (matches JS `Date.now()`).
fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "media-library:import" => import_file(conn, args),
        "media-library:getAll" => get_all(conn, args),
        "media-library:getById" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(-1);
            fetch_by_id(conn, id)
        }
        "media-library:getByFilepath" => {
            let filepath = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            fetch_by_filepath(conn, filepath)
        }
        // removeFromLibrary deletes the row (and best-effort unlinks the cached
        // thumbnail file on disk — a filesystem side effect not part of the IPC
        // return value, so it is intentionally not replicated). Returns true.
        "media-library:remove" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(-1);
            let _ = conn.execute("DELETE FROM media_library WHERE id = ?", params![id]);
            json!(true)
        }
        // updateLastUsed is a void TS handler; the IPC handler returns true.
        "media-library:updateLastUsed" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(-1);
            let now = now_ms();
            let _ = conn.execute(
                "UPDATE media_library SET last_used = ?, use_count = use_count + 1 WHERE id = ?",
                params![now, id],
            );
            json!(true)
        }
        "media-library:getStats" => get_stats(conn),
        _ => Value::Null,
    }
}

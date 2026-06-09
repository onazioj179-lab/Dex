// =============================================================================
// DEX 6.0 — Version History (Tauri port of src/main/core/VersionHistoryManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed per-project version history (version-history:* channels),
//! reading/writing the shared `dex.db` `version_history` table with the
//! identical schema, queries, and return shapes as the Electron manager.
//!
//! IMPORTANT — snapshot compression: under Electron the `snapshot` BLOB is the
//! project state JSON run through `zlib.deflateSync` (and read back with
//! `zlib.inflateSync`). rusqlite 0.31 has no zlib, and no new crates may be
//! added, so the three channels that depend on (de)compressing that BLOB —
//! `save`, `getState`, and `restore` — degrade honestly here rather than write
//! an incompatible BLOB or return corrupt state. The Tauri command layer is the
//! right place to wire a real zlib implementation and call back into these DB
//! helpers. Every pure-DB channel (`getVersions`, `delete`, `markDirty`,
//! `getStats`) is ported faithfully.

use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Max versions retained per (app, project_id) — matches MAX_VERSIONS_PER_PROJECT.
/// Used by the zlib-backed save path, which lives in the Tauri command layer
/// (the BLOB deflate/inflate isn't done in this pure-DB module yet).
#[allow(dead_code)]
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

        // The next three depend on zlib (de)compression of the snapshot BLOB,
        // which rusqlite 0.31 cannot do without a new crate. Faking the BLOB
        // would corrupt the on-disk format and round-trips, so they degrade
        // honestly. The Tauri command layer should perform the zlib step and
        // persist/read the snapshot itself.
        //
        // save -> returns number (lastInsertRowid) in Electron.
        "version-history:save" => json!({
            "success": false,
            "error": "snapshot zlib compression not available in DB layer (not ported)"
        }),
        // getState -> returns the decompressed state object or null in Electron.
        "version-history:getState" => json!({
            "success": false,
            "error": "snapshot zlib decompression not available in DB layer (not ported)"
        }),
        // restore -> returns { restored, backupVersionId } or null in Electron.
        "version-history:restore" => json!({
            "success": false,
            "error": "snapshot zlib (de)compression not available in DB layer (not ported)"
        }),

        _ => Value::Null,
    }
}

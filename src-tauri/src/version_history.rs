// =============================================================================
// DEX 6.0 — Version History (Tauri port of src/main/core/VersionHistoryManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed per-project version history (version-history:* channels),
//! reading/writing the shared `dex.db` `version_history` table with the
//! identical schema, queries, and return shapes as the Electron manager.
//!
//! snapshot compression: under Electron the `snapshot` BLOB is the project state
//! JSON run through `zlib.deflateSync` (and read back with `zlib.inflateSync`).
//! The shared `crate::compress` helper mirrors that byte-for-byte (flate2 zlib
//! stream), so `save` deflates `JSON.stringify(state)` into the BLOB and
//! `getState` / `restore` inflate it back and `JSON.parse` it — the on-disk
//! format matches Electron exactly and round-trips both ways. Every channel
//! (`save`, `getVersions`, `getState`, `restore`, `delete`, `markDirty`,
//! `getStats`) is ported faithfully.

use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Max versions retained per (app, project_id) — matches MAX_VERSIONS_PER_PROJECT.
const MAX_VERSIONS_PER_PROJECT: i64 = 50;

/// Current wall-clock time in epoch milliseconds (mirrors Date.now()).
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

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

/// enforceVersionLimit(appName, projectId) — keep at most MAX_VERSIONS_PER_PROJECT
/// rows per (app, project_id); delete the oldest excess by timestamp ASC.
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
            "DELETE FROM version_history WHERE id IN (
                SELECT id FROM version_history WHERE app = ? AND project_id = ?
                ORDER BY timestamp ASC LIMIT ?
            )",
            params![app, project_id, excess],
        );
    }
}

/// saveVersion(appName, projectId, projectName, state, autoSaved) — compress the
/// state JSON to the `snapshot` BLOB (zlib, byte-compatible with Electron),
/// insert the row, enforce the 50-version cap, and return the new rowid
/// (Number(result.lastInsertRowid)). Returns -1 when the insert fails, mirroring
/// the TS `if (!db) return -1` no-persistence path.
fn save_version(
    conn: &Connection,
    app: &str,
    project_id: &str,
    project_name: &str,
    state: &Value,
    auto_saved: bool,
) -> i64 {
    // JSON.stringify(state) -> zlib.deflateSync(Buffer.from(json,'utf8')).
    let json_str = serde_json::to_string(state).unwrap_or_else(|_| "null".to_string());
    let compressed = crate::compress::deflate_str(&json_str);
    let size = compressed.len() as i64;
    let now = now_ms();
    let auto = if auto_saved { 1 } else { 0 };

    let inserted = conn.execute(
        "INSERT INTO version_history (app, project_id, project_name, snapshot, size, timestamp, auto_saved)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        params![app, project_id, project_name, compressed, size, now, auto],
    );
    if inserted.is_err() {
        return -1;
    }
    let id = conn.last_insert_rowid();

    enforce_version_limit(conn, app, project_id);
    // (dirtyProjects.delete(key) is in-memory Electron state — no DB side effect.)
    id
}

/// version-history:save — saveVersion(...). Returns the new rowid (number).
fn save(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let project_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let project_name = args.get(2).and_then(|v| v.as_str()).unwrap_or("");
    let state = args.get(3).cloned().unwrap_or(Value::Null);
    let auto_saved = args.get(4).and_then(|v| v.as_bool()).unwrap_or(false);
    json!(save_version(conn, app, project_id, project_name, &state, auto_saved))
}

/// version-history:getState — getVersionState(versionId). Reads the snapshot
/// BLOB, inflates it, and JSON.parses it; returns the decompressed state object
/// or null (missing row, empty/missing blob, or inflate/parse failure).
fn get_state(conn: &Connection, version_id: i64) -> Value {
    let blob: Option<Vec<u8>> = conn
        .query_row(
            "SELECT snapshot FROM version_history WHERE id = ?",
            params![version_id],
            |r| r.get::<_, Option<Vec<u8>>>(0),
        )
        .ok()
        .flatten();

    // !row || !row.snapshot -> null
    let bytes = match blob {
        Some(b) if !b.is_empty() => b,
        _ => return Value::Null,
    };

    // inflateSync(...).toString('utf8') then JSON.parse; any failure -> null.
    match crate::compress::inflate_to_string(&bytes) {
        Some(s) => serde_json::from_str::<Value>(&s).unwrap_or(Value::Null),
        None => Value::Null,
    }
}

/// version-history:restore — restoreVersion(appName, projectId, versionId,
/// currentState). Reads `SELECT *` for the target version; if missing, returns
/// null. Otherwise backs up the current state first (saveVersion with the target
/// row's project_name, autoSaved=false), decompresses the target snapshot, and
/// returns { restored, backupVersionId }.
fn restore(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let project_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let version_id = args.get(2).and_then(|v| v.as_i64()).unwrap_or(0);
    let current_state = args.get(3).cloned().unwrap_or(Value::Null);

    // SELECT * — we need project_name and snapshot off the target record.
    let record: Option<(String, Vec<u8>)> = conn
        .query_row(
            "SELECT project_name, snapshot FROM version_history WHERE id = ?",
            params![version_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Vec<u8>>(1)?)),
        )
        .ok();

    let (project_name, snapshot) = match record {
        Some(t) => t,
        None => return Value::Null,
    };

    // Backup-before-restore: save the current state under the record's name.
    let backup_version_id =
        save_version(conn, app, project_id, &project_name, &current_state, false);

    // Decompress the target snapshot. The TS lets a decompress throw propagate
    // (no catch here); we mirror by returning null on inflate/parse failure
    // rather than panicking — same observable "no restore" outcome.
    let restored = match crate::compress::inflate_to_string(&snapshot) {
        Some(s) => serde_json::from_str::<Value>(&s).unwrap_or(Value::Null),
        None => Value::Null,
    };

    json!({
        "restored": restored,
        "backupVersionId": backup_version_id,
    })
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

        // The snapshot BLOB is zlib-compressed JSON; crate::compress mirrors
        // Node's zlib byte-for-byte, so these now (de)compress for real.
        //
        // save -> returns number (lastInsertRowid).
        "version-history:save" => save(conn, args),
        // getState -> returns the decompressed state object or null.
        "version-history:getState" => {
            let version_id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            get_state(conn, version_id)
        }
        // restore -> returns { restored, backupVersionId } or null.
        "version-history:restore" => restore(conn, args),

        _ => Value::Null,
    }
}

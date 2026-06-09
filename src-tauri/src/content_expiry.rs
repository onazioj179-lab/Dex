// =============================================================================
// DEX 6.0 — Content Expiry (Tauri port of src/main/core/ContentExpiryManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed content expiry system (content-expiry:* channels), reading and
//! writing the shared `dex.db` `content_expiry` table with the identical schema,
//! queries, and return shapes as the Electron manager (Feature 13). Items get an
//! expiry timestamp; when expired they are auto-moved into `recycle_bin`.
//!
//! The Electron manager also runs a background timer/scheduler that periodically
//! calls processExpiredItems and pushes results to the renderer; that scheduler
//! is an Electron-internal lifecycle concern, not an IPC channel, and is not part
//! of the renderer-facing surface ported here. The `processExpired` handler
//! itself is a pure DB operation (INSERT into recycle_bin + DELETE from
//! content_expiry) and is ported faithfully below.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

/// Current wall-clock time in epoch milliseconds (mirrors Date.now()).
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Create the content_expiry table + indexes (matches createTables verbatim).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS content_expiry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            item_name TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_content_expiry_expires ON content_expiry(expires_at);
        CREATE INDEX IF NOT EXISTS idx_content_expiry_item ON content_expiry(app, item_id);",
    );
    // Note: `recycle_bin` (written by processExpiredItems) is owned + created by
    // the recycle_bin module; we do NOT re-create it here.
}

/// One row -> the ContentExpiry shape (snake_case keys, column order matching
/// `SELECT *` on the table above, exactly as Electron's better-sqlite3 returned).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "item_type": row.get::<_, String>(2)?,
        "item_id": row.get::<_, String>(3)?,
        "item_name": row.get::<_, String>(4)?,
        "expires_at": row.get::<_, i64>(5)?,
        "created": row.get::<_, i64>(6)?,
    }))
}

const SELECT_ALL: &str =
    "SELECT id, app, item_type, item_id, item_name, expires_at, created FROM content_expiry";

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

/// content-expiry:set -> setExpiry(app, itemType, itemId, itemName, expiresAt).
/// Upserts on (app, item_id) and returns the row id (number). Returns -1 when the
/// DB is absent — here the connection is always present at the call site, so a
/// failed insert falls back to -1 to mirror the TS "no db" sentinel.
fn set_expiry(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let item_type = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let item_id = args.get(2).and_then(|v| v.as_str()).unwrap_or("");
    let item_name = args.get(3).and_then(|v| v.as_str()).unwrap_or("");
    let expires_at = args.get(4).and_then(|v| v.as_i64()).unwrap_or(0);

    // Existing row by (app, item_id) -> UPDATE expires_at + item_name, return id.
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM content_expiry WHERE app = ? AND item_id = ?",
            params![app, item_id],
            |r| r.get(0),
        )
        .ok();

    if let Some(id) = existing {
        let _ = conn.execute(
            "UPDATE content_expiry SET expires_at = ?, item_name = ? WHERE id = ?",
            params![expires_at, item_name, id],
        );
        return json!(id);
    }

    let inserted = conn.execute(
        "INSERT INTO content_expiry (app, item_type, item_id, item_name, expires_at, created)
         VALUES (?, ?, ?, ?, ?, ?)",
        params![app, item_type, item_id, item_name, expires_at, now_ms()],
    );
    if inserted.is_err() {
        return json!(-1);
    }
    json!(conn.last_insert_rowid())
}

/// content-expiry:remove -> removeExpiry(app, itemId). Returns boolean (always
/// true on success, matching the TS which returns true after the DELETE runs).
fn remove_expiry(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let item_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    if conn
        .execute(
            "DELETE FROM content_expiry WHERE app = ? AND item_id = ?",
            params![app, item_id],
        )
        .is_err()
    {
        return json!(false);
    }
    json!(true)
}

/// content-expiry:get -> getExpiry(app, itemId). Returns the ContentExpiry row or null.
fn get_expiry(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let item_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let sql = format!("{} WHERE app = ? AND item_id = ?", SELECT_ALL);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return Value::Null,
    };
    match stmt.query_row(params![app, item_id], row_to_json) {
        Ok(v) => v,
        Err(_) => Value::Null,
    }
}

/// content-expiry:processExpired -> processExpiredItems(). Moves every row whose
/// expires_at <= now into recycle_bin (30-day retention) and deletes it, then
/// returns [{ app, itemId, itemName }] for the items processed (camelCase, as the
/// TS re-maps each row into a fresh object).
fn process_expired(conn: &Connection) -> Value {
    let now = now_ms();

    // Read the expired rows up front so the borrow on `stmt` is released before
    // we run the per-item INSERT/DELETE statements below.
    let mut stmt = match conn.prepare(&format!("{} WHERE expires_at <= ?", SELECT_ALL)) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(params![now], |r| {
        Ok((
            r.get::<_, i64>(0)?,    // id
            r.get::<_, String>(1)?, // app
            r.get::<_, String>(2)?, // item_type
            r.get::<_, String>(3)?, // item_id
            r.get::<_, String>(4)?, // item_name
        ))
    }) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let expired: Vec<(i64, String, String, String, String)> =
        rows.filter_map(|r| r.ok()).collect();
    drop(stmt);

    let expires_at_30_days = now + (30 * 86_400_000);
    let mut processed: Vec<Value> = Vec::new();

    for (id, app, item_type, item_id, item_name) in expired {
        let item_data = json!({
            "expired": true,
            "item_id": item_id,
            "source": "content-expiry",
        })
        .to_string();
        let original_location = format!("{}/{}", app, item_type);

        // Insert into recycle_bin, then remove from content_expiry. The TS wraps
        // each item in try/catch and skips the item on error; mirror that by
        // only recording the item as processed once both writes succeed.
        let ins = conn.execute(
            "INSERT INTO recycle_bin (app, item_type, item_name, item_data, original_location, deleted_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![app, item_type, item_name, item_data, original_location, now, expires_at_30_days],
        );
        if ins.is_err() {
            continue;
        }
        if conn
            .execute("DELETE FROM content_expiry WHERE id = ?", params![id])
            .is_err()
        {
            continue;
        }
        processed.push(json!({
            "app": app,
            "itemId": item_id,
            "itemName": item_name,
        }));
    }

    json!(processed)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "content-expiry:set" => set_expiry(conn, args),
        "content-expiry:remove" => remove_expiry(conn, args),
        "content-expiry:get" => get_expiry(conn, args),
        // getAllExpiries() -> all rows ORDER BY expires_at ASC.
        "content-expiry:getAll" => {
            query_list(conn, &format!("{} ORDER BY expires_at ASC", SELECT_ALL), Vec::new())
        }
        "content-expiry:processExpired" => process_expired(conn),
        _ => Value::Null,
    }
}

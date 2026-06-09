// =============================================================================
// DEX 6.0 — Bulk Metadata Editor (Tauri port of src/main/core/BulkMetadataManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed bulk metadata operations (bulk-metadata:* channels), reading and
//! writing the shared `dex.db` with the identical schema, queries, and return
//! shapes as the Electron manager (Feature 33). Every operation appends a row to
//! the owned `bulk_operations_log` table and returns the count of affected items.
//!
//! Several handlers write into tables owned by OTHER subsystems (`color_labels`,
//! `content_expiry`, `recycle_bin`, `read_later`). Per the TS, those writes are
//! wrapped in try/catch and degrade silently when the table is absent — here the
//! same: a missing foreign table simply yields count 0 rather than an error. The
//! `item_tags` table is owned by this manager and created on demand, exactly as
//! the TS `bulkAddTag` does. The `delete` handler also emits on the Electron event
//! bus; that is an internal side effect, not part of the IPC return value, so it
//! is intentionally not replicated (not ported).

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Create the bulk_operations_log table + index (matches createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS bulk_operations_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operation TEXT NOT NULL,
            app TEXT NOT NULL,
            item_count INTEGER NOT NULL DEFAULT 0,
            details TEXT NOT NULL DEFAULT '{}',
            executed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_bulk_ops_app ON bulk_operations_log(app);",
    );
    // Note: color_labels / content_expiry / recycle_bin / read_later are owned by
    // their own subsystems; the TS wraps writes to them in try/catch and degrades
    // when absent, so we do NOT re-create them here. `item_tags` is owned by this
    // manager and created lazily inside bulk_add_tag (matching bulkAddTag).
}

/// One bulk_operations_log row -> the BulkOperation shape (snake_case keys,
/// exactly the column order of `SELECT *` under Electron's better-sqlite3).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "operation": row.get::<_, String>(1)?,
        "app": row.get::<_, String>(2)?,
        "item_count": row.get::<_, i64>(3)?,
        "details": row.get::<_, String>(4)?,
        "executed_at": row.get::<_, String>(5)?,
    }))
}

const SELECT_ALL: &str =
    "SELECT id, operation, app, item_count, details, executed_at FROM bulk_operations_log";

/// Append a row to bulk_operations_log (matches the private logOperation; the
/// details object is JSON-stringified before storage, as the TS does).
fn log_operation(conn: &Connection, operation: &str, app: &str, item_count: i64, details: &Value) {
    let details_str = serde_json::to_string(details).unwrap_or_else(|_| "{}".to_string());
    let _ = conn.execute(
        "INSERT INTO bulk_operations_log (operation, app, item_count, details) VALUES (?, ?, ?, ?)",
        params![operation, app, item_count, details_str],
    );
}

/// Pull a `string[]` positional arg (the itemIds array) into Vec<String>.
fn str_array(args: &Value, i: usize) -> Vec<String> {
    args.get(i)
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

/// bulk-metadata:setColor -> bulkSetColor(app, itemType, itemIds, color).
/// Upserts each id into color_labels (item_name='', label=''); returns the count
/// attempted. Degrades to 0 when color_labels is absent (matches TS try/catch).
fn bulk_set_color(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let item_type = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let item_ids = str_array(args, 2);
    let color = args.get(3).and_then(|v| v.as_str()).unwrap_or("");

    let mut count: i64 = 0;
    for id in &item_ids {
        let r = conn.execute(
            "INSERT INTO color_labels (app, item_type, item_id, item_name, color, label)
             VALUES (?, ?, ?, '', ?, '')
             ON CONFLICT(app, item_type, item_id) DO UPDATE SET color = excluded.color",
            params![app, item_type, id, color],
        );
        // TS: stmt.run inside a transaction; per-id failures are skipped, but a
        // failure to prepare/exec at all (missing table) aborts and leaves count
        // at 0. rusqlite errors per-statement here; on the first hard error we
        // stop incrementing for that id, matching "skip failures".
        if r.is_ok() {
            count += 1;
        }
    }

    log_operation(conn, "bulk-set-color", app, count, &json!({ "color": color, "itemType": item_type }));
    json!(count)
}

/// bulk-metadata:addTag -> bulkAddTag(app, itemIds, tag).
/// Creates the owned item_tags table on demand, inserts (ignoring duplicates),
/// and counts only newly-inserted rows. Returns 0 for an empty/whitespace tag.
fn bulk_add_tag(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let item_ids = str_array(args, 1);
    let tag = args.get(2).and_then(|v| v.as_str()).unwrap_or("");

    let trimmed_tag = tag.trim();
    if trimmed_tag.is_empty() {
        return json!(0);
    }

    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS item_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            item_id TEXT NOT NULL,
            tag TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(app, item_id, tag)
        );
        CREATE INDEX IF NOT EXISTS idx_item_tags_app ON item_tags(app, item_id);
        CREATE INDEX IF NOT EXISTS idx_item_tags_tag ON item_tags(tag);",
    );

    let mut count: i64 = 0;
    for id in &item_ids {
        let changes = conn
            .execute(
                "INSERT OR IGNORE INTO item_tags (app, item_id, tag) VALUES (?, ?, ?)",
                params![app, id, trimmed_tag],
            )
            .unwrap_or(0);
        if changes > 0 {
            count += 1;
        }
    }

    log_operation(conn, "bulk-add-tag", app, count, &json!({ "tag": trimmed_tag }));
    json!(count)
}

/// bulk-metadata:removeTag -> bulkRemoveTag(app, itemIds, tag).
/// Deletes matching item_tags rows; count is the SUM of rows changed across ids
/// (matches `count += r.changes`). Degrades to 0 if item_tags is absent.
fn bulk_remove_tag(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let item_ids = str_array(args, 1);
    let tag = args.get(2).and_then(|v| v.as_str()).unwrap_or("");

    let mut count: i64 = 0;
    for id in &item_ids {
        let changes = conn
            .execute(
                "DELETE FROM item_tags WHERE app = ? AND item_id = ? AND tag = ?",
                params![app, id, tag],
            )
            .unwrap_or(0);
        count += changes as i64;
    }

    log_operation(conn, "bulk-remove-tag", app, count, &json!({ "tag": tag }));
    json!(count)
}

/// bulk-metadata:setExpiry -> bulkSetExpiry(app, itemType, itemIds, expiresAt).
/// Inserts (ON CONFLICT DO NOTHING) into content_expiry; returns the attempted
/// count. Degrades to 0 when content_expiry is absent (matches TS try/catch).
fn bulk_set_expiry(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let item_type = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let item_ids = str_array(args, 2);
    let expires_at = args.get(3).and_then(|v| v.as_str()).unwrap_or("");

    let mut count: i64 = 0;
    for id in &item_ids {
        let r = conn.execute(
            "INSERT INTO content_expiry (app, item_type, item_id, item_name, expires_at)
             VALUES (?, ?, ?, '', ?)
             ON CONFLICT DO NOTHING",
            params![app, item_type, id, expires_at],
        );
        if r.is_ok() {
            count += 1;
        }
    }

    log_operation(conn, "bulk-set-expiry", app, count, &json!({ "expiresAt": expires_at, "itemType": item_type }));
    json!(count)
}

/// bulk-metadata:delete -> bulkDelete(app, itemType, itemIds).
/// Moves items into recycle_bin (soft delete) rather than hard-deleting; returns
/// the attempted count. Degrades to 0 when recycle_bin is absent. The TS also
/// emits `bulk-operation-completed` on the event bus — an internal side effect,
/// not part of the IPC return value, so it is intentionally not replicated.
fn bulk_delete(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let item_type = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let item_ids = str_array(args, 2);

    let mut count: i64 = 0;
    for _id in &item_ids {
        let r = conn.execute(
            "INSERT INTO recycle_bin (app, item_type, item_name, data, deleted_at, expires_at)
             VALUES (?, ?, ?, '{}', datetime('now'), datetime('now', '+30 days'))",
            // TS binds (app, itemType, id) into (app, item_type, item_name) — the
            // id flows into item_name; replicated verbatim.
            params![app, item_type, _id],
        );
        if r.is_ok() {
            count += 1;
        }
    }

    log_operation(conn, "bulk-delete", app, count, &json!({ "itemType": item_type }));
    json!(count)
}

/// bulk-metadata:moveToReadLater -> bulkMoveToReadLater(app, items[{id,title}]).
/// Inserts each item into read_later (item_type='item', priority='normal');
/// returns the attempted count. Degrades to 0 when read_later is absent.
fn bulk_move_to_read_later(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let items = args.get(1).and_then(|v| v.as_array()).cloned().unwrap_or_default();

    let mut count: i64 = 0;
    for item in &items {
        let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("");
        let r = conn.execute(
            "INSERT INTO read_later (app, item_type, item_id, title, priority) VALUES (?, 'item', ?, ?, 'normal')",
            params![app, id, title],
        );
        if r.is_ok() {
            count += 1;
        }
    }

    log_operation(conn, "bulk-read-later", app, count, &json!({}));
    json!(count)
}

/// bulk-metadata:history -> getOperationHistory(app?, limit=50). Returns
/// BulkOperation[] from `SELECT *` (snake_case), ordered by executed_at DESC.
fn get_operation_history(conn: &Connection, args: &Value) -> Value {
    // app is optional; absent/non-string -> global history. limit defaults to 50.
    let app = args.get(0).and_then(|v| v.as_str());
    let limit = args.get(1).and_then(|v| v.as_i64()).unwrap_or(50);

    let (sql, p): (String, Vec<SqlValue>) = match app {
        Some(a) => (
            format!("{} WHERE app = ? ORDER BY executed_at DESC LIMIT ?", SELECT_ALL),
            vec![SqlValue::Text(a.to_string()), SqlValue::Integer(limit)],
        ),
        None => (
            format!("{} ORDER BY executed_at DESC LIMIT ?", SELECT_ALL),
            vec![SqlValue::Integer(limit)],
        ),
    };

    let mut stmt = match conn.prepare(&sql) {
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

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "bulk-metadata:setColor" => bulk_set_color(conn, args),
        "bulk-metadata:addTag" => bulk_add_tag(conn, args),
        "bulk-metadata:removeTag" => bulk_remove_tag(conn, args),
        "bulk-metadata:setExpiry" => bulk_set_expiry(conn, args),
        "bulk-metadata:delete" => bulk_delete(conn, args),
        "bulk-metadata:moveToReadLater" => bulk_move_to_read_later(conn, args),
        "bulk-metadata:history" => get_operation_history(conn, args),
        _ => Value::Null,
    }
}

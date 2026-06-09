// =============================================================================
// DEX 6.0 — Read Later (Tauri port of src/main/core/ReadLaterManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed read-later queue (read-later:* channels), reading/writing the
//! shared `dex.db` `read_later` table with the identical schema, queries, and
//! return shapes as the Electron manager (Feature 32). The renderer-facing
//! surface is the nine handlers below, ported faithfully; the `initialize`
//! BrowserWindow wiring is an internal Electron concern (not an IPC channel).

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Create the read_later table + indexes (matches ReadLaterManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS read_later (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL DEFAULT '',
            item_type TEXT NOT NULL DEFAULT 'link',
            item_id TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL,
            url TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            priority TEXT NOT NULL DEFAULT 'normal',
            read INTEGER NOT NULL DEFAULT 0,
            read_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_read_later_read ON read_later(read);
        CREATE INDEX IF NOT EXISTS idx_read_later_priority ON read_later(priority);",
    );
}

/// One row -> the ReadLaterItem shape (matches `SELECT *` column order/casing
/// under Electron; `read_at` is nullable, all others non-null).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "item_type": row.get::<_, String>(2)?,
        "item_id": row.get::<_, String>(3)?,
        "title": row.get::<_, String>(4)?,
        "url": row.get::<_, String>(5)?,
        "notes": row.get::<_, String>(6)?,
        "priority": row.get::<_, String>(7)?,
        "read": row.get::<_, i64>(8)?,
        "read_at": row.get::<_, Option<String>>(9)?,
        "created_at": row.get::<_, String>(10)?,
    }))
}

const SELECT_ALL: &str =
    "SELECT id, app, item_type, item_id, title, url, notes, priority, read, read_at, created_at FROM read_later";

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

/// add(params) -> the inserted ReadLaterItem row, or null when the title is
/// empty/whitespace (matches the `if (!trimmed) return null` guard).
fn add(conn: &Connection, params_obj: &Value) -> Value {
    let title = params_obj
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let trimmed = title.trim();
    if trimmed.is_empty() {
        return Value::Null;
    }

    let s = |key: &str, default: &str| {
        params_obj
            .get(key)
            .and_then(|v| v.as_str())
            .filter(|v| !v.is_empty())
            .unwrap_or(default)
            .to_string()
    };

    // priority validated against the allow-list, defaulting to 'normal'.
    let raw_priority = params_obj
        .get("priority")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let priority = if ["low", "normal", "high"].contains(&raw_priority) {
        raw_priority
    } else {
        "normal"
    };

    let app = s("app", "");
    let item_type = s("itemType", "link");
    let item_id = s("itemId", "");
    let url = s("url", "");
    let notes = s("notes", "");

    if conn
        .execute(
            "INSERT INTO read_later (app, item_type, item_id, title, url, notes, priority)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![app, item_type, item_id, trimmed, url, notes, priority],
        )
        .is_err()
    {
        return Value::Null;
    }

    let id = conn.last_insert_rowid();
    let sql = format!("{} WHERE id = ?", SELECT_ALL);
    conn.query_row(&sql, params![id], row_to_json)
        .unwrap_or(Value::Null)
}

fn get_all(conn: &Connection, include_read: bool) -> Value {
    let sql = if include_read {
        format!(
            "{} ORDER BY \
             CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 END, \
             created_at DESC",
            SELECT_ALL
        )
    } else {
        format!(
            "{} WHERE read = 0 ORDER BY \
             CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 WHEN 'low' THEN 2 END, \
             created_at DESC",
            SELECT_ALL
        )
    };
    query_list(conn, &sql, Vec::new())
}

fn search(conn: &Connection, query: &str) -> Value {
    let pattern = format!("%{}%", query.trim());
    let sql = format!(
        "{} WHERE title LIKE ? OR notes LIKE ? OR url LIKE ? ORDER BY created_at DESC LIMIT 100",
        SELECT_ALL
    );
    query_list(
        conn,
        &sql,
        vec![
            SqlValue::Text(pattern.clone()),
            SqlValue::Text(pattern.clone()),
            SqlValue::Text(pattern),
        ],
    )
}

fn get_unread_count(conn: &Connection) -> Value {
    let cnt: i64 = conn
        .query_row("SELECT COUNT(*) FROM read_later WHERE read = 0", [], |r| {
            r.get(0)
        })
        .unwrap_or(0);
    json!(cnt)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "read-later:add" => add(conn, &args.get(0).cloned().unwrap_or_else(|| json!({}))),

        // markRead/markUnread/remove return boolean (true) in Electron.
        "read-later:markRead" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            let _ = conn.execute(
                "UPDATE read_later SET read = 1, read_at = datetime('now') WHERE id = ?",
                params![id],
            );
            json!(true)
        }
        "read-later:markUnread" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            let _ = conn.execute(
                "UPDATE read_later SET read = 0, read_at = NULL WHERE id = ?",
                params![id],
            );
            json!(true)
        }
        "read-later:updateNotes" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            let notes = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            let _ = conn.execute(
                "UPDATE read_later SET notes = ? WHERE id = ?",
                params![notes, id],
            );
            json!(true)
        }
        // setPriority returns false when the priority is not in the allow-list.
        "read-later:setPriority" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            let priority = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            if !["low", "normal", "high"].contains(&priority) {
                return json!(false);
            }
            let _ = conn.execute(
                "UPDATE read_later SET priority = ? WHERE id = ?",
                params![priority, id],
            );
            json!(true)
        }
        "read-later:remove" => {
            let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
            let _ = conn.execute("DELETE FROM read_later WHERE id = ?", params![id]);
            json!(true)
        }

        "read-later:getAll" => {
            let include_read = args.get(0).and_then(|v| v.as_bool()).unwrap_or(false);
            get_all(conn, include_read)
        }
        "read-later:getUnreadCount" => get_unread_count(conn),
        "read-later:search" => {
            let query = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            search(conn, query)
        }

        _ => Value::Null,
    }
}

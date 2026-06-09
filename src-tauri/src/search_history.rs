// =============================================================================
// DEX 6.0 — Search History (Tauri port of src/main/core/SearchHistoryManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed search history (search-history:* channels), reading/writing the
//! shared `dex.db` `search_history` table with the identical schema, queries, and
//! return shapes as the Electron manager (Feature 14). Every search query and
//! result click across the inner apps is recorded here. The `initialize`
//! BrowserWindow wiring is an internal Electron concern (not an IPC channel); all
//! five renderer-facing handlers below are pure DB operations and ported faithfully.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

/// Epoch-millis "now", mirroring the TS `Date.now()` used for the timestamp.
fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Create the search_history table + indexes (matches SearchHistoryManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS search_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            query TEXT NOT NULL,
            result_clicked TEXT DEFAULT '',
            result_type TEXT DEFAULT '',
            timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_search_history_timestamp ON search_history(timestamp);
        CREATE INDEX IF NOT EXISTS idx_search_history_app ON search_history(app);
        CREATE INDEX IF NOT EXISTS idx_search_history_query ON search_history(query);",
    );
}

/// One row -> the SearchHistoryEntry shape (snake_case keys, exactly as `SELECT *`
/// returned it under Electron; result_clicked/result_type default to '' so are non-null).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "query": row.get::<_, String>(2)?,
        "result_clicked": row.get::<_, String>(3)?,
        "result_type": row.get::<_, String>(4)?,
        "timestamp": row.get::<_, i64>(5)?,
    }))
}

const SELECT_ALL: &str =
    "SELECT id, app, query, result_clicked, result_type, timestamp FROM search_history";

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

/// search-history:record — recordSearch(app, query, resultClicked='', resultType='').
/// Returns the inserted row id, or -1 when the trimmed query is empty (mirrors the
/// TS early returns; the DB-absent `-1` path is handled by the dispatcher above).
fn record_search(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let query = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    // resultClicked/resultType default to '' when the renderer omits them.
    let result_clicked = args.get(2).and_then(|v| v.as_str()).unwrap_or("");
    let result_type = args.get(3).and_then(|v| v.as_str()).unwrap_or("");

    let trimmed = query.trim();
    if trimmed.is_empty() {
        return json!(-1);
    }

    let inserted = conn.execute(
        "INSERT INTO search_history (app, query, result_clicked, result_type, timestamp)
         VALUES (?, ?, ?, ?, ?)",
        params![app, trimmed, result_clicked, result_type, now_millis()],
    );
    if inserted.is_err() {
        return json!(-1);
    }
    json!(conn.last_insert_rowid())
}

/// search-history:clear — clearHistory(). Returns the number of rows deleted.
fn clear_history(conn: &Connection) -> Value {
    let changes = conn
        .execute("DELETE FROM search_history", [])
        .unwrap_or(0);
    json!(changes)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "search-history:record" => record_search(conn, args),

        // getHistory(limit=200) -> SearchHistoryEntry[] ordered newest first.
        "search-history:getHistory" => {
            let limit = args.get(0).and_then(|v| v.as_i64()).unwrap_or(200);
            query_list(
                conn,
                &format!("{} ORDER BY timestamp DESC LIMIT ?", SELECT_ALL),
                vec![SqlValue::Integer(limit)],
            )
        }

        // getHistoryByApp(app, limit=50) -> SearchHistoryEntry[] for one app.
        "search-history:getByApp" => {
            let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
            let limit = args.get(1).and_then(|v| v.as_i64()).unwrap_or(50);
            query_list(
                conn,
                &format!("{} WHERE app = ? ORDER BY timestamp DESC LIMIT ?", SELECT_ALL),
                vec![SqlValue::Text(app), SqlValue::Integer(limit)],
            )
        }

        // getFrequentQueries(limit=20) -> [{ query, count }] grouped by query.
        "search-history:getFrequent" => {
            let limit = args.get(0).and_then(|v| v.as_i64()).unwrap_or(20);
            let sql = "SELECT query, COUNT(*) as count FROM search_history \
                       GROUP BY query ORDER BY count DESC LIMIT ?";
            let mut stmt = match conn.prepare(sql) {
                Ok(s) => s,
                Err(_) => return json!([]),
            };
            let rows = match stmt.query_map(params![limit], |r| {
                Ok(json!({ "query": r.get::<_, String>(0)?, "count": r.get::<_, i64>(1)? }))
            }) {
                Ok(r) => r,
                Err(_) => return json!([]),
            };
            let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
            json!(out)
        }

        "search-history:clear" => clear_history(conn),

        _ => Value::Null,
    }
}

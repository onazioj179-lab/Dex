// =============================================================================
// DEX 6.0 — Recycle Bin (Tauri port of src/main/core/RecycleBinManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed recycle bin (recycle-bin:* channels) — the single path for all
//! deletions across DEX's inner apps, with 30-day retention and restore-to-origin.
//! Reads/writes the shared `dex.db` `recycle_bin` table with the identical schema,
//! queries, and return shapes as the Electron manager. The `recycle-bin:count`
//! broadcast (mainWindow.webContents.send) is a push event, not an ipcMain.handle
//! channel, so it has no dispatch entry here; renderers call `recycle-bin:getCount`
//! for the same value.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

const RETENTION_DAYS: i64 = 30;
const RETENTION_MS: i64 = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/// Create the recycle_bin table + indexes. The table is declared by
/// DatabaseManager.ts (RecycleBinManager only queries it), so the columns and
/// indexes here are copied verbatim from DatabaseManager.createTables().
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS recycle_bin (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            item_type TEXT NOT NULL,
            item_name TEXT NOT NULL,
            item_data TEXT NOT NULL,
            original_location TEXT DEFAULT '',
            deleted_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_recycle_bin_app ON recycle_bin(app);
        CREATE INDEX IF NOT EXISTS idx_recycle_bin_expires ON recycle_bin(expires_at);",
    );
}

/// Current wall-clock time in epoch milliseconds (mirrors Date.now()).
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// One row -> the RecycleBinItem shape. `item_data` is kept as the stored JSON
/// string exactly as `SELECT *` returned it under Electron; the INTEGER epoch
/// columns map to i64.
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "item_type": row.get::<_, String>(2)?,
        "item_name": row.get::<_, String>(3)?,
        "item_data": row.get::<_, String>(4)?,
        "original_location": row.get::<_, String>(5)?,
        "deleted_at": row.get::<_, i64>(6)?,
        "expires_at": row.get::<_, i64>(7)?,
    }))
}

const SELECT_COLS: &str =
    "SELECT id, app, item_type, item_name, item_data, original_location, deleted_at, expires_at FROM recycle_bin";

fn query_list(conn: &Connection, sql: &str, p: Vec<SqlValue>) -> Vec<Value> {
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    let rows = match stmt.query_map(rusqlite::params_from_iter(p), row_to_json) {
        Ok(r) => r,
        Err(_) => return Vec::new(),
    };
    rows.filter_map(|r| r.ok()).collect()
}

fn query_one(conn: &Connection, id: i64) -> Option<Value> {
    let sql = format!("{} WHERE id = ?", SELECT_COLS);
    let mut stmt = conn.prepare(&sql).ok()?;
    let mut rows = stmt.query_map(params![id], row_to_json).ok()?;
    rows.next().and_then(|r| r.ok())
}

fn get_count(conn: &Connection) -> i64 {
    conn.query_row("SELECT COUNT(*) FROM recycle_bin", [], |r| r.get(0))
        .unwrap_or(0)
}

/// deleteItem(app, itemType, itemName, itemData, originalLocation='') -> new row id.
/// args: [app, itemType, itemName, itemData, originalLocation?]
fn delete_item(conn: &Connection, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let app = s(0);
    let item_type = s(1);
    let item_name = s(2);
    // itemData: string is kept verbatim, anything else is JSON.stringify'd.
    let item_data = match args.get(3) {
        Some(Value::String(s)) => s.clone(),
        Some(v) => serde_json::to_string(v).unwrap_or_default(),
        None => String::new(),
    };
    let original_location = args
        .get(4)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let now = now_ms();
    let expires_at = now + RETENTION_MS;

    match conn.execute(
        "INSERT INTO recycle_bin (app, item_type, item_name, item_data, original_location, deleted_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        params![app, item_type, item_name, item_data, original_location, now, expires_at],
    ) {
        Ok(_) => json!(conn.last_insert_rowid()),
        // db === null path returns -1 in Electron; an insert failure is the
        // closest equivalent to "no persistence".
        Err(_) => json!(-1),
    }
}

/// restoreItem(id) -> the item row (SELECT *) then deletes it, or null.
fn restore_item(conn: &Connection, args: &Value) -> Value {
    let id = match args.get(0).and_then(|v| v.as_i64()) {
        Some(v) => v,
        None => return Value::Null,
    };
    match query_one(conn, id) {
        Some(item) => {
            let _ = conn.execute("DELETE FROM recycle_bin WHERE id = ?", params![id]);
            item
        }
        None => Value::Null,
    }
}

/// permanentlyDelete(id) -> boolean (true unless db === null).
fn permanently_delete(conn: &Connection, args: &Value) -> Value {
    let id = match args.get(0).and_then(|v| v.as_i64()) {
        Some(v) => v,
        None => return json!(true),
    };
    let _ = conn.execute("DELETE FROM recycle_bin WHERE id = ?", params![id]);
    json!(true)
}

/// emptyAll() -> count of rows that existed before clearing.
fn empty_all(conn: &Connection) -> Value {
    let count = get_count(conn);
    let _ = conn.execute("DELETE FROM recycle_bin", []);
    json!(count)
}

/// purgeExpired() -> number of rows deleted (result.changes).
fn purge_expired(conn: &Connection) -> Value {
    let now = now_ms();
    let purged = conn
        .execute("DELETE FROM recycle_bin WHERE expires_at <= ?", params![now])
        .unwrap_or(0);
    json!(purged as i64)
}

/// getAll(appFilter?) -> RecycleBinItem[], filtered by app unless 'all'/absent.
fn get_all(conn: &Connection, args: &Value) -> Vec<Value> {
    let app_filter = args.get(0).and_then(|v| v.as_str());
    match app_filter {
        Some(app) if app != "all" => {
            let sql = format!("{} WHERE app = ? ORDER BY deleted_at DESC", SELECT_COLS);
            query_list(conn, &sql, vec![SqlValue::Text(app.to_string())])
        }
        _ => {
            let sql = format!("{} ORDER BY deleted_at DESC", SELECT_COLS);
            query_list(conn, &sql, Vec::new())
        }
    }
}

/// getGroupedByApp() -> [{ app, count, items }], grouped in deleted_at-DESC order
/// with first-seen-app insertion order preserved (matches the Map iteration in TS).
fn get_grouped(conn: &Connection) -> Value {
    let all = get_all(conn, &json!([]));
    let mut order: Vec<String> = Vec::new();
    let mut groups: std::collections::HashMap<String, Vec<Value>> = std::collections::HashMap::new();
    for item in all {
        let app = item
            .get("app")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if !groups.contains_key(&app) {
            order.push(app.clone());
        }
        groups.entry(app).or_default().push(item);
    }
    let out: Vec<Value> = order
        .into_iter()
        .map(|app| {
            let items = groups.remove(&app).unwrap_or_default();
            json!({ "app": app, "count": items.len() as i64, "items": items })
        })
        .collect();
    json!(out)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "recycle-bin:delete" => delete_item(conn, args),
        "recycle-bin:restore" => restore_item(conn, args),
        "recycle-bin:permanentlyDelete" => permanently_delete(conn, args),
        "recycle-bin:emptyAll" => empty_all(conn),
        "recycle-bin:getAll" => json!(get_all(conn, args)),
        "recycle-bin:getCount" => json!(get_count(conn)),
        "recycle-bin:getGrouped" => get_grouped(conn),
        "recycle-bin:getItem" => match args.get(0).and_then(|v| v.as_i64()) {
            Some(id) => query_one(conn, id).unwrap_or(Value::Null),
            None => Value::Null,
        },
        "recycle-bin:purgeExpired" => purge_expired(conn),
        _ => Value::Null,
    }
}

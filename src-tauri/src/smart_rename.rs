// =============================================================================
// DEX 6.0 — Smart Rename (Tauri port of src/main/core/SmartRenameManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed smart rename (smart-rename:* channels), reading/writing the
//! shared `dex.db` `rename_history` table with the identical schema, queries,
//! and return shapes as the Electron manager (Feature 24). `rename` renames an
//! item and propagates the new name across every linked table (project_links,
//! version_history, project_health, time_tracking, color_labels), recording the
//! operation in `rename_history`; each cross-table UPDATE is wrapped so that a
//! missing table degrades silently, exactly as the TS try/catch blocks do.
//! `getHistory` returns raw `SELECT *` rows (snake_case). The `:completed`
//! renderer event push and event-bus emit in the TS are Electron-internal side
//! effects, not part of the IPC return value, so they are not replicated.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Create the rename_history table + index (matches SmartRenameManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS rename_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            old_name TEXT NOT NULL,
            new_name TEXT NOT NULL,
            references_updated INTEGER NOT NULL DEFAULT 0,
            renamed_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_rename_app ON rename_history(app, item_id);",
    );
}

/// One row -> the RenameRecord shape (column order matches `SELECT *` on the
/// table definition above, exactly as Electron's better-sqlite3 returned it).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "item_type": row.get::<_, String>(2)?,
        "item_id": row.get::<_, String>(3)?,
        "old_name": row.get::<_, String>(4)?,
        "new_name": row.get::<_, String>(5)?,
        "references_updated": row.get::<_, i64>(6)?,
        "renamed_at": row.get::<_, String>(7)?,
    }))
}

const SELECT_ALL: &str =
    "SELECT id, app, item_type, item_id, old_name, new_name, references_updated, renamed_at FROM rename_history";

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

/// smart-rename:rename — rename(app, itemType, itemId, oldName, newName).
/// Validates the new name, propagates it across all linked tables, records the
/// rename, and returns { success, referencesUpdated } (camelCase, matching TS).
fn rename(conn: &Connection, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("");
    let app = s(0);
    let item_type = s(1);
    let item_id = s(2);
    let old_name = s(3);
    let new_name = s(4);

    let trimmed = new_name.trim();
    // !trimmed || trimmed === oldName -> { success: false, referencesUpdated: 0 }
    if trimmed.is_empty() || trimmed == old_name {
        return json!({ "success": false, "referencesUpdated": 0 });
    }

    let mut refs_updated: i64 = 0;

    // Each UPDATE is wrapped so a missing table degrades silently (TS try/catch).
    // project_links: source_id then target_id (keyed by *_app + *_id).
    refs_updated += conn
        .execute(
            "UPDATE project_links SET source_id = ? WHERE source_app = ? AND source_id = ?",
            params![trimmed, app, item_id],
        )
        .unwrap_or(0) as i64;
    refs_updated += conn
        .execute(
            "UPDATE project_links SET target_id = ? WHERE target_app = ? AND target_id = ?",
            params![trimmed, app, item_id],
        )
        .unwrap_or(0) as i64;

    // version_history (keyed by app + old project_name).
    refs_updated += conn
        .execute(
            "UPDATE version_history SET project_name = ? WHERE app = ? AND project_name = ?",
            params![trimmed, app, old_name],
        )
        .unwrap_or(0) as i64;

    // project_health (keyed by app + old project_name).
    refs_updated += conn
        .execute(
            "UPDATE project_health SET project_name = ? WHERE app = ? AND project_name = ?",
            params![trimmed, app, old_name],
        )
        .unwrap_or(0) as i64;

    // time_tracking (keyed by app + old project_name).
    refs_updated += conn
        .execute(
            "UPDATE time_tracking SET project_name = ? WHERE app = ? AND project_name = ?",
            params![trimmed, app, old_name],
        )
        .unwrap_or(0) as i64;

    // color_labels (keyed by app + old item_name).
    refs_updated += conn
        .execute(
            "UPDATE color_labels SET item_name = ? WHERE app = ? AND item_name = ?",
            params![trimmed, app, old_name],
        )
        .unwrap_or(0) as i64;

    // Record the rename.
    let _ = conn.execute(
        "INSERT INTO rename_history (app, item_type, item_id, old_name, new_name, references_updated)
         VALUES (?, ?, ?, ?, ?, ?)",
        params![app, item_type, item_id, old_name, trimmed, refs_updated],
    );

    // Electron also emits `item-renamed` on the event bus and pushes
    // `smart-rename:completed` to the renderer here; those are internal side
    // effects, not part of the IPC return value, so they are not replicated.
    json!({ "success": true, "referencesUpdated": refs_updated })
}

/// smart-rename:getHistory — getHistory(app?, limit=100). Returns RenameRecord[]
/// from raw `SELECT *` (snake_case keys), newest first.
fn get_history(conn: &Connection, args: &Value) -> Value {
    // limit defaults to 100 (TS default param); accepts numeric arg.
    let limit = args.get(1).and_then(|v| v.as_i64()).unwrap_or(100);
    // app is optional; a present non-null string filters, otherwise all rows.
    match args.get(0).and_then(|v| v.as_str()) {
        Some(app) => query_list(
            conn,
            &format!("{} WHERE app = ? ORDER BY renamed_at DESC LIMIT ?", SELECT_ALL),
            vec![SqlValue::Text(app.to_string()), SqlValue::Integer(limit)],
        ),
        None => query_list(
            conn,
            &format!("{} ORDER BY renamed_at DESC LIMIT ?", SELECT_ALL),
            vec![SqlValue::Integer(limit)],
        ),
    }
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "smart-rename:rename" => rename(conn, args),
        "smart-rename:getHistory" => get_history(conn, args),
        _ => Value::Null,
    }
}

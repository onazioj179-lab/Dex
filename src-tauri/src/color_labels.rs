// =============================================================================
// DEX 6.0 — Color Labels (Tauri port of src/main/core/ColorLabelManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed color label system (color-labels:* channels), reading/writing
//! the shared `dex.db` `color_labels` table with the identical schema, queries,
//! and return shapes as the Electron manager. The `set` handler in Electron also
//! emits on the event bus and pushes a `color-labels:changed` event to the
//! renderer — those are Electron-internal side effects, not part of the IPC
//! return value, so the renderer-facing surface (the DB write + returned row) is
//! ported faithfully here. `getPalette` returns the same static 8-color palette.

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// The 8 predefined colors (matches COLOR_PALETTE in the TS, in order).
const COLOR_PALETTE: &[(&str, &str, &str)] = &[
    ("red", "#EF4444", "Red"),
    ("orange", "#F97316", "Orange"),
    ("yellow", "#EAB308", "Yellow"),
    ("green", "#22C55E", "Green"),
    ("blue", "#3B82F6", "Blue"),
    ("purple", "#A855F7", "Purple"),
    ("pink", "#EC4899", "Pink"),
    ("gray", "#6B7280", "Gray"),
];

/// True if `color` is one of the 8 palette keys (matches COLOR_PALETTE.find).
fn is_valid_color(color: &str) -> bool {
    COLOR_PALETTE.iter().any(|(key, _, _)| *key == color)
}

/// Create the color_labels table + indexes (matches ColorLabelManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS color_labels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app TEXT NOT NULL,
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            item_name TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(app, item_type, item_id)
        );
        CREATE INDEX IF NOT EXISTS idx_color_labels_app ON color_labels(app);
        CREATE INDEX IF NOT EXISTS idx_color_labels_color ON color_labels(color);",
    );
}

/// One row -> the ColorLabel shape (snake_case keys, exactly as `SELECT *`
/// returned it under Electron).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "app": row.get::<_, String>(1)?,
        "item_type": row.get::<_, String>(2)?,
        "item_id": row.get::<_, String>(3)?,
        "item_name": row.get::<_, String>(4)?,
        "color": row.get::<_, String>(5)?,
        "label": row.get::<_, String>(6)?,
        "created_at": row.get::<_, String>(7)?,
    }))
}

const ROW_COLS: &str =
    "id, app, item_type, item_id, item_name, color, label, created_at";

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

/// SELECT a single color_labels row by (app, item_type, item_id) -> row JSON or null.
fn fetch_one(conn: &Connection, app: &str, item_type: &str, item_id: &str) -> Value {
    let sql = format!(
        "SELECT {ROW_COLS} FROM color_labels WHERE app = ? AND item_type = ? AND item_id = ?"
    );
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return Value::Null,
    };
    match stmt.query_row(params![app, item_type, item_id], row_to_json) {
        Ok(v) => v,
        Err(_) => Value::Null,
    }
}

/// color-labels:set -> setLabel: validate color, upsert, return the stored row or null.
fn set_label(conn: &Connection, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("");
    let app = s(0);
    let item_type = s(1);
    let item_id = s(2);
    let item_name = s(3);
    let color = s(4);
    // label defaults to '' and is trimmed (matches `label: string = ''` + label.trim()).
    let label = s(5).trim();

    if !is_valid_color(color) {
        return Value::Null;
    }

    let _ = conn.execute(
        "INSERT INTO color_labels (app, item_type, item_id, item_name, color, label)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(app, item_type, item_id) DO UPDATE SET
           item_name = excluded.item_name,
           color = excluded.color,
           label = excluded.label",
        params![app, item_type, item_id, item_name, color, label],
    );

    // Electron also emits on the event bus and pushes `color-labels:changed`
    // to the renderer here; those are internal side effects, not part of the
    // IPC return value, so they are intentionally not replicated (not ported).
    fetch_one(conn, app, item_type, item_id)
}

/// color-labels:remove -> removeLabel: delete, return whether any row changed.
fn remove_label(conn: &Connection, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("");
    let changed = conn
        .execute(
            "DELETE FROM color_labels WHERE app = ? AND item_type = ? AND item_id = ?",
            params![s(0), s(1), s(2)],
        )
        .unwrap_or(0);
    json!(changed > 0)
}

/// color-labels:getStats -> getColorStats: [{ color, count }], optionally per-app.
fn get_stats(conn: &Connection, app: Option<&str>) -> Value {
    let (sql, p): (&str, Vec<SqlValue>) = match app {
        Some(a) => (
            "SELECT color, COUNT(*) as count FROM color_labels WHERE app = ? GROUP BY color ORDER BY count DESC",
            vec![SqlValue::Text(a.to_string())],
        ),
        None => (
            "SELECT color, COUNT(*) as count FROM color_labels GROUP BY color ORDER BY count DESC",
            Vec::new(),
        ),
    };
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(rusqlite::params_from_iter(p), |r| {
        Ok(json!({ "color": r.get::<_, String>(0)?, "count": r.get::<_, i64>(1)? }))
    }) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// color-labels:getPalette -> getColorPalette: the static [{ key, hex, name }] list.
fn get_palette() -> Value {
    let out: Vec<Value> = COLOR_PALETTE
        .iter()
        .map(|(key, hex, name)| json!({ "key": key, "hex": hex, "name": name }))
        .collect();
    json!(out)
}

/// color-labels:bulkSet -> bulkSetColor: validate color, upsert each item id,
/// return how many were processed. Note item_name is set to '' and is NOT
/// updated on conflict (matches the TS verbatim).
fn bulk_set(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
    let item_type = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
    let item_ids: Vec<String> = args
        .get(2)
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let color = args.get(3).and_then(|v| v.as_str()).unwrap_or("");
    let label = args.get(4).and_then(|v| v.as_str()).unwrap_or("").trim();

    if !is_valid_color(color) {
        return json!(0);
    }

    let mut count: i64 = 0;
    for item_id in &item_ids {
        let _ = conn.execute(
            "INSERT INTO color_labels (app, item_type, item_id, item_name, color, label)
             VALUES (?, ?, ?, '', ?, ?)
             ON CONFLICT(app, item_type, item_id) DO UPDATE SET
               color = excluded.color,
               label = excluded.label",
            params![app, item_type, item_id, color, label],
        );
        count += 1;
    }
    json!(count)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    match channel {
        "color-labels:set" => set_label(conn, args),
        "color-labels:remove" => remove_label(conn, args),
        "color-labels:get" => fetch_one(conn, &s(0), &s(1), &s(2)),
        "color-labels:getByColor" => query_list(
            conn,
            &format!(
                "SELECT {ROW_COLS} FROM color_labels WHERE app = ? AND color = ? ORDER BY item_name ASC"
            ),
            vec![SqlValue::Text(s(0)), SqlValue::Text(s(1))],
        ),
        "color-labels:getByApp" => query_list(
            conn,
            &format!(
                "SELECT {ROW_COLS} FROM color_labels WHERE app = ? ORDER BY color ASC, item_name ASC"
            ),
            vec![SqlValue::Text(s(0))],
        ),
        "color-labels:getAll" => query_list(
            conn,
            &format!(
                "SELECT {ROW_COLS} FROM color_labels ORDER BY app ASC, color ASC, item_name ASC"
            ),
            Vec::new(),
        ),
        "color-labels:getPalette" => get_palette(),
        // getColorStats takes an optional `app`; absent/non-string -> global stats.
        "color-labels:getStats" => {
            get_stats(conn, args.get(0).and_then(|v| v.as_str()))
        }
        "color-labels:bulkSet" => bulk_set(conn, args),
        _ => Value::Null,
    }
}

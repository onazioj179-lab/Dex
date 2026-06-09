// =============================================================================
// DEX 6.0 — Custom Dashboard (Tauri port of src/main/core/CustomDashboardManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed pinnable widget dashboard (dashboard:* channels), reading and
//! writing the shared `dex.db` `dashboard_layouts` table with the identical
//! schema, queries, and return shapes as the Electron manager. Each layout's
//! `widgets` column is stored as a JSON string but always surfaced to the
//! renderer as a parsed array (matching `JSON.parse(r.widgets || '[]')`), so the
//! renderer cannot tell the bridge changed. The ten IPC handlers are ported
//! faithfully; ensure_schema also seeds the default layout exactly as
//! `ensureDefaultLayout` does on Electron init.

use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// Widget types offered to the renderer (matches WIDGET_TYPES).
const WIDGET_TYPES: [&str; 14] = [
    "tasks-summary",
    "word-count",
    "time-tracking",
    "project-health",
    "recent-activity",
    "goals-progress",
    "statistics",
    "media-gallery",
    "daily-note",
    "reminders",
    "search",
    "calendar",
    "clock",
    "quick-actions",
];

/// Create the dashboard_layouts table + index (matches createTables) and seed
/// the default layout (matches ensureDefaultLayout, run on Electron init).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS dashboard_layouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            widgets TEXT NOT NULL DEFAULT '[]',
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_dashboard_default ON dashboard_layouts(is_default);",
    );
    ensure_default_layout(conn);
}

/// Seed the default layout if none exists (matches ensureDefaultLayout).
fn ensure_default_layout(conn: &Connection) {
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM dashboard_layouts WHERE is_default = 1",
            [],
            |r| r.get(0),
        )
        .ok();
    if existing.is_some() {
        return;
    }

    // Verbatim default widget set from ensureDefaultLayout.
    let default_widgets = json!([
        { "id": "w-tasks", "type": "tasks-summary", "title": "Tasks", "x": 0, "y": 0, "w": 4, "h": 3, "config": {} },
        { "id": "w-stats", "type": "statistics", "title": "Statistics", "x": 4, "y": 0, "w": 4, "h": 3, "config": {} },
        { "id": "w-activity", "type": "recent-activity", "title": "Recent Activity", "x": 8, "y": 0, "w": 4, "h": 3, "config": {} },
        { "id": "w-goals", "type": "goals-progress", "title": "Goals", "x": 0, "y": 3, "w": 6, "h": 3, "config": {} },
        { "id": "w-words", "type": "word-count", "title": "Word Count", "x": 6, "y": 3, "w": 3, "h": 3, "config": {} },
        { "id": "w-time", "type": "time-tracking", "title": "Time", "x": 9, "y": 3, "w": 3, "h": 3, "config": {} },
    ]);
    let widgets_str = serde_json::to_string(&default_widgets).unwrap_or_else(|_| "[]".to_string());
    let _ = conn.execute(
        "INSERT INTO dashboard_layouts (name, widgets, is_default) VALUES (?, ?, 1)",
        params!["Default Dashboard", widgets_str],
    );
}

/// One row -> the DashboardLayout shape. `widgets` is parsed from its stored
/// JSON string into an array (matching `JSON.parse(r.widgets || '[]')`); a
/// malformed/empty value degrades to `[]` exactly like the TS fallback.
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    let widgets_raw: String = row.get(2)?;
    let widgets = serde_json::from_str::<Value>(&widgets_raw)
        .ok()
        .filter(|v| v.is_array())
        .unwrap_or_else(|| json!([]));
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "name": row.get::<_, String>(1)?,
        "widgets": widgets,
        "is_default": row.get::<_, i64>(3)?,
        "created_at": row.get::<_, String>(4)?,
        "updated_at": row.get::<_, String>(5)?,
    }))
}

const SELECT_COLS: &str =
    "SELECT id, name, widgets, is_default, created_at, updated_at FROM dashboard_layouts";

/// Fetch a single layout by id, or null (matches getLayout).
fn get_layout(conn: &Connection, id: i64) -> Value {
    let sql = format!("{} WHERE id = ?", SELECT_COLS);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return Value::Null,
    };
    let rows = match stmt.query_map(params![id], row_to_json) {
        Ok(r) => r,
        Err(_) => return Value::Null,
    };
    // Bind so the borrowing iterator drops before `stmt` (end-of-block temp rule).
    let out = rows.filter_map(|r| r.ok()).next().unwrap_or(Value::Null);
    out
}

/// All layouts ordered is_default DESC, name ASC (matches getLayouts).
fn get_layouts(conn: &Connection) -> Value {
    let sql = format!("{} ORDER BY is_default DESC, name ASC", SELECT_COLS);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map([], row_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// Default layout, or null (matches getDefaultLayout).
fn get_default(conn: &Connection) -> Value {
    let sql = format!("{} WHERE is_default = 1", SELECT_COLS);
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return Value::Null,
    };
    let rows = match stmt.query_map([], row_to_json) {
        Ok(r) => r,
        Err(_) => return Value::Null,
    };
    // Bind so the borrowing iterator drops before `stmt` (end-of-block temp rule).
    let out = rows.filter_map(|r| r.ok()).next().unwrap_or(Value::Null);
    out
}

/// Create a layout from name + optional widgets array (matches createLayout).
fn create_layout(conn: &Connection, name: &str, widgets: &Value) -> Value {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Value::Null;
    }
    let widgets_val = if widgets.is_array() {
        widgets.clone()
    } else {
        json!([])
    };
    let widgets_str = serde_json::to_string(&widgets_val).unwrap_or_else(|_| "[]".to_string());
    if conn
        .execute(
            "INSERT INTO dashboard_layouts (name, widgets) VALUES (?, ?)",
            params![trimmed, widgets_str],
        )
        .is_err()
    {
        return Value::Null;
    }
    get_layout(conn, conn.last_insert_rowid())
}

/// Apply name/widgets updates, then return the fresh layout (matches updateLayout).
fn update_layout(conn: &Connection, id: i64, updates: &Value) -> Value {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT id FROM dashboard_layouts WHERE id = ?",
            params![id],
            |r| r.get(0),
        )
        .ok();
    if exists.is_none() {
        return Value::Null;
    }

    if let Some(name) = updates.get("name") {
        // `updates.name !== undefined` -> present key (incl. null/empty) triggers update.
        let name_str = name.as_str().unwrap_or("").trim().to_string();
        let _ = conn.execute(
            "UPDATE dashboard_layouts SET name = ?, updated_at = datetime('now') WHERE id = ?",
            params![name_str, id],
        );
    }
    if let Some(widgets) = updates.get("widgets") {
        let widgets_str = serde_json::to_string(widgets).unwrap_or_else(|_| "[]".to_string());
        let _ = conn.execute(
            "UPDATE dashboard_layouts SET widgets = ?, updated_at = datetime('now') WHERE id = ?",
            params![widgets_str, id],
        );
    }

    get_layout(conn, id)
}

/// Make `id` the sole default (matches setDefault). Returns bool.
fn set_default(conn: &Connection, id: i64) -> Value {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT id FROM dashboard_layouts WHERE id = ?",
            params![id],
            |r| r.get(0),
        )
        .ok();
    if exists.is_none() {
        return json!(false);
    }
    let _ = conn.execute("UPDATE dashboard_layouts SET is_default = 0", []);
    let _ = conn.execute(
        "UPDATE dashboard_layouts SET is_default = 1 WHERE id = ?",
        params![id],
    );
    json!(true)
}

/// Delete a non-default layout (matches deleteLayout). Returns bool.
fn delete_layout(conn: &Connection, id: i64) -> Value {
    let is_default: Option<i64> = conn
        .query_row(
            "SELECT is_default FROM dashboard_layouts WHERE id = ?",
            params![id],
            |r| r.get(0),
        )
        .ok();
    match is_default {
        None => json!(false),
        Some(1) => json!(false), // cannot delete default
        Some(_) => {
            let _ = conn.execute(
                "DELETE FROM dashboard_layouts WHERE id = ?",
                params![id],
            );
            json!(true)
        }
    }
}

/// Append a widget to a layout if its id is new (matches addWidget).
fn add_widget(conn: &Connection, layout_id: i64, widget: &Value) -> Value {
    let layout = get_layout(conn, layout_id);
    if layout.is_null() {
        return Value::Null;
    }
    let mut widgets = layout
        .get("widgets")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let widget_id = widget.get("id").and_then(|v| v.as_str());
    let already = widget_id.is_some()
        && widgets
            .iter()
            .any(|w| w.get("id").and_then(|v| v.as_str()) == widget_id);
    if already {
        // exists -> return the layout unchanged (matches `if (exists) return layout`).
        return layout;
    }

    widgets.push(widget.clone());
    update_layout(conn, layout_id, &json!({ "widgets": widgets }))
}

/// Remove a widget by id from a layout (matches removeWidget).
fn remove_widget(conn: &Connection, layout_id: i64, widget_id: &str) -> Value {
    let layout = get_layout(conn, layout_id);
    if layout.is_null() {
        return Value::Null;
    }
    let widgets: Vec<Value> = layout
        .get("widgets")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|w| w.get("id").and_then(|v| v.as_str()) != Some(widget_id))
        .collect();

    update_layout(conn, layout_id, &json!({ "widgets": widgets }))
}

/// The available widget types (matches getWidgetTypes).
fn get_widget_types() -> Value {
    json!(WIDGET_TYPES)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    // Positional id accessor mirroring the Electron (_event, id, ...) params.
    let id0 = || args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);

    match channel {
        "dashboard:getLayouts" => get_layouts(conn),
        "dashboard:getDefault" => get_default(conn),
        "dashboard:getLayout" => get_layout(conn, id0()),
        "dashboard:create" => {
            let name = args.get(0).and_then(|v| v.as_str()).unwrap_or("");
            let widgets = args.get(1).cloned().unwrap_or_else(|| json!([]));
            create_layout(conn, name, &widgets)
        }
        "dashboard:update" => {
            let updates = args.get(1).cloned().unwrap_or_else(|| json!({}));
            update_layout(conn, id0(), &updates)
        }
        "dashboard:setDefault" => set_default(conn, id0()),
        "dashboard:delete" => delete_layout(conn, id0()),
        "dashboard:addWidget" => {
            let widget = args.get(1).cloned().unwrap_or_else(|| json!({}));
            add_widget(conn, id0(), &widget)
        }
        "dashboard:removeWidget" => {
            let widget_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("");
            remove_widget(conn, id0(), widget_id)
        }
        "dashboard:getWidgetTypes" => get_widget_types(),
        _ => Value::Null,
    }
}

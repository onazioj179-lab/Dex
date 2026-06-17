// =============================================================================
// DEX 6.0 — Workspace Layouts (Tauri port of src/main/core/WorkspaceLayoutManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed named workspace layouts (layout:* channels), reading/writing
//! the shared `dex.db` `workspace_layouts` table with the identical schema,
//! queries, and return shapes as the Electron manager. Three built-in layouts
//! (Focus, Split, Default) are seeded on schema-ensure, mirroring
//! `ensureBuiltInLayouts`.
//!
//! Some handlers in the Electron manager drive the live `BrowserWindow` (move /
//! maximize / read bounds) and reach into the renderer via `executeJavaScript`.
//! Those window-/renderer-backed pieces are not available from this pure DB
//! layer; the DB-backed portions are ported faithfully and the window pieces
//! degrade honestly (see `layout:apply`, `layout:getCurrent`,
//! `layout:saveCurrentAs`).

use rusqlite::types::Value as SqlValue;
use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};
use std::time::{SystemTime, UNIX_EPOCH};

/// Epoch-millis "now", mirroring the TS `Date.now()` used for created/updated.
fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// The three built-in layouts (matches BUILT_IN_LAYOUTS), as (name, layout_json).
fn built_in_layouts() -> Vec<(&'static str, Value)> {
    vec![
        (
            "Focus",
            json!({
                "activeApp": "home",
                "dockState": "auto",
                "splitScreen": Value::Null,
                "inspectorOpen": {},
                "sidebarHelpOpen": {},
                "windowBounds": { "x": 0, "y": 0, "width": 1280, "height": 800 },
                "windowMaximized": true
            }),
        ),
        (
            "Split",
            json!({
                "activeApp": "notes",
                "dockState": "auto",
                "splitScreen": {
                    "active": true,
                    "apps": ["notes", "browser"],
                    "sizes": [50, 50],
                    "direction": "horizontal"
                },
                "inspectorOpen": { "notes": true, "browser": true },
                "sidebarHelpOpen": {},
                "windowBounds": { "x": 0, "y": 0, "width": 1440, "height": 900 },
                "windowMaximized": false
            }),
        ),
        (
            "Default",
            json!({
                "activeApp": "home",
                "dockState": "auto",
                "splitScreen": Value::Null,
                "inspectorOpen": {},
                "sidebarHelpOpen": {},
                "windowBounds": { "x": 0, "y": 0, "width": 1280, "height": 800 },
                "windowMaximized": false
            }),
        ),
    ]
}

/// Create the workspace_layouts table (CREATE TABLE copied verbatim from
/// DatabaseManager.initTables) and seed the built-ins (ensureBuiltInLayouts).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS workspace_layouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            layout_data TEXT NOT NULL,
            built_in INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );",
    );
    ensure_built_in_layouts(conn);
}

/// Insert any missing built-in layout (matches ensureBuiltInLayouts).
fn ensure_built_in_layouts(conn: &Connection) {
    for (name, layout) in built_in_layouts() {
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM workspace_layouts WHERE name = ? AND built_in = 1",
                params![name],
                |r| r.get(0),
            )
            .ok();
        if existing.is_none() {
            let now = now_millis();
            let data = serde_json::to_string(&layout).unwrap_or_else(|_| "{}".to_string());
            let _ = conn.execute(
                "INSERT INTO workspace_layouts (name, layout_data, built_in, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
                params![name, data, now, now],
            );
        }
    }
}

/// saveLayout(name, layout) -> number (new/updated id, or -1). Pure DB.
fn save_layout(conn: &Connection, name: &str, layout: &Value) -> Value {
    let now = now_millis();
    let data = serde_json::to_string(layout).unwrap_or_else(|_| "{}".to_string());

    // SELECT id, built_in FROM workspace_layouts WHERE name = ?
    let existing: Option<(i64, i64)> = conn
        .query_row(
            "SELECT id, built_in FROM workspace_layouts WHERE name = ?",
            params![name],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)),
        )
        .ok();

    if let Some((id, built_in)) = existing {
        if built_in == 1 {
            // Cannot overwrite built-in layout.
            return json!(-1);
        }
        let _ = conn.execute(
            "UPDATE workspace_layouts SET layout_data = ?, updated_at = ? WHERE id = ?",
            params![data, now, id],
        );
        return json!(id);
    }

    match conn.execute(
        "INSERT INTO workspace_layouts (name, layout_data, built_in, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
        params![name, data, now, now],
    ) {
        Ok(_) => json!(conn.last_insert_rowid()),
        Err(_) => json!(-1),
    }
}

/// getLayout(name) -> parsed layout object, or null. Pure DB.
fn get_layout(conn: &Connection, name: &str) -> Value {
    let raw: Option<String> = conn
        .query_row(
            "SELECT layout_data FROM workspace_layouts WHERE name = ?",
            params![name],
            |r| r.get(0),
        )
        .ok();
    match raw {
        Some(s) => serde_json::from_str(&s).unwrap_or(Value::Null),
        None => Value::Null,
    }
}

/// One row -> the getAllLayouts list shape ({ id, name, builtIn, createdAt }).
fn all_row_to_json(row: &Row) -> rusqlite::Result<Value> {
    let built_in: i64 = row.get(2)?;
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "name": row.get::<_, String>(1)?,
        "builtIn": built_in == 1,
        "createdAt": row.get::<_, i64>(3)?,
    }))
}

fn query_list(conn: &Connection, sql: &str, p: Vec<SqlValue>) -> Value {
    let mut stmt = match conn.prepare(sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(rusqlite::params_from_iter(p), all_row_to_json) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// getAllLayouts() -> [{ id, name, builtIn, createdAt }]. Pure DB.
fn get_all_layouts(conn: &Connection) -> Value {
    query_list(
        conn,
        "SELECT id, name, built_in, created_at FROM workspace_layouts ORDER BY built_in DESC, name ASC",
        Vec::new(),
    )
}

/// deleteLayout(name) -> boolean. Refuses missing / built-in rows. Pure DB.
fn delete_layout(conn: &Connection, name: &str) -> Value {
    let built_in: Option<i64> = conn
        .query_row(
            "SELECT built_in FROM workspace_layouts WHERE name = ?",
            params![name],
            |r| r.get(0),
        )
        .ok();
    match built_in {
        None => json!(false),
        Some(1) => json!(false),
        Some(_) => {
            let _ = conn.execute("DELETE FROM workspace_layouts WHERE name = ?", params![name]);
            json!(true)
        }
    }
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    let str_arg = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();

    match channel {
        // saveLayout(name, layout) -> number id (or -1).
        "layout:save" => {
            let name = str_arg(0);
            let layout = args.get(1).cloned().unwrap_or_else(|| json!({}));
            save_layout(conn, &name, &layout)
        }

        // getLayout(name) -> layout object | null.
        "layout:get" => get_layout(conn, &str_arg(0)),

        // getAllLayouts() -> [{ id, name, builtIn, createdAt }].
        "layout:getAll" => get_all_layouts(conn),

        // deleteLayout(name) -> boolean.
        "layout:delete" => delete_layout(conn, &str_arg(0)),

        // applyLayout(name) -> layout | null. The DB lookup is ported; the live
        // window move/maximize and the `webContents.send('layout:apply', ...)`
        // push are BrowserWindow/renderer concerns not reachable from this pure
        // DB layer. We return the stored layout (matching the Electron return
        // value) so the renderer can apply it itself; the main-process window
        // repositioning is not ported here.
        "layout:apply" => get_layout(conn, &str_arg(0)),

        // getCurrentLayout() reads live BrowserWindow bounds + maximized state,
        // which are not available from this DB layer. Degrade honestly rather
        // than fabricate window geometry.
        "layout:getCurrent" => json!({
            "success": false,
            "error": "getCurrentLayout requires live BrowserWindow bounds (not ported)"
        }),

        // saveCurrentAs(name) reads renderer state via executeJavaScript and the
        // live window bounds before persisting. Those inputs are unavailable
        // here, so we degrade honestly instead of saving fabricated geometry.
        "layout:saveCurrentAs" => json!({
            "success": false,
            "error": "saveCurrentAs requires renderer state + live window bounds (not ported)"
        }),

        _ => Value::Null,
    }
}

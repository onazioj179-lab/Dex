// =============================================================================
// DEX 6.0 — Project Linker (Tauri port of src/main/core/ProjectLinkerManager.ts)
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// =============================================================================
//! SQLite-backed cross-app project linking (project-linker:* channels),
//! reading/writing the shared `dex.db` `project_links` table with the identical
//! schema, queries, and return shapes as the Electron manager (Feature 2).
//! Links express explicit relationships (related / depends-on / produced-by /
//! referenced-by) between items across apps. The Electron manager also pushes a
//! `project-links:changed` event to the renderer on add/remove — that is an
//! Electron-internal side effect, not part of the IPC return value, so it is
//! intentionally not replicated here. All six renderer-facing handlers are ported
//! faithfully.

use rusqlite::{params, Connection, Row};
use serde_json::{json, Value};

/// The four valid link types (matches getLinkTypes() in the TS, in order).
const LINK_TYPES: [&str; 4] = ["related", "depends-on", "produced-by", "referenced-by"];

/// Create the project_links table + indexes (matches ProjectLinkerManager.createTables).
pub fn ensure_schema(conn: &Connection) {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS project_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_app TEXT NOT NULL,
            source_id TEXT NOT NULL,
            target_app TEXT NOT NULL,
            target_id TEXT NOT NULL,
            link_type TEXT NOT NULL DEFAULT 'related',
            created INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_project_links_source ON project_links(source_app, source_id);
        CREATE INDEX IF NOT EXISTS idx_project_links_target ON project_links(target_app, target_id);",
    );
}

/// One row -> the ProjectLink shape (snake_case keys, exactly as `SELECT *`
/// returned it under Electron; column order matches the table definition above).
fn row_to_json(row: &Row) -> rusqlite::Result<Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "source_app": row.get::<_, String>(1)?,
        "source_id": row.get::<_, String>(2)?,
        "target_app": row.get::<_, String>(3)?,
        "target_id": row.get::<_, String>(4)?,
        "link_type": row.get::<_, String>(5)?,
        "created": row.get::<_, i64>(6)?,
    }))
}

const SELECT_ALL: &str =
    "SELECT id, source_app, source_id, target_app, target_id, link_type, created FROM project_links";

/// project-linker:addLink -> addLink(sourceApp, sourceId, targetApp, targetId, linkType).
/// Returns the existing link id when an identical link already exists, otherwise
/// the newly inserted rowid. Returns -1 when the DB is absent (mirrors the TS
/// `if (!db) return -1`).
fn add_link(conn: &Connection, args: &Value) -> Value {
    let s = |i: usize| args.get(i).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let source_app = s(0);
    let source_id = s(1);
    let target_app = s(2);
    let target_id = s(3);
    let link_type = s(4);

    // Dedup: return the existing id if this exact link already exists.
    let existing: Option<i64> = conn
        .query_row(
            "SELECT id FROM project_links
             WHERE source_app = ? AND source_id = ? AND target_app = ? AND target_id = ? AND link_type = ?",
            params![source_app, source_id, target_app, target_id, link_type],
            |r| r.get(0),
        )
        .ok();
    if let Some(id) = existing {
        return json!(id);
    }

    // created uses Date.now() (epoch milliseconds) in the TS.
    let created: i64 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    if conn
        .execute(
            "INSERT INTO project_links (source_app, source_id, target_app, target_id, link_type, created)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![source_app, source_id, target_app, target_id, link_type, created],
        )
        .is_err()
    {
        return json!(-1);
    }

    // The `project-links:changed` renderer event is an Electron-internal side
    // effect, not part of the return value, so it is not replicated here.
    json!(conn.last_insert_rowid())
}

/// project-linker:removeLink -> removeLink(id). Returns boolean — true whenever
/// the DB is present (the TS deletes unconditionally and returns true; it returns
/// false only when the DB is absent, which is the connection-missing path).
fn remove_link(conn: &Connection, args: &Value) -> Value {
    let id = args.get(0).and_then(|v| v.as_i64()).unwrap_or(0);
    let _ = conn.execute("DELETE FROM project_links WHERE id = ?", params![id]);
    json!(true)
}

/// project-linker:getLinksFor -> getLinksFor(app, projectId). Returns ProjectLink[]
/// where the (app, projectId) pair is either the source or the target side.
fn get_links_for(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let project_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();

    let sql = format!(
        "{} WHERE (source_app = ? AND source_id = ?) OR (target_app = ? AND target_id = ?) \
         ORDER BY created DESC",
        SELECT_ALL
    );
    let mut stmt = match conn.prepare(&sql) {
        Ok(s) => s,
        Err(_) => return json!([]),
    };
    let rows = match stmt.query_map(
        params![app, project_id, app, project_id],
        row_to_json,
    ) {
        Ok(r) => r,
        Err(_) => return json!([]),
    };
    let out: Vec<Value> = rows.filter_map(|r| r.ok()).collect();
    json!(out)
}

/// project-linker:getAllLinks -> getAllLinks(). Returns ProjectLink[] (all rows).
fn get_all_links(conn: &Connection) -> Value {
    let sql = format!("{} ORDER BY created DESC", SELECT_ALL);
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

/// project-linker:removeLinksForProject -> removeLinksForProject(app, projectId).
/// Deletes every link touching (app, projectId) on either side; returns the
/// number of rows changed.
fn remove_links_for_project(conn: &Connection, args: &Value) -> Value {
    let app = args.get(0).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let project_id = args.get(1).and_then(|v| v.as_str()).unwrap_or("").to_string();

    let changes = conn
        .execute(
            "DELETE FROM project_links
             WHERE (source_app = ? AND source_id = ?) OR (target_app = ? AND target_id = ?)",
            params![app, project_id, app, project_id],
        )
        .unwrap_or(0);
    json!(changes)
}

/// project-linker:getLinkTypes -> getLinkTypes(). Returns the static 4-element list.
fn get_link_types() -> Value {
    let out: Vec<Value> = LINK_TYPES.iter().map(|t| json!(t)).collect();
    json!(out)
}

pub fn dispatch(conn: &Connection, channel: &str, args: &Value) -> Value {
    match channel {
        "project-linker:addLink" => add_link(conn, args),
        "project-linker:removeLink" => remove_link(conn, args),
        "project-linker:getLinksFor" => get_links_for(conn, args),
        "project-linker:getAllLinks" => get_all_links(conn),
        "project-linker:getLinkTypes" => get_link_types(),
        "project-linker:removeLinksForProject" => remove_links_for_project(conn, args),
        _ => Value::Null,
    }
}
